import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  setWriteMode,
  getWriteMode,
  writeFile,
  ensureDir,
} from "../../src/utils/file-writer.js";

// =============================================================================
// setWriteMode / getWriteMode — global state
// =============================================================================

describe("setWriteMode / getWriteMode", () => {
  afterEach(() => {
    // Reset to default after each test
    setWriteMode("ask");
  });

  it("defaults to 'ask'", () => {
    setWriteMode("ask");
    expect(getWriteMode()).toBe("ask");
  });

  it("can be set to 'force'", () => {
    setWriteMode("force");
    expect(getWriteMode()).toBe("force");
  });

  it("can be set to 'skip'", () => {
    setWriteMode("skip");
    expect(getWriteMode()).toBe("skip");
  });

  it("can be set to 'append'", () => {
    setWriteMode("append");
    expect(getWriteMode()).toBe("append");
  });
});

// =============================================================================
// ensureDir — creates directories recursively
// =============================================================================

describe("ensureDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-ensure-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a new directory", () => {
    const newDir = path.join(tmpDir, "new-dir");
    ensureDir(newDir);
    expect(fs.existsSync(newDir)).toBe(true);
    expect(fs.statSync(newDir).isDirectory()).toBe(true);
  });

  it("creates nested directories recursively", () => {
    const nestedDir = path.join(tmpDir, "a", "b", "c");
    ensureDir(nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it("does not throw when directory already exists", () => {
    const existingDir = path.join(tmpDir, "existing");
    fs.mkdirSync(existingDir);
    expect(() => ensureDir(existingDir)).not.toThrow();
  });
});

// =============================================================================
// writeFile — file writing with conflict handling
// =============================================================================

describe("writeFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-write-"));
    setWriteMode("force"); // Avoid interactive prompts
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setWriteMode("ask");
  });

  it("writes new file when it does not exist", async () => {
    const filePath = path.join(tmpDir, "new.txt");
    const result = await writeFile(filePath, "content");
    expect(result).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("content");
  });

  it("returns false when content is identical (skip silently)", async () => {
    const filePath = path.join(tmpDir, "same.txt");
    fs.writeFileSync(filePath, "same content");

    const result = await writeFile(filePath, "same content");
    expect(result).toBe(false);
  });

  it("overwrites in force mode", async () => {
    const filePath = path.join(tmpDir, "overwrite.txt");
    fs.writeFileSync(filePath, "old content");
    setWriteMode("force");

    const result = await writeFile(filePath, "new content");
    expect(result).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("new content");
  });

  it("skips in skip mode", async () => {
    const filePath = path.join(tmpDir, "skip.txt");
    fs.writeFileSync(filePath, "original");
    setWriteMode("skip");

    const result = await writeFile(filePath, "new content");
    expect(result).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("original");
  });

  it("appends in append mode", async () => {
    const filePath = path.join(tmpDir, "append.txt");
    fs.writeFileSync(filePath, "line1\n");
    setWriteMode("append");

    const result = await writeFile(filePath, "line2");
    expect(result).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("line1\nline2");
  });

  it("appends with newline separator when file does not end with newline", async () => {
    const filePath = path.join(tmpDir, "append-no-nl.txt");
    fs.writeFileSync(filePath, "line1");
    setWriteMode("append");

    const result = await writeFile(filePath, "line2");
    expect(result).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("line1\nline2");
  });

  it("falls back to skip in non-TTY when mode is 'ask' (CI safety net for issue #204)", async () => {
    const filePath = path.join(tmpDir, "non-tty-conflict.txt");
    fs.writeFileSync(filePath, "original");
    setWriteMode("ask");

    // Vitest runs without a TTY on stdin (process.stdin.isTTY is undefined),
    // so this exercises the layer-level fallback that prevents
    // ERR_USE_AFTER_CLOSE from inquirer when a CLI flag forgot to call
    // setWriteMode.
    expect(process.stdin.isTTY).toBeFalsy();

    const result = await writeFile(filePath, "new content");
    expect(result).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("original");
  });
});
