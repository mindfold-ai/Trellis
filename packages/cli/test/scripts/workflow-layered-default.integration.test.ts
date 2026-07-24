/**
 * Integration tests for the layered workflow default resolution
 * (`common/workflow_selection.py`).
 *
 * A task's workflow is resolved through a precedence chain, highest to lowest,
 * each layer mapping an id to `.trellis/workflows/<id>.md` and falling through
 * when unset, invalid, or naming a missing file:
 *   1. Per-task pin  — active task's task.json `workflow`.
 *   2. Personal      — `.developer` `workflow=<id>` (gitignored, per-developer).
 *   3. Team default  — config.yaml `default_workflow` (git-tracked, shared).
 *   4. Global        — `.trellis/workflow.md`.
 *
 * With neither a pin nor the personal/team keys set, resolution is identical to
 * reading the global `.trellis/workflow.md` (the pre-feature behavior).
 *
 * Scripts are stamped into a fresh temp dir and exercised through the real
 * `python3` interpreter (no mocking of file I/O or config parsing).
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

interface RepoOpts {
  config?: string;
  developer?: string;
  /** task.json `workflow` value; "" writes a task with no field; undefined = no task. */
  taskWorkflow?: string;
  variants?: string[];
}

function setupRepo(
  tmp: string,
  { config, developer, taskWorkflow, variants = ["native", "tdd", "channel"] }: RepoOpts,
): string | null {
  const tr = path.join(tmp, ".trellis");
  fs.mkdirSync(path.join(tr, "scripts"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(tr, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(tr, "workflows"), { recursive: true });
  fs.writeFileSync(path.join(tr, "workflow.md"), "GLOBAL");
  for (const v of variants) {
    fs.writeFileSync(path.join(tr, "workflows", `${v}.md`), v.toUpperCase());
  }
  if (config !== undefined) fs.writeFileSync(path.join(tr, "config.yaml"), config);
  if (developer !== undefined) fs.writeFileSync(path.join(tr, ".developer"), developer);

  if (taskWorkflow === undefined) return null;
  const taskDir = path.join(tr, "tasks", "t1");
  fs.mkdirSync(taskDir, { recursive: true });
  const data: Record<string, string> = { id: "t1", status: "in_progress" };
  if (taskWorkflow) data.workflow = taskWorkflow;
  fs.writeFileSync(path.join(taskDir, "task.json"), JSON.stringify(data));
  return taskDir;
}

const DRIVER = [
  "import sys",
  "from pathlib import Path",
  "repo = sys.argv[1]",
  "task = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None",
  "sys.path.insert(0, repo + '/.trellis/scripts')",
  "from common.workflow_selection import workflow_md_for_task",
  "p = workflow_md_for_task(Path(repo), Path(task) if task else None)",
  "print(Path(p).relative_to(repo).as_posix())",
].join("\n");

function resolve(tmp: string, taskDir: string | null): string {
  const r = spawnSync("python3", ["-c", DRIVER, tmp, taskDir ?? ""], {
    cwd: tmp,
    encoding: "utf-8",
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}

describe.skipIf(!hasPython())("layered workflow default resolution", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "wf-layered-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("no config, no task -> global (byte-identical pre-feature behavior)", () => {
    setupRepo(tmp, {});
    expect(resolve(tmp, null)).toBe(".trellis/workflow.md");
  });

  it("team default only -> team variant", () => {
    setupRepo(tmp, { config: "default_workflow: tdd\n" });
    expect(resolve(tmp, null)).toBe(".trellis/workflows/tdd.md");
  });

  it("personal override outranks team default", () => {
    const taskDir = setupRepo(tmp, {
      config: "default_workflow: tdd\n",
      developer: "name=x\nworkflow=native\n",
      taskWorkflow: "",
    });
    expect(resolve(tmp, taskDir)).toBe(".trellis/workflows/native.md");
  });

  it("per-task pin outranks personal and team", () => {
    const taskDir = setupRepo(tmp, {
      config: "default_workflow: tdd\n",
      developer: "name=x\nworkflow=native\n",
      taskWorkflow: "channel",
    });
    expect(resolve(tmp, taskDir)).toBe(".trellis/workflows/channel.md");
  });

  it("team default naming a missing file falls through to global", () => {
    setupRepo(tmp, { config: "default_workflow: nope\n" });
    expect(resolve(tmp, null)).toBe(".trellis/workflow.md");
  });

  it("commented default_workflow is ignored -> global", () => {
    setupRepo(tmp, { config: "# default_workflow: tdd\n" });
    expect(resolve(tmp, null)).toBe(".trellis/workflow.md");
  });

  it("personal override naming a missing file falls back to team", () => {
    setupRepo(tmp, {
      config: "default_workflow: tdd\n",
      developer: "name=x\nworkflow=nope\n",
    });
    expect(resolve(tmp, null)).toBe(".trellis/workflows/tdd.md");
  });

  it("per-task pin naming a missing file falls through to personal", () => {
    const taskDir = setupRepo(tmp, {
      developer: "name=x\nworkflow=native\n",
      taskWorkflow: "ghost",
    });
    expect(resolve(tmp, taskDir)).toBe(".trellis/workflows/native.md");
  });

  it(".developer with only name= is backward-safe (no personal override)", () => {
    setupRepo(tmp, { developer: "name=tommy\n" });
    expect(resolve(tmp, null)).toBe(".trellis/workflow.md");
  });

  it("task with no workflow field uses the default chain", () => {
    const taskDir = setupRepo(tmp, {
      config: "default_workflow: tdd\n",
      taskWorkflow: "",
    });
    expect(resolve(tmp, taskDir)).toBe(".trellis/workflows/tdd.md");
  });

  it("invalid per-task id (path traversal) warns and falls through", () => {
    const taskDir = setupRepo(tmp, {
      config: "default_workflow: tdd\n",
      taskWorkflow: "../../etc/passwd",
    });
    const r = spawnSync("python3", ["-c", DRIVER, tmp, taskDir ?? ""], {
      cwd: tmp,
      encoding: "utf-8",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(".trellis/workflows/tdd.md");
    expect(r.stderr).toContain("invalid workflow id");
  });
});
