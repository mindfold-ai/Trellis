/**
 * Grok Build configurator.
 *
 * Grok Build (xAI) is a pull-based class-2 platform (agentCapable, no hooks).
 * Three output paths:
 * - `.grok/skills/` — workflow and bundled skills
 * - `.grok/commands/trellis-*.md` — flat slash commands (Grok layout)
 * - `.grok/agents/` — sub-agent definitions with pull-based prelude
 *
 * Do not install SessionStart/UserPromptSubmit injection hooks here until Grok
 * consumes hook stdout additionalContext (verified absent on 0.2.x).
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { getAllAgents } from "../templates/grok/index.js";
import {
  collectSkillTemplates,
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  writeSkills,
  writeAgents,
  applyPullBasedPreludeMarkdown,
} from "./shared.js";

/**
 * Collect all Grok template files for `trellis update` diff tracking.
 * Must stay in sync with `configureGrok`.
 */
export function collectGrokTemplates(): Map<string, string> {
  const config = AI_TOOLS.grok;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  // 1. Workflow + bundled skills → .grok/skills/
  for (const [filePath, content] of collectSkillTemplates(
    ".grok/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // 2. Commands → flat .grok/commands/trellis-<name>.md
  //    Grok discovers slash commands as flat *.md under commands/ (stem = name).
  for (const cmd of resolveCommands(ctx)) {
    files.set(`.grok/commands/trellis-${cmd.name}.md`, cmd.content);
  }

  // 3. Sub-agents → .grok/agents/ (with pull-based prelude on implement/check)
  for (const agent of applyPullBasedPreludeMarkdown(getAllAgents())) {
    files.set(`.grok/agents/${agent.name}.md`, agent.content);
  }

  return files;
}

/**
 * Configure Grok Build at init time: write skills, commands, and sub-agents.
 */
export async function configureGrok(cwd: string): Promise<void> {
  const config = AI_TOOLS.grok;
  const ctx = config.templateContext;

  // 1. Workflow + bundled skills → .grok/skills/
  await writeSkills(
    path.join(cwd, ".grok", "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );

  // 2. Commands → flat .grok/commands/trellis-*.md
  const commandsDir = path.join(cwd, ".grok", "commands");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(
      path.join(commandsDir, `trellis-${cmd.name}.md`),
      cmd.content,
    );
  }

  // 3. Sub-agents → .grok/agents/ (with pull-based prelude)
  await writeAgents(
    path.join(cwd, ".grok", "agents"),
    applyPullBasedPreludeMarkdown(getAllAgents()),
  );
}
