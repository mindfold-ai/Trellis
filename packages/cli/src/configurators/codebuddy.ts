import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  writeSkills,
  writeAgents,
  writeSharedHooks,
} from "./shared.js";
import {
  getAllAgents,
  getSettingsTemplate,
} from "../templates/codebuddy/index.js";

/**
 * Configure CodeBuddy:
 * - commands/trellis/ — start + finish-work as slash commands
 * - skills/trellis-{name}/SKILL.md — auto-triggered skills from `common/skills/`
 * - agents/{name}.md — sub-agent definitions
 * - hooks/*.py — shared hook scripts
 * - settings.json — hook configuration
 */
export async function configureCodebuddy(cwd: string): Promise<void> {
  const config = AI_TOOLS.codebuddy;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  // Commands
  const commandsDir = path.join(configRoot, "commands", "trellis");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(path.join(commandsDir, `${cmd.name}.md`), cmd.content);
  }

  await writeSkills(
    path.join(configRoot, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
  await writeAgents(path.join(configRoot, "agents"), getAllAgents());
  await writeSharedHooks(path.join(configRoot, "hooks"), "codebuddy");

  const settings = getSettingsTemplate();
  await writeFile(
    path.join(configRoot, settings.targetPath),
    resolvePlaceholders(settings.content),
  );
}
