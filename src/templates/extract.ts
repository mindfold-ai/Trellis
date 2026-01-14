import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TemplateCategory = "scripts" | "markdown" | "commands";

/**
 * Read template content from a .txt file
 * @param category - Template category ('scripts' | 'markdown' | 'commands')
 * @param filename - Template filename (e.g., 'init-developer.sh.txt')
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
 * Helper to read script template
 */
export function readScript(filename: string): string {
  return readTemplate("scripts", filename);
}

/**
 * Helper to read markdown template
 */
export function readMarkdown(filename: string): string {
  return readTemplate("markdown", filename);
}

/**
 * Helper to read command template
 */
export function readCommand(filename: string): string {
  return readTemplate("commands", filename);
}
