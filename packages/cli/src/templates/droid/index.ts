/**
 * Droid (Factory.ai) templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use Trellis project's own .factory/ directory (which may be customized).
 *
 * Directory structure:
 *   droid/
 *   └── commands/
 *       └── trellis/    # Slash commands under the trellis namespace
 *
 * Droid scans `.factory/commands/` and supports nested folders, so commands
 * live under `commands/trellis/` to keep them grouped, mirroring Claude Code.
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
 * Get all command templates.
 * Commands are stored in commands/trellis/ subdirectory.
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
