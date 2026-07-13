/**
 * Integration tests for `task.py archive` auto-commit behavior.
 *
 * The python script lives under
 * `src/templates/trellis/scripts/common/task_store.py`; this test stamps
 * the templates into a fresh git repo and exercises the real `python3
 * task.py archive` path. Two scenarios:
 *
 *   1. Scope-creep — archive must NOT bundle dirty changes from OTHER
 *      active task dirs into the archive commit.
 *   2. Phantom-delete — after `shutil.move` of a tracked task dir, the
 *      source-side deletions must land in the archive commit (so the
 *      working tree stays clean against HEAD).
 *   3. Commit-failure visibility — if the archive move succeeds but git
 *      cannot create the bookkeeping commit, `task.py archive` must fail
 *      loudly so callers do not continue to journal over dirty deletes.
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
  // Local commit identity so commit() works in CI without global config.
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");

  // Stamp the real templates into the test repo.
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  // session_auto_commit must be enabled for the archive to commit.
  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    "session_auto_commit: true\n",
  );
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
      createdAt: "2026-05-13",
      assignee: "test",
      creator: "test",
      subtasks: [],
      children: [],
      relatedFiles: [],
      meta: {},
    }) + "\n",
  );
}

function runArchive(repo: string, taskName: string): void {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/task.py", "archive", taskName],
    { cwd: repo, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    throw new Error(`archive failed: ${r.stderr}`);
  }
}

describe.skipIf(!hasPython())(
  "task.py archive auto-commit",
  () => {
    let tmp: string;

    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-archive-test-"));
      setupRepo(tmp);
    });

    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it("does not bundle dirty changes from other task dirs (scope-creep fix)", () => {
      makeTask(tmp, "task-a", "task A prd\n");
      makeTask(tmp, "task-b", "task B prd v1\n");
      git(tmp, "add", "-A");
      git(tmp, "commit", "-q", "-m", "initial");

      // Dirty edit in task-b BEFORE archiving task-a.
      fs.appendFileSync(
        path.join(tmp, ".trellis", "tasks", "task-b", "prd.md"),
        "DIRTY EDIT IN TASK-B SHOULD NOT BE COMMITTED\n",
      );

      runArchive(tmp, "task-a");

      // Last commit: which files?
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

      // task-b paths must NOT appear in the archive commit.
      const leaked = lastFiles.filter((f) => f.includes("/task-b/"));
      expect(leaked).toEqual([]);

      // task-b dirty change still in working tree.
      const status = git(tmp, "status", "--porcelain");
      expect(status).toMatch(/M\s+\.trellis\/tasks\/task-b\/prd\.md/);
    });

    it(
      "stages source-side deletions in the archive commit (phantom-delete fix)",
      () => {
        makeTask(tmp, "big", "# big task\n");
        // Add many files under research/ to mimic the production case that
        // surfaced the bug.
        const researchDir = path.join(
          tmp,
          ".trellis",
          "tasks",
          "big",
          "research",
        );
        fs.mkdirSync(researchDir, { recursive: true });
        for (let i = 0; i < 100; i++) {
          fs.writeFileSync(
            path.join(researchDir, `file-${i}.json`),
            `{"n":${i}}\n`,
          );
        }
        git(tmp, "add", "-A");
        git(tmp, "commit", "-q", "-m", "initial");

        runArchive(tmp, "big");

        // Working tree must be clean (no phantom deletes against HEAD).
        const status = git(tmp, "status", "--porcelain");
        const meaningful = status
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !s.includes("__pycache__")); // ignore .pyc noise
        expect(meaningful).toEqual([]);

        // Archive commit has deletions at the source location.
        const deletes = git(
          tmp,
          "show",
          "HEAD",
          "--diff-filter=D",
          "--name-only",
          "--pretty=format:",
        )
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        expect(deletes.length).toBeGreaterThan(0);
        expect(
          deletes.every((p) => p.startsWith(".trellis/tasks/big/")),
        ).toBe(true);
      },
      30_000, // python startup + 100-file ops can be slow
    );

    it("refuses to archive a mistyped name that resolves to a real source dir", () => {
      makeTask(tmp, "real-task", "# real task\n");
      // A user source directory that is NOT a task.
      const srcDir = path.join(tmp, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "index.ts"), "export const x = 1;\n");
      git(tmp, "add", "-A");
      git(tmp, "commit", "-q", "-m", "initial");

      // Typo: `archive src` instead of a task name. resolve_task_dir falls
      // back to repo_root/src; without the guard this moves the whole source
      // dir into .trellis/tasks/archive/.
      const r = spawnSync(
        "python3",
        [".trellis/scripts/task.py", "archive", "src"],
        { cwd: tmp, encoding: "utf-8" },
      );

      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("refusing to archive");
      // src/ untouched, still at its original location with its file.
      expect(fs.existsSync(path.join(srcDir, "index.ts"))).toBe(true);
      // No archive dir was created holding a moved src.
      expect(
        fs.existsSync(
          path.join(tmp, ".trellis", "tasks", "archive"),
        ),
      ).toBe(false);
    });

    it("fails when archive auto-commit cannot record tracked source deletes", () => {
      makeTask(tmp, "tracked", "# tracked task\n");
      git(tmp, "add", "-A");
      git(tmp, "commit", "-q", "-m", "initial");

      // Simulate a repo where git can stage the archive move but cannot
      // create the commit. A failing hook is deterministic even when the
      // developer machine has global git identity configured.
      const hookPath = path.join(tmp, ".git", "hooks", "pre-commit");
      fs.writeFileSync(
        hookPath,
        "#!/bin/sh\necho archive commit blocked >&2\nexit 1\n",
      );
      fs.chmodSync(hookPath, 0o755);

      const r = spawnSync(
        "python3",
        [".trellis/scripts/task.py", "archive", "tracked"],
        { cwd: tmp, encoding: "utf-8" },
      );

      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("Archive moved on disk");
      expect(r.stderr).toContain("Auto-commit failed");

      const status = git(tmp, "status", "--porcelain");
      expect(status).toContain(".trellis/tasks/tracked/");
      expect(status).toContain(".trellis/tasks/archive/");
    });
  },
);
