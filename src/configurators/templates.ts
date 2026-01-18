/**
 * Command template configurator
 *
 * Provides command templates based on the target AI tool.
 */

import type { AITool } from "../types/ai-tools.js";
import { getAllCommands as getClaudeCommands } from "../templates/claude/index.js";
import { getAllCommands as getCursorCommands } from "../templates/cursor/index.js";

export type CommandTemplates = Record<string, string>;

/**
 * Get command templates for a specific AI tool
 *
 * @param tool - The AI tool to get templates for
 * @returns A record of command name to template content
 */
export function getCommandTemplates(
  tool: AITool = "claude-code",
): CommandTemplates {
  const result: CommandTemplates = {};

  if (tool === "claude-code") {
    const commands = getClaudeCommands();
    for (const cmd of commands) {
      result[cmd.name] = cmd.content;
    }
  } else if (tool === "cursor") {
    const commands = getCursorCommands();
    for (const cmd of commands) {
      result[cmd.name] = cmd.content;
    }
  }

  return result;
}
