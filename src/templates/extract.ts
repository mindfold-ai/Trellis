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
