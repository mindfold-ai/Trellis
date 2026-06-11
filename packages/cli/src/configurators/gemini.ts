import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkillsNeutral,
  resolveBundledSkills,
  writeSkills,
  writeAgents,
  writeSharedHooks,
  applyPullBasedPreludeMarkdown,
} from "./shared.js";
import {
  getAllAgents,
  getSettingsTemplate,
} from "../templates/gemini/index.js";

/**
 * Configure Gemini CLI (pull-based class-2 platform):
 * - commands/trellis/ — start + finish-work as TOML slash commands
 * - .agents/skills/trellis-{name}/SKILL.md — auto-triggered shared skills
 *   written to the cross-platform `.agents/skills/` workspace alias (Gemini
 *   CLI 0.40+ reads it natively; previously `.gemini/skills/` was used,
 *   which collided with Codex's identical write target and caused
 *   duplicate-skill warnings — issue #224).
 * - agents/{name}.md — sub-agent definitions, with pull-based prelude
 * - hooks/*.py — session-start only (no inject-subagent-context.py — Gemini
 *   BeforeTool can fire but #18128 limits chain-of-thought visibility; sub-agents
 *   Read jsonl/prd themselves)
 * - settings.json — hook configuration (SessionStart + BeforeAgent)
 */
export async function configureGemini(cwd: string): Promise<void> {
  const config = AI_TOOLS.gemini;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  const commandsDir = path.join(configRoot, "commands", "trellis");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    const toml = `description = "Trellis: ${cmd.name}"\n\nprompt = """\n${cmd.content}\n"""\n`;
    await writeFile(path.join(commandsDir, `${cmd.name}.toml`), toml);
  }

  // Shared skills go to `.agents/skills/` (read by Gemini CLI 0.40+ as a
  // workspace alias), using the neutral placeholder resolver so the rendered
  // SKILL.md files are byte-identical to Codex's writes for the same skills.
  await writeSkills(
    path.join(cwd, ".agents", "skills"),
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  );
  await writeAgents(
    path.join(configRoot, "agents"),
    applyPullBasedPreludeMarkdown(getAllAgents()),
  );
  await writeSharedHooks(path.join(configRoot, "hooks"), "gemini");

  await writeFile(
    path.join(configRoot, "settings.json"),
    resolvePlaceholders(getSettingsTemplate()),
  );
}
