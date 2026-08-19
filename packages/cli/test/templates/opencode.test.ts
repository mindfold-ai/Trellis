import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  contextCollector,
  isTrellisSubagent,
  readContextInjectionLimits,
  TrellisContext,
  truncateUtf8,
} from "../../src/templates/opencode/lib/trellis-context.js";
import {
  findUserTextPart,
  insertSyntheticTextPart,
} from "../../src/templates/opencode/lib/context-visibility.js";
import {
  buildSessionContext,
  hasInjectedTrellisContext,
} from "../../src/templates/opencode/lib/session-utils.js";
import injectSubagentContextPlugin from "../../src/templates/opencode/plugins/inject-subagent-context.js";
import sessionStartPlugin from "../../src/templates/opencode/plugins/session-start.js";
import injectWorkflowStatePlugin from "../../src/templates/opencode/plugins/inject-workflow-state.js";

interface TestContextCollector {
  processed: Set<string>;
  markProcessed(directory: string, sessionID: string): void;
  isProcessed(directory: string, sessionID: string): boolean;
  clear(sessionID: string): void;
}

interface OpenCodeInjectHooks {
  "tool.execute.before": (
    input: unknown,
    output: { args: { command: string } },
  ) => Promise<void>;
}

async function createOpenCodeInjectHooks(
  platform: NodeJS.Platform = "linux",
  env: NodeJS.ProcessEnv = {},
): Promise<OpenCodeInjectHooks> {
  return (await injectSubagentContextPlugin({
    directory: "/tmp/trellis-opencode-test",
    platform,
    env,
  })) as OpenCodeInjectHooks;
}

describe("opencode session context dedupe", () => {
  let collector: TestContextCollector;

  beforeEach((): void => {
    collector = contextCollector as TestContextCollector;
  });

  afterEach((): void => {
    collector.clear("session-a");
    collector.clear("session-b");
    collector.processed.clear();
  });

  it("tracks processed sessions in memory for the active process", () => {
    expect(collector.isProcessed("session-a")).toBe(false);

    collector.markProcessed("session-a");
    expect(collector.isProcessed("session-a")).toBe(true);

    collector.clear("session-a");

    expect(collector.isProcessed("session-a")).toBe(false);
  });

  it("does not treat a different session id as already processed", () => {
    collector.markProcessed("session-a");

    expect(collector.isProcessed("session-b")).toBe(false);
  });
});

describe("opencode session-start history detection", () => {
  afterEach((): void => {
    contextCollector.clear("session-a");
  });

  it("builds compact startup context with an adaptive one-shot acknowledgment", () => {
    const context = buildSessionContext({
      directory: "/tmp/trellis-opencode-test",
      getActiveTask: () => ({ taskPath: null, source: "none", stale: false }),
      getContextKey: () => null,
      getCurrentTask: () => null,
      readFile: () => "",
      readProjectFile: () => "",
      resolveTaskDir: () => null,
      runScript: () => "",
    });

    expect(context.startsWith("<session-context>")).toBe(true);
    expect(context).toContain("Trellis compact SessionStart context");
    expect(context).toContain("<first-reply-notice>");
    expect(context).toContain("the user's current request");
    expect(context).toContain("the user message that triggered this reply");
    expect(context).toContain("has no clear natural language");
    expect(context).toContain(
      "explicitly established project communication language",
    );
    expect(context).toContain("Trellis SessionStart ✓");
    expect(context).toContain("Continue directly with the user's request");
    expect(context).toContain(
      "must not alter the language used for the remainder of the response",
    );
    expect(context).toContain("This notice is one-shot");
    expect(context.indexOf("the user's current request")).toBeLessThan(
      context.indexOf("explicitly established project communication language"),
    );
    expect(
      context.indexOf("explicitly established project communication language"),
    ).toBeLessThan(context.indexOf("Trellis SessionStart ✓"));
    expect(context.indexOf("<first-reply-notice>")).toBeLessThan(
      context.indexOf("<current-state>"),
    );
    expect(context).toContain("<guidelines>");
    expect(context).toContain("<ready>");
    expect(context).not.toContain("say once in Chinese");
    expect(context).not.toContain("exactly one short Chinese sentence");
    expect(context).not.toContain(
      "Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。",
    );
  });

  it("persists startup context and suppresses reinjection from history", async () => {
    interface ChatOutput {
      parts: {
        id: string;
        sessionID: string;
        messageID: string;
        type: string;
        text: string;
        synthetic?: boolean;
        metadata?: { trellis?: { sessionStart?: boolean } };
      }[];
    }

    let historyReads = 0;
    let persistedParts: ChatOutput["parts"] = [];
    const hooks = (await sessionStartPlugin({
      directory: "/tmp/trellis-opencode-test",
      client: {
        session: {
          messages: async () => {
            historyReads += 1;
            return {
              data:
                persistedParts.length === 0
                  ? []
                  : [{ info: { role: "user" }, parts: persistedParts }],
            };
          },
        },
      },
    })) as {
      "chat.message": (
        input: { sessionID: string; agent: string },
        output: ChatOutput,
      ) => Promise<void>;
    };

    const firstOutput: ChatOutput = {
      parts: [
        {
          id: "prt_000000000010abcdefghijklmn",
          sessionID: "session-a",
          messageID: "message-a",
          type: "text",
          text: "First request",
        },
      ],
    };
    await hooks["chat.message"](
      { sessionID: "session-a", agent: "build" },
      firstOutput,
    );

    expect(firstOutput.parts).toHaveLength(2);
    expect(firstOutput.parts[0]).toMatchObject({
      sessionID: "session-a",
      messageID: "message-a",
      type: "text",
      synthetic: true,
    });
    expect(firstOutput.parts[0].text).toMatch(/^<session-context>/);
    expect(firstOutput.parts[0].text).toContain("<first-reply-notice>");
    expect(firstOutput.parts[0].text).toContain("Trellis SessionStart ✓");
    expect(firstOutput.parts[0].metadata).toEqual({
      trellis: { sessionStart: true },
    });
    expect(firstOutput.parts[1]).toEqual({
      id: "prt_000000000010abcdefghijklmn",
      sessionID: "session-a",
      messageID: "message-a",
      type: "text",
      text: "First request",
    });

    persistedParts = firstOutput.parts;
    // The plugin's `session.compacted` event handler was removed as dead
    // code: clearing the in-memory processed flag there was always undone
    // one line later by hasPersistedInjectedContext finding the
    // pre-compaction marker still in history, so re-injecting fresh context
    // after compaction is a known gap, not a design choice. Simulate a
    // fresh process picking up this session instead, which exercises the
    // real, still-live persisted-history dedupe path below.
    contextCollector.clear("session-a");

    const secondOutput: ChatOutput = {
      parts: [
        {
          id: "prt_000000000020abcdefghijklmn",
          sessionID: "session-a",
          messageID: "message-b",
          type: "text",
          text: "Second request",
        },
      ],
    };
    await hooks["chat.message"](
      { sessionID: "session-a", agent: "build" },
      secondOutput,
    );

    expect(secondOutput.parts).toEqual([
      {
        id: "prt_000000000020abcdefghijklmn",
        sessionID: "session-a",
        messageID: "message-b",
        type: "text",
        text: "Second request",
      },
    ]);
    expect(historyReads).toBe(2);
  });

  it("detects persisted Trellis context from metadata", () => {
    const messages = [
      {
        info: { role: "user" },
        parts: [
          {
            type: "text",
            text: "hello",
            metadata: {
              trellis: {
                sessionStart: true,
              },
            },
          },
        ],
      },
    ];

    expect(hasInjectedTrellisContext(messages)).toBe(true);
  });

  it("ignores unrelated user messages", () => {
    const messages = [
      {
        info: { role: "user" },
        parts: [
          {
            type: "text",
            text: "normal prompt",
          },
        ],
      },
    ];

    expect(hasInjectedTrellisContext(messages)).toBe(false);
  });
});

describe("opencode bash session context", () => {
  it("injects TRELLIS_CONTEXT_ID into Bash commands from plugin sessionID", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command: "python3 ./.trellis/scripts/task.py start .trellis/tasks/demo",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; python3 ./.trellis/scripts/task.py start .trellis/tasks/demo",
    );
  });

  it("uses PowerShell environment syntax on Windows", async () => {
    const hooks = await createOpenCodeInjectHooks("win32");
    const output = {
      args: {
        command: "python ./.trellis/scripts/task.py start .trellis/tasks/demo",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "$env:TRELLIS_CONTEXT_ID = 'opencode_oc-a'; python ./.trellis/scripts/task.py start .trellis/tasks/demo",
    );
  });

  it("uses POSIX environment syntax on Windows Git Bash", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      MSYSTEM: "MINGW64",
    });
    const output = {
      args: {
        command: "git diff --name-only",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git diff --name-only",
    );
  });

  it("uses POSIX environment syntax when Windows OSTYPE indicates MSYS", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      OSTYPE: "msys",
    });
    const output = {
      args: {
        command: "git status --short",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git status --short",
    );
  });

  it("uses POSIX environment syntax when Windows MINGW_PREFIX is set", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      MINGW_PREFIX: "/mingw64",
    });
    const output = {
      args: {
        command: "git log --oneline -1",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git log --oneline -1",
    );
  });

  it("uses POSIX environment syntax when Windows SHELL is bash", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      SHELL: "/usr/bin/bash",
    });
    const output = {
      args: {
        command: "git branch --show-current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git branch --show-current",
    );
  });

  it("uses POSIX environment syntax when OpenCode Git Bash path is configured", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      OPENCODE_GIT_BASH_PATH: "C:\\Program Files\\Git\\bin\\bash.exe",
    });
    const output = {
      args: {
        command: "git rev-parse --show-toplevel",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git rev-parse --show-toplevel",
    );
  });

  it("does not duplicate an explicit TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command:
          "TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
    );
  });

  it("does not duplicate an explicit exported TRELLIS_CONTEXT_ID", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command:
          "export TRELLIS_CONTEXT_ID=manual; python3 ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID=manual; python3 ./.trellis/scripts/task.py current",
    );
  });

  it("does not duplicate an explicit env TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command:
          "env FOO=bar TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "env FOO=bar TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
    );
  });

  it("does not duplicate an explicit PowerShell TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks("win32");
    const output = {
      args: {
        command:
          "$env:TRELLIS_CONTEXT_ID = 'manual'; python ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "$env:TRELLIS_CONTEXT_ID = 'manual'; python ./.trellis/scripts/task.py current",
    );
  });

  it("does not treat a grep pattern as an explicit TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command: "env | sort | grep '^TRELLIS_CONTEXT_ID='",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; env | sort | grep '^TRELLIS_CONTEXT_ID='",
    );
  });
});

// ---------------------------------------------------------------------------
// Issue #264 — sub-agent context injection + chat.message skip
// ---------------------------------------------------------------------------

interface TaskToolOutput {
  args: {
    subagent_type?: string;
    prompt?: string;
  };
}

interface TaskToolHooks {
  "tool.execute.before": (
    input: { tool: string; sessionID?: string; agent?: string },
    output: TaskToolOutput,
  ) => Promise<void>;
}

interface ChatMessagePart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: string;
  text?: string;
  synthetic?: boolean;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ChatMessageHooks {
  "chat.message": (
    input: { sessionID: string; agent?: string },
    output: { parts: ChatMessagePart[] },
  ) => Promise<void>;
}

function createUserTextPart(
  text: string,
  sessionID = "main-session",
  messageID = "message-a",
  ordinal = "000000000010",
): ChatMessagePart {
  return {
    id: `prt_${ordinal}abcdefghijklmn`,
    sessionID,
    messageID,
    type: "text",
    text,
  };
}

describe("opencode persisted synthetic context parts", () => {
  it("creates deterministic complete identities without changing ordinary parts", () => {
    const ordinary = createUserTextPart("original prompt");
    ordinary.metadata = { user: { preserved: true } };
    const firstParts = [structuredClone(ordinary)];
    const secondParts = [structuredClone(ordinary)];

    const first = insertSyntheticTextPart(
      firstParts,
      "session context",
      "sessionStart",
    );
    const second = insertSyntheticTextPart(
      secondParts,
      "session context",
      "sessionStart",
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sessionID: "main-session",
      messageID: "message-a",
      type: "text",
      text: "session context",
      synthetic: true,
    });
    expect(first.id).toMatch(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(firstParts[1]).toEqual(ordinary);
    expect(secondParts[1]).toEqual(ordinary);
  });

  it("keeps both insertion orders equal to ID-sorted replay order", () => {
    for (const order of [
      ["sessionStart", "workflowState"],
      ["workflowState", "sessionStart"],
    ]) {
      const ordinary = createUserTextPart("ordinary user prompt");
      const parts = [structuredClone(ordinary)];

      for (const kind of order) {
        insertSyntheticTextPart(
          parts,
          kind === "sessionStart" ? "session context" : "workflow context",
          kind,
        );
      }

      expect(parts.map(part => part.text)).toEqual([
        "session context",
        "workflow context",
        "ordinary user prompt",
      ]);
      expect(parts.map(part => part.id)).toEqual(
        [...parts]
          .sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
          )
          .map(part => part.id),
      );
      expect(parts[0].id).not.toBe(parts[1].id);
      expect(parts[2]).toEqual(ordinary);
      expect(findUserTextPart(parts)).toBe(parts[2]);
    }
  });

  it("rejects unsupported kinds, missing identities, and duplicate IDs before mutation", () => {
    const unsupportedParts = [createUserTextPart("prompt")];
    const unsupportedBefore = structuredClone(unsupportedParts);
    expect(() =>
      insertSyntheticTextPart(unsupportedParts, "context", "unknown"),
    ).toThrow("unknown context part kind");
    expect(unsupportedParts).toEqual(unsupportedBefore);

    const unsupportedIdentityParts = [
      createUserTextPart(
        "prompt",
        "main-session",
        "message-low-ordinal",
        "000000000001",
      ),
    ];
    const unsupportedIdentityBefore = structuredClone(
      unsupportedIdentityParts,
    );
    expect(() =>
      insertSyntheticTextPart(
        unsupportedIdentityParts,
        "context",
        "sessionStart",
      ),
    ).toThrow("unsupported OpenCode part ID ordinal");
    expect(unsupportedIdentityParts).toEqual(unsupportedIdentityBefore);

    const missingIdentityParts: ChatMessagePart[] = [
      { type: "text", text: "prompt" },
    ];
    const missingIdentityBefore = structuredClone(missingIdentityParts);
    expect(() =>
      insertSyntheticTextPart(
        missingIdentityParts,
        "context",
        "sessionStart",
      ),
    ).toThrow("no ordinary OpenCode part with a persisted identity");
    expect(missingIdentityParts).toEqual(missingIdentityBefore);

    const duplicateParts = [createUserTextPart("prompt")];
    insertSyntheticTextPart(duplicateParts, "context", "workflowState");
    const duplicateBefore = structuredClone(duplicateParts);
    expect(() =>
      insertSyntheticTextPart(duplicateParts, "context", "workflowState"),
    ).toThrow("duplicate synthetic context part");
    expect(duplicateParts).toEqual(duplicateBefore);
  });

  it("fails closed on a legacy 19-character OpenCode part ID format without mutating parts", () => {
    // OpenCode has changed its part ID format before: a live DB observed 5 of
    // 2440 IDs still using this older, shorter shape. PART_ID_PATTERN must
    // reject it rather than silently treat it as a valid identity source.
    const legacyParts: ChatMessagePart[] = [
      {
        id: "prt_19b9634d8e5924s6zx6",
        sessionID: "main-session",
        messageID: "message-legacy",
        type: "text",
        text: "prompt",
      },
    ];
    const legacyBefore = structuredClone(legacyParts);
    expect(() =>
      insertSyntheticTextPart(legacyParts, "context", "sessionStart"),
    ).toThrow("no ordinary OpenCode part with a persisted identity");
    expect(legacyParts).toEqual(legacyBefore);
  });

  it("uses an ordinary attachment as the identity source", () => {
    const attachment: ChatMessagePart = {
      id: "prt_000000000010abcdefghijklmn",
      sessionID: "attachment-session",
      messageID: "attachment-message",
      type: "file",
      mime: "application/pdf",
      filename: "report.pdf",
    };
    const parts = [structuredClone(attachment)];

    const inserted = insertSyntheticTextPart(
      parts,
      "workflow context",
      "workflowState",
    );

    expect(inserted).toMatchObject({
      sessionID: "attachment-session",
      messageID: "attachment-message",
      synthetic: true,
    });
    expect(parts[1]).toEqual(attachment);
    expect(findUserTextPart(parts)).toBeUndefined();
  });

  it("uses the minimum-ordinal ordinary part as the identity source when a message has both a text and a file part", () => {
    // Real ID shapes from a live OpenCode DB: same millisecond, adjacent
    // counters. The text part (…c001) must win over the file part (…c002).
    const textPart: ChatMessagePart = {
      id: "prt_b9634c88c001aaaaaaaaaaaaaa",
      sessionID: "main-session",
      messageID: "message-multi-part",
      type: "text",
      text: "typed message",
    };
    const filePart: ChatMessagePart = {
      id: "prt_b9634c88c002aaaaaaaaaaaaaa",
      sessionID: "main-session",
      messageID: "message-multi-part",
      type: "file",
      mime: "application/pdf",
      filename: "report.pdf",
    };
    const parts = [structuredClone(textPart), structuredClone(filePart)];

    const sessionStartPart = insertSyntheticTextPart(
      parts,
      "session context",
      "sessionStart",
    );
    const workflowStatePart = insertSyntheticTextPart(
      parts,
      "workflow context",
      "workflowState",
    );

    for (const ordinary of [textPart, filePart]) {
      expect(sessionStartPart.id < ordinary.id).toBe(true);
      expect(workflowStatePart.id < ordinary.id).toBe(true);
    }

    // The sort-below assertions above are necessary but NOT sufficient with
    // this exact fixture: they still pass even if findIdentitySourcePart
    // picks the file part (the *maximum*-ordinal ordinary part) instead of
    // the text part, because the wrongly-sourced workflowState ordinal then
    // collides with the text part's own 12-hex ordinal, and the numeric
    // slot digit "1" still sorts below the "a" tail character by ASCII
    // luck. Pin the exact ordinal derived from the text part (the minimum)
    // so an inverted comparator is actually caught:
    // sessionStart = 0xb9634c88c001 - 2 = 0xb9634c88bfff,
    // workflowState = 0xb9634c88c001 - 1 = 0xb9634c88c000.
    expect(sessionStartPart.id.slice(0, 17)).toBe("prt_b9634c88bfff0");
    expect(workflowStatePart.id.slice(0, 17)).toBe("prt_b9634c88c0001");
  });
});

function setupTrellisProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "trellis-opencode-264-"));
  const taskDir = join(dir, ".trellis", "tasks", "demo-task");
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(dir, ".trellis", ".runtime", "sessions"), { recursive: true });
  writeFileSync(join(taskDir, "prd.md"), "# Demo PRD\n\nGoal: verify injection.");
  writeFileSync(join(taskDir, "implement.jsonl"), "");
  writeFileSync(join(taskDir, "check.jsonl"), "");
  writeFileSync(
    join(dir, ".trellis", "workflow.md"),
    [
      "# Workflow",
      "",
      "[workflow-state:in_progress]",
      "Active task: <task path>. Dispatch trellis-implement or trellis-check.",
      "[/workflow-state:in_progress]",
      "",
    ].join("\n"),
  );
  return dir;
}

function writeSessionFile(dir: string, key: string, taskRef: string): void {
  const file = join(dir, ".trellis", ".runtime", "sessions", `${key}.json`);
  writeFileSync(file, JSON.stringify({ current_task: taskRef }, null, 2));
}

describe("opencode subagent helper", () => {
  it("isTrellisSubagent matches the three trellis sub-agent names", () => {
    expect(isTrellisSubagent({ agent: "trellis-implement" })).toBe(true);
    expect(isTrellisSubagent({ agent: "trellis-check" })).toBe(true);
    expect(isTrellisSubagent({ agent: "trellis-research" })).toBe(true);
  });

  it("isTrellisSubagent rejects unrelated agents", () => {
    expect(isTrellisSubagent({ agent: "build" })).toBe(false);
    expect(isTrellisSubagent({ agent: "trellis-implement-extra" })).toBe(false);
    expect(isTrellisSubagent({ agent: undefined })).toBe(false);
    expect(isTrellisSubagent({})).toBe(false);
    expect(isTrellisSubagent(null)).toBe(false);
  });
});

describe("opencode TrellisContext single-session fallback", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTrellisProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the only session file when exactly one exists", () => {
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "missing-key" });

    expect(active.taskPath).toBe(".trellis/tasks/demo-task");
    expect(active.source).toBe("session-fallback:opencode_sole");
    expect(active.stale).toBe(false);
  });

  it("refuses to guess when two or more session files exist", () => {
    writeSessionFile(dir, "opencode_a", ".trellis/tasks/demo-task");
    writeSessionFile(dir, "opencode_b", ".trellis/tasks/demo-task");
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "missing-key" });

    expect(active.taskPath).toBeNull();
    expect(active.source).toBe("none");
  });

  it("returns no task when zero session files exist (Python parity)", () => {
    // sessions/ exists from setupTrellisProject but contains no files
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "missing-key" });

    expect(active.taskPath).toBeNull();
    expect(active.source).toBe("none");
  });

  it("prefers an exact context-key match over the fallback", () => {
    writeSessionFile(dir, "opencode_session_exact", ".trellis/tasks/demo-task");
    writeSessionFile(dir, "opencode_other", ".trellis/tasks/demo-task");
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "exact" });

    // sessionID="exact" maps to "opencode_exact" via buildContextKey; we
    // wrote "opencode_session_exact" so the exact lookup misses, but the
    // presence of ≥2 files means fallback should also refuse — proving
    // exact match is attempted first.
    expect(active.taskPath).toBeNull();
  });
});

describe("opencode inject-subagent-context (issue #264)", () => {
  let dir: string;
  let hooks: TaskToolHooks;

  beforeEach(async () => {
    dir = setupTrellisProject();
    hooks = (await injectSubagentContextPlugin({
      directory: dir,
      platform: "linux",
      env: {},
    })) as TaskToolHooks;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("mutates implement prompt using single-session fallback when sessionID misses", async () => {
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "do the implementation",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("# Implement Agent Task");
    expect(output.args.prompt).toContain("Demo PRD");
    expect(output.args.prompt).toContain("do the implementation");
    // Marker must be at the top so generated agent definitions can detect
    // successful injection via a prefix check.
    expect(output.args.prompt.startsWith("<!-- trellis-hook-injected -->")).toBe(
      true,
    );
  });

  it("inlines JSONL-referenced spec content into the implement prompt", async () => {
    // Cover AC #1: "JSONL-referenced context" — the seed-only jsonl path
    // is exercised above; this one verifies a curated entry is inlined.
    const specPath = join(dir, ".trellis", "spec", "demo.md");
    mkdirSync(join(dir, ".trellis", "spec"), { recursive: true });
    writeFileSync(specPath, "# Demo Spec\n\nUNIQUE_SPEC_MARKER_42");
    writeFileSync(
      join(dir, ".trellis", "tasks", "demo-task", "implement.jsonl"),
      JSON.stringify({ file: ".trellis/spec/demo.md", reason: "test" }) + "\n",
    );
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");

    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "do the implementation",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("=== .trellis/spec/demo.md ===");
    expect(output.args.prompt).toContain("UNIQUE_SPEC_MARKER_42");
    expect(output.args.prompt).toContain("Demo PRD");
  });

  it("mutates check prompt using Active task hint when runtime resolution fails", async () => {
    // No session file → both session lookup and single-session fallback miss.
    // Hint is the only resolver.
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-check",
        prompt: "Active task: .trellis/tasks/demo-task\n\nplease check",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("# Check Agent Task");
    expect(output.args.prompt).toContain("Demo PRD");
  });

  it("Active task hint takes precedence over single-session fallback", async () => {
    // Set up TWO matches: a session file pointing at demo-task AND a hint
    // pointing at a different task path. Hint should win.
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/another-task");
    const hintTask = join(dir, ".trellis", "tasks", "hint-task");
    mkdirSync(hintTask, { recursive: true });
    writeFileSync(join(hintTask, "prd.md"), "# Hint PRD\n\nfrom hint");
    writeFileSync(join(hintTask, "implement.jsonl"), "");

    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "Active task: .trellis/tasks/hint-task\n\ngo",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("Hint PRD");
    expect(output.args.prompt).not.toContain("Demo PRD");
  });

  it("emits the trellis-hook-injected marker for research agent too", async () => {
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-research",
        prompt: "investigate something",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("# Research Agent Task");
  });

  it("skips when no task can be resolved through any path", async () => {
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "implement without context",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    // Prompt is left untouched when implement/check can't find a task
    expect(output.args.prompt).toBe("implement without context");
  });
});

describe("opencode chat.message subagent skip (issue #264)", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTrellisProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    contextCollector.clear("subagent-session");
    contextCollector.clear("main-session");
  });

  it("persists separate context parts in replay order for both plugin execution orders", async () => {
    for (const [index, order] of [
      ["sessionStart", "workflowState"],
      ["workflowState", "sessionStart"],
    ].entries()) {
      const sessionID = `plugin-order-${index}`;
      const ordinary = createUserTextPart(
        "ordinary user prompt",
        sessionID,
        `message-order-${index}`,
      );
      ordinary.metadata = { user: { preserved: true } };
      const parts = [structuredClone(ordinary)];
      const sessionHooks = (await sessionStartPlugin({
        directory: dir,
        client: {
          session: { messages: async () => ({ data: [] }) },
        },
      })) as ChatMessageHooks;
      const workflowHooks = (await injectWorkflowStatePlugin({
        directory: dir,
      })) as ChatMessageHooks;

      for (const kind of order) {
        const hooks = kind === "sessionStart" ? sessionHooks : workflowHooks;
        await hooks["chat.message"](
          { sessionID, agent: "build" },
          { parts },
        );
      }

      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatchObject({
        sessionID,
        messageID: `message-order-${index}`,
        type: "text",
        synthetic: true,
        metadata: { trellis: { sessionStart: true } },
      });
      expect(parts[0].text).toMatch(/^<session-context>/);
      expect(parts[1]).toMatchObject({
        sessionID,
        messageID: `message-order-${index}`,
        type: "text",
        synthetic: true,
      });
      expect(parts[1].text).toMatch(/^<workflow-state>/);
      expect(parts[1].metadata).toBeUndefined();
      expect(parts[2]).toEqual(ordinary);
      expect(parts.map(part => part.id)).toEqual(
        [...parts]
          .sort((left, right) => {
            if (typeof left.id !== "string" || typeof right.id !== "string") {
              throw new TypeError("expected persisted part identities");
            }
            return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
          })
          .map(part => part.id),
      );
      contextCollector.clear(sessionID);
    }
  });

  it("uses attachment identity for both real plugins", async () => {
    const sessionID = "attachment-only-session";
    const attachment: ChatMessagePart = {
      id: "prt_000000000010abcdefghijklmn",
      sessionID,
      messageID: "attachment-only-message",
      type: "file",
      mime: "application/pdf",
      filename: "report.pdf",
    };
    const parts = [structuredClone(attachment)];
    const sessionHooks = (await sessionStartPlugin({
      directory: dir,
      client: { session: { messages: async () => ({ data: [] }) } },
    })) as ChatMessageHooks;
    const workflowHooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;

    await workflowHooks["chat.message"](
      { sessionID, agent: "build" },
      { parts },
    );
    await sessionHooks["chat.message"](
      { sessionID, agent: "build" },
      { parts },
    );

    expect(parts).toHaveLength(3);
    expect(parts[0].text).toMatch(/^<session-context>/);
    expect(parts[1].text).toMatch(/^<workflow-state>/);
    expect(parts[2]).toEqual(attachment);
    contextCollector.clear(sessionID);
  });

  it("preserves the user message when persisted identity is unavailable", async () => {
    const sessionHooks = (await sessionStartPlugin({
      directory: dir,
      client: { session: { messages: async () => ({ data: [] }) } },
    })) as ChatMessageHooks;
    const workflowHooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;

    for (const [sessionID, hooks] of [
      ["missing-session-identity", sessionHooks],
      ["missing-workflow-identity", workflowHooks],
    ] as const) {
      const parts: ChatMessagePart[] = [{ type: "text", text: "original" }];
      await hooks["chat.message"](
        { sessionID, agent: "build" },
        { parts },
      );
      expect(parts).toEqual([{ type: "text", text: "original" }]);
      contextCollector.clear(sessionID);
    }
  });

  it("checks the skip keyword only in ordinary user text", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const ordinary = createUserTextPart("ordinary prompt");
    const parts = [structuredClone(ordinary)];
    insertSyntheticTextPart(
      parts,
      "machine context containing no-trellis",
      "sessionStart",
    );

    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts },
    );

    expect(parts).toHaveLength(3);
    expect(parts[1].text).toMatch(/^<workflow-state>/);
    expect(parts[2]).toEqual(ordinary);
  });

  it("keeps both plugins disabled by their existing environment gates", async () => {
    const sessionHooks = (await sessionStartPlugin({
      directory: dir,
      client: { session: { messages: async () => ({ data: [] }) } },
    })) as ChatMessageHooks;
    const workflowHooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const cases = [
      ["TRELLIS_HOOKS", "0"],
      ["TRELLIS_DISABLE_HOOKS", "1"],
      ["OPENCODE_NON_INTERACTIVE", "1"],
    ] as const;

    for (const [key, value] of cases) {
      const previous = process.env[key];
      process.env[key] = value;
      try {
        for (const [suffix, hooks] of [
          ["session", sessionHooks],
          ["workflow", workflowHooks],
        ] as const) {
          const sessionID = `${key}-${suffix}`;
          const ordinary = createUserTextPart("original", sessionID);
          const parts = [structuredClone(ordinary)];
          await hooks["chat.message"](
            { sessionID, agent: "build" },
            { parts },
          );
          expect(parts).toEqual([ordinary]);
          contextCollector.clear(sessionID);
        }
      } finally {
        if (previous === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = previous;
      }
    }
  });

  it("session-start.js early-returns when input.agent is a trellis sub-agent", async () => {
    const hooks = (await sessionStartPlugin({
      directory: dir,
      client: undefined,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [createUserTextPart("original")];

    await hooks["chat.message"](
      { sessionID: "subagent-session", agent: "trellis-implement" },
      { parts },
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("original");
    expect(parts[0].metadata).toBeUndefined();
  });

  it("session-start.js skips trellis-check and trellis-research", async () => {
    const hooks = (await sessionStartPlugin({
      directory: dir,
      client: undefined,
    })) as ChatMessageHooks;

    for (const agent of ["trellis-check", "trellis-research"]) {
      const parts: ChatMessagePart[] = [createUserTextPart("untouched")];
      await hooks["chat.message"](
        { sessionID: "subagent-session", agent },
        { parts },
      );
      expect(parts[0].text).toBe("untouched");
    }
  });

  it("inject-workflow-state.js early-returns when input.agent is a trellis sub-agent", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [createUserTextPart("original")];

    await hooks["chat.message"](
      { sessionID: "subagent-session", agent: "trellis-implement" },
      { parts },
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("original");
  });

  it("inject-workflow-state.js still injects breadcrumb for main-session turns", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const ordinary = createUserTextPart("user prompt");
    const parts: ChatMessagePart[] = [structuredClone(ordinary)];

    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts },
    );

    expect(parts).toHaveLength(2);
    expect(parts[0].text).toContain("<workflow-state>");
    expect(parts[0].synthetic).toBe(true);
    expect(parts[1]).toEqual(ordinary);
  });

  it("inject-workflow-state.js skips injection when the prompt contains the default skip keyword", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [
      createUserTextPart("no-trellis what does this regex do"),
    ];

    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts },
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("no-trellis what does this regex do");
  });

  it("inject-workflow-state.js does not skip on 'no-trellisfoo' (word-boundary negative)", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [
      createUserTextPart("no-trellisfoo is a strange word"),
    ];

    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts },
    );

    expect(parts[0].text).toContain("<workflow-state>");
  });

  it("inject-workflow-state.js honors a custom prompt_injection.skip_keyword", async () => {
    writeFileSync(
      join(dir, ".trellis", "config.yaml"),
      ["prompt_injection:", '  skip_keyword: "off-topic"'].join("\n"),
    );
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;

    const skipped: ChatMessagePart[] = [
      createUserTextPart("off-topic question"),
    ];
    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts: skipped },
    );
    expect(skipped[0].text).toBe("off-topic question");

    const notSkipped: ChatMessagePart[] = [
      createUserTextPart(
        "no-trellis question",
        "main-session-2",
        "message-custom-keyword",
      ),
    ];
    await hooks["chat.message"](
      { sessionID: "main-session-2", agent: "build" },
      { parts: notSkipped },
    );
    expect(notSkipped[0].text).toContain("<workflow-state>");
  });

  it("inject-workflow-state.js disables the escape hatch with skip_keyword: \"\"", async () => {
    writeFileSync(
      join(dir, ".trellis", "config.yaml"),
      ["prompt_injection:", '  skip_keyword: ""'].join("\n"),
    );
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [
      createUserTextPart("no-trellis question"),
    ];

    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts },
    );

    expect(parts[0].text).toContain("<workflow-state>");
  });
});

// ---------------------------------------------------------------------------
// Issue #441 — sub-agent context injection limits
// ---------------------------------------------------------------------------

describe("opencode context injection limits (issue #441)", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTrellisProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(yaml: string): void {
    writeFileSync(join(dir, ".trellis", "config.yaml"), yaml, "utf-8");
  }

  function writeJsonlEntries(entries: Record<string, string>[]): void {
    writeFileSync(
      join(dir, ".trellis", "tasks", "demo-task", "implement.jsonl"),
      entries.map(e => JSON.stringify(e)).join("\n") + "\n",
      "utf-8",
    );
  }

  async function runImplementHook(): Promise<string> {
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");
    const hooks = (await injectSubagentContextPlugin({
      directory: dir,
      platform: "linux",
      env: {},
    })) as TaskToolHooks;
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "do the implementation",
      },
    };
    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );
    return output.args.prompt ?? "";
  }

  describe("truncateUtf8", () => {
    it("leaves data untouched when cap is 0 (unlimited)", () => {
      const data = Buffer.from("X".repeat(1000));
      expect(truncateUtf8(data, 0)).toEqual(data);
    });

    it("leaves data untouched when data is at or under the cap", () => {
      const data = Buffer.from("hello world");
      expect(truncateUtf8(data, data.length)).toEqual(data);
      expect(truncateUtf8(data, data.length + 5)).toEqual(data);
    });

    it("truncates ASCII data exactly at the cap (1 byte over cap)", () => {
      const data = Buffer.from("abcdefghij"); // 10 bytes
      expect(truncateUtf8(data, 9)).toEqual(Buffer.from("abcdefghi"));
    });

    it("never splits a 2-byte UTF-8 sequence at the boundary (café)", () => {
      const data = Buffer.from("café", "utf-8");
      for (let cap = 0; cap <= data.length; cap++) {
        // Buffer#toString replaces invalid sequences with U+FFFD; a correct
        // cut never produces one.
        expect(truncateUtf8(data, cap).toString("utf-8")).not.toContain("�");
      }
      expect(truncateUtf8(data, 4).toString("utf-8")).toBe("caf");
    });

    it("never splits a 3-byte UTF-8 sequence at the boundary (euro sign)", () => {
      const data = Buffer.from("x€", "utf-8"); // x + 3-byte euro sign
      for (let cap = 0; cap <= data.length; cap++) {
        expect(truncateUtf8(data, cap).toString("utf-8")).not.toContain("�");
      }
    });
  });

  describe("readContextInjectionLimits", () => {
    it("returns built-in defaults when config.yaml is absent", () => {
      expect(readContextInjectionLimits(dir)).toEqual({
        max_file_bytes: 32768,
        max_artifact_bytes: 65536,
        max_total_bytes: 131072,
      });
    });

    it("returns built-in defaults when config.yaml has no context_injection section", () => {
      writeConfig("session_auto_commit: true\n");
      expect(readContextInjectionLimits(dir)).toEqual({
        max_file_bytes: 32768,
        max_artifact_bytes: 65536,
        max_total_bytes: 131072,
      });
    });

    it("applies explicit overrides for all three keys", () => {
      writeConfig(
        [
          "context_injection:",
          "  max_file_bytes: 100",
          "  max_artifact_bytes: 200",
          "  max_total_bytes: 300",
        ].join("\n"),
      );
      expect(readContextInjectionLimits(dir)).toEqual({
        max_file_bytes: 100,
        max_artifact_bytes: 200,
        max_total_bytes: 300,
      });
    });

    it("0 means unlimited and is preserved as-is (not replaced by default)", () => {
      writeConfig(["context_injection:", "  max_total_bytes: 0"].join("\n"));
      expect(readContextInjectionLimits(dir).max_total_bytes).toBe(0);
    });

    it("falls back to default for a negative value", () => {
      writeConfig(["context_injection:", "  max_file_bytes: -5"].join("\n"));
      expect(readContextInjectionLimits(dir).max_file_bytes).toBe(32768);
    });

    it("falls back to default for a non-integer value", () => {
      writeConfig(
        ["context_injection:", "  max_artifact_bytes: not-a-number"].join("\n"),
      );
      expect(readContextInjectionLimits(dir).max_artifact_bytes).toBe(65536);
    });
  });

  describe("inject-subagent-context plugin", () => {
    it("inlines under-cap content unchanged with no notices (golden)", async () => {
      writeFileSync(join(dir, "small.md"), "small spec content\n", "utf-8");
      writeJsonlEntries([{ file: "small.md", reason: "r" }]);

      const prompt = await runImplementHook();

      expect(prompt).toContain("=== small.md ===\nsmall spec content");
      expect(prompt).toContain(
        "=== .trellis/tasks/demo-task/prd.md (Requirements) ===\n# Demo PRD",
      );
      expect(prompt).not.toContain("[Trellis: truncated");
      expect(prompt).not.toContain("[Trellis: not inlined");
    });

    it("keeps binary jsonl references as notices even when limits are unlimited", async () => {
      const binary = Buffer.from([
        0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x41, 0x42,
      ]);
      writeFileSync(join(dir, "design.png"), binary);
      writeFileSync(join(dir, "invalid.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
      writeJsonlEntries([
        { file: "design.png", reason: "visual baseline" },
        { file: "invalid.bin", reason: "legacy export" },
      ]);
      writeConfig(
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_total_bytes: 0",
        ].join("\n"),
      );

      const prompt = await runImplementHook();

      expect(prompt).toContain(
        "[Trellis: not inlined (binary file) — design.png (10 bytes): visual baseline]",
      );
      expect(prompt).toContain(
        "[Trellis: not inlined (binary file) — invalid.bin (3 bytes): legacy export]",
      );
      expect(prompt).not.toContain("=== design.png ===");
      expect(prompt).not.toContain("=== invalid.bin ===");
      expect(prompt).not.toContain("\u0000");
      expect(prompt).not.toContain("�");
    });

    it("does not misclassify legitimate multi-byte UTF-8 content as binary", async () => {
      const multiByteContent =
        "emoji: 🎉🚀 cjk: 中文测试 bmp: café naïve\n";
      writeFileSync(join(dir, "multibyte.md"), multiByteContent, "utf-8");
      writeJsonlEntries([{ file: "multibyte.md", reason: "unicode spec" }]);

      const prompt = await runImplementHook();

      expect(prompt).toContain(`=== multibyte.md ===\n${multiByteContent}`);
      expect(prompt).not.toContain("[Trellis: not inlined (binary file)");
    });

    it("classifies a file as binary when binary bytes appear only at the end", async () => {
      const mixed = Buffer.concat([
        Buffer.from("looks like a normal text file up front\n", "utf-8"),
        Buffer.from([0x00, 0xff, 0xfe]),
      ]);
      writeFileSync(join(dir, "mixed.dat"), mixed);
      writeJsonlEntries([{ file: "mixed.dat", reason: "mixed content" }]);

      const prompt = await runImplementHook();

      expect(prompt).toContain(
        `[Trellis: not inlined (binary file) — mixed.dat (${mixed.length} bytes): mixed content]`,
      );
      expect(prompt).not.toContain("=== mixed.dat ===");
    });

    it("truncates an oversized jsonl-referenced file at max_file_bytes with a notice", async () => {
      writeFileSync(join(dir, "big.txt"), "A".repeat(2 * 1024 * 1024), "utf-8");
      writeJsonlEntries([{ file: "big.txt", reason: "big" }]);

      const prompt = await runImplementHook();

      expect(Buffer.byteLength(prompt, "utf-8")).toBeLessThanOrEqual(
        128 * 1024 + 4096, // total cap + slack for the prompt template/notices
      );
      expect(prompt).toContain(
        "[Trellis: truncated at 32768 bytes — read big.txt for the full content]",
      );
    });

    it("never splits a multi-byte UTF-8 sequence at the 32768-byte cut point", async () => {
      // 32767 ASCII bytes + Chinese text: the default cap lands inside the
      // first 3-byte character and must back off, not emit mojibake.
      writeFileSync(
        join(dir, "zh.md"),
        "a".repeat(32767) + "中文内容",
        "utf-8",
      );
      writeJsonlEntries([{ file: "zh.md", reason: "zh" }]);

      const prompt = await runImplementHook();

      expect(prompt).not.toContain("�");
      expect(prompt).toContain(
        "a".repeat(32767) +
          "\n[Trellis: truncated at 32768 bytes — read zh.md for the full content]",
      );
    });

    it("truncates an oversized artifact (prd.md) at max_artifact_bytes", async () => {
      writeFileSync(
        join(dir, ".trellis", "tasks", "demo-task", "prd.md"),
        "P".repeat(100000),
        "utf-8",
      );

      const prompt = await runImplementHook();

      expect(prompt).toContain("P".repeat(65536));
      expect(prompt).not.toContain("P".repeat(65537));
      expect(prompt).toContain(
        "[Trellis: truncated at 65536 bytes — read .trellis/tasks/demo-task/prd.md for the full content]",
      );
    });

    it("degrades to an index line once the total budget is exhausted (3 files)", async () => {
      writeFileSync(join(dir, "f1.txt"), "1".repeat(50), "utf-8");
      writeFileSync(join(dir, "f2.txt"), "2".repeat(50), "utf-8");
      writeFileSync(join(dir, "f3.txt"), "3".repeat(50), "utf-8");
      writeJsonlEntries([
        { file: "f1.txt", reason: "first" },
        { file: "f2.txt", reason: "second" },
        { file: "f3.txt", reason: "third" },
      ]);
      writeConfig(
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_artifact_bytes: 0",
          "  max_total_bytes: 120", // fits f1 fully, degrades f2/f3
        ].join("\n"),
      );

      const prompt = await runImplementHook();

      expect(prompt).toContain("=== f1.txt ===\n" + "1".repeat(50));
      expect(prompt).toContain(
        "[Trellis: not inlined (total context limit reached) — f2.txt (50 bytes): second]",
      );
      expect(prompt).toContain(
        "[Trellis: not inlined (total context limit reached) — f3.txt (50 bytes): third]",
      );
      expect(prompt).not.toContain("=== f2.txt ===");
      expect(prompt).not.toContain("=== f3.txt ===");
    });

    it("honors a max_file_bytes override from .trellis/config.yaml", async () => {
      writeFileSync(join(dir, "ref.md"), "R".repeat(100), "utf-8");
      writeJsonlEntries([{ file: "ref.md", reason: "ref" }]);
      writeConfig(["context_injection:", "  max_file_bytes: 10"].join("\n"));

      const prompt = await runImplementHook();

      expect(prompt).toContain(
        "[Trellis: truncated at 10 bytes — read ref.md for the full content]",
      );
      expect(prompt).not.toContain("R".repeat(11));
    });

    it("max_file_bytes: 0 and max_total_bytes: 0 restore fully unlimited inlining", async () => {
      const bigContent = "Z".repeat(40000); // over the 32768 default file cap
      writeFileSync(join(dir, "big.txt"), bigContent, "utf-8");
      writeJsonlEntries([{ file: "big.txt", reason: "big" }]);
      writeConfig(
        [
          "context_injection:",
          "  max_file_bytes: 0",
          "  max_total_bytes: 0",
        ].join("\n"),
      );

      const prompt = await runImplementHook();

      expect(prompt).toContain("=== big.txt ===\n" + bigContent);
      expect(prompt).not.toContain("[Trellis: truncated");
      expect(prompt).not.toContain("[Trellis: not inlined");
    });

    it("invalid config values fall back to the default cap", async () => {
      writeFileSync(join(dir, "big.txt"), "A".repeat(40000), "utf-8");
      writeJsonlEntries([{ file: "big.txt", reason: "big" }]);
      writeConfig(
        ["context_injection:", "  max_file_bytes: not-a-number"].join("\n"),
      );

      const prompt = await runImplementHook();

      expect(prompt).toContain(
        "[Trellis: truncated at 32768 bytes — read big.txt for the full content]",
      );
    });

    it("directory entries respect the per-file cap and only inline .md files", async () => {
      mkdirSync(join(dir, "refdir"), { recursive: true });
      writeFileSync(join(dir, "refdir", "a.md"), "A".repeat(1000), "utf-8");
      writeFileSync(join(dir, "refdir", "b.md"), "B".repeat(1000), "utf-8");
      writeFileSync(join(dir, "refdir", "c.txt"), "IGNORED_TXT_CONTENT", "utf-8");
      writeJsonlEntries([
        { file: "refdir/", type: "directory", reason: "reference dir" },
      ]);
      writeConfig(
        [
          "context_injection:",
          "  max_file_bytes: 10",
          "  max_total_bytes: 0",
        ].join("\n"),
      );

      const prompt = await runImplementHook();

      expect(prompt).toContain(
        "[Trellis: truncated at 10 bytes — read refdir/a.md for the full content]",
      );
      expect(prompt).toContain(
        "[Trellis: truncated at 10 bytes — read refdir/b.md for the full content]",
      );
      expect(prompt).not.toContain("IGNORED_TXT_CONTENT");
    });
  });
});
