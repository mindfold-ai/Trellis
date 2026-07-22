import { describe, expect, it } from "vitest";
import { getAllAgents } from "../../src/templates/kimi/index.js";
import { applyPullBasedPreludeMarkdown } from "../../src/configurators/shared.js";
import { collectKimiTemplates } from "../../src/configurators/kimi.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";

const EXPECTED_AGENT_NAMES = [
  "trellis-check",
  "trellis-implement",
  "trellis-research",
];

describe("kimi getAllAgents", () => {
  it("returns the expected agent prompt set", () => {
    const agents = getAllAgents();
    const names = agents.map((agent) => agent.name);
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });

  it("each agent is a Markdown file with YAML frontmatter (Kimi SKILL.md requires name + description)", () => {
    for (const agent of getAllAgents()) {
      const content = agent.content.replace(/\r\n/g, "\n");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name: ");
      expect(content).toContain("description:");
      // Kimi agents document dispatch through the built-in sub-agents
      expect(content).toContain("built-in");
    }
  });

  it("dispatches research through the writable coder sub-agent", () => {
    const research = getAllAgents().find(
      (agent) => agent.name === "trellis-research",
    );
    expect(research).toBeDefined();
    if (!research) return;

    expect(research.content).toContain("built-in `coder` sub-agent");
    expect(research.content).toContain("`explore` sub-agent is read-only");
    expect(research.content).toContain("may write only under");
    expect(research.content).not.toContain(
      "dispatches the built-in `explore` sub-agent",
    );
  });
});

describe("kimi pull-based prelude injection", () => {
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

describe("kimi collectKimiTemplates", () => {
  it("writes commands-as-skills and agent prompts under .kimi-code/skills/", () => {
    const files = collectKimiTemplates();

    // User-invocable entry points (/skill:trellis-<name>)
    expect(files.has(".kimi-code/skills/trellis-start/SKILL.md")).toBe(true);
    expect(files.has(".kimi-code/skills/trellis-continue/SKILL.md")).toBe(true);
    expect(files.has(".kimi-code/skills/trellis-finish-work/SKILL.md")).toBe(
      true,
    );

    // Trellis agent prompts (Kimi has no custom sub-agent definitions)
    expect(files.has(".kimi-code/skills/trellis-implement/SKILL.md")).toBe(
      true,
    );
    expect(files.has(".kimi-code/skills/trellis-check/SKILL.md")).toBe(true);
    expect(files.has(".kimi-code/skills/trellis-research/SKILL.md")).toBe(true);

    const implement = files.get(".kimi-code/skills/trellis-implement/SKILL.md");
    expect(implement).toContain("Load Trellis Context First");
    const research = files.get(".kimi-code/skills/trellis-research/SKILL.md");
    expect(research).not.toContain("Load Trellis Context First");

    // No hooks/settings/extension files — Kimi has no project-level hook or
    // settings surface Trellis may write.
    for (const key of files.keys()) {
      expect(key.startsWith(".kimi-code/hooks")).toBe(false);
      expect(key).not.toBe(".kimi-code/settings.json");
      expect(key).not.toBe(".kimi-code/config.toml");
    }
  });

  it("writes workflow + bundled skills to the shared .agents/skills/ root", () => {
    const files = collectKimiTemplates();
    expect(files.has(".agents/skills/trellis-check/SKILL.md")).toBe(true);
    expect(files.has(".agents/skills/trellis-before-dev/SKILL.md")).toBe(true);
    expect(files.has(".agents/skills/trellis-meta/SKILL.md")).toBe(true);
    // Command-as-skill files stay Kimi-private (Codex owns the shared
    // trellis-start/continue/finish-work fallback copies).
    expect(files.has(".agents/skills/trellis-start/SKILL.md")).toBe(false);
    expect(files.has(".agents/skills/trellis-finish-work/SKILL.md")).toBe(
      false,
    );
  });

  it("renders .agents/skills/ files byte-identically to Pi's shared writes", () => {
    const kimiFiles = collectKimiTemplates();
    const piFiles = collectPiTemplates();
    for (const [key, content] of kimiFiles) {
      if (!key.startsWith(".agents/skills/")) continue;
      expect(
        piFiles.get(key),
        `${key} must be byte-identical to Pi's shared-skill write`,
      ).toBe(content);
    }
  });
});
