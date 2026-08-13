/**
 * DeepSeek Harness (dsh) template module.
 *
 * dsh is a class-2 pull-based platform:
 * - Workflow/bundled skills go to the shared `.agents/skills/` root via the
 *   neutral resolver (byte-identical to Codex/Gemini/Pi/Kimi writes).
 * - User-invocable entry points (`trellis-start` / `trellis-continue` /
 *   `trellis-finish-work`, invoked by typing `/trellis-<name>`) and the Trellis
 *   agent prompts live under `.dsh/skills/<name>/SKILL.md`.
 *
 * dsh has no project-level hooks/settings file Trellis may write and no
 * declarative custom sub-agent definitions, so the Trellis agent prompts ship
 * as skills; the main session dispatches them through the `subagent` tool and
 * trellis-implement / trellis-check get the pull-based prelude.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents } = createTemplateReader(import.meta.url);

/** Trellis agent prompts (trellis-implement, trellis-check, trellis-research), installed as dsh skills. */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}
