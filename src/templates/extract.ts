import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TemplateCategory = "scripts" | "markdown" | "commands";

/**
 * Get the path to the .trellis directory.
 *
 * This works in both:
 * - Development: reads from project root .trellis/
 * - Installed package: reads from dist/.trellis/
 *
 * The directory structure is:
 * - Development: src/templates/extract.ts -> ../../.trellis
 * - Built: dist/templates/extract.js -> ../.trellis
 */
export function getTrellisSourcePath(): string {
  // In development: __dirname is src/templates
  // In production: __dirname is dist/templates
  // Either way, go up to find .trellis at the package root

  // First, try the production path (dist/templates -> dist/.trellis)
  const prodPath = path.join(__dirname, "..", ".trellis");
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  // Fall back to development path (src/templates -> ../../.trellis)
  const devPath = path.join(__dirname, "..", "..", ".trellis");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  throw new Error(
    "Could not find .trellis directory. Expected at dist/.trellis or project root.",
  );
}

/**
 * Get the path to the .cursor directory.
 *
 * This works in both:
 * - Development: reads from project root .cursor/
 * - Installed package: reads from dist/.cursor/
 *
 * The directory structure is:
 * - Development: src/templates/extract.ts -> ../../.cursor
 * - Built: dist/templates/extract.js -> ../.cursor
 */
export function getCursorSourcePath(): string {
  // First, try the production path (dist/templates -> dist/.cursor)
  const prodPath = path.join(__dirname, "..", ".cursor");
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  // Fall back to development path (src/templates -> ../../.cursor)
  const devPath = path.join(__dirname, "..", "..", ".cursor");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  throw new Error(
    "Could not find .cursor directory. Expected at dist/.cursor or project root.",
  );
}

/**
 * Get the path to the .claude directory.
 *
 * This works in both:
 * - Development: reads from project root .claude/
 * - Installed package: reads from dist/.claude/
 *
 * The directory structure is:
 * - Development: src/templates/extract.ts -> ../../.claude
 * - Built: dist/templates/extract.js -> ../.claude
 */
export function getClaudeSourcePath(): string {
  // First, try the production path (dist/templates -> dist/.claude)
  const prodPath = path.join(__dirname, "..", ".claude");
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  // Fall back to development path (src/templates -> ../../.claude)
  const devPath = path.join(__dirname, "..", "..", ".claude");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  throw new Error(
    "Could not find .claude directory. Expected at dist/.claude or project root.",
  );
}

/**
 * Read a file from the .trellis directory
 * @param relativePath - Path relative to .trellis/ (e.g., 'scripts/feature.sh')
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
 * @param relativePath - Path relative to .trellis/scripts/ (e.g., 'feature.sh')
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
 * Copy a directory from .trellis/ to target, making scripts executable
 * @param srcRelativePath - Source path relative to .trellis/ (e.g., 'scripts')
 * @param destPath - Absolute destination path
 * @param options - Copy options
 */
export function copyTrellisDir(
  srcRelativePath: string,
  destPath: string,
  options?: { executable?: boolean },
): void {
  const trellisPath = getTrellisSourcePath();
  const srcPath = path.join(trellisPath, srcRelativePath);
  copyDirRecursive(srcPath, destPath, options);
}

/**
 * Recursively copy directory with options
 */
function copyDirRecursive(
  src: string,
  dest: string,
  options?: { executable?: boolean },
): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath, options);
    } else {
      fs.copyFileSync(srcPath, destPath);
      // Make shell scripts executable
      if (options?.executable && entry.endsWith(".sh")) {
        fs.chmodSync(destPath, 0o755);
      }
    }
  }
}
