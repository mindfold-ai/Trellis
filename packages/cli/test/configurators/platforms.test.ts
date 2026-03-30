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
  getAllSkills,
  getConfigTemplate as getCodexConfigTemplate,
  getHooksConfig as getCodexHooksConfig,
} from "../../src/templates/codex/index.js";
import { getAllWorkflows as getAllAntigravityWorkflows } from "../../src/templates/antigravity/index.js";
import { getAllWorkflows as getAllWindsurfWorkflows } from "../../src/templates/windsurf/index.js";
import { getAllSkills as getAllKiroSkills } from "../../src/templates/kiro/index.js";
import { getAllCommands as getAllGeminiCommands } from "../../src/templates/gemini/index.js";
import { getAllSkills as getAllQoderSkills } from "../../src/templates/qoder/index.js";
import { getAllCommands as getAllCodebuddyCommands } from "../../src/templates/codebuddy/index.js";
import { resolvePlaceholders } from "../../src/configurators/shared.js";

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

  it("detects .iflow directory as iflow", () => {
    fs.mkdirSync(path.join(tmpDir, ".iflow"));
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("iflow")).toBe(true);
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

  it("configurePlatform('iflow') creates .iflow directory", async () => {
    await configurePlatform("iflow", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".iflow"))).toBe(true);
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

  it("configurePlatform('codex') writes all skill templates", async () => {
    await configurePlatform("codex", tmpDir);

    const expectedSkills = getAllSkills();
    const expectedNames = expectedSkills.map((skill) => skill.name).sort();

    const skillsRoot = path.join(tmpDir, ".agents", "skills");
    const actualNames = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualNames).toEqual(expectedNames);

    for (const skill of expectedSkills) {
      const skillPath = path.join(skillsRoot, skill.name, "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);
      expect(fs.readFileSync(skillPath, "utf-8")).toBe(skill.content);
    }
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
      expect(fs.readFileSync(agentPath, "utf-8")).toBe(agent.content);
    }

    const config = getCodexConfigTemplate();
    const configPath = path.join(tmpDir, ".codex", config.targetPath);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, "utf-8")).toBe(config.content);
  });

  it("configurePlatform('codex') resolves PYTHON_CMD in hooks.json", async () => {
    await configurePlatform("codex", tmpDir);

    const hooksPath = path.join(tmpDir, ".codex", "hooks.json");
    expect(fs.existsSync(hooksPath)).toBe(true);
    const content = fs.readFileSync(hooksPath, "utf-8");
    const expectedPythonCmd = process.platform === "win32" ? "python" : "python3";
    expect(content).toContain(`"command": "${expectedPythonCmd} .codex/hooks/session-start.py"`);
    expect(content).not.toContain("{{PYTHON_CMD}}");
  });

  it("configurePlatform('kiro') creates .kiro/skills directory", async () => {
    await configurePlatform("kiro", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".kiro", "skills"))).toBe(true);
  });

  it("configurePlatform('kiro') writes all skill templates", async () => {
    await configurePlatform("kiro", tmpDir);

    const expectedSkills = getAllKiroSkills();
    const expectedNames = expectedSkills.map((skill) => skill.name).sort();

    const skillsRoot = path.join(tmpDir, ".kiro", "skills");
    const actualNames = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualNames).toEqual(expectedNames);

    for (const skill of expectedSkills) {
      const skillPath = path.join(skillsRoot, skill.name, "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);
      expect(fs.readFileSync(skillPath, "utf-8")).toBe(skill.content);
    }
  });

  it("configurePlatform('gemini') creates .gemini directory", async () => {
    await configurePlatform("gemini", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(true);
  });

  it("configurePlatform('gemini') writes all command templates as .toml", async () => {
    await configurePlatform("gemini", tmpDir);

    const expectedCommands = getAllGeminiCommands();
    const expectedNames = expectedCommands.map((cmd) => cmd.name).sort();

    const commandsDir = path.join(tmpDir, ".gemini", "commands", "trellis");
    expect(fs.existsSync(commandsDir)).toBe(true);

    const actualFiles = fs.readdirSync(commandsDir).sort();
    const actualNames = actualFiles.map((f) => f.replace(".toml", "")).sort();

    expect(actualNames).toEqual(expectedNames);

    for (const cmd of expectedCommands) {
      const filePath = path.join(commandsDir, `${cmd.name}.toml`);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf-8")).toBe(cmd.content);
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
    expect(fs.existsSync(path.join(tmpDir, ".agent", "workflows"))).toBe(
      true,
    );
  });

  it("configurePlatform('antigravity') writes all workflow templates", async () => {
    await configurePlatform("antigravity", tmpDir);

    const expectedWorkflows = getAllAntigravityWorkflows();
    const expectedNames = expectedWorkflows
      .map((workflow) => workflow.name)
      .sort();

    const workflowsRoot = path.join(tmpDir, ".agent", "workflows");
    const actualNames = fs
      .readdirSync(workflowsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.replace(/\.md$/, ""))
      .sort();

    expect(actualNames).toEqual(expectedNames);

    for (const workflow of expectedWorkflows) {
      const workflowPath = path.join(workflowsRoot, `${workflow.name}.md`);
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(fs.readFileSync(workflowPath, "utf-8")).toBe(workflow.content);
    }
  });

  it("configurePlatform('windsurf') creates .windsurf/workflows directory", async () => {
    await configurePlatform("windsurf", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf", "workflows"))).toBe(
      true,
    );
  });

  it("configurePlatform('windsurf') writes all workflow templates", async () => {
    await configurePlatform("windsurf", tmpDir);

    const expectedWorkflows = getAllWindsurfWorkflows();
    const expectedNames = expectedWorkflows.map((workflow) => workflow.name).sort();

    const workflowsRoot = path.join(tmpDir, ".windsurf", "workflows");
    const actualNames = fs
      .readdirSync(workflowsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.replace(/\.md$/, ""))
      .sort();

    expect(actualNames).toEqual(expectedNames);

    for (const workflow of expectedWorkflows) {
      const workflowPath = path.join(workflowsRoot, `${workflow.name}.md`);
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(fs.readFileSync(workflowPath, "utf-8")).toBe(workflow.content);
    }
  });

  it("configurePlatform('qoder') creates .qoder directory", async () => {
    await configurePlatform("qoder", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(true);
  });

  it("configurePlatform('qoder') writes all skill templates", async () => {
    await configurePlatform("qoder", tmpDir);

    const expectedSkills = getAllQoderSkills();
    const expectedNames = expectedSkills.map((s) => s.name).sort();

    const skillsDir = path.join(tmpDir, ".qoder", "skills");
    expect(fs.existsSync(skillsDir)).toBe(true);

    const actualDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    expect(actualDirs).toEqual(expectedNames);

    for (const skill of expectedSkills) {
      const filePath = path.join(skillsDir, skill.name, "SKILL.md");
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf-8")).toBe(skill.content);
    }
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

  it("configurePlatform('codebuddy') writes all command templates in trellis/ subdirectory", async () => {
    await configurePlatform("codebuddy", tmpDir);

    const expectedCommands = getAllCodebuddyCommands();
    const expectedNames = expectedCommands.map((c) => c.name).sort();

    const commandsDir = path.join(tmpDir, ".codebuddy", "commands", "trellis");
    expect(fs.existsSync(commandsDir)).toBe(true);

    const actualFiles = fs
      .readdirSync(commandsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""))
      .sort();

    expect(actualFiles).toEqual(expectedNames);

    for (const cmd of expectedCommands) {
      const content = fs.readFileSync(
        path.join(commandsDir, `${cmd.name}.md`),
        "utf-8",
      );
      expect(content.length).toBeGreaterThan(0);
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
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("cursor configuration includes commands directory", async () => {
    await configurePlatform("cursor", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "commands"))).toBe(true);
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
    expect(rawTemplate).toContain("{{PYTHON_CMD}} .codex/hooks/session-start.py");
  });
});
