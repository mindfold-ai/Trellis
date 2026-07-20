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
  settingsTemplate as claudeSettingsTemplate,
  getStatuslineHook,
} from "../../src/templates/claude/index.js";
import {
  resolvePlaceholders,
  resolveAllAsSkills,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  wrapWithCommandFrontmatter,
  replacePythonCommandLiterals,
} from "../../src/configurators/shared.js";

const BUNDLED_SKILL_NAMES = [
  "trellis-channel",
  "trellis-meta",
  "trellis-session-insight",
  "trellis-spec-bootstrap",
];
const BUNDLED_SKILL_NAME = "trellis-meta";
const BUNDLED_REFERENCE = path.join(
  BUNDLED_SKILL_NAME,
  "references",
  "local-architecture",
  "overview.md",
);
const SPEC_BOOTSTRAP_REFERENCE = path.join(
  "trellis-spec-bootstrap",
  "references",
  "spec-writing.md",
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

  it("detects .devin/workflows directory as devin", () => {
    fs.mkdirSync(path.join(tmpDir, ".devin", "workflows"), {
      recursive: true,
    });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("devin")).toBe(true);
  });

  it("detects legacy .windsurf/workflows directory as devin (back-compat)", () => {
    fs.mkdirSync(path.join(tmpDir, ".windsurf", "workflows"), {
      recursive: true,
    });
    const result = getConfiguredPlatforms(tmpDir);
    expect(result.has("devin")).toBe(true);
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

    // Codex writes shared skills under `.agents/skills/` using the neutral
    // placeholder resolver so the rendered files are byte-identical to
    // Gemini's writes for the same skill names — see issue #224 fix.
    // `trellis-start` is included via `resolveAllAsSkillsNeutral` directly —
    // it's the user-invocable fallback referenced by the <trellis-bootstrap>
    // notice in inject-workflow-state.py (the SessionStart hook was removed
    // for de-recursion).
    const expected = resolveAllAsSkillsNeutral(AI_TOOLS.codex.templateContext);
    const skillsRoot = path.join(tmpDir, ".agents", "skills");
    const actualNames = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualNames).toEqual(
      [...expected.map((s) => s.name), ...BUNDLED_SKILL_NAMES].sort(),
    );

    for (const skill of expected) {
      const skillPath = path.join(skillsRoot, skill.name, "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);
      expect(fs.readFileSync(skillPath, "utf-8")).toBe(skill.content);
    }
    expect(fs.existsSync(path.join(skillsRoot, BUNDLED_REFERENCE))).toBe(true);
    expect(
      fs.existsSync(path.join(skillsRoot, "trellis-start", "SKILL.md")),
    ).toBe(true);
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
      // Native SubagentStart injects context, while every profile retains a
      // marker-gated active-task pull fallback when the hook is unavailable.
      expect(written).toBe(replacePythonCommandLiterals(agent.content));
      expect(written).toContain("<!-- trellis-hook-injected -->");
      expect(written).toContain("Active task: <path>");
      expect(written).not.toContain("Required: Load Trellis Context First");
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
      `"command": "${expectedPythonCmd} -X utf8 .codex/hooks/inject-workflow-state.py"`,
    );
    expect(content).toContain(
      `"command": "${expectedPythonCmd} -X utf8 .codex/hooks/inject-subagent-context.py"`,
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
      [...expected.map((s) => s.name), ...BUNDLED_SKILL_NAMES].sort(),
    );

    for (const skill of expected) {
      const skillPath = path.join(skillsRoot, skill.name, "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);
      expect(fs.readFileSync(skillPath, "utf-8")).toBe(skill.content);
    }
    expect(fs.existsSync(path.join(skillsRoot, BUNDLED_REFERENCE))).toBe(true);
  });

  it("configurePlatform('kiro') writes main agent, IDE hook, and shared hooks", async () => {
    await configurePlatform("kiro", tmpDir);

    const expectedPythonCmd =
      process.platform === "win32" ? "python" : "python3";

    // Shared hooks now include per-turn + session-start, not just subagent.
    const hooksDir = path.join(tmpDir, ".kiro", "hooks");
    for (const script of [
      "inject-workflow-state.py",
      "session-start.py",
      "inject-subagent-context.py",
    ]) {
      expect(fs.existsSync(path.join(hooksDir, script))).toBe(true);
    }

    // Main `trellis` agent wires per-turn + session-start hooks; PYTHON_CMD
    // resolved.
    const trellisPath = path.join(tmpDir, ".kiro", "agents", "trellis.json");
    expect(fs.existsSync(trellisPath)).toBe(true);
    const trellisRaw = fs.readFileSync(trellisPath, "utf-8");
    expect(trellisRaw).not.toContain("{{PYTHON_CMD}}");
    const trellis = JSON.parse(trellisRaw) as {
      resources?: string[];
      hooks?: Record<string, { command: string }[]>;
    };
    expect(trellis.hooks?.userPromptSubmit?.[0].command).toBe(
      `${expectedPythonCmd} .kiro/hooks/inject-workflow-state.py`,
    );
    expect(trellis.hooks?.agentSpawn?.[0].command).toBe(
      `${expectedPythonCmd} .kiro/hooks/session-start.py`,
    );
    expect(trellis.resources).toContain("file://.trellis/workflow.md");

    // 3 sub-agents keep their inject-subagent-context.py spawn hook.
    for (const name of [
      "trellis-implement",
      "trellis-check",
      "trellis-research",
    ]) {
      const sub = JSON.parse(
        fs.readFileSync(
          path.join(tmpDir, ".kiro", "agents", `${name}.json`),
          "utf-8",
        ),
      ) as { hooks?: Record<string, { command: string }[]> };
      expect(sub.hooks?.agentSpawn?.[0].command).toBe(
        `${expectedPythonCmd} .kiro/hooks/inject-subagent-context.py`,
      );
    }

    // IDE `.kiro.hook` written with PYTHON_CMD resolved and valid schema.
    const ideHookPath = path.join(
      hooksDir,
      "trellis-workflow-state.kiro.hook",
    );
    expect(fs.existsSync(ideHookPath)).toBe(true);
    const ideRaw = fs.readFileSync(ideHookPath, "utf-8");
    expect(ideRaw).not.toContain("{{PYTHON_CMD}}");
    const ideHook = JSON.parse(ideRaw) as {
      when: { type: string };
      then: { type: string; command: string };
    };
    expect(ideHook.when.type).toBe("promptSubmit");
    expect(ideHook.then.type).toBe("runCommand");
    expect(ideHook.then.command).toBe(
      `${expectedPythonCmd} .kiro/hooks/inject-workflow-state.py`,
    );
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

    // Skills as SKILL.md under the shared `.agents/skills/` root (Gemini CLI
    // 0.40+ reads this directory as a workspace alias). The platform-private
    // `.gemini/skills/` directory must NOT exist — writing there causes the
    // duplicate-skill warnings reported in issue #224.
    expect(fs.existsSync(path.join(tmpDir, ".gemini", "skills"))).toBe(false);
    const skillsDir = path.join(tmpDir, ".agents", "skills");
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

  it("configurePlatform('devin') creates .devin/workflows directory", async () => {
    await configurePlatform("devin", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, ".devin", "workflows"))).toBe(true);
  });

  it("configurePlatform('devin') writes workflows + skills", async () => {
    await configurePlatform("devin", tmpDir);

    // Commands as workflows
    const workflowsRoot = path.join(tmpDir, ".devin", "workflows");
    expect(fs.existsSync(workflowsRoot)).toBe(true);
    const wfFiles = fs
      .readdirSync(workflowsRoot)
      .filter((f) => f.endsWith(".md"));
    expect(wfFiles.length).toBe(
      resolveCommands(AI_TOOLS.devin.templateContext).length,
    );

    // Skills
    const skillsDir = path.join(tmpDir, ".devin", "skills");
    expect(fs.existsSync(skillsDir)).toBe(true);
    const skillDirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    expect(skillDirs.length).toBe(
      resolveSkills(AI_TOOLS.devin.templateContext).length +
        resolveBundledSkills(AI_TOOLS.devin.templateContext).filter((file) =>
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
      [...expectedSkills.map((s) => s.name), ...BUNDLED_SKILL_NAMES].sort(),
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

  it("configurePlatform('grok') writes flat commands and .grok agents", async () => {
    await configurePlatform("grok", tmpDir);

    expect(
      fs.existsSync(path.join(tmpDir, ".grok", "commands", "trellis-start.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".grok", "commands", "trellis-continue.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".grok", "commands", "trellis", "start.md")),
    ).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(false);

    expect(
      fs.existsSync(
        path.join(tmpDir, ".grok", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".grok", "agents", "trellis-implement.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".grok", "agents", "trellis-check.md")),
    ).toBe(true);
    const researchAgentPath = path.join(
      tmpDir,
      ".grok",
      "agents",
      "trellis-research.md",
    );
    expect(fs.existsSync(researchAgentPath)).toBe(true);
    expect(fs.readFileSync(researchAgentPath, "utf-8")).not.toContain(
      "Load Trellis Context First",
    );
    expect(
      fs.readFileSync(
        path.join(tmpDir, ".grok", "agents", "trellis-implement.md"),
        "utf-8",
      ),
    ).toContain("Load Trellis Context First");

    const templates = collectPlatformTemplates("grok");
    expect(templates?.has(".grok/commands/trellis-start.md")).toBe(true);
    expect(templates?.has(".grok/commands/trellis/start.md")).toBe(false);
    expect(
      [...(templates?.keys() ?? [])].some((key) =>
        key.startsWith(".agents/skills/"),
      ),
    ).toBe(false);
    expect(templates?.has(".grok/agents/trellis-implement.md")).toBe(true);
    expect(templates?.has(".grok/agents/trellis-research.md")).toBe(true);
  });

  it("configurePlatform('zcode') writes only .zcode-owned skills", async () => {
    await configurePlatform("zcode", tmpDir);

    const expectedPrivateSkills = resolveSkills(AI_TOOLS.zcode.templateContext);
    const expectedCheck = expectedPrivateSkills.find(
      (skill) => skill.name === "trellis-check",
    );
    if (!expectedCheck) {
      throw new Error("Expected ZCode private skills to include trellis-check");
    }

    expect(
      fs.existsSync(
        path.join(tmpDir, ".zcode", "commands", "trellis", "start.md"),
      ),
    ).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "trellis-start", "SKILL.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "trellis-continue", "SKILL.md"),
      ),
    ).toBe(false);

    expect(
      fs.existsSync(
        path.join(tmpDir, ".zcode", "skills", "trellis-start", "SKILL.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".zcode", "skills", "trellis-continue", "SKILL.md"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".zcode",
          "skills",
          "trellis-finish-work",
          "SKILL.md",
        ),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".zcode", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(tmpDir, ".zcode", "skills", "trellis-check", "SKILL.md"),
        "utf-8",
      ),
    ).toBe(replacePythonCommandLiterals(expectedCheck.content));
    expect(
      fs.existsSync(
        path.join(tmpDir, ".zcode", "agents", "trellis-implement.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".zcode", "agents", "trellis-check.md")),
    ).toBe(true);
    const researchAgentPath = path.join(
      tmpDir,
      ".zcode",
      "agents",
      "trellis-research.md",
    );
    expect(fs.existsSync(researchAgentPath)).toBe(true);
    const implementAgent = fs.readFileSync(
      path.join(tmpDir, ".zcode", "agents", "trellis-implement.md"),
      "utf-8",
    );
    expect(implementAgent).toContain("Trellis Context Loading Protocol");
    expect(implementAgent).toContain("<!-- trellis-hook-injected -->");
    expect(implementAgent).not.toContain("Load Trellis Context First");
    expect(fs.readFileSync(researchAgentPath, "utf-8")).not.toContain(
      "Load Trellis Context First",
    );

    const generatedConfig = readConfiguredFile(tmpDir, ".zcode/config.json");
    expect(generatedConfig).toContain(
      "${ZCODE_PROJECT_DIR}/.zcode/hooks/session-start.py",
    );
    expect(generatedConfig).toContain(
      "${ZCODE_PROJECT_DIR}/.zcode/hooks/inject-workflow-state.py",
    );
    expect(generatedConfig).toContain(
      "${ZCODE_PROJECT_DIR}/.zcode/hooks/inject-subagent-context.py",
    );

    const templates = collectPlatformTemplates("zcode");
    expect(templates?.get(".zcode/config.json")).toBe(generatedConfig);
    expect(templates?.has(".zcode/commands/trellis/start.md")).toBe(false);
    expect(
      [...(templates?.keys() ?? [])].some((key) =>
        key.startsWith(".agents/skills/"),
      ),
    ).toBe(false);
    expect(templates?.has(".agents/skills/trellis-start/SKILL.md")).toBe(false);
    expect(templates?.has(".agents/skills/trellis-continue/SKILL.md")).toBe(
      false,
    );
    expect(templates?.has(".agents/skills/trellis-check/SKILL.md")).toBe(false);
    expect(templates?.has(".zcode/skills/trellis-start/SKILL.md")).toBe(false);
    expect(templates?.has(".zcode/skills/trellis-continue/SKILL.md")).toBe(
      false,
    );
    expect(templates?.has(".zcode/skills/trellis-finish-work/SKILL.md")).toBe(
      false,
    );
    expect(templates?.has(".zcode/skills/trellis-check/SKILL.md")).toBe(true);
    expect(templates?.has(".zcode/skills/trellis-meta/SKILL.md")).toBe(true);
    expect(templates?.has(".zcode/agents/trellis-implement.md")).toBe(true);
    expect(templates?.has(".zcode/agents/trellis-check.md")).toBe(true);
    expect(templates?.has(".zcode/agents/trellis-research.md")).toBe(true);
    expect(templates?.get(".zcode/agents/trellis-implement.md")).toContain(
      "Trellis Context Loading Protocol",
    );
    expect(templates?.get(".zcode/agents/trellis-implement.md")).not.toContain(
      "Load Trellis Context First",
    );
    expect(templates?.get(".zcode/agents/trellis-research.md")).not.toContain(
      "Load Trellis Context First",
    );
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

  it("claude-code default settings.json is byte-identical to the resolved template (statusline off)", async () => {
    await configurePlatform("claude-code", tmpDir, { withStatusline: false });
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(content).toBe(resolvePlaceholders(claudeSettingsTemplate));
    expect(content).not.toContain("statusLine");
  });

  it("claude-code with statusline opt-in installs statusline.py and statusLine settings entry", async () => {
    await configurePlatform("claude-code", tmpDir, { withStatusline: true });

    const hookPath = path.join(tmpDir, ".claude", "hooks", "statusline.py");
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(fs.readFileSync(hookPath, "utf-8")).toBe(
      replacePythonCommandLiterals(getStatuslineHook()),
    );

    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      "utf-8",
    );
    expect(content).not.toContain("{{PYTHON_CMD}}");
    const settings = JSON.parse(content) as Record<string, unknown>;
    expect(settings.statusLine).toEqual({
      type: "command",
      command: replacePythonCommandLiterals(
        "python3 .claude/hooks/statusline.py",
      ),
    });
    // statusLine is appended at the END — byte-parity with update's
    // preserveExistingClaudeStatusLine (parse → assign → stringify), so a
    // fresh opted-in project shows zero settings.json diff on update
    expect(Object.keys(settings)).toEqual([
      "env",
      "hooks",
      "enabledPlugins",
      "statusLine",
    ]);
    // Everything besides statusLine is unchanged from the default template
    const expected = JSON.parse(
      resolvePlaceholders(claudeSettingsTemplate),
    ) as Record<string, unknown>;
    expect(settings.env).toEqual(expected.env);
    expect(settings.hooks).toEqual(expected.hooks);
    expect(settings.enabledPlugins).toEqual(expected.enabledPlugins);
  });

  it("withStatusline option leaves all other platforms unaffected", async () => {
    for (const id of PLATFORM_IDS) {
      if (id === "claude-code") continue;
      await configurePlatform(id, tmpDir, { withStatusline: true });
    }

    const walk = (dir: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...walk(full));
        } else {
          files.push(full);
        }
      }
      return files;
    };

    for (const file of walk(tmpDir)) {
      expect(path.basename(file)).not.toBe("statusline.py");
      if (path.basename(file) === "settings.json") {
        expect(
          JSON.parse(fs.readFileSync(file, "utf-8")),
        ).not.toHaveProperty("statusLine");
      }
    }
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
    ).toBe(true);
    // Shared skills go to `.agents/skills/`, deduped with Codex/Gemini (#447) —
    // Pi no longer keeps a private `.pi/skills/` copy.
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "trellis-check", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".agents", "skills", BUNDLED_REFERENCE)),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", SPEC_BOOTSTRAP_REFERENCE),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".pi", "skills"))).toBe(false);
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
    expect(extension).toContain("registerTool?.({");
    expect(extension).toContain('name: "trellis_subagent"');
    expect(extension).toContain('pi.on?.("session_start"');
    expect(extension).toContain('pi.on?.("tool_call"');
    expect(extension).toContain("ctx?.sessionManager?.getSessionId");
    expect(extension).toContain("TRELLIS_PI_CLI_JS");
    expect(extension).toContain("function formatPiOutput");
    expect(extension).toContain('"## Trellis Agent Definition"');
    expect(extension).toContain("ctx?.ui?.notify?.(");
    expect(extension).toContain("systemPrompt:");
    expect(extension).toContain("isTrellisAgent(root, agentName)");
    expect(extension).not.toContain("message: buildTrellisContext");
    expect(extension).not.toContain('message:\n      "Trellis project context');
    expect(extension).not.toContain("persistent: true");
    expect(extension).not.toContain(
      '["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)]',
    );
    // Pi must not install or reference Python hook files under .pi/ (the
    // existence check on .pi/hooks above already covers installation; this
    // guards that the extension never references a hook by .pi-prefixed path).
    expect(extension).not.toContain(".pi/hooks");
    expect(extension).not.toContain("inject-workflow-state.py");
    expect(extension).not.toContain("inject-subagent-context.py");
    expect(extension).not.toContain("session-start.py");
    // get_context.py is allowed: it lives in .trellis/scripts/ and is the
    // shared session-overview script invoked by every platform's hook.

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".pi", "settings.json"), "utf-8"),
    ) as {
      skills?: string[];
      packages?: (
        | string
        | {
            source?: string;
            extensions?: unknown[];
            skills?: unknown[];
            prompts?: unknown[];
            themes?: unknown[];
          }
      )[];
    };
    // No private `.pi/skills/` root anymore — Pi discovers shared
    // `.agents/skills/` natively (#447).
    expect(settings.skills).toBeUndefined();
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
    expect(templates?.get(".pi/prompts/trellis-start.md")).toBeDefined();
    expect(templates?.get(".pi/prompts/trellis-finish-work.md")).toBeDefined();
    expect(templates?.get(".pi/prompts/trellis-continue.md")).toBeDefined();
    expect(
      templates?.get(".agents/skills/trellis-check/SKILL.md"),
    ).toBeDefined();
    expect(
      templates?.get(
        ".agents/skills/trellis-meta/references/local-architecture/overview.md",
      ),
    ).toBeDefined();
    expect(
      templates?.get(
        ".agents/skills/trellis-spec-bootstrap/references/spec-writing.md",
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
      "{{PYTHON_CMD}} -X utf8 .codex/hooks/inject-workflow-state.py",
    );
    expect(rawTemplate).toContain(
      "{{PYTHON_CMD}} -X utf8 .codex/hooks/inject-subagent-context.py",
    );
    expect(rawTemplate).toContain(
      '"matcher": "^(?:trellis-implement|trellis-check|trellis-research)$"',
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
