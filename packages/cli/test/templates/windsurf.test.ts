import { describe, expect, it } from "vitest";
import { getAllWorkflows } from "../../src/templates/windsurf/index.js";

const EXPECTED_WORKFLOW_NAMES = [
  "trellis-before-dev",
  "trellis-brainstorm",
  "trellis-break-loop",
  "trellis-check",
  "trellis-check-cross-layer",
  "trellis-create-command",
  "trellis-finish-work",
  "trellis-integrate-skill",
  "trellis-onboard",
  "trellis-record-session",
  "trellis-start",
  "trellis-update-spec",
];

describe("windsurf getAllWorkflows", () => {
  it("returns the expected workflow set", () => {
    const workflows = getAllWorkflows();
    const names = workflows.map((workflow) => workflow.name).sort();
    expect(names).toEqual([...EXPECTED_WORKFLOW_NAMES].sort());
  });

  it("preserves workflow names from filenames", () => {
    const workflows = getAllWorkflows();
    expect(
      workflows.find((workflow) => workflow.name === "trellis-start"),
    ).toBeDefined();
  });

  it("each workflow has non-empty content", () => {
    const workflows = getAllWorkflows();
    for (const workflow of workflows) {
      expect(workflow.content.length).toBeGreaterThan(0);
    }
  });

  it("adds windsurf frontmatter descriptions to every workflow", () => {
    const workflows = getAllWorkflows();

    for (const workflow of workflows) {
      expect(workflow.content).toMatch(/^---\ndescription: .+\n---\n\n/);
    }
  });

  it("does not duplicate the description as the first body sentence", () => {
    const workflows = getAllWorkflows();
    const byName = new Map(workflows.map((workflow) => [workflow.name, workflow]));

    const countOccurrences = (content: string | undefined, text: string): number =>
      (content?.split(text).length ?? 1) - 1;

    expect(
      countOccurrences(
        byName.get("trellis-before-dev")?.content,
        "Read the relevant development guidelines before starting your task.",
      ),
    ).toBe(1);
    expect(
      countOccurrences(
        byName.get("trellis-check")?.content,
        "Check whether the code you just wrote follows the development guidelines.",
      ),
    ).toBe(1);
    expect(
      countOccurrences(
        byName.get("trellis-check")?.content,
        "Check if the code you just wrote follows the development guidelines.",
      ),
    ).toBe(0);
    expect(
      countOccurrences(
        byName.get("trellis-create-command")?.content,
        "Create a new Windsurf workflow in `.windsurf/workflows/trellis-<workflow-name>.md` based on user requirements.",
      ),
    ).toBe(1);
    expect(
      countOccurrences(
        byName.get("trellis-integrate-skill")?.content,
        "Adapt and integrate a reusable skill into your project's development guidelines",
      ),
    ).toBe(1);
    expect(
      countOccurrences(
        byName.get("trellis-start")?.content,
        "Initialize your AI development session and begin working on tasks.",
      ),
    ).toBe(1);
    expect(
      countOccurrences(
        byName.get("trellis-update-spec")?.content,
        "When you learn something valuable",
      ),
    ).toBe(1);
  });

  it("adapts skill paths and trigger names to windsurf workflows", () => {
    const workflows = getAllWorkflows();

    for (const workflow of workflows) {
      expect(workflow.content).not.toContain(".agents/skills/");
      expect(workflow.content).not.toContain("/trellis:");
    }

    const createCommand = workflows.find(
      (w) => w.name === "trellis-create-command",
    );
    expect(createCommand?.content).toContain("Windsurf workflow");
    expect(createCommand?.content).toContain(
      ".windsurf/workflows/trellis-<workflow-name>.md",
    );
    expect(createCommand?.content).toContain("/trellis-create-command");
    expect(createCommand?.content).toContain("/trellis-<workflow-name>");
    expect(createCommand?.content).not.toContain("$create-command");
    expect(createCommand?.content).not.toContain("open /skills and select it");

    const start = workflows.find((w) => w.name === "trellis-start");
    expect(start?.content).toContain("/trellis-start");
    expect(start?.content).toContain("/trellis-record-session");

  });

  it("keeps workflow-oriented docs free of Codex skill scaffolding", () => {
    const workflows = getAllWorkflows();

    const createCommand = workflows.find(
      (w) => w.name === "trellis-create-command",
    );
    expect(createCommand?.content).not.toContain("SKILL.md");
    expect(createCommand?.content).not.toContain("Skill name");
    expect(createCommand?.content).not.toContain("Determine skill type");
    expect(createCommand?.content).not.toContain("Generate Skill Content");
    expect(createCommand?.content).not.toContain("Based on command type");
    expect(createCommand?.content).not.toContain("# Command Title");
    expect(createCommand?.content).not.toContain("Command description");

    const start = workflows.find((w) => w.name === "trellis-start");
    expect(start?.content).not.toContain("brainstorm skill's Step 8");
    expect(start?.content).not.toContain("## Skills Reference");
    expect(start?.content).not.toContain("### User Skills");

    const onboard = workflows.find((w) => w.name === "trellis-onboard");
    expect(onboard?.content).not.toContain("what each skill does and WHY");
    expect(onboard?.content).not.toContain("$before-*-dev");
    expect(onboard?.content).not.toContain("/trellis-finish-work` skill");
    expect(onboard?.content).not.toContain("what each command does and WHY");
    expect(onboard?.content).not.toContain("What the command actually does");
    expect(onboard?.content).not.toContain("/trellis-start` command reads");

    const recordSession = workflows.find(
      (w) => w.name === "trellis-record-session",
    );
    expect(recordSession?.content).not.toContain("This skill should only be used");

    const updateSpec = workflows.find((w) => w.name === "trellis-update-spec");
    expect(updateSpec?.content).not.toContain("use this skill");

    const breakLoop = workflows.find((w) => w.name === "trellis-break-loop");
    expect(breakLoop?.content).not.toContain("use this skill");
  });
});
