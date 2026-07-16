import { describe, expect, it } from "vitest";
import { getAllAgents } from "../../src/templates/grok/index.js";
import { applyPullBasedPreludeMarkdown } from "../../src/configurators/shared.js";
import { collectGrokTemplates } from "../../src/configurators/grok.js";

const EXPECTED_AGENT_NAMES = [
  "trellis-check",
  "trellis-implement",
  "trellis-research",
];

describe("grok getAllAgents", () => {
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
      // Grok agents document spawn_subagent dispatch (not Claude Task tools)
      expect(content).toContain("spawn_subagent");
    }
  });
});

describe("grok pull-based prelude injection", () => {
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

describe("grok collectGrokTemplates", () => {
  it("writes flat trellis-*.md commands and agents under .grok/", () => {
    const files = collectGrokTemplates();
    expect(files.has(".grok/commands/trellis-start.md")).toBe(true);
    expect(files.has(".grok/commands/trellis-continue.md")).toBe(true);
    expect(files.has(".grok/commands/trellis-finish-work.md")).toBe(true);
    // Nested ZCode-style layout must not be used
    expect(files.has(".grok/commands/trellis/start.md")).toBe(false);

    expect(files.has(".grok/agents/trellis-implement.md")).toBe(true);
    expect(files.has(".grok/agents/trellis-check.md")).toBe(true);
    expect(files.has(".grok/agents/trellis-research.md")).toBe(true);

    const implement = files.get(".grok/agents/trellis-implement.md");
    expect(implement).toContain("Load Trellis Context First");
    const research = files.get(".grok/agents/trellis-research.md");
    expect(research).not.toContain("Load Trellis Context First");

    // No shared .agents/skills/ dual-write
    expect(
      [...files.keys()].some((key) => key.startsWith(".agents/skills/")),
    ).toBe(false);
  });

  it("includes private skills under .grok/skills/", () => {
    const files = collectGrokTemplates();
    expect(files.has(".grok/skills/trellis-check/SKILL.md")).toBe(true);
    expect(files.has(".grok/skills/trellis-before-dev/SKILL.md")).toBe(true);
  });
});
