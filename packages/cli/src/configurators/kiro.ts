import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import {
  resolvePlaceholders,
  resolveAllAsSkills,
  resolveBundledSkills,
  writeSkills,
  writeAgents,
  writeSharedHooks,
  applyMethodSkillsPreludeJson,
} from "./shared.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { getAllAgents, getIdeHooks } from "../templates/kiro/index.js";

/**
 * Configure Kiro Code:
 * - skills/trellis-{name}/SKILL.md — all templates as auto-triggered skills
 * - agents/{name}.json — main `trellis` agent (per-turn workflow-state +
 *   session-start hooks) plus 3 sub-agents (agentSpawn → inject-subagent-context)
 * - hooks/*.py — shared hook scripts (referenced by agent JSON / .kiro.hook)
 * - hooks/*.kiro.hook — IDE hook definitions (promptSubmit → inject-workflow-state)
 */
export async function configureKiro(cwd: string): Promise<void> {
  const config = AI_TOOLS.kiro;
  // Kiro configDir is ".kiro/skills" — agents and hooks go under ".kiro/"
  const kiroRoot = path.join(cwd, ".kiro");

  await writeSkills(
    path.join(kiroRoot, "skills"),
    resolveAllAsSkills(config.templateContext),
    resolveBundledSkills(config.templateContext),
  );

  // Agents (JSON format, with {{PYTHON_CMD}} resolved)
  const agents = applyMethodSkillsPreludeJson(getAllAgents()).map((a) => ({
    ...a,
    content: resolvePlaceholders(a.content),
  }));
  await writeAgents(path.join(kiroRoot, "agents"), agents, ".json");

  await writeSharedHooks(path.join(kiroRoot, "hooks"), "kiro");

  // IDE `.kiro.hook` definitions (with {{PYTHON_CMD}} resolved)
  const hooksDir = path.join(kiroRoot, "hooks");
  ensureDir(hooksDir);
  for (const hook of getIdeHooks()) {
    await writeFile(
      path.join(hooksDir, hook.name),
      resolvePlaceholders(hook.content),
    );
  }
}
