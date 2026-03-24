import { describe, expect, it } from "vitest";
import {
  getAllAgents,
  getAllSkills,
  getConfigTemplate,
} from "../../src/templates/codex/index.js";

const EXPECTED_SKILL_NAMES = [
  "before-dev",
  "brainstorm",
  "break-loop",
  "check",
  "check-cross-layer",
  "create-command",
  "finish-work",
  "improve-ut",
  "integrate-skill",
  "onboard",
  "parallel",
  "record-session",
  "start",
  "update-spec",
];

const EXPECTED_AGENT_NAMES = [
  "trellis-implementer",
  "trellis-researcher",
  "trellis-reviewer",
];

describe("codex getAllSkills", () => {
  it("returns the expected skill set", () => {
    const skills = getAllSkills();
    const names = skills.map((skill) => skill.name);
    expect(names).toEqual(EXPECTED_SKILL_NAMES);
  });

  it("each skill has matching frontmatter name", () => {
    const skills = getAllSkills();
    for (const skill of skills) {
      expect(skill.content.length).toBeGreaterThan(0);
      expect(skill.content).toContain("description:");
      const nameMatch = skill.content.match(/^name:\s*(.+)$/m);
      expect(nameMatch?.[1]?.trim()).toBe(skill.name);
    }
  });

  it("does not include unsupported platform-specific syntax", () => {
    const skills = getAllSkills();
    for (const skill of skills) {
      expect(skill.content).not.toContain("/trellis:");
      expect(skill.content).not.toContain(".claude/");
      expect(skill.content).not.toContain(".cursor/");
      expect(skill.content).not.toContain("Task(");
      expect(skill.content).not.toContain("subagent_type");
      expect(skill.content).not.toContain('model: "opus"');
    }
  });
});

describe("codex getAllAgents", () => {
  it("returns the expected custom agent set", () => {
    const agents = getAllAgents();
    const names = agents.map((agent) => agent.name);
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });

  it("each agent has a description and sandbox section", () => {
    for (const agent of getAllAgents()) {
      expect(agent.content.length).toBeGreaterThan(0);
      expect(agent.content).toContain("description = ");
      expect(agent.content).toMatch(/\[sandbox_(read_only|workspace_write)\]/);
      expect(agent.content).toContain('prompt = """');
    }
  });
});

describe("codex getConfigTemplate", () => {
  it("returns project config.toml content", () => {
    const config = getConfigTemplate();
    expect(config.targetPath).toBe("config.toml");
    expect(config.content).toContain("project_doc_fallback_filenames");
    expect(config.content).toContain("AGENTS.md");
  });
});
