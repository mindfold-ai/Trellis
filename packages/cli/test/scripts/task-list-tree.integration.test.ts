/**
 * Integration tests for `task.py list` tree rendering (#402).
 *
 * The python script lives under
 * `src/templates/trellis/scripts/task.py` (+ `common/task_store.py` for
 * `set-meta`); this test stamps the real templates into a fresh git repo
 * and exercises the actual `python3 task.py list` / `list --json` /
 * `create --meta` / `set-meta` paths.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task";

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

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });
}

function makeTask(
  repo: string,
  name: string,
  overrides: Record<string, unknown> = {},
): void {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), `${name} prd\n`);
  const taskJson: Record<string, unknown> = {
    ...emptyTaskRecord({ id: name, name, title: name, createdAt: "2026-07-22" }),
    ...overrides,
  };
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify(taskJson) + "\n",
  );
}

function runTask(repo: string, ...args: string[]) {
  return spawnSync("python3", [".trellis/scripts/task.py", ...args], {
    cwd: repo,
    encoding: "utf-8",
  });
}

describe.skipIf(!hasPython())("task.py list tree view (#402)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-list-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("indents children under their parent", () => {
    makeTask(tmp, "07-01-parent-task", {
      status: "in_progress",
      children: ["07-02-child-a", "07-03-child-b"],
    });
    makeTask(tmp, "07-02-child-a", {
      status: "planning",
      parent: "07-01-parent-task",
    });
    makeTask(tmp, "07-03-child-b", {
      status: "completed",
      parent: "07-01-parent-task",
    });

    const r = runTask(tmp, "list");
    expect(r.status).toBe(0);
    const lines = r.stdout.split("\n").map((l) => l.trimEnd());
    const parentIdx = lines.findIndex((l) => l.includes("07-01-parent-task/"));
    const childAIdx = lines.findIndex((l) => l.includes("07-02-child-a/"));
    const childBIdx = lines.findIndex((l) => l.includes("07-03-child-b/"));
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(childAIdx).toBeGreaterThan(parentIdx);
    expect(childBIdx).toBeGreaterThan(parentIdx);
    // Children are indented further than the parent.
    const parentIndent = lines[parentIdx].match(/^\s*/)?.[0].length ?? 0;
    const childIndent = lines[childAIdx].match(/^\s*/)?.[0].length ?? 0;
    expect(childIndent).toBeGreaterThan(parentIndent);
  });

  it("renders a flat task with no parent/children unchanged", () => {
    makeTask(tmp, "07-05-flat-task", { status: "planning" });

    const r = runTask(tmp, "list");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("07-05-flat-task/");
  });

  it("renders a dangling parent ref flat without erroring (orphan safety)", () => {
    makeTask(tmp, "07-06-orphan", {
      status: "planning",
      parent: "does-not-exist",
    });

    const r = runTask(tmp, "list");
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("07-06-orphan/");
  });

  it("--json includes parent and children fields", () => {
    makeTask(tmp, "07-01-parent-task", {
      status: "in_progress",
      children: ["07-02-child-a"],
    });
    makeTask(tmp, "07-02-child-a", {
      status: "planning",
      parent: "07-01-parent-task",
    });

    const r = runTask(tmp, "list", "--json");
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout) as {
      tasks: { dir: string; parent: string | null; children: string[] }[];
    };
    const parent = data.tasks.find((t) => t.dir.endsWith("07-01-parent-task"));
    const child = data.tasks.find((t) => t.dir.endsWith("07-02-child-a"));
    expect(parent?.children).toEqual(["07-02-child-a"]);
    expect(child?.parent).toBe("07-01-parent-task");
  });

  it("rejects task records with unknown top-level fields", () => {
    makeTask(tmp, "07-07-unknown", { unexpectedField: "unsupported" });

    const listed = runTask(tmp, "list", "--json");
    expect(listed.status).toBe(0);
    expect(listed.stdout).not.toContain("07-07-unknown");

    const taskPath = path.join(tmp, ".trellis", "tasks", "07-07-unknown", "task.json");
    const before = fs.readFileSync(taskPath, "utf-8");
    const updated = runTask(tmp, "set-meta", "07-07-unknown", "key=value");
    expect(updated.status).not.toBe(0);
    expect(fs.readFileSync(taskPath, "utf-8")).toBe(before);
  });

  it.each([
    ["missing source", (task: Record<string, unknown>) => { delete task.source; }],
    ["missing title", (task: Record<string, unknown>) => { delete task.title; }],
    ["invalid id", (task: Record<string, unknown>) => { task.id = "bad id"; }],
    ["invalid title", (task: Record<string, unknown>) => { task.title = 3; }],
    ["invalid children", (task: Record<string, unknown>) => { task.children = [3]; }],
    ["invalid related files", (task: Record<string, unknown>) => { task.relatedFiles = [false]; }],
    ["invalid source", (task: Record<string, unknown>) => { task.source = { kind: "issue", repo_ref: "bad", number: 1, disposition: [] }; }],
    ["invalid branch", (task: Record<string, unknown>) => { task.branch = 1; }],
    ["invalid meta", (task: Record<string, unknown>) => { task.meta = []; }],
  ])("rejects %s task metadata without rewriting it", (_label, mutate) => {
    const name = "07-08-invalid";
    makeTask(tmp, name);
    const taskPath = path.join(tmp, ".trellis", "tasks", name, "task.json");
    const task = JSON.parse(fs.readFileSync(taskPath, "utf-8")) as Record<string, unknown>;
    mutate(task);
    const before = JSON.stringify(task) + "\n";
    fs.writeFileSync(taskPath, before);

    const listed = runTask(tmp, "list", "--json");
    expect(listed.status).toBe(0);
    expect(listed.stdout).not.toContain(name);

    const updated = runTask(tmp, "set-meta", name, "key=value");
    expect(updated.status).not.toBe(0);
    expect(fs.readFileSync(taskPath, "utf-8")).toBe(before);
  });

  it("refuses to replace an invalid task record with valid input", () => {
    const name = "07-09-invalid-existing";
    makeTask(tmp, name);
    const taskPath = path.join(tmp, ".trellis", "tasks", name, "task.json");
    const incomplete = { ...emptyTaskRecord({ id: name, name }) } as Record<string, unknown>;
    delete incomplete.source;
    const before = JSON.stringify(incomplete) + "\n";
    fs.writeFileSync(taskPath, before);

    const result = spawnSync("python3", ["-c", [
      "import json, sys",
      "from pathlib import Path",
      "sys.path.insert(0, '.trellis/scripts')",
      "from common.io import write_json",
      "print(write_json(Path(sys.argv[1]), json.loads(sys.stdin.read())))",
    ].join("\n"), taskPath], {
      cwd: tmp,
      encoding: "utf-8",
      input: JSON.stringify(emptyTaskRecord({ id: name, name })),
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("False");
    expect(fs.readFileSync(taskPath, "utf-8")).toBe(before);
  });
});
