/**
 * Parent-child mutations reject malformed task records before writing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  fs.mkdirSync(path.join(tmp, ".trellis", "scripts"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(tmp, ".trellis", "scripts"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    "session_auto_commit: false\n",
  );
}

function makeTask(
  repo: string,
  name: string,
  overrides: Record<string, unknown> = {},
): string {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), `${name} prd\n`);
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify({
      ...emptyTaskRecord({ id: name, name, title: name, createdAt: "2026-08-19" }),
      ...overrides,
    }) + "\n",
  );
  return dir;
}

function runTask(repo: string, ...args: string[]) {
  return spawnSync("python3", [".trellis/scripts/task.py", ...args], {
    cwd: repo,
    encoding: "utf-8",
    env: { ...process.env },
  });
}

function readChildren(repo: string, name: string): unknown {
  return JSON.parse(
    fs.readFileSync(
      path.join(repo, ".trellis", "tasks", name, "task.json"),
      "utf-8",
    ),
  ).children;
}

function setChildren(repo: string, name: string, value: unknown): void {
  const file = path.join(repo, ".trellis", "tasks", name, "task.json");
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  data.children = value;
  fs.writeFileSync(file, JSON.stringify(data) + "\n");
}

const PARENT = "08-19-parent";

describe.skipIf(!hasPython())("non-list `children` in a parent task.json", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-children-test-"));
    setupRepo(tmp);
    makeTask(tmp, PARENT);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("`create --parent` refuses malformed parent metadata before creating a child", () => {
    setChildren(tmp, PARENT, null);
    const tasksBefore = fs.readdirSync(path.join(tmp, ".trellis", "tasks"));
    const r = runTask(
      tmp,
      "create",
      "Child",
      "--description",
      "d",
      "--slug",
      "kid",
      "--parent",
      `.trellis/tasks/${PARENT}`,
      "--no-start",
    );
    expect(r.stderr).not.toContain("TypeError");
    expect(r.status).not.toBe(0);
    expect(fs.readdirSync(path.join(tmp, ".trellis", "tasks")).filter((name) => name !== "archive")).toEqual(tasksBefore);
    expect(readChildren(tmp, PARENT)).toBeNull();
  });

  it("`add-subtask` rejects a missing lifecycle generation without rewriting metadata", () => {
    const child = "08-19-standalone";
    makeTask(tmp, child);
    const parentJson = path.join(tmp, ".trellis", "tasks", PARENT, "task.json");
    const parentData = JSON.parse(fs.readFileSync(parentJson, "utf-8"));
    delete parentData.lifecycle_generation;
    const original = JSON.stringify(parentData) + "\n";
    fs.writeFileSync(parentJson, original);

    const result = runTask(
      tmp,
      "add-subtask",
      `.trellis/tasks/${PARENT}`,
      `.trellis/tasks/${child}`,
    );
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(parentJson, "utf-8")).toBe(original);
    expect(readChildren(tmp, PARENT)).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "08-19-not-a-list"],
    ["a number", 42],
    ["an object", { "08-19-kid": true }],
  ])("`add-subtask` rejects %s without writing", (_label, value) => {
    const child = "08-19-standalone";
    makeTask(tmp, child);
    setChildren(tmp, PARENT, value);

    const r = runTask(
      tmp,
      "add-subtask",
      `.trellis/tasks/${PARENT}`,
      `.trellis/tasks/${child}`,
    );
    expect(r.stderr).not.toContain("TypeError");
    expect(r.status).not.toBe(0);
    expect(readChildren(tmp, PARENT)).toEqual(value);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, ".trellis", "tasks", child, "task.json"), "utf-8")).parent).toBeNull();
  });

  it("`remove-subtask` refuses malformed parent metadata without unlinking", () => {
    const child = "08-19-standalone";
    makeTask(tmp, child, { parent: PARENT });
    setChildren(tmp, PARENT, null);

    const r = runTask(
      tmp,
      "remove-subtask",
      `.trellis/tasks/${PARENT}`,
      `.trellis/tasks/${child}`,
    );
    expect(r.stderr).not.toContain("TypeError");
    expect(r.status).not.toBe(0);
    expect(readChildren(tmp, PARENT)).toBeNull();
    expect(JSON.parse(fs.readFileSync(path.join(tmp, ".trellis", "tasks", child, "task.json"), "utf-8")).parent).toBe(PARENT);
  });
});
