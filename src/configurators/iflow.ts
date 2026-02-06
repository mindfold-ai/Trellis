import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getIflowTemplatePath } from "../templates/extract.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { resolvePlaceholders } from "./shared.js";

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
 * Uses writeFile to handle file conflicts with the global writeMode setting
 */
async function copyDirFiltered(src: string, dest: string): Promise<void> {
  ensureDir(dest);

  for (const entry of readdirSync(src)) {
    if (shouldExclude(entry)) {
      continue;
    }

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      await copyDirFiltered(srcPath, destPath);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      // Replace placeholders in settings.json
      if (entry === "settings.json") {
        content = resolvePlaceholders(content);
      }
      await writeFile(destPath, content);
    }
  }
}

/**
 * Configure iFlow CLI by copying from templates
 *
 * The iflow templates include:
 * - commands/ - Slash commands
 * - agents/ - Multi-agent pipeline configurations
 * - hooks/ - Context injection hooks
 * - settings.json - Hook and tool configurations
 * - AGENTS.md - Agent documentation
 */
export async function configureIflow(cwd: string): Promise<void> {
  const sourcePath = getIflowTemplatePath();
  const destPath = path.join(cwd, ".iflow");

  // Copy templates, excluding build artifacts
  await copyDirFiltered(sourcePath, destPath);
}

/**
 * Configure iFlow CLI agents for Multi-Agent Pipeline
 *
 * @deprecated Agents are now included in the main .iflow directory copy.
 * This function is kept for backwards compatibility but does nothing.
 */
export async function configureIflowAgents(_cwd: string): Promise<void> {
  // Agents are now copied as part of configureIflow
  // This function is kept for API compatibility
}

/**
 * Configure iFlow CLI hooks for context injection
 *
 * @deprecated Hooks are now included in the main .iflow directory copy.
 * This function is kept for backwards compatibility but does nothing.
 */
export async function configureIflowHooks(_cwd: string): Promise<void> {
  // Hooks are now copied as part of configureIflow
  // This function is kept for API compatibility
}

/**
 * Configure iFlow CLI with full Multi-Agent Pipeline support
 *
 * This is now equivalent to just calling configureIflow since the entire
 * .iflow directory is copied at once.
 */
export async function configureIflowFull(cwd: string): Promise<void> {
  await configureIflow(cwd);
}