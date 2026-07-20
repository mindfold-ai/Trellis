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
 *
 * Kimi has no project-level hooks/settings file (hooks live in user-level
 * `~/.kimi-code/config.toml` only) and no custom sub-agent definitions
 * (built-in coder/explore/plan only), so no hooks, settings, or extension
 * files are written and the agent prompts ship as skills.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getAllAgents } from "../templates/kimi/index.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  writeSkills,
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

/** Trellis agent prompts as Kimi skills, with the pull-based prelude on
 *  implement/check. */
function resolveKimiAgentSkills(): AgentContent[] {
  return applyPullBasedPreludeMarkdown(getAllAgents());
}

/**
 * Collect all Kimi template files for `trellis update` diff tracking.
 * Must stay in sync with `configureKimi`.
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
  for (const [filePath, content] of collectSkillTemplates(".kimi-code/skills", [
    ...resolveKimiCommandSkills(),
    ...resolveKimiAgentSkills(),
  ])) {
    files.set(filePath, content);
  }

  return files;
}

/**
 * Configure Kimi Code at init time: write shared + Kimi-private skills.
 */
export async function configureKimi(cwd: string): Promise<void> {
  const config = AI_TOOLS.kimi;
  const ctx = config.templateContext;

  // 1. Workflow + bundled skills → shared `.agents/skills/` (see
  //    collectKimiTemplates for the neutrality rule).
  await writeSkills(
    path.join(cwd, ".agents", "skills"),
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  );

  // 2. Commands-as-skills + Trellis agent prompts → `.kimi-code/skills/`.
  await writeSkills(path.join(cwd, config.configDir, "skills"), [
    ...resolveKimiCommandSkills(),
    ...resolveKimiAgentSkills(),
  ]);
}
