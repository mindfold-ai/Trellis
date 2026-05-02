import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getConfiguredPlatforms,
  configurePlatform,
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import { AI_TOOLS } from "../../src/types/ai-tools.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import {
  getAllAgents as getAllCodexAgents,
  getConfigTemplate as getCodexConfigTemplate,
  getHooksConfig as getCodexHooksConfig,
} from "../../src/templates/codex/index.js";
import {
  getAllHooks as getAllCopilotHooks,
  getHooksConfig as getCopilotHooksConfig,
} from "../../src/templates/copilot/index.js";
import { getHooksConfig as getCursorHooksConfig } from "../../src/templates/cursor/index.js";
import {
  getAllAgents as getPiAgents,
  getExtensionTemplate as getPiExtensionTemplate,
  getSettingsTemplate as getPiSettings,
} from "../../src/templates/pi/index.js";
import {
  resolvePlaceholders,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  wrapWithCommandFrontmatter,
  replacePythonCommandLiterals,
} from "../../src/configurators/shared.js";

const BUNDLED_SKILL_NAME = "trellis-meta";
const BUNDLED_REFERENCE = path.join(
  BUNDLED_SKILL_NAME,
  "references",
  "local-architecture",
  "overview.md",
);

function readConfiguredFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf-8");
}

// =============================================================================
// getConfiguredPlatforms — detects existing platform directories
// =============================================================================

describe("getConfiguredPlatforms", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-platforms-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty set when no platform dirs exist", () => {
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(0);
  });

  it("detects .claude directory as claude-code", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("claude-code")).toBe(true);
  });

  it("detects .cursor directory as cursor", () => {
    fs.mkdirSync(path.join(tmpDir, ".cursor"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("cursor")).toBe(true);
  });

  it("detects .opencode directory as opencode", () => {
    fs.mkdirSync(path.join(tmpDir, ".opencode"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("opencode")).toBe(true);
  });

  it("detects .codex directory as codex", () => {
    fs.mkdirSync(path.join(tmpDir, ".codex"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("codex")).toBe(true);
  });

  it(".agents/skills alone does NOT detect as codex (shared standard)", () => {
    fs.mkdirSync(path.join(tmpDir, ".agents", "skills"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("codex")).toBe(false);
  });

  it("detects .agent/workflows directory as antigravity", () => {
    fs.mkdirSync(path.join(tmpDir, ".agent", "workflows"), {
      recursive: true,
    });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("antigravity")).toBe(true);
  });

  it("detects .windsurf/workflows directory as windsurf", () => {
    fs.mkdirSync(path.join(tmpDir, ".windsurf", "workflows"), {
      recursive: true,
    });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("windsurf")).toBe(true);
  });

  it("detects .kiro/skills directory as kiro", () => {
    fs.mkdirSync(path.join(tmpDir, ".kiro", "skills"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("kiro")).toBe(true);
  });

  it("detects .gemini directory as gemini", () => {
    fs.mkdirSync(path.join(tmpDir, ".gemini"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("gemini")).toBe(true);
  });

  it("detects .qoder directory as qoder", () => {
    fs.mkdirSync(path.join(tmpDir, ".qoder"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("qoder")).toBe(true);
  });

  it("detects .codebuddy directory as codebuddy", () => {
    fs.mkdirSync(path.join(tmpDir, ".codebuddy"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("codebuddy")).toBe(true);
  });

  it("detects .github/copilot directory as copilot", () => {
    fs.mkdirSync(path.join(tmpDir, ".github", "copilot"), { recursive: true });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("copilot")).toBe(true);
  });

  it("detects .factory directory as droid", () => {
    fs.mkdirSync(path.join(tmpDir, ".factory"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("droid")).toBe(true);
  });

  it("detects .pi directory as pi", () => {
    fs.mkdirSync(path.join(tmpDir, ".pi"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("pi")).toBe(true);
  });

  it("detects multiple platforms simultaneously", () => {
    for (const id of PLATFORM_IDS) {
      fs.mkdirSync(path.join(tmpDir, AI_TOOLS[id].configDir), {
        recursive: true,
      });
    }
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(PLATFORM_IDS.length);
    for (const id of PLATFORM_IDS) {
      expect(result.has(id)).toBe(true);
    }
  });

  it("ignores unrelated directories", () => {
    fs.mkdirSync(path.join(tmpDir, ".vscode"));
    fs.mkdirSync(path.join(tmpDir, ".git"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.size).toBe(0);
  });
});

// =============================================================================
// configurePlatform — copies templates to target directory
// =============================================================================

describe("configurePlatform", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-configure-"));
    // Use force mode to avoid interactive prompts
    setWriteMode("force");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setWriteMode("ask");
  });

  it("configurePlatform('claude-code') creates .claude directory", async () => {
    await configurePlatform("claude-code", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
  });

  it("configurePlatform('cursor') creates .cursor directory", async () => {
    await configurePlatform("cursor", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(true);
  });

  it("configurePlatform('opencode') creates .opencode directory", async () => {
    await configurePlatform("opencode", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".opencode"))).toBe(true);
  });

  it("configurePlatform('codex') creates .agents/skills directory", async () => {
    await configurePlatform("codex", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(true);
  });

  it("configurePlatform writes collected templates byte-for-byte for every platform", async () => {
    for (const id of PLATFORM_IDS) {
      const platformDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `trellis-parity-${id}-`),
      );
      try {
        await configurePlatform(id, platformDir);
        const templates = collectPlatformTemplates(id);
        expect(
          templates,
          `${id} should expose template tracking`,
        ).toBeInstanceOf(Map);
        if (!templates) {
          throw new Error(`${id} did not expose template tracking`);
        }

        for (const [relativePath, expectedContent] of templates) {
          const targetPath = path.join(platformDir, ...relativePath.split("/"));
          expect(
            fs.existsSync(targetPath),
            `${id} should write ${relativePath}`,
          ).toBe(true);
          expect(readConfiguredFile(platformDir, relativePath)).toBe(
            expectedContent,
          );
        }
      } finally {
        fs.rmSync(platformDir, { recursive: true, force: true });
      }
    }
  });

  it("configurePlatform('codex') writes shared skill templates from common source", async () => {
    await configurePlatform("codex", tmpDir);

    const expected = resolveAllAsSkills(AI_TOOLS.codex.templateContext);
    const skillsRoot = path.join(tmpDir, ".agents", "skills");
    const actualNames = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualNames).toEqual(
      [...expected.map((s) => s.name), BUNDLED_SKILL_NAME].sort(),
    );

    for (const skill of expected) {
      const skillPath = path.join(skillsRoot, skill.name, "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);
      expect(fs.readFileSync(skillPath, "utf-8")).toBe(skill.content);
    }
    expect(fs.existsSync(path.join(skillsRoot, BUNDLED_REFERENCE))).toBe(true);
  });

  it("configurePlatform('codex') writes custom agents and config", async () => {
    await configurePlatform("codex", tmpDir);

    const expectedAgents = getAllCodexAgents();
    const codexAgentsRoot = path.join(tmpDir, ".codex", "agents");
    const actualAgentNames = fs
      .readdirSync(codexAgentsRoot)
      .map((file) => file.replace(".toml", ""))
      .sort();

    expect(actualAgentNames).toEqual(
      expectedAgents.map((agent) => agent.name).sort(),
    );

    for (const agent of expectedAgents) {
      const agentPath = path.join(codexAgentsRoot, `${agent.name}.toml`);
      expect(fs.existsSync(agentPath)).toBe(true);
      const written = fs.readFileSync(agentPath, "utf-8");
      // Codex is a class-2 (pull-based) platform. Prelude is injected into
      // implement/check only — research is orthogonal (searches spec tree,
      // no task dependency) and must stay pristine.
      const needsPrelude = ["trellis-implement", "trellis-check"].includes(
        agent.name,
      );
      if (needsPrelude) {
        expect(written).toContain("Required: Load Trellis Context First");
        expect(written).toContain("task.py current --source");
        // Original body must still be present (prepend, not replace)
        const originalBody = agent.content
          .split("developer_instructions")[1]
          ?.split('"""')[1]
          ?.trim()
          .split("\n")[0];
        if (originalBody) {
          expect(written).toContain(originalBody);
        }
      } else {
        expect(written).toBe(replacePythonCommandLiterals(agent.content));
      }
    }

    const config = getCodexConfigTemplate();
    const configPath = path.join(tmpDir, ".codex", config.targetPath);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, "utf-8")).toBe(
      replacePythonCommandLiterals(config.content),
    );
  });

  it("configurePlatform('codex') resolves PYTHON_CMD in hooks.json", async () => {
    await configurePlatform("codex", tmpDir);

    const hooksPath = path.join(tmpDir, ".codex", "hooks.json");
    expect(fs.existsSync(hooksPath)).toBe(true);
    const content = fs.readFileSync(hooksPath, "utf-8");
    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";
    expect(content).toContain(
      `"command": "${expectedPythonCmd} .codex/hooks/session-start.py"`,
    );
    expect(content).not.toContain("{{PYTHON_CMD}}");
  });

  it("configurePlatform('kiro') creates .kiro/skills directory", async () => {
    await configurePlatform("kiro", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".kiro", "skills"))).toBe(true);
  });

  it("configurePlatform('kiro') writes all skill templates from common source", async () => {
    await configurePlatform("kiro", tmpDir);

    const expected = resolveAllAsSkills(AI_TOOLS.kiro.templateContext);
    const skillsRoot = path.join(tmpDir, ".kiro", "skills");
    const actualNames = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualNames).toEqual(
      [...expected.map((s) => s.name), BUNDLED_SKILL_NAME].sort(),
    );

    for (const skill of expected) {
      const skillPath = path.join(skillsRoot, skill.name, "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);
      expect(fs.readFileSync(skillPath, "utf-8")).toBe(skill.content);
    }
    expect(fs.existsSync(path.join(skillsRoot, BUNDLED_REFERENCE))).toBe(true);
  });

  it("configurePlatform('gemini') creates .gemini directory", async () => {
    await configurePlatform("gemini", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(true);
  });

  it("configurePlatform('gemini') writes TOML commands + SKILL.md skills", async () => {
    await configurePlatform("gemini", tmpDir);

    // Commands as TOML
    const commandsDir = path.join(tmpDir, ".gemini", "commands", "trellis");
    expect(fs.existsSync(commandsDir)).toBe(true);
    const tomlFiles = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".toml"));
    expect(tomlFiles.length).toBe(
      resolveCommands(AI_TOOLS.gemini.templateContext).length,
    );

    // Skills as SKILL.md
    const skillsDir = path.join(tmpDir, ".gemini", "skills");
    expect(fs.existsSync(skillsDir)).toBe(true);
    const skillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    expect(skillDirs.length).toBe(
      resolveSkills(AI_TOOLS.gemini.templateContext).length +
        resolveBundledSkills(AI_TOOLS.gemini.templateContext).filter((file) =>
          file.relativePath.endsWith("/SKILL.md"),
        ).length,
    );
    for (const dir of skillDirs) {
      expect(dir.name.startsWith("trellis-")).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, dir.name, "SKILL.md"))).toBe(
        true,
      );
    }
  });

  it("configurePlatform('gemini') does not include compiled artifacts", async () => {
    await configurePlatform("gemini", tmpDir);

    const walk = (dir: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else files.push(entry.name);
      }
      return files;
    };

    const allFiles = walk(path.join(tmpDir, ".gemini"));
    for (const file of allFiles) {
      expect(file).not.toMatch(/\.js$/);
      expect(file).not.toMatch(/\.d\.ts$/);
      expect(file).not.toMatch(/\.js\.map$/);
      expect(file).not.toMatch(/\.d\.ts\.map$/);
    }
  });

  it("configurePlatform('antigravity') creates .agent/workflows directory", async () => {
    await configurePlatform("antigravity", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".agent", "workflows"))).toBe(true);
  });

  it("configurePlatform('antigravity') writes all workflow templates from common source", async () => {
    await configurePlatform("antigravity", tmpDir);

    const expected = resolveCommands(AI_TOOLS.antigravity.templateContext);
    const workflowsRoot = path.join(tmpDir, ".agent", "workflows");
    const actualNames = fs
      .readdirSync(workflowsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.replace(/\.md$/, ""))
      .sort();

    expect(actualNames).toEqual(expected.map((c) => c.name).sort());

    for (const cmd of expected) {
      const workflowPath = path.join(workflowsRoot, `${cmd.name}.md`);
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(fs.readFileSync(workflowPath, "utf-8")).toBe(cmd.content);
    }
  });

  it("configurePlatform('windsurf') creates .windsurf/workflows directory", async () => {
    await configurePlatform("windsurf", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf", "workflows"))).toBe(
      true,
    );
  });

  it("configurePlatform('windsurf') writes workflows + skills", async () => {
    await configurePlatform("windsurf", tmpDir);

    // Commands as workflows
    const workflowsRoot = path.join(tmpDir, ".windsurf", "workflows");
    expect(fs.existsSync(workflowsRoot)).toBe(true);
    const wfFiles = fs
      .readdirSync(workflowsRoot)
      .filter((f) => f.endsWith(".md"));
    expect(wfFiles.length).toBe(
      resolveCommands(AI_TOOLS.windsurf.templateContext).length,
    );

    // Skills
    const skillsDir = path.join(tmpDir, ".windsurf", "skills");
    expect(fs.existsSync(skillsDir)).toBe(true);
    const skillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    expect(skillDirs.length).toBe(
      resolveSkills(AI_TOOLS.windsurf.templateContext).length +
        resolveBundledSkills(AI_TOOLS.windsurf.templateContext).filter((file) =>
          file.relativePath.endsWith("/SKILL.md"),
        ).length,
    );
  });

  it("configurePlatform('qoder') creates .qoder directory", async () => {
    await configurePlatform("qoder", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(true);
  });

  it("configurePlatform('qoder') writes commands + skills with the correct split", async () => {
    await configurePlatform("qoder", tmpDir);

    const ctx = AI_TOOLS.qoder.templateContext;
    const expectedCommands = resolveCommands(ctx);
    const expectedSkills = resolveSkills(ctx);

    const commandsDir = path.join(tmpDir, ".qoder", "commands");
    const actualCommandFiles = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    expect(actualCommandFiles).toEqual(
      expectedCommands.map((c) => `trellis-${c.name}.md`).sort(),
    );
    for (const cmd of expectedCommands) {
      const name = `trellis-${cmd.name}`;
      const filePath = path.join(commandsDir, `${name}.md`);
      const actual = fs.readFileSync(filePath, "utf-8");
      expect(actual).toBe(wrapWithCommandFrontmatter(name, cmd.content));
      expect(actual.startsWith(`---\nname: ${name}\ndescription: `)).toBe(true);
    }

    const skillsDir = path.join(tmpDir, ".qoder", "skills");
    const actualSkillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(actualSkillDirs).toEqual(
      [...expectedSkills.map((s) => s.name), BUNDLED_SKILL_NAME].sort(),
    );
    for (const skill of expectedSkills) {
      const filePath = path.join(skillsDir, skill.name, "SKILL.md");
      expect(fs.readFileSync(filePath, "utf-8")).toBe(skill.content);
    }
    expect(fs.existsSync(path.join(skillsDir, BUNDLED_REFERENCE))).toBe(true);

    expect(actualSkillDirs).not.toContain("trellis-finish-work");
    expect(actualSkillDirs).not.toContain("trellis-continue");
    expect(actualSkillDirs).not.toContain("trellis-start");
  });

  it("configurePlatform('qoder') does not include compiled artifacts", async () => {
    await configurePlatform("qoder", tmpDir);

    const walk = (dir: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else files.push(entry.name);
      }
      return files;
    };

    const allFiles = walk(path.join(tmpDir, ".qoder"));
    for (const file of allFiles) {
      expect(file).not.toMatch(/\.js$/);
      expect(file).not.toMatch(/\.d\.ts$/);
      expect(file).not.toMatch(/\.js\.map$/);
      expect(file).not.toMatch(/\.d\.ts\.map$/);
    }
  });

  it("configurePlatform('codebuddy') creates .codebuddy directory", async () => {
    await configurePlatform("codebuddy", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".codebuddy"))).toBe(true);
  });

  it("configurePlatform('codebuddy') writes all command templates from common source", async () => {
    await configurePlatform("codebuddy", tmpDir);

    const expected = resolveCommands(AI_TOOLS.codebuddy.templateContext);
    const commandsDir = path.join(tmpDir, ".codebuddy", "commands", "trellis");
    expect(fs.existsSync(commandsDir)).toBe(true);

    const actualFiles = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""))
      .sort();

    expect(actualFiles).toEqual(expected.map((c) => c.name).sort());

    for (const cmd of expected) {
      const content = fs.readFileSync(
        path.join(commandsDir, `${cmd.name}.md`),
        "utf-8",
      );
      expect(content).toBe(cmd.content);
    }
  });

  it("configurePlatform('codebuddy') does not include compiled artifacts", async () => {
    await configurePlatform("codebuddy", tmpDir);

    const walk = (dir: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else files.push(entry.name);
      }
      return files;
    };

    const allFiles = walk(path.join(tmpDir, ".codebuddy"));
    for (const file of allFiles) {
      expect(file).not.toMatch(/\.js$/);
      expect(file).not.toMatch(/\.d\.ts$/);
      expect(file).not.toMatch(/\.js\.map$/);
      expect(file).not.toMatch(/\.d\.ts\.map$/);
    }
  });

  it("configurePlatform('copilot') creates .github/copilot hooks", async () => {
    await configurePlatform("copilot", tmpDir);

    expect(fs.existsSync(path.join(tmpDir, ".github", "copilot"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".github", "copilot", "hooks")),
    ).toBe(true);

    const expectedHooks = getAllCopilotHooks();
    for (const hook of expectedHooks) {
      const hookPath = path.join(
        tmpDir,
        ".github",
        "copilot",
        "hooks",
        hook.name,
      );
      expect(fs.existsSync(hookPath)).toBe(true);
      expect(fs.readFileSync(hookPath, "utf-8")).toBe(
        replacePythonCommandLiterals(hook.content),
      );
    }
  });

  it("configurePlatform('copilot') writes prompts + skills", async () => {
    await configurePlatform("copilot", tmpDir);

    // Prompts (commands)
    const promptsDir = path.join(tmpDir, ".github", "prompts");
    expect(fs.existsSync(promptsDir)).toBe(true);
    const promptFiles = fs
      .readdirSync(promptsDir)
      .filter((f) => f.endsWith(".prompt.md"));
    expect(promptFiles.length).toBe(
      resolveCommands(AI_TOOLS.copilot.templateContext).length,
    );

    // Skills
    const skillsDir = path.join(tmpDir, ".github", "skills");
    expect(fs.existsSync(skillsDir)).toBe(true);
    const skillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    expect(skillDirs.length).toBe(
      resolveSkills(AI_TOOLS.copilot.templateContext).length +
        resolveBundledSkills(AI_TOOLS.copilot.templateContext).filter((file) =>
          file.relativePath.endsWith("/SKILL.md"),
        ).length,
    );
  });

  it("configurePlatform('copilot') writes both tracked and discovery hooks config", async () => {
    await configurePlatform("copilot", tmpDir);

    const expected = resolvePlaceholders(getCopilotHooksConfig());
    const tracked = path.join(tmpDir, ".github", "copilot", "hooks.json");
    const discovery = path.join(tmpDir, ".github", "hooks", "trellis.json");

    expect(fs.existsSync(tracked)).toBe(true);
    expect(fs.existsSync(discovery)).toBe(true);
    expect(fs.readFileSync(tracked, "utf-8")).toBe(expected);
    expect(fs.readFileSync(discovery, "utf-8")).toBe(expected);
  });

  it("claude-code configuration includes commands directory", async () => {
    await configurePlatform("claude-code", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".claude", "commands"))).toBe(true);
  });

  it("claude-code configuration includes settings.json", async () => {
    await configurePlatform("claude-code", tmpDir);
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);
    // Should be valid JSON
    const content = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    expect(settings).not.toHaveProperty("statusLine");
    expect(
      fs.existsSync(path.join(tmpDir, ".claude", "hooks", "statusline.py")),
    ).toBe(false);
  });

  it("cursor configuration includes commands directory", async () => {
    await configurePlatform("cursor", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "commands"))).toBe(true);
  });

  it("configurePlatform('droid') creates .factory/commands/trellis directory", async () => {
    await configurePlatform("droid", tmpDir);
    expect(
      fs.existsSync(path.join(tmpDir, ".factory", "commands", "trellis")),
    ).toBe(true);
  });

  it("droid configuration writes commands + skills", async () => {
    await configurePlatform("droid", tmpDir);
    // Commands (plain md, no frontmatter). Droid is agent-capable → no start.md.
    const startPath = path.join(
      tmpDir,
      ".factory",
      "commands",
      "trellis",
      "start.md",
    );
    expect(fs.existsSync(startPath)).toBe(false);
    const finishPath = path.join(
      tmpDir,
      ".factory",
      "commands",
      "trellis",
      "finish-work.md",
    );
    expect(fs.existsSync(finishPath)).toBe(true);
    const continuePath = path.join(
      tmpDir,
      ".factory",
      "commands",
      "trellis",
      "continue.md",
    );
    expect(fs.existsSync(continuePath)).toBe(true);
    // Skills (SKILL.md with frontmatter)
    const skillPath = path.join(
      tmpDir,
      ".factory",
      "skills",
      "trellis-check",
      "SKILL.md",
    );
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toContain("name: trellis-check");
  });

  it("configurePlatform('pi') creates extension-backed Pi assets", async () => {
    await configurePlatform("pi", tmpDir);

    expect(fs.existsSync(path.join(tmpDir, ".pi", "settings.json"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".pi", "prompts", "trellis-finish-work.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "prompts", "trellis-continue.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "prompts", "trellis-start.md")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".pi", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "skills", BUNDLED_REFERENCE)),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "agents", "trellis-implement.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "agents", "trellis-check.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".pi", "agents", "trellis-research.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".pi", "extensions", "trellis", "index.ts"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".pi", "hooks"))).toBe(false);

    const extension = fs.readFileSync(
      path.join(tmpDir, ".pi", "extensions", "trellis", "index.ts"),
      "utf-8",
    );
    expect(extension).toContain('registerTool?.({\n    name: "subagent"');
    expect(extension).toContain('pi.on?.("session_start"');
    expect(extension).toContain('pi.on?.("tool_call"');
    expect(extension).toContain("function injectTrellisContextIntoBash");
    expect(extension).toContain("ctx?.sessionManager?.getSessionId");
    expect(extension).toContain("TRELLIS_CONTEXT_ID: contextKey");
    expect(extension).toContain("function stripMarkdownFrontmatter");
    expect(extension).toContain("function parseAgentConfig");
    expect(extension).toContain("function resolveSubagentRunConfig");
    expect(extension).toContain("function buildPiModelArgs");
    expect(extension).toContain(
      'return thinking ? ["--thinking", thinking] : []',
    );
    expect(extension).toContain("function resolvePiInvocation");
    expect(extension).toContain("TRELLIS_PI_CLI_JS");
    expect(extension).toContain("...modelArgs");
    expect(extension).toContain("child.stdin?.end(prompt)");
    expect(extension).toContain("class BoundedBufferCollector");
    expect(extension).toContain("function extractFinalAssistantText");
    expect(extension).toContain("function formatPiOutput");
    expect(extension).toContain('"## Trellis Agent Definition"');
    expect(extension).toContain('content: [{ type: "text", text: output }]');
    expect(extension).toContain("ctx?.ui?.notify?.(");
    expect(extension).toContain("systemPrompt:");
    expect(extension).not.toContain("message: buildTrellisContext");
    expect(extension).not.toContain('message:\n      "Trellis project context');
    expect(extension).not.toContain("persistent: true");
    expect(extension).not.toContain(
      '["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)]',
    );
    expect(extension).not.toContain(".py");

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".pi", "settings.json"), "utf-8"),
    ) as { skills?: string[] };
    expect(settings.skills).toEqual(["./skills"]);
  });

  it("configurePlatform('pi') writes tracked templates exactly", async () => {
    await configurePlatform("pi", tmpDir);

    const settings = getPiSettings();
    expect(
      fs.readFileSync(path.join(tmpDir, ".pi", settings.targetPath), "utf-8"),
    ).toBe(resolvePlaceholders(settings.content));

    expect(
      fs.readFileSync(
        path.join(tmpDir, ".pi", "extensions", "trellis", "index.ts"),
        "utf-8",
      ),
    ).toBe(replacePythonCommandLiterals(getPiExtensionTemplate()));

    for (const agent of getPiAgents()) {
      const content = fs.readFileSync(
        path.join(tmpDir, ".pi", "agents", `${agent.name}.md`),
        "utf-8",
      );
      if (["trellis-implement", "trellis-check"].includes(agent.name)) {
        expect(content).toContain("Required: Load Trellis Context First");
      } else {
        expect(content).toBe(replacePythonCommandLiterals(agent.content));
      }
    }
  });

  it("collectPlatformTemplates('pi') maps prompts, skills, agents, extension, and settings", () => {
    const templates = collectPlatformTemplates("pi");
    expect(templates).toBeInstanceOf(Map);
    expect(templates?.get(".pi/prompts/trellis-start.md")).toBeUndefined();
    expect(templates?.get(".pi/prompts/trellis-finish-work.md")).toBeDefined();
    expect(templates?.get(".pi/prompts/trellis-continue.md")).toBeDefined();
    expect(templates?.get(".pi/skills/trellis-check/SKILL.md")).toBeDefined();
    expect(
      templates?.get(
        ".pi/skills/trellis-meta/references/local-architecture/overview.md",
      ),
    ).toBeDefined();
    expect(templates?.get(".pi/agents/trellis-implement.md")).toContain(
      "Required: Load Trellis Context First",
    );
    expect(templates?.get(".pi/extensions/trellis/index.ts")).toBe(
      replacePythonCommandLiterals(getPiExtensionTemplate()),
    );
    expect(templates?.get(".pi/settings.json")).toBe(
      resolvePlaceholders(getPiSettings().content),
    );
  });

  it("collectPlatformTemplates('droid') maps commands under .factory/commands/trellis/", () => {
    const templates = collectPlatformTemplates("droid");
    expect(templates).toBeInstanceOf(Map);
    // Droid is agent-capable → start.md not emitted.
    expect(
      templates?.get(".factory/commands/trellis/start.md"),
    ).toBeUndefined();
    expect(
      templates?.get(".factory/commands/trellis/finish-work.md"),
    ).toBeDefined();
    expect(
      templates?.get(".factory/commands/trellis/continue.md"),
    ).toBeDefined();
  });

  it("does not throw for any platform", async () => {
    for (const id of PLATFORM_IDS) {
      const platformDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `trellis-cfg-${id}-`),
      );
      try {
        setWriteMode("force");
        await expect(configurePlatform(id, platformDir)).resolves.not.toThrow();
      } finally {
        fs.rmSync(platformDir, { recursive: true, force: true });
      }
    }
  });

  it("collectPlatformTemplates('codex') resolves placeholders in hooks.json", () => {
    const templates = collectPlatformTemplates("codex");
    expect(templates).toBeInstanceOf(Map);
    expect(templates?.get(".codex/hooks.json")).toBe(
      resolvePlaceholders(getCodexHooksConfig()),
    );
  });

  it("codex hooks.json template keeps PYTHON_CMD placeholder", () => {
    const rawTemplate = getCodexHooksConfig();
    expect(rawTemplate).toContain(
      "{{PYTHON_CMD}} .codex/hooks/session-start.py",
    );
  });

  it("cursor hooks.json matches both documented and native subagent tool names", () => {
    const hooksConfig = JSON.parse(getCursorHooksConfig()) as {
      hooks: { preToolUse: { matcher: string }[] };
    };

    expect(hooksConfig.hooks.preToolUse[0].matcher).toBe("Task|Subagent");
  });

  it("collectPlatformTemplates('copilot') includes tracked + discovery hooks config", () => {
    const templates = collectPlatformTemplates("copilot");
    expect(templates).toBeInstanceOf(Map);
    // Copilot is agent-capable → start.prompt.md not emitted.
    expect(templates?.get(".github/prompts/start.prompt.md")).toBeUndefined();
    expect(
      templates?.get(".github/prompts/finish-work.prompt.md"),
    ).toBeDefined();
    expect(templates?.get(".github/prompts/continue.prompt.md")).toBeDefined();
    expect(templates?.get(".github/copilot/hooks.json")).toBe(
      resolvePlaceholders(getCopilotHooksConfig()),
    );
    expect(templates?.get(".github/hooks/trellis.json")).toBe(
      resolvePlaceholders(getCopilotHooksConfig()),
    );
  });

  it("copilot hooks.json template keeps PYTHON_CMD placeholder", () => {
    const rawTemplate = getCopilotHooksConfig();
    expect(rawTemplate).toContain(
      "{{PYTHON_CMD}} .github/copilot/hooks/session-start.py",
    );
  });
});
