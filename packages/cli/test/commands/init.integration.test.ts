/**
 * Integration tests for the init() command.
 *
 * Tests the full init flow in real temp directories with minimal mocking.
 * Only external dependencies are mocked: figlet, inquirer, child_process.
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
  default: { prompt: vi.fn().mockResolvedValue({}) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(""),
}));

// === Imports ===

import { init } from "../../src/commands/init.js";
import { VERSION } from "../../src/constants/version.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../../src/constants/paths.js";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { computeHash } from "../../src/utils/template-hash.js";
import { execSync } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe("init() integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-init-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockImplementation(((cmd: string) => {
      const expectedPythonCmd =
        process.platform === "win32" ? "python" : "python3";
      if (cmd === `${expectedPythonCmd} --version`) {
        return "Python 3.11.12";
      }
      return "";
    }) as typeof execSync);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("#1 creates expected directory structure with defaults", async () => {
    await init({ yes: true });

    // Core workflow structure
    expect(fs.existsSync(path.join(tmpDir, DIR_NAMES.WORKFLOW))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.SCRIPTS))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.WORKSPACE))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.TASKS))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, PATHS.SPEC))).toBe(true);

    // Default platforms: cursor + claude
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agent", "workflows"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".kiro", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codebuddy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf", "workflows"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, ".github", "copilot"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".factory"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".pi"))).toBe(false);

    // Root files
    expect(fs.existsSync(path.join(tmpDir, "AGENTS.md"))).toBe(true);

    // Built-in multi-file skill is installed for default platforms.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".claude", "skills", "trellis-meta", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".cursor",
          "skills",
          "trellis-meta",
          "references",
          "local-architecture",
          "overview.md",
        ),
      ),
    ).toBe(true);
  });

  it("#1b does not print the promotional pain-point block", async () => {
    await init({ yes: true });

    const logOutput = vi
      .mocked(console.log)
      .mock.calls.flat()
      .filter((part): part is string => typeof part === "string")
      .join("\n");

    expect(logOutput).not.toContain("Sound familiar?");
    expect(logOutput).not.toContain("You'll never say these again!!");
    expect(logOutput).not.toContain("Wrote CLAUDE.md, AI ignored it");
  });

  it("#2 single platform creates only that platform directory", async () => {
    await init({ yes: true, claude: true });

    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".opencode"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agent", "workflows"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".kiro", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codebuddy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf", "workflows"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, ".github", "copilot"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".factory"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".pi"))).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".claude", "skills", "trellis-meta", "SKILL.md"),
      ),
    ).toBe(true);
  });

  it("#3 multi platform creates all selected platform directories", async () => {
    await init({ yes: true, claude: true, cursor: true, opencode: true });

    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".opencode"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agent", "workflows"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".kiro", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codebuddy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf", "workflows"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, ".github", "copilot"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".pi"))).toBe(false);
  });

  it("#3b codex platform creates skills plus .codex assets", async () => {
    await init({ yes: true, codex: true });

    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(true);
    // Codex SessionStart hook was removed (de-recursion fix); the
    // <trellis-bootstrap> notice in inject-workflow-state.py invokes
    // `$trellis-start` to load workflow context, so the skill is emitted.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "trellis-start", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".agents",
          "skills",
          "trellis-finish-work",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "trellis-continue", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "trellis-meta", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".agents",
          "skills",
          "trellis-meta",
          "references",
          "local-architecture",
          "overview.md",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".codex", "skills", "trellis-meta", "SKILL.md"),
      ),
    ).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codex", "config.toml"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(tmpDir, ".codex", "agents", "trellis-check.toml"),
      ),
    ).toBe(true);
    // parallel skill removed — platform-native worktree features used instead
    expect(fs.existsSync(path.join(tmpDir, ".codex", "hooks.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".codex", "hooks", "session-start.py")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(false);

    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashesFile = JSON.parse(fs.readFileSync(hashFile, "utf-8")) as {
      __version?: number;
      hashes?: Record<string, string>;
    };
    const hashes = hashesFile.hashes ?? {};
    const trackedPaths = Object.keys(hashes).map((p) => p.replace(/\\/g, "/"));
    expect(trackedPaths).toContain(".agents/skills/trellis-meta/SKILL.md");
    expect(trackedPaths).toContain(
      ".agents/skills/trellis-meta/references/local-architecture/overview.md",
    );
  });

  it("#3c kiro platform creates .kiro/skills", async () => {
    await init({ yes: true, kiro: true });

    expect(fs.existsSync(path.join(tmpDir, ".kiro", "skills"))).toBe(true);
    // Kiro is agent-capable → trellis-start skill not emitted.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".kiro", "skills", "trellis-start", "SKILL.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".kiro", "skills", "trellis-finish-work", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".kiro", "skills", "trellis-continue", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".kiro", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3d antigravity platform creates .agent/workflows", async () => {
    await init({ yes: true, antigravity: true });

    expect(fs.existsSync(path.join(tmpDir, ".agent", "workflows"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".agent", "workflows", "start.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(false);
  });

  it("#3f windsurf platform creates .windsurf/workflows", async () => {
    await init({ yes: true, windsurf: true });

    expect(fs.existsSync(path.join(tmpDir, ".windsurf", "workflows"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(tmpDir, ".windsurf", "workflows", "trellis-start.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3g qoder platform creates .qoder/commands + .qoder/skills", async () => {
    await init({ yes: true, qoder: true });

    expect(
      fs.existsSync(
        path.join(tmpDir, ".qoder", "commands", "trellis-finish-work.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".qoder", "skills", "trellis-brainstorm", "SKILL.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3h codebuddy platform creates .codebuddy/commands/trellis", async () => {
    await init({ yes: true, codebuddy: true });

    expect(
      fs.existsSync(path.join(tmpDir, ".codebuddy", "commands", "trellis")),
    ).toBe(true);
    // CodeBuddy is agent-capable → start.md not emitted.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".codebuddy", "commands", "trellis", "start.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".codebuddy",
          "commands",
          "trellis",
          "finish-work.md",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".codebuddy", "commands", "trellis", "continue.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3i copilot platform creates .github/copilot hooks and discovery config", async () => {
    await init({ yes: true, copilot: true });

    expect(fs.existsSync(path.join(tmpDir, ".github", "prompts"))).toBe(true);
    // Copilot is agent-capable → start.prompt.md not emitted.
    expect(
      fs.existsSync(path.join(tmpDir, ".github", "prompts", "start.prompt.md")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github", "prompts", "finish-work.prompt.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github", "prompts", "continue.prompt.md"),
      ),
    ).toBe(true);

    expect(
      fs.existsSync(path.join(tmpDir, ".github", "copilot", "hooks")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".github", "copilot", "hooks", "session-start.py"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".github", "copilot", "hooks.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".github", "hooks", "trellis.json")),
    ).toBe(true);

    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashesFile = JSON.parse(fs.readFileSync(hashFile, "utf-8")) as {
      __version?: number;
      hashes?: Record<string, string>;
    };
    const hashes = hashesFile.hashes ?? {};
    const trackedPaths = Object.keys(hashes).map((p) => p.replace(/\\/g, "/"));
    expect(trackedPaths).not.toContain(".github/prompts/start.prompt.md");
    expect(trackedPaths).toContain(".github/prompts/finish-work.prompt.md");
    expect(trackedPaths).toContain(".github/prompts/continue.prompt.md");
    expect(trackedPaths).toContain(".github/copilot/hooks.json");
    expect(trackedPaths).toContain(".github/hooks/trellis.json");

    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3e gemini platform creates .gemini/commands/trellis", async () => {
    await init({ yes: true, gemini: true });
    expect(
      fs.existsSync(path.join(tmpDir, ".gemini", "commands", "trellis")),
    ).toBe(true);
    // Gemini is agent-capable → start.toml not emitted.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".gemini", "commands", "trellis", "start.toml"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".gemini", "commands", "trellis", "finish-work.toml"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".gemini", "commands", "trellis", "continue.toml"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3j droid platform creates commands + skills", async () => {
    await init({ yes: true, droid: true });
    // Droid is agent-capable → start.md not emitted.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".factory", "commands", "trellis", "start.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".factory", "commands", "trellis", "finish-work.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".factory", "commands", "trellis", "continue.md"),
      ),
    ).toBe(true);
    // Skills (trellis- prefix)
    expect(
      fs.existsSync(
        path.join(tmpDir, ".factory", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
  });

  it("#3k pi platform creates extension-backed prompts, skills, and agents", async () => {
    await init({ yes: true, pi: true });

    expect(fs.existsSync(path.join(tmpDir, ".pi", "settings.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "prompts", "trellis-start.md")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".pi", "prompts", "trellis-finish-work.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "prompts", "trellis-continue.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".pi", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "agents", "trellis-implement.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".pi", "extensions", "trellis", "index.ts"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".pi", "hooks"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);

    const hashFile = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    const hashesFile = JSON.parse(fs.readFileSync(hashFile, "utf-8")) as {
      __version?: number;
      hashes?: Record<string, string>;
    };
    const hashes = hashesFile.hashes ?? {};
    const trackedPaths = Object.keys(hashes).map((p) => p.replace(/\\/g, "/"));
    const piTemplates = collectPlatformTemplates("pi");
    expect(piTemplates).toBeInstanceOf(Map);
    if (!piTemplates) {
      throw new Error("Expected Pi templates to be collectable");
    }
    const expectedPiPaths = [...piTemplates.keys()];
    expect(trackedPaths).toEqual(expect.arrayContaining(expectedPiPaths));
  });

  it("#4 force mode overwrites previously modified files", async () => {
    await init({ yes: true, force: true });

    const workflowMd = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    const original = fs.readFileSync(workflowMd, "utf-8");
    fs.writeFileSync(workflowMd, "user modified content");

    await init({ yes: true, force: true });

    expect(fs.readFileSync(workflowMd, "utf-8")).toBe(original);
  });

  it("#5 skip mode preserves previously modified files", async () => {
    await init({ yes: true, force: true });

    const workflowMd = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    fs.writeFileSync(workflowMd, "user modified content");

    await init({ yes: true, skipExisting: true });

    expect(fs.readFileSync(workflowMd, "utf-8")).toBe("user modified content");
  });

  it("#6 re-init with force produces identical file set", async () => {
    await init({ yes: true, force: true });

    const collectFiles = (dir: string): string[] => {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else files.push(path.relative(tmpDir, full));
        }
      };
      walk(dir);
      return files.sort();
    };

    const first = collectFiles(tmpDir);
    await init({ yes: true, force: true });
    const second = collectFiles(tmpDir);

    expect(second).toEqual(first);
  });

  it("#7 passes developer name to init_developer script", async () => {
    await init({ yes: true, user: "testdev" });

    const calls = vi.mocked(execSync).mock.calls;
    const match = calls.find(
      ([cmd]) => typeof cmd === "string" && cmd.includes("init_developer.py"),
    );
    expect(match).toBeDefined();
    const command = String((match as [unknown])[0]);
    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";
    expect(command).toContain(`${expectedPythonCmd} "`);
    expect(command).toContain('"testdev"');
  });

  it("#7b throws when the selected Python command is below 3.9", async () => {
    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";

    vi.mocked(execSync).mockImplementation(((cmd: string) => {
      if (cmd === `${expectedPythonCmd} --version`) {
        return "Python 3.8.18";
      }
      return "";
    }) as typeof execSync);

    await expect(init({ yes: true, claude: true })).rejects.toThrow(
      `Python 3.8.18 detected via "${expectedPythonCmd}", but Trellis init requires Python ≥ 3.9.`,
    );
    expect(fs.existsSync(path.join(tmpDir, DIR_NAMES.WORKFLOW))).toBe(false);
  });

  it("#7c throws when the selected Python command is missing", async () => {
    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";

    vi.mocked(execSync).mockImplementation(((cmd: string) => {
      if (cmd === `${expectedPythonCmd} --version`) {
        throw new Error("not found");
      }
      return "";
    }) as typeof execSync);

    await expect(init({ yes: true, claude: true })).rejects.toThrow(
      `Python command "${expectedPythonCmd}" not found. Trellis init requires Python ≥ 3.9.`,
    );
    expect(fs.existsSync(path.join(tmpDir, DIR_NAMES.WORKFLOW))).toBe(false);
  });

  it("#7d renders the platform Python command into generated config and logs the adaptation", async () => {
    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";

    await init({ yes: true, claude: true });

    const settings = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(settings).toContain(
      `"${expectedPythonCmd} .claude/hooks/session-start.py"`,
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `Trellis rendered Python commands as "${expectedPythonCmd}" in generated hooks, settings, and help text`,
      ),
    );
  });

  it("#8 writes correct version file", async () => {
    await init({ yes: true });

    const content = fs.readFileSync(
      path.join(tmpDir, DIR_NAMES.WORKFLOW, ".version"),
      "utf-8",
    );
    expect(content).toBe(VERSION);
  });

  it("#9 initializes template hash tracking file", async () => {
    await init({ yes: true });

    const hashPath = path.join(
      tmpDir,
      DIR_NAMES.WORKFLOW,
      ".template-hashes.json",
    );
    expect(fs.existsSync(hashPath)).toBe(true);
    const hashesFile = JSON.parse(fs.readFileSync(hashPath, "utf-8")) as {
      hashes?: Record<string, string>;
    };
    const hashes = hashesFile.hashes ?? {};
    const agentsContent = fs.readFileSync(
      path.join(tmpDir, FILE_NAMES.AGENTS),
      "utf-8",
    );
    expect(hashes[FILE_NAMES.AGENTS]).toBe(computeHash(agentsContent));
    expect(Object.keys(hashes).length).toBeGreaterThan(0);
  });

  it("#10 creates spec templates for backend, frontend, and guides", async () => {
    await init({ yes: true });

    const specDir = path.join(tmpDir, PATHS.SPEC);
    expect(fs.existsSync(path.join(specDir, "backend", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(specDir, "frontend", "index.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(specDir, "guides", "index.md"))).toBe(true);
  });

  it("#11 backend project init skips frontend spec templates", async () => {
    // go.mod triggers detectProjectType → "backend"
    fs.writeFileSync(path.join(tmpDir, "go.mod"), "module example.com/app\n");

    await init({ yes: true });

    const specDir = path.join(tmpDir, PATHS.SPEC);
    expect(fs.existsSync(path.join(specDir, "backend", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(specDir, "frontend"))).toBe(false);
    expect(fs.existsSync(path.join(specDir, "guides", "index.md"))).toBe(true);
  });

  it("#12 frontend project init skips backend spec templates", async () => {
    // vite.config.ts triggers detectProjectType → "frontend"
    fs.writeFileSync(
      path.join(tmpDir, "vite.config.ts"),
      "export default {}\n",
    );

    await init({ yes: true });

    const specDir = path.join(tmpDir, PATHS.SPEC);
    expect(fs.existsSync(path.join(specDir, "frontend", "index.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(specDir, "backend"))).toBe(false);
    expect(fs.existsSync(path.join(specDir, "guides", "index.md"))).toBe(true);
  });

  // ===========================================================================
  // Monorepo integration tests
  // ===========================================================================

  /** Helper: set up a pnpm workspace with two packages */
  function setupPnpmWorkspace(
    dir: string,
    packages: { rel: string; name: string; files?: Record<string, string> }[],
  ): void {
    fs.writeFileSync(
      path.join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    for (const pkg of packages) {
      const pkgDir = path.join(dir, pkg.rel);
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: pkg.name }),
      );
      if (pkg.files) {
        for (const [name, content] of Object.entries(pkg.files)) {
          fs.writeFileSync(path.join(pkgDir, name), content);
        }
      }
    }
  }

  it("#13 monorepo: creates per-package spec directories", async () => {
    // @app/web: vite.config.ts → frontend (package.json also present → still frontend)
    // @app/api: package.json + go.mod → fullstack (both indicators present)
    setupPnpmWorkspace(tmpDir, [
      {
        rel: "packages/web",
        name: "@app/web",
        files: { "vite.config.ts": "" },
      },
      { rel: "packages/api", name: "@app/api", files: { "go.mod": "" } },
    ]);

    await init({ yes: true });

    const specDir = path.join(tmpDir, PATHS.SPEC);
    // Per-package spec dirs created with sanitized names (scope stripped)
    expect(fs.existsSync(path.join(specDir, "web"))).toBe(true);
    expect(fs.existsSync(path.join(specDir, "api"))).toBe(true);

    // web: frontend (vite.config.ts) → has frontend/, no backend/
    expect(
      fs.existsSync(path.join(specDir, "web", "frontend", "index.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(specDir, "web", "backend"))).toBe(false);

    // api: fullstack (package.json + go.mod) → has both backend/ and frontend/
    expect(
      fs.existsSync(path.join(specDir, "api", "backend", "index.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(specDir, "api", "frontend", "index.md")),
    ).toBe(true);

    // Guides still created (shared)
    expect(fs.existsSync(path.join(specDir, "guides", "index.md"))).toBe(true);

    // Global backend/frontend should NOT exist (monorepo mode)
    expect(fs.existsSync(path.join(specDir, "backend"))).toBe(false);
    expect(fs.existsSync(path.join(specDir, "frontend"))).toBe(false);
  });

  it("#14 monorepo: writes packages section to config.yaml", async () => {
    setupPnpmWorkspace(tmpDir, [
      { rel: "packages/cli", name: "@trellis/cli" },
      { rel: "packages/docs", name: "@trellis/docs" },
    ]);

    await init({ yes: true });

    const configPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("packages:");
    expect(configContent).toContain("cli:");
    expect(configContent).toContain("path: packages/cli");
    expect(configContent).toContain("docs:");
    expect(configContent).toContain("path: packages/docs");
    expect(configContent).toContain("default_package:");
  });

  it("#15 monorepo: bootstrap task references per-package spec paths", async () => {
    setupPnpmWorkspace(tmpDir, [
      { rel: "packages/core", name: "core" },
      { rel: "packages/ui", name: "ui" },
    ]);

    await init({ yes: true, user: "dev" });

    const taskDir = path.join(tmpDir, PATHS.TASKS, "00-bootstrap-guidelines");
    expect(fs.existsSync(taskDir)).toBe(true);

    const taskJson = JSON.parse(
      fs.readFileSync(path.join(taskDir, "task.json"), "utf-8"),
    );

    // task.json.subtasks is canonical string[] (child task dir names);
    // per-package checklist items now live in prd.md as markdown checkboxes.
    expect(Array.isArray(taskJson.subtasks)).toBe(true);
    expect(taskJson.subtasks).toEqual([]);

    // Canonical shape: legacy current_phase / next_action must NOT appear
    expect(taskJson.current_phase).toBeUndefined();
    expect(taskJson.next_action).toBeUndefined();

    // relatedFiles point to spec/<name>/
    expect(taskJson.relatedFiles).toContain(".trellis/spec/core/");
    expect(taskJson.relatedFiles).toContain(".trellis/spec/ui/");

    // prd.md mentions packages + renders per-package checklist items
    const prd = fs.readFileSync(path.join(taskDir, "prd.md"), "utf-8");
    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";
    expect(prd).toContain("core");
    expect(prd).toContain("ui");
    expect(prd).toContain("spec/");
    expect(prd).toContain("- [ ] Fill guidelines for core");
    expect(prd).toContain("- [ ] Fill guidelines for ui");
    expect(prd).toContain(
      `${expectedPythonCmd} ./.trellis/scripts/task.py finish`,
    );
    expect(prd).toContain(
      `${expectedPythonCmd} ./.trellis/scripts/task.py archive 00-bootstrap-guidelines`,
    );
  });

  it("#16 --no-monorepo skips detection even with workspace config", async () => {
    setupPnpmWorkspace(tmpDir, [{ rel: "packages/a", name: "a" }]);

    await init({ yes: true, monorepo: false });

    const specDir = path.join(tmpDir, PATHS.SPEC);
    // Single-repo spec (global backend + frontend), no per-package dirs
    expect(fs.existsSync(path.join(specDir, "backend", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(specDir, "frontend", "index.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(specDir, "a"))).toBe(false);

    // config.yaml should NOT have packages: section
    const configContent = fs.readFileSync(
      path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml"),
      "utf-8",
    );
    expect(configContent).not.toMatch(/^packages\s*:/m);
  });

  it("#17 --monorepo without workspace config exits with error", async () => {
    // Empty directory — no workspace configs
    const logSpy = vi.mocked(console.log);

    await init({ yes: true, monorepo: true });

    // Should log error about missing multi-package layout
    const errorCall = logSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === "string" &&
        msg.includes("no multi-package layout detected"),
    );
    expect(errorCall).toBeDefined();

    // Should also print the manual config.yaml example as guidance
    const guideCall = logSpy.mock.calls.find(
      ([msg]) => typeof msg === "string" && msg.includes("git: true"),
    );
    expect(guideCall).toBeDefined();

    // Should NOT create .trellis/ (early return)
    expect(fs.existsSync(path.join(tmpDir, DIR_NAMES.WORKFLOW))).toBe(false);
  });

  it("#20 -y --registry aborts on probe failure instead of direct download fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await init({
      yes: true,
      registry: "bitbucket:myorg/registry/spec",
    });

    const logOutput = vi
      .mocked(console.log)
      .mock.calls.flat()
      .filter((part): part is string => typeof part === "string")
      .join("\n");

    expect(logOutput).toContain("Error: Could not reach registry index");
    expect(fs.existsSync(path.join(tmpDir, DIR_NAMES.WORKFLOW))).toBe(false);
  });

  it("#19 polyrepo: writes git: true for sibling .git packages", async () => {
    // Two sibling .git directories — polyrepo fallback should pick them up
    fs.mkdirSync(path.join(tmpDir, "frontend", ".git"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "backend", ".git"), { recursive: true });

    await init({ yes: true });

    const configPath = path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    // Slice off only the auto-generated section so commented-out template
    // examples (which legitimately mention `type: submodule`) do not pollute
    // the assertion.
    const generatedIdx = configContent.indexOf(
      "# Auto-detected monorepo packages",
    );
    expect(generatedIdx).toBeGreaterThanOrEqual(0);
    const generated = configContent.slice(generatedIdx);

    expect(generated).toContain("packages:");
    expect(generated).toContain("frontend:");
    expect(generated).toContain("backend:");
    expect(generated).toContain("path: frontend");
    expect(generated).toContain("path: backend");
    // Polyrepo packages should be marked git: true, NOT type: submodule
    expect(generated).toContain("git: true");
    expect(generated).not.toContain("type: submodule");
  });

  it("#18 monorepo: re-init does not duplicate packages in config.yaml", async () => {
    setupPnpmWorkspace(tmpDir, [{ rel: "packages/lib", name: "lib" }]);

    await init({ yes: true, force: true });
    await init({ yes: true, force: true });

    const configContent = fs.readFileSync(
      path.join(tmpDir, DIR_NAMES.WORKFLOW, "config.yaml"),
      "utf-8",
    );
    // packages: should appear exactly once
    const matches = configContent.match(/^packages\s*:/gm);
    expect(matches).toHaveLength(1);
  });
});
