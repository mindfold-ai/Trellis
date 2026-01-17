import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getClaudeSourcePath } from "../templates/extract.js";

/**
 * Configure Claude Code by copying the entire .claude directory
 *
 * This implements the dogfooding principle - we use our own .claude/
 * configuration as the template for user projects.
 *
 * The .claude directory includes:
 * - commands/ - Slash commands
 * - agents/ - Multi-agent pipeline configurations
 * - hooks/ - Context injection hooks
 * - settings.json - Hook and tool configurations
 */
export async function configureClaude(cwd: string): Promise<void> {
  const sourcePath = getClaudeSourcePath();
  const destPath = path.join(cwd, ".claude");

  // Ensure destination directory exists
  mkdirSync(destPath, { recursive: true });

  // Copy entire .claude directory
  cpSync(sourcePath, destPath, { recursive: true });
}

/**
 * Configure Claude Code agents for Multi-Agent Pipeline
 *
 * @deprecated Agents are now included in the main .claude directory copy.
 * This function is kept for backwards compatibility but does nothing.
 */
export async function configureClaudeAgents(_cwd: string): Promise<void> {
  // Agents are now copied as part of configureClaude
  // This function is kept for API compatibility
}

/**
 * Configure Claude Code hooks for context injection
 *
 * @deprecated Hooks are now included in the main .claude directory copy.
 * This function is kept for backwards compatibility but does nothing.
 */
export async function configureClaudeHooks(_cwd: string): Promise<void> {
  // Hooks are now copied as part of configureClaude
  // This function is kept for API compatibility
}

/**
 * Configure Claude Code with full Multi-Agent Pipeline support
 *
 * This is now equivalent to just calling configureClaude since the entire
 * .claude directory is copied at once.
 */
export async function configureClaudeFull(cwd: string): Promise<void> {
  await configureClaude(cwd);
}
