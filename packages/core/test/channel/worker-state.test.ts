import { describe, expect, it } from "vitest";

import {
  matchesInboxPolicy,
  reduceWorkerRegistry,
  isTerminalLifecycle,
  type ChannelEvent,
} from "../../src/channel/index.js";

let nextSeq = 1;
function ev(kind: string, extra: Record<string, unknown> = {}): ChannelEvent {
  const seq = nextSeq++;
  return {
    seq,
    ts: `2026-05-14T00:00:${String(seq).padStart(2, "0")}.000Z`,
    kind,
    by: "main",
    ...extra,
  } as ChannelEvent;
}

function reset(): void {
  nextSeq = 1;
}

describe("reduceWorkerRegistry", () => {
  it("projects a spawned worker as running, non-terminal, idle", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("create", { by: "main" }),
      ev("spawned", { by: "main", as: "w1", provider: "claude" }),
    ]);
    expect(reg.workers).toHaveLength(1);
    const w = reg.workers[0];
    expect(w.workerId).toBe("w1");
    expect(w.lifecycle).toBe("running");
    expect(w.terminal).toBe(false);
    expect(w.activity).toBe("idle");
    expect(w.provider).toBe("claude");
    expect(w.inboxPolicy).toBe("explicitOnly");
    expect(w.startedBy).toBe("main");
  });

  it("defaults legacy spawned without inboxPolicy to explicitOnly", () => {
    reset();
    const reg = reduceWorkerRegistry([ev("spawned", { as: "w1" })]);
    expect(reg.workers[0].inboxPolicy).toBe("explicitOnly");
  });

  it("honors spawned.inboxPolicy", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w1", inboxPolicy: "broadcastAndExplicit" }),
    ]);
    expect(reg.workers[0].inboxPolicy).toBe("broadcastAndExplicit");
  });

  it("clears terminal diagnostics when a worker name is spawned again", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w", provider: "codex" }),
      ev("killed", {
        by: "supervisor:w",
        reason: "crash",
        signal: "SIGKILL",
      }),
      ev("spawned", { as: "w", provider: "codex" }),
    ]);
    expect(reg.workers[0]).toMatchObject({
      workerId: "w",
      lifecycle: "running",
      terminal: false,
      activity: "idle",
    });
    expect(reg.workers[0].reason).toBeUndefined();
    expect(reg.workers[0].signal).toBeUndefined();
    expect(reg.workers[0].error).toBeUndefined();
  });

  it("treats adapter done / error as turn-level events, not worker termination", () => {
    reset();
    expect(
      reduceWorkerRegistry([ev("spawned", { as: "w" }), ev("done", { by: "w" })])
        .workers[0],
    ).toMatchObject({ lifecycle: "running", terminal: false, activity: "idle" });

    reset();
    expect(
      reduceWorkerRegistry([
        ev("spawned", { as: "w" }),
        ev("error", { by: "w", message: "boom" }),
      ]).workers[0],
    ).toMatchObject({
      lifecycle: "running",
      terminal: false,
      activity: "idle",
      error: "boom",
    });
  });

  it("transitions to terminal on synthesized exit events / killed", () => {
    reset();
    expect(
      reduceWorkerRegistry([
        ev("spawned", { as: "w" }),
        ev("done", { by: "w", synthesized: true, exit_code: 0 }),
      ]).workers[0],
    ).toMatchObject({ lifecycle: "done", terminal: true });

    reset();
    expect(
      reduceWorkerRegistry([
        ev("spawned", { as: "w" }),
        ev("error", { by: "w", message: "boom", synthesized: true }),
      ]).workers[0],
    ).toMatchObject({ lifecycle: "error", terminal: true, error: "boom" });

    reset();
    expect(
      reduceWorkerRegistry([
        ev("spawned", { as: "w" }),
        ev("error", { by: "supervisor:w", message: "spawn failed" }),
      ]).workers[0],
    ).toMatchObject({ lifecycle: "error", terminal: true, error: "spawn failed" });

    reset();
    expect(
      reduceWorkerRegistry([
        ev("spawned", { as: "w" }),
        ev("killed", { by: "cli:kill", worker: "w", reason: "explicit-kill" }),
      ]).workers[0],
    ).toMatchObject({ lifecycle: "killed", terminal: true });

    reset();
    expect(
      reduceWorkerRegistry([
        ev("spawned", { as: "w" }),
        ev("killed", { by: "supervisor:w", reason: "crash" }),
      ]).workers[0],
    ).toMatchObject({ lifecycle: "crashed", terminal: true });
  });

  it("tracks turn activity separately from lifecycle", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("message", { by: "main", to: "w", text: "go" }),
      ev("turn_started", { by: "w", worker: "w", inputSeq: 2, turnId: "t1" }),
    ]);
    expect(reg.workers[0]).toMatchObject({
      lifecycle: "running",
      activity: "mid-turn",
      activeTurnId: "t1",
    });

    reset();
    const reg2 = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("turn_started", { by: "w", worker: "w", inputSeq: 0, turnId: "t1" }),
      ev("turn_finished", { by: "w", worker: "w", turnId: "t1" }),
    ]);
    expect(reg2.workers[0].activity).toBe("idle");
    expect(reg2.workers[0].activeTurnId).toBeUndefined();
  });

  it("interrupted aborts the active turn", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("turn_started", { by: "w", worker: "w", inputSeq: 0, turnId: "t1" }),
      ev("interrupted", {
        by: "main",
        worker: "w",
        method: "provider",
        outcome: "interrupted",
      }),
    ]);
    expect(reg.workers[0].activity).toBe("idle");
    expect(reg.workers[0].activeTurnId).toBeUndefined();
  });

  it("derives pendingMessageCount from durable events only", () => {
    reset();
    // explicitOnly worker, two targeted messages, one broadcast.
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("message", { by: "main", to: "w", text: "a" }),
      ev("message", { by: "main", text: "broadcast" }),
      ev("message", { by: "main", to: "w", text: "b" }),
    ]);
    expect(reg.workers[0].pendingMessageCount).toBe(2);
  });

  it("turn_started.inputSeq marks messages as consumed", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }), // seq 1
      ev("message", { by: "main", to: "w", text: "a" }), // seq 2
      ev("turn_started", { by: "w", worker: "w", inputSeq: 2 }), // seq 3
      ev("message", { by: "main", to: "w", text: "b" }), // seq 4
    ]);
    // seq 2 consumed by turn_started.inputSeq=2; only seq 4 remains pending.
    expect(reg.workers[0].pendingMessageCount).toBe(1);
  });

  it("broadcastAndExplicit counts broadcast messages as pending", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w", inboxPolicy: "broadcastAndExplicit" }),
      ev("message", { by: "main", text: "broadcast" }),
      ev("message", { by: "main", to: "w", text: "explicit" }),
    ]);
    expect(reg.workers[0].pendingMessageCount).toBe(2);
  });

  it("terminal workers have pendingMessageCount 0", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("message", { by: "main", to: "w", text: "a" }),
      ev("killed", { by: "cli:kill", worker: "w", reason: "explicit-kill" }),
    ]);
    expect(reg.workers[0].pendingMessageCount).toBe(0);
  });

  it("creates a worker entry from a pre-spawn supervisor error", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("create", { by: "main" }),
      ev("error", { by: "supervisor:w", message: "spawn failed" }),
    ]);
    expect(reg.workers).toHaveLength(1);
    expect(reg.workers[0]).toMatchObject({
      workerId: "w",
      lifecycle: "error",
      terminal: true,
    });
  });

  it("does not create phantom workers from plain by aliases", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("create", { by: "main" }),
      ev("message", { by: "main", text: "hi" }),
    ]);
    expect(reg.workers).toHaveLength(0);
  });

  it("sets idleSince on spawn and clears it mid-turn", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w", provider: "claude" }), // seq 1
    ]);
    expect(reg.workers[0].idleSince).toBe(
      "2026-05-14T00:00:01.000Z",
    );
    expect(reg.workers[0].activity).toBe("idle");

    reset();
    const reg2 = reduceWorkerRegistry([
      ev("spawned", { as: "w" }), // seq 1
      ev("turn_started", { by: "w", worker: "w", inputSeq: 0, turnId: "t" }), // seq 2
    ]);
    expect(reg2.workers[0].activity).toBe("mid-turn");
    expect(reg2.workers[0].idleSince).toBeUndefined();
  });

  it("turn_finished and interrupted reset idleSince to event ts", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }), // seq 1
      ev("turn_started", { by: "w", worker: "w", inputSeq: 0, turnId: "t" }), // seq 2
      ev("turn_finished", { by: "w", worker: "w", turnId: "t" }), // seq 3
    ]);
    expect(reg.workers[0].idleSince).toBe("2026-05-14T00:00:03.000Z");

    reset();
    const reg2 = reduceWorkerRegistry([
      ev("spawned", { as: "w" }), // seq 1
      ev("turn_started", { by: "w", worker: "w", inputSeq: 0, turnId: "t" }), // seq 2
      ev("interrupted", {
        by: "main",
        worker: "w",
        method: "provider",
        outcome: "interrupted",
      }), // seq 3
    ]);
    expect(reg2.workers[0].idleSince).toBe("2026-05-14T00:00:03.000Z");
  });

  it("clears idleSince on terminal events", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("killed", { by: "cli:kill", worker: "w", reason: "explicit-kill" }),
    ]);
    expect(reg.workers[0].terminal).toBe(true);
    expect(reg.workers[0].idleSince).toBeUndefined();

    reset();
    const reg2 = reduceWorkerRegistry([
      ev("spawned", { as: "w" }),
      ev("done", { by: "w", synthesized: true, exit_code: 0 }),
    ]);
    expect(reg2.workers[0].terminal).toBe(true);
    expect(reg2.workers[0].idleSince).toBeUndefined();
  });

  it("respawn after termination reseeds idleSince from the new spawn", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }), // seq 1
      ev("killed", { by: "cli:kill", worker: "w", reason: "explicit-kill" }), // seq 2
      ev("spawned", { as: "w" }), // seq 3
    ]);
    expect(reg.workers[0].terminal).toBe(false);
    expect(reg.workers[0].idleSince).toBe("2026-05-14T00:00:03.000Z");
  });

  it("tracks lastSeq per worker", () => {
    reset();
    const reg = reduceWorkerRegistry([
      ev("spawned", { as: "w" }), // seq 1
      ev("message", { by: "main", to: "w", text: "a" }), // seq 2 (not a worker event)
      ev("turn_started", { by: "w", worker: "w", inputSeq: 2 }), // seq 3
    ]);
    expect(reg.workers[0].lastSeq).toBe(3);
  });
});

describe("isTerminalLifecycle", () => {
  it("classifies lifecycles", () => {
    expect(isTerminalLifecycle("running")).toBe(false);
    expect(isTerminalLifecycle("starting")).toBe(false);
    expect(isTerminalLifecycle("done")).toBe(true);
    expect(isTerminalLifecycle("error")).toBe(true);
    expect(isTerminalLifecycle("killed")).toBe(true);
    expect(isTerminalLifecycle("crashed")).toBe(true);
  });
});

describe("matchesInboxPolicy", () => {
  const msg = (extra: Record<string, unknown>): ChannelEvent =>
    ({ seq: 1, ts: "t", kind: "message", by: "main", ...extra }) as ChannelEvent;

  it("explicitOnly delivers only targeted messages", () => {
    expect(matchesInboxPolicy(msg({ to: "w" }), "w", "explicitOnly")).toBe(true);
    expect(matchesInboxPolicy(msg({ to: ["a", "w"] }), "w", "explicitOnly")).toBe(
      true,
    );
    expect(matchesInboxPolicy(msg({}), "w", "explicitOnly")).toBe(false);
    expect(matchesInboxPolicy(msg({ to: "other" }), "w", "explicitOnly")).toBe(
      false,
    );
  });

  it("broadcastAndExplicit also delivers broadcasts", () => {
    expect(matchesInboxPolicy(msg({}), "w", "broadcastAndExplicit")).toBe(true);
    expect(matchesInboxPolicy(msg({ to: "w" }), "w", "broadcastAndExplicit")).toBe(
      true,
    );
    expect(
      matchesInboxPolicy(msg({ to: "other" }), "w", "broadcastAndExplicit"),
    ).toBe(false);
  });

  it("a worker never consumes its own messages", () => {
    expect(
      matchesInboxPolicy(
        msg({ by: "w", to: "w" }),
        "w",
        "broadcastAndExplicit",
      ),
    ).toBe(false);
  });

  it("ignores non-message events", () => {
    expect(
      matchesInboxPolicy(
        { seq: 1, ts: "t", kind: "progress", by: "w" } as ChannelEvent,
        "w",
        "broadcastAndExplicit",
      ),
    ).toBe(false);
  });
});
