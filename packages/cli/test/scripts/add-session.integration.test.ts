/**
 * Integration test for `add_session.py` auto-commit scope and for the
 * recording state machine (commit evidence, retry convergence, numbering).
 *
 * The python script lives under
 * `src/templates/trellis/scripts/add_session.py`; this test stamps the real
 * templates into a fresh git repo and exercises the actual `python3
 * add_session.py` paths — no source-string assertions.
 *
 * Scope-creep guard (#303): the session auto-commit must stage ONLY the
 * current developer's journal/index + the CURRENT task dir. Dirty changes in
 * OTHER parallel-window task dirs must NOT be bundled into the session commit.
 * This mirrors `task-archive.integration.test.ts`'s "does not bundle dirty
 * changes from other task dirs" for the session route.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);

const DEVELOPER = "tester";

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (rc=${r.status}): ${r.stderr}`,
    );
  }
  return r.stdout.trim();
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", "main");
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");
  stampTrellis(tmp);
}

/** Create the `.trellis/` tree and developer state at `tmp`, without git. */
function stampTrellis(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });

  // Stamp the real templates into the test repo.
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  // session_auto_commit must be enabled for the session to commit.
  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    "session_auto_commit: true\n",
  );

  // Initialize the developer (creates .developer, journal-1.md, index.md with
  // the auto-update markers) via the real init script.
  const r = spawnSync(
    "python3",
    [".trellis/scripts/init_developer.py", DEVELOPER],
    { cwd: tmp, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    throw new Error(`init_developer failed: ${r.stderr}`);
  }
}

function makeTask(
  repo: string,
  name: string,
  prdBody: string,
  branch?: string,
): void {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), prdBody);
  const taskJson: Record<string, unknown> = {
    id: name,
    name,
    title: name,
    status: "in_progress",
    priority: "P2",
    createdAt: "2026-06-18",
    assignee: DEVELOPER,
    creator: DEVELOPER,
    subtasks: [],
    children: [],
    relatedFiles: [],
    meta: {},
  };
  if (branch) {
    taskJson.branch = branch;
  }
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify(taskJson) + "\n",
  );
}

/**
 * Point the active-task resolver at `taskName`. With exactly one session file
 * present, `resolve_active_task` uses the single-session fallback, so
 * `get_current_task` returns this task without needing a platform context.
 */
function setCurrentTask(repo: string, taskName: string): void {
  const sessionsDir = path.join(repo, ".trellis", ".runtime", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, "session.json"),
    JSON.stringify({
      current_task: `.trellis/tasks/${taskName}`,
      platform: "session",
    }) + "\n",
  );
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the script and return its outcome without asserting on it. */
function tryAddSession(
  repo: string,
  title: string,
  extraArgs: string[] = [],
): RunResult {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/add_session.py", "--title", title, ...extraArgs],
    { cwd: repo, encoding: "utf-8" },
  );
  return {
    status: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function runAddSession(repo: string, title: string, extraArgs: string[] = []): void {
  const r = tryAddSession(repo, title, extraArgs);
  if (r.status !== 0) {
    throw new Error(`add_session failed: ${r.stderr}`);
  }
}

function journalPath(repo: string, num = 1): string {
  return path.join(repo, ".trellis", "workspace", DEVELOPER, `journal-${num}.md`);
}

function indexPath(repo: string): string {
  return path.join(repo, ".trellis", "workspace", DEVELOPER, "index.md");
}

function readJournal(repo: string, num = 1): string {
  return fs.readFileSync(journalPath(repo, num), "utf-8");
}

function readIndex(repo: string): string {
  return fs.readFileSync(indexPath(repo), "utf-8");
}

/** Session numbers recorded as `## Session N:` headings, in file order. */
function sessionNumbers(repo: string, num = 1): number[] {
  return [...readJournal(repo, num).matchAll(/^## Session (\d+):/gm)].map((m) =>
    Number(m[1]),
  );
}

function countMarkers(repo: string, num = 1): number {
  return readJournal(repo, num).split("<!-- trellis-session:").length - 1;
}

/** Every distinct record marker present in a journal, in order of appearance. */
function distinctMarkers(repo: string, num = 1): string[] {
  const seen = readJournal(repo, num).match(/<!-- trellis-session:[^>]*-->/g) ?? [];
  return [...new Set(seen)];
}

/** Seed a task + initial commit so HEAD and a current task both exist. */
function seedTask(repo: string, name = "task-a"): void {
  makeTask(repo, name, `${name} prd\n`);
  setCurrentTask(repo, name);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "initial");
}

/** Install a pre-commit hook that always fails, to break the commit step. */
function breakCommits(repo: string): void {
  const hook = path.join(repo, ".git", "hooks", "pre-commit");
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
}

function repairCommits(repo: string): void {
  fs.rmSync(path.join(repo, ".git", "hooks", "pre-commit"), { force: true });
}

describe.skipIf(!hasPython())("add_session.py auto-commit", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not bundle dirty changes from other task dirs (scope-creep fix)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    makeTask(tmp, "task-b", "task B prd v1\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    // Dirty edit in task-b BEFORE recording a session in task-a's context.
    fs.appendFileSync(
      path.join(tmp, ".trellis", "tasks", "task-b", "prd.md"),
      "DIRTY EDIT IN TASK-B SHOULD NOT BE COMMITTED\n",
    );

    runAddSession(tmp, "task-a work");

    // Last commit is the session auto-commit; inspect its files.
    const lastFiles = git(
      tmp,
      "show",
      "HEAD",
      "--name-only",
      "--pretty=format:",
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // task-b paths must NOT appear in the session commit.
    const leaked = lastFiles.filter((f) => f.includes("/task-b/"));
    expect(leaked).toEqual([]);

    // task-b dirty change still in working tree.
    const status = git(tmp, "status", "--porcelain");
    expect(status).toMatch(/\.trellis\/tasks\/task-b\/prd\.md/);
  });

  it("omits Main Changes/Testing/Next Steps sections for a legacy call (#394)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "placeholder-free work");

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );

    expect(journal).toContain("### Summary");
    expect(journal).toContain("### Git Commits");
    expect(journal).toContain("### Status");
    expect(journal).not.toContain("### Main Changes");
    expect(journal).not.toContain("### Testing");
    expect(journal).not.toContain("### Next Steps");
    expect(journal).not.toContain("(Add details)");
    expect(journal).not.toContain("(Add test results)");
    expect(journal).not.toContain("(Add summary)");
  });

  it("renders bullets for --change/--test/--next-step and keeps the [OK] testing prefix (#394)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "structured work", [
      "--change",
      "Added feature X",
      "--change",
      "Fixed bug Y",
      "--test",
      "Ran unit tests",
      "--next-step",
      "Ship it",
    ]);

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );

    expect(journal).toContain("### Main Changes");
    expect(journal).toContain("- Added feature X");
    expect(journal).toContain("- Fixed bug Y");
    expect(journal).toContain("### Testing");
    expect(journal).toContain("- [OK] Ran unit tests");
    expect(journal).toContain("### Next Steps");
    expect(journal).toContain("- Ship it");
  });

  it("falls back to the current checkout branch when task.json branch is stale", () => {
    makeTask(tmp, "task-a", "task A prd\n", "deleted-task-branch");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "stale branch work");

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `main`");
    expect(index).toContain("| 1 |");
    expect(index).toContain("| `main` |");
    expect(journal).not.toContain("deleted-task-branch");
    expect(index).not.toContain("deleted-task-branch");
  });

  it("does not wide-scan task dirs when the current task is unresolvable (>=2 sessions)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    makeTask(tmp, "task-b", "task B prd v1\n");
    // TWO session files → resolve_active_task refuses to guess and returns
    // None. The guard must stage only journal/index, never the wide scan.
    setCurrentTask(tmp, "task-a");
    const sessionsDir = path.join(tmp, ".trellis", ".runtime", "sessions");
    fs.writeFileSync(
      path.join(sessionsDir, "session2.json"),
      JSON.stringify({
        current_task: ".trellis/tasks/task-b",
        platform: "session",
      }) + "\n",
    );
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    // Both task dirs dirty.
    fs.appendFileSync(
      path.join(tmp, ".trellis", "tasks", "task-a", "prd.md"),
      "DIRTY A\n",
    );
    fs.appendFileSync(
      path.join(tmp, ".trellis", "tasks", "task-b", "prd.md"),
      "DIRTY B\n",
    );

    runAddSession(tmp, "ambiguous-session work");

    const lastFiles = git(
      tmp,
      "show",
      "HEAD",
      "--name-only",
      "--pretty=format:",
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // No task dir at all in the session commit when the task is unresolvable.
    const taskFiles = lastFiles.filter((f) => f.includes("/tasks/"));
    expect(taskFiles).toEqual([]);

    // Both task dirty edits remain in the working tree.
    const status = git(tmp, "status", "--porcelain");
    expect(status).toMatch(/\.trellis\/tasks\/task-a\/prd\.md/);
    expect(status).toMatch(/\.trellis\/tasks\/task-b\/prd\.md/);
  });

  it("stages only Trellis-owned paths in the session auto-commit", () => {
    seedTask(tmp);
    fs.writeFileSync(path.join(tmp, "unrelated.txt"), "user work in progress\n");

    runAddSession(tmp, "scoped staging");

    const lastFiles = git(tmp, "show", "HEAD", "--name-only", "--pretty=format:")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    expect(lastFiles.length).toBeGreaterThan(0);
    for (const f of lastFiles) {
      expect(f.startsWith(".trellis/"), `unexpected path in commit: ${f}`).toBe(
        true,
      );
    }
    expect(git(tmp, "status", "--porcelain")).toContain("unrelated.txt");
  });
});

describe.skipIf(!hasPython())("add_session.py commit evidence (R1)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-evidence-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("renders the real local commit subject, never a (see git log) placeholder", () => {
    const head = git(tmp, "rev-parse", "HEAD");

    runAddSession(tmp, "evidence work", ["--commit", head]);

    const journal = readJournal(tmp);
    expect(journal).toContain(`| \`${head}\` | initial |`);
    expect(journal).not.toContain("(see git log)");
    expect(journal).not.toContain("(Add details)");
    expect(journal).not.toContain("(Add test results)");
  });

  it("resolves each of several commits to its own subject", () => {
    fs.writeFileSync(path.join(tmp, "a.txt"), "a\n");
    git(tmp, "add", "a.txt");
    git(tmp, "commit", "-q", "-m", "feat: add a");
    const first = git(tmp, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(tmp, "b.txt"), "b\n");
    git(tmp, "add", "b.txt");
    git(tmp, "commit", "-q", "-m", "fix: correct b");
    const second = git(tmp, "rev-parse", "HEAD");

    runAddSession(tmp, "two commits", ["--commit", `${first},${second}`]);

    const journal = readJournal(tmp);
    expect(journal).toContain(`| \`${first}\` | feat: add a |`);
    expect(journal).toContain(`| \`${second}\` | fix: correct b |`);
  });

  it("fails before any journal or index write when an OID cannot be resolved", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));
    const indexBefore = fs.readFileSync(indexPath(tmp));
    const logBefore = git(tmp, "log", "--oneline");

    const r = tryAddSession(tmp, "unresolvable", ["--commit", "deadbeef"]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("cannot resolve commit evidence for: deadbeef");
    expect(r.stderr).toContain("--commit-subject");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
    expect(fs.readFileSync(indexPath(tmp)).equals(indexBefore)).toBe(true);
    expect(git(tmp, "log", "--oneline")).toBe(logBefore);
  });

  it("rejects a --commit token that is not a bounded hex OID", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));

    const r = tryAddSession(tmp, "bad token", ["--commit", "HEAD~1"]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid --commit token 'HEAD~1'");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
  });

  it("accepts an explicit one-to-one subject mapping and escapes it for the table", () => {
    const r = tryAddSession(tmp, "mapped evidence", [
      "--commit",
      "deadbeef",
      "--commit-subject",
      "deadbeef=feat: pipe | and \\ in the subject",
    ]);

    expect(r.status).toBe(0);
    const journal = readJournal(tmp);
    // The cell keeps one row: `|` and `\` are escaped rather than splitting it.
    expect(journal).toContain(
      "| `deadbeef` | feat: pipe \\| and \\\\ in the subject |",
    );
    expect(readIndex(tmp)).toContain("`deadbeef`");
  });

  it("refuses a --commit-subject that is not one-to-one with --commit", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));

    const r = tryAddSession(tmp, "extra mapping", [
      "--commit",
      "deadbeef",
      "--commit-subject",
      "deadbeef=real subject",
      "--commit-subject",
      "cafebabe=subject for an OID nobody asked about",
    ]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not in --commit");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
  });

  it("keeps the planning-session rendering for --commit -", () => {
    runAddSession(tmp, "planning work", ["--commit", "-"]);

    const journal = readJournal(tmp);
    expect(journal).toContain("(No commits - planning session)");
    expect(journal).not.toContain("| Hash | Message |");
    expect(readIndex(tmp)).toMatch(/\|\s*1\s*\|.*\|\s*-\s*\|/);
  });

  it("rejects an out-of-shape --idempotency-key before writing", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));

    const r = tryAddSession(tmp, "bad key", ["--idempotency-key", "not ok!"]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid --idempotency-key");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
  });
});

/**
 * Marker as the two schemes render it, for the same record inputs.
 *
 * Reconstructs the fingerprint payload the way `cmd_add_session` builds it,
 * by importing the real module — so the v1 form is produced by the shipped
 * `compute_legacy_fingerprint`, not by a copy of it here. The caller asserts
 * that `v2` matches what is actually in the journal before trusting `v1`; if
 * this reconstruction ever drifts from the command, that check fails loudly
 * instead of the test quietly passing on a marker nothing would have written.
 */
function markersFor(
  repo: string,
  title: string,
  summary: string,
  branch: string,
  legacyDate: string,
): { v2: string; v1: string } {
  const harness = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(".trellis/scripts")})`,
    "import add_session as a",
    "payload = a._fingerprint_payload(",
    `    ${JSON.stringify(DEVELOPER)}, ${JSON.stringify(title)},`,
    `    ${JSON.stringify(summary)}, None, ${JSON.stringify(branch)},`,
    "    [], None, None, None, None, None,",
    ")",
    "print(json.dumps({",
    "  'v2': a.render_marker(a.compute_record_fingerprint(payload)),",
    `  'v1': a.render_legacy_marker(a.compute_legacy_fingerprint(payload, ${JSON.stringify(legacyDate)})),`,
    "}))",
  ].join("\n");
  const r = spawnSync("python3", ["-c", harness], {
    cwd: repo,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(`marker harness failed: ${r.stderr}`);
  }
  return JSON.parse(r.stdout);
}

/** Rewrite the pending entry into the pre-versioning marker scheme. */
function downgradeToLegacyMarker(
  repo: string,
  v2Marker: string,
  v1Marker: string,
  legacyDate: string,
): void {
  const before = readJournal(repo);
  expect(before).toContain(v2Marker);
  fs.writeFileSync(
    journalPath(repo),
    before
      .replace(v2Marker, v1Marker)
      .replace(/^\*\*Date\*\*: \d{4}-\d{2}-\d{2}$/m, `**Date**: ${legacyDate}`),
  );
}

describe.skipIf(!hasPython())("add_session.py fingerprint date rollover", () => {
  let tmp: string;
  const TITLE = "rollover run";
  const SUMMARY = "interrupted before the commit";
  const BRANCH = "main";
  const ARGS = ["--summary", SUMMARY, "--branch", BRANCH];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-rollover-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("resumes a record written yesterday under the pre-versioning scheme", () => {
    // Interrupt after the journal and index writes, before the commit.
    breakCommits(tmp);
    const first = tryAddSession(tmp, TITLE, ARGS);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("Auto-commit failed");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // Stage what a pre-change run would have left behind on an earlier day.
    const { v2, v1 } = markersFor(tmp, TITLE, SUMMARY, BRANCH, "2020-01-01");
    downgradeToLegacyMarker(tmp, v2, v1, "2020-01-01");

    repairCommits(tmp);
    const second = tryAddSession(tmp, TITLE, ARGS);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    // The record was found and finished — not appended a second time.
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
    // Its marker is left as written; an in-flight entry is not rewritten.
    expect(readJournal(tmp)).toContain(v1);
  });

  it("resolves a same-day legacy marker too, not just one across a rollover", () => {
    breakCommits(tmp);
    expect(tryAddSession(tmp, TITLE, ARGS).status).toBe(1);

    const today = readJournal(tmp).match(/^\*\*Date\*\*: (\d{4}-\d{2}-\d{2})$/m);
    if (!today) throw new Error("journal entry carries no **Date** line");
    const date = today[1];
    const { v2, v1 } = markersFor(tmp, TITLE, SUMMARY, BRANCH, date);
    downgradeToLegacyMarker(tmp, v2, v1, date);

    repairCommits(tmp);
    const second = tryAddSession(tmp, TITLE, ARGS);
    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);
  });

  it("does not adopt a legacy entry whose inputs differ", () => {
    breakCommits(tmp);
    expect(tryAddSession(tmp, TITLE, ARGS).status).toBe(1);
    const { v2, v1 } = markersFor(tmp, TITLE, SUMMARY, BRANCH, "2020-01-01");
    downgradeToLegacyMarker(tmp, v2, v1, "2020-01-01");
    repairCommits(tmp);

    // A different summary is a different record; resuming it would be wrong.
    const other = tryAddSession(tmp, TITLE, [
      "--summary",
      "a genuinely different session",
      "--branch",
      BRANCH,
    ]);
    expect(other.status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(countMarkers(tmp)).toBe(2);
  });

  it("keeps two same-day sessions distinct now that the date is not an input", () => {
    runAddSession(tmp, "first session", ["--summary", "one", "--branch", BRANCH]);
    runAddSession(tmp, "second session", ["--summary", "two", "--branch", BRANCH]);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(countMarkers(tmp)).toBe(2);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 2");
  });

  it("writes the versioned marker form", () => {
    runAddSession(tmp, TITLE, ARGS);
    expect(readJournal(tmp)).toMatch(
      /^<!-- trellis-session: v=2 fp=[0-9a-f]{16} -->$/m,
    );
  });
});

describe.skipIf(!hasPython())("add_session.py retry convergence (R2-R5)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-retry-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("repairs the index row on retry when the index update failed after the append", () => {
    const indexBefore = fs.readFileSync(indexPath(tmp), "utf-8");
    // Break the auto-update markers so update_index refuses, after the journal
    // append has already landed.
    fs.writeFileSync(
      indexPath(tmp),
      indexBefore.replace("@@@auto:current-status", "BROKEN-MARKER"),
    );

    const first = tryAddSession(tmp, "index fault", ["--summary", "fault run"]);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("Markers not found in index.md");
    expect(first.stderr).toContain("[BLOCKED] Checkpoint:");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // Repair the index and re-run the identical command.
    fs.writeFileSync(indexPath(tmp), indexBefore);
    const second = tryAddSession(tmp, "index fault", ["--summary", "fault run"]);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    expect(second.stderr).toContain("journal-recorded");
    // No second entry, and the row for session 1 is now present.
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);
    expect(readIndex(tmp)).toMatch(/^\|\s*1\s*\|/m);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
  });

  it("exits non-zero with a checkpoint when the auto-commit fails, then resumes at the commit step", () => {
    breakCommits(tmp);

    const first = tryAddSession(tmp, "commit fault", ["--summary", "fault run"]);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("Auto-commit failed");
    expect(first.stderr).toContain("[BLOCKED] Checkpoint:");
    expect(first.stderr).toContain("resumes at the commit step");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // A retry while the commit is still broken must not duplicate anything.
    const second = tryAddSession(tmp, "commit fault", ["--summary", "fault run"]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("[RESUME]");
    expect(second.stderr).toContain("index-recorded");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");

    // With the commit repaired, the same command finishes the operation.
    repairCommits(tmp);
    const third = tryAddSession(tmp, "commit fault", ["--summary", "fault run"]);
    expect(third.status).toBe(0);
    expect(third.stderr).toContain("[RESUME]");
    expect(third.stderr).toContain("Auto-committed");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);

    const committed = git(
      tmp,
      "show",
      `HEAD:.trellis/workspace/${DEVELOPER}/journal-1.md`,
    );
    expect(committed).toContain("## Session 1: commit fault");
  });

  it("treats an identical request as a new session once the earlier one is committed", () => {
    runAddSession(tmp, "same prose", ["--summary", "identical summary"]);
    runAddSession(tmp, "same prose", ["--summary", "identical summary"]);
    // A third identical run has to keep working. It would not if the new
    // entries reused the committed record's marker: classify_record refuses
    // to resume once a marker matches more than one entry.
    runAddSession(tmp, "same prose", ["--summary", "identical summary"]);

    expect(sessionNumbers(tmp)).toEqual([1, 2, 3]);
    expect(countMarkers(tmp)).toBe(3);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 3");
    // Each generation carries its own marker; duplicates would make every
    // later run ambiguous.
    expect(distinctMarkers(tmp).length).toBe(3);
  });

  it("makes a committed record a no-op when the caller supplies an idempotency key", () => {
    runAddSession(tmp, "keyed work", [
      "--summary",
      "keyed summary",
      "--idempotency-key",
      "retry-001",
    ]);
    expect(sessionNumbers(tmp)).toEqual([1]);

    const second = tryAddSession(tmp, "keyed work", [
      "--summary",
      "keyed summary",
      "--idempotency-key",
      "retry-001",
    ]);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("already recorded and committed");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
  });

  it("refuses to resume when two entries carry the same record marker", () => {
    runAddSession(tmp, "dup work", ["--summary", "dup summary", "--no-commit"]);

    // Duplicate the pending entry — the retry must not pick one at random.
    const journal = readJournal(tmp);
    const entry = journal.slice(journal.indexOf("## Session 1:"));
    fs.writeFileSync(journalPath(tmp), journal + "\n\n" + entry);

    const r = tryAddSession(tmp, "dup work", [
      "--summary",
      "dup summary",
      "--no-commit",
    ]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("journal entries carrying this record's marker");
    expect(countMarkers(tmp)).toBe(2);
  });

  it("refuses to resume from a marker with no session heading above it", () => {
    runAddSession(tmp, "orphan work", [
      "--summary",
      "orphan summary",
      "--no-commit",
    ]);

    fs.writeFileSync(
      journalPath(tmp),
      readJournal(tmp).replace("## Session 1: orphan work", "## Notes"),
    );

    const r = tryAddSession(tmp, "orphan work", [
      "--summary",
      "orphan summary",
      "--no-commit",
    ]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("without a '## Session N:' heading");
  });

  it("stops after a verified journal + index when auto-commit is disabled", () => {
    fs.writeFileSync(
      path.join(tmp, ".trellis", "config.yaml"),
      "session_auto_commit: false\n",
    );
    const logBefore = git(tmp, "log", "--oneline");

    const r = tryAddSession(tmp, "no auto commit", ["--summary", "local only"]);

    expect(r.status).toBe(0);
    expect(r.stderr).toContain("session_auto_commit: false");
    expect(r.stderr).not.toContain("Auto-committed");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
    expect(git(tmp, "log", "--oneline")).toBe(logBefore);
  });

  it("writes journal and index but skips git for --no-commit", () => {
    const logBefore = git(tmp, "log", "--oneline");

    const r = tryAddSession(tmp, "manual commit", ["--no-commit"]);

    expect(r.status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(git(tmp, "log", "--oneline")).toBe(logBefore);
    expect(git(tmp, "status", "--porcelain")).toContain("journal-1.md");
  });

  it("rotates to a new journal file and records the entry there", () => {
    fs.writeFileSync(
      path.join(tmp, ".trellis", "config.yaml"),
      "session_auto_commit: true\nmax_journal_lines: 12\n",
    );

    const r = tryAddSession(tmp, "rotating work", ["--summary", "rotate"]);

    expect(r.status).toBe(0);
    expect(r.stderr).toContain("Exceeds 12 lines");
    expect(fs.existsSync(journalPath(tmp, 2))).toBe(true);
    expect(sessionNumbers(tmp, 2)).toEqual([1]);
    expect(readJournal(tmp, 1)).not.toContain("rotating work");
    expect(readIndex(tmp)).toContain("**Active File**: `journal-2.md`");
  });

  it("resumes a rotated entry without appending a second one", () => {
    fs.writeFileSync(
      path.join(tmp, ".trellis", "config.yaml"),
      "session_auto_commit: true\nmax_journal_lines: 12\n",
    );
    breakCommits(tmp);

    const first = tryAddSession(tmp, "rotated retry", ["--summary", "rotate"]);
    expect(first.status).toBe(1);

    repairCommits(tmp);
    const second = tryAddSession(tmp, "rotated retry", ["--summary", "rotate"]);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    expect(sessionNumbers(tmp, 2)).toEqual([1]);
    expect(countMarkers(tmp, 2)).toBe(1);
    expect(fs.existsSync(journalPath(tmp, 3))).toBe(false);
  });
});

describe.skipIf(!hasPython())("add_session.py session numbering", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-number-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not reuse a number already claimed on a concurrent branch", () => {
    runAddSession(tmp, "base work");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // Branch A records (and auto-commits) session 2.
    git(tmp, "checkout", "-q", "-b", "branch-a");
    runAddSession(tmp, "branch A work");
    expect(sessionNumbers(tmp)).toEqual([1, 2]);

    // Branch B forks from main, so its working tree only knows about
    // session 1. Deriving from the working tree alone would claim 2 again.
    git(tmp, "checkout", "-q", "main");
    git(tmp, "checkout", "-q", "-b", "branch-b");
    expect(sessionNumbers(tmp)).toEqual([1]);

    runAddSession(tmp, "branch B work");

    const numbers = sessionNumbers(tmp);
    expect(numbers).toEqual([1, 3]);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps numbering monotonic when the index counter is behind the journal", () => {
    runAddSession(tmp, "first");
    // Simulate a merge that kept both journal entries (merge=union) while
    // index.md resolved to the lower counter.
    fs.writeFileSync(
      indexPath(tmp),
      readIndex(tmp).replace("**Total Sessions**: 1", "**Total Sessions**: 0"),
    );

    runAddSession(tmp, "second");

    expect(sessionNumbers(tmp)).toEqual([1, 2]);
  });
});

/**
 * `get_repo_root` returns the nearest directory holding `.trellis/`, which is
 * not necessarily the git toplevel. Every git path the recorder builds has to
 * be interpreted relative to the Trellis root, not the git root.
 */
describe.skipIf(!hasPython())("add_session.py with .trellis below the git root", () => {
  let outer: string;
  let project: string;

  beforeEach(() => {
    outer = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-nested-"));
    git(outer, "init", "-q", "-b", "main");
    git(outer, "config", "user.email", "test@example.com");
    git(outer, "config", "user.name", "Test");
    project = path.join(outer, "project");
    stampTrellis(project);
    seedTask(project);
  });

  afterEach(() => {
    fs.rmSync(outer, { recursive: true, force: true });
  });

  it("verifies the committed record and still numbers a repeat as a new session", () => {
    const first = tryAddSession(project, "nested layout", [
      "--summary",
      "nested run",
    ]);
    expect(first.status).toBe(0);
    expect(first.stderr).toContain("Auto-committed");
    // The post-commit check re-reads the marker from `HEAD:<journal>`. A
    // git-root-relative lookup finds nothing here and reports a false block.
    expect(first.stderr).not.toContain("[BLOCKED] Checkpoint:");

    // The record is committed, so an identical request is a new session
    // rather than a "pending" one adopted for repair.
    const second = tryAddSession(project, "nested layout", [
      "--summary",
      "nested run",
    ]);
    expect(second.status).toBe(0);
    expect(second.stderr).not.toContain("[RESUME]");
    expect(sessionNumbers(project)).toEqual([1, 2]);
  });
});

describe.skipIf(!hasPython())("add_session.py outside any git repository", () => {
  let project: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-nogit-"));
    stampTrellis(project);
    // seedTask() commits via git; there is no repo here by design.
    makeTask(project, "task-a", "task-a prd\n");
    setCurrentTask(project, "task-a");
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it("records the session and exits 0 — a configured skip, not a retry loop", () => {
    // No git here means auto-commit can never succeed; that must be
    // COMMIT_BLOCKED (exit 0, like a gitignored .trellis/), not the
    // COMMIT_FAILED checkpoint whose "fix the git error" advice never applies.
    const result = tryAddSession(project, "no git", ["--summary", "no repo"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Not a git repository");
    expect(result.stderr).not.toContain("[BLOCKED] Checkpoint:");
    expect(sessionNumbers(project)).toEqual([1]);
  });
});
