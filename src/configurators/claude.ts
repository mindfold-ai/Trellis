import path from "node:path";
import { getCommandTemplates } from "./templates.js";
import { writeFile, ensureDir } from "../utils/file-writer.js";
import { getAllAgents } from "../templates/agents/index.js";
import { getAllHooks, getSettingsTemplate } from "../templates/hooks/index.js";

/**
 * Configure Claude Code with slash commands
 *
 * Claude Code gets the full set of commands including Claude-specific
 * features like skill integration.
 */
export async function configureClaude(cwd: string): Promise<void> {
  const claudeDir = path.join(cwd, ".claude");
  const commandsDir = path.join(claudeDir, "commands");

  // Create directory
  ensureDir(commandsDir);

  // Get command templates for Claude Code (full feature set)
  const templates = getCommandTemplates("claude-code");

  // Write each command file
  for (const [name, content] of Object.entries(templates)) {
    const filePath = path.join(commandsDir, `${name}.md`);
    await writeFile(filePath, content);
  }
}

/**
 * Configure Claude Code agents for Multi-Agent Pipeline
 *
 * Agents are specialized subagents that work together:
 * - implement: Code implementation expert
 * - check: Code and cross-layer check expert
 * - debug: Issue fixing expert
 * - research: Search expert
 * - dispatch: Pipeline dispatcher
 */
export async function configureClaudeAgents(cwd: string): Promise<void> {
  const agentsDir = path.join(cwd, ".claude", "agents");

  // Create directory
  ensureDir(agentsDir);

  // Get all agent templates
  const agents = getAllAgents();

  // Write each agent file
  for (const agent of agents) {
    const filePath = path.join(agentsDir, `${agent.name}.md`);
    await writeFile(filePath, agent.content);
  }
}

/**
 * Configure Claude Code hooks for context injection
 *
 * Hooks automatically inject context into subagent prompts
 * based on the current feature configuration.
 */
export async function configureClaudeHooks(cwd: string): Promise<void> {
  const hooksDir = path.join(cwd, ".claude", "hooks");
  const claudeDir = path.join(cwd, ".claude");

  // Create hooks directory
  ensureDir(hooksDir);

  // Get all hook templates
  const hooks = getAllHooks();

  // Write each hook file
  for (const hook of hooks) {
    const filePath = path.join(claudeDir, hook.targetPath);
    await writeFile(filePath, hook.content);
  }

  // Write settings.json with hook configuration
  const settingsTemplate = getSettingsTemplate();
  const settingsPath = path.join(claudeDir, settingsTemplate.targetPath);
  await writeFile(settingsPath, settingsTemplate.content);
}

/**
 * Configure Claude Code with full Multi-Agent Pipeline support
 *
 * This includes:
 * - Slash commands
 * - Agent configurations
 * - Hook configurations
 */
export async function configureClaudeFull(cwd: string): Promise<void> {
  await configureClaude(cwd);
  await configureClaudeAgents(cwd);
  await configureClaudeHooks(cwd);
}
