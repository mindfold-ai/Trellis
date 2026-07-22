import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  collectSkillTemplates,
  replacePythonCommandLiterals,
  resolveCommands,
  resolveBundledSkills,
  resolveSkills,
  wrapWithOmpFrontmatter,
  writeAgents,
  writeSkills,
  applyMethodSkillsPreludeMarkdown,
} from "./shared.js";
import { getAllAgents, getExtensionTemplate } from "../templates/omp/index.js";

/**
 * Collect all OMP template files for `trellis update` hash comparison.
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
  for (const agent of applyMethodSkillsPreludeMarkdown(getAllAgents())) {
    files.set(`.omp/agents/${agent.name}.md`, agent.content);
  }

  // Extension
  files.set(
    ".omp/extensions/trellis/index.ts",
    replacePythonCommandLiterals(getExtensionTemplate()),
  );

  return files;
}

/**
 * Initialize OMP platform: write commands, skills, agents, and extension.
 * No settings.json — OMP's native provider auto-discovers all subdirectories.
 */
export async function configureOmp(cwd: string): Promise<void> {
  const config = AI_TOOLS.omp;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  // Commands
  ensureDir(path.join(configRoot, "commands"));
  for (const command of resolveCommands(ctx)) {
    await writeFile(
      path.join(configRoot, "commands", `trellis-${command.name}.md`),
      wrapWithOmpFrontmatter(command.name, command.content),
    );
  }

  // Skills
  await writeSkills(
    path.join(configRoot, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );

  // Agents (class-1: no applyPullBasedPreludeMarkdown)
  await writeAgents(
    path.join(configRoot, "agents"),
    applyMethodSkillsPreludeMarkdown(getAllAgents()),
  );

  // Extension
  ensureDir(path.join(configRoot, "extensions", "trellis"));
  await writeFile(
    path.join(configRoot, "extensions", "trellis", "index.ts"),
    replacePythonCommandLiterals(getExtensionTemplate()),
  );
}
