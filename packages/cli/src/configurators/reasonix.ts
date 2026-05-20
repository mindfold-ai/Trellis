/**
 * Reasonix configurator.
 *
 * Reasonix (DeepSeek-Reasonix) stores skills as `.reasonix/skills/<name>/SKILL.md`
 * with YAML frontmatter (name + description). Slash commands are code-built-in,
 * so no commands directory is generated.
 *
 * All workflow templates are surfaced as skills with `trellis-` prefix,
 * invocable via `/skill trellis-start`, `/skill trellis-continue`, etc.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  writeSkills,
} from "./shared.js";

/**
 * Collect all Reasonix template files for `trellis update` diff tracking.
 * Must stay in sync with `configureReasonix`.
 */
export function collectReasonixTemplates(): Map<string, string> {
  const config = AI_TOOLS.reasonix;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  // All workflow templates as skills (trellis- prefix + frontmatter).
  // Commands (start, continue, finish-work) are folded into the skill set
  // so they're invocable via /skill trellis-<name>.
  for (const [filePath, content] of collectSkillTemplates(
    ".reasonix/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  return files;
}

/**
 * Configure Reasonix at init time: write workflow skills to `.reasonix/skills/`.
 */
export async function configureReasonix(cwd: string): Promise<void> {
  const config = AI_TOOLS.reasonix;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  await writeSkills(
    path.join(configRoot, "skills"),
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );
}
