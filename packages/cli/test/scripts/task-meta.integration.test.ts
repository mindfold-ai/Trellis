/**
 * Integration tests for `task.py create --meta` and `task.py set-meta`.
 *
 * The python code lives under
 * `src/templates/trellis/scripts/task.py` (subcommand wiring) and
 * `src/templates/trellis/scripts/common/task_store.py` (`cmd_create` /
 * `cmd_set_meta`); this test stamps the real templates into a fresh
 * `.trellis/` tree and exercises the actual CLI paths.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
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

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  const r = spawnSync(
    "python3",
    [".trellis/scripts/init_developer.py", DEVELOPER],
    { cwd: tmp, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    throw new Error(`init_developer failed: ${r.stderr}`);
  }
}

function runTask(repo: string, ...args: string[]) {
  return spawnSync("python3", [".trellis/scripts/task.py", ...args], {
    cwd: repo,
    encoding: "utf-8",
  });
}

function readTaskJson(repo: string, dirName: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(
      path.join(repo, ".trellis", "tasks", dirName, "task.json"),
      "utf-8",
    ),
  );
}

function findTaskDir(repo: string, needle: string): string {
  const dir = fs
    .readdirSync(path.join(repo, ".trellis", "tasks"))
    .find((d) => d.includes(needle));
  if (!dir) {
    throw new Error(`no task dir matching ${needle}`);
  }
  return dir;
}

describe.skipIf(!hasPython())("task.py meta (task.json.meta access)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-meta-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("create --meta (repeatable) populates task.json.meta", () => {
    const r = runTask(
      tmp,
      "create",
      "meta task",
      "--description",
      "regression fixture",
      "--slug",
      "meta-task",
      "--meta",
      "linear=ENG-123",
      "--meta",
      "epic=auth",
    );
    expect(r.status).toBe(0);

    const dir = findTaskDir(tmp, "meta-task");
    const data = readTaskJson(tmp, dir);
    expect(data.meta).toEqual({ linear: "ENG-123", epic: "auth" });
  });

  it("create --meta with a malformed value errors and names the bad value", () => {
    const r = runTask(
      tmp,
      "create",
      "bad meta task",
      "--description",
      "regression fixture",
      "--slug",
      "bad-meta-task",
      "--meta",
      "no-equals-sign",
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no-equals-sign");

    // No task directory should have been created for the malformed call.
    const dirs = fs.existsSync(path.join(tmp, ".trellis", "tasks"))
      ? fs.readdirSync(path.join(tmp, ".trellis", "tasks"))
      : [];
    expect(dirs.find((d) => d.includes("bad-meta-task"))).toBeUndefined();
  });

  it("create --meta with an empty key errors", () => {
    const r = runTask(
      tmp,
      "create",
      "empty key task",
      "--description",
      "regression fixture",
      "--slug",
      "empty-key-task",
      "--meta",
      "=value",
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("=value");
  });

  it("set-meta adds a new key and overwrites an existing one", () => {
    const createResult = runTask(
      tmp,
      "create",
      "set meta task",
      "--description",
      "regression fixture",
      "--slug",
      "set-meta-task",
    );
    expect(createResult.status).toBe(0);
    const dir = findTaskDir(tmp, "set-meta-task");
    const taskDir = `.trellis/tasks/${dir}`;

    const r1 = runTask(tmp, "set-meta", taskDir, "priority-note", "urgent");
    expect(r1.status).toBe(0);
    expect(readTaskJson(tmp, dir).meta).toEqual({ "priority-note": "urgent" });

    const r2 = runTask(tmp, "set-meta", taskDir, "priority-note", "later");
    expect(r2.status).toBe(0);
    expect(readTaskJson(tmp, dir).meta).toEqual({ "priority-note": "later" });
  });
});
