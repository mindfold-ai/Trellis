/**
 * Command template configurator
 *
 * Provides command templates based on the target AI tool's capabilities.
 * Different AI tools support different features, so we generate
 * appropriate command sets for each.
 */

import type { AITool } from "../types/ai-tools.js";
import {
  getTemplatesForTool,
  getAllTemplates,
  type CommandTemplate,
} from "../templates/commands/index.js";

export type CommandTemplates = Record<string, string>;

/**
 * Get command templates for a specific AI tool
 *
 * @param tool - The AI tool to get templates for (defaults to claude-code for full support)
 * @returns A record of command name to template content
 */
export function getCommandTemplates(
  tool: AITool = "claude-code",
): CommandTemplates {
  const templates = getTemplatesForTool(tool);
  return templatesToRecord(templates);
}

/**
 * Get all command templates regardless of AI tool
 * Useful for tools that support all features
 *
 * @returns A record of all command names to template content
 */
export function getAllCommandTemplates(): CommandTemplates {
  return templatesToRecord(getAllTemplates());
}

/**
 * Get command templates for Claude Code (full feature set)
 */
export function getClaudeCodeTemplates(): CommandTemplates {
  return getCommandTemplates("claude-code");
}

/**
 * Get command templates for Cursor (common features only)
 */
export function getCursorTemplates(): CommandTemplates {
  return getCommandTemplates("cursor");
}

/**
 * Convert CommandTemplate array to CommandTemplates record
 */
function templatesToRecord(templates: CommandTemplate[]): CommandTemplates {
  const result: CommandTemplates = {};
  for (const template of templates) {
    result[template.name] = template.content;
  }
  return result;
}

/**
 * Get the list of available command names for a tool
 */
export function getAvailableCommands(tool: AITool = "claude-code"): string[] {
  return getTemplatesForTool(tool).map((t) => t.name);
}

/**
 * Get command descriptions for a tool (useful for help text)
 */
export function getCommandDescriptions(
  tool: AITool = "claude-code",
): Record<string, string> {
  const templates = getTemplatesForTool(tool);
  const result: Record<string, string> = {};
  for (const template of templates) {
    result[template.name] = template.description;
  }
  return result;
}
