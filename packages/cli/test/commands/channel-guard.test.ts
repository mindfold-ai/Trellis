import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChannel } from "../../src/commands/channel/create.js";
import {
  DEFAULT_IDLE_TTL_MS,
  DEFAULT_MAX_LIVE_WORKERS,
  ENV_IDLE_TIMEOUT,
  ENV_MAX_LIVE_WORKERS,
  cleanupExpiredIdleWorkers,
  enforceSpawnBudget,
  formatBudgetOverflowError,
  isIdleCleanupEligible,
  parseWorkerGuardSection,
  resolveWorkerGuardConfig,
  scanLiveWorkers,
  type LiveWorker,
} from "../../src/commands/channel/guard.js";
import { appendEvent } from "../../src/commands/channel/store/events.js";
import {
  projectKey,
  workerFile,
} from "../../src/commands/channel/store/paths.js";

const noop = (): void => undefined;
const verifySupervisor = (): boolean => true;

interface TmpEnv {
  tmpDir: string;
  projectDir: string;
  channelsRoot: string;
  projectKey: string;
  oldRoot: string | undefined;
  oldProject: string | undefined;
}

function setup(): TmpEnv {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "trellis-channel-guard-test-"),
  );
  const projectDir = path.join(tmpDir, "project");
  fs.mkdirSync(projectDir);
  const channelsRoot = path.join(tmpDir, "channels");
  const oldRoot = process.env.TRELLIS_CHANNEL_ROOT;
  const oldProject = process.env.TRELLIS_CHANNEL_PROJECT;
  process.env.TRELLIS_CHANNEL_ROOT = channelsRoot;
  delete process.env.TRELLIS_CHANNEL_PROJECT;
  return {
    tmpDir,
    projectDir,
    channelsRoot,
    projectKey: projectKey(projectDir),
    oldRoot,
    oldProject,
  };
}

function teardown(env: TmpEnv): void {
  if (env.oldRoot === undefined) delete process.env.TRELLIS_CHANNEL_ROOT;
  else process.env.TRELLIS_CHANNEL_ROOT = env.oldRoot;
  if (env.oldProject === undefined) delete process.env.TRELLIS_CHANNEL_PROJECT;
  else process.env.TRELLIS_CHANNEL_PROJECT = env.oldProject;
  fs.rmSync(env.tmpDir, { recursive: true, force: true });
}

/**
 * Write a fake supervisor pid file pointing at the current node process
 * so OS liveness checks pass without actually forking a child.
 */
function writeLivePid(
  channelsRoot: string,
  projectKey: string,
  channel: string,
  worker: string,
): void {
  const file = path.join(
    channelsRoot,
    projectKey,
    channel,
    `${worker}.pid`,
  );
  fs.writeFileSync(file, String(process.pid));
}

function writeReservation(
  channelsRoot: string,
  projectKey: string,
  channel: string,
  worker: string,
): void {
  const file = path.join(
    channelsRoot,
    projectKey,
    channel,
    `${worker}.reservation`,
  );
  fs.writeFileSync(file, JSON.stringify({ channel, worker }));
}

describe("resolveWorkerGuardConfig precedence", () => {
  it("falls back to built-in defaults when nothing is set", () => {
    const cfg = resolveWorkerGuardConfig({
      cwd: "/nonexistent",
      env: {},
    });
    expect(cfg.idleTimeoutMs).toBe(DEFAULT_IDLE_TTL_MS);
    expect(cfg.maxLiveWorkers).toBe(DEFAULT_MAX_LIVE_WORKERS);
  });

  it("honors explicit flag overrides above env / config / default", () => {
    const cfg = resolveWorkerGuardConfig({
      cwd: "/nonexistent",
      env: {
        [ENV_IDLE_TIMEOUT]: "10m",
        [ENV_MAX_LIVE_WORKERS]: "9",
      },
      flagIdleTimeoutMs: 1_000,
      flagMaxLiveWorkers: 2,
    });
    expect(cfg.idleTimeoutMs).toBe(1_000);
    expect(cfg.maxLiveWorkers).toBe(2);
  });

  it("honors env values when no flag is given", () => {
    const cfg = resolveWorkerGuardConfig({
      cwd: "/nonexistent",
      env: {
        [ENV_IDLE_TIMEOUT]: "30s",
        [ENV_MAX_LIVE_WORKERS]: "3",
      },
    });
    expect(cfg.idleTimeoutMs).toBe(30_000);
    expect(cfg.maxLiveWorkers).toBe(3);
  });

  it("rejects negative flag values", () => {
    expect(() =>
      resolveWorkerGuardConfig({
        cwd: "/nonexistent",
        env: {},
        flagIdleTimeoutMs: -1,
      }),
    ).toThrow(/non-negative duration/);
    expect(() =>
      resolveWorkerGuardConfig({
        cwd: "/nonexistent",
        env: {},
        flagMaxLiveWorkers: -1,
      }),
    ).toThrow(/non-negative integer/);
  });

  it("zero values pass through as 'disabled' for both guards", () => {
    const cfg = resolveWorkerGuardConfig({
      cwd: "/nonexistent",
      env: {},
      flagIdleTimeoutMs: 0,
      flagMaxLiveWorkers: 0,
    });
    expect(cfg.idleTimeoutMs).toBe(0);
    expect(cfg.maxLiveWorkers).toBe(0);
  });
});

describe("parseWorkerGuardSection", () => {
  it("parses idle_timeout + max_live_workers", () => {
    const parsed = parseWorkerGuardSection(
      [
        "channel:",
        "  worker_guard:",
        "    idle_timeout: 5m",
        "    max_live_workers: 6",
      ].join("\n"),
    );
    expect(parsed?.idleTimeoutMs).toBe(5 * 60_000);
    expect(parsed?.maxLiveWorkers).toBe(6);
  });

  it("ignores commented values", () => {
    const parsed = parseWorkerGuardSection(
      ["# channel:", "#   worker_guard:", "#     idle_timeout: 5m"].join("\n"),
    );
    expect(parsed).toBeUndefined();
  });

  it("supports bare-integer 0 as disabled", () => {
    const parsed = parseWorkerGuardSection(
      [
        "channel:",
        "  worker_guard:",
        "    idle_timeout: 0",
        "    max_live_workers: 0",
      ].join("\n"),
    );
    expect(parsed?.idleTimeoutMs).toBe(0);
    expect(parsed?.maxLiveWorkers).toBe(0);
  });

  it("supports quoted values with inline comments", () => {
    const parsed = parseWorkerGuardSection(
      [
        "channel:",
        "  worker_guard:",
        "    idle_timeout: '5m' # default idle TTL",
        '    max_live_workers: "6" # default live budget',
      ].join("\n"),
    );
    expect(parsed?.idleTimeoutMs).toBe(5 * 60_000);
    expect(parsed?.maxLiveWorkers).toBe(6);
  });

  it("rejects malformed values", () => {
    expect(() =>
      parseWorkerGuardSection(
        [
          "channel:",
          "  worker_guard:",
          "    max_live_workers: not-a-number",
        ].join("\n"),
      ),
    ).toThrow(/non-negative integer/);
  });
});

describe("isIdleCleanupEligible", () => {
  const now = Date.parse("2026-05-17T00:10:00.000Z");

  function liveAt(
    extra: Partial<LiveWorker["state"]>,
    state: "idle" | "mid-turn" = "idle",
  ): LiveWorker {
    return {
      channel: "c",
      workerId: "w",
      supervisorPid: process.pid,
      state: {
        workerId: "w",
        lifecycle: "running",
        terminal: false,
        activity: state,
        pendingMessageCount: 0,
        inboxPolicy: "explicitOnly",
        updatedAt: "2026-05-17T00:00:00.000Z",
        lastSeq: 1,
        ...extra,
      } as LiveWorker["state"],
    };
  }

  it("kills idle workers past TTL", () => {
    const live = liveAt({ idleSince: "2026-05-17T00:04:00.000Z" });
    expect(isIdleCleanupEligible(live, 5 * 60_000, now)).toBe(true);
  });

  it("spares idle workers still inside TTL", () => {
    const live = liveAt({ idleSince: "2026-05-17T00:09:00.000Z" });
    expect(isIdleCleanupEligible(live, 5 * 60_000, now)).toBe(false);
  });

  it("never kills mid-turn workers", () => {
    const live = liveAt({ idleSince: "2026-05-17T00:01:00.000Z" }, "mid-turn");
    expect(isIdleCleanupEligible(live, 5 * 60_000, now)).toBe(false);
  });

  it("skips workers with no idleSince projection", () => {
    const live = liveAt({});
    expect(isIdleCleanupEligible(live, 5 * 60_000, now)).toBe(false);
  });

  it("idle TTL of 0 disables eligibility entirely", () => {
    const live = liveAt({ idleSince: "2026-05-17T00:00:00.000Z" });
    expect(isIdleCleanupEligible(live, 0, now)).toBe(false);
  });
});

describe("scanLiveWorkers + enforceSpawnBudget (integration)", () => {
  let env: TmpEnv;

  beforeEach(() => {
    env = setup();
    vi.spyOn(process, "cwd").mockReturnValue(env.projectDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(env);
  });

  it("scans live workers that have a non-terminal projection + alive pid", async () => {
    await createChannel("c1", { by: "main" });
    await appendEvent(
      "c1",
      { kind: "spawned", by: "main", as: "w1", provider: "claude" },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c1", "w1");

    const live = scanLiveWorkers({
      projectKey: env.projectKey,
      isSupervisorProcess: verifySupervisor,
    });
    expect(live).toHaveLength(1);
    expect(live[0].workerId).toBe("w1");
    expect(live[0].state.activity).toBe("idle");
    expect(typeof live[0].state.idleSince).toBe("string");
  });

  it("skips legacy channel dirs with pre-validation names instead of throwing", async () => {
    await createChannel("c-ok", { by: "main" });
    await appendEvent(
      "c-ok",
      { kind: "spawned", by: "main", as: "w1", provider: "claude" },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c-ok", "w1");

    // A store from before name validation: a channel dir whose name fails
    // SAFE_SEGMENT_RE. Without the skip, readReservationWorkers → channelDir
    // throws and the whole scan dies.
    const legacyDir = path.join(env.channelsRoot, env.projectKey, "bad name");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "events.jsonl"), "");

    const live = scanLiveWorkers({
      projectKey: env.projectKey,
      isSupervisorProcess: verifySupervisor,
    });
    expect(live).toHaveLength(1);
    expect(live[0].channel).toBe("c-ok");
  });

  it("counts spawn reservations before spawned is durable", async () => {
    await createChannel("c1b", { by: "main" });
    writeReservation(env.channelsRoot, env.projectKey, "c1b", "reserved");
    writeLivePid(env.channelsRoot, env.projectKey, "c1b", "reserved");

    const live = scanLiveWorkers({
      projectKey: env.projectKey,
      isSupervisorProcess: verifySupervisor,
    });
    expect(live).toHaveLength(1);
    expect(live[0].workerId).toBe("reserved");
    expect(live[0].state.lifecycle).toBe("starting");
  });

  it("ignores terminal workers", async () => {
    await createChannel("c2", { by: "main" });
    await appendEvent(
      "c2",
      { kind: "spawned", by: "main", as: "w1" },
      env.projectKey,
    );
    await appendEvent(
      "c2",
      {
        kind: "killed",
        by: "cli:kill",
        worker: "w1",
        reason: "explicit-kill",
      },
      env.projectKey,
    );
    // Even with a pid file (e.g. cleanup hasn't run), the terminal
    // projection wins.
    writeLivePid(env.channelsRoot, env.projectKey, "c2", "w1");

    const live = scanLiveWorkers({
      projectKey: env.projectKey,
      isSupervisorProcess: verifySupervisor,
    });
    expect(live).toHaveLength(0);
  });

  it("cleanupExpiredIdleWorkers writes shutdown-reason sidecar and signals SIGTERM", async () => {
    await createChannel("c3", { by: "main" });
    await appendEvent(
      "c3",
      {
        kind: "spawned",
        by: "main",
        as: "w1",
        ts: "2026-05-17T00:00:00.000Z",
      },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c3", "w1");

    const sentSignals: NodeJS.Signals[] = [];
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((_pid: number, sig?: number | NodeJS.Signals) => {
        if (sig === 0 || sig === undefined) return true;
        sentSignals.push(sig);
        return true;
      });

    const live = scanLiveWorkers({
      projectKey: env.projectKey,
      isSupervisorProcess: verifySupervisor,
    });
    const result = await cleanupExpiredIdleWorkers(live, 60_000, {
      project: env.projectKey,
      now: Date.parse("2026-05-17T01:00:00.000Z"),
    });

    expect(result.killed).toHaveLength(1);
    expect(sentSignals).toContain("SIGTERM");

    killSpy.mockRestore();

    expect(
      fs.readFileSync(
        workerFile("c3", "w1", "shutdown-reason", env.projectKey),
        "utf-8",
      ),
    ).toBe("idle-timeout\n");
    const events = await import("../../src/commands/channel/store/events.js").then(
      (m) => m.readChannelEvents("c3", env.projectKey),
    );
    expect(events.some((e) => e.kind === "killed")).toBe(false);
  });

  it("enforceSpawnBudget cleans expired idle workers, then permits a spawn", async () => {
    await createChannel("c4", { by: "main" });
    await appendEvent(
      "c4",
      {
        kind: "spawned",
        by: "main",
        as: "stale",
        ts: "2026-05-17T00:00:00.000Z",
      },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c4", "stale");

    vi.spyOn(process, "kill").mockReturnValue(true as never);
    const result = await enforceSpawnBudget({
      projectKey: env.projectKey,
      policy: { idleTimeoutMs: 60_000, maxLiveWorkers: 1 },
      now: Date.parse("2026-05-17T01:00:00.000Z"),
      isSupervisorProcess: verifySupervisor,
    });
    expect(result.cleaned).toHaveLength(1);
    expect(result.allowed).toBe(true);
  });

  it("cleanupExpiredIdleWorkers removes shutdown-reason sidecar when SIGTERM fails", async () => {
    await createChannel("c4b", { by: "main" });
    await appendEvent(
      "c4b",
      {
        kind: "spawned",
        by: "main",
        as: "stale",
        ts: "2026-05-17T00:00:00.000Z",
      },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c4b", "stale");

    vi.spyOn(process, "kill").mockImplementation(
      (_pid: number, sig?: number | NodeJS.Signals) => {
        if (sig === 0 || sig === undefined) return true;
        throw new Error("kill failed");
      },
    );

    const live = scanLiveWorkers({
      projectKey: env.projectKey,
      isSupervisorProcess: verifySupervisor,
    });
    const result = await cleanupExpiredIdleWorkers(live, 60_000, {
      project: env.projectKey,
      now: Date.parse("2026-05-17T01:00:00.000Z"),
    });

    expect(result.killed).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(
      fs.existsSync(
        workerFile("c4b", "stale", "shutdown-reason", env.projectKey),
      ),
    ).toBe(false);
  });

  it("cleanupExpiredIdleWorkers does not signal unverified supervisor pids", async () => {
    const live = {
      channel: "c4c",
      workerId: "stale",
      supervisorPid: process.pid,
      supervisorVerified: false,
      state: {
        workerId: "stale",
        lifecycle: "running",
        terminal: false,
        activity: "idle",
        idleSince: "2026-05-17T00:00:00.000Z",
        pendingMessageCount: 0,
        inboxPolicy: "explicitOnly",
        updatedAt: "2026-05-17T00:00:00.000Z",
        lastSeq: 1,
      },
    } satisfies LiveWorker;
    const killSpy = vi.spyOn(process, "kill");

    const result = await cleanupExpiredIdleWorkers([live], 60_000, {
      project: env.projectKey,
      now: Date.parse("2026-05-17T01:00:00.000Z"),
    });

    expect(result.killed).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("enforceSpawnBudget rejects when budget is still exhausted post-cleanup", async () => {
    await createChannel("c5", { by: "main" });
    // Two fresh idle workers (not past TTL) — budget=1 must reject.
    await appendEvent(
      "c5",
      {
        kind: "spawned",
        by: "main",
        as: "w1",
        ts: new Date().toISOString(),
      },
      env.projectKey,
    );
    await appendEvent(
      "c5",
      {
        kind: "spawned",
        by: "main",
        as: "w2",
        ts: new Date().toISOString(),
      },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c5", "w1");
    writeLivePid(env.channelsRoot, env.projectKey, "c5", "w2");

    const result = await enforceSpawnBudget({
      projectKey: env.projectKey,
      policy: { idleTimeoutMs: 5 * 60_000, maxLiveWorkers: 1 },
      isSupervisorProcess: verifySupervisor,
    });
    expect(result.cleaned).toHaveLength(0);
    expect(result.remaining.length).toBeGreaterThanOrEqual(1);
    expect(result.allowed).toBe(false);

    const msg = formatBudgetOverflowError({
      projectKey: env.projectKey,
      live: result.remaining,
      limit: 1,
    });
    expect(msg).toContain("Live worker budget exhausted");
    expect(msg).toContain("channel='c5'");
    expect(msg).toContain("trellis channel kill");
    expect(msg).toContain("--max-live-workers");
  });

  it("maxLiveWorkers=0 allows spawn regardless of live count", async () => {
    await createChannel("c6", { by: "main" });
    await appendEvent(
      "c6",
      { kind: "spawned", by: "main", as: "w" },
      env.projectKey,
    );
    writeLivePid(env.channelsRoot, env.projectKey, "c6", "w");

    const result = await enforceSpawnBudget({
      projectKey: env.projectKey,
      policy: { idleTimeoutMs: 0, maxLiveWorkers: 0 },
      isSupervisorProcess: verifySupervisor,
    });
    expect(result.allowed).toBe(true);
  });
});
