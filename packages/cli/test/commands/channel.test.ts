import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChannel } from "../../src/commands/channel/create.js";
import {
  channelContextAdd,
  channelContextList,
} from "../../src/commands/channel/context.js";
import { channelInterrupt } from "../../src/commands/channel/interrupt.js";
import { channelMessages } from "../../src/commands/channel/messages.js";
import { channelSend } from "../../src/commands/channel/send.js";
import { runInboxWatcher } from "../../src/commands/channel/supervisor/inbox.js";
import { applyParseResult } from "../../src/commands/channel/supervisor/stdout.js";
import { TurnTracker } from "../../src/commands/channel/supervisor/turns.js";
import {
  channelTitleClear,
  channelTitleSet,
} from "../../src/commands/channel/title.js";
import { channelThreadPost } from "../../src/commands/channel/threads.js";
import { readChannelEvents } from "../../src/commands/channel/store/events.js";
import { matchesEventFilter } from "../../src/commands/channel/store/filter.js";
import {
  channelRoot,
  eventsPath,
  projectKey,
  workerFile,
} from "../../src/commands/channel/store/paths.js";
import { parseCsv } from "../../src/commands/channel/store/schema.js";
import { reduceThreads } from "../../src/commands/channel/store/thread-state.js";

const noop = (): void => undefined;

describe("channel storage and forum channels", () => {
  let tmpDir: string;
  let projectDir: string;
  let oldRoot: string | undefined;
  let oldProject: string | undefined;
  let originalStdin: typeof process.stdin;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-channel-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir);
    oldRoot = process.env.TRELLIS_CHANNEL_ROOT;
    oldProject = process.env.TRELLIS_CHANNEL_PROJECT;
    originalStdin = process.stdin;
    process.env.TRELLIS_CHANNEL_ROOT = path.join(tmpDir, "channels");
    delete process.env.TRELLIS_CHANNEL_PROJECT;
    vi.spyOn(process, "cwd").mockReturnValue(projectDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (oldRoot === undefined) delete process.env.TRELLIS_CHANNEL_ROOT;
    else process.env.TRELLIS_CHANNEL_ROOT = oldRoot;
    if (oldProject === undefined) delete process.env.TRELLIS_CHANNEL_PROJECT;
    else process.env.TRELLIS_CHANNEL_PROJECT = oldProject;
    Object.defineProperty(process, "stdin", {
      value: originalStdin,
      configurable: true,
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("honors TRELLIS_CHANNEL_ROOT when writing project channels", async () => {
    await createChannel("root-check", { by: "main" });

    expect(channelRoot()).toBe(path.join(tmpDir, "channels"));
    expect(
      fs.existsSync(eventsPath("root-check", projectKey(projectDir))),
    ).toBe(true);
  });

  it("reduces structured thread events into board state", async () => {
    const linkedFile = path.join(tmpDir, "context.md");
    fs.writeFileSync(linkedFile, "# Context\n");

    await createChannel("roadmap", {
      by: "main",
      scope: "global",
      type: "forum",
      description: "Local Trellis feedback board",
      contextFile: [linkedFile],
      contextRaw: ["watch channel UX"],
    });
    await channelThreadPost("roadmap", {
      as: "main",
      scope: "global",
      action: "opened",
      thread: "issue-1",
      title: "Channel thread mode",
      description: "Track thread-channel feedback.",
      labels: "channel,ux",
      assignees: "arch",
    });
    await channelThreadPost("roadmap", {
      as: "arch",
      scope: "global",
      action: "comment",
      thread: "issue-1",
      text: "Reviewed function shape.",
    });
    await channelThreadPost("roadmap", {
      as: "main",
      scope: "global",
      action: "status",
      thread: "issue-1",
      status: "closed",
    });
    await channelThreadPost("roadmap", {
      as: "main",
      scope: "global",
      action: "labels",
      thread: "issue-1",
      labels: "channel,reviewed",
    });
    await channelThreadPost("roadmap", {
      as: "main",
      scope: "global",
      action: "summary",
      thread: "issue-1",
      summary: "Thread channel behavior reviewed.",
    });
    await channelThreadPost("roadmap", {
      as: "main",
      scope: "global",
      action: "processed",
      thread: "issue-1",
    });

    const events = await readChannelEvents("roadmap", "_global");
    const state = reduceThreads(events);

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      thread: "issue-1",
      title: "Channel thread mode",
      status: "processed",
      labels: ["channel", "reviewed"],
      assignees: ["arch"],
      summary: "Thread channel behavior reviewed.",
      lastSeq: events.at(-1)?.seq,
      comments: 1,
    });

    vi.mocked(console.log).mockClear();
    await channelMessages("roadmap", { scope: "global" });
    const boardOutput = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => String(line))
      .join("\n");
    expect(boardOutput).toContain("Forum channel: showing threads");
    expect(boardOutput).toContain("issue-1 [processed] Channel thread mode");

    vi.mocked(console.log).mockClear();
    await channelMessages("roadmap", { scope: "global", kind: "create" });
    const createOutput = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => String(line))
      .join("\n");
    expect(createOutput).toContain("description: Local Trellis feedback board");
    expect(createOutput).toContain(`context:file: ${linkedFile}`);
    expect(createOutput).toContain("context:raw: watch channel UX");

    vi.mocked(console.log).mockClear();
    await channelMessages("roadmap", { scope: "global", thread: "issue-1" });
    const threadOutput = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => String(line))
      .join("\n");
    expect(threadOutput).toContain(
      "description: Track thread-channel feedback.",
    );
  });

  it("requires explicit scope when a channel exists in global and project scopes", async () => {
    await createChannel("dupe", { by: "main" });
    await createChannel("dupe", { by: "main", scope: "global" });

    await expect(
      channelSend("dupe", { as: "main", text: "ambiguous" }),
    ).rejects.toThrow("Use --scope global or --scope project");

    await channelSend("dupe", {
      as: "main",
      text: "global message",
      scope: "global",
    });

    const events = await readChannelEvents("dupe", "_global");
    expect(events.at(-1)).toMatchObject({
      kind: "message",
      text: "global message",
    });
  });

  it("writes undeliverable events for strict CLI delivery mode", async () => {
    await createChannel("strict-send", { by: "main" });

    await channelSend("strict-send", {
      as: "main",
      text: "hello",
      to: "ghost",
      deliveryMode: "requireKnownWorker",
    });

    const events = await readChannelEvents(
      "strict-send",
      projectKey(projectDir),
    );
    expect(events.at(-1)).toMatchObject({
      kind: "undeliverable",
      targetWorker: "ghost",
      messageSeq: 2,
      reason: "worker-unknown",
      origin: "cli",
    });
  });

  it("posts thread event text from a file with send-compatible trimming", async () => {
    const bodyFile = path.join(tmpDir, "body.md");
    fs.writeFileSync(bodyFile, "## Review\n\nLooks good.\n\n");
    await createChannel("file-post", {
      by: "main",
      type: "forum",
    });

    await channelThreadPost("file-post", {
      as: "check",
      action: "comment",
      thread: "issue-1",
      textFile: bodyFile,
    });

    const events = await readChannelEvents(
      "file-post",
      projectKey(projectDir),
    );
    expect(events.at(-1)).toMatchObject({
      kind: "thread",
      action: "comment",
      thread: "issue-1",
      text: "## Review\n\nLooks good.",
    });
  });

  it("prefers non-empty inline post text over text-file input", async () => {
    const bodyFile = path.join(tmpDir, "ignored.md");
    fs.writeFileSync(bodyFile, "file body\n");
    await createChannel("precedence-post", {
      by: "main",
      type: "forum",
    });

    await channelThreadPost("precedence-post", {
      as: "check",
      action: "comment",
      thread: "issue-1",
      text: "inline body",
      textFile: bodyFile,
    });

    const events = await readChannelEvents(
      "precedence-post",
      projectKey(projectDir),
    );
    expect(events.at(-1)).toMatchObject({
      kind: "thread",
      action: "comment",
      thread: "issue-1",
      text: "inline body",
    });
  });

  it("posts thread event text from stdin", async () => {
    await createChannel("stdin-post", {
      by: "main",
      type: "forum",
    });
    const stdin = new PassThrough();
    Object.defineProperty(process, "stdin", {
      value: stdin,
      configurable: true,
    });

    const posted = channelThreadPost("stdin-post", {
      as: "check",
      action: "comment",
      thread: "issue-1",
      stdin: true,
    });
    stdin.end("Body from stdin\n");
    await posted;

    const events = await readChannelEvents(
      "stdin-post",
      projectKey(projectDir),
    );
    expect(events.at(-1)).toMatchObject({
      kind: "thread",
      action: "comment",
      thread: "issue-1",
      text: "Body from stdin",
    });
  });

  it("defaults context and title author to main when --as is omitted", async () => {
    await createChannel("defaults", {
      by: "main",
      type: "forum",
    });
    await channelThreadPost("defaults", {
      as: "main",
      action: "opened",
      thread: "issue-1",
    });

    await channelContextAdd("defaults", {
      raw: ["channel note"],
    });
    await channelContextAdd("defaults", {
      thread: "issue-1",
      raw: ["thread note"],
    });
    await channelTitleSet("defaults", {
      title: "Readable",
    });
    await channelTitleClear("defaults", {});

    const events = await readChannelEvents(
      "defaults",
      projectKey(projectDir),
    );
    expect(events.slice(-4).map((event) => event.by)).toEqual([
      "main",
      "main",
      "main",
      "main",
    ]);

    vi.mocked(console.log).mockClear();
    await channelContextList("defaults", {});
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toBe(
      "raw  channel note",
    );
  });

  it("records turn_finished when a worker emits a terminal event", async () => {
    await createChannel("turns", { by: "main" });
    const tracker = new TurnTracker();
    tracker.begin(2);
    const shutdown = {
      markTerminalEmitted: vi.fn(),
    };
    const child = {
      stdin: { write: vi.fn() },
    };

    await applyParseResult(
      "turns",
      "worker",
      { events: [{ kind: "done", payload: { duration_ms: 10 } }] },
      child as never,
      shutdown as never,
      tracker,
    );

    const events = await readChannelEvents("turns", projectKey(projectDir));
    expect(events.slice(-2)).toMatchObject([
      { kind: "done", by: "worker", duration_ms: 10 },
      {
        kind: "turn_finished",
        by: "worker",
        worker: "worker",
        inputSeq: 2,
        turnId: "msg:2",
        outcome: "done",
      },
    ]);
  });

  it("marks the active turn aborted before an interrupt turn starts", async () => {
    await createChannel("interrupt-turns", { by: "main" });
    await channelSend("interrupt-turns", {
      as: "main",
      text: "slow work",
      to: "worker",
    });
    const tracker = new TurnTracker();
    tracker.begin(2);
    fs.writeFileSync(
      workerFile("interrupt-turns", "worker", "inbox-cursor"),
      "2",
    );
    const abort = new AbortController();
    const stdinWrite = vi.fn();
    const child = {
      stdin: { write: stdinWrite },
    };
    const adapter = {
      provider: "claude",
      buildArgs: vi.fn(),
      createCtx: vi.fn(),
      isReady: vi.fn(() => true),
      parseLine: vi.fn(() => ({ events: [] })),
      encodeUserMessage: vi.fn((text: string) => JSON.stringify({ text })),
      encodeInterruptMessage: vi.fn((text: string) =>
        JSON.stringify({ interrupt: text }),
      ),
    };

    const watcher = runInboxWatcher({
      channelName: "interrupt-turns",
      workerName: "worker",
      adapter: adapter as never,
      ctx: undefined,
      child: child as never,
      signal: abort.signal,
      turnTracker: tracker,
    });

    await channelInterrupt("interrupt-turns", {
      as: "main",
      text: "stop",
      to: "worker",
    });
    await vi.waitUntil(() => stdinWrite.mock.calls.length > 0, {
      timeout: 1000,
    });
    abort.abort();
    await watcher;

    const events = await readChannelEvents(
      "interrupt-turns",
      projectKey(projectDir),
    );
    expect(events.slice(-4)).toMatchObject([
      {
        kind: "interrupt_requested",
        by: "main",
        worker: "worker",
        reason: "user",
      },
      {
        kind: "turn_finished",
        worker: "worker",
        inputSeq: 2,
        turnId: "msg:2",
        outcome: "aborted",
      },
      {
        kind: "interrupted",
        worker: "worker",
        turnId: "msg:2",
        method: "stdin",
        outcome: "interrupted",
      },
      {
        kind: "turn_started",
        worker: "worker",
        inputSeq: 3,
        turnId: "msg:3",
      },
    ]);
    expect(stdinWrite).toHaveBeenCalledWith(
      JSON.stringify({ interrupt: "stop" }),
    );
  });

  it("queues normal messages until the active turn finishes", async () => {
    await createChannel("queued-turns", { by: "main" });
    await channelSend("queued-turns", {
      as: "main",
      text: "first",
      to: "worker",
    });
    const tracker = new TurnTracker();
    tracker.begin(2);
    fs.writeFileSync(workerFile("queued-turns", "worker", "inbox-cursor"), "2");
    const abort = new AbortController();
    const stdinWrite = vi.fn();
    const child = {
      stdin: { write: stdinWrite },
    };
    const adapter = {
      provider: "claude",
      buildArgs: vi.fn(),
      createCtx: vi.fn(),
      isReady: vi.fn(() => true),
      parseLine: vi.fn(() => ({ events: [] })),
      encodeUserMessage: vi.fn((text: string) => JSON.stringify({ text })),
      encodeInterruptMessage: vi.fn((text: string) =>
        JSON.stringify({ interrupt: text }),
      ),
    };
    const shutdown = {
      markTerminalEmitted: vi.fn(),
    };

    const watcher = runInboxWatcher({
      channelName: "queued-turns",
      workerName: "worker",
      adapter: adapter as never,
      ctx: undefined,
      child: child as never,
      signal: abort.signal,
      turnTracker: tracker,
    });

    await channelSend("queued-turns", {
      as: "main",
      text: "second",
      to: "worker",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(stdinWrite).not.toHaveBeenCalled();

    await applyParseResult(
      "queued-turns",
      "worker",
      { events: [{ kind: "done", payload: {} }] },
      child as never,
      shutdown as never,
      tracker,
    );
    await vi.waitUntil(() => stdinWrite.mock.calls.length > 0, {
      timeout: 1000,
    });
    abort.abort();
    await watcher;

    const events = await readChannelEvents("queued-turns", projectKey(projectDir));
    expect(events.slice(-3)).toMatchObject([
      { kind: "done", by: "worker" },
      { kind: "turn_finished", inputSeq: 2, turnId: "msg:2" },
      { kind: "turn_started", inputSeq: 3, turnId: "msg:3" },
    ]);
    expect(stdinWrite).toHaveBeenCalledWith(JSON.stringify({ text: "second" }));
  });
});

describe("channel shared helpers", () => {
  it("parses CSV values in one shared helper", () => {
    expect(parseCsv(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(parseCsv(undefined)).toBeUndefined();
    expect(parseCsv(" , ")).toBeUndefined();
  });

  it("uses one event filter for routing, progress, and thread predicates", () => {
    expect(
      matchesEventFilter(
        {
          seq: 1,
          ts: "2026-05-13T00:00:00.000Z",
          kind: "thread",
          by: "arch",
          action: "comment",
          thread: "topic-1",
        },
        {
          kind: "thread",
          from: ["arch"],
          action: "comment",
          thread: "topic-1",
        },
      ),
    ).toBe(true);

    expect(
      matchesEventFilter(
        {
          seq: 2,
          ts: "2026-05-13T00:00:00.000Z",
          kind: "progress",
          by: "arch",
        },
        {},
      ),
    ).toBe(false);

    expect(
      matchesEventFilter(
        {
          seq: 3,
          ts: "2026-05-13T00:00:00.000Z",
          kind: "message",
          by: "main",
          to: ["check"],
        },
        { to: "arch" },
      ),
    ).toBe(false);
  });
});
