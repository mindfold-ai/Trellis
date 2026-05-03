import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getClaudeTemplatePath } from "../templates/extract.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  writeSkills,
  writeSharedHooks,
  replacePythonCommandLiterals,
} from "./shared.js";

const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js",
  ".js.map",
  "__pycache__",
];

function shouldExclude(filename: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (filename.endsWith(pattern) || filename === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively copy directory, excluding build artifacts and the commands/ dir
 * (commands are now written from common templates).
 */
async function copyDirFiltered(
  src: string,
  dest: string,
  skipDirs: string[] = [],
): Promise<void> {
  ensureDir(dest);

  for (const entry of readdirSync(src)) {
    if (shouldExclude(entry) || skipDirs.includes(entry)) {
      continue;
    }

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      await copyDirFiltered(srcPath, destPath);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      if (entry === "settings.json") {
        content = resolvePlaceholders(content);
      }
      await writeFile(destPath, replacePythonCommandLiterals(content));
    }
  }
}

/**
 * Configure Claude Code:
 * - agents/, settings.json from platform-specific templates
 * - hooks/ from shared-hooks/ (unified with other platforms)
 * - commands/trellis/ — start + finish-work as slash commands
 * - skills/trellis-{name}/SKILL.md — other 5 as auto-triggered skills
 */
export async function configureClaude(cwd: string): Promise<void> {
  const sourcePath = getClaudeTemplatePath();
  const destPath = path.join(cwd, ".claude");
  const ctx = AI_TOOLS["claude-code"].templateContext;

  // Copy platform-specific files (agents, settings) — hooks come from shared-hooks
  await copyDirFiltered(sourcePath, destPath, ["commands", "hooks"]);

  // Shared hook scripts (same source as 7 other platforms)
  await writeSharedHooks(path.join(destPath, "hooks"), "claude");

  // start + finish-work as slash commands
  const commandsDir = path.join(destPath, "commands", "trellis");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(path.join(commandsDir, `${cmd.name}.md`), cmd.content);
  }

  // Auto-trigger workflow skills + multi-file built-in skills.
  await writeSkills(
    path.join(destPath, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
}
