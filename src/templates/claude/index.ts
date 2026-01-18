/**
 * Claude Code templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .claude/ directory (which may be customized).
 *
 * Directory structure:
 *   claude/
 *   ├── commands/       # Slash commands
 *   ├── agents/         # Multi-agent pipeline agents
 *   ├── hooks/          # Context injection hooks
 *   └── settings.json   # Settings configuration
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir));
  } catch {
    return [];
  }
}

// Settings
export const settingsTemplate = readTemplate("settings.json");

/**
 * Command template with name and content
 */
export interface CommandTemplate {
  name: string;
  content: string;
}

/**
 * Agent template with name and content
 */
export interface AgentTemplate {
  name: string;
  content: string;
}

/**
 * Hook template with target path and content
 */
export interface HookTemplate {
  targetPath: string;
  content: string;
}

/**
 * Get all command templates
 */
export function getAllCommands(): CommandTemplate[] {
  const commands: CommandTemplate[] = [];
  const files = listFiles("commands");

  for (const file of files) {
    if (file.endsWith(".md")) {
      const name = file.replace(".md", "");
      const content = readTemplate(`commands/${file}`);
      commands.push({ name, content });
    }
  }

  return commands;
}

/**
 * Get all agent templates
 */
export function getAllAgents(): AgentTemplate[] {
  const agents: AgentTemplate[] = [];
  const files = listFiles("agents");

  for (const file of files) {
    if (file.endsWith(".md")) {
      const name = file.replace(".md", "");
      const content = readTemplate(`agents/${file}`);
      agents.push({ name, content });
    }
  }

  return agents;
}

/**
 * Get all hook templates
 */
export function getAllHooks(): HookTemplate[] {
  const hooks: HookTemplate[] = [];
  const files = listFiles("hooks");

  for (const file of files) {
    const content = readTemplate(`hooks/${file}`);
    hooks.push({ targetPath: `hooks/${file}`, content });
  }

  return hooks;
}

/**
 * Get settings template
 */
export function getSettingsTemplate(): HookTemplate {
  return {
    targetPath: "settings.json",
    content: settingsTemplate,
  };
}
