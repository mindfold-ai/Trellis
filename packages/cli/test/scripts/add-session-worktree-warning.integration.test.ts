/**
 * Integration test for `add_session.py`'s worktree parallel-session warning
 * (#415 quick-fix tier, PRD requirement 4).
 *
 * When `add_session.py` detects it is running inside a linked git worktree
 * (not the main working tree) AND `session_auto_commit` resolves true, it
 * must print a one-time, non-blocking yellow note pointing at the
 * "Workspace Journal Merge Behavior" doc section. It must stay silent in the
 * main working tree, and stay silent when `session_auto_commit` is false.
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

function setupRepo(tmp: string, autoCommit: boolean): void {
  fs.mkdirSync(tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", "main");
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");

  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    `session_auto_commit: ${autoCommit}\n`,
  );

  const r = spawnSync(
    "python3",
    [".trellis/scripts/init_developer.py", DEVELOPER],
    { cwd: tmp, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    throw new Error(`init_developer failed: ${r.stderr}`);
  }

  // .trellis/.developer, .current-task, and .runtime/ are gitignored by
  // design (session-local state) — commit everything else so a linked
  // worktree checkout has the scripts/config/journal/index.
  git(tmp, "add", "-A");
  git(tmp, "commit", "-q", "-m", "initial");
}

function runAddSession(
  repo: string,
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/add_session.py", "--title", "parallel session", "--no-commit"],
    { cwd: repo, encoding: "utf-8" },
  );
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

describe.skipIf(!hasPython())("add_session.py worktree warning", () => {
  let tmp: string;
  let worktreeDir: string | null;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-worktree-warn-"));
    worktreeDir = null;
  });

  afterEach(() => {
    if (worktreeDir) {
      spawnSync("git", ["worktree", "remove", "--force", worktreeDir], {
        cwd: tmp,
      });
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("stays silent in the main working tree even with auto-commit enabled", () => {
    setupRepo(tmp, true);

    const r = runAddSession(tmp);

    expect(r.stderr).not.toContain("[NOTE]");
  });

  it("warns once when running inside a linked worktree with auto-commit enabled", () => {
    setupRepo(tmp, true);

    worktreeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-worktree-warn-linked-"),
    );
    fs.rmdirSync(worktreeDir);
    git(tmp, "worktree", "add", worktreeDir, "-b", "feature-x");

    // Developer identity is gitignored (session-local), so a fresh worktree
    // checkout does not carry it over — set it directly for this worktree.
    fs.writeFileSync(
      path.join(worktreeDir, ".trellis", ".developer"),
      `name=${DEVELOPER}\n`,
    );

    const r = spawnSync(
      "python3",
      [
        ".trellis/scripts/add_session.py",
        "--title",
        "parallel session",
        "--no-commit",
      ],
      { cwd: worktreeDir, encoding: "utf-8" },
    );

    expect(r.stderr).toContain("[NOTE]");
    expect(r.stderr).toContain("directory-structure.md");
  });

  it("stays silent in a linked worktree when session_auto_commit is false", () => {
    setupRepo(tmp, false);

    worktreeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-worktree-warn-off-"),
    );
    fs.rmdirSync(worktreeDir);
    git(tmp, "worktree", "add", worktreeDir, "-b", "feature-y");

    fs.writeFileSync(
      path.join(worktreeDir, ".trellis", ".developer"),
      `name=${DEVELOPER}\n`,
    );

    const r = spawnSync(
      "python3",
      [
        ".trellis/scripts/add_session.py",
        "--title",
        "parallel session",
        "--no-commit",
      ],
      { cwd: worktreeDir, encoding: "utf-8" },
    );

    expect(r.stderr).not.toContain("[NOTE]");
  });
});
