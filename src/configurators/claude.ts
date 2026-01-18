import { cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getClaudeTemplatePath } from "../templates/extract.js";

/**
 * Files to exclude when copying templates
 * These are TypeScript compilation artifacts
 */
const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js",
  ".js.map",
  "__pycache__",
];

/**
 * Check if a file should be excluded
 */
function shouldExclude(filename: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (filename.endsWith(pattern) || filename === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively copy directory, excluding build artifacts
 */
function copyDirFiltered(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    if (shouldExclude(entry)) {
      continue;
    }

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirFiltered(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

/**
 * Configure Claude Code by copying from templates
 *
 * The claude templates include:
 * - commands/ - Slash commands
 * - agents/ - Multi-agent pipeline configurations
 * - hooks/ - Context injection hooks
 * - settings.json - Hook and tool configurations
 */
export async function configureClaude(cwd: string): Promise<void> {
  const sourcePath = getClaudeTemplatePath();
  const destPath = path.join(cwd, ".claude");

  // Copy templates, excluding build artifacts
  copyDirFiltered(sourcePath, destPath);
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
