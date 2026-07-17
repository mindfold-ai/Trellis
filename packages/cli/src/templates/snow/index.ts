/**
 * Snow CLI (snocli) template module.
 *
 * Snow CLI is a class-1 platform when snow-cli supports #194:
 * - Skills under `.snow/skills/<name>/SKILL.md`
 * - Slash commands under `.snow/commands/trellis-*.json` (prompt type)
 * - Project agents under `.snow/agents/<name>.md` (auto-discovered)
 * - Inject hooks under `.snow/hooks/` (additionalContext + log breadcrumb)
 * - Operator guide `.snow/SNOW.md`
 *
 * hasHooks=true: SessionStart/UserMessage inject workflow context, so
 * trellis-start is filtered out of skills/commands (optional manual recovery
 * still documented in SNOW.md).
 *
 * trellis-implement / trellis-check use pull-based prelude as defense-in-depth.
 * trellis-research is standalone (no implement/check prelude).
 */

import {
  createTemplateReader,
  type AgentTemplate,
  type HookTemplate,
} from "../template-utils.js";

const { listMdAgents, readTemplate, listFiles } = createTemplateReader(
  import.meta.url,
);

/** Sub-agent definitions (trellis-implement, trellis-check, trellis-research). */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}

/** Inject + breadcrumb hooks (onSessionStart / onUserMessage / beforeSubAgentStart). */
export function getAllHooks(): HookTemplate[] {
  return listFiles("hooks").map((name) => ({
    targetPath: name,
    content: readTemplate(`hooks/${name}`),
  }));
}

/** Operator guide copied to `.snow/SNOW.md`. */
export function getSnowGuide(): string {
  return readTemplate("SNOW.md");
}
