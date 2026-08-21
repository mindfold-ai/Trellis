import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSkillTemplates,
  replacePythonCommandLiterals,
  applyDeclaredEntryPoints,
  resolveCommands,
  resolveBundledSkills,
  resolveSkills,
  wrapWithOmpFrontmatter,
} from "./shared.js";
import { getAllAgents, getExtensionTemplate } from "../templates/omp/index.js";

/**
 * The OMP file set — written at init and diffed by `trellis update`.
 * OMP has no settings.json — the native provider auto-discovers all capabilities.
 */
export function collectOmpTemplates(): Map<string, string> {
  const config = AI_TOOLS.omp;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  // Commands → .omp/commands/
  for (const command of resolveCommands(ctx)) {
    files.set(
      `.omp/commands/trellis-${command.name}.md`,
      wrapWithOmpFrontmatter(command.name, command.content),
    );
  }

  // Skills → .omp/skills/
  for (const [filePath, content] of collectSkillTemplates(
    ".omp/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // Agents (class-1: no pull-based prelude)
  for (const agent of getAllAgents()) {
    files.set(`.omp/agents/${agent.name}.md`, agent.content);
  }

  // Extension
  files.set(
    ".omp/extensions/trellis/index.ts",
    applyDeclaredEntryPoints(
      replacePythonCommandLiterals(getExtensionTemplate()),
    ),
  );

  return files;
}
