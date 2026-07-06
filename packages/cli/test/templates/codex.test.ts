import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAllAgents,
  getAllCodexSkills,
  getConfigTemplate,
} from "../../src/templates/codex/index.js";
import { resolveAllAsSkills } from "../../src/configurators/shared.js";
import { AI_TOOLS } from "../../src/types/ai-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

const EXPECTED_AGENT_NAMES = [
  "trellis-check",
  "trellis-implement",
  "trellis-research",
];

const EMPTY_EXCEPT_PASS_RE = /except[^\n]*:\n\s*pass\s*$/m;

// Shared skills are now sourced from common/ via resolveAllAsSkills
describe("codex shared skills (from common source)", () => {
  it("resolves all common templates for codex context", () => {
    const skills = resolveAllAsSkills(AI_TOOLS.codex.templateContext);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(skill.content).toContain("description:");
      expect(skill.content).toContain(`name: ${skill.name}`);
    }
  });

  it("does not include platform-specific syntax in resolved output", () => {
    const skills = resolveAllAsSkills(AI_TOOLS.codex.templateContext);
    for (const skill of skills) {
      // Codex uses $ prefix, not /trellis:
      expect(skill.content).not.toContain("/trellis:");
      expect(skill.content).not.toContain(".claude/");
      expect(skill.content).not.toContain(".cursor/");
    }
  });
});

describe("codex getAllAgents", () => {
  it("returns the expected custom agent set", () => {
    const agents = getAllAgents();
    const names = agents.map((agent) => agent.name);
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });

  it("each agent has required fields (name, description, developer_instructions)", () => {
    for (const agent of getAllAgents()) {
      expect(agent.content.length).toBeGreaterThan(0);
      expect(agent.content).toContain("name = ");
      expect(agent.content).toContain("description = ");
      expect(agent.content).toContain("developer_instructions = ");
    }
  });
});

describe("codex getAllCodexSkills (platform-specific)", () => {
  it("returns empty after parallel removal", () => {
    const skills = getAllCodexSkills();
    expect(skills).toEqual([]);
  });
});

describe("codex getConfigTemplate", () => {
  it("returns project config.toml content", () => {
    const config = getConfigTemplate();
    expect(config.targetPath).toBe("config.toml");
    expect(config.content).toContain("project_doc_fallback_filenames");
    expect(config.content).toContain("AGENTS.md");
  });

  // The structured [features.multi_agent_v2] table form is only accepted by
  // Codex CLI 0.131+. On 0.130 and earlier — including the codex CLI bundled
  // in the Codex desktop app — it aborts the whole config load with
  // `data did not match any variant of untagged enum FeatureToml`. Trellis
  // no longer writes the block; this test guards against reintroducing it.
  it("does not write a [features.multi_agent_v2] block (Codex 0.130 compat)", () => {
    const config = getConfigTemplate();
    expect(config.content).not.toMatch(/^\[features\.multi_agent_v2\]/m);
  });
});

// =============================================================================
// Issue #234 — Codex sub-agent recursion guard
// =============================================================================
//
// trellis-implement / trellis-check agent toml MUST contain a hard recursion
// guard that tells the sub-agent it is already the dispatched agent and must
// not spawn another trellis-implement / trellis-check sub-agent. Without this,
// SessionStart's "dispatch trellis-implement" guidance leaks into sub-agent
// sessions and causes infinite recursion (see PRD).
describe("codex sub-agent recursion guard (issue #234)", () => {
  for (const name of ["trellis-implement", "trellis-check"] as const) {
    it(`${name}.toml developer_instructions forbids spawning trellis-implement / trellis-check`, () => {
      const tomlPath = path.join(
        repoRoot,
        "packages/cli/src/templates/codex/agents",
        `${name}.toml`,
      );
      const content = fs.readFileSync(tomlPath, "utf-8");
      // Hard prohibition keyword
      expect(content).toMatch(/MUST NOT spawn/i);
      // Mentions both sibling agent kinds explicitly
      expect(content).toContain("trellis-implement");
      expect(content).toContain("trellis-check");
      // Mentions the leakage source so the reader knows why
      expect(content).toMatch(/SessionStart|dispatch.*main session|breadcrumb/i);
    });
  }
});

describe("codex session-start.py compact SessionStart context", () => {
  const hookPath = path.join(
    repoRoot,
    "packages/cli/src/templates/codex/hooks/session-start.py",
  );

  it("uses compact task artifact guidance instead of sub-agent dispatch prose", () => {
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("Trellis compact SessionStart context");
    expect(content).toContain("Task context order for implementation/check");
    expect(content).toContain("design.md if present");
    expect(content).not.toContain("<sub-agent-notice>");
    expect(content).not.toContain("guides (inlined");
    expect(content).not.toContain("Project spec indexes are listed by path below");
  });

  it("documents fail-open exception suppression", () => {
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).not.toMatch(EMPTY_EXCEPT_PASS_RE);
  });
});
