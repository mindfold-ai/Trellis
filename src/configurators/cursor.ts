import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getCursorSourcePath } from "../templates/extract.js";

/**
 * Configure Cursor by copying the entire .cursor directory
 *
 * This implements the dogfooding principle - we use our own .cursor/
 * configuration as the template for user projects.
 */
export async function configureCursor(cwd: string): Promise<void> {
  const sourcePath = getCursorSourcePath();
  const destPath = path.join(cwd, ".cursor");

  // Ensure destination directory exists
  mkdirSync(destPath, { recursive: true });

  // Copy entire .cursor directory
  cpSync(sourcePath, destPath, { recursive: true });
}
