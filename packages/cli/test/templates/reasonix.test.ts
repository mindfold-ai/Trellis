import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getAllAgents } from "../../src/templates/reasonix/index.js";
import {
  collectReasonixTemplates,
} from "../../src/configurators/reasonix.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

// Reasonix ships skills-only; subagent skills carry `runAs: subagent`
// frontmatter so Reasonix spawns them as isolated subagent loops.
const EXPECTED_AGENT_NAMES = ["trellis-check", "trellis-implement"];

describe("reasonix getAllAgents", () => {
  it("returns the expected agent set", () => {
    const agents = getAllAgents();
    const names = agents.map((a) => a.name).sort();
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });
});

describe("reasonix agent frontmatter", () => {
  for (const name of EXPECTED_AGENT_NAMES) {
    it(`${name}.md frontmatter declares runAs: subagent`, () => {
      const filePath = path.join(
        repoRoot,
        "packages/cli/src/templates/reasonix/agents",
        `${name}.md`,
      );
      const content = fs.readFileSync(filePath, "utf-8");
      const fm = content.split("---\n")[1] ?? "";

      // runAs: subagent is what makes Reasonix invoke these as an isolated
      // subagent loop instead of a regular slash-skill invocation.
      expect(fm).toMatch(/^runAs:\s*subagent\s*$/m);
      // Name must match the file basename so Reasonix can address the skill.
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      expect(nameMatch?.[1]?.trim()).toBe(name);
      // Description must be a single non-empty line (Reasonix shows it in the
      // skill picker; YAML block-scalar form would render empty).
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      expect(descMatch?.[1]?.trim().length ?? 0).toBeGreaterThan(0);
    });
  }
});

describe("collectReasonixTemplates", () => {
  it("writes both subagent skills under .reasonix/skills/", () => {
    const files = collectReasonixTemplates();
    expect(files.has(".reasonix/skills/trellis-check/SKILL.md")).toBe(true);
    expect(files.has(".reasonix/skills/trellis-implement/SKILL.md")).toBe(true);
  });

  it("does not duplicate trellis-check / trellis-implement as workflow skills", () => {
    // Subagent skills replace their common-skill equivalents — workflow skills
    // must not also emit a `.reasonix/skills/trellis-check/SKILL.md` from the
    // shared resolver, or the bundled subagent variant would be overwritten.
    const files = collectReasonixTemplates();
    const checkPaths = [...files.keys()].filter((p) =>
      p.endsWith("/trellis-check/SKILL.md"),
    );
    const implementPaths = [...files.keys()].filter((p) =>
      p.endsWith("/trellis-implement/SKILL.md"),
    );
    expect(checkPaths).toHaveLength(1);
    expect(implementPaths).toHaveLength(1);
  });

  it("subagent SKILL.md content carries runAs: subagent frontmatter", () => {
    const files = collectReasonixTemplates();
    const checkBody = files.get(".reasonix/skills/trellis-check/SKILL.md");
    const implementBody = files.get(
      ".reasonix/skills/trellis-implement/SKILL.md",
    );
    expect(checkBody).toMatch(/^runAs:\s*subagent\s*$/m);
    expect(implementBody).toMatch(/^runAs:\s*subagent\s*$/m);
  });
});
