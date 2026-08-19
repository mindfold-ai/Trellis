/**
 * Kimi Code template module.
 *
 * Kimi Code is a class-2 pull-based platform:
 * - Workflow/bundled skills go to the shared `.agents/skills/` root via the
 *   neutral resolver (byte-identical to Codex/Gemini/Pi writes).
 * - User-invocable entry points (`trellis-start` / `trellis-continue` /
 *   `trellis-finish-work`, invoked as `/skill:trellis-<name>`) and the Trellis
 *   agent prompts live under `.kimi-code/skills/<name>/SKILL.md`.
 * - The same agent prompts are also installed as project-level custom
 *   sub-agent definitions under `.kimi-code/agents/<name>.md`.
 *
 * Kimi has no project-level hooks/settings file Trellis may write, so no
 * hooks or settings are shipped; trellis-implement / trellis-check get the
 * pull-based prelude, trellis-research stays standalone.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents } = createTemplateReader(import.meta.url);

/** Trellis agent prompts (trellis-implement, trellis-check, trellis-research), installed as Kimi skills. */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}
