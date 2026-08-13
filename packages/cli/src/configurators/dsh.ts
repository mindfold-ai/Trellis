/**
 * DeepSeek Harness (dsh) configurator.
 *
 * dsh is a class-2 pull-based platform (agentCapable via the `subagent` tool,
 * no hooks, no project-level settings/extensions). Two output paths:
 * - `.agents/skills/` — workflow + bundled skills, written via the NEUTRAL
 *   resolver so the files stay byte-identical to Codex/Gemini/Pi/Kimi writes
 *   into the same shared root (dsh discovers `.agents/skills/` natively).
 * - `.dsh/skills/` — dsh-private entry points: the user-invocable commands as
 *   skills (`/trellis-start`, `/trellis-continue`, `/trellis-finish-work`)
 *   plus the Trellis agent prompts (trellis-implement / trellis-check /
 *   trellis-research) with the pull-based prelude on implement/check.
 *
 * dsh has no project-level hooks/settings file Trellis may write and no
 * declarative custom sub-agent definitions (dispatch goes through the
 * `subagent` tool), so no hooks, settings, or extension files are written and
 * the agent prompts ship as skills.
 */

import { AI_TOOLS } from "../types/ai-tools.js";
import { getAllAgents } from "../templates/dsh/index.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  type AgentContent,
} from "./shared.js";

/**
 * Command templates that become user-invocable dsh skills
 * (`/trellis-<name>` in the input box). dsh has no slash-command mechanism
 * besides user-invocable skills, so the session-boundary commands are
 * delivered as SKILL.md files.
 */
const DSH_COMMAND_SKILL_NAMES = new Set([
  "trellis-start",
  "trellis-continue",
  "trellis-finish-work",
]);

/** Session-boundary commands resolved as dsh skills (dsh-private root, so
 *  platform-specific `{{CLI_FLAG}}` / `{{CMD_REF}}` resolution is correct). */
function resolveDshCommandSkills(): ReturnType<typeof resolveAllAsSkills> {
  const ctx = AI_TOOLS.dsh.templateContext;
  return resolveAllAsSkills(ctx).filter((skill) =>
    DSH_COMMAND_SKILL_NAMES.has(skill.name),
  );
}

/** Trellis agent prompts as dsh skills, with the pull-based prelude on
 *  implement/check. */
function resolveDshAgentSkills(): AgentContent[] {
  return applyPullBasedPreludeMarkdown(getAllAgents());
}

/**
 * The DeepSeek Harness file set — written at init and diffed by `trellis update`.
 */
export function collectDshTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.dsh.templateContext;
  const files = new Map<string, string>();

  // 1. Workflow + bundled skills → shared `.agents/skills/` (neutral
  //    rendering, byte-identical to Codex/Gemini/Pi/Kimi writes).
  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // 2. Commands-as-skills + Trellis agent prompts → `.dsh/skills/`.
  for (const [filePath, content] of collectSkillTemplates(".dsh/skills", [
    ...resolveDshCommandSkills(),
    ...resolveDshAgentSkills(),
  ])) {
    files.set(filePath, content);
  }

  return files;
}
