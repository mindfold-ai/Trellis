import { describe, expect, it } from "vitest";
import { getAllSkills } from "../../src/templates/trae/index.js";

const EXPECTED_SKILL_NAMES = [
  "before-backend-dev",
  "before-frontend-dev",
  "brainstorm",
  "break-loop",
  "check-backend",
  "check-cross-layer",
  "check-frontend",
  "create-command",
  "finish-work",
  "integrate-skill",
  "onboard",
  "record-session",
  "start",
  "update-spec",
];

describe("trae getAllSkills", () => {
  it("returns the expected skill set (without parallel)", () => {
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

  it("skill content uses .trae/skills/ paths instead of other platform paths", () => {
    const skills = getAllSkills();
    for (const skill of skills) {
      expect(skill.content).not.toContain(".agents/skills/");
      expect(skill.content).not.toContain(".kiro/skills/");
    }
  });
});
