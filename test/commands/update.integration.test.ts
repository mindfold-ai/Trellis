/**
 * Integration tests for the update() command.
 *
 * Tests the full update flow in real temp directories with minimal mocking.
 * Only external dependencies are mocked: figlet, inquirer, child_process, fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// === External dependency mocks (hoisted by vitest) ===

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "TRELLIS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({ proceed: true }) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(""),
}));

// === Imports ===

import { init } from "../../src/commands/init.js";
import { update } from "../../src/commands/update.js";
import { VERSION } from "../../src/constants/version.js";
import { DIR_NAMES, PATHS } from "../../src/constants/paths.js";
import { computeHash } from "../../src/utils/template-hash.js";

// A managed template file that update always handles (Python script)
const MANAGED_FILE = `${PATHS.SCRIPTS}/get_context.py`;

describe("update() integration", () => {
  let tmpDir: string;

  /** Initialize a fresh project in tmpDir */
  async function setupProject(): Promise<void> {
    await init({ yes: true, force: true });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-update-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const noop = () => {};
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    // Mock fetch for npm registry
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: VERSION }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("#1 same version update is a true no-op (zero file changes, no backup)", async () => {
    await setupProject();

    // Full snapshot before update
    const snapshotBefore = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else snapshotBefore.set(path.relative(tmpDir, full), fs.readFileSync(full, "utf-8"));
      }
    };
    walk(tmpDir);

    await update({});

    // Full snapshot after update
    const snapshotAfter = new Map<string, string>();
    const walk2 = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk2(full);
        else snapshotAfter.set(path.relative(tmpDir, full), fs.readFileSync(full, "utf-8"));
      }
    };
    walk2(tmpDir);

    // No files added or removed
    const addedFiles = [...snapshotAfter.keys()].filter((k) => !snapshotBefore.has(k));
    const removedFiles = [...snapshotBefore.keys()].filter((k) => !snapshotAfter.has(k));
    expect(addedFiles).toEqual([]);
    expect(removedFiles).toEqual([]);

    // No file contents changed
    const changedFiles: string[] = [];
    for (const [filePath, content] of snapshotBefore) {
      if (snapshotAfter.get(filePath) !== content) {
        changedFiles.push(filePath);
      }
    }
    expect(changedFiles).toEqual([]);

    // No backup directory created
    const entries = fs.readdirSync(path.join(tmpDir, DIR_NAMES.WORKFLOW));
    expect(entries.filter((e) => e.startsWith(".backup-")).length).toBe(0);
  });

  it("#2 dry run makes no file changes even when changes exist", async () => {
    await setupProject();

    // Delete a file to create a "new file" change
    const target = path.join(tmpDir, MANAGED_FILE);
    fs.unlinkSync(target);

    await update({ dryRun: true });

    // File should still be missing (dry run didn't recreate it)
    expect(fs.existsSync(target)).toBe(false);
    // No backup directory created
    const entries = fs.readdirSync(path.join(tmpDir, DIR_NAMES.WORKFLOW));
    expect(entries.filter((e) => e.startsWith(".backup-")).length).toBe(0);
  });

  it("#3 recreates deleted template file as new", async () => {
    await setupProject();

    const target = path.join(tmpDir, MANAGED_FILE);
    const originalContent = fs.readFileSync(target, "utf-8");
    fs.unlinkSync(target);

    await update({ force: true });

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe(originalContent);
  });

  it("#4 auto-updates file when template changed but user did not modify", async () => {
    await setupProject();

    const targetRelative = MANAGED_FILE;
    const targetFull = path.join(tmpDir, targetRelative);
    const templateContent = fs.readFileSync(targetFull, "utf-8");

    // Simulate "old template version": change file + update hash to match
    const oldContent = "# Old version of script\n";
    fs.writeFileSync(targetFull, oldContent);

    const hashFile = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".template-hashes.json");
    const hashes = JSON.parse(fs.readFileSync(hashFile, "utf-8"));
    hashes[targetRelative] = computeHash(oldContent);
    fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2));

    await update({ force: true });

    // File should be auto-updated back to current template
    expect(fs.readFileSync(targetFull, "utf-8")).toBe(templateContent);
  });

  it("#5 force overwrites user-modified files", async () => {
    await setupProject();

    const targetFull = path.join(tmpDir, MANAGED_FILE);
    const templateContent = fs.readFileSync(targetFull, "utf-8");

    // User modifies file (hash won't match)
    fs.writeFileSync(targetFull, "user customized content");

    await update({ force: true });

    expect(fs.readFileSync(targetFull, "utf-8")).toBe(templateContent);
  });

  it("#6 skipAll preserves user-modified files", async () => {
    await setupProject();

    const targetFull = path.join(tmpDir, MANAGED_FILE);
    fs.writeFileSync(targetFull, "user customized content");

    await update({ skipAll: true });

    expect(fs.readFileSync(targetFull, "utf-8")).toBe("user customized content");
  });

  it("#7 createNew creates .new copy without overwriting original", async () => {
    await setupProject();

    const targetFull = path.join(tmpDir, MANAGED_FILE);
    const templateContent = fs.readFileSync(targetFull, "utf-8");
    fs.writeFileSync(targetFull, "user customized content");

    await update({ createNew: true });

    // Original preserved
    expect(fs.readFileSync(targetFull, "utf-8")).toBe("user customized content");
    // .new file created with template content
    const newFile = targetFull + ".new";
    expect(fs.existsSync(newFile)).toBe(true);
    expect(fs.readFileSync(newFile, "utf-8")).toBe(templateContent);
  });

  it("#8 updates version file after successful update", async () => {
    await setupProject();

    // Simulate older project version
    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, "0.0.1");

    // Delete a file so there is a change to trigger the full flow
    fs.unlinkSync(path.join(tmpDir, MANAGED_FILE));

    await update({ force: true });

    expect(fs.readFileSync(versionPath, "utf-8")).toBe(VERSION);
  });

  it("#9 creates backup directory before applying changes", async () => {
    await setupProject();

    // Delete a file to trigger the full update flow
    fs.unlinkSync(path.join(tmpDir, MANAGED_FILE));

    await update({ force: true });

    const entries = fs.readdirSync(path.join(tmpDir, DIR_NAMES.WORKFLOW));
    const backupDirs = entries.filter((e) => e.startsWith(".backup-"));
    expect(backupDirs.length).toBeGreaterThanOrEqual(1);
  });

  it("#10 downgrade protection prevents update when CLI is older", async () => {
    await setupProject();

    // Set project version to future
    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, "99.99.99");

    await update({});

    // Version should NOT be changed
    expect(fs.readFileSync(versionPath, "utf-8")).toBe("99.99.99");
  });

  it("#11 allowDowngrade permits update when CLI is older", async () => {
    await setupProject();

    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, "99.99.99");

    // Delete a file so there is a change
    const target = path.join(tmpDir, MANAGED_FILE);
    fs.unlinkSync(target);

    await update({ allowDowngrade: true, force: true });

    // File recreated
    expect(fs.existsSync(target)).toBe(true);
    // Version updated to current
    expect(fs.readFileSync(versionPath, "utf-8")).toBe(VERSION);
  });

  it("#12 prerelease→stable upgrade with no file changes still updates .version", async () => {
    await setupProject();

    // Simulate a project at rc.6 (identical templates, just different version stamp)
    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, "0.3.0-rc.6");

    await update({});

    // .version must be updated to the current CLI version
    expect(fs.readFileSync(versionPath, "utf-8")).toBe(VERSION);
  });

  it("#13 user-edited spec/guides files are preserved after update with force", async () => {
    await setupProject();

    // User customizes a spec guides file
    const guidesIndex = path.join(tmpDir, PATHS.SPEC, "guides", "index.md");
    expect(fs.existsSync(guidesIndex)).toBe(true);
    const customContent = "# My Custom Guides\n\nEdited by user.\n";
    fs.writeFileSync(guidesIndex, customContent);

    await update({ force: true });

    // User's customized content must be preserved (update should not touch spec/)
    expect(fs.readFileSync(guidesIndex, "utf-8")).toBe(customContent);
  });

  it("#14 deleted spec directory is NOT recreated by update", async () => {
    await setupProject();

    // User deletes the entire spec directory
    const specDir = path.join(tmpDir, PATHS.SPEC);
    fs.rmSync(specDir, { recursive: true, force: true });
    expect(fs.existsSync(specDir)).toBe(false);

    await update({ force: true });

    // spec/ directory should NOT be recreated by update
    expect(fs.existsSync(specDir)).toBe(false);
  });
});
