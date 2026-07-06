/**
 * Integration test for `add_session.py` auto-commit scope.
 *
 * The python script lives under
 * `src/templates/trellis/scripts/add_session.py`; this test stamps the real
 * templates into a fresh git repo and exercises the actual `python3
 * add_session.py` auto-commit path.
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

function makeTask(repo: string, name: string, prdBody: string): void {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), prdBody);
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify({
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
    }) + "\n",
  );
}

/**
 * Point the active-task resolver at `taskName`. With exactly one session file
 * present, `resolve_active_task` uses the single-session fallback, so
 * `get_current_task` returns this task without needing a platform context.
 */
function setCurrentTask(repo: string, taskName: string): void {
  const sessionsDir = path.join(
    repo,
    ".trellis",
    ".runtime",
    "sessions",
  );
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, "session.json"),
    JSON.stringify({
      current_task: `.trellis/tasks/${taskName}`,
      platform: "session",
    }) + "\n",
  );
}

function runAddSession(repo: string, title: string): void {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/add_session.py", "--title", title],
    { cwd: repo, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    throw new Error(`add_session failed: ${r.stderr}`);
  }
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

  it("uses explicit fallback text instead of journal placeholders", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "placeholder-free work");

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );

    expect(journal).toContain(
      "- Detailed change bullets were not supplied; see the summary above.",
    );
    expect(journal).toContain("- Validation was not recorded for this session.");
    expect(journal).not.toContain("(Add details)");
    expect(journal).not.toContain("(Add test results)");
    expect(journal).not.toContain("(Add summary)");
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

    const lastFiles = git(tmp, "show", "HEAD", "--name-only", "--pretty=format:")
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
});
