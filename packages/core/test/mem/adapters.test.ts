/**
 * Fixture-based tests for the persisted-session adapters.
 *
 * The adapters derive session-store paths from `os.homedir()` at module-load
 * time (`internal/paths.ts`), so `node:os` is mocked via `vi.hoisted` to point
 * `homedir()` at a per-suite tmpdir before any mem module resolves.
 *
 * Migrated from the CLI `mem-platforms` suite when the adapters moved into
 * `@mindfoldhq/trellis-core/mem`.
 */

import {
  describe,
  it,
  expect,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

const { fakeHome, snapshotTestState } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const f = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const o = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const fakeHome = f.mkdtempSync(p.join(o.tmpdir(), "trellis-mem-home-"));
  return {
    fakeHome,
    snapshotTestState: {
      unstablePath: null as string | null,
      mainDbStatReads: 0,
    },
  };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => fakeHome };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      const stat = actual.statSync(...args);
      if (String(args[0]) !== snapshotTestState.unstablePath) return stat;
      snapshotTestState.mainDbStatReads += 1;
      if (snapshotTestState.mainDbStatReads % 2 !== 0) return stat;

      const changed = Object.create(stat) as typeof stat;
      Object.defineProperty(changed, "mtimeMs", {
        value: stat.mtimeMs + snapshotTestState.mainDbStatReads,
      });
      return changed;
    },
  };
});

const { claudeListSessions, claudeExtractDialogue, claudeSearch } =
  await import("../../src/mem/adapters/claude.js");
const { claudeProjectDirFromCwd } =
  await import("../../src/mem/internal/paths.js");
const { codexListSessions, codexExtractDialogue, codexSearch } =
  await import("../../src/mem/adapters/codex.js");
const {
  grokListSessions,
  grokExtractDialogue,
  grokSearch,
  collectGrokTurnsAndEvents,
} = await import("../../src/mem/adapters/grok.js");
const {
  opencodeListSessions,
  opencodeExtractDialogue,
  opencodeSearch,
  prepareOpencodeSessionStore,
  releaseOpencodeSessionStore,
} = await import("../../src/mem/adapters/opencode.js");
const { opencodeDataDir, opencodeDbPath, HOME } =
  await import("../../src/mem/internal/paths.js");
const { piListSessions, piExtractDialogue, piSearch } =
  await import("../../src/mem/adapters/pi.js");
const {
  zcodeListSessions,
  zcodeExtractDialogue,
  zcodeSearch,
  collectZcodeTurnsAndEvents,
} = await import("../../src/mem/adapters/zcode.js");
const { ZCODE_DB } = await import("../../src/mem/internal/paths.js");

import type { MemFilter, MemSessionInfo } from "../../src/mem/types.js";

/** Minimal global-scope filter; overrides merge in. */
function mkFilter(overrides: Partial<MemFilter> = {}): MemFilter {
  return { platform: "all", limit: 50, cwd: undefined, ...overrides };
}

// =============================================================================
// shared fixture helpers
// =============================================================================

const CLAUDE_PROJECTS = nodePath.join(fakeHome, ".claude", "projects");
const CODEX_SESSIONS = nodePath.join(fakeHome, ".codex", "sessions");
const GROK_SESSIONS = nodePath.join(fakeHome, ".grok", "sessions");
const PI_SESSIONS = nodePath.join(fakeHome, ".pi", "agent", "sessions");

function writeJsonl(file: string, lines: readonly unknown[]): void {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(
    file,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

function writeJson(file: string, obj: unknown): void {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(file, JSON.stringify(obj));
}

function rimraf(p: string): void {
  nodeFs.rmSync(p, { recursive: true, force: true });
}

afterAll(() => {
  rimraf(fakeHome);
});

// =============================================================================
// claudeProjectDirFromCwd — cwd → on-disk dir-name sanitization
//
// Claude replaces every path separator (`/` and Windows `\`), drive colon
// (`:`), `_`, and `.` with `-`. Confirmed empirically against a real
// `~/.claude/projects/` (e.g. `/Users/x/.codex/...` → `-Users-x--codex-...`,
// `snap_note` → `snap-note`). Regression guard for #300: the old `/[/_]/g`
// regex missed `\` and `:`, so Windows cwds resolved to a non-existent dir and
// `mem list --cwd` silently returned 0.
// =============================================================================

describe("claudeProjectDirFromCwd", () => {
  const dirName = (cwd: string): string =>
    nodePath.basename(claudeProjectDirFromCwd(cwd));

  it("sanitizes a POSIX cwd (separators + underscore)", () => {
    expect(dirName("/Users/me/workspace/snap_note")).toBe(
      "-Users-me-workspace-snap-note",
    );
  });

  it("sanitizes a Windows backslash path", () => {
    expect(dirName("D:\\code\\2026\\myapp")).toBe("D--code-2026-myapp");
  });

  it("sanitizes a drive-letter colon", () => {
    expect(dirName("C:\\Users\\me\\repo")).toBe("C--Users-me-repo");
  });

  it("sanitizes underscore and dot in a Windows path", () => {
    expect(dirName("D:\\code\\my_app\\.trellis")).toBe(
      "D--code-my-app--trellis",
    );
  });

  it("sanitizes mixed forward/back separators", () => {
    expect(dirName("D:/code\\2026/my_app")).toBe("D--code-2026-my-app");
  });
});

// =============================================================================
// Claude Code adapter
// =============================================================================

describe("claudeListSessions / claudeExtractDialogue", () => {
  const projectCwd = "/tmp/test-project";
  const encodedCwd = projectCwd.replace(/[/\\:_.]/g, "-");
  const projectDir = nodePath.join(CLAUDE_PROJECTS, encodedCwd);
  const sessionId = "11111111-1111-1111-1111-111111111111";
  const sessionFile = nodePath.join(projectDir, `${sessionId}.jsonl`);

  beforeEach(() => {
    nodeFs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    rimraf(CLAUDE_PROJECTS);
  });

  it("returns no sessions when ~/.claude/projects/ doesn't exist", () => {
    rimraf(CLAUDE_PROJECTS);
    expect(claudeListSessions(mkFilter())).toEqual([]);
  });

  it("lists a session and reads cwd/timestamp from the first event when index is missing", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "hello" },
      },
    ]);
    const found = claudeListSessions(mkFilter()).find(
      (s) => s.id === sessionId,
    );
    expect(found).toBeDefined();
    expect(found?.platform).toBe("claude");
    expect(found?.cwd).toBe(projectCwd);
    expect(found?.created).toBe("2026-04-15T10:00:00Z");
  });

  it("merges sessions-index.json metadata (title, cwd, created)", () => {
    writeJsonl(sessionFile, [
      { type: "user", message: { role: "user", content: "hi" } },
    ]);
    writeJson(nodePath.join(projectDir, "sessions-index.json"), {
      entries: [
        {
          id: sessionId,
          cwd: projectCwd,
          created: "2026-04-15T08:00:00Z",
          title: "fixed bug in foo",
        },
      ],
    });
    const found = claudeListSessions(mkFilter()).find(
      (s) => s.id === sessionId,
    );
    expect(found?.title).toBe("fixed bug in foo");
    expect(found?.cwd).toBe(projectCwd);
  });

  it("filters by --since (excludes sessions whose entire lifetime predates the window)", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-01-01T00:00:00Z",
        message: { role: "user", content: "old session" },
      },
    ]);
    const oldT = new Date("2026-01-01T00:00:00Z");
    nodeFs.utimesSync(sessionFile, oldT, oldT);
    const r = claudeListSessions(mkFilter({ since: new Date("2026-04-01") }));
    expect(r.find((s) => s.id === sessionId)).toBeUndefined();
  });

  it("scopes to --cwd by encoding cwd to the on-disk dir name", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "x" },
      },
    ]);
    const otherEncoded = "/tmp/other".replace(/[/\\:_.]/g, "-");
    const otherFile = nodePath.join(
      CLAUDE_PROJECTS,
      otherEncoded,
      "22222222-2222-2222-2222-222222222222.jsonl",
    );
    writeJsonl(otherFile, [
      {
        type: "user",
        cwd: "/tmp/other",
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "x" },
      },
    ]);
    const ids = claudeListSessions(mkFilter({ cwd: projectCwd })).map(
      (s) => s.id,
    );
    expect(ids).toContain(sessionId);
    expect(ids).not.toContain("22222222-2222-2222-2222-222222222222");
  });

  it("falls back to scanning all project dirs when the derived dir name doesn't exist (#300)", () => {
    // Simulate a future Claude naming scheme the derive fn can't reproduce: the
    // on-disk dir name is unrelated to `claudeProjectDirFromCwd(scopedCwd)`, so
    // the fast-path existsSync miss must NOT silently return 0 — the all-dirs
    // scan + per-session `sameProject(cwd, f.cwd)` filter still finds it.
    const scopedCwd = "/srv/projects/some-app";
    const mismatchedDir = nodePath.join(CLAUDE_PROJECTS, "opaque-hash-9f8e7d");
    const scopedFile = nodePath.join(
      mismatchedDir,
      "33333333-3333-3333-3333-333333333333.jsonl",
    );
    writeJsonl(scopedFile, [
      {
        type: "user",
        cwd: scopedCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "scoped session" },
      },
    ]);
    // a session in a different project must still be excluded by the scope
    const otherFile = nodePath.join(
      CLAUDE_PROJECTS,
      "another-opaque-hash",
      "44444444-4444-4444-4444-444444444444.jsonl",
    );
    writeJsonl(otherFile, [
      {
        type: "user",
        cwd: "/srv/projects/other-app",
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "other session" },
      },
    ]);

    // sanity: the derived dir really does not exist on disk
    expect(nodeFs.existsSync(claudeProjectDirFromCwd(scopedCwd))).toBe(false);

    const ids = claudeListSessions(mkFilter({ cwd: scopedCwd })).map(
      (s) => s.id,
    );
    expect(ids).toContain("33333333-3333-3333-3333-333333333333");
    expect(ids).not.toContain("44444444-4444-4444-4444-444444444444");
  });

  it("extractDialogue keeps user/assistant text turns and strips injection tags", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: {
          role: "user",
          content:
            "real question<system-reminder>secret</system-reminder> here",
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", text: "thinking aloud" },
            { type: "text", text: "real answer" },
            { type: "tool_use", input: { foo: 1 } },
          ],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "out" }],
        },
      },
    ]);
    const s = claudeListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const turns = claudeExtractDialogue(s);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ role: "user", text: "real question here" });
    expect(turns[1]).toEqual({ role: "assistant", text: "real answer" });
  });

  it("extractDialogue keeps pre-compact turns and marks the boundary", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "first turn" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "first answer" }],
        },
      },
      {
        type: "user",
        isCompactSummary: true,
        message: {
          role: "user",
          content: "summary of the previous conversation",
        },
      },
      {
        type: "user",
        message: { role: "user", content: "post-compact question" },
      },
    ]);
    const s = claudeListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const turns = claudeExtractDialogue(s);
    expect(turns.map((t) => t.kind ?? "turn")).toEqual([
      "turn",
      "turn",
      "marker",
      "turn",
    ]);
    expect(turns[0]).toEqual({ role: "user", text: "first turn" });
    expect(turns[1]).toEqual({ role: "assistant", text: "first answer" });
    expect(turns[2]?.text).toContain("[compaction boundary]");
    expect(turns[2]?.text).toContain("summary of the previous conversation");
    expect(turns[3]).toEqual({ role: "user", text: "post-compact question" });
  });

  it("the compact summary is marker content, never a searchable turn", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "we talked about widgets" },
      },
      {
        type: "user",
        isCompactSummary: true,
        message: { role: "user", content: "the user asked about widgets" },
      },
    ]);
    const s = claudeListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    // "widgets" appears in the real turn and again in the summary; only the
    // real turn may be counted, and the marker is out of the denominator.
    const hit = claudeSearch(s, "widgets");
    expect(hit.count).toBe(1);
    expect(hit.totalTurns).toBe(1);
  });

  it("drops AGENTS.md preamble turns from the user side", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: {
          role: "user",
          content: "# AGENTS.md instructions for /repo - rules go here",
        },
      },
      {
        type: "user",
        message: { role: "user", content: "actual user question" },
      },
    ]);
    const s = claudeListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    expect(claudeExtractDialogue(s).map((t) => t.text)).toEqual([
      "actual user question",
    ]);
  });

  it("returns empty turns array for a session with no parseable content", () => {
    writeJsonl(sessionFile, [
      { type: "user", cwd: projectCwd, timestamp: "2026-04-15T10:00:00Z" },
    ]);
    const s = claudeListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    expect(claudeExtractDialogue(s)).toEqual([]);
  });

  it("claudeSearch counts keyword occurrences across user + assistant turns", () => {
    writeJsonl(sessionFile, [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "memory leak in heap" },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "the memory subsystem allocates" }],
        },
      },
    ]);
    const s = claudeListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const hit = claudeSearch(s, "memory");
    expect(hit.userCount).toBe(1);
    expect(hit.asstCount).toBe(1);
    expect(hit.count).toBe(2);
  });
});

// =============================================================================
// Codex adapter
// =============================================================================

describe("codexListSessions / codexExtractDialogue", () => {
  const sessionId = "abc-codex-session";
  const projectCwd = "/tmp/codex-project";
  const fileName = `rollout-2026-04-15T10-00-00-${sessionId}.jsonl`;
  const sessionFile = nodePath.join(
    CODEX_SESSIONS,
    "2026",
    "04",
    "15",
    fileName,
  );

  beforeEach(() => {
    nodeFs.mkdirSync(nodePath.dirname(sessionFile), { recursive: true });
  });

  afterEach(() => {
    rimraf(CODEX_SESSIONS);
  });

  it("returns no sessions when ~/.codex/sessions/ doesn't exist", () => {
    rimraf(CODEX_SESSIONS);
    expect(codexListSessions(mkFilter())).toEqual([]);
  });

  it("lists sessions, picking up cwd from the first payload", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        type: "session_meta",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        type: "event_msg",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hi" }],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    expect(s?.platform).toBe("codex");
    expect(s?.cwd).toBe(projectCwd);
  });

  it("filters codex sessions by --cwd", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
    ]);
    const otherFile = nodePath.join(
      CODEX_SESSIONS,
      "2026",
      "04",
      "15",
      `rollout-2026-04-15T11-00-00-other.jsonl`,
    );
    writeJsonl(otherFile, [
      {
        timestamp: "2026-04-15T11:00:00Z",
        payload: { id: "other", cwd: "/elsewhere" },
      },
    ]);
    const ids = codexListSessions(mkFilter({ cwd: projectCwd })).map(
      (s) => s.id,
    );
    expect(ids).toContain(sessionId);
    expect(ids).not.toContain("other");
  });

  it("extractDialogue keeps user/assistant messages, drops developer/system", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "system prompt" }],
        },
      },
      {
        timestamp: "2026-04-15T10:00:02Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hello world" }],
        },
      },
      {
        timestamp: "2026-04-15T10:00:03Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "hi back" }],
        },
      },
      {
        timestamp: "2026-04-15T10:00:04Z",
        payload: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: "should be dropped" }],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    expect(codexExtractDialogue(s)).toEqual([
      { role: "user", text: "hello world" },
      { role: "assistant", text: "hi back" },
    ]);
  });

  it("extractDialogue strips injection tags from inlined preamble content", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "real question<workflow-state>x</workflow-state> trailing",
            },
          ],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    expect(codexExtractDialogue(s)).toEqual([
      { role: "user", text: "real question trailing" },
    ]);
  });

  it("extractDialogue keeps pre-compact turns and recovers what only replacement_history holds", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "pre-compact turn" }],
        },
      },
      {
        timestamp: "2026-04-15T10:00:02Z",
        type: "compacted",
        payload: {
          replacement_history: [
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "only in retained history" }],
            },
            // Already collected above — must not be duplicated.
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "pre-compact turn" }],
            },
          ],
        },
      },
      {
        timestamp: "2026-04-15T10:00:03Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "post-compact turn" }],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const turns = codexExtractDialogue(s);
    expect(turns.map((t) => t.text)).toEqual([
      "only in retained history",
      "pre-compact turn",
      turns[2]?.text ?? "",
      "post-compact turn",
    ]);
    expect(turns[2]?.kind).toBe("marker");
    expect(turns[2]?.text).toContain("[compaction boundary]");
  });

  it("a replacement_history that only repeats the pool adds no phantom turns", () => {
    const message = (text: string): Record<string, unknown> => ({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    });
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      { timestamp: "2026-04-15T10:00:01Z", payload: message("ok") },
      { timestamp: "2026-04-15T10:00:02Z", payload: message("ok") },
      {
        timestamp: "2026-04-15T10:00:03Z",
        type: "compacted",
        payload: { replacement_history: [message("ok"), message("ok")] },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const turns = codexExtractDialogue(s);
    // Two real "ok" turns survive as two; the two retained copies are dropped.
    expect(turns.filter((t) => t.kind !== "marker").map((t) => t.text)).toEqual([
      "ok",
      "ok",
    ]);
  });

  it("recovers a FINAL_ANSWER inter-agent envelope and reports encrypted ones", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        type: "response_item",
        payload: {
          type: "agent_message",
          author: "/root",
          recipient: "/root/child",
          content: [
            {
              type: "input_text",
              text: "Message Type: NEW_TASK\nTask name: /root/child\nSender: /root\nPayload:\n",
            },
            { type: "encrypted_content", encrypted_content: "gAAAAA" },
          ],
        },
      },
      {
        timestamp: "2026-04-15T10:00:02Z",
        type: "response_item",
        payload: {
          type: "agent_message",
          author: "/root/child",
          recipient: "/root",
          content: [
            {
              type: "input_text",
              text: "Message Type: FINAL_ANSWER\nTask name: /root/child\nSender: /root/child\nPayload:\nthe sub-agent's report",
            },
          ],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const warnings: { code: string; message: string }[] = [];
    const turns = codexExtractDialogue(s, warnings);
    expect(turns).toEqual([
      { role: "assistant", text: "the sub-agent's report" },
    ]);
    expect(warnings.map((w) => w.code)).toEqual(["codex-inter-agent-encrypted"]);
    expect(warnings[0]?.message).toContain("1 inter-agent message payload");
  });

  it("extractDialogue drops bootstrap (large INSTRUCTIONS) user turn", () => {
    const huge = "<INSTRUCTIONS>\n" + "x".repeat(5000) + "\n</INSTRUCTIONS>";
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: huge }],
        },
      },
      {
        timestamp: "2026-04-15T10:00:02Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "real question" }],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    expect(codexExtractDialogue(s)).toEqual([
      { role: "user", text: "real question" },
    ]);
  });

  it("codexSearch returns SearchHit with correct counts", () => {
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-04-15T10:00:00Z",
        payload: { id: sessionId, cwd: projectCwd },
      },
      {
        timestamp: "2026-04-15T10:00:01Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "memory leak in heap" }],
        },
      },
    ]);
    const s = codexListSessions(mkFilter()).find((x) => x.id === sessionId);
    expect(s).toBeDefined();
    if (!s) return;
    const hit = codexSearch(s, "memory");
    expect(hit.userCount).toBe(1);
    expect(hit.count).toBe(1);
  });
});

// =============================================================================
// Grok adapter
// =============================================================================

describe("grokListSessions / grokExtractDialogue", () => {
  const projectCwd = "/tmp/grok-project";
  const sessionId = "019f0000-grok-session";
  const sessionDir = nodePath.join(
    GROK_SESSIONS,
    encodeURIComponent(projectCwd),
    sessionId,
  );
  const chatFile = nodePath.join(sessionDir, "chat_history.jsonl");

  afterEach(() => {
    rimraf(nodePath.join(fakeHome, ".grok"));
  });

  function writeSession(events: readonly unknown[]): void {
    writeJsonl(chatFile, events);
    writeJson(nodePath.join(sessionDir, "summary.json"), {
      info: { id: sessionId, cwd: projectCwd },
      session_summary: "Grok fixture session",
      created_at: "2026-07-24T16:33:44.000Z",
      updated_at: "2026-07-24T17:34:41.000Z",
    });
  }

  function findSession(
    f: Partial<MemFilter> = {},
  ): ReturnType<typeof grokListSessions>[number] | undefined {
    return grokListSessions(mkFilter(f)).find((x) => x.id === sessionId);
  }

  it("reads id / cwd / title / timestamps from summary.json", () => {
    writeSession([{ type: "user", content: [{ type: "text", text: "hi" }] }]);
    const s = findSession();
    expect(s).toMatchObject({
      platform: "grok",
      id: sessionId,
      cwd: projectCwd,
      title: "Grok fixture session",
      created: "2026-07-24T16:33:44.000Z",
      updated: "2026-07-24T17:34:41.000Z",
      filePath: chatFile,
    });
  });

  it("scopes by cwd decoded from the project dir name", () => {
    writeSession([{ type: "user", content: [{ type: "text", text: "hi" }] }]);
    expect(findSession({ cwd: projectCwd })).toBeDefined();
    expect(findSession({ cwd: "/tmp/some-other-project" })).toBeUndefined();
  });

  it("falls back to the dir names when summary.json is missing", () => {
    writeJsonl(chatFile, [
      { type: "user", content: [{ type: "text", text: "hi" }] },
    ]);
    const s = findSession({ cwd: projectCwd });
    expect(s).toMatchObject({ id: sessionId, cwd: projectCwd });
    expect(s?.title).toBeUndefined();
  });

  it("keeps user + assistant turns and drops reasoning / tool / system noise", () => {
    writeSession([
      { type: "system", content: "you are grok" },
      { type: "user", content: [{ type: "text", text: "real question" }] },
      { type: "reasoning", summary: [], encrypted_content: "xxx" },
      { type: "assistant", content: "real answer", tool_calls: [] },
      { type: "tool_result", content: "tool output", tool_call_id: "c1" },
      { type: "backend_tool_call", kind: "x" },
    ]);
    const s = findSession();
    expect(s).toBeDefined();
    if (!s) return;
    expect(grokExtractDialogue(s)).toEqual([
      { role: "user", text: "real question" },
      { role: "assistant", text: "real answer" },
    ]);
  });

  it("drops synthetic user events that are injected context, not speech", () => {
    writeSession([
      {
        type: "user",
        synthetic_reason: "system_reminder",
        content: [{ type: "text", text: "injected reminder" }],
      },
      {
        type: "user",
        synthetic_reason: "project_instructions",
        content: [{ type: "text", text: "injected instructions" }],
      },
      {
        type: "user",
        synthetic_reason: "task_completed",
        content: [{ type: "text", text: "background task done" }],
      },
      {
        type: "user",
        prompt_index: 0,
        content: [{ type: "text", text: "what the user typed" }],
      },
    ]);
    const s = findSession();
    expect(s).toBeDefined();
    if (!s) return;
    expect(grokExtractDialogue(s)).toEqual([
      { role: "user", text: "what the user typed" },
    ]);
    expect(grokSearch(s, "injected").count).toBe(0);
  });

  it("marks a compaction boundary and says the earlier turns are unrecoverable", () => {
    writeSession([
      {
        type: "user",
        synthetic_reason: "compaction_meta",
        content: [{ type: "text", text: "summary of the earlier session" }],
      },
      { type: "user", content: [{ type: "text", text: "carry on" }] },
      { type: "assistant", content: "will do" },
    ]);
    const s = findSession();
    expect(s).toBeDefined();
    if (!s) return;
    const warnings: { code: string; message: string }[] = [];
    const turns = grokExtractDialogue(s, warnings);
    expect(turns.map((t) => t.kind ?? "turn")).toEqual([
      "marker",
      "turn",
      "turn",
    ]);
    expect(turns[0]?.text).toContain("[compaction boundary]");
    expect(turns[0]?.text).toContain("summary of the earlier session");
    expect(warnings.map((w) => w.code)).toEqual([
      "grok-compaction-unrecoverable",
    ]);
    expect(warnings[0]?.message).toContain("cannot be recovered");
    // The marker's summary text must not be searchable dialogue.
    expect(grokSearch(s, "summary of the earlier session").count).toBe(0);
    expect(grokSearch(s, "carry on").totalTurns).toBe(2);
  });

  it("recovers task.py boundaries from run_terminal_command tool calls", () => {
    writeSession([
      { type: "user", content: [{ type: "text", text: "start a task" }] },
      {
        type: "assistant",
        content: "creating",
        tool_calls: [
          {
            id: "c1",
            name: "run_terminal_command",
            arguments: JSON.stringify({
              command:
                "python3 ./.trellis/scripts/task.py create --slug grok-task",
              description: "create",
            }),
          },
        ],
      },
      {
        type: "assistant",
        content: "starting",
        tool_calls: [
          {
            id: "c2",
            name: "run_terminal_command",
            arguments: JSON.stringify({
              command:
                "python3 ./.trellis/scripts/task.py start .trellis/tasks/07-24-grok-task",
            }),
          },
        ],
      },
    ]);
    const s = findSession();
    expect(s).toBeDefined();
    if (!s) return;
    const { turns, events } = collectGrokTurnsAndEvents(s);
    expect(turns).toHaveLength(3);
    expect(events.map((e) => e.action)).toEqual(["create", "start"]);
    expect(events[0]).toMatchObject({ slug: "grok-task", turnIndex: 1 });
    expect(events[1]?.turnIndex).toBe(2);
  });

  it("ignores session dirs with no chat history", () => {
    nodeFs.mkdirSync(
      nodePath.join(GROK_SESSIONS, encodeURIComponent(projectCwd), "empty-one"),
      { recursive: true },
    );
    expect(grokListSessions(mkFilter())).toEqual([]);
  });
});

// =============================================================================
// Pi adapter
// =============================================================================

function piProjectDir(cwd: string): string {
  const safe = `--${nodePath
    .resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return nodePath.join(PI_SESSIONS, safe);
}

describe("piListSessions / piExtractDialogue", () => {
  const projectCwd = "/tmp/pi-project";
  const projectDir = piProjectDir(projectCwd);
  const sessionId = "018f0000-pi-session";
  const sessionFile = nodePath.join(
    projectDir,
    `2026-06-18_${sessionId}.jsonl`,
  );

  afterEach(() => {
    rimraf(nodePath.join(fakeHome, ".pi"));
    rimraf(nodePath.join(fakeHome, ".pi-custom-sessions"));
    rimraf(nodePath.join(fakeHome, "pi-project-settings"));
  });

  it("returns no sessions when the Pi sessions root doesn't exist", () => {
    rimraf(PI_SESSIONS);
    expect(piListSessions(mkFilter())).toEqual([]);
  });

  it("lists metadata and uses the latest session_info.name as title", () => {
    writeJsonl(sessionFile, [
      {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: "2026-06-18T10:00:00.000Z",
        cwd: projectCwd,
      },
      {
        type: "message",
        id: "u1",
        parentId: null,
        timestamp: "2026-06-18T10:00:01.000Z",
        message: { role: "user", content: "hello pi" },
      },
      {
        type: "session_info",
        id: "n1",
        parentId: "u1",
        timestamp: "2026-06-18T10:00:02.000Z",
        name: "Pi memory task",
      },
    ]);

    const found = piListSessions(mkFilter({ cwd: projectCwd })).find(
      (s) => s.id === sessionId,
    );
    expect(found).toBeDefined();
    expect(found?.platform).toBe("pi");
    expect(found?.cwd).toBe(projectCwd);
    expect(found?.created).toBe("2026-06-18T10:00:00.000Z");
    expect(found?.title).toBe("Pi memory task");
  });

  it("resolves relative global sessionDir from the Pi agent directory", () => {
    const customRoot = nodePath.join(
      fakeHome,
      ".pi",
      "agent",
      "custom-sessions",
    );
    const customFile = nodePath.join(
      customRoot,
      `2026-06-18_${sessionId}.jsonl`,
    );
    writeJson(nodePath.join(fakeHome, ".pi", "agent", "settings.json"), {
      sessionDir: "custom-sessions",
    });
    writeJsonl(customFile, [
      {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: "2026-06-18T10:00:00.000Z",
        cwd: projectCwd,
      },
      {
        type: "message",
        id: "u1",
        parentId: null,
        timestamp: "2026-06-18T10:00:01.000Z",
        message: { role: "user", content: "custom root" },
      },
    ]);

    const found = piListSessions(mkFilter({ cwd: projectCwd })).find(
      (s) => s.id === sessionId,
    );
    expect(found?.filePath).toBe(customFile);
  });

  it("lists sessions from project-local Pi settings", () => {
    const localCwd = nodePath.join(fakeHome, "pi-project-settings");
    const customRoot = nodePath.join(localCwd, ".pi", "custom-sessions");
    const customFile = nodePath.join(
      customRoot,
      `2026-06-18_${sessionId}.jsonl`,
    );
    writeJson(nodePath.join(localCwd, ".pi", "settings.json"), {
      sessionDir: "custom-sessions",
    });
    writeJsonl(customFile, [
      {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: "2026-06-18T10:00:00.000Z",
        cwd: localCwd,
      },
      {
        type: "message",
        id: "u1",
        parentId: null,
        timestamp: "2026-06-18T10:00:01.000Z",
        message: { role: "user", content: "project-local root" },
      },
    ]);

    const found = piListSessions(mkFilter({ cwd: localCwd })).find(
      (s) => s.id === sessionId,
    );
    expect(found?.filePath).toBe(customFile);
  });

  it("extractDialogue keeps cleaned user/assistant text and drops tools, output, thinking, and images", () => {
    writeJsonl(sessionFile, [
      {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: "2026-06-18T10:00:00.000Z",
        cwd: projectCwd,
      },
      {
        type: "message",
        id: "u1",
        parentId: null,
        timestamp: "2026-06-18T10:00:01.000Z",
        message: {
          role: "user",
          content: [
            { type: "text", text: "real question<workflow>x</workflow>" },
            { type: "image", data: "base64", mimeType: "image/png" },
          ],
        },
      },
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-06-18T10:00:02.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "hidden" },
            { type: "text", text: "real answer" },
            {
              type: "toolCall",
              name: "bash",
              arguments: { command: "echo x" },
            },
          ],
        },
      },
      {
        type: "message",
        id: "b1",
        parentId: "a1",
        timestamp: "2026-06-18T10:00:03.000Z",
        message: {
          role: "bashExecution",
          command: "echo x",
          output: "secret output",
        },
      },
      {
        type: "message",
        id: "t1",
        parentId: "b1",
        timestamp: "2026-06-18T10:00:04.000Z",
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "tool result" }],
        },
      },
    ]);

    const s = piListSessions(mkFilter({ cwd: projectCwd })).find(
      (x) => x.id === sessionId,
    );
    expect(s).toBeDefined();
    if (!s) return;
    expect(piExtractDialogue(s)).toEqual([
      { role: "user", text: "real question" },
      { role: "assistant", text: "real answer" },
    ]);
  });

  it("extractDialogue follows only the active branch and excludes abandoned branch text", () => {
    writeJsonl(sessionFile, [
      {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: "2026-06-18T10:00:00.000Z",
        cwd: projectCwd,
      },
      {
        type: "message",
        id: "root",
        parentId: null,
        timestamp: "2026-06-18T10:00:01.000Z",
        message: { role: "user", content: "root prompt" },
      },
      {
        type: "message",
        id: "abandoned",
        parentId: "root",
        timestamp: "2026-06-18T10:00:02.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "abandoned-only text" }],
        },
      },
      {
        type: "branch_summary",
        id: "summary",
        parentId: "root",
        timestamp: "2026-06-18T10:00:03.000Z",
        fromId: "abandoned",
        summary: "summary of abandoned branch",
      },
      {
        type: "message",
        id: "active",
        parentId: "summary",
        timestamp: "2026-06-18T10:00:04.000Z",
        message: { role: "user", content: "active branch" },
      },
    ]);

    const s = piListSessions(mkFilter({ cwd: projectCwd })).find(
      (x) => x.id === sessionId,
    );
    expect(s).toBeDefined();
    if (!s) return;
    expect(piExtractDialogue(s).map((t) => t.text)).toEqual([
      "root prompt",
      "[branch summary]\nsummary of abandoned branch",
      "active branch",
    ]);
    expect(piSearch(s, "abandoned-only").count).toBe(0);
  });

  it("compaction keeps the whole active branch and marks the boundary in place", () => {
    writeJsonl(sessionFile, [
      {
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: "2026-06-18T10:00:00.000Z",
        cwd: projectCwd,
      },
      {
        type: "message",
        id: "drop",
        parentId: null,
        timestamp: "2026-06-18T10:00:01.000Z",
        message: { role: "user", content: "discarded pre compact secret" },
      },
      {
        type: "message",
        id: "keep",
        parentId: "drop",
        timestamp: "2026-06-18T10:00:02.000Z",
        message: { role: "user", content: "kept context" },
      },
      {
        type: "compaction",
        id: "compact",
        parentId: "keep",
        timestamp: "2026-06-18T10:00:03.000Z",
        summary: "compact summary",
        firstKeptEntryId: "keep",
        tokensBefore: 100,
      },
      {
        type: "message",
        id: "after",
        parentId: "compact",
        timestamp: "2026-06-18T10:00:04.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "post compact answer" }],
        },
      },
    ]);

    const s = piListSessions(mkFilter({ cwd: projectCwd })).find(
      (x) => x.id === sessionId,
    );
    expect(s).toBeDefined();
    if (!s) return;
    const turns = piExtractDialogue(s);
    expect(turns.map((t) => t.text)).toEqual([
      "discarded pre compact secret",
      "kept context",
      turns[2]?.text ?? "",
      "post compact answer",
    ]);
    expect(turns[2]?.kind).toBe("marker");
    expect(turns[2]?.text).toContain("[compaction boundary]");
    expect(turns[2]?.text).toContain("compact summary");
    // Pi kept the entry on the active branch, so recall finds it again.
    expect(piSearch(s, "discarded").count).toBe(1);
  });
});

// =============================================================================
// OpenCode adapter — reads `$XDG_DATA_HOME/opencode/opencode.db` (default
// `~/.local/share/opencode/`) through the zero-dependency SQLite parser.
// Fixtures are built with the system python's sqlite3 stdlib module; the block
// is skipped when no interpreter is available. No `sqlite3` binary and no
// native addon may be required, here or at runtime.
// =============================================================================

/** Detect a python launcher with the sqlite3 stdlib module. */
function findPythonForSqlite(): string[] | null {
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  const candidates =
    process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["-c", "import sqlite3"], { stdio: "ignore" });
      return [cmd];
    } catch {
      /* next */
    }
  }
  return null;
}

const SQLITE_PY = findPythonForSqlite();

/** Run a python program from a temp file (avoids `-c` quoting limits). */
function runPython(script: string): void {
  const pyCmd = SQLITE_PY?.[0];
  if (!pyCmd) throw new Error("python unavailable");
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  const pyDir = nodeFs.mkdtempSync(nodePath.join(fakeHome, "py-oc-"));
  const pyFile = nodePath.join(pyDir, "fixture.py");
  nodeFs.writeFileSync(pyFile, script);
  try {
    execFileSync(pyCmd, [pyFile], {
      stdio: "ignore",
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    nodeFs.rmSync(pyDir, { recursive: true, force: true });
  }
}

const OPENCODE_DB = nodePath.join(
  fakeHome,
  ".local",
  "share",
  "opencode",
  "opencode.db",
);

interface OpencodeFixture {
  sessions?: {
    id: string;
    parent_id?: string | null;
    title?: string;
    directory?: string;
    time_created?: number;
    time_updated?: number;
  }[];
  messages?: {
    id: string;
    session_id: string;
    time_created: number;
    role: string;
  }[];
  parts?: {
    message_id: string;
    session_id?: string;
    time_created: number;
    data: Record<string, unknown>;
    /** Raw text written verbatim into `part.data`, bypassing JSON encoding. */
    rawData?: string;
  }[];
  /** Column name used for the session's workspace directory. */
  cwdColumn?: string;
  /** Omit `part.session_id` to exercise the older/narrower schema. */
  omitPartSessionId?: boolean;
  /** Commit these rows to the WAL only, leaving the main file behind. */
  walSessions?: { id: string; title?: string; directory?: string }[];
  dbPath?: string;
}

/** Build an OpenCode-shaped SQLite db. Columns mirror the live 1.18 store,
 * narrowed to what the adapter reads. */
function buildOpencodeDb(spec: OpencodeFixture): void {
  const dbPath = spec.dbPath ?? OPENCODE_DB;
  const cwdColumn = spec.cwdColumn ?? "directory";
  nodeFs.mkdirSync(nodePath.dirname(dbPath), { recursive: true });
  const partColumns = spec.omitPartSessionId
    ? "id TEXT PRIMARY KEY, message_id TEXT, time_created INTEGER, data TEXT"
    : "id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT";
  const useWal = (spec.walSessions?.length ?? 0) > 0;
  runPython(`
import sqlite3, json, os
db_path = ${JSON.stringify(dbPath)}
for suffix in ("", "-wal", "-shm"):
    if os.path.exists(db_path + suffix):
        os.remove(db_path + suffix)
db = sqlite3.connect(db_path)
${useWal ? 'db.execute("PRAGMA journal_mode=WAL")\ndb.execute("PRAGMA wal_autocheckpoint=0")' : ""}
db.execute("CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, ${cwdColumn} TEXT, time_created INTEGER, time_updated INTEGER)")
db.execute("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT)")
db.execute("CREATE TABLE part (${partColumns})")
spec = json.loads(${JSON.stringify(JSON.stringify(spec))})
message_sessions = {m["id"]: m["session_id"] for m in spec.get("messages", [])}
for s in spec.get("sessions", []):
    db.execute(
        "INSERT INTO session (id,parent_id,title,${cwdColumn},time_created,time_updated) VALUES (?,?,?,?,?,?)",
        (s["id"], s.get("parent_id"), s.get("title"), s.get("directory"),
         s.get("time_created", 1000), s.get("time_updated", 2000)))
for m in spec.get("messages", []):
    db.execute(
        "INSERT INTO message (id,session_id,time_created,time_updated,data) VALUES (?,?,?,?,?)",
        (m["id"], m["session_id"], m["time_created"], m["time_created"],
         json.dumps({"role": m["role"]})))
for i, p in enumerate(spec.get("parts", [])):
    data = p["rawData"] if "rawData" in p else json.dumps(p["data"])
    if ${spec.omitPartSessionId ? "True" : "False"}:
        db.execute("INSERT INTO part (id,message_id,time_created,data) VALUES (?,?,?,?)",
                   (f"prt_{i}", p["message_id"], p["time_created"], data))
    else:
        session_id = p.get("session_id") or message_sessions.get(p["message_id"], "")
        db.execute("INSERT INTO part (id,message_id,session_id,time_created,data) VALUES (?,?,?,?,?)",
                   (f"prt_{i}", p["message_id"], session_id, p["time_created"], data))
db.commit()
for s in spec.get("walSessions", []):
    db.execute(
        "INSERT INTO session (id,parent_id,title,${cwdColumn},time_created,time_updated) VALUES (?,?,?,?,?,?)",
        (s["id"], None, s.get("title"), s.get("directory"), 5000, 6000))
db.commit()
${
  useWal
    ? "# Skip db.close(): python checkpoints the WAL on close, which would fold\n# these rows into the main file and defeat the WAL-visibility assertion.\nos._exit(0)"
    : "db.close()"
}
`);
}

function rimrafOpencodeDb(): void {
  nodeFs.rmSync(nodePath.join(fakeHome, ".local"), {
    recursive: true,
    force: true,
  });
}

function ocSession(
  id: string,
  overrides: Partial<MemSessionInfo> = {},
): MemSessionInfo {
  return {
    platform: "opencode",
    id,
    filePath: OPENCODE_DB,
    ...overrides,
  };
}

describe.skipIf(!SQLITE_PY)("opencode adapter", () => {
  const savedEnv = {
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    OPENCODE_DB: process.env.OPENCODE_DB,
  };

  beforeEach(() => {
    // The default data root must be `<home>/.local/share/opencode`; a stray
    // XDG_DATA_HOME in the developer's shell would otherwise redirect it.
    delete process.env.XDG_DATA_HOME;
    delete process.env.OPENCODE_DB;
    rimrafOpencodeDb();
  });

  afterEach(() => {
    releaseOpencodeSessionStore();
    rimrafOpencodeDb();
    if (savedEnv.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = savedEnv.XDG_DATA_HOME;
    if (savedEnv.OPENCODE_DB === undefined) delete process.env.OPENCODE_DB;
    else process.env.OPENCODE_DB = savedEnv.OPENCODE_DB;
  });

  // ---------- path resolution ----------

  it("defaults the data dir to <home>/.local/share/opencode on every platform", () => {
    expect(opencodeDataDir()).toBe(
      nodePath.join(fakeHome, ".local", "share", "opencode"),
    );
  });

  it("honours XDG_DATA_HOME", () => {
    process.env.XDG_DATA_HOME = nodePath.join(fakeHome, "xdg-data");
    expect(opencodeDataDir()).toBe(
      nodePath.join(fakeHome, "xdg-data", "opencode"),
    );
  });

  it("resolves nothing when this machine has no OpenCode store", () => {
    expect(opencodeDbPath()).toBeUndefined();
    const warnings: { code: string; message: string }[] = [];
    expect(opencodeListSessions(mkFilter(), warnings)).toEqual([]);
    // Missing storage is a normal empty result, not a degradation.
    expect(warnings).toEqual([]);
  });

  it("resolves OPENCODE_DB as an absolute path, a relative name, or :memory:", () => {
    const absolute = nodePath.join(fakeHome, "elsewhere", "custom.db");
    process.env.OPENCODE_DB = absolute;
    expect(opencodeDbPath()).toBe(absolute);

    process.env.OPENCODE_DB = "custom.db";
    expect(opencodeDbPath()).toBe(
      nodePath.join(opencodeDataDir(), "custom.db"),
    );

    // `:memory:` is a real OpenCode setting; there is no file to read.
    process.env.OPENCODE_DB = ":memory:";
    expect(opencodeDbPath()).toBeUndefined();
    expect(opencodeListSessions(mkFilter())).toEqual([]);

    // `~/...` must expand like the other overrides in this file (Pi does),
    // not be joined under the data dir as a literal relative name.
    process.env.OPENCODE_DB = "~/elsewhere/custom.db";
    expect(opencodeDbPath()).toBe(
      nodePath.join(HOME, "elsewhere", "custom.db"),
    );
  });

  it("falls back to the newest opencode-<channel>.db when opencode.db is absent", () => {
    const dir = opencodeDataDir();
    const channelDb = nodePath.join(dir, "opencode-dev.db");
    buildOpencodeDb({
      dbPath: channelDb,
      sessions: [{ id: "ses_dev", directory: "/proj/dev" }],
    });
    expect(opencodeDbPath()).toBe(channelDb);
    const rows = opencodeListSessions(mkFilter({ cwd: undefined }));
    expect(rows.map((r) => r.id)).toEqual(["ses_dev"]);
    expect(rows[0]?.filePath).toBe(channelDb);
  });

  // ---------- list ----------

  it("lists sessions with id/title/cwd/timestamps/db path/parent link", () => {
    buildOpencodeDb({
      sessions: [
        {
          id: "ses_parent",
          title: "parent chat",
          directory: "/proj/a",
          time_created: 1000,
          time_updated: 2000,
        },
        {
          id: "ses_child",
          parent_id: "ses_parent",
          title: "sub-agent run",
          directory: "/proj/a",
          time_created: 1500,
          time_updated: 1800,
        },
      ],
    });
    const rows = opencodeListSessions(mkFilter({ cwd: undefined }));
    expect(rows).toHaveLength(2);
    const parent = rows.find((r) => r.id === "ses_parent");
    expect(parent).toEqual({
      platform: "opencode",
      id: "ses_parent",
      title: "parent chat",
      cwd: "/proj/a",
      created: new Date(1000).toISOString(),
      updated: new Date(2000).toISOString(),
      filePath: OPENCODE_DB,
    });
    // parent_id survives so `--include-children` can merge sub-agent chains.
    expect(rows.find((r) => r.id === "ses_child")?.parent_id).toBe(
      "ses_parent",
    );
  });

  it("filters by --cwd and accepts `cwd` as a `directory` alternative", () => {
    buildOpencodeDb({
      cwdColumn: "cwd",
      sessions: [
        { id: "s1", directory: "/proj/a" },
        { id: "s2", directory: "/proj/b" },
      ],
    });
    expect(
      opencodeListSessions(mkFilter({ cwd: "/proj/a" })).map((r) => r.id),
    ).toEqual(["s1"]);
  });

  it("sees sessions committed only to the WAL", () => {
    buildOpencodeDb({
      sessions: [{ id: "in_main", directory: "/proj/a" }],
      walSessions: [{ id: "in_wal", directory: "/proj/a" }],
    });
    expect(nodeFs.existsSync(OPENCODE_DB + "-wal")).toBe(true);
    const ids = opencodeListSessions(mkFilter({ cwd: undefined }))
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(["in_main", "in_wal"]);
  });

  it("never writes to the database it reads", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/proj/a" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
      ],
      parts: [
        { message_id: "m1", time_created: 10, data: { type: "text", text: "hi" } },
      ],
    });
    const before = nodeFs.readFileSync(OPENCODE_DB);
    opencodeListSessions(mkFilter({ cwd: undefined }));
    opencodeExtractDialogue(ocSession("s1"));
    opencodeSearch(ocSession("s1"), "hi");
    expect(nodeFs.readFileSync(OPENCODE_DB).equals(before)).toBe(true);
  });

  // ---------- extract ----------

  it("extracts text parts only, dropping reasoning/tool/step markers", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "why is the hook failing" },
        },
        { message_id: "m2", time_created: 20, data: { type: "step-start" } },
        {
          message_id: "m2",
          time_created: 21,
          data: { type: "reasoning", text: "internal deliberation" },
        },
        {
          message_id: "m2",
          time_created: 22,
          data: {
            type: "tool",
            tool: "bash",
            state: { input: { command: "ls -F" }, output: "a\nb\n" },
          },
        },
        {
          message_id: "m2",
          time_created: 23,
          data: { type: "text", text: "the hook times out" },
        },
      ],
    });
    const turns = opencodeExtractDialogue(ocSession("s1"));
    expect(turns).toEqual([
      { role: "user", text: "why is the hook failing" },
      { role: "assistant", text: "the hook times out" },
    ]);
  });

  it("returns only the requested session's turns", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }, { id: "s2", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s2", time_created: 20, role: "user" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "belongs to one" },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "belongs to two" },
        },
      ],
    });
    expect(opencodeExtractDialogue(ocSession("s1")).map((t) => t.text)).toEqual(
      ["belongs to one"],
    );
    expect(opencodeExtractDialogue(ocSession("s2")).map((t) => t.text)).toEqual(
      ["belongs to two"],
    );
  });

  it("selects one session's parts when `part.session_id` is absent", () => {
    buildOpencodeDb({
      omitPartSessionId: true,
      sessions: [{ id: "s1", directory: "/p" }, { id: "s2", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s2", time_created: 20, role: "user" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "narrow schema one" },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "narrow schema two" },
        },
      ],
    });
    expect(opencodeExtractDialogue(ocSession("s1")).map((t) => t.text)).toEqual(
      ["narrow schema one"],
    );
  });

  it("orders turns by time and strips injection tags", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m_late", session_id: "s1", time_created: 30, role: "user" },
        { id: "m_early", session_id: "s1", time_created: 10, role: "user" },
      ],
      parts: [
        {
          message_id: "m_late",
          time_created: 30,
          data: { type: "text", text: "second" },
        },
        {
          message_id: "m_early",
          time_created: 10,
          data: {
            type: "text",
            text: "first <system-reminder>hidden noise</system-reminder>",
          },
        },
      ],
    });
    const turns = opencodeExtractDialogue(ocSession("s1"));
    expect(turns.map((t) => t.text)).toEqual(["first", "second"]);
  });

  it("renders a compaction summary as a boundary marker and keeps the summarized turns", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m_old", session_id: "s1", time_created: 10, role: "user" },
        { id: "m_marker", session_id: "s1", time_created: 20, role: "assistant" },
        { id: "m_summary", session_id: "s1", time_created: 30, role: "assistant" },
        { id: "m_after", session_id: "s1", time_created: 40, role: "user" },
      ],
      parts: [
        {
          message_id: "m_old",
          time_created: 10,
          data: { type: "text", text: "old-secret should survive" },
        },
        {
          message_id: "m_marker",
          time_created: 20,
          data: {
            type: "compaction",
            replace: true,
            summaryMessageId: "m_summary",
          },
        },
        {
          message_id: "m_summary",
          time_created: 30,
          data: { type: "text", text: "summary of earlier work" },
        },
        {
          message_id: "m_summary",
          time_created: 31,
          data: { type: "compaction", tail_start_id: "m_old" },
        },
        {
          message_id: "m_after",
          time_created: 40,
          data: { type: "text", text: "after compact" },
        },
      ],
    });
    const session = ocSession("s1");
    const turns = opencodeExtractDialogue(session);
    expect(turns).toHaveLength(3);
    expect(turns[1]?.kind).toBe("marker");
    expect(turns[1]?.text).toContain("[compaction boundary]");
    expect(turns[1]?.text).toContain("summary of earlier work");
    // The summarized rows are still in the database, so recall finds them and
    // the marker stays out of the search denominator.
    expect(opencodeSearch(session, "old-secret").count).toBe(1);
    expect(opencodeSearch(session, "old-secret").totalTurns).toBe(2);
  });

  it("skips rows whose `data` JSON is malformed or hostile", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "user" },
      ],
      parts: [
        { message_id: "m1", time_created: 10, data: {}, rawData: "{not json" },
        {
          message_id: "m1",
          time_created: 11,
          data: {},
          rawData: '["array","not","object"]',
        },
        {
          message_id: "m1",
          time_created: 12,
          data: {},
          rawData: '{"__proto__": {"polluted": true}, "type": "text", "text": "still parsed"}',
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "healthy row" },
        },
      ],
    });
    const turns = opencodeExtractDialogue(ocSession("s1"));
    expect(turns.map((t) => t.text)).toEqual(["still parsed", "healthy row"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("degrades an out-of-range timestamp to no timestamp instead of throwing", () => {
    // new Date(9e15).toISOString() throws RangeError; a hostile time_created
    // must cost that session its timestamp, not fail the whole command.
    buildOpencodeDb({
      sessions: [
        { id: "s_bad", directory: "/p", time_created: 9e15, time_updated: 9e15 },
        { id: "s_ok", directory: "/p", time_created: 1000, time_updated: 2000 },
      ],
    });
    const rows = opencodeListSessions(mkFilter({ cwd: undefined }));
    expect(rows.map((r) => r.id).sort()).toEqual(["s_bad", "s_ok"]);
    const bad = rows.find((r) => r.id === "s_bad");
    expect(bad?.created).toBeUndefined();
  });

  it("search counts user/assistant occurrences", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "find the hook bug" },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "the hook is here" },
        },
      ],
    });
    const hit = opencodeSearch(ocSession("s1"), "hook");
    expect(hit.count).toBeGreaterThanOrEqual(2);
    expect(hit.userCount).toBe(1);
    expect(hit.asstCount).toBe(1);
  });

  it("serves sessions from a prepared search store and forgets it on release", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "stored once" },
        },
      ],
    });
    prepareOpencodeSessionStore(OPENCODE_DB);
    // Deleting the file proves the prepared store, not a re-read, served this.
    nodeFs.rmSync(OPENCODE_DB, { force: true });
    expect(opencodeExtractDialogue(ocSession("s1")).map((t) => t.text)).toEqual(
      ["stored once"],
    );
    releaseOpencodeSessionStore();
    expect(opencodeExtractDialogue(ocSession("s1"))).toEqual([]);
  });

  // ---------- degradation ----------

  it("warns once with opencode-db-unreadable when the file is not a database", () => {
    nodeFs.mkdirSync(nodePath.dirname(OPENCODE_DB), { recursive: true });
    nodeFs.writeFileSync(OPENCODE_DB, "not a sqlite file");
    const warnings: { code: string; message: string }[] = [];
    expect(opencodeListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    expect(opencodeExtractDialogue(ocSession("anything"), warnings)).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("opencode-db-unreadable");
  });

  it("warns with opencode-db-schema-unsupported when a required table is gone", () => {
    buildOpencodeDb({ sessions: [{ id: "s1", directory: "/p" }] });
    runPython(
      `import sqlite3\ndb = sqlite3.connect(${JSON.stringify(OPENCODE_DB)})\ndb.execute("DROP TABLE session")\ndb.commit()\ndb.close()\n`,
    );
    const warnings: { code: string; message: string }[] = [];
    expect(opencodeListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    expect(warnings[0]?.code).toBe("opencode-db-schema-unsupported");
    expect(warnings[0]?.message).toContain("session");
  });

  it("warns with opencode-db-schema-unsupported when no known cwd column exists", () => {
    buildOpencodeDb({
      cwdColumn: "workspace_path",
      sessions: [{ id: "s1", directory: "/p" }],
    });
    const warnings: { code: string; message: string }[] = [];
    expect(opencodeListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    expect(warnings[0]?.code).toBe("opencode-db-schema-unsupported");
    expect(warnings[0]?.message).toContain("directory / cwd");
  });

  it("fails closed with a retry warning when the snapshot stays unstable", () => {
    buildOpencodeDb({ sessions: [{ id: "s1", directory: "/p" }] });
    try {
      snapshotTestState.unstablePath = OPENCODE_DB;
      snapshotTestState.mainDbStatReads = 0;
      const warnings: { code: string; message: string }[] = [];
      expect(
        opencodeListSessions(mkFilter({ cwd: undefined }), warnings),
      ).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.code).toBe("opencode-db-snapshot-unstable");
    } finally {
      snapshotTestState.unstablePath = null;
    }
  });

  it("returns nothing when the session's db path has been replaced", () => {
    buildOpencodeDb({
      sessions: [{ id: "s1", directory: "/p" }],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "gone" },
        },
      ],
    });
    const stale = ocSession("s1", {
      filePath: nodePath.join(fakeHome, "removed", "opencode.db"),
    });
    const warnings: { code: string; message: string }[] = [];
    expect(opencodeExtractDialogue(stale, warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

// =============================================================================
// ZCode adapter — reads from `~/.zcode/cli/db/db.sqlite` via the zero-dependency
// SQLite parser. Fixtures are built with the system python sqlite3 module; the
// whole block is skipped when no python interpreter is available so CI without
// python does not regress.
// =============================================================================

const ZCODE_PY = SQLITE_PY;

/** Build a ZCode-shaped SQLite db at ZCODE_DB with session/message/part rows.
 * Columns are kept to the subset the adapter reads. */
function buildZcodeDb(opts: {
  sessions?: {
    id: string;
    title?: string;
    directory?: string;
    time_created?: number;
    time_updated?: number;
  }[];
  messages?: {
    id: string;
    session_id: string;
    time_created: number;
    role: string;
  }[];
  parts?: {
    message_id: string;
    time_created: number;
    data: Record<string, unknown>;
  }[];
}): void {
  if (!ZCODE_PY || ZCODE_PY.length === 0) throw new Error("python unavailable");
  const pyCmd = ZCODE_PY[0];
  if (!pyCmd) throw new Error("python unavailable");
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  nodeFs.mkdirSync(nodePath.dirname(ZCODE_DB), { recursive: true });
  const payload = JSON.stringify(opts);
  const script = `
import sqlite3, json, os
os.makedirs(os.path.dirname(${JSON.stringify(ZCODE_DB)}), exist_ok=True)
if os.path.exists(${JSON.stringify(ZCODE_DB)}):
    os.remove(${JSON.stringify(ZCODE_DB)})
db = sqlite3.connect(${JSON.stringify(ZCODE_DB)})
db.execute("CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER)")
db.execute("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)")
db.execute("CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT)")
spec = json.loads(${JSON.stringify(payload)})
message_sessions = {m["id"]: m["session_id"] for m in spec.get("messages", [])}
for s in spec.get("sessions", []):
    db.execute("INSERT INTO session (id,title,directory,time_created,time_updated) VALUES (?,?,?,?,?)",
               (s["id"], s.get("title"), s.get("directory"), s.get("time_created", 1000), s.get("time_updated", 2000)))
for m in spec.get("messages", []):
    data = json.dumps({"role": m["role"]})
    db.execute("INSERT INTO message (id,session_id,time_created,data) VALUES (?,?,?,?)",
               (m["id"], m["session_id"], m["time_created"], data))
for i, p in enumerate(spec.get("parts", [])):
    pid = f"part_{i}_{p['message_id']}"
    db.execute("INSERT INTO part (id,message_id,session_id,time_created,time_updated,data) VALUES (?,?,?,?,?,?)",
               (pid, p["message_id"], message_sessions.get(p["message_id"], ""), p["time_created"], p["time_created"], json.dumps(p["data"])))
db.commit()
db.close()
`;
  execFileSync(pyCmd, ["-c", script], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function rimrafZcodeDb(): void {
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      nodeFs.rmSync(ZCODE_DB + ext, { force: true });
    } catch {
      /* ignore */
    }
  }
}

describe.skipIf(!ZCODE_PY)("zcodeListSessions / zcodeExtractDialogue", () => {
  beforeEach(() => rimrafZcodeDb());
  afterEach(() => rimrafZcodeDb());

  it("returns [] when the db is absent", () => {
    expect(zcodeListSessions(mkFilter())).toEqual([]);
  });

  it("lists sessions with id/title/cwd from the session table", () => {
    buildZcodeDb({
      sessions: [
        {
          id: "sess_a",
          title: "hello",
          directory: "/proj/a",
          time_created: 1000,
          time_updated: 2000,
        },
        {
          id: "sess_b",
          title: "world",
          directory: "/proj/b",
          time_created: 3000,
          time_updated: 4000,
        },
      ],
    });
    const rows = zcodeListSessions(mkFilter({ cwd: undefined }));
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.id === "sess_a");
    expect(a?.title).toBe("hello");
    expect(a?.cwd).toBe("/proj/a");
    expect(a?.platform).toBe("zcode");
  });

  it("filters by --cwd (sameProject)", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/proj/a", time_created: 1, time_updated: 2 },
        { id: "s2", directory: "/proj/b", time_created: 1, time_updated: 2 },
      ],
    });
    const rows = zcodeListSessions(
      mkFilter({ cwd: "/proj/a", platform: "zcode" }),
    );
    expect(rows.map((r) => r.id)).toEqual(["s1"]);
  });

  it("extracts user/assistant text from parts, skipping non-text types", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "hi there" },
        },
        {
          message_id: "m1",
          time_created: 11,
          data: { type: "reasoning", text: "ignored" },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "hello back" },
        },
      ],
    });
    const turns = zcodeExtractDialogue({
      platform: "zcode",
      id: "s1",
      filePath: ZCODE_DB,
    });
    expect(turns).toEqual([
      { role: "user", text: "hi there" },
      { role: "assistant", text: "hello back" },
    ]);
  });

  it("strips injection tags from extracted text", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: {
            type: "text",
            text: "real question<workflow-state>x</workflow-state> trailing",
          },
        },
      ],
    });
    const turns = zcodeExtractDialogue({
      platform: "zcode",
      id: "s1",
      filePath: ZCODE_DB,
    });
    expect(turns[0]?.text).toBe("real question trailing");
  });

  it("detects task.py create/start commands in Bash tool parts", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "go" },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: {
            type: "tool",
            tool: "Bash",
            state: {
              input: {
                command:
                  'py ./.trellis/scripts/task.py create "my task" --slug my-task',
              },
            },
          },
        },
        {
          message_id: "m2",
          time_created: 21,
          data: {
            type: "tool",
            tool: "Bash",
            state: {
              input: {
                command:
                  "py ./.trellis/scripts/task.py start .trellis/tasks/01-01-my-task",
              },
            },
          },
        },
      ],
    });
    const { events, turns } = collectZcodeTurnsAndEvents({
      platform: "zcode",
      id: "s1",
      filePath: ZCODE_DB,
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.action).toBe("create");
    expect(events[0]?.slug).toBe("my-task");
    expect(events[1]?.action).toBe("start");
    expect(events[1]?.taskDir).toContain("my-task");
    // turnIndex is the turn count at the time the tool ran. m1 ("go") was
    // pushed as turn 0, so both tool events on m2 (which has no text) fire at
    // turnIndex=1. This locks the ZCode turnIndex semantics documented in
    // zcode.ts (text-then-tool within a message).
    expect(events[0]?.turnIndex).toBe(1);
    expect(events[1]?.turnIndex).toBe(1);
    expect(turns).toEqual([{ role: "user", text: "go" }]);
  });

  it("drops bootstrap turns (large INSTRUCTIONS block)", () => {
    // isBootstrapTurn: >4000 chars and starts with <INSTRUCTIONS> → dropped.
    const huge = "<INSTRUCTIONS>" + "x".repeat(4500);
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: huge },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "real reply" },
        },
      ],
    });
    const turns = zcodeExtractDialogue({
      platform: "zcode",
      id: "s1",
      filePath: ZCODE_DB,
    });
    // The bootstrap user turn is dropped; only the assistant reply survives.
    expect(turns).toEqual([{ role: "assistant", text: "real reply" }]);
  });

  it("joins multiple text parts of one message with blank-line separator", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "first" },
        },
        {
          message_id: "m1",
          time_created: 11,
          data: { type: "text", text: "second" },
        },
      ],
    });
    const turns = zcodeExtractDialogue({
      platform: "zcode",
      id: "s1",
      filePath: ZCODE_DB,
    });
    expect(turns).toEqual([{ role: "assistant", text: "first\n\nsecond" }]);
  });

  it("keeps pre-compaction turns/events and marks the summary message", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m_old", session_id: "s1", time_created: 10, role: "user" },
        {
          id: "m_old_tool",
          session_id: "s1",
          time_created: 20,
          role: "assistant",
        },
        {
          id: "m_marker",
          session_id: "s1",
          time_created: 30,
          role: "assistant",
        },
        { id: "m_summary", session_id: "s1", time_created: 40, role: "user" },
        {
          id: "m_after",
          session_id: "s1",
          time_created: 50,
          role: "assistant",
        },
        {
          id: "m_after_tool",
          session_id: "s1",
          time_created: 60,
          role: "assistant",
        },
      ],
      parts: [
        {
          message_id: "m_old",
          time_created: 10,
          data: { type: "text", text: "old-secret should disappear" },
        },
        {
          message_id: "m_old_tool",
          time_created: 20,
          data: {
            type: "tool",
            tool: "Bash",
            state: {
              input: {
                command:
                  'py ./.trellis/scripts/task.py create "old task" --slug old-task',
              },
            },
          },
        },
        {
          message_id: "m_marker",
          time_created: 30,
          data: {
            type: "compaction",
            replace: true,
            summaryMessageId: "m_summary",
          },
        },
        {
          message_id: "m_summary",
          time_created: 40,
          data: { type: "text", text: "summary of earlier work" },
        },
        {
          message_id: "m_summary",
          time_created: 41,
          data: {
            type: "compaction",
            tail_start_id: "m_old_tool",
            compactBoundary: {
              keptMessageCount: 0,
              lastSummarizedMessageId: "m_old_tool",
              summaryMessageIds: ["m_summary"],
            },
          },
        },
        {
          message_id: "m_after",
          time_created: 50,
          data: { type: "text", text: "after compact retained" },
        },
        {
          message_id: "m_after_tool",
          time_created: 60,
          data: {
            type: "tool",
            tool: "Bash",
            state: {
              input: {
                command:
                  "py ./.trellis/scripts/task.py start .trellis/tasks/01-01-new-task",
              },
            },
          },
        },
      ],
    });

    const session = {
      platform: "zcode" as const,
      id: "s1",
      filePath: ZCODE_DB,
    };
    const extracted = zcodeExtractDialogue(session);
    expect(extracted.map((t) => t.text)).toEqual([
      "old-secret should disappear",
      extracted[1]?.text ?? "",
      "after compact retained",
    ]);
    expect(extracted[1]?.kind).toBe("marker");
    expect(extracted[1]?.text).toContain("[compaction boundary]");
    expect(extracted[1]?.text).toContain("summary of earlier work");
    // The summarized rows are still in the database, so recall finds them.
    expect(zcodeSearch(session, "old-secret").count).toBe(1);
    // The marker is out of the search denominator: 2 dialogue turns, not 3.
    expect(zcodeSearch(session, "old-secret").totalTurns).toBe(2);

    const { events, turns } = collectZcodeTurnsAndEvents(session);
    expect(turns).toHaveLength(3);
    // Both task.py boundaries are visible again, and their turn indices point
    // at turns that are still in the pool.
    expect(events.map((e) => e.action)).toEqual(["create", "start"]);
    expect(events[0]?.slug).toBe("old-task");
    expect(events[0]?.turnIndex).toBe(1);
    expect(events[1]?.taskDir).toContain("new-task");
    expect(events[1]?.turnIndex).toBe(3);
  });

  it("degrades to [] when the db file is corrupt", () => {
    // Write a non-SQLite file at ZCODE_DB so openSqliteReadOnly throws.
    nodeFs.mkdirSync(nodePath.dirname(ZCODE_DB), { recursive: true });
    nodeFs.writeFileSync(ZCODE_DB, "not a sqlite file");
    // list and extract both catch SqliteParseError → [] (not throw).
    const warnings: { code: string; message: string }[] = [];
    expect(zcodeListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    const turns = zcodeExtractDialogue(
      {
        platform: "zcode",
        id: "anything",
        filePath: ZCODE_DB,
      },
      warnings,
    );
    expect(turns).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("zcode-db-unreadable");
  });

  it("fails closed with a retry warning when the snapshot stays unstable", () => {
    buildZcodeDb({
      sessions: [
        {
          id: "unstable-1",
          title: "unstable",
          directory: "/project",
          time_created: 1,
          time_updated: 2,
        },
      ],
    });
    try {
      snapshotTestState.unstablePath = ZCODE_DB;
      snapshotTestState.mainDbStatReads = 0;
      const warnings: { code: string; message: string }[] = [];
      expect(zcodeListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
        [],
      );
      expect(warnings).toEqual([
        {
          code: "zcode-db-snapshot-unstable",
          message: `ZCode 正在写入，请重试。 (${ZCODE_DB})`,
        },
      ]);
    } finally {
      snapshotTestState.unstablePath = null;
    }
  });

  it("warns when the ZCode schema drops a required column", () => {
    buildZcodeDb({
      sessions: [
        {
          id: "schema-1",
          title: "schema drift",
          directory: "/project",
          time_created: 1,
          time_updated: 2,
        },
      ],
    });
    const pyCmd = ZCODE_PY && ZCODE_PY[0];
    if (!pyCmd) throw new Error("python unavailable");
    const { execFileSync } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:child_process") as typeof import("node:child_process");
    execFileSync(
      pyCmd,
      [
        "-c",
        `import sqlite3; db=sqlite3.connect(${JSON.stringify(ZCODE_DB)}); db.execute('ALTER TABLE session RENAME COLUMN directory TO project_dir'); db.commit(); db.close()`,
      ],
      { stdio: "ignore" },
    );

    const warnings: { code: string; message: string }[] = [];
    expect(zcodeListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    expect(warnings[0]?.code).toBe("zcode-db-unreadable");
    expect(warnings[0]?.message).toContain("directory");
  });

  it("excludes subagent_child sessions from list", () => {
    // The buildZcodeDb helper writes a session table without task_type; this
    // test needs that column, so build the fixture with a custom python pass.
    const { execFileSync } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:child_process") as typeof import("node:child_process");
    const pyCmd = ZCODE_PY && ZCODE_PY[0];
    if (!pyCmd) throw new Error("python unavailable");
    nodeFs.mkdirSync(nodePath.dirname(ZCODE_DB), { recursive: true });
    const script = `
import sqlite3, os
if os.path.exists(${JSON.stringify(ZCODE_DB)}):
    os.remove(${JSON.stringify(ZCODE_DB)})
db = sqlite3.connect(${JSON.stringify(ZCODE_DB)})
db.execute("CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER, task_type TEXT)")
db.execute("INSERT INTO session (id,title,directory,time_created,time_updated,task_type) VALUES (?,?,?,?,?,?)",
           ("interactive-1", "main chat", "/p", 1, 2, "interactive"))
db.execute("INSERT INTO session (id,title,directory,time_created,time_updated,task_type) VALUES (?,?,?,?,?,?)",
           ("child-1", "subagent", "/p", 1, 2, "subagent_child"))
db.commit()
db.close()
`;
    const pyDir = nodeFs.mkdtempSync(
      nodePath.join(nodePath.dirname(ZCODE_DB), "py-zc-"),
    );
    const pyFile = nodePath.join(pyDir, "b.py");
    nodeFs.writeFileSync(pyFile, script);
    try {
      execFileSync(pyCmd, [pyFile], { stdio: "ignore" });
    } finally {
      nodeFs.rmSync(pyDir, { recursive: true, force: true });
    }
    const rows = zcodeListSessions(mkFilter({ cwd: undefined }));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("interactive-1");
    expect(ids).not.toContain("child-1");
  });

  it("search counts user/assistant occurrences", () => {
    buildZcodeDb({
      sessions: [
        { id: "s1", directory: "/p", time_created: 1, time_updated: 2 },
      ],
      messages: [
        { id: "m1", session_id: "s1", time_created: 10, role: "user" },
        { id: "m2", session_id: "s1", time_created: 20, role: "assistant" },
      ],
      parts: [
        {
          message_id: "m1",
          time_created: 10,
          data: { type: "text", text: "find the hook bug" },
        },
        {
          message_id: "m2",
          time_created: 20,
          data: { type: "text", text: "the hook is here" },
        },
      ],
    });
    const hit = zcodeSearch(
      { platform: "zcode", id: "s1", filePath: ZCODE_DB },
      "hook",
    );
    expect(hit.count).toBeGreaterThanOrEqual(2);
    expect(hit.userCount).toBe(1);
    expect(hit.asstCount).toBe(1);
  });
});
