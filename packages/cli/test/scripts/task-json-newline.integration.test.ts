/**
 * Integration test for the trailing newline `write_json` emits.
 *
 * The python scripts live under `src/templates/trellis/scripts`; this test
 * stamps them into a fresh git repo and exercises the real
 * `python3 task.py start` path.
 *
 * Every task.json this writes is a reviewed file, and a missing final byte is
 * a review finding on each PR that touches one.
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

const TASK = "01-01-newline-task";

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

function runStart(repo: string) {
  return spawnSync("python3", [".trellis/scripts/task.py", "start", TASK], {
    cwd: repo,
    encoding: "utf-8",
  });
}

describe.skipIf(!hasPython())("task.py start writes task.json", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-json-test-"));
    setupRepo(tmp);
    makeTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("flips status to in_progress", () => {
    const r = runStart(tmp);
    expect(r.status).toBe(0);
    const raw = fs.readFileSync(
      path.join(tmp, ".trellis", "tasks", TASK, "task.json"),
      "utf-8",
    );
    expect(JSON.parse(raw).status).toBe("in_progress");
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
