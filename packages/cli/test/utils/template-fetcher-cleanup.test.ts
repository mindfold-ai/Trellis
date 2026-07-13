/**
 * Regression tests: temp-dir cleanup in `downloadWithStrategy` is
 * best-effort — a rejected `fs.promises.rm` (EBUSY/EPERM on Windows) must
 * not replace the download outcome (success return or download error).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadWithStrategy } from "../../src/utils/template-fetcher.js";

vi.mock("giget", () => ({
  downloadTemplate: vi.fn(async (_src: string, opts: { dir: string }) => {
    fs.mkdirSync(opts.dir, { recursive: true });
    fs.writeFileSync(path.join(opts.dir, "file.md"), "new content");
    return { dir: opts.dir, source: "mock" };
  }),
}));

describe("downloadWithStrategy temp-dir cleanup", () => {
  let tmpDir: string;
  let destDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-fetch-clean-"));
    destDir = path.join(tmpDir, "dest");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, "old.md"), "old content");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function failTempDirCleanup(): void {
    const realRm = fs.promises.rm.bind(fs.promises);
    vi.spyOn(fs.promises, "rm").mockImplementation(async (p, opts) => {
      if (String(p).includes("trellis-template-")) {
        throw Object.assign(new Error("EBUSY: resource busy"), {
          code: "EBUSY",
        });
      }
      return realRm(p as fs.PathLike, opts);
    });
  }

  it("overwrite: a failed temp cleanup does not mask the successful download", async () => {
    failTempDirCleanup();
    await expect(
      downloadWithStrategy("some/template", destDir, "overwrite"),
    ).resolves.toBe(true);
    // The swap itself still happened.
    expect(fs.readFileSync(path.join(destDir, "file.md"), "utf-8")).toBe(
      "new content",
    );
    expect(fs.existsSync(path.join(destDir, "old.md"))).toBe(false);
  });

  it("append: a failed temp cleanup does not mask the successful download", async () => {
    failTempDirCleanup();
    await expect(
      downloadWithStrategy("some/template", destDir, "append"),
    ).resolves.toBe(true);
    // append keeps existing files and adds missing ones.
    expect(fs.readFileSync(path.join(destDir, "old.md"), "utf-8")).toBe(
      "old content",
    );
    expect(fs.readFileSync(path.join(destDir, "file.md"), "utf-8")).toBe(
      "new content",
    );
  });
});
