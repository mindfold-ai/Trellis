import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertProjectPath } from "../src/path-boundary.js";

describe("assertProjectPath", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts an absent path within the project", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-path-"));
    roots.push(root);
    expect(assertProjectPath(".trellis/tasks/new/task.json", root)).toBe(
      path.join(fs.realpathSync(root), ".trellis/tasks/new/task.json"),
    );
  });

  it("rejects relative traversal and an internal link to an external target", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-path-"));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-external-"));
    roots.push(root, external);
    expect(() => assertProjectPath("../outside", root)).toThrow("outside the project");
    fs.symlinkSync(external, path.join(root, "linked"));
    expect(() => assertProjectPath("linked/task.json", root)).toThrow("resolves outside the project");
  });

  it("accepts an explicitly absolute external storage path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-path-"));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-external-"));
    roots.push(root, external);
    expect(assertProjectPath(path.join(external, "state.json"), root)).toBe(
      path.join(fs.realpathSync(external), "state.json"),
    );
  });

  it("accepts a linked current storage root and a linked task directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-path-"));
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-store-"));
    const task = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-task-"));
    roots.push(root, storage, task);
    fs.symlinkSync(storage, path.join(root, ".trellis"));
    fs.mkdirSync(path.join(storage, "tasks"));
    fs.symlinkSync(task, path.join(storage, "tasks", "current"));
    expect(assertProjectPath(".trellis/config.yaml", root)).toBe(
      path.join(fs.realpathSync(storage), "config.yaml"),
    );
    expect(assertProjectPath(".trellis/tasks/current/task.json", root)).toBe(
      path.join(fs.realpathSync(task), "task.json"),
    );
  });
});
