/**
 * Integration tests for the init + uninstall data-loss fix
 * (.trellis/tasks/05-13-uninstall-overdelete-manifest-leak).
 *
 * Reproduces GitHub Issue #221 (.codex/sessions/ deletion) and PR #271 review
 * comment (pre-existing AGENTS.md deletion). Verifies:
 *   - init's manifest only contains paths trellis actually wrote
 *   - uninstall does not touch user-owned files under platform-managed dirs
 *   - homedir guard refuses init/uninstall in $HOME
 *   - poisoned-manifest self-heal works on both update and uninstall entry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import inquirer from "inquirer";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "TRELLIS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn() },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation((cmd: string) => {
    const py = process.platform === "win32" ? "python" : "python3";
    return cmd === `${py} --version` ? "Python 3.11.12" : "";
  }),
}));

import { init } from "../../src/commands/init.js";
import { uninstall } from "../../src/commands/uninstall.js";
import { update } from "../../src/commands/update.js";
import { loadHashes, saveHashes } from "../../src/utils/template-hash.js";
import { agentsMdContent } from "../../src/templates/markdown/index.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe("init + uninstall: manifest accuracy + homedir guard", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-overdelete-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.mocked(inquirer.prompt).mockResolvedValue({ proceed: true });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });
    delete process.env.TRELLIS_ALLOW_HOMEDIR;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TRELLIS_ALLOW_HOMEDIR;
  });

  // ----- R1: manifest accuracy after init -----

  it("#R1.1 init does not hash pre-existing .codex/sessions/ user data (issue #221)", async () => {
    // Repro from the issue body. User has codex chat history before they ever
    // ran trellis.
    const userSession = path.join(
      tmpDir,
      ".codex",
      "sessions",
      "2026",
      "x.jsonl",
    );
    fs.mkdirSync(path.dirname(userSession), { recursive: true });
    fs.writeFileSync(userSession, "user-chat-data\n");

    await init({ yes: true, codex: true, force: true });

    const hashes = loadHashes(tmpDir);
    expect(hashes).not.toHaveProperty(".codex/sessions/2026/x.jsonl");
    // Sanity: trellis's own codex files ARE tracked.
    const trackedCodex = Object.keys(hashes).filter((k) =>
      k.startsWith(".codex/"),
    );
    expect(trackedCodex.length).toBeGreaterThan(0);
  });

  it("#R1.2 init does not hash pre-existing .claude/projects/ chat history", async () => {
    // Catastrophic case: Claude Code stores conversation history in
    // .claude/projects/<sanitized-cwd>/*.jsonl globally.
    const userChat = path.join(
      tmpDir,
      ".claude",
      "projects",
      "my-project",
      "conversation-abc.jsonl",
    );
    fs.mkdirSync(path.dirname(userChat), { recursive: true });
    fs.writeFileSync(userChat, '{"role":"user"}\n');

    await init({ yes: true, claude: true, force: true });

    const hashes = loadHashes(tmpDir);
    expect(hashes).not.toHaveProperty(
      ".claude/projects/my-project/conversation-abc.jsonl",
    );
  });

  it("#R1.3 init --skip-existing on pre-existing AGENTS.md: file NOT in manifest (PR #271 case)", async () => {
    // User's pre-existing AGENTS.md must not be hashed when init skips it.
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "my own AGENTS.md\n");

    await init({ yes: true, claude: true, skipExisting: true });

    const hashes = loadHashes(tmpDir);
    expect(hashes).not.toHaveProperty("AGENTS.md");
  });

  it("#R1.3b init does not hash pre-existing AGENTS.md even when content is byte-identical", async () => {
    // A byte-identical file still might be user-owned. The init manifest must
    // track actual writes, not ownership inferred from content equality.
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), agentsMdContent);

    await init({ yes: true, claude: true, force: true });

    const hashes = loadHashes(tmpDir);
    expect(hashes).not.toHaveProperty("AGENTS.md");
  });

  // ----- R1 → uninstall outcome: user data survives -----

  it("#R1.4 init → uninstall preserves user data under .codex/sessions/", async () => {
    const userSession = path.join(
      tmpDir,
      ".codex",
      "sessions",
      "2026",
      "x.jsonl",
    );
    fs.mkdirSync(path.dirname(userSession), { recursive: true });
    fs.writeFileSync(userSession, "user-chat-data\n");

    await init({ yes: true, codex: true, force: true });
    await uninstall({ yes: true });

    // The user's session JSONL survives.
    expect(fs.existsSync(userSession)).toBe(true);
    expect(fs.readFileSync(userSession, "utf-8")).toBe("user-chat-data\n");
  });

  it("#R1.5 init --skip-existing → uninstall preserves user's AGENTS.md", async () => {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "my own AGENTS.md\n");

    await init({ yes: true, claude: true, skipExisting: true });
    await uninstall({ yes: true });

    expect(fs.existsSync(path.join(tmpDir, "AGENTS.md"))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8")).toBe(
      "my own AGENTS.md\n",
    );
  });

  // ----- R1.6: Trellis-written AGENTS.md with user content outside the block -----

  it("#R1.6 uninstall strips only the Trellis block from a tracked AGENTS.md, preserving user content outside it", async () => {
    // Trellis writes AGENTS.md (so it's manifest-tracked, unlike the
    // skip-existing cases above). The user then adds their own instructions
    // OUTSIDE the <!-- TRELLIS:START/END --> block — a supported layout that
    // update.ts explicitly preserves. Uninstall must not unlink the whole
    // file and take the user content with it.
    await init({ yes: true, claude: true, force: true });
    const agentsPath = path.join(tmpDir, "AGENTS.md");
    // Sanity: Trellis tracked it and wrote the managed block.
    expect(loadHashes(tmpDir)).toHaveProperty("AGENTS.md");
    const written = fs.readFileSync(agentsPath, "utf-8");
    expect(written).toContain("<!-- TRELLIS:START -->");

    const userSection = "\n## My project rules\n\nAlways rebase.\n";
    fs.writeFileSync(agentsPath, written + userSection);

    await uninstall({ yes: true });

    expect(fs.existsSync(agentsPath)).toBe(true);
    const after = fs.readFileSync(agentsPath, "utf-8");
    expect(after).not.toContain("<!-- TRELLIS:START -->");
    expect(after).not.toContain("<!-- TRELLIS:END -->");
    expect(after).toContain("## My project rules");
    expect(after).toContain("Always rebase.");
  });

  it("#R1.7 uninstall still deletes a tracked AGENTS.md that is only the Trellis block", async () => {
    // Normal case: user never edited AGENTS.md, so once the block is stripped
    // nothing user-authored remains and the file is removed.
    await init({ yes: true, claude: true, force: true });
    const agentsPath = path.join(tmpDir, "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);

    await uninstall({ yes: true });

    expect(fs.existsSync(agentsPath)).toBe(false);
  });

  // ----- R3: poisoned-manifest self-heal -----

  it("#R3.1 update silently prunes orphan manifest entries", async () => {
    // First, run a clean init.
    await init({ yes: true, claude: true, force: true });

    // Then poison the manifest by hand: add an entry for a user-owned file
    // that no platform configurator owns. This simulates the state created
    // by a buggy pre-fix init version.
    const userFile = path.join(tmpDir, ".codex", "sessions", "user.jsonl");
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.writeFileSync(userFile, "user data\n");

    const hashes = loadHashes(tmpDir);
    hashes[".codex/sessions/user.jsonl"] = "fake-hash";
    saveHashes(tmpDir, hashes);

    expect(loadHashes(tmpDir)).toHaveProperty(".codex/sessions/user.jsonl");

    await update({});

    // The orphan entry is silently pruned; user file is untouched.
    expect(loadHashes(tmpDir)).not.toHaveProperty(
      ".codex/sessions/user.jsonl",
    );
    expect(fs.existsSync(userFile)).toBe(true);
  });

  it("#R3.2 uninstall self-heals + preserves user file even without prior update", async () => {
    // Most catastrophic path: user has poisoned manifest from old install
    // and runs `trellis uninstall` directly. Prune must fire before plan
    // build, otherwise the user file gets unlinked.
    await init({ yes: true, claude: true, force: true });

    const userFile = path.join(
      tmpDir,
      ".claude",
      "projects",
      "p1",
      "chat.jsonl",
    );
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.writeFileSync(userFile, "chat history\n");

    const hashes = loadHashes(tmpDir);
    hashes[".claude/projects/p1/chat.jsonl"] = "fake-hash";
    saveHashes(tmpDir, hashes);

    await uninstall({ yes: true });

    // User file survives uninstall.
    expect(fs.existsSync(userFile)).toBe(true);
    expect(fs.readFileSync(userFile, "utf-8")).toBe("chat history\n");
  });

  it("#R3.2b uninstall self-heals poisoned pre-existing AGENTS.md", async () => {
    await init({ yes: true, claude: true, force: true });

    const agentsPath = path.join(tmpDir, "AGENTS.md");
    fs.writeFileSync(agentsPath, "my own AGENTS.md\n");

    const hashes = loadHashes(tmpDir);
    hashes["AGENTS.md"] = "fake-user-hash";
    saveHashes(tmpDir, hashes);

    await uninstall({ yes: true });

    expect(fs.existsSync(agentsPath)).toBe(true);
    expect(fs.readFileSync(agentsPath, "utf-8")).toBe("my own AGENTS.md\n");
  });

  it("#R3.3 prune keeps migration-referenced paths even if not in collectTemplates", async () => {
    // Some migration manifests reference old paths that no current
    // configurator owns (they're being renamed/deleted). The prune helper
    // must not strip those, otherwise legitimate pending migrations lose
    // their hash records and the migration logic regresses.
    await init({ yes: true, claude: true, force: true });

    // We can't easily fabricate a real migration entry in this test, but we
    // CAN assert the prune behavior preserves .trellis/ entries which is the
    // most common "not-in-collectTemplates-but-important" case. (Migration
    // paths share the same preservation logic in pruneOrphanManifestKeys.)
    const hashes = loadHashes(tmpDir);
    hashes[".trellis/workflow.md"] = "ok";
    saveHashes(tmpDir, hashes);

    await update({});

    // .trellis/* entries are kept.
    expect(loadHashes(tmpDir)).toHaveProperty(".trellis/workflow.md");
  });

  // ----- R2: homedir guard -----

  /**
   * Helper: force `os.homedir()` to return `fakeHome` for the duration of fn.
   * Uses HOME/USERPROFILE env vars, which Node's os.homedir() consults first.
   * This is more reliable across ESM/CJS than `vi.spyOn(os, "homedir")` which
   * fails on destructured imports.
   */
  async function withFakeHome<T>(
    fakeHome: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const origHome = process.env.HOME;
    const origUserProfile = process.env.USERPROFILE;
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    try {
      return await fn();
    } finally {
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
      if (origUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = origUserProfile;
    }
  }

  it("#R2.1 init refuses to run when cwd === $HOME", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    try {
      vi.spyOn(process, "cwd").mockReturnValue(fakeHome);

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(((code?: number) => {
          throw new Error(`process.exit(${code ?? 0})`);
        }) as never);

      await withFakeHome(fakeHome, async () => {
        await expect(init({ yes: true, force: true })).rejects.toThrow(
          "process.exit(1)",
        );
      });
      expect(exitSpy).toHaveBeenCalledWith(1);

      // No .trellis dir was created.
      expect(fs.existsSync(path.join(fakeHome, ".trellis"))).toBe(false);
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("#R2.2 uninstall refuses to run when cwd === $HOME", async () => {
    // Set up a valid trellis project, then pretend its cwd is the homedir.
    await init({ yes: true, claude: true, force: true });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as never);

    await withFakeHome(tmpDir, async () => {
      await expect(uninstall({ yes: true })).rejects.toThrow(
        "process.exit(1)",
      );
    });
    expect(exitSpy).toHaveBeenCalledWith(1);

    // Project is unchanged.
    expect(fs.existsSync(path.join(tmpDir, ".trellis"))).toBe(true);
  });

  it("#R2.3 TRELLIS_ALLOW_HOMEDIR=1 bypasses the guard for init", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    try {
      vi.spyOn(process, "cwd").mockReturnValue(fakeHome);
      process.env.TRELLIS_ALLOW_HOMEDIR = "1";

      await withFakeHome(fakeHome, async () => {
        await init({ yes: true, claude: true, force: true });
      });

      expect(fs.existsSync(path.join(fakeHome, ".trellis"))).toBe(true);
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("#R2.4 subdirectories of $HOME are NOT blocked", async () => {
    // Even if cwd is under $HOME, the guard should only trip on exact match.
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    const subDir = path.join(fakeHome, "projects", "foo");
    fs.mkdirSync(subDir, { recursive: true });
    try {
      vi.spyOn(process, "cwd").mockReturnValue(subDir);

      await withFakeHome(fakeHome, async () => {
        await init({ yes: true, claude: true, force: true });
      });

      expect(fs.existsSync(path.join(subDir, ".trellis"))).toBe(true);
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
