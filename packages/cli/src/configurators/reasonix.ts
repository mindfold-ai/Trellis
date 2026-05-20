/**
 * Reasonix configurator.
 *
 * Reasonix (DeepSeek-Reasonix) stores skills as `.reasonix/skills/<name>/SKILL.md`
 * with YAML frontmatter (name + description). Slash commands are code-built-in,
 * so no commands directory is generated.
 *
 * Workflow templates are surfaced as skills with `trellis-` prefix (invocable
 * via `/skill trellis-start`, `/skill trellis-continue`, etc.).
 * Subagent skills (trellis-implement, trellis-check) use `runAs: subagent`
 * frontmatter so Reasonix spawns them as isolated subagent loops.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { getAllAgents } from "../templates/reasonix/index.js";
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

  // Subagent skill names that replace common-skill equivalents.
  const agentNames = new Set(getAllAgents().map((a) => a.name));

  // Workflow skills filtered to avoid collision with subagent skills.
  const skills = resolveAllAsSkills(ctx).filter((s) => !agentNames.has(s.name));

  for (const [filePath, content] of collectSkillTemplates(
    ".reasonix/skills",
    skills,
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // Subagent skills (trellis-implement, trellis-check) — written with
  // runAs: subagent frontmatter for isolated subagent loops.
  for (const agent of getAllAgents()) {
    files.set(`.reasonix/skills/${agent.name}/SKILL.md`, agent.content);
  }

  return files;
}

/**
 * Configure Reasonix at init time: write workflow skills + subagent skills
 * to `.reasonix/skills/`.
 */
export async function configureReasonix(cwd: string): Promise<void> {
  const config = AI_TOOLS.reasonix;
  const ctx = config.templateContext;
  const skillsRoot = path.join(cwd, config.configDir, "skills");

  // Subagent skill names that replace common-skill equivalents.
  const agentNames = new Set(getAllAgents().map((a) => a.name));

  // Write workflow skills, filtering out any that have subagent equivalents.
  const skills = resolveAllAsSkills(ctx).filter((s) => !agentNames.has(s.name));
  await writeSkills(skillsRoot, skills, resolveBundledSkills(ctx));

  // Subagent skills with runAs: subagent frontmatter
  for (const agent of getAllAgents()) {
    const agentDir = path.join(skillsRoot, agent.name);
    ensureDir(agentDir);
    await writeFile(path.join(agentDir, "SKILL.md"), agent.content);
  }
}
