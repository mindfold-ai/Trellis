/**
 * CodeBuddy templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .codebuddy/ directory (which may be customized).
 *
 * Directory structure:
 *   codebuddy/
 *   └── commands/
 *       └── trellis/    # Nested subdirectory for namespace
 *           └── *.md
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir));
  } catch {
    return [];
  }
}

/**
 * Command template with name and content
 */
export interface CommandTemplate {
  name: string;
  content: string;
}

/**
 * Get all command templates
 * CodeBuddy uses nested directories: commands/trellis/<name>.md → /trellis:<name>
 */
export function getAllCommands(): CommandTemplate[] {
  const commands: CommandTemplate[] = [];
  const files = listFiles("commands/trellis");

  for (const file of files) {
    if (file.endsWith(".md")) {
      const name = file.replace(".md", "");
      const content = readTemplate(`commands/trellis/${file}`);
      commands.push({ name, content });
    }
  }

  return commands;
}
