import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, writeFile } from "../utils/file-writer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TemplateCategory = "scripts" | "markdown" | "commands";

/**
 * Get the path to the trellis templates directory.
 *
 * This reads from src/templates/trellis/ (development) or dist/templates/trellis/ (production).
 * These are GENERIC templates, not the Trellis project's own .trellis/ configuration.
 */
export function getTrellisTemplatePath(): string {
  // Templates are in the same directory as this file
  const templatePath = path.join(__dirname, "trellis");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }

  throw new Error(
    "Could not find trellis templates directory. Expected at templates/trellis/",
  );
}

/**
 * @deprecated Use getTrellisTemplatePath() instead.
 * This function is kept for backwards compatibility but now returns the template path.
 */
export function getTrellisSourcePath(): string {
  return getTrellisTemplatePath();
}

/**
 * Get the path to the cursor templates directory.
 *
 * This reads from src/templates/cursor/ (development) or dist/templates/cursor/ (production).
 * These are GENERIC templates, not the Trellis project's own .cursor/ configuration.
 */
export function getCursorTemplatePath(): string {
  const templatePath = path.join(__dirname, "cursor");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }

  throw new Error(
    "Could not find cursor templates directory. Expected at templates/cursor/",
  );
}

/**
 * @deprecated Use getCursorTemplatePath() instead.
 */
export function getCursorSourcePath(): string {
  return getCursorTemplatePath();
}

/**
 * Get the path to the claude templates directory.
 *
 * This reads from src/templates/claude/ (development) or dist/templates/claude/ (production).
 * These are GENERIC templates, not the Trellis project's own .claude/ configuration.
 */
export function getClaudeTemplatePath(): string {
  const templatePath = path.join(__dirname, "claude");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }

  throw new Error(
    "Could not find claude templates directory. Expected at templates/claude/",
  );
}

/**
 * Get the path to the opencode templates directory.
 *
 * This reads from src/templates/opencode/ (development) or dist/templates/opencode/ (production).
 * These are GENERIC templates, not the Trellis project's own .opencode/ configuration.
 */
export function getOpenCodeTemplatePath(): string {
  const templatePath = path.join(__dirname, "opencode");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }

  throw new Error(
    "Could not find opencode templates directory. Expected at templates/opencode/",
  );
}

/**
 * @deprecated Use getClaudeTemplatePath() instead.
 */
export function getClaudeSourcePath(): string {
  return getClaudeTemplatePath();
}

/**
 * Read a file from the .trellis directory
 * @param relativePath - Path relative to .trellis/ (e.g., 'scripts/task.py')
 * @returns File content as string
 */
export function readTrellisFile(relativePath: string): string {
  const trellisPath = getTrellisSourcePath();
  const filePath = path.join(trellisPath, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Read template content from a .txt file in commands directory
 * @param category - Template category (only 'commands' uses .txt files now)
 * @param filename - Template filename (e.g., 'common/finish-work.txt')
 * @returns File content as string
 */
export function readTemplate(
  category: TemplateCategory,
  filename: string,
): string {
  const templatePath = path.join(__dirname, category, filename);
  return fs.readFileSync(templatePath, "utf-8");
}

/**
 * Helper to read script template from .trellis/scripts/
 * @param relativePath - Path relative to .trellis/scripts/ (e.g., 'task.py')
 */
export function readScript(relativePath: string): string {
  return readTrellisFile(`scripts/${relativePath}`);
}

/**
 * Helper to read markdown template from .trellis/
 * @param relativePath - Path relative to .trellis/ (e.g., 'workflow.md')
 */
export function readMarkdown(relativePath: string): string {
  return readTrellisFile(relativePath);
}

/**
 * Helper to read command template (these still use .txt files in src/templates/commands/)
 */
export function readCommand(filename: string): string {
  return readTemplate("commands", filename);
}

/**
 * Read a file from the .cursor directory (dogfooding)
 * @param relativePath - Path relative to .cursor/ (e.g., 'commands/start.md')
 * @returns File content as string
 */
export function readCursorFile(relativePath: string): string {
  const cursorPath = getCursorSourcePath();
  const filePath = path.join(cursorPath, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Read a file from the .claude directory (dogfooding)
 * @param relativePath - Path relative to .claude/ (e.g., 'commands/start.md')
 * @returns File content as string
 */
export function readClaudeFile(relativePath: string): string {
  const claudePath = getClaudeSourcePath();
  const filePath = path.join(claudePath, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * @deprecated Use getOpenCodeTemplatePath() instead.
 */
export function getOpenCodeSourcePath(): string {
  return getOpenCodeTemplatePath();
}

/**
 * Read a file from the .opencode directory (dogfooding)
 * @param relativePath - Path relative to .opencode/ (e.g., 'commands/start.md')
 * @returns File content as string
 */
export function readOpenCodeFile(relativePath: string): string {
  const opencodePath = getOpenCodeSourcePath();
  const filePath = path.join(opencodePath, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Copy a directory from .trellis/ to target, making scripts executable
 * Uses writeFile to handle file conflicts with the global writeMode setting
 * @param srcRelativePath - Source path relative to .trellis/ (e.g., 'scripts')
 * @param destPath - Absolute destination path
 * @param options - Copy options
 */
export async function copyTrellisDir(
  srcRelativePath: string,
  destPath: string,
  options?: { executable?: boolean },
): Promise<void> {
  const trellisPath = getTrellisSourcePath();
  const srcPath = path.join(trellisPath, srcRelativePath);
  await copyDirRecursive(srcPath, destPath, options);
}

/**
 * Recursively copy directory with options
 * Uses writeFile to handle file conflicts
 */
async function copyDirRecursive(
  src: string,
  dest: string,
  options?: { executable?: boolean },
): Promise<void> {
  ensureDir(dest);

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, options);
    } else {
      const content = fs.readFileSync(srcPath, "utf-8");
      const isExecutable =
        options?.executable && (entry.endsWith(".sh") || entry.endsWith(".py"));
      await writeFile(destPath, content, { executable: isExecutable });
    }
  }
}
