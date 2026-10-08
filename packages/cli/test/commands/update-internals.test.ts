import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cleanupEmptyDirs,
  loadUpdateSkipPaths,
  shouldExcludeFromBackup,
} from "../../src/commands/update.js";

describe("same-version update helpers", () => {
  let root: string;
  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads configured skip paths", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-update-config-"));
    fs.mkdirSync(path.join(root, ".trellis"));
    fs.writeFileSync(
      path.join(root, ".trellis/config.yaml"),
      "update:\n  skip:\n    - '.claude/custom/'\n",
    );
    expect(loadUpdateSkipPaths(root)).toContain(".claude/custom/");
  });

  it("excludes task and spec data from backup traversal", () => {
    expect(shouldExcludeFromBackup(".trellis/tasks/example/task.json")).toBe(
      true,
    );
    expect(shouldExcludeFromBackup(".trellis/spec/cli/index.md")).toBe(true);
    expect(shouldExcludeFromBackup(".trellis/workflow.md")).toBe(false);
  });

  it("does not remove managed roots during empty-directory cleanup", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-update-cleanup-"));
    fs.mkdirSync(path.join(root, ".trellis/scripts/empty"), {
      recursive: true,
    });
    cleanupEmptyDirs(root, ".trellis/scripts/empty");
    expect(fs.existsSync(path.join(root, ".trellis"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".trellis/scripts/empty"))).toBe(
      false,
    );
  });
});
