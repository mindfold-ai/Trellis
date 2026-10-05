/**
 * Regression coverage for archive commit scope in real temporary git repositories.
 * Preserve staged/unstaged edits in other archived tasks (#630), while retaining
 * auto-commits for never-tracked task directories (#629).
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

describe.skipIf(!hasPython())("task.py archive commit scope", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-archive-scope-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it.each(["staged", "unstaged"])(
    "keeps %s edits to another archived task out of the archive commit (#630)",
    (state) => {
      makeTask(tmp, "task-a", "task A prd\n");
      makeTask(tmp, "task-b", "task B prd\n");
      git(
        tmp,
        "add",
        ".trellis/scripts",
        ".trellis/config.yaml",
        ".trellis/tasks",
      );
      git(tmp, "commit", "-q", "-m", "initial");
      runArchive(tmp, "task-b");

      const archivedFiles = git(
        tmp,
        "ls-files",
        ".trellis/tasks/archive",
      ).split("\n");
      const otherPrd = archivedFiles.find((file) =>
        file.endsWith("/task-b/prd.md"),
      );
      expect(otherPrd).toBeDefined();
      if (!otherPrd) throw new Error("task-b was not archived");

      fs.appendFileSync(path.join(tmp, otherPrd), "unrelated archived edit\n");
      if (state === "staged") git(tmp, "add", otherPrd);

      runArchive(tmp, "task-a");

      const lastFiles = git(
        tmp,
        "show",
        "HEAD",
        "--name-only",
        "--pretty=format:",
      ).split("\n");
      expect(lastFiles.some((file) => file.includes("/task-a/"))).toBe(true);
      expect(lastFiles.some((file) => file.includes("/task-b/"))).toBe(false);
      expect(git(tmp, "show", `HEAD:${otherPrd}`)).toBe("task B prd");

      // Preserve the developer's original index state as well as the edit.
      expect(git(tmp, "diff", "--cached", "--name-only", "--", otherPrd)).toBe(
        state === "staged" ? otherPrd : "",
      );
      expect(git(tmp, "diff", "--name-only", "--", otherPrd)).toBe(
        state === "unstaged" ? otherPrd : "",
      );
    },
  );

  it("auto-commits a task that was never tracked before archiving (#629)", () => {
    git(tmp, "add", ".trellis/scripts", ".trellis/config.yaml");
    git(tmp, "commit", "-q", "-m", "initial");
    makeTask(tmp, "untracked", "untracked task prd\n");

    runArchive(tmp, "untracked");

    expect(git(tmp, "log", "-1", "--pretty=%s")).toBe(
      "chore(task): archive untracked",
    );
    const lastFiles = git(
      tmp,
      "show",
      "HEAD",
      "--name-only",
      "--pretty=format:",
    ).split("\n");
    expect(lastFiles.some((file) => file.endsWith("/untracked/prd.md"))).toBe(
      true,
    );
    expect(
      lastFiles.every((file) => file.startsWith(".trellis/tasks/archive/")),
    ).toBe(true);
  });
});
