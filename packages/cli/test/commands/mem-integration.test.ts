/**
 * Tier-3 integration smoke tests for `runMem` (the dispatch entry point).
 *
 * Each subcommand (list / search / context / extract / projects) is exercised
 * end-to-end through `runMem(args)` with a small fixture session tree under
 * a mocked $HOME. We capture console.log to assert output shape and verify
 * that `--json` mode returns parseable JSON.
 *
 * Errors from `die()` are routed through process.exit(2); we mock it to throw
 * so we can assert non-zero exit on missing args / bad ids without killing
 * the test runner.
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
  const fakeHome = f.mkdtempSync(p.join(o.tmpdir(), "trellis-mem-int-"));
  return { fakeHome };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => fakeHome };
});

const { runMem } = await import("../../src/commands/mem.js");

// =============================================================================
// fixture setup
// =============================================================================

const CLAUDE_PROJECTS = nodePath.join(fakeHome, ".claude", "projects");
const PI_SESSIONS = nodePath.join(fakeHome, ".pi", "agent", "sessions");
const projectCwd = "/tmp/mem-int-project";
const encodedCwd = projectCwd.replace(/[/_]/g, "-");
const projectDir = nodePath.join(CLAUDE_PROJECTS, encodedCwd);
const sessionId = "deadbeef-1234-5678-9abc-def012345678";
const sessionFile = nodePath.join(projectDir, `${sessionId}.jsonl`);

function piProjectDir(cwd: string): string {
  const safe = `--${nodePath
    .resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return nodePath.join(PI_SESSIONS, safe);
}

function writeJsonl(file: string, lines: readonly unknown[]): void {
  nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
  nodeFs.writeFileSync(
    file,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

function seedPiPhaseSession(): string {
  const piId = "pi-cli-phase-session";
  writeJsonl(
    nodePath.join(piProjectDir(projectCwd), `2026-06-18_${piId}.jsonl`),
    [
      {
        type: "session",
        version: 3,
        id: piId,
        timestamp: "2026-06-18T11:00:00.000Z",
        cwd: projectCwd,
      },
      {
        type: "message",
        id: "u1",
        parentId: null,
        timestamp: "2026-06-18T11:00:01.000Z",
        message: { role: "user", content: "pi warmup outside" },
      },
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-06-18T11:00:02.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "pi-cli brainstorm starts" },
            {
              type: "toolCall",
              name: "shell",
              arguments: { command: "task.py create --slug pi-cli" },
            },
          ],
        },
      },
      {
        type: "message",
        id: "u2",
        parentId: "a1",
        timestamp: "2026-06-18T11:00:03.000Z",
        message: { role: "user", content: "pi-cli brainstorm body" },
      },
      {
        type: "message",
        id: "b1",
        parentId: "u2",
        timestamp: "2026-06-18T11:00:04.000Z",
        message: {
          role: "bashExecution",
          command: "task.py start .trellis/tasks/06-18-pi-cli",
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
    ],
  );
  return piId;
}

function seedClaudeSession(): void {
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

afterAll(() => {
  nodeFs.rmSync(fakeHome, { recursive: true, force: true });
});

// =============================================================================
// runMem dispatch
// =============================================================================

describe("runMem subcommand integration", () => {
  let logs: string[];
  let errs: string[];
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = (): void => {};

  beforeEach(() => {
    nodeFs.mkdirSync(projectDir, { recursive: true });
    seedClaudeSession();
    logs = [];
    errs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errs.push(args.map((a) => String(a)).join(" "));
    });
    // die() calls process.exit(2); we throw a marker so tests can assert it
    // was hit without aborting the runner.
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit__:${code ?? 0}`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    nodeFs.rmSync(CLAUDE_PROJECTS, { recursive: true, force: true });
    nodeFs.rmSync(nodePath.join(fakeHome, ".pi"), {
      recursive: true,
      force: true,
    });
    nodeFs.rmSync(projectCwd, { recursive: true, force: true });
    noop();
  });

  // ---------- list ----------

  it("list: prints the session in cwd-scoped output", () => {
    runMem(["list", "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain(sessionId.slice(0, 12));
    expect(joined).toContain("1 session(s)");
  });

  it("list --json: emits a parseable JSON array", () => {
    runMem(["list", "--cwd", projectCwd, "--json"]);
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs[0] ?? "[]") as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sessionId, platform: "claude" }),
      ]),
    );
  });

  it("list --platform pi --json: emits Pi session metadata", () => {
    const piId = seedPiPhaseSession();
    runMem(["list", "--platform", "pi", "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs[0] ?? "[]") as {
      id: string;
      platform: string;
    }[];
    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: piId, platform: "pi" }),
      ]),
    );
  });

  // ---------- search ----------

  it("search: surfaces the matching session and its hit count", () => {
    runMem(["search", "memory", "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain("memory");
    expect(joined).toContain(sessionId.slice(0, 12));
    // "1 session(s)" footer indicates exactly one match.
    expect(joined).toMatch(/\d+ session\(s\)/);
  });

  it("search --json: returns an array of matches with score + excerpts", () => {
    runMem(["search", "memory", "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs[0] ?? "[]") as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    const arr = parsed as {
      session: { id: string };
      score: number;
      hit_count: number;
      excerpts: unknown[];
    }[];
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]?.session.id).toBe(sessionId);
    expect(arr[0]?.hit_count).toBeGreaterThan(0);
  });

  it("search --platform pi --json: searches cleaned Pi dialogue", () => {
    const piId = seedPiPhaseSession();
    runMem([
      "search",
      "pi-cli",
      "--platform",
      "pi",
      "--cwd",
      projectCwd,
      "--json",
    ]);
    const parsed = JSON.parse(logs[0] ?? "[]") as { session: { id: string } }[];
    expect(parsed[0]?.session.id).toBe(piId);
  });

  it("search: missing keyword exits non-zero via die()", () => {
    expect(() => runMem(["search"])).toThrow(/__exit__:2/);
    expect(errs.join("\n")).toContain("usage: search <keyword>");
  });

  // ---------- context ----------

  it("context: prints turns from the matched session", () => {
    runMem([
      "context",
      sessionId,
      "--grep",
      "memory",
      "--turns",
      "1",
      "--around",
      "0",
      "--cwd",
      projectCwd,
    ]);
    const joined = logs.join("\n");
    expect(joined).toContain(`# context: [claude] ${sessionId}`);
    expect(joined).toContain("memory");
  });

  it("context --json: returns object with session + turns array", () => {
    runMem([
      "context",
      sessionId,
      "--grep",
      "memory",
      "--cwd",
      projectCwd,
      "--json",
    ]);
    const parsed = JSON.parse(logs.join("\n")) as {
      session: { id: string };
      turns: unknown[];
    };
    expect(parsed.session.id).toBe(sessionId);
    expect(Array.isArray(parsed.turns)).toBe(true);
  });

  it("context --platform pi --json: returns Pi context windows", () => {
    const piId = seedPiPhaseSession();
    runMem([
      "context",
      piId,
      "--platform",
      "pi",
      "--grep",
      "pi-cli",
      "--cwd",
      projectCwd,
      "--json",
    ]);
    const parsed = JSON.parse(logs.join("\n")) as {
      session: { id: string; platform: string };
      turns: unknown[];
    };
    expect(parsed.session).toMatchObject({ id: piId, platform: "pi" });
    expect(parsed.turns.length).toBeGreaterThan(0);
  });

  it("context: missing session id exits non-zero", () => {
    expect(() => runMem(["context"])).toThrow(/__exit__:2/);
  });

  it("context: unknown session id exits non-zero with 'not found' message", () => {
    expect(() => runMem(["context", "no-such-session-id"])).toThrow(
      /__exit__:2/,
    );
    expect(errs.join("\n")).toMatch(/session not found/);
    expect(errs.join("\n")).toMatch(
      /session-history-missing|no readable history/,
    );
  });

  it("context without grep shows the pre-compact limit, not the opening", () => {
    const id = "compact-cli-session-0001";
    writeJsonl(nodePath.join(projectDir, `${id}.jsonl`), [
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:00:00Z",
        message: { role: "user", content: "opening greeting alpha" },
      },
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:01:00Z",
        message: { role: "user", content: "filler one" },
      },
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:02:00Z",
        message: { role: "user", content: "filler two" },
      },
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:03:00Z",
        message: { role: "user", content: "filler three" },
      },
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T10:04:00Z",
        message: {
          role: "user",
          content: "The provider allows at most two retries.",
        },
      },
      {
        type: "user",
        cwd: projectCwd,
        isCompactSummary: true,
        timestamp: "2026-04-15T11:00:00Z",
        message: {
          role: "user",
          content: "summary mentioned retries in general",
        },
      },
    ]);
    runMem([
      "context",
      id,
      "--cwd",
      projectCwd,
      "--turns",
      "3",
      "--around",
      "0",
    ]);
    const text = logs.join("\n");
    expect(text).toContain("before the latest compaction boundary");
    expect(text).toContain("at most two retries");
    expect(text).not.toContain("opening greeting alpha");
  });

  // ---------- extract ----------

  it("extract: dumps the cleaned dialogue with role headers", () => {
    runMem(["extract", sessionId, "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain("## Human");
    expect(joined).toContain("## Assistant");
    expect(joined).toContain("memory leak");
  });

  it("extract --json: returns session + turns as parseable JSON", () => {
    runMem(["extract", sessionId, "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs.join("\n")) as {
      session: { id: string };
      turns: { role: string; text: string }[];
    };
    expect(parsed.session.id).toBe(sessionId);
    expect(parsed.turns.length).toBeGreaterThan(0);
  });

  it("extract --grep filters turns to only those matching the keyword", () => {
    runMem(["extract", sessionId, "--cwd", projectCwd, "--grep", "cache"]);
    const joined = logs.join("\n");
    expect(joined).toContain("cache");
    // The first turn ("debug a memory leak") doesn't match "cache" and should
    // be filtered out.
    expect(joined).not.toContain("debug a memory leak");
  });

  // ---------- extract --phase (brainstorm slicing) ----------

  // The base seedClaudeSession() fixture has no task.py boundary signals, so
  // it exercises the no-boundary fallback. We seed an extra session with
  // explicit create/start markers for the happy path.
  const phaseSessionId = "ph45e51ce-0000-1111-2222-333344445555";
  const phaseSessionFile = nodePath.join(projectDir, `${phaseSessionId}.jsonl`);
  function seedPhaseSession(): void {
    writeJsonl(phaseSessionFile, [
      // turn 0: brainstorm starts
      {
        type: "user",
        cwd: projectCwd,
        timestamp: "2026-04-15T11:00:00Z",
        message: { role: "user", content: "brainstorm-content-X" },
      },
      // turn 1: assistant runs `task.py create` mid-message
      {
        type: "assistant",
        timestamp: "2026-04-15T11:00:01Z",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "creating task" },
            {
              type: "tool_use",
              name: "Bash",
              input: {
                command:
                  "python3 ./.trellis/scripts/task.py create --slug demo",
              },
            },
          ],
        },
      },
      // turn 2: brainstorm continues
      {
        type: "user",
        timestamp: "2026-04-15T11:00:02Z",
        message: { role: "user", content: "brainstorm-content-Y" },
      },
      // turn 3: assistant runs `task.py start` (transition to implement)
      {
        type: "assistant",
        timestamp: "2026-04-15T11:00:03Z",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "starting" },
            {
              type: "tool_use",
              name: "Bash",
              input: {
                command:
                  "python3 ./.trellis/scripts/task.py start .trellis/tasks/demo",
              },
            },
          ],
        },
      },
      // turn 4: implement starts here
      {
        type: "user",
        timestamp: "2026-04-15T11:00:04Z",
        message: { role: "user", content: "implement-content-Z" },
      },
    ]);
  }

  it("extract --phase brainstorm: returns only [create, start) turns", () => {
    seedPhaseSession();
    runMem([
      "extract",
      phaseSessionId,
      "--cwd",
      projectCwd,
      "--phase",
      "brainstorm",
    ]);
    const joined = logs.join("\n");
    // Brainstorm window should include the assistant "creating task" turn
    // (index 1) and the user "brainstorm-content-Y" turn (index 2).
    expect(joined).toContain("brainstorm-content-Y");
    expect(joined).toContain("creating task");
    // Turn 0 ("brainstorm-content-X") is BEFORE create — outside [1,3) window.
    // Make sure phase=brainstorm does not accidentally include warm-up turns.
    expect(joined).not.toContain("brainstorm-content-X");
    // Implement turn must NOT appear in brainstorm output.
    expect(joined).not.toContain("implement-content-Z");
    // Window separator with the slug label.
    expect(joined).toContain("--- task: demo ---");
    // Header reflects phase + window count.
    expect(joined).toContain("# phase: brainstorm");
  });

  it("extract --phase implement: returns turns OUTSIDE every brainstorm window", () => {
    seedPhaseSession();
    runMem([
      "extract",
      phaseSessionId,
      "--cwd",
      projectCwd,
      "--phase",
      "implement",
    ]);
    const joined = logs.join("\n");
    // Post-window: turn 4 ("implement-content-Z") survives.
    expect(joined).toContain("implement-content-Z");
    // Pre-window: turn 0 ("brainstorm-content-X") is BEFORE create at turn 1,
    // so it is OUTSIDE the [1,3) window and must appear under implement.
    expect(joined).toContain("brainstorm-content-X");
    // In-window turn must NOT appear.
    expect(joined).not.toContain("brainstorm-content-Y");
  });

  it("extract --phase brainstorm --json: emits windows + groups + total_turns", () => {
    seedPhaseSession();
    runMem([
      "extract",
      phaseSessionId,
      "--cwd",
      projectCwd,
      "--phase",
      "brainstorm",
      "--json",
    ]);
    const parsed = JSON.parse(logs.join("\n")) as {
      session: { id: string };
      phase: string;
      windows: { label: string; startTurn: number; endTurn: number }[];
      total_turns: number;
      groups: { label: string; turns: { role: string; text: string }[] }[];
      turns: { role: string; text: string }[];
    };
    expect(parsed.phase).toBe("brainstorm");
    expect(parsed.windows).toEqual([
      { label: "demo", startTurn: 1, endTurn: 3 },
    ]);
    expect(parsed.total_turns).toBe(5);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.label).toBe("demo");
    expect(parsed.groups[0]?.turns.map((t) => t.text)).toEqual([
      "creating task",
      "brainstorm-content-Y",
    ]);
  });

  it("extract --platform pi --phase brainstorm --json: slices Pi task windows", () => {
    const piId = seedPiPhaseSession();
    runMem([
      "extract",
      piId,
      "--platform",
      "pi",
      "--cwd",
      projectCwd,
      "--phase",
      "brainstorm",
      "--json",
    ]);
    const parsed = JSON.parse(logs.join("\n")) as {
      phase: string;
      windows: { label: string; startTurn: number; endTurn: number }[];
      turns: { text: string }[];
    };
    expect(parsed.phase).toBe("brainstorm");
    expect(parsed.windows).toEqual([
      { label: "pi-cli", startTurn: 1, endTurn: 3 },
    ]);
    expect(parsed.turns.map((t) => t.text)).toEqual([
      "pi-cli brainstorm starts",
      "pi-cli brainstorm body",
    ]);
  });

  it("extract --phase brainstorm with no boundary signals: warns + returns full dialogue", () => {
    // Default seeded session has no task.py events.
    runMem([
      "extract",
      sessionId,
      "--cwd",
      projectCwd,
      "--phase",
      "brainstorm",
    ]);
    const errsJoined = errs.join("\n");
    expect(errsJoined).toMatch(/no task\.py create\/start boundary/);
    const joined = logs.join("\n");
    expect(joined).toContain("memory leak");
  });

  it("extract --phase implement with no boundary signals: warns + returns empty", () => {
    runMem([
      "extract",
      sessionId,
      "--cwd",
      projectCwd,
      "--phase",
      "implement",
      "--json",
    ]);
    const errsJoined = errs.join("\n");
    expect(errsJoined).toMatch(/no task\.py create\/start boundary/);
    const parsed = JSON.parse(logs.join("\n")) as {
      turns: unknown[];
      windows: unknown[];
    };
    expect(parsed.turns).toEqual([]);
    expect(parsed.windows).toEqual([]);
  });

  it("extract --phase brainstorm + --grep: phase-slice runs first, grep filters within", () => {
    seedPhaseSession();
    runMem([
      "extract",
      phaseSessionId,
      "--cwd",
      projectCwd,
      "--phase",
      "brainstorm",
      "--grep",
      "brainstorm-content",
    ]);
    const joined = logs.join("\n");
    expect(joined).toContain("brainstorm-content-Y");
    // "creating task" doesn't contain "brainstorm-content" → filtered out.
    expect(joined).not.toContain("creating task");
    // Implement turn definitely not present.
    expect(joined).not.toContain("implement-content-Z");
  });

  it("extract --phase: rejects unknown value via die()", () => {
    expect(() =>
      runMem(["extract", sessionId, "--cwd", projectCwd, "--phase", "garbage"]),
    ).toThrow(/__exit__:2/);
    expect(errs.join("\n")).toContain("unknown --phase: garbage");
  });

  // ---------- projects ----------

  it("projects: lists distinct cwds with session counts", () => {
    runMem(["projects"]);
    const joined = logs.join("\n");
    expect(joined).toContain("active projects");
    // Our seeded session has cwd=projectCwd, which should appear.
    expect(joined).toContain(projectCwd);
  });

  it("projects --json: emits an array of {cwd, sessions, by_platform, ...}", () => {
    runMem(["projects", "--json"]);
    const parsed = JSON.parse(logs[0] ?? "[]") as {
      cwd: string;
      sessions: number;
      by_platform: Record<string, number>;
    }[];
    expect(Array.isArray(parsed)).toBe(true);
    const ours = parsed.find((p) => p.cwd === projectCwd);
    expect(ours).toBeDefined();
    expect(ours?.sessions).toBeGreaterThan(0);
    expect(ours?.by_platform.claude).toBe(1);
  });

  // ---------- recall / read (unified lookup) ----------

  // A real on-disk project dir so `discoverDocs` has documents to find. The
  // session fixture's cwd points here too, so recall sees one project.
  function seedProjectDocs(): void {
    nodeFs.mkdirSync(nodePath.join(projectCwd, "docs"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(projectCwd, "README.md"),
      "# mem-int-project\n\nIdempotency is enforced per request key.\n",
    );
    nodeFs.writeFileSync(
      nodePath.join(projectCwd, "docs", "billing.md"),
      "# Billing\n\nRetries must not double-charge a customer.\n",
    );
  }

  it("recall/read: surfaces superseded lineage without expanding the successor", () => {
    nodeFs.mkdirSync(nodePath.join(projectCwd, ".trellis", "research"), {
      recursive: true,
    });
    nodeFs.writeFileSync(
      nodePath.join(projectCwd, ".trellis", "research", "new-topic.md"),
      "# New topic\n\nSUCCESSOR_ONLY lineage needle\n",
    );
    nodeFs.writeFileSync(
      nodePath.join(projectCwd, ".trellis", "research", "old-topic.md"),
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/new-topic.md\n---\n\n# Old topic\n\nlineage needle OLD_ONLY\n",
    );
    runMem(["recall", "lineage needle", "--cwd", projectCwd, "--limit", "2"]);
    const recalled = logs.join("\n");
    expect(recalled).toContain(".trellis/research/new-topic.md");
    expect(recalled).toContain("superseded → .trellis/research/new-topic.md");
    expect(recalled.indexOf("new-topic.md")).toBeLessThan(
      recalled.indexOf("old-topic.md"),
    );
    logs.length = 0;
    runMem(["recall", "OLD_ONLY", "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs.join("\n")) as {
      hits: { ref: string; status?: string; supersededBy?: string }[];
    };
    const old = parsed.hits[0];
    expect(old?.status).toBe("superseded");
    expect(old?.supersededBy).toBe(".trellis/research/new-topic.md");
    logs.length = 0;
    runMem(["read", old?.ref ?? "", "--cwd", projectCwd]);
    const readOut = logs.join("\n");
    expect(readOut).toContain("superseded by: .trellis/research/new-topic.md");
    expect(readOut).toContain("OLD_ONLY");
    expect(readOut).not.toContain("SUCCESSOR_ONLY");
  });

  it("recall/read: agree on a bad successor and do not follow an excluded path", () => {
    const research = nodePath.join(projectCwd, ".trellis", "research");
    nodeFs.mkdirSync(research, { recursive: true });
    nodeFs.mkdirSync(nodePath.join(projectCwd, "node_modules", "pkg"), {
      recursive: true,
    });
    nodeFs.writeFileSync(
      nodePath.join(projectCwd, "node_modules", "pkg", "README.md"),
      "# Dep\n\nNODE_MODULES_RULE\n",
    );
    nodeFs.writeFileSync(
      nodePath.join(research, "broken.md"),
      "---\nstatus: superseded\nsuperseded_by: .trellis/research/missing.md\n---\n\n# Broken\n\nBROKEN_NEEDLE\n",
    );
    nodeFs.writeFileSync(
      nodePath.join(research, "excluded.md"),
      "---\nstatus: superseded\nsuperseded_by: node_modules/pkg/README.md\n---\n\n# Excluded\n\nEXCLUDED_NEEDLE\n",
    );
    runMem(["recall", "BROKEN_NEEDLE", "--cwd", projectCwd]);
    const broken = logs.join("\n");
    expect(broken).toContain("lineage missing-target");
    expect(broken).not.toContain("superseded →");
    logs.length = 0;
    runMem(["recall", "BROKEN_NEEDLE", "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs.join("\n")) as {
      hits: { ref: string; lineageFault?: string; supersededBy?: string }[];
    };
    expect(parsed.hits[0]?.lineageFault).toBe("missing-target");
    expect(parsed.hits[0]?.supersededBy).toBeUndefined();
    logs.length = 0;
    runMem(["read", parsed.hits[0]?.ref ?? "", "--cwd", projectCwd]);
    const readOut = logs.join("\n");
    expect(readOut).toContain("lineage missing-target");
    expect(readOut).toContain("BROKEN_NEEDLE");
    logs.length = 0;
    runMem(["recall", "EXCLUDED_NEEDLE", "--cwd", projectCwd]);
    const excluded = logs.join("\n");
    expect(excluded).toContain("lineage missing-target");
    expect(excluded).not.toContain("NODE_MODULES_RULE");
  });

  it("recall: finds a project document with a doc ref", () => {
    seedProjectDocs();
    runMem(["recall", "idempotency", "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain("[doc] README.md");
    expect(joined).toContain("ref: doc:v1:");
    expect(joined).toContain("Idempotency");
    expect(joined).toMatch(/\d+ hit\(s\)/);
  });

  it("search stays conversation-only while recall can find project notes", () => {
    seedProjectDocs();
    runMem(["search", "double-charge", "--cwd", projectCwd, "--json"]);
    expect(JSON.parse(logs.join("\n"))).toEqual([]);
    logs.length = 0;
    runMem(["recall", "double-charge", "--cwd", projectCwd, "--json"]);
    expect(
      JSON.parse(logs.join("\n")).hits.some(
        (hit: { path?: string }) => hit.path === "docs/billing.md",
      ),
    ).toBe(true);
  });

  it("recall --json: emits {hits,totalHits,incomplete,warnings}", () => {
    seedProjectDocs();
    runMem(["recall", "double-charge", "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs.join("\n")) as {
      hits: {
        sourceKind: string;
        ref: string;
        path?: string;
        excerpt: string;
      }[];
      totalHits: number;
      incomplete: boolean;
    };
    const hit = parsed.hits.find((h) => h.path === "docs/billing.md");
    expect(hit?.sourceKind).toBe("doc");
    expect(hit?.excerpt).toContain("double-charge");
    expect(parsed.totalHits).toBeGreaterThan(0);
  });

  it("recall: surfaces a matching dialogue session by ref", () => {
    runMem(["recall", "memory leak", "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain("session:v1:");
    expect(joined).toContain("unbounded caches");
  });

  it("recall: missing query exits non-zero", () => {
    expect(() => runMem(["recall"])).toThrow(/__exit__:2/);
    expect(errs.join("\n")).toContain("usage: recall <query>");
  });

  function recallRef(query: string, sourceKind: string): string {
    runMem(["recall", query, "--cwd", projectCwd, "--json"]);
    const result = JSON.parse(logs.join("\n")) as {
      hits: { ref: string; sourceKind: string }[];
    };
    logs.length = 0;
    const ref = result.hits.find((h) => h.sourceKind === sourceKind)?.ref;
    if (!ref) throw new Error("fixture did not return an expandable ref");
    return ref;
  }

  it("read: expands a doc ref back to its text", () => {
    seedProjectDocs();
    runMem(["read", recallRef("idempotency", "doc"), "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain("--- doc:v1:");
    expect(joined).toContain("Idempotency");
  });

  it("read: expands a session ref to its surrounding turns", () => {
    runMem(["read", recallRef("memory leak", "claude"), "--cwd", projectCwd]);
    const joined = logs.join("\n");
    expect(joined).toContain("--- session:v1:");
    expect(joined).toContain("memory leak");
  });

  it("read --json: emits a reads array", () => {
    seedProjectDocs();
    runMem([
      "read",
      recallRef("double-charge", "doc"),
      "--cwd",
      projectCwd,
      "--json",
    ]);
    const parsed = JSON.parse(logs.join("\n")) as {
      reads: { ref: string; text: string; sourceKind: string }[];
    };
    expect(parsed.reads).toHaveLength(1);
    expect(parsed.reads[0]?.sourceKind).toBe("doc");
    expect(parsed.reads[0]?.text).toContain("double-charge");
  });

  it("read: refuses a ref that escapes the project", () => {
    seedProjectDocs();
    runMem(["read", "doc:../../etc/passwd:1", "--cwd", projectCwd, "--json"]);
    const parsed = JSON.parse(logs.join("\n")) as { reads: unknown[] };
    expect(parsed.reads).toEqual([]);
    expect(errs.join("\n")).toContain("invalid or unversioned ref");
  });

  it("recall caps complete rendered JSON and text including headers", () => {
    seedProjectDocs();
    for (const jsonFlag of [[], ["--json"]]) {
      logs.length = 0;
      runMem([
        "recall",
        "idempotency",
        "--cwd",
        projectCwd,
        "--max-chars",
        "400",
        ...jsonFlag,
      ]);
      expect(logs.join("\n").length + 1).toBeLessThanOrEqual(400);
    }
  });

  it("read caps a rendered batch and rejects an unrepresentable status budget", () => {
    seedProjectDocs();
    const ref = recallRef("double-charge", "doc");
    runMem(["read", ref, "--cwd", projectCwd, "--max-chars", "400", "--json"]);
    expect(logs.join("\n").length + 1).toBeLessThanOrEqual(400);
    logs.length = 0;
    expect(() =>
      runMem([
        "recall",
        "idempotency",
        "--cwd",
        projectCwd,
        "--max-chars",
        "0",
        "--json",
      ]),
    ).toThrow(/__exit__:2/);
    expect(logs).toEqual([]);
  });

  it("read: missing ref exits non-zero", () => {
    expect(() => runMem(["read"])).toThrow(/__exit__:2/);
    expect(errs.join("\n")).toContain("usage: read <ref...>");
  });

  // ---------- help / unknown ----------

  it("help command prints usage", () => {
    runMem(["help"]);
    const joined = logs.join("\n");
    expect(joined).toContain("mini-trellis mem");
    expect(joined).toContain("claude|codex|opencode|pi|all");
  });

  it("unknown command exits non-zero with 'unknown command' error", () => {
    expect(() => runMem(["bogus"])).toThrow(/__exit__:2/);
    expect(errs.join("\n")).toMatch(/unknown command/);
  });
});
