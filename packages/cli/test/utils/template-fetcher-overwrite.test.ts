import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Control giget's downloadTemplate per-test: it either writes template files
// into the requested dir (success) or throws (download failure).
const downloadTemplateMock = vi.fn();
vi.mock("giget", () => ({
  downloadTemplate: (source: string, opts: { dir: string }) =>
    downloadTemplateMock(source, opts),
}));

import { downloadWithStrategy } from "../../src/utils/template-fetcher.js";

describe("downloadWithStrategy overwrite: temp-first swap", () => {
  let cwd: string;
  let destDir: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-overwrite-"));
    destDir = path.join(cwd, ".trellis", "spec");
    fs.mkdirSync(destDir, { recursive: true });
    // Pre-existing user-authored spec.
    fs.writeFileSync(path.join(destDir, "user.md"), "MY OWN SPEC");
    downloadTemplateMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("replaces the dir when the download succeeds", async () => {
    downloadTemplateMock.mockImplementation(async (_src, opts) => {
      fs.mkdirSync(opts.dir, { recursive: true });
      fs.writeFileSync(path.join(opts.dir, "template.md"), "FROM TEMPLATE");
    });

    const result = await downloadWithStrategy(
      "some/path",
      destDir,
      "overwrite",
    );

    expect(result).toBe(true);
    expect(fs.readFileSync(path.join(destDir, "template.md"), "utf-8")).toBe(
      "FROM TEMPLATE",
    );
    // Overwrite replaces: the old user file is gone (that is the asked-for op).
    expect(fs.existsSync(path.join(destDir, "user.md"))).toBe(false);
  });

  it("preserves the existing dir when the download fails", async () => {
    downloadTemplateMock.mockRejectedValue(
      new Error("Template download timed out"),
    );

    await expect(
      downloadWithStrategy("some/path", destDir, "overwrite"),
    ).rejects.toThrow(/timed out/);

    // The user's spec must survive a failed overwrite — the operation they
    // asked for never completed.
    expect(fs.existsSync(destDir)).toBe(true);
    expect(fs.readFileSync(path.join(destDir, "user.md"), "utf-8")).toBe(
      "MY OWN SPEC",
    );
    // No stray temp dir left in os.tmpdir() for this run is not asserted here
    // (shared dir), but destDir must contain only the original file.
    expect(fs.readdirSync(destDir)).toEqual(["user.md"]);
  });
});
