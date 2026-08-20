/**
 * Kimi Code configurator.
 *
 * Kimi Code is a class-2 pull-based platform (agentCapable, no hooks, no
 * project-level settings/extensions). Two output paths:
 * - `.agents/skills/` — workflow + bundled skills, written via the NEUTRAL
 *   resolver so the files stay byte-identical to Codex/Gemini/Pi writes into
 *   the same shared root (Kimi discovers `.agents/skills/` natively).
 * - `.kimi-code/skills/` — Kimi-private entry points: the user-invocable
 *   commands as skills (`/skill:trellis-start`, `/skill:trellis-continue`,
 *   `/skill:trellis-finish-work`) plus the Trellis agent prompts
 *   (trellis-implement / trellis-check / trellis-research) with the
 *   pull-based prelude on implement/check.
 * - `.kimi-code/agents/` — the same Trellis agent prompts as project-level
 *   custom sub-agent definitions (Claude Code-compatible frontmatter), so
 *   the main session can dispatch `trellis-<name>` sub-agents directly.
 *
 * Trellis does not generate project-local Kimi settings or hooks.
 * Project-local Kimi settings go in `.kimi-code/local.toml`; hooks are
 * configured in `$KIMI_CODE_HOME/config.toml`.
 */

import { AI_TOOLS } from "../types/ai-tools.js";
import { getAllAgents } from "../templates/kimi/index.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  type AgentContent,
} from "./shared.js";

/**
 * Command templates that become user-invocable Kimi skills
 * (`/skill:trellis-<name>`). Kimi has no slash-command mechanism besides
 * skills, so the session-boundary commands are delivered as SKILL.md files.
 */
const KIMI_COMMAND_SKILL_NAMES = new Set([
  "trellis-start",
  "trellis-continue",
  "trellis-finish-work",
]);

/** Session-boundary commands resolved as Kimi skills (Kimi-private root, so
 *  platform-specific `{{CLI_FLAG}}` / `{{CMD_REF}}` resolution is correct). */
function resolveKimiCommandSkills(): ReturnType<typeof resolveAllAsSkills> {
  const ctx = AI_TOOLS.kimi.templateContext;
  return resolveAllAsSkills(ctx).filter((skill) =>
    KIMI_COMMAND_SKILL_NAMES.has(skill.name),
  );
}

/** Trellis agent prompts as Kimi skills (and `.kimi-code/agents/` sub-agent
 *  definitions), with the pull-based prelude on implement/check. */
function resolveKimiAgentSkills(): AgentContent[] {
  return applyPullBasedPreludeMarkdown(getAllAgents());
}

/**
 * The Kimi Code file set — written at init and diffed by `trellis update`.
 */
export function collectKimiTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.kimi.templateContext;
  const files = new Map<string, string>();

  // 1. Workflow + bundled skills → shared `.agents/skills/` (neutral
  //    rendering, byte-identical to Codex/Gemini/Pi writes).
  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // 2. Commands-as-skills + Trellis agent prompts → `.kimi-code/skills/`.
  const agentPrompts = resolveKimiAgentSkills();
  for (const [filePath, content] of collectSkillTemplates(".kimi-code/skills", [
    ...resolveKimiCommandSkills(),
    ...agentPrompts,
  ])) {
    files.set(filePath, content);
  }

  // 3. Custom sub-agent definitions → `.kimi-code/agents/`. Kimi Code
  //    discovers project-level agents there (Claude Code-compatible
  //    frontmatter); content mirrors the skill copies, pull-based prelude
  //    included, so dispatching `trellis-<name>` directly behaves the same.
  for (const agent of agentPrompts) {
    files.set(`.kimi-code/agents/${agent.name}.md`, agent.content);
  }

  return files;
}
