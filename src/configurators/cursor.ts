import path from "node:path";
import { getCommandTemplates } from "./templates.js";
import { writeFile, ensureDir } from "../utils/file-writer.js";

/**
 * Configure Cursor with slash commands
 *
 * Cursor gets only the common commands that don't require
 * Claude-specific features like openskills.
 */
export async function configureCursor(cwd: string): Promise<void> {
  const commandsDir = path.join(cwd, ".cursor", "commands");

  // Create directory
  ensureDir(commandsDir);

  // Get command templates for Cursor (common features only)
  const templates = getCommandTemplates("cursor");

  // Write each command file
  for (const [name, content] of Object.entries(templates)) {
    const filePath = path.join(commandsDir, `${name}.md`);
    await writeFile(filePath, content);
  }
}
