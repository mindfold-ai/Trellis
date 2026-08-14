/**
 * DeepSeek Harness (dsh) configurator.
 *
 * dsh is a class-2 pull-based platform (agentCapable via the `subagent` tool,
 * no shipped session-start hook, no project-level hooks/settings Trellis may
 * write). Three output paths:
 * - `.agents/skills/` — workflow + bundled skills, written via the NEUTRAL
 *   resolver so the files stay byte-identical to Codex/Gemini/Pi/Kimi writes
 *   into the same shared root (dsh discovers `.agents/skills/` natively).
 * - `.dsh/skills/` — dsh-private entry skills (trellis-start /
 *   trellis-continue / trellis-finish-work) plus collision-free Trellis role
 *   skills (trellis-agent-implement / trellis-agent-check /
 *   trellis-agent-research) with the pull-based prelude on implement/check.
 * - `.dsh/DSH.md` — operator guide and a configDir-owned tracked file for
 *   platform detection and uninstall scoping.
 *
 * dsh has no project-level hooks/settings file Trellis may write and no
 * declarative custom sub-agent definitions (dispatch goes through the
 * `subagent` tool), so no hooks, settings, or extension files are written and
 * the agent prompts ship as skills.
 */

import { AI_TOOLS } from "../types/ai-tools.js";
import { getAllAgents, getDshGuide } from "../templates/dsh/index.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  replacePythonCommandLiterals,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  type AgentContent,
} from "./shared.js";

/**
 * Command templates that become user-invocable dsh skills
 * (loaded by their `trellis-<name>` skill names). The session-boundary
 * commands are delivered as SKILL.md files in DSH's private project root.
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

/** Trellis agent prompts as DSH-private skills. The `trellis-agent-*` names
 *  intentionally do not collide with shared main-session workflow skills such
 *  as `.agents/skills/trellis-check`. */
function resolveDshAgentSkills(): AgentContent[] {
  return applyPullBasedPreludeMarkdown(getAllAgents()).map((agent) => {
    const name = agent.name.replace(/^trellis-/, "trellis-agent-");
    return {
      ...agent,
      name,
      content: replacePythonCommandLiterals(agent.content).replace(
        /^name:\s*trellis-[^\r\n]+$/m,
        `name: ${name}`,
      ),
    };
  });
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

  // 3. Operator guide → `.dsh/DSH.md`.
  files.set(".dsh/DSH.md", getDshGuide());

  return files;
}
