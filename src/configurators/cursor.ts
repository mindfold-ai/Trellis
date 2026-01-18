import { cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getCursorTemplatePath } from "../templates/extract.js";

/**
 * Files to exclude when copying templates
 * These are TypeScript compilation artifacts
 */
const EXCLUDE_PATTERNS = [".d.ts", ".d.ts.map", ".js", ".js.map"];

/**
 * Check if a file should be excluded
 */
function shouldExclude(filename: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (filename.endsWith(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively copy directory, excluding build artifacts
 */
function copyDirFiltered(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    if (shouldExclude(entry)) {
      continue;
    }

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirFiltered(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

/**
 * Configure Cursor by copying from templates
 */
export async function configureCursor(cwd: string): Promise<void> {
  const sourcePath = getCursorTemplatePath();
  const destPath = path.join(cwd, ".cursor");

  // Copy templates, excluding build artifacts
  copyDirFiltered(sourcePath, destPath);
}
