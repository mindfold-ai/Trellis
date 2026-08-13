import { describe, expect, it } from "vitest";
import { getAllAgents } from "../../src/templates/dsh/index.js";
import { applyPullBasedPreludeMarkdown } from "../../src/configurators/shared.js";
import { collectDshTemplates } from "../../src/configurators/dsh.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";

const EXPECTED_AGENT_NAMES = [
  "trellis-check",
  "trellis-implement",
  "trellis-research",
];

describe("dsh getAllAgents", () => {
  it("returns the expected agent prompt set", () => {
    const agents = getAllAgents();
    const names = agents.map((agent) => agent.name);
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });

  it("each agent is a Markdown file with YAML frontmatter (dsh SKILL.md requires name + description)", () => {
    for (const agent of getAllAgents()) {
      const content = agent.content.replace(/\r\n/g, "\n");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name: ");
      expect(content).toContain("description:");
      // dsh agents document dispatch through the subagent tool
      expect(content).toContain("`subagent` tool");
    }
  });

  it("dispatches research through the subagent tool with research-only writes", () => {
    const research = getAllAgents().find(
      (agent) => agent.name === "trellis-research",
    );
    expect(research).toBeDefined();
    if (!research) return;

    expect(research.content).toContain("`subagent` tool");
    expect(research.content).toContain("may write only under");
    expect(research.content).toContain("Active task: <path");
  });
});

describe("dsh pull-based prelude injection", () => {
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

describe("dsh collectDshTemplates", () => {
  it("writes commands-as-skills and agent prompts under .dsh/skills/", () => {
    const files = collectDshTemplates();

    // User-invocable entry points (/trellis-<name>)
    expect(files.has(".dsh/skills/trellis-start/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-continue/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-finish-work/SKILL.md")).toBe(true);

    // Trellis agent prompts (dsh has no declarative custom sub-agent definitions)
    expect(files.has(".dsh/skills/trellis-implement/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-check/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-research/SKILL.md")).toBe(true);

    const implement = files.get(".dsh/skills/trellis-implement/SKILL.md");
    expect(implement).toContain("Load Trellis Context First");
    const research = files.get(".dsh/skills/trellis-research/SKILL.md");
    expect(research).not.toContain("Load Trellis Context First");

    // No hooks/settings files — dsh has no project-level hook or settings
    // surface Trellis may write; skills are the only payload.
    for (const key of files.keys()) {
      expect(key.startsWith(".dsh/hooks")).toBe(false);
      expect(key).not.toBe(".dsh/settings.json");
      expect(key).not.toBe(".dsh/config.toml");
    }
  });

  it("writes workflow + bundled skills to the shared .agents/skills/ root", () => {
    const files = collectDshTemplates();
    expect(files.has(".agents/skills/trellis-check/SKILL.md")).toBe(true);
    expect(files.has(".agents/skills/trellis-before-dev/SKILL.md")).toBe(true);
    expect(files.has(".agents/skills/trellis-meta/SKILL.md")).toBe(true);
    // Command-as-skill files stay dsh-private (Codex owns the shared
    // trellis-start/continue/finish-work fallback copies).
    expect(files.has(".agents/skills/trellis-start/SKILL.md")).toBe(false);
    expect(files.has(".agents/skills/trellis-finish-work/SKILL.md")).toBe(
      false,
    );
  });

  it("renders .agents/skills/ files byte-identically to Pi's shared writes", () => {
    const dshFiles = collectDshTemplates();
    const piFiles = collectPiTemplates();
    for (const [key, content] of dshFiles) {
      if (!key.startsWith(".agents/skills/")) continue;
      expect(
        piFiles.get(key),
        `${key} must be byte-identical to Pi's shared-skill write`,
      ).toBe(content);
    }
  });
});
