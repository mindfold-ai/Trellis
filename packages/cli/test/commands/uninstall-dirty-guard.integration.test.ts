/**
 * Integration tests for the uninstall uncommitted-data guard (audit 🔴-7).
 *
 * `trellis uninstall` deletes the whole .trellis/ tree — including
 * user-authored specs, task PRDs, and journals — with no backup. When those
 * hold uncommitted work, a scripted `--yes` run must fail closed rather than
 * silently destroy them.
 *
 * Uses real git + real python (no child_process mock) because the guard
 * shells out to `git status` and init shells out to `python3 --version`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
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

import { init } from "../../src/commands/init.js";
import {
  uninstall,
  collectUncommittedTrellisData,
} from "../../src/commands/uninstall.js";

function has(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const canRun = has("git", ["--version"]) && has("python3", ["--version"]);

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

describe.skipIf(!canRun)("uninstall uncommitted-data guard", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-dirty-")),
    );
    git(tmpDir, "init", "-q", "-b", "main");
    git(tmpDir, "config", "user.email", "t@example.com");
    git(tmpDir, "config", "user.name", "Test");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.mocked(inquirer.prompt).mockResolvedValue({ proceed: true });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });
    delete process.env.TRELLIS_ALLOW_DIRTY_UNINSTALL;
    await init({ yes: true, claude: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TRELLIS_ALLOW_DIRTY_UNINSTALL;
  });

  it("detects a newly added spec file once the tree is committed", () => {
    // Commit the init'd tree first so git reports the new file individually
    // (an entirely-untracked .trellis collapses to the dir name instead).
    git(tmpDir, "add", "-A");
    git(tmpDir, "commit", "-q", "-m", "trellis");

    const specFile = path.join(tmpDir, ".trellis", "spec", "my-rules.md");
    fs.mkdirSync(path.dirname(specFile), { recursive: true });
    fs.writeFileSync(specFile, "my custom spec");

    const dirty = collectUncommittedTrellisData(tmpDir);
    expect(dirty.some((p) => p.includes("spec/my-rules.md"))).toBe(true);
  });

  it("reports nothing once the .trellis tree is committed", () => {
    git(tmpDir, "add", "-A");
    git(tmpDir, "commit", "-q", "-m", "trellis");
    expect(collectUncommittedTrellisData(tmpDir)).toEqual([]);
  });

  it("refuses --yes uninstall while user data is uncommitted, leaving .trellis intact", async () => {
    const specFile = path.join(tmpDir, ".trellis", "spec", "my-rules.md");
    fs.mkdirSync(path.dirname(specFile), { recursive: true });
    fs.writeFileSync(specFile, "unsaved work");

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as never);

    await expect(uninstall({ yes: true })).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    // Nothing was deleted — the spec and the tree survive.
    expect(fs.existsSync(specFile)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".trellis"))).toBe(true);
  });

  it("TRELLIS_ALLOW_DIRTY_UNINSTALL=1 overrides the guard", async () => {
    const specFile = path.join(tmpDir, ".trellis", "spec", "my-rules.md");
    fs.mkdirSync(path.dirname(specFile), { recursive: true });
    fs.writeFileSync(specFile, "unsaved work");
    process.env.TRELLIS_ALLOW_DIRTY_UNINSTALL = "1";

    await uninstall({ yes: true });

    // Override honored — the tree is removed.
    expect(fs.existsSync(path.join(tmpDir, ".trellis"))).toBe(false);
  });

  it("committed user data does not block --yes uninstall", async () => {
    git(tmpDir, "add", "-A");
    git(tmpDir, "commit", "-q", "-m", "trellis");

    await uninstall({ yes: true });

    expect(fs.existsSync(path.join(tmpDir, ".trellis"))).toBe(false);
  });
});
