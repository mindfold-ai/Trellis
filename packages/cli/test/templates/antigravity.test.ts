import { describe, expect, it } from "vitest";
import { getAllWorkflows } from "../../src/templates/antigravity/index.js";

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

describe("antigravity getAllWorkflows", () => {
  it("returns the expected workflow set", () => {
    const workflows = getAllWorkflows();
    const names = workflows.map((workflow) => workflow.name);
    expect(names).toEqual(EXPECTED_SKILL_NAMES);
  });

  it("each workflow has non-empty content", () => {
    const workflows = getAllWorkflows();
    for (const workflow of workflows) {
      expect(workflow.content.length).toBeGreaterThan(0);
    }
  });

  it("adapts codex skill paths to antigravity workflow paths", () => {
    const workflows = getAllWorkflows();

    for (const workflow of workflows) {
      expect(workflow.content).not.toContain(".agents/skills/");
    }

    const createCommand = workflows.find((w) => w.name === "create-command");
    expect(createCommand?.content).toContain("Antigravity workflow");
    expect(createCommand?.content).toContain(
      ".agent/workflows/<workflow-name>.md",
    );
    expect(createCommand?.content).toContain("/create-command");
    expect(createCommand?.content).not.toContain("$create-command");
    expect(createCommand?.content).not.toContain("open /skills and select it");

    const integrateSkill = workflows.find((w) => w.name === "integrate-skill");
    expect(integrateSkill?.content).toContain(
      ".agent/workflows/<workflow-name>.md",
    );
  });
});
