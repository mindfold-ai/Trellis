/**
 * Unit tests for pruneOrphanManifestKeys + isCwdHomedir
 * (.trellis/tasks/05-13-uninstall-overdelete-manifest-leak).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { pruneOrphanManifestKeys } from "../../src/utils/manifest-prune.js";
import {
  isCwdHomedir,
  homedirBypassEnabled,
  homedirGuardMessage,
} from "../../src/utils/cwd-guard.js";
import { saveHashes, loadHashes } from "../../src/utils/template-hash.js";

describe("pruneOrphanManifestKeys", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-prune-"));
    fs.mkdirSync(path.join(tmpDir, ".trellis"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("preserves every .trellis/* entry regardless of platform-collect output", () => {
    const hashes = {
      ".trellis/workflow.yaml": "h1",
      ".trellis/scripts/task.py": "h2",
      ".trellis/config.yaml": "h3",
    };
    saveHashes(tmpDir, hashes);

    const { pruned, hashes: kept } = pruneOrphanManifestKeys(tmpDir, [], hashes);

    expect(pruned).toEqual([]);
    expect(kept).toEqual(hashes);
  });

  it("prunes platform-dir entries no current configurator owns", () => {
    const hashes = {
      ".codex/sessions/2026/x.jsonl": "user-data-hash",
      ".claude/projects/p1/chat.jsonl": "user-data-hash",
      ".opencode/runtime-cache.db": "user-data-hash",
    };
    saveHashes(tmpDir, hashes);

    // No platform configured → none of these are known.
    const { pruned } = pruneOrphanManifestKeys(tmpDir, [], hashes);

    expect(pruned.sort()).toEqual(
      [
        ".codex/sessions/2026/x.jsonl",
        ".claude/projects/p1/chat.jsonl",
        ".opencode/runtime-cache.db",
      ].sort(),
    );
  });

  it("keeps entries that any configured platform's collectTemplates owns", () => {
    // Claude configurator owns .claude/settings.json — should survive prune
    // even though it's in the manifest pre-prune.
    const hashes = {
      ".claude/settings.json": "claude-hash",
      ".claude/sessions/user.jsonl": "user-hash",
    };
    saveHashes(tmpDir, hashes);

    const { pruned, hashes: kept } = pruneOrphanManifestKeys(
      tmpDir,
      ["claude-code"],
      hashes,
    );

    expect(pruned).toEqual([".claude/sessions/user.jsonl"]);
    expect(kept).toHaveProperty(".claude/settings.json");
    expect(kept).not.toHaveProperty(".claude/sessions/user.jsonl");
  });

  it("keeps root-level AGENTS.md when it has Trellis managed-block markers", () => {
    const hashes = { "AGENTS.md": "h" };
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "<!-- TRELLIS:START -->\nmanaged\n<!-- TRELLIS:END -->\n",
    );
    saveHashes(tmpDir, hashes);

    const { pruned, hashes: kept } = pruneOrphanManifestKeys(
      tmpDir,
      [],
      hashes,
    );

    expect(pruned).toEqual([]);
    expect(kept).toHaveProperty("AGENTS.md");
  });

  it("prunes poisoned root-level AGENTS.md when the file lacks Trellis markers", () => {
    const hashes = { "AGENTS.md": "user-hash" };
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "my own AGENTS.md\n");
    saveHashes(tmpDir, hashes);

    const { pruned, hashes: kept } = pruneOrphanManifestKeys(
      tmpDir,
      [],
      hashes,
    );

    expect(pruned).toEqual(["AGENTS.md"]);
    expect(kept).not.toHaveProperty("AGENTS.md");
  });

  it("persists pruned manifest to disk by default", () => {
    const hashes = {
      ".trellis/workflow.yaml": "h1",
      ".codex/sessions/user.jsonl": "orphan",
    };
    saveHashes(tmpDir, hashes);

    const { pruned } = pruneOrphanManifestKeys(tmpDir, [], hashes);

    expect(pruned).toEqual([".codex/sessions/user.jsonl"]);
    // Disk should reflect the prune.
    expect(loadHashes(tmpDir)).not.toHaveProperty(".codex/sessions/user.jsonl");
    expect(loadHashes(tmpDir)).toHaveProperty(".trellis/workflow.yaml");
  });

  it("does NOT write disk when persist=false", () => {
    const hashes = {
      ".trellis/workflow.yaml": "h1",
      ".codex/sessions/user.jsonl": "orphan",
    };
    saveHashes(tmpDir, hashes);

    pruneOrphanManifestKeys(tmpDir, [], hashes, { persist: false });

    // Manifest on disk unchanged.
    expect(loadHashes(tmpDir)).toHaveProperty(".codex/sessions/user.jsonl");
  });

  it("does NOT rewrite disk when nothing was pruned", () => {
    const hashes = { ".trellis/workflow.yaml": "h1" };
    saveHashes(tmpDir, hashes);

    const hashFile = path.join(tmpDir, ".trellis", ".template-hashes.json");
    const mtimeBefore = fs.statSync(hashFile).mtimeMs;

    // Wait a tick so mtime would visibly differ if a write happened.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        pruneOrphanManifestKeys(tmpDir, [], hashes);
        const mtimeAfter = fs.statSync(hashFile).mtimeMs;
        expect(mtimeAfter).toBe(mtimeBefore);
        resolve();
      }, 10);
    });
  });
});

describe("isCwdHomedir / homedir guard helpers", () => {
  it("returns false when cwd is a subdirectory of $HOME", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fakehome-"));
    const subDir = path.join(fakeHome, "projects", "foo");
    fs.mkdirSync(subDir, { recursive: true });
    const origCwd = process.cwd;
    const origHome = process.env.HOME;
    try {
      process.cwd = () => subDir;
      process.env.HOME = fakeHome;
      expect(isCwdHomedir()).toBe(false);
    } finally {
      process.cwd = origCwd;
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("returns true when cwd === $HOME exactly", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fakehome-"));
    const origCwd = process.cwd;
    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    try {
      process.cwd = () => fakeHome;
      process.env.HOME = fakeHome;
      process.env.USERPROFILE = fakeHome;
      expect(isCwdHomedir()).toBe(true);
    } finally {
      process.cwd = origCwd;
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
      if (origUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = origUserProfile;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("homedirBypassEnabled reflects TRELLIS_ALLOW_HOMEDIR env var", () => {
    const orig = process.env.TRELLIS_ALLOW_HOMEDIR;
    try {
      delete process.env.TRELLIS_ALLOW_HOMEDIR;
      expect(homedirBypassEnabled()).toBe(false);
      process.env.TRELLIS_ALLOW_HOMEDIR = "1";
      expect(homedirBypassEnabled()).toBe(true);
      for (const value of ["0", "false", "true", ""]) {
        process.env.TRELLIS_ALLOW_HOMEDIR = value;
        expect(homedirBypassEnabled()).toBe(false);
      }
    } finally {
      if (orig === undefined) delete process.env.TRELLIS_ALLOW_HOMEDIR;
      else process.env.TRELLIS_ALLOW_HOMEDIR = orig;
    }
  });

  it("homedirGuardMessage mentions the command and the bypass env var", () => {
    const msgInit = homedirGuardMessage("init");
    expect(msgInit).toContain("init");
    expect(msgInit).toContain("TRELLIS_ALLOW_HOMEDIR=1");

    const msgUninstall = homedirGuardMessage("uninstall");
    expect(msgUninstall).toContain("uninstall");
    expect(msgUninstall).toContain("TRELLIS_ALLOW_HOMEDIR=1");
  });
});
