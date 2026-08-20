/**
 * Integration tests for the `task.py start` pre-start gate and for the
 * trailing newline `write_json` now emits.
 *
 * The python scripts live under `src/templates/trellis/scripts`; this test
 * stamps them into a fresh git repo and exercises the real
 * `python3 task.py start` path.
 *
 * The gate exists so a repository can refuse a start BEFORE any state is
 * written. `after_start` hooks cannot do this — they run once the status
 * flip has already landed, and run_task_hooks only warns on failure.
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
    throw new Error(`git ${args.join(" ")} failed (rc=${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", "main");
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");

  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });
  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    "session_auto_commit: false\n",
  );
}

const TASK = "01-01-gated-task";

function makeTask(repo: string): void {
  const dir = path.join(repo, ".trellis", "tasks", TASK);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), "prd\n");
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify({
      id: TASK,
      name: TASK,
      title: TASK,
      status: "planning",
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

/** Write a gate that always exits with `code`. */
function writeGate(repo: string, code: number): void {
  const dest = path.join(repo, "scripts", "trellis-task-start-gate.py");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    `import sys\nsys.stderr.write("gate saw " + sys.argv[1] + "\\n")\nsys.exit(${code})\n`,
  );
}

function runStart(repo: string) {
  return spawnSync("python3", [".trellis/scripts/task.py", "start", TASK], {
    cwd: repo,
    encoding: "utf-8",
  });
}

function statusOf(repo: string): string {
  const raw = fs.readFileSync(
    path.join(repo, ".trellis", "tasks", TASK, "task.json"),
    "utf-8",
  );
  return JSON.parse(raw).status;
}

describe.skipIf(!hasPython())("task.py start pre-start gate", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-start-gate-test-"));
    setupRepo(tmp);
    makeTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("starts normally when the repository defines no gate", () => {
    const r = runStart(tmp);
    expect(r.status).toBe(0);
    expect(statusOf(tmp)).toBe("in_progress");
  });

  it("starts when the gate exits 0", () => {
    writeGate(tmp, 0);
    const r = runStart(tmp);
    expect(r.status).toBe(0);
    expect(statusOf(tmp)).toBe("in_progress");
  });

  it("refuses the start, and writes no state, when the gate exits nonzero", () => {
    writeGate(tmp, 3);
    const r = runStart(tmp);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("pre-start gate refused this task");
    // The whole point of a PRE-start gate: status is untouched.
    expect(statusOf(tmp)).toBe("planning");
  });

  it("passes the absolute task directory to the gate", () => {
    writeGate(tmp, 1);
    const r = runStart(tmp);
    expect(r.stderr).toContain(path.join(".trellis", "tasks", TASK));
    expect(r.stderr).toContain("gate saw ");
  });

  it("writes task.json with a trailing newline", () => {
    const r = runStart(tmp);
    expect(r.status).toBe(0);
    const raw = fs.readFileSync(
      path.join(tmp, ".trellis", "tasks", TASK, "task.json"),
      "utf-8",
    );
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
  });
});
