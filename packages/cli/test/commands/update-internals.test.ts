/**
 * Tests for internal helper functions exported from update.ts
 *
 * These test cleanupEmptyDirs and sortMigrationsForExecution
 * to cover command-level behavior that was previously untested.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cleanupEmptyDirs,
  loadUpdateSkipPaths,
  shouldExcludeFromBackup,
  sortMigrationsForExecution,
} from "../../src/commands/update.js";

// =============================================================================
// cleanupEmptyDirs
// =============================================================================

describe("cleanupEmptyDirs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-cleanup-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes empty subdirectory under managed path", () => {
    // Create .claude/commands/ (empty)
    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    cleanupEmptyDirs(tmpDir, ".claude/commands");
    expect(fs.existsSync(path.join(tmpDir, ".claude", "commands"))).toBe(false);
  });

  it("does not remove non-empty directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "commands", "file.md"),
      "content",
    );
    cleanupEmptyDirs(tmpDir, ".claude/commands");
    expect(fs.existsSync(path.join(tmpDir, ".claude", "commands"))).toBe(true);
  });

  it("does not remove directories outside managed paths", () => {
    fs.mkdirSync(path.join(tmpDir, "src", "utils"), { recursive: true });
    cleanupEmptyDirs(tmpDir, "src/utils");
    // Should still exist because src/utils is not a managed path
    expect(fs.existsSync(path.join(tmpDir, "src", "utils"))).toBe(true);
  });

  it("[CR#1] does not delete managed root directories even if empty", () => {
    // This is the bug that CR#1 identified: .claude itself should never be deleted
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    cleanupEmptyDirs(tmpDir, ".claude");
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
  });

  it("[CR#1] does not delete .trellis root even if empty", () => {
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
    cleanupEmptyDirs(tmpDir, ".trellis");
    expect(fs.existsSync(path.join(tmpDir, ".trellis"))).toBe(true);
  });

  it("recursively cleans parent directories but stops at root", () => {
    // Create .trellis/scripts/multi_agent/ (all empty)
    fs.mkdirSync(path.join(tmpDir, ".trellis", "scripts", "multi_agent"), {
      recursive: true,
    });
    cleanupEmptyDirs(tmpDir, ".trellis/scripts/multi_agent");

    // multi_agent and scripts should be removed (both empty)
    expect(
      fs.existsSync(
        path.join(tmpDir, ".trellis", "scripts", "multi_agent"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, ".trellis", "scripts")),
    ).toBe(false);
    // .trellis root must survive
    expect(fs.existsSync(path.join(tmpDir, ".trellis"))).toBe(true);
  });

  it("handles non-existent directory gracefully", () => {
    // Should not throw
    expect(() => cleanupEmptyDirs(tmpDir, ".claude/nonexistent")).not.toThrow();
  });
});

// =============================================================================
// loadUpdateSkipPaths — YAML quote handling
// =============================================================================

describe("loadUpdateSkipPaths", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-skip-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strips double quotes from skip paths", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      'update:\n  skip:\n    - ".claude/commands/"\n',
    );
    const paths = loadUpdateSkipPaths(tmpDir);
    expect(paths).toEqual([".claude/commands/"]);
  });

  it("strips single quotes from skip paths", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "update:\n  skip:\n    - '.claude/commands/'\n",
    );
    const paths = loadUpdateSkipPaths(tmpDir);
    expect(paths).toEqual([".claude/commands/"]);
  });

  it("handles unquoted skip paths", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "config.yaml"),
      "update:\n  skip:\n    - .claude/commands/\n",
    );
    const paths = loadUpdateSkipPaths(tmpDir);
    expect(paths).toEqual([".claude/commands/"]);
  });

  it("returns empty array when no config exists", () => {
    const paths = loadUpdateSkipPaths(tmpDir);
    expect(paths).toEqual([]);
  });
});

// =============================================================================
// sortMigrationsForExecution
// =============================================================================

describe("sortMigrationsForExecution", () => {
  it("returns empty array for empty input", () => {
    expect(sortMigrationsForExecution([])).toEqual([]);
  });

  it("puts rename-dir before rename and delete", () => {
    const items = [
      { type: "rename" as const, from: ".claude/a.md", to: ".claude/b.md" },
      { type: "rename-dir" as const, from: ".trellis/old", to: ".trellis/new" },
      { type: "delete" as const, from: ".claude/c.md" },
    ];
    const sorted = sortMigrationsForExecution(items);
    expect(sorted[0].type).toBe("rename-dir");
  });

  it("sorts rename-dir by path depth (deeper first)", () => {
    const items = [
      { type: "rename-dir" as const, from: ".trellis/a", to: ".trellis/x" },
      {
        type: "rename-dir" as const,
        from: ".trellis/a/b/c",
        to: ".trellis/x/y/z",
      },
      { type: "rename-dir" as const, from: ".trellis/a/b", to: ".trellis/x/y" },
    ];
    const sorted = sortMigrationsForExecution(items);
    expect(sorted[0].from).toBe(".trellis/a/b/c"); // depth 4
    expect(sorted[1].from).toBe(".trellis/a/b"); // depth 3
    expect(sorted[2].from).toBe(".trellis/a"); // depth 2
  });

  it("preserves relative order of rename and delete items", () => {
    const items = [
      { type: "rename" as const, from: ".claude/a.md", to: ".claude/b.md" },
      { type: "delete" as const, from: ".claude/c.md" },
      { type: "rename" as const, from: ".claude/d.md", to: ".claude/e.md" },
    ];
    const sorted = sortMigrationsForExecution(items);
    // No rename-dir items, so original order is preserved
    expect(sorted[0].from).toBe(".claude/a.md");
    expect(sorted[1].from).toBe(".claude/c.md");
    expect(sorted[2].from).toBe(".claude/d.md");
  });

  it("does not mutate original array", () => {
    const items = [
      { type: "rename" as const, from: "a", to: "b" },
      { type: "rename-dir" as const, from: "c", to: "d" },
    ];
    const original = [...items];
    sortMigrationsForExecution(items);
    expect(items).toEqual(original);
  });
});

// =============================================================================
// shouldExcludeFromBackup — worktrees + user data must not end up in backups
// =============================================================================

describe("shouldExcludeFromBackup", () => {
  // Platform-native worktree dirs host nested sub-repos spawned by the CLI.
  // Snapshotting them on every update would duplicate gigabytes; they must
  // be excluded regardless of which platform put them there.
  it.each([
    ".claude/worktrees/feature-x/src/main.ts",
    ".cursor/worktrees/bugfix-1/README.md",
    ".gemini/worktrees/exp/file.txt",
    ".factory/worktrees/any/file.md",
  ])("excludes %s (worktrees convention)", (p) => {
    expect(shouldExcludeFromBackup(p)).toBe(true);
  });

  it("excludes singular /worktree/ variant", () => {
    expect(shouldExcludeFromBackup(".opencode/worktree/branch/file.ts")).toBe(
      true,
    );
  });

  it.each([
    ".opencode/node_modules/@opencode-ai/sdk/package.json",
    ".trellis/.backup-2026-04-22T10-24-27/.opencode/node_modules/zod/index.js",
  ])("excludes dependency tree %s", (p) => {
    expect(shouldExcludeFromBackup(p)).toBe(true);
  });

  it.each([
    ".trellis/workspace/developer/journal-1.md",
    ".trellis/tasks/04-17-foo/prd.md",
    ".trellis/spec/cli/backend/index.md",
    ".trellis/backlog/idea.md",
    ".trellis/agent-traces/trace.jsonl",
  ])("excludes user data %s", (p) => {
    expect(shouldExcludeFromBackup(p)).toBe(true);
  });

  it("excludes previous backups", () => {
    expect(
      shouldExcludeFromBackup(".trellis/.backup-2026-04-20T01-00-00/x"),
    ).toBe(true);
  });

  it.each([
    ".claude/commands/trellis/continue.md",
    ".claude/skills/trellis-check/SKILL.md",
    ".trellis/workflow.md",
    ".trellis/scripts/get_context.py",
    ".agents/skills/trellis-check/SKILL.md",
  ])("includes managed file %s", (p) => {
    expect(shouldExcludeFromBackup(p)).toBe(false);
  });

  it("does not treat 'worktrees' as a substring match outside path segments", () => {
    // Files that happen to have "worktree" in their name but aren't inside a
    // worktree dir should still be backed up.
    expect(shouldExcludeFromBackup(".claude/worktree-notes.md")).toBe(false);
  });

  // Windows `path.relative` returns backslash paths. The slash-prefixed
  // exclude patterns (/worktrees/, /tasks/, /spec/, ...) must still match
  // after normalization, otherwise Trellis's native worktree protection
  // silently fails on Windows and `collectAllFiles` descends into nested
  // full project copies (observed in the field: stack-overflow crash on
  // `trellis update --migrate`, late April 2026).
  it.each([
    ".claude\\worktrees\\feat-x\\src\\main.ts",
    ".trellis\\tasks\\04-17-foo\\prd.md",
    ".trellis\\workspace\\dev\\journal-1.md",
    ".opencode\\node_modules\\zod\\index.js",
  ])("excludes Windows-style backslash path %s", (p) => {
    expect(shouldExcludeFromBackup(p)).toBe(true);
  });
});
