/**
 * End-to-end tests for the public `@mindfoldhq/trellis-core/mem` API against a
 * small Claude fixture tree under a mocked $HOME.
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

const { fakeHome } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const f = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const o = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const fakeHome = f.mkdtempSync(p.join(o.tmpdir(), "trellis-mem-api-"));
  return { fakeHome };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => fakeHome };
});

const {
  listMemSessions,
  searchMemSessions,
  readMemContext,
  extractMemDialogue,
  listMemProjects,
  MemSessionNotFoundError,
} = await import("../../src/mem/index.js");

const CLAUDE_PROJECTS = nodePath.join(fakeHome, ".claude", "projects");
const PI_SESSIONS = nodePath.join(fakeHome, ".pi", "agent", "sessions");
const ZCODE_DB = nodePath.join(fakeHome, ".zcode", "cli", "db", "db.sqlite");
const projectCwd = "/tmp/mem-api-project";
const projectDir = nodePath.join(
  CLAUDE_PROJECTS,
  projectCwd.replace(/[/_]/g, "-"),
);
const sessionId = "deadbeef-1234-5678-9abc-def012345678";
const sessionFile = nodePath.join(projectDir, `${sessionId}.jsonl`);

function writeJsonl(file: string, lines: readonly unknown[]): void {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(
    file,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

function piProjectDir(cwd: string): string {
  const safe = `--${nodePath
    .resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return nodePath.join(PI_SESSIONS, safe);
}

function seedPiSession(id: string, cwd: string): void {
  writeJsonl(nodePath.join(piProjectDir(cwd), `2026-06-18_${id}.jsonl`), [
    {
      type: "session",
      version: 3,
      id,
      timestamp: "2026-06-18T10:00:00.000Z",
      cwd,
    },
    {
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: "2026-06-18T10:00:01.000Z",
      message: { role: "user", content: "Pi session remembers orchards" },
    },
    {
      type: "message",
      id: "a1",
      parentId: "u1",
      timestamp: "2026-06-18T10:00:02.000Z",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Orchards are indexed from Pi." }],
      },
    },
  ]);
}

function seedPiPhaseSession(id: string, cwd: string): void {
  writeJsonl(nodePath.join(piProjectDir(cwd), `2026-06-18_${id}.jsonl`), [
    {
      type: "session",
      version: 3,
      id,
      timestamp: "2026-06-18T11:00:00.000Z",
      cwd,
    },
    {
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: "2026-06-18T11:00:01.000Z",
      message: { role: "user", content: "warmup outside" },
    },
    {
      type: "message",
      id: "a1",
      parentId: "u1",
      timestamp: "2026-06-18T11:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "pi brainstorm starts" },
          {
            type: "toolCall",
            name: "bash",
            arguments: { command: "task.py create --slug pi-api" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "u2",
      parentId: "a1",
      timestamp: "2026-06-18T11:00:03.000Z",
      message: { role: "user", content: "pi brainstorm body" },
    },
    {
      type: "message",
      id: "b1",
      parentId: "u2",
      timestamp: "2026-06-18T11:00:04.000Z",
      message: {
        role: "bashExecution",
        command: "task.py start .trellis/tasks/06-18-pi-api",
        output: "",
      },
    },
    {
      type: "message",
      id: "u3",
      parentId: "b1",
      timestamp: "2026-06-18T11:00:05.000Z",
      message: { role: "user", content: "pi implementation" },
    },
  ]);
}

function seed(): void {
  writeJsonl(sessionFile, [
    {
      type: "user",
      cwd: projectCwd,
      timestamp: "2026-04-15T10:00:00Z",
      message: { role: "user", content: "I want to debug a memory leak" },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Memory leaks usually come from unbounded caches.",
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: "great, can you find the cache in our heap dump?",
      },
    },
  ]);
}

beforeEach(() => {
  nodeFs.mkdirSync(projectDir, { recursive: true });
  seed();
});

afterEach(() => {
  nodeFs.rmSync(CLAUDE_PROJECTS, { recursive: true, force: true });
  nodeFs.rmSync(nodePath.join(fakeHome, ".pi"), {
    recursive: true,
    force: true,
  });
  nodeFs.rmSync(nodePath.join(fakeHome, ".zcode"), {
    recursive: true,
    force: true,
  });
});

afterAll(() => {
  nodeFs.rmSync(fakeHome, { recursive: true, force: true });
});

// ---------- OpenCode sub-agent fixture ----------
//
// OpenCode is the only platform with a native `parent_id`, so the
// `--include-children` merge can only be exercised end-to-end here. The
// fixture is built with the system python's sqlite3 stdlib module and the
// block skips when no interpreter is present.

function findPythonForSqlite(): string | null {
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  for (const cmd of process.platform === "win32"
    ? ["py", "python"]
    : ["python3", "python"]) {
    try {
      execFileSync(cmd, ["-c", "import sqlite3"], { stdio: "ignore" });
      return cmd;
    } catch {
      /* next */
    }
  }
  return null;
}

const SQLITE_PY = findPythonForSqlite();
const OPENCODE_DB = nodePath.join(
  fakeHome,
  ".local",
  "share",
  "opencode",
  "opencode.db",
);

/** One parent session plus one sub-agent child, each with a single user turn. */
function seedOpencodeParentChild(): void {
  if (!SQLITE_PY) throw new Error("python unavailable");
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  nodeFs.mkdirSync(nodePath.dirname(OPENCODE_DB), { recursive: true });
  const script = `
import sqlite3, json, os
db_path = ${JSON.stringify(OPENCODE_DB)}
if os.path.exists(db_path):
    os.remove(db_path)
db = sqlite3.connect(db_path)
db.execute("CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER)")
db.execute("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)")
db.execute("CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT)")
cwd = json.loads(${JSON.stringify(JSON.stringify(projectCwd))})
db.execute("INSERT INTO session VALUES ('ses_parent', NULL, 'parent', ?, 1000, 2000)", (cwd,))
db.execute("INSERT INTO session VALUES ('ses_child', 'ses_parent', 'sub-agent', ?, 1100, 1900)", (cwd,))
db.execute("INSERT INTO message VALUES ('m_parent', 'ses_parent', 1000, ?)", (json.dumps({"role": "user"}),))
db.execute("INSERT INTO message VALUES ('m_child', 'ses_child', 1100, ?)", (json.dumps({"role": "user"}),))
db.execute("INSERT INTO part VALUES ('p1', 'm_parent', 'ses_parent', 1000, ?)", (json.dumps({"type": "text", "text": "parent mentions orchards"}),))
db.execute("INSERT INTO part VALUES ('p2', 'm_child', 'ses_child', 1100, ?)", (json.dumps({"type": "text", "text": "child found the marmalade recipe"}),))
db.commit()
db.close()
`;
  const pyDir = nodeFs.mkdtempSync(nodePath.join(fakeHome, "py-api-"));
  const pyFile = nodePath.join(pyDir, "fixture.py");
  nodeFs.writeFileSync(pyFile, script);
  try {
    execFileSync(SQLITE_PY, [pyFile], { stdio: "ignore" });
  } finally {
    nodeFs.rmSync(pyDir, { recursive: true, force: true });
  }
}

describe.skipIf(!SQLITE_PY)("OpenCode sub-agent merging", () => {
  const savedXdg = process.env.XDG_DATA_HOME;
  const savedDb = process.env.OPENCODE_DB;

  beforeEach(() => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.OPENCODE_DB;
    seedOpencodeParentChild();
  });

  afterEach(() => {
    nodeFs.rmSync(nodePath.join(fakeHome, ".local"), {
      recursive: true,
      force: true,
    });
    if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = savedXdg;
    if (savedDb === undefined) delete process.env.OPENCODE_DB;
    else process.env.OPENCODE_DB = savedDb;
  });

  it("lists both sessions and exposes the parent link", () => {
    const rows = listMemSessions({
      filter: { platform: "opencode", cwd: projectCwd, limit: 50 },
    });
    expect(rows.map((s) => s.id).sort()).toEqual(["ses_child", "ses_parent"]);
    expect(rows.find((s) => s.id === "ses_child")?.parent_id).toBe(
      "ses_parent",
    );
  });

  it("without --include-children, a child-only keyword matches the child alone", () => {
    const result = searchMemSessions({
      keyword: "marmalade",
      filter: { platform: "opencode", cwd: projectCwd, limit: 50 },
    });
    expect(result.matches.map((m) => m.session.id)).toEqual(["ses_child"]);
  });

  it("with --include-children, the child's text is absorbed into the parent", () => {
    const result = searchMemSessions({
      keyword: "marmalade",
      filter: { platform: "opencode", cwd: projectCwd, limit: 50 },
      includeChildren: true,
    });
    expect(result.matches.map((m) => m.session.id)).toEqual(["ses_parent"]);
    expect(result.matches[0]?.descendantsMerged).toBe(1);
  });

  it("readMemContext merges the child's turns when asked", () => {
    const merged = readMemContext({
      sessionId: "ses_parent",
      filter: { platform: "opencode", cwd: projectCwd },
      includeChildren: true,
      turns: 10,
    });
    expect(merged.mergedChildren).toBe(1);
    expect(merged.turns.map((t) => t.text)).toEqual([
      "parent mentions orchards",
      "child found the marmalade recipe",
    ]);

    const alone = readMemContext({
      sessionId: "ses_parent",
      filter: { platform: "opencode", cwd: projectCwd },
      turns: 10,
    });
    expect(alone.turns.map((t) => t.text)).toEqual([
      "parent mentions orchards",
    ]);
  });

  it("extractMemDialogue warns but returns the full dialogue for --phase", () => {
    const result = extractMemDialogue({
      sessionId: "ses_parent",
      filter: { platform: "opencode", cwd: projectCwd },
      phase: "brainstorm",
    });
    expect(result.warnings.map((w) => w.code)).toEqual([
      "opencode-phase-unsupported",
    ]);
    expect(result.turns.map((t) => t.text)).toEqual([
      "parent mentions orchards",
    ]);
  });
});

describe("listMemSessions", () => {
  it("reports a structured warning when the ZCode database is corrupt", () => {
    nodeFs.mkdirSync(nodePath.dirname(ZCODE_DB), { recursive: true });
    nodeFs.writeFileSync(ZCODE_DB, "not sqlite");
    const warnings: { code: string; message: string }[] = [];
    const rows = listMemSessions({
      filter: { platform: "zcode", cwd: undefined },
      onWarning: (warning) => warnings.push(warning),
    });
    expect(rows).toEqual([]);
    expect(warnings.map((warning) => warning.code)).toEqual([
      "zcode-db-unreadable",
    ]);
  });

  it("lists Pi sessions through the public API", () => {
    const piId = "pi-list-session";
    seedPiSession(piId, projectCwd);
    const rows = listMemSessions({
      filter: { platform: "pi", cwd: projectCwd, limit: 50 },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: piId, platform: "pi" }),
      ]),
    );
  });

  it("lists the seeded session, cwd-scoped", () => {
    const rows = listMemSessions({
      filter: { platform: "all", cwd: projectCwd, limit: 50 },
    });
    expect(rows.find((s) => s.id === sessionId)).toBeDefined();
  });
});

describe("searchMemSessions", () => {
  it("returns a warning instead of treating a corrupt ZCode database as a clean miss", () => {
    nodeFs.mkdirSync(nodePath.dirname(ZCODE_DB), { recursive: true });
    nodeFs.writeFileSync(ZCODE_DB, "not sqlite");
    const result = searchMemSessions({
      keyword: "anything",
      filter: { platform: "zcode", cwd: undefined },
    });
    expect(result.matches).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "zcode-db-unreadable",
    ]);
  });

  it("searches Pi cleaned dialogue through the public API", () => {
    const piId = "pi-search-session";
    seedPiSession(piId, projectCwd);
    const result = searchMemSessions({
      keyword: "orchards",
      filter: { platform: "pi", cwd: projectCwd, limit: 50 },
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.session.id).toBe(piId);
    expect(result.matches[0]?.session.platform).toBe("pi");
  });

  it("returns a ranked match with hit counts and a totalMatches count", () => {
    const result = searchMemSessions({
      keyword: "memory",
      filter: { platform: "all", cwd: projectCwd, limit: 50 },
    });
    expect(result.matches.length).toBe(1);
    expect(result.totalMatches).toBe(1);
    const m = result.matches[0];
    expect(m?.session.id).toBe(sessionId);
    expect(m?.hit.count).toBeGreaterThan(0);
    expect(m?.score).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("returns no matches for an absent keyword", () => {
    const result = searchMemSessions({
      keyword: "kombucha",
      filter: { cwd: projectCwd },
    });
    expect(result.matches).toEqual([]);
    expect(result.totalMatches).toBe(0);
  });
});

describe("readMemContext", () => {
  it("returns Pi context windows through the public API", () => {
    const piId = "pi-context-session";
    seedPiSession(piId, projectCwd);
    const result = readMemContext({
      sessionId: piId,
      filter: { platform: "pi", cwd: projectCwd },
      grep: "orchards",
      turns: 1,
      around: 0,
    });
    expect(result.session.platform).toBe("pi");
    expect(result.totalTurns).toBe(2);
    expect(result.turns.some((t) => t.isHit)).toBe(true);
  });

  it("returns the matched session's turns around a grep hit", () => {
    const result = readMemContext({
      sessionId,
      filter: { cwd: projectCwd },
      grep: "memory",
      turns: 1,
      around: 0,
    });
    expect(result.session.id).toBe(sessionId);
    expect(result.turns.length).toBeGreaterThan(0);
    expect(result.turns.some((t) => t.isHit)).toBe(true);
    expect(result.totalTurns).toBe(3);
  });

  it("throws MemSessionNotFoundError for an unknown id", () => {
    expect(() =>
      readMemContext({ sessionId: "no-such-id", filter: { cwd: projectCwd } }),
    ).toThrow(MemSessionNotFoundError);
  });
});

describe("extractMemDialogue", () => {
  it("slices Pi brainstorm windows through the public API", () => {
    const piId = "pi-phase-session";
    seedPiPhaseSession(piId, projectCwd);
    const result = extractMemDialogue({
      sessionId: piId,
      filter: { platform: "pi", cwd: projectCwd },
      phase: "brainstorm",
    });
    expect(result.phase).toBe("brainstorm");
    expect(result.windows).toEqual([
      { label: "pi-api", startTurn: 1, endTurn: 3 },
    ]);
    expect(result.turns.map((t) => t.text)).toEqual([
      "pi brainstorm starts",
      "pi brainstorm body",
    ]);
  });

  it("dumps cleaned dialogue for the session", () => {
    const result = extractMemDialogue({
      sessionId,
      filter: { cwd: projectCwd },
    });
    expect(result.session.id).toBe(sessionId);
    expect(result.turns.length).toBe(3);
    expect(result.phase).toBe("all");
  });

  it("filters turns by grep after phase slicing", () => {
    const result = extractMemDialogue({
      sessionId,
      filter: { cwd: projectCwd },
      grep: "cache",
    });
    expect(
      result.turns.every((t) => t.text.toLowerCase().includes("cache")),
    ).toBe(true);
    expect(result.turns.length).toBeGreaterThan(0);
  });

  it("warns and returns full dialogue when no brainstorm boundary exists", () => {
    const result = extractMemDialogue({
      sessionId,
      filter: { cwd: projectCwd },
      phase: "brainstorm",
    });
    expect(
      result.warnings.some((w) => w.code === "no-brainstorm-boundary"),
    ).toBe(true);
    expect(result.turns.length).toBe(3);
  });

  it("throws MemSessionNotFoundError for an unknown id", () => {
    expect(() =>
      extractMemDialogue({
        sessionId: "no-such-id",
        filter: { cwd: projectCwd },
      }),
    ).toThrow(MemSessionNotFoundError);
  });
});

describe("listMemProjects", () => {
  it("aggregates the seeded session's cwd with a per-platform count", () => {
    const rows = listMemProjects();
    const ours = rows.find((r) => r.cwd === projectCwd);
    expect(ours).toBeDefined();
    expect(ours?.sessions).toBeGreaterThan(0);
    expect(ours?.by_platform.claude).toBe(1);
    expect(ours?.by_platform.pi).toBe(0);
    expect(ours?.by_platform.zcode).toBe(0);
  });

  it("includes Pi sessions in project aggregation", () => {
    const piId = "pi-project-session";
    seedPiSession(piId, projectCwd);
    const rows = listMemProjects({ filter: { platform: "pi" } });
    const ours = rows.find((r) => r.cwd === projectCwd);
    expect(ours).toBeDefined();
    expect(ours?.sessions).toBe(1);
    expect(ours?.by_platform.pi).toBe(1);
    expect(ours?.by_platform.claude).toBe(0);
    expect(ours?.by_platform.zcode).toBe(0);
  });
});
