import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FILE_NAMES } from "../../src/constants/paths.js";
import {
  computeHash,
  loadHashes,
  saveHashes,
  updateHashes,
  updateHashFromFile,
  removeHash,
  renameHash,
  isTemplateModified,
  matchesOriginalTemplate,
  getModificationStatus,
  initializeHashes,
} from "../../src/utils/template-hash.js";

// =============================================================================
// computeHash — pure function (EASY)
// =============================================================================

describe("computeHash", () => {
  it("returns a 64-character hex string (SHA256)", () => {
    const hash = computeHash("hello");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns consistent hash for same input", () => {
    const hash1 = computeHash("test content");
    const hash2 = computeHash("test content");
    expect(hash1).toBe(hash2);
  });

  it("returns different hash for different input", () => {
    const hash1 = computeHash("content A");
    const hash2 = computeHash("content B");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = computeHash("");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles unicode content", () => {
    const hash = computeHash("你好世界 🌍");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces known SHA256 for 'hello'", () => {
    // Known SHA256 of "hello"
    expect(computeHash("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("produces same hash for CRLF and LF content (line-ending normalization)", () => {
    // Cross-platform contract: hash must be stable regardless of host line endings.
    // Without normalization, a file checked out on Windows (CRLF) would not
    // match its template hash computed on Linux/macOS (LF).
    const lf = "line1\nline2\nline3";
    const crlf = "line1\r\nline2\r\nline3";
    expect(computeHash(crlf)).toBe(computeHash(lf));
  });

  it("normalizes mixed CRLF/LF content", () => {
    const mixed = "line1\r\nline2\nline3\r\n";
    const lf = "line1\nline2\nline3\n";
    expect(computeHash(mixed)).toBe(computeHash(lf));
  });
});

// =============================================================================
// loadHashes / saveHashes — fs operations (MEDIUM)
// =============================================================================

describe("loadHashes / saveHashes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    // Create .trellis directory for hashes file
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadHashes returns empty object when file does not exist", () => {
    const hashes = loadHashes(tmpDir);
    expect(hashes).toEqual({});
  });

  it("saveHashes writes and loadHashes reads back correctly", () => {
    const data = { "file.txt": "abc123", "dir/file.md": "def456" };
    saveHashes(tmpDir, data);

    const loaded = loadHashes(tmpDir);
    expect(loaded).toEqual(data);
  });

  it("loadHashes returns empty object for invalid JSON", () => {
    const hashesPath = path.join(tmpDir, ".trellis", ".template-hashes.json");
    fs.writeFileSync(hashesPath, "not valid json");

    const hashes = loadHashes(tmpDir);
    expect(hashes).toEqual({});
  });

  it("saveHashes overwrites existing data", () => {
    saveHashes(tmpDir, { old: "hash" });
    saveHashes(tmpDir, { new: "hash2" });

    const loaded = loadHashes(tmpDir);
    expect(loaded).toEqual({ new: "hash2" });
    expect(loaded).not.toHaveProperty("old");
  });
});

// =============================================================================
// updateHashes — incremental update
// =============================================================================

describe("updateHashes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds new entries without removing existing ones", () => {
    saveHashes(tmpDir, { existing: "hash1" });

    const files = new Map<string, string>();
    files.set("new-file.txt", "content");
    updateHashes(tmpDir, files);

    const loaded = loadHashes(tmpDir);
    expect(loaded).toHaveProperty("existing", "hash1");
    expect(loaded).toHaveProperty("new-file.txt");
    expect(loaded["new-file.txt"]).toBe(computeHash("content"));
  });

  it("overwrites hash for existing path", () => {
    saveHashes(tmpDir, { "file.txt": "old-hash" });

    const files = new Map<string, string>();
    files.set("file.txt", "new content");
    updateHashes(tmpDir, files);

    const loaded = loadHashes(tmpDir);
    expect(loaded["file.txt"]).toBe(computeHash("new content"));
    expect(loaded["file.txt"]).not.toBe("old-hash");
  });
});

// =============================================================================
// updateHashFromFile — reads file and updates hash
// =============================================================================

describe("updateHashFromFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("updates hash from actual file content", () => {
    const content = "file content here";
    fs.writeFileSync(path.join(tmpDir, "test.txt"), content);

    updateHashFromFile(tmpDir, "test.txt");

    const loaded = loadHashes(tmpDir);
    expect(loaded["test.txt"]).toBe(computeHash(content));
  });

  it("does nothing when file does not exist", () => {
    saveHashes(tmpDir, { other: "hash" });
    updateHashFromFile(tmpDir, "nonexistent.txt");

    const loaded = loadHashes(tmpDir);
    expect(loaded).toEqual({ other: "hash" });
    expect(loaded).not.toHaveProperty("nonexistent.txt");
  });
});

// =============================================================================
// removeHash
// =============================================================================

describe("removeHash", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes specified entry", () => {
    saveHashes(tmpDir, { "a.txt": "hash1", "b.txt": "hash2" });
    removeHash(tmpDir, "a.txt");

    const loaded = loadHashes(tmpDir);
    expect(loaded).not.toHaveProperty("a.txt");
    expect(loaded).toHaveProperty("b.txt", "hash2");
  });

  it("does not crash when removing nonexistent key", () => {
    saveHashes(tmpDir, { "a.txt": "hash1" });
    expect(() => removeHash(tmpDir, "nonexistent")).not.toThrow();

    const loaded = loadHashes(tmpDir);
    expect(loaded).toHaveProperty("a.txt", "hash1");
  });
});

// =============================================================================
// renameHash
// =============================================================================

describe("renameHash", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("moves hash from old path to new path", () => {
    saveHashes(tmpDir, { "old.txt": "hash1" });
    renameHash(tmpDir, "old.txt", "new.txt");

    const loaded = loadHashes(tmpDir);
    expect(loaded).not.toHaveProperty("old.txt");
    expect(loaded).toHaveProperty("new.txt", "hash1");
  });

  it("does nothing when old path does not exist in hashes", () => {
    saveHashes(tmpDir, { "other.txt": "hash1" });
    renameHash(tmpDir, "nonexistent.txt", "new.txt");

    const loaded = loadHashes(tmpDir);
    expect(loaded).toEqual({ "other.txt": "hash1" });
    expect(loaded).not.toHaveProperty("new.txt");
  });
});

// =============================================================================
// isTemplateModified
// =============================================================================

describe("isTemplateModified", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when file does not exist", () => {
    const result = isTemplateModified(tmpDir, "missing.txt", {});
    expect(result).toBe(false);
  });

  it("returns true when no stored hash (conservative)", () => {
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "content");
    const result = isTemplateModified(tmpDir, "file.txt", {});
    expect(result).toBe(true);
  });

  it("returns false when file matches stored hash", () => {
    const content = "original content";
    fs.writeFileSync(path.join(tmpDir, "file.txt"), content);
    const hashes = { "file.txt": computeHash(content) };

    const result = isTemplateModified(tmpDir, "file.txt", hashes);
    expect(result).toBe(false);
  });

  it("returns true when file content differs from stored hash", () => {
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "modified content");
    const hashes = { "file.txt": computeHash("original content") };

    const result = isTemplateModified(tmpDir, "file.txt", hashes);
    expect(result).toBe(true);
  });
});

// =============================================================================
// matchesOriginalTemplate
// =============================================================================

describe("matchesOriginalTemplate", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when file does not exist", () => {
    expect(matchesOriginalTemplate(tmpDir, "missing.txt", "content")).toBe(
      false,
    );
  });

  it("returns true when file matches original content exactly", () => {
    const content = "template content";
    fs.writeFileSync(path.join(tmpDir, "file.txt"), content);
    expect(matchesOriginalTemplate(tmpDir, "file.txt", content)).toBe(true);
  });

  it("returns false when file content differs", () => {
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "modified");
    expect(matchesOriginalTemplate(tmpDir, "file.txt", "original")).toBe(false);
  });
});

// =============================================================================
// getModificationStatus — batch check
// =============================================================================

describe("getModificationStatus", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns Map with correct status for each file", () => {
    const content1 = "unmodified";
    const content2 = "modified content";
    fs.writeFileSync(path.join(tmpDir, "a.txt"), content1);
    fs.writeFileSync(path.join(tmpDir, "b.txt"), content2);

    const hashes = {
      "a.txt": computeHash(content1),
      "b.txt": computeHash("original content"),
    };

    const status = getModificationStatus(tmpDir, ["a.txt", "b.txt"], hashes);
    expect(status.get("a.txt")).toBe(false); // unmodified
    expect(status.get("b.txt")).toBe(true); // modified
  });

  it("handles missing files", () => {
    const status = getModificationStatus(tmpDir, ["nonexistent.txt"], {});
    expect(status.get("nonexistent.txt")).toBe(false);
  });
});

// =============================================================================
// initializeHashes — scans directories
// =============================================================================

describe("initializeHashes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 0 when no template directories exist", () => {
    // Create .trellis dir for saving hashes but no template files
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
    const count = initializeHashes(tmpDir);
    expect(count).toBe(0);
  });

  it("hashes files in managed directories", () => {
    // Create .trellis with a script and .claude with a command
    fs.mkdirSync(path.join(tmpDir, ".trellis", "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "scripts", "task.py"),
      "print('hello')",
    );

    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "commands", "start.md"),
      "# Start",
    );

    const count = initializeHashes(tmpDir);
    expect(count).toBeGreaterThanOrEqual(2);

    const hashes = loadHashes(tmpDir);
    expect(hashes).toHaveProperty(".trellis/scripts/task.py");
    expect(hashes).toHaveProperty(".claude/commands/start.md");
  });

  it("hashes only selected root instruction files", () => {
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Agents\n");
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Claude\n");

    const count = initializeHashes(tmpDir, [FILE_NAMES.CLAUDE]);
    const hashes = loadHashes(tmpDir);

    expect(hashes[FILE_NAMES.AGENTS]).toBeUndefined();
    expect(hashes[FILE_NAMES.CLAUDE]).toBe(computeHash("# Claude\n"));
    expect(count).toBe(1);
  });

  it("excludes workspace and tasks directories", () => {
    fs.mkdirSync(path.join(tmpDir, ".trellis", "workspace"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "workspace", "data.md"),
      "user data",
    );
    fs.mkdirSync(path.join(tmpDir, ".trellis", "tasks"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".trellis", "tasks", "task.json"), "{}");

    const count = initializeHashes(tmpDir);
    const hashes = loadHashes(tmpDir);

    // These should be excluded
    expect(hashes).not.toHaveProperty(".trellis/workspace/data.md");
    expect(hashes).not.toHaveProperty(".trellis/tasks/task.json");
    expect(count).toBe(0);
  });

  it("excludes spec/ directory files from hashing", () => {
    fs.mkdirSync(path.join(tmpDir, ".trellis", "spec", "guides"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpDir, ".trellis", "spec", "frontend"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpDir, ".trellis", "spec", "backend"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "spec", "guides", "index.md"),
      "# Guides",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "spec", "frontend", "index.md"),
      "# Frontend",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "spec", "backend", "index.md"),
      "# Backend",
    );

    const count = initializeHashes(tmpDir);
    const hashes = loadHashes(tmpDir);

    // All spec/ files should be excluded
    expect(hashes).not.toHaveProperty(".trellis/spec/guides/index.md");
    expect(hashes).not.toHaveProperty(".trellis/spec/frontend/index.md");
    expect(hashes).not.toHaveProperty(".trellis/spec/backend/index.md");
    expect(count).toBe(0);
  });

  it("collectFiles returns POSIX-normalized paths (no backslashes)", () => {
    // Even on Windows where path.join uses `\`, our collected paths must
    // be POSIX so they can be used as cross-platform hash keys.
    fs.mkdirSync(path.join(tmpDir, ".trellis", "scripts", "common"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "scripts", "common", "task.py"),
      "print('x')",
    );

    initializeHashes(tmpDir);
    const hashes = loadHashes(tmpDir);

    for (const key of Object.keys(hashes)) {
      expect(key).not.toContain("\\");
    }
    // And confirm the expected POSIX key is present
    expect(hashes).toHaveProperty(".trellis/scripts/common/task.py");
  });

  it("does not exclude generated update-spec skills from hashing", () => {
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
    const skillPath = path.join(
      tmpDir,
      ".pi",
      "skills",
      "trellis-update-spec",
      "SKILL.md",
    );
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, "# Update Spec");

    const count = initializeHashes(tmpDir);
    const hashes = loadHashes(tmpDir);

    expect(hashes).toHaveProperty(".pi/skills/trellis-update-spec/SKILL.md");
    expect(count).toBe(1);
  });
});

// =============================================================================
// Cross-platform: POSIX keys + schema v2 + legacy migration + CRLF
// =============================================================================

describe("cross-platform hash storage (POSIX keys + v2 schema)", () => {
  let tmpDir: string;
  const HASHES_REL = path.join(".trellis", ".template-hashes.json");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("updateHashes normalizes Windows-style keys to POSIX", () => {
    const files = new Map<string, string>();
    files.set("a\\b\\c.txt", "content");
    updateHashes(tmpDir, files);

    const loaded = loadHashes(tmpDir);
    expect(loaded).toHaveProperty("a/b/c.txt");
    expect(loaded).not.toHaveProperty("a\\b\\c.txt");

    // Verify the on-disk JSON also has POSIX keys
    const raw = fs.readFileSync(path.join(tmpDir, HASHES_REL), "utf-8");
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed.hashes)).toContain("a/b/c.txt");
    for (const key of Object.keys(parsed.hashes)) {
      expect(key).not.toContain("\\");
    }
  });

  it("saveHashes writes schema v2 envelope with __version + hashes", () => {
    saveHashes(tmpDir, { foo: "abc", "bar/baz": "def" });

    const raw = fs.readFileSync(path.join(tmpDir, HASHES_REL), "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty("__version", 2);
    expect(parsed).toHaveProperty("hashes");
    expect(parsed.hashes).toEqual({ foo: "abc", "bar/baz": "def" });
  });

  it("saveHashes normalizes backslash keys at write time", () => {
    saveHashes(tmpDir, { "win\\path\\file.txt": "hash1" });

    const raw = fs.readFileSync(path.join(tmpDir, HASHES_REL), "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed.hashes).toHaveProperty("win/path/file.txt");
    expect(parsed.hashes).not.toHaveProperty("win\\path\\file.txt");
  });

  it("loadHashes returns {} for legacy flat-format file (no __version)", () => {
    // Simulate an existing user's file from before the v2 schema. Both the
    // backslash key AND the missing schema version should trigger discard.
    const legacy = {
      ".trellis\\config.yaml": "deadbeef",
      ".claude/commands/start.md": "cafebabe",
    };
    fs.writeFileSync(
      path.join(tmpDir, HASHES_REL),
      JSON.stringify(legacy, null, 2),
    );

    const loaded = loadHashes(tmpDir);
    expect(loaded).toEqual({});
  });

  it("loadHashes returns {} for unknown __version", () => {
    fs.writeFileSync(
      path.join(tmpDir, HASHES_REL),
      JSON.stringify({ __version: 999, hashes: { foo: "bar" } }),
    );

    const loaded = loadHashes(tmpDir);
    expect(loaded).toEqual({});
  });

  it("isTemplateModified returns false when only line endings differ", () => {
    // Write LF content, store its hash.
    const lfContent = "first line\nsecond line\nthird line\n";
    const filePath = path.join(tmpDir, "doc.md");
    fs.writeFileSync(filePath, lfContent);

    updateHashes(tmpDir, new Map([["doc.md", lfContent]]));
    const hashes = loadHashes(tmpDir);

    // Now overwrite the same file with CRLF version of identical content.
    const crlfContent = "first line\r\nsecond line\r\nthird line\r\n";
    fs.writeFileSync(filePath, crlfContent);

    expect(isTemplateModified(tmpDir, "doc.md", hashes)).toBe(false);
  });

  it("legacy file is discarded then initializeHashes regenerates v2", () => {
    // Plant a legacy flat-format hashes file.
    fs.writeFileSync(
      path.join(tmpDir, HASHES_REL),
      JSON.stringify({ ".trellis\\config.yaml": "deadbeef" }),
    );

    // Stage some real files to pick up.
    fs.mkdirSync(path.join(tmpDir, ".trellis", "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".trellis", "scripts", "task.py"),
      "print('hello')",
    );

    initializeHashes(tmpDir);

    const raw = fs.readFileSync(path.join(tmpDir, HASHES_REL), "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed.__version).toBe(2);
    // Legacy bogus key is gone
    expect(parsed.hashes).not.toHaveProperty(".trellis\\config.yaml");
    expect(parsed.hashes).not.toHaveProperty(".trellis/config.yaml");
    // Newly hashed file is present with POSIX key
    expect(parsed.hashes).toHaveProperty(".trellis/scripts/task.py");
  });

  it("removeHash and renameHash work with backslash inputs", () => {
    saveHashes(tmpDir, { "a/b.txt": "hash1", "c/d.txt": "hash2" });

    // Caller passes backslashes — should still find/remove the POSIX key.
    removeHash(tmpDir, "a\\b.txt");
    let loaded = loadHashes(tmpDir);
    expect(loaded).not.toHaveProperty("a/b.txt");
    expect(loaded).toHaveProperty("c/d.txt", "hash2");

    renameHash(tmpDir, "c\\d.txt", "e\\f.txt");
    loaded = loadHashes(tmpDir);
    expect(loaded).not.toHaveProperty("c/d.txt");
    expect(loaded).toHaveProperty("e/f.txt", "hash2");
  });
});
