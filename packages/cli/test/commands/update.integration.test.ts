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
import inquirer from "inquirer";

// === External dependency mocks (hoisted by vitest) ===

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "TRELLIS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({ proceed: true }) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation((cmd: string) => {
    const py = process.platform === "win32" ? "python" : "python3";
    return cmd === `${py} --version` ? "Python 3.11.12" : "";
  }),
}));

// === Imports ===

import { init } from "../../src/commands/init.js";
import { update } from "../../src/commands/update.js";
import { VERSION } from "../../src/constants/version.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../../src/constants/paths.js";
import { computeHash } from "../../src/utils/template-hash.js";

// A managed template file that update always handles (Python script)
const MANAGED_FILE = `${PATHS.SCRIPTS}/get_context.py`;

/** Remove a key from a hash object (avoids eslint no-dynamic-delete) */
function removeHashEntry(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
}

/**
 * Read the v2 hashes file and return the inner `hashes` map.
 * Tests manipulate this map then write it back via `writeHashesV2`.
 */
function readHashesV2(hashFile: string): Record<string, string> {
  const raw = JSON.parse(fs.readFileSync(hashFile, "utf-8")) as {
    __version?: number;
    hashes?: Record<string, string>;
  };
  return raw.hashes ?? {};
}

/** Write a v2-shaped hashes file. */
function writeHashesV2(hashFile: string, hashes: Record<string, string>): void {
  fs.writeFileSync(hashFile, JSON.stringify({ __version: 2, hashes }, null, 2));
}

function removeSubagentsSection(content: string): string {
  return content.replace(
    "\n## Subagents\n\n" +
      "- ALWAYS wait for all subagents to complete before yielding.\n" +
      "- Spawn subagents automatically when:\n" +
      "  - Parallelizable work (e.g., install + verify, npm test + typecheck, multiple tasks from plan)\n" +
      "  - Long-running or blocking tasks where a worker can run independently.\n" +
      "  - Isolation for risky changes or checks\n",
    "",
  );
}

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
        else
          snapshotBefore.set(
            path.relative(tmpDir, full),
            fs.readFileSync(full, "utf-8"),
          );
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
        else
          snapshotAfter.set(
            path.relative(tmpDir, full),
            fs.readFileSync(full, "utf-8"),
          );
      }
    };
    walk2(tmpDir);

    // No files added or removed
    const addedFiles = [...snapshotAfter.keys()].filter(
      (k) => !snapshotBefore.has(k),
    );
    const removedFiles = [...snapshotBefore.keys()].filter(
      (k) => !snapshotAfter.has(k),
    );
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

    // Delete hash + file to simulate a truly new template file
    const target = path.join(tmpDir, MANAGED_FILE);
    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = removeHashEntry(
      readHashesV2(hashFile),
      MANAGED_FILE,
    ) as Record<string, string>;
    writeHashesV2(hashFile, hashes);
    fs.unlinkSync(target);

    await update({ dryRun: true });

    // File should still be missing (dry run didn't recreate it)
    expect(fs.existsSync(target)).toBe(false);
    // No backup directory created
    const entries = fs.readdirSync(path.join(tmpDir, DIR_NAMES.WORKFLOW));
    expect(entries.filter((e) => e.startsWith(".backup-")).length).toBe(0);
  });

  it("#3 user-deleted file (with stored hash) is not re-added on update", async () => {
    await setupProject();

    const target = path.join(tmpDir, MANAGED_FILE);
    expect(fs.existsSync(target)).toBe(true);

    // Delete it (simulating user deletion; hash still exists in .template-hashes.json)
    fs.unlinkSync(target);
    expect(fs.existsSync(target)).toBe(false);

    await update({ force: true });

    // File should NOT be re-created (user deleted it, hash still exists)
    expect(fs.existsSync(target)).toBe(false);
  });

  it("#4 auto-updates file when template changed but user did not modify", async () => {
    await setupProject();

    const targetRelative = MANAGED_FILE;
    const targetFull = path.join(tmpDir, targetRelative);
    const templateContent = fs.readFileSync(targetFull, "utf-8");

    // Simulate "old template version": change file + update hash to match
    const oldContent = "# Old version of script\n";
    fs.writeFileSync(targetFull, oldContent);

    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = readHashesV2(hashFile);
    hashes[targetRelative] = computeHash(oldContent);
    writeHashesV2(hashFile, hashes);

    await update({ force: true });

    // File should be auto-updated back to current template
    expect(fs.readFileSync(targetFull, "utf-8")).toBe(templateContent);
  });

  it("#4b auto-updates legacy untracked AGENTS.md and preserves outside content", async () => {
    await setupProject();

    const targetRelative = FILE_NAMES.AGENTS;
    const targetFull = path.join(tmpDir, targetRelative);
    const templateContent = fs.readFileSync(targetFull, "utf-8");
    const oldContent = removeSubagentsSection(templateContent);
    const existingContent = `# Local instructions\n\n${oldContent}\n\n## Project Notes\n\nKeep this.`;
    const expectedContent = `# Local instructions\n\n${templateContent}\n\n## Project Notes\n\nKeep this.`;

    fs.writeFileSync(targetFull, existingContent);

    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = removeHashEntry(
      readHashesV2(hashFile),
      targetRelative,
    ) as Record<string, string>;
    writeHashesV2(hashFile, hashes);

    await update({});

    expect(fs.readFileSync(targetFull, "utf-8")).toBe(expectedContent);
    expect(readHashesV2(hashFile)[targetRelative]).toBe(
      computeHash(expectedContent),
    );
  });

  it("#4c preserves user-modified untracked AGENTS.md managed block", async () => {
    await setupProject();

    const targetRelative = FILE_NAMES.AGENTS;
    const targetFull = path.join(tmpDir, targetRelative);
    const templateContent = fs.readFileSync(targetFull, "utf-8");
    const modifiedOldContent = removeSubagentsSection(templateContent).replace(
      "# Trellis Instructions",
      "# Custom Trellis Instructions",
    );
    fs.writeFileSync(targetFull, modifiedOldContent);

    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = removeHashEntry(
      readHashesV2(hashFile),
      targetRelative,
    ) as Record<string, string>;
    writeHashesV2(hashFile, hashes);

    await update({ skipAll: true });

    expect(fs.readFileSync(targetFull, "utf-8")).toBe(modifiedOldContent);
  });

  it("#4d preserves user AGENTS.md without TRELLIS markers by appending the managed block", async () => {
    await setupProject();

    const targetRelative = FILE_NAMES.AGENTS;
    const targetFull = path.join(tmpDir, targetRelative);
    const templateContent = fs.readFileSync(targetFull, "utf-8");

    // User has a hand-written AGENTS.md with no TRELLIS:START/END markers at
    // all (predates 0.5.0-beta.18 or was authored by hand). Pre-fix behavior
    // would clobber this content; post-fix should append the managed block.
    const userContent = "# Project notes\n\nThings the team agreed on.\n";
    fs.writeFileSync(targetFull, userContent);

    await update({ force: true });

    const result = fs.readFileSync(targetFull, "utf-8");
    expect(result).toContain("# Project notes");
    expect(result).toContain("Things the team agreed on.");
    expect(result).toContain("<!-- TRELLIS:START -->");
    expect(result).toContain("<!-- TRELLIS:END -->");
    // Managed block should sit AFTER the user content, not replace it.
    expect(result.indexOf("# Project notes")).toBeLessThan(
      result.indexOf("<!-- TRELLIS:START -->"),
    );
    // Tail equals the canonical template (force-applied managed block).
    expect(result.endsWith(templateContent.trimEnd() + "\n")).toBe(true);
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

  it("#5b force mode does not prompt for final confirmation", async () => {
    await setupProject();

    const targetFull = path.join(tmpDir, MANAGED_FILE);
    fs.writeFileSync(targetFull, "user customized content");
    vi.mocked(inquirer.prompt).mockClear();

    await update({ force: true });

    expect(inquirer.prompt).not.toHaveBeenCalled();
  });

  it("#6 skipAll preserves user-modified files", async () => {
    await setupProject();

    const targetFull = path.join(tmpDir, MANAGED_FILE);
    fs.writeFileSync(targetFull, "user customized content");

    await update({ skipAll: true });

    expect(fs.readFileSync(targetFull, "utf-8")).toBe(
      "user customized content",
    );
  });

  it("#7 createNew creates .new copy without overwriting original", async () => {
    await setupProject();

    const targetFull = path.join(tmpDir, MANAGED_FILE);
    const templateContent = fs.readFileSync(targetFull, "utf-8");
    fs.writeFileSync(targetFull, "user customized content");

    await update({ createNew: true });

    // Original preserved
    expect(fs.readFileSync(targetFull, "utf-8")).toBe(
      "user customized content",
    );
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

    await update({ force: true });

    // Version is updated even when no file changes are needed
    expect(fs.readFileSync(versionPath, "utf-8")).toBe(VERSION);
  });

  it("#9 creates backup directory before applying changes", async () => {
    await setupProject();

    // Simulate "old template version": change file + update hash to match
    // This triggers auto-update (template changed, user didn't modify)
    const targetFull = path.join(tmpDir, MANAGED_FILE);
    const oldContent = "# Old version of script\n";
    fs.writeFileSync(targetFull, oldContent);
    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = readHashesV2(hashFile);
    hashes[MANAGED_FILE] = computeHash(oldContent);
    writeHashesV2(hashFile, hashes);

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

    // Remove hash entry + file to simulate a truly new template file
    const target = path.join(tmpDir, MANAGED_FILE);
    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = removeHashEntry(
      readHashesV2(hashFile),
      MANAGED_FILE,
    ) as Record<string, string>;
    writeHashesV2(hashFile, hashes);
    fs.unlinkSync(target);

    await update({ allowDowngrade: true, force: true });

    // File recreated (truly new — no stored hash)
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

  it("#15 truly new file (no stored hash) is still added", async () => {
    await setupProject();

    // The hash file should exist
    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = removeHashEntry(
      readHashesV2(hashFile),
      MANAGED_FILE,
    ) as Record<string, string>;

    // Remove a hash entry AND the file (simulates a truly new template)
    const targetPath = path.join(tmpDir, MANAGED_FILE);
    writeHashesV2(hashFile, hashes);
    fs.unlinkSync(targetPath);

    // Run update
    await update({ force: true });

    // File SHOULD be created (no hash = truly new)
    expect(fs.existsSync(targetPath)).toBe(true);
  });

  it("#16 config.yaml update.skip prevents file from being updated", async () => {
    await setupProject();

    // Pick a managed template file
    const targetPath = path.join(tmpDir, MANAGED_FILE);

    // Add skip config
    const configPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml");
    const configContent = fs.readFileSync(configPath, "utf-8");
    fs.writeFileSync(
      configPath,
      configContent + `\nupdate:\n  skip:\n    - ${MANAGED_FILE}\n`,
    );

    // Modify the file so it would normally trigger a change
    fs.writeFileSync(targetPath, "# modified by user\n");

    // Run update
    await update({ force: true });

    // File should NOT be overwritten (it's in skip list)
    expect(fs.readFileSync(targetPath, "utf-8")).toBe("# modified by user\n");
  });

  it("#17 config.yaml update.skip with directory path skips all files under it", async () => {
    await setupProject();

    // Add skip config for the scripts/common/ directory
    const configPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml");
    const configContent = fs.readFileSync(configPath, "utf-8");
    const skipDir = `${PATHS.SCRIPTS}/common/`;
    fs.writeFileSync(
      configPath,
      configContent + `\nupdate:\n  skip:\n    - ${skipDir}\n`,
    );

    // Modify a file under the skipped directory
    const targetPath = path.join(tmpDir, PATHS.SCRIPTS, "common", "paths.py");
    expect(fs.existsSync(targetPath)).toBe(true);
    fs.writeFileSync(targetPath, "# user modified paths.py\n");

    // Run update
    await update({ force: true });

    // File should NOT be overwritten (its directory is in skip list)
    expect(fs.readFileSync(targetPath, "utf-8")).toBe(
      "# user modified paths.py\n",
    );
  });

  it("#18 safe-file-delete preserves user-modified deprecated file", async () => {
    await setupProject();

    // Create a deprecated file that exists in the 0.4.0-beta.1 safe-file-delete manifest
    // but with user-modified content (hash won't match allowed_hashes)
    const deprecatedDir = path.join(tmpDir, ".claude", "commands", "trellis");
    fs.mkdirSync(deprecatedDir, { recursive: true });
    const deprecatedFile = path.join(deprecatedDir, "before-backend-dev.md");
    const userContent =
      "# My customized before-backend-dev command\nUser edited this.\n";
    fs.writeFileSync(deprecatedFile, userContent);

    await update({ force: true });

    // File should be preserved (hash doesn't match allowed_hashes)
    expect(fs.existsSync(deprecatedFile)).toBe(true);
    expect(fs.readFileSync(deprecatedFile, "utf-8")).toBe(userContent);
  });

  it("#19 safe-file-delete handles missing deprecated files without crash", async () => {
    await setupProject();

    // Simulate upgrading from an old version — deprecated files don't exist
    // The manifest has safe-file-delete entries for .claude/commands/trellis/before-backend-dev.md etc.
    // but init() doesn't create them (templates removed). update() should not crash.
    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, "0.3.7");

    // This should complete without errors even though deprecated files don't exist
    await update({ force: true });

    // Version updated successfully
    expect(fs.readFileSync(versionPath, "utf-8")).toBe(VERSION);
  });

  // Original template content for check-backend.md (deleted in 0.4.0-beta.1).
  // Hash: 4e81a28d681ea770f780df55a212fd504ce21ee49b44ba16023b74b5c243cef3
  const ORIGINAL_CHECK_BACKEND_CONTENT = [
    "Check if the code you just wrote follows the backend development guidelines.",
    "",
    "Execute these steps:",
    "1. Run `git status` to see modified files",
    "2. Read `.trellis/spec/backend/index.md` to understand which guidelines apply",
    "3. Based on what you changed, read the relevant guideline files:",
    "   - Database changes → `.trellis/spec/backend/database-guidelines.md`",
    "   - Error handling → `.trellis/spec/backend/error-handling.md`",
    "   - Logging changes → `.trellis/spec/backend/logging-guidelines.md`",
    "   - Type changes → `.trellis/spec/backend/type-safety.md`",
    "   - Any changes → `.trellis/spec/backend/quality-guidelines.md`",
    "4. Review your code against the guidelines",
    "5. Report any violations and fix them if found",
    "",
  ].join("\n");

  it("#20 safe-file-delete respects update.skip for deprecated files", async () => {
    await setupProject();

    // Sanity: content hash must match the manifest's allowed_hashes
    expect(computeHash(ORIGINAL_CHECK_BACKEND_CONTENT)).toBe(
      "4e81a28d681ea770f780df55a212fd504ce21ee49b44ba16023b74b5c243cef3",
    );

    // Create a deprecated file with original content (hash matches allowed_hashes)
    // Without update.skip, collectSafeFileDeletes() would delete this file.
    const deprecatedDir = path.join(tmpDir, ".claude", "commands", "trellis");
    fs.mkdirSync(deprecatedDir, { recursive: true });
    const deprecatedFile = path.join(deprecatedDir, "check-backend.md");
    fs.writeFileSync(deprecatedFile, ORIGINAL_CHECK_BACKEND_CONTENT);

    // Add the deprecated file's directory to update.skip
    const configPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml");
    const configContent = fs.readFileSync(configPath, "utf-8");
    fs.writeFileSync(
      configPath,
      configContent + `\nupdate:\n  skip:\n    - .claude/commands/trellis/\n`,
    );

    await update({ force: true });

    // File should be preserved (directory is in update.skip, overriding safe-file-delete)
    expect(fs.existsSync(deprecatedFile)).toBe(true);
    expect(fs.readFileSync(deprecatedFile, "utf-8")).toBe(
      ORIGINAL_CHECK_BACKEND_CONTENT,
    );
  });

  it("#21 safe-file-delete deletes file when hash matches allowed_hashes", async () => {
    await setupProject();

    // Sanity: content hash must match the manifest's allowed_hashes
    expect(computeHash(ORIGINAL_CHECK_BACKEND_CONTENT)).toBe(
      "4e81a28d681ea770f780df55a212fd504ce21ee49b44ba16023b74b5c243cef3",
    );

    // Create deprecated file with original content (hash matches allowed_hashes)
    const deprecatedDir = path.join(tmpDir, ".claude", "commands", "trellis");
    fs.mkdirSync(deprecatedDir, { recursive: true });
    const deprecatedFile = path.join(deprecatedDir, "check-backend.md");
    fs.writeFileSync(deprecatedFile, ORIGINAL_CHECK_BACKEND_CONTENT);

    await update({ force: true });

    // File should be DELETED (hash matched allowed_hashes, no update.skip protection)
    expect(fs.existsSync(deprecatedFile)).toBe(false);
  });

  it("#22 preserves existing Claude statusLine config and hook file on update", async () => {
    await init({ yes: true, force: true, claude: true });

    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const statusLinePath = path.join(
      tmpDir,
      ".claude",
      "hooks",
      "statusline.py",
    );
    const statusLineConfig = {
      type: "command",
      command: "python3 .claude/hooks/statusline.py",
    };

    const settings = JSON.parse(
      fs.readFileSync(settingsPath, "utf-8"),
    ) as Record<string, unknown>;
    settings.statusLine = statusLineConfig;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    fs.writeFileSync(statusLinePath, "# existing local statusline\n");

    await update({ force: true });

    expect(fs.existsSync(statusLinePath)).toBe(true);
    const updatedSettings = JSON.parse(
      fs.readFileSync(settingsPath, "utf-8"),
    ) as Record<string, unknown>;
    expect(updatedSettings.statusLine).toEqual(statusLineConfig);
    expect(updatedSettings.hooks).toBeDefined();
  });

  // --- Breaking-change migration gate (v0.5.0-beta.0+) ---
  // Gate: if upgrading from a version that spans a breaking manifest with
  // recommendMigrate=true, `update` must be invoked with --migrate (or --dry-run
  // for preview). Without either, exit 1 with a clear error.

  /** Simulate a 0.4.0 project by writing a legacy command file that the manifest renames */
  function stageLegacy040Project(): void {
    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    fs.writeFileSync(versionPath, "0.4.0");
    // Create one legacy file that matches a `rename` entry in 0.5.0-beta.0 manifest.
    // Without this, classifyMigrations finds no work → early-exit before gate.
    const legacyDir = path.join(tmpDir, ".claude", "commands", "trellis");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "before-dev.md"), "legacy content");
  }

  /** Delete the post-init target so classifyMigrations hits the "new doesn't exist"
   *  branch and respects `isTemplateModified` on the source (→ confirm bucket). */
  function clearMigrationTarget(): void {
    fs.rmSync(path.join(tmpDir, ".claude/skills/trellis-before-dev"), {
      recursive: true,
      force: true,
    });
  }

  it("#22 breaking-change gate exits 1 when --migrate is missing", async () => {
    await setupProject();
    stageLegacy040Project();

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await update({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("#23 breaking-change gate allows --dry-run without --migrate", async () => {
    await setupProject();
    stageLegacy040Project();

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await update({ dryRun: true });

    // Gate must not fire for preview mode (users need to inspect before migrating)
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("#24 breaking-change gate allows --migrate to proceed", async () => {
    await setupProject();
    stageLegacy040Project();

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await update({ migrate: true, force: true });

    // Gate passes when --migrate is present; update proceeds to completion
    expect(exitSpy).not.toHaveBeenCalled();
    // Version must advance to current CLI after the migrate run
    const versionPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version");
    expect(fs.readFileSync(versionPath, "utf-8")).toBe(VERSION);
  });

  // The [b] Backup-rename path in the confirm prompt promises "keeps a .backup
  // copy". Previously it was identical to [r] (both relied on the full project
  // snapshot). We now write an INLINE .backup next to the new path so users can
  // diff/merge their customizations without digging through .trellis/.backup-*/.
  /** Install a mock that returns a specific migration choice for the per-file prompt
   *  and {proceed: true} for the top-level confirm. Resolves the flakiness of
   *  matching on `name` field in the dynamic import path. */
  async function installChoiceMock(
    choice: "rename" | "backup-rename" | "skip",
  ) {
    const inquirer = (await import("inquirer")).default;
    vi.mocked(inquirer.prompt).mockImplementation(((questions: unknown) => {
      const q = Array.isArray(questions) ? questions[0] : questions;
      const name = (q as { name?: string }).name;
      if (name === "choice") return Promise.resolve({ choice });
      return Promise.resolve({ proceed: true });
    }) as never);
  }

  // The [b] Backup-rename path in the confirm prompt promises "keeps a .backup
  // copy". Previously it was identical to [r] (both relied on the full project
  // snapshot). We now write an INLINE .backup next to the new path so users can
  // diff/merge their customizations without digging through .trellis/.backup-*/.
  it("#25 backup-rename leaves inline <new-path>.backup with original content", async () => {
    await setupProject();
    stageLegacy040Project();
    clearMigrationTarget();

    // User-modified content that differs from the 0.5 template (forces confirm)
    const legacyPath = path.join(
      tmpDir,
      ".claude/commands/trellis/before-dev.md",
    );
    const userContent = "## My custom before-dev notes\nEdited by user.\n";
    fs.writeFileSync(legacyPath, userContent);

    await installChoiceMock("backup-rename");

    await update({ migrate: true });

    // After migration:
    //   - new-path exists (rename completed)
    //   - new-path.backup exists with the user's content (inline preservation)
    //   - old-path is gone
    const newPath = path.join(
      tmpDir,
      ".claude/skills/trellis-before-dev/SKILL.md",
    );
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(newPath + ".backup")).toBe(true);
    expect(fs.readFileSync(newPath + ".backup", "utf-8")).toBe(userContent);
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it("#26 rename-anyway does NOT leave an inline .backup (relies on project snapshot)", async () => {
    await setupProject();
    stageLegacy040Project();
    clearMigrationTarget();

    const legacyPath = path.join(
      tmpDir,
      ".claude/commands/trellis/before-dev.md",
    );
    fs.writeFileSync(legacyPath, "## user edits\n");

    await installChoiceMock("rename");

    await update({ migrate: true });

    const newPath = path.join(
      tmpDir,
      ".claude/skills/trellis-before-dev/SKILL.md",
    );
    expect(fs.existsSync(newPath)).toBe(true);
    // No inline .backup — the full-project snapshot under .trellis/.backup-*
    // is the single source of recovery for this mode.
    expect(fs.existsSync(newPath + ".backup")).toBe(false);
  });

  it("#27 backup skips managed node_modules dependency trees", async () => {
    await setupProject();

    const opencodeRoot = path.join(tmpDir, ".opencode");
    fs.mkdirSync(path.join(opencodeRoot, "node_modules", "zod"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(opencodeRoot, "package.json"), "{}\n");
    fs.writeFileSync(
      path.join(opencodeRoot, "node_modules", "zod", "index.js"),
      "module.exports = {};\n",
    );

    // Trigger an update that creates a backup.
    const targetFull = path.join(tmpDir, MANAGED_FILE);
    fs.writeFileSync(targetFull, "user customized content");

    await update({ force: true });

    const entries = fs.readdirSync(path.join(tmpDir, DIR_NAMES.WORKFLOW));
    const backupDirs = entries.filter((e) => e.startsWith(".backup-"));
    expect(backupDirs.length).toBe(1);

    const backupDir = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      backupDirs[0] as string,
    );
    expect(
      fs.existsSync(path.join(backupDir, ".opencode", "package.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(backupDir, ".opencode", "node_modules")),
    ).toBe(false);
  });

  it("#workflow-md-r4 buildWorkflowMdTemplate merges legacy workflow.md: appends missing tag blocks, replaces customized blocks, preserves user prose", async () => {
    // Finding 2: end-to-end coverage of buildWorkflowMdTemplate's per-tag
    // managed-block replacement (R4 of workflow-state-commit-gap task).
    // Legacy fixture: heavy user customization outside tag blocks; only 2 of
    // 4 [workflow-state:*] blocks present (planning, in_progress) with
    // customized bodies; no_task and completed blocks absent entirely.
    await setupProject();

    const workflowPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    const userNarrative1 =
      "## Local Notes\n\nThis project's workflow has been adjusted for our team.\n";
    const userNarrative2 =
      "## Team Conventions\n\n- We always pair on PRD reviews.\n- We use --no-pager for git logs.\n";
    const customizedPlanning =
      "[workflow-state:planning]\nCUSTOM BODY: my planning hint that's been heavily edited.\n[/workflow-state:planning]";
    const customizedInProgress =
      "[workflow-state:in_progress]\nCUSTOM BODY: my in_progress hint with notes.\n[/workflow-state:in_progress]";
    const legacyContent =
      "# Workflow\n\n" +
      userNarrative1 +
      "\n" +
      customizedPlanning +
      "\n\n" +
      userNarrative2 +
      "\n" +
      customizedInProgress +
      "\n";

    fs.writeFileSync(workflowPath, legacyContent, "utf-8");

    // Invalidate hash so update treats workflow.md as needing reconciliation.
    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashes = removeHashEntry(
      readHashesV2(hashFile),
      PATHS.WORKFLOW_GUIDE_FILE,
    ) as Record<string, string>;
    writeHashesV2(hashFile, hashes);

    const consoleLogSpy = vi.spyOn(console, "log");

    await update({ force: true });

    const merged = fs.readFileSync(workflowPath, "utf-8");

    // All 4 required blocks are present after merge.
    for (const status of [
      "planning",
      "in_progress",
      "no_task",
      "completed",
    ] as const) {
      const re = new RegExp(
        `\\[workflow-state:${status}\\]\\s*\\n[\\s\\S]+?\\n\\s*\\[/workflow-state:${status}\\]`,
      );
      expect(merged, `${status} block must be present after merge`).toMatch(re);
    }

    // User narrative outside the tag blocks is preserved verbatim.
    expect(merged).toContain("## Local Notes");
    expect(merged).toContain(
      "This project's workflow has been adjusted for our team.",
    );
    expect(merged).toContain("## Team Conventions");
    expect(merged).toContain("- We always pair on PRD reviews.");
    expect(merged).toContain("- We use --no-pager for git logs.");

    // Customized blocks were REPLACED with canonical content (per the
    // managed-block contract — customizations inside tag blocks are owned by
    // the CLI, same trade-off as AGENTS.md TRELLIS:START/END).
    expect(merged).not.toContain(
      "CUSTOM BODY: my planning hint that's been heavily edited.",
    );
    expect(merged).not.toContain(
      "CUSTOM BODY: my in_progress hint with notes.",
    );

    // The yellow warning was emitted listing the customized blocks that got
    // overwritten (so the user knows to re-apply customization).
    const warningCalls = consoleLogSpy.mock.calls.filter((args) =>
      String(args[0] ?? "").includes("[workflow-state:"),
    );
    expect(warningCalls.length).toBeGreaterThan(0);
    const warningText = warningCalls.map((c) => String(c[0])).join("\n");
    expect(warningText).toMatch(/planning/);
    expect(warningText).toMatch(/in_progress/);
  });
});
