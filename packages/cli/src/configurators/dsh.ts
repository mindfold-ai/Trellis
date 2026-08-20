/**
 * DeepSeek Harness (dsh) configurator.
 *
 * dsh is a class-2 pull-based platform (agentCapable, no shipped
 * session-start hook, no project-level hooks/settings Trellis may write).
 * The dsh agent loads skills by name through its skill-loader tool and
 * discovers them from the project roots `<projectRoot>/.dsh/skills`
 * (rank 100) and `<projectRoot>/.agents/skills` (rank 200). Two output
 * paths:
 * - `.agents/skills/` — workflow + bundled skills, written via the NEUTRAL
 *   resolver so the files stay byte-identical to Codex/Gemini/Pi/Kimi
 *   writes into the same shared root.
 * - `.dsh/skills/` — dsh-private user-invocable entry skills
 *   (`trellis-start` / `trellis-continue` / `trellis-finish-work`),
 *   platform-resolved (`--platform dsh`, `trellis-<name>` skill refs), in
 *   dsh's own highest-rank project skill root.
 * - `.dsh/DSH.md` — operator guide; also gives the platform a
 *   configDir-owned tracked file so `trellis platforms` / `uninstall`
 *   can detect and scope dsh.
 *
 * dsh ships no project-level sub-agent definition surface, so no
 * trellis-implement / trellis-check / trellis-research agent prompts are
 * written; implement/check/research run inline through the workflow skills.
 */

import { AI_TOOLS } from "../types/ai-tools.js";
import { getDshGuide } from "../templates/dsh/index.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
} from "./shared.js";

/**
 * Command templates that become user-invocable dsh skills
 * (`trellis-start` / `trellis-continue` / `trellis-finish-work`). dsh has
 * no slash-command palette, so the session-boundary commands are delivered
 * as SKILL.md files in `.dsh/skills/`.
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

/**
 * The dsh file set — written at init and diffed by `trellis update`.
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

  // 2. Commands-as-skills → `.dsh/skills/` (dsh-native project root).
  for (const [filePath, content] of collectSkillTemplates(
    ".dsh/skills",
    resolveDshCommandSkills(),
  )) {
    files.set(filePath, content);
  }

  // 3. Operator guide → `.dsh/DSH.md`.
  files.set(".dsh/DSH.md", getDshGuide());

  return files;
}
