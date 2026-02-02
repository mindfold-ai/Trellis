/**
 * OpenCode configurator
 *
 * Configures OpenCode by copying templates from src/templates/opencode/.
 * This uses the dogfooding pattern - the same files used by Trellis project itself.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getOpenCodeTemplatePath } from "../templates/extract.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Files to exclude when copying templates
 * These are build artifacts or platform-specific files
 */
const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js.map",
  "__pycache__",
  "node_modules",
  "bun.lock",
  ".gitignore",
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
      const content = readFileSync(srcPath, "utf-8");
      await writeFile(destPath, content);
    }
  }
}

/**
 * Configure OpenCode by copying from templates
 *
 * The opencode templates include:
 * - commands/ - Slash commands
 * - agents/ - Multi-agent pipeline configurations
 * - plugin/ - Context injection plugins
 * - lib/ - Shared JavaScript utilities
 * - package.json - Plugin dependencies
 */
export async function configureOpenCode(cwd: string): Promise<void> {
  const sourcePath = getOpenCodeTemplatePath();
  const destPath = path.join(cwd, ".opencode");

  // Copy templates, excluding build artifacts
  await copyDirFiltered(sourcePath, destPath);
}

/**
 * Configure OpenCode agents for Multi-Agent Pipeline
 *
 * @deprecated Agents are now included in the main .opencode directory copy.
 * This function is kept for backwards compatibility but does nothing.
 */
export async function configureOpenCodeAgents(_cwd: string): Promise<void> {
  // Agents are now copied as part of configureOpenCode
  // This function is kept for API compatibility
}

/**
 * Configure OpenCode with full Multi-Agent Pipeline support
 *
 * This is now equivalent to just calling configureOpenCode since the entire
 * .opencode directory is copied at once.
 */
export async function configureOpenCodeFull(cwd: string): Promise<void> {
  await configureOpenCode(cwd);
}
