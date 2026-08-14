import { describe, expect, it } from "vitest";
import { getAllAgents, getDshGuide } from "../../src/templates/dsh/index.js";
import {
  applyPullBasedPreludeMarkdown,
  replacePythonCommandLiterals,
} from "../../src/configurators/shared.js";
import { collectDshTemplates } from "../../src/configurators/dsh.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";

const EXPECTED_AGENT_NAMES = [
  "trellis-check",
  "trellis-implement",
  "trellis-research",
];

describe("dsh template readers", () => {
  it("returns the expected child-only role prompt set", () => {
    const agents = getAllAgents();
    expect(agents.map((agent) => agent.name)).toEqual(EXPECTED_AGENT_NAMES);

    for (const agent of agents) {
      const content = agent.content.replace(/\r\n/g, "\n");
      expect(content).toMatch(/^---\n/);
      expect(content).toContain(`name: ${agent.name}`);
      expect(content).toContain("description:");
      expect(content).toContain("user-invocable: false");
      expect(content).toContain("Child-agent-only");
      expect(content).not.toContain("## Dispatch note (main session)");
    }
  });

  it("keeps research read-only and uses the portable Python template command", () => {
    const research = getAllAgents().find(
      (agent) => agent.name === "trellis-research",
    );
    expect(research).toBeDefined();
    if (!research) return;

    expect(research.content).toContain(
      "Run `python3 ./.trellis/scripts/task.py current --source`",
    );
    expect(research.content).toContain(
      "Don't write code or modify files outside `{TASK_DIR}/research/`",
    );
  });

  it("ships an operator guide with both plugin and no-plugin paths", () => {
    const guide = getDshGuide();
    expect(guide).toContain("Without companion plugin");
    expect(guide).toContain("With `dsh-trellis`");
    expect(guide).toContain("If unavailable");
    expect(guide).toContain("once per dependent child id");
    expect(guide).toContain("run_in_background: false");
    expect(guide).toContain("DSH_TRELLIS_CONTEXT_ID");
    expect(guide).toContain("`DSH_SHELL=1` together with `DSH_SESSION_ID`");
    expect(guide).toContain("including nested launches");
    expect(guide).not.toContain("unset `TRELLIS_CONTEXT_ID`");
    expect(guide).toContain("creates a fresh DSH session");
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
    const research = applyPullBasedPreludeMarkdown(getAllAgents()).find(
      (agent) => agent.name === "trellis-research",
    );
    expect(research).toBeDefined();
    if (!research) return;
    expect(research.content).not.toContain("Load Trellis Context First");
    expect(research.content).toContain("{TASK_DIR}/research/");
  });
});

describe("dsh collectDshTemplates", () => {
  it("writes entry skills and collision-free role skills under .dsh/skills/", () => {
    const files = collectDshTemplates();

    expect(files.has(".dsh/skills/trellis-start/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-continue/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-finish-work/SKILL.md")).toBe(true);

    expect(files.has(".dsh/skills/trellis-agent-implement/SKILL.md")).toBe(
      true,
    );
    expect(files.has(".dsh/skills/trellis-agent-check/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-agent-research/SKILL.md")).toBe(true);
    expect(files.has(".dsh/skills/trellis-check/SKILL.md")).toBe(false);

    const implement = files.get(".dsh/skills/trellis-agent-implement/SKILL.md");
    expect(implement).toContain("Load Trellis Context First");
    expect(implement).toContain("name: trellis-agent-implement");
    expect(implement).toContain("user-invocable: false");

    const check = files.get(".dsh/skills/trellis-agent-check/SKILL.md");
    expect(check).toContain("quality gate as **blocked** or **failed**");

    const research = files.get(".dsh/skills/trellis-agent-research/SKILL.md");
    expect(research).not.toContain("Load Trellis Context First");
    expect(research).toContain("user-invocable: false");
    expect(research).toContain(
      replacePythonCommandLiterals(
        "python3 ./.trellis/scripts/task.py current --source",
      ),
    );
  });

  it("resolves entry-skill placeholders for dsh", () => {
    const files = collectDshTemplates();
    const start = files.get(".dsh/skills/trellis-start/SKILL.md");
    const finish = files.get(".dsh/skills/trellis-finish-work/SKILL.md");

    expect(start).toContain("--platform dsh");
    expect(start).toContain("name: trellis-start");
    expect(finish).toContain("`trellis-finish-work`");
  });

  it("writes workflow + bundled skills byte-identically to Pi's shared writes", () => {
    const dshFiles = collectDshTemplates();
    const piFiles = collectPiTemplates();

    expect(dshFiles.has(".agents/skills/trellis-check/SKILL.md")).toBe(true);
    expect(dshFiles.has(".agents/skills/trellis-before-dev/SKILL.md")).toBe(
      true,
    );
    expect(dshFiles.has(".agents/skills/trellis-meta/SKILL.md")).toBe(true);
    expect(dshFiles.has(".agents/skills/trellis-start/SKILL.md")).toBe(false);

    for (const [key, value] of dshFiles) {
      if (!key.startsWith(".agents/skills/")) continue;
      expect(
        piFiles.get(key),
        `${key} must be byte-identical to Pi's shared-skill write`,
      ).toBe(value);
    }
  });

  it("ships the operator guide and no hooks/settings files", () => {
    const files = collectDshTemplates();
    expect(files.get(".dsh/DSH.md")).toContain(
      "Companion plugin fallback contract",
    );
    for (const key of files.keys()) {
      expect(key.startsWith(".dsh/hooks")).toBe(false);
      expect(key).not.toBe(".dsh/settings.json");
      expect(key).not.toBe(".dsh/config.toml");
    }
  });
});
