import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFileAtomic } from "../../src/utils/atomic-write.js";

describe("writeFileAtomic", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-atomic-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes new content", () => {
    const f = path.join(dir, "a.json");
    writeFileAtomic(f, '{"x":1}');
    expect(fs.readFileSync(f, "utf-8")).toBe('{"x":1}');
  });

  it("overwrites and leaves no temp file behind", () => {
    const f = path.join(dir, "a.json");
    writeFileAtomic(f, "old");
    writeFileAtomic(f, "new");
    expect(fs.readFileSync(f, "utf-8")).toBe("new");
    expect(fs.readdirSync(dir)).toEqual(["a.json"]);
  });

  it("preserves the original file when the write fails", () => {
    const f = path.join(dir, "keep.json");
    writeFileAtomic(f, "original");
    // A directory in place of the temp target's parent is not the failure we
    // model; instead force a rename failure by pointing at an unwritable dir.
    const roDir = path.join(dir, "ro");
    fs.mkdirSync(roDir);
    const target = path.join(roDir, "x.json");
    writeFileAtomic(target, "first");
    fs.chmodSync(roDir, 0o500); // read+execute only, no write
    try {
      expect(() => writeFileAtomic(target, "second")).toThrow();
      // Original survives; no half-written temp left in the dir.
      expect(fs.readFileSync(target, "utf-8")).toBe("first");
      expect(fs.readdirSync(roDir)).toEqual(["x.json"]);
    } finally {
      fs.chmodSync(roDir, 0o700);
    }
  });
});
