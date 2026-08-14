/**
 * DeepSeek Harness (dsh) template module.
 *
 * dsh is a class-2 pull-based platform:
 * - Workflow/bundled skills go to the shared `.agents/skills/` root via the
 *   neutral resolver (byte-identical to Codex/Gemini/Pi/Kimi writes).
 * - User-invocable entry points (`trellis-start` / `trellis-continue` /
 *   `trellis-finish-work`) and Trellis role prompts live under
 *   `.dsh/skills/trellis-agent-<role>/SKILL.md`.
 * - Operator guide `.dsh/DSH.md`.
 *
 * dsh has no project-level hooks/settings file Trellis may write and no
 * declarative custom sub-agent definitions, so the Trellis agent prompts ship
 * as skills; the main session dispatches them through the `subagent` tool and
 * trellis-agent-implement / trellis-agent-check get the pull-based prelude.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents, readTemplate } = createTemplateReader(import.meta.url);

/** Source role prompts; the configurator installs collision-free DSH skills. */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}

/** Operator guide copied to `.dsh/DSH.md`. */
export function getDshGuide(): string {
  return readTemplate("DSH.md");
}
