import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getDroidTemplatePath } from "../templates/extract.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";

/**
 * Files to exclude when copying templates
 * These are TypeScript compilation artifacts
 */
const EXCLUDE_PATTERNS = [".d.ts", ".d.ts.map", ".js", ".js.map"];

function shouldExclude(filename: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (filename.endsWith(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively copy directory, excluding build artifacts.
 * Uses writeFile so file conflicts honor the global writeMode setting.
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
 * Configure Droid (Factory.ai) by copying templates into .factory/.
 */
export async function configureDroid(cwd: string): Promise<void> {
  const sourcePath = getDroidTemplatePath();
  const destPath = path.join(cwd, ".factory");

  await copyDirFiltered(sourcePath, destPath);
}
