import { describe, expect, it } from "vitest";
import { getAllAgents } from "../../src/templates/zcode/index.js";
import { applyPullBasedPreludeMarkdown } from "../../src/configurators/shared.js";

const EXPECTED_AGENT_NAMES = [
  "trellis-check",
  "trellis-implement",
  "trellis-research",
];

describe("zcode getAllAgents", () => {
  it("returns the expected custom agent set", () => {
    const agents = getAllAgents();
    const names = agents.map((agent) => agent.name);
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });

  it("each agent is a Markdown file with YAML frontmatter", () => {
    for (const agent of getAllAgents()) {
      const content = agent.content.replace(/\r\n/g, "\n");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name: ");
      expect(content).toContain("description:");
      expect(content).toContain("color:");
    }
  });
});

describe("zcode pull-based prelude injection", () => {
  it("injects context-loading instructions only into implement/check", () => {
    const agents = applyPullBasedPreludeMarkdown(getAllAgents());
    for (const agent of agents) {
      if (
        agent.name === "trellis-implement" ||
        agent.name === "trellis-check"
      ) {
        expect(agent.content).toContain("Load Trellis Context First");
        expect(agent.content).toContain("task.py current --source");
      }
    }
  });

  it("does not inject the pull-based prelude into research", () => {
    const agents = applyPullBasedPreludeMarkdown(getAllAgents());
    const research = agents.find((agent) => agent.name === "trellis-research");
    expect(research).toBeDefined();
    if (!research) return;
    expect(research.content).not.toContain("Load Trellis Context First");
    expect(research.content).toContain("{TASK_DIR}/research/");
  });
});
