import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getClaudeTemplatePath } from "../templates/extract.js";
import { getStatuslineHook } from "../templates/claude/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  writeSkills,
  writeSharedHooks,
  replacePythonCommandLiterals,
  type PlatformConfigureOptions,
} from "./shared.js";

const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js",
  ".js.map",
  ".ts", // TypeScript source — dev-only; not part of user-shipped templates
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
 * Inject the opt-in `statusLine` block into the settings.json template.
 * Runs BEFORE resolvePlaceholders so `{{PYTHON_CMD}}` resolves through the
 * normal path. The flag-off path never calls this — default output stays
 * byte-identical.
 *
 * Mirrors `preserveExistingClaudeStatusLine` (update.ts) exactly: parse →
 * assign (key lands at the END of the object) → stringify(null, 2) + "\n".
 * Byte-parity matters: `trellis update` re-derives the expected settings.json
 * via that preserve step, so any divergence (e.g. a different key position)
 * makes update flag a phantom settings.json change on every fresh opted-in
 * project.
 */
function injectStatusLine(content: string): string {
  const settings = JSON.parse(content) as Record<string, unknown>;
  settings.statusLine = {
    type: "command",
    command: "{{PYTHON_CMD}} .claude/hooks/statusline.py",
  };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Recursively copy directory, excluding build artifacts and the commands/ dir
 * (commands are now written from common templates).
 */
async function copyDirFiltered(
  src: string,
  dest: string,
  skipDirs: string[] = [],
  withStatusline = false,
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
        if (withStatusline) {
          content = injectStatusLine(content);
        }
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
 * - skills/trellis-{name}/SKILL.md — auto-triggered skills from `common/skills/`
 * - with `withStatusline`: opt-in statusline.py hook + `statusLine` settings
 *   entry (off by default; `trellis init --with-statusline`)
 */
export async function configureClaude(
  cwd: string,
  options?: PlatformConfigureOptions,
): Promise<void> {
  const sourcePath = getClaudeTemplatePath();
  const destPath = path.join(cwd, ".claude");
  const ctx = AI_TOOLS["claude-code"].templateContext;
  const withStatusline = options?.withStatusline === true;

  // Copy platform-specific files (agents, settings) — hooks come from shared-hooks
  await copyDirFiltered(
    sourcePath,
    destPath,
    ["commands", "hooks"],
    withStatusline,
  );

  // Shared hook scripts (same source as 7 other platforms)
  await writeSharedHooks(path.join(destPath, "hooks"), "claude");

  // Opt-in statusLine hook (Claude-only event; not part of shared-hooks and
  // not in collectTemplates, so `trellis update` never force-installs it)
  if (withStatusline) {
    await writeFile(
      path.join(destPath, "hooks", "statusline.py"),
      replacePythonCommandLiterals(getStatuslineHook()),
    );
  }

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
