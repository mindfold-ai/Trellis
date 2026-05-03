import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import type { AITool } from "../types/ai-tools.js";
import { VERSION, PACKAGE_NAME } from "../constants/version.js";
import {
  getMigrationsForVersion,
  getAllMigrations,
  getMigrationMetadata,
} from "../migrations/index.js";
import type {
  MigrationItem,
  ClassifiedMigrations,
  MigrationResult,
  MigrationAction,
  TemplateHashes,
} from "../types/migration.js";
import {
  loadHashes,
  saveHashes,
  updateHashes,
  isTemplateModified,
  removeHash,
  renameHash,
  computeHash,
} from "../utils/template-hash.js";
import { compareVersions } from "../utils/compare-versions.js";
import { toPosix } from "../utils/posix.js";
import { setupProxy } from "../utils/proxy.js";
import { emptyTaskJson } from "../utils/task-json.js";

// Import templates for comparison
import {
  getAllScripts,
  // Configuration
  configYamlTemplate,
  gitignoreTemplate,
  workflowMdTemplate,
} from "../templates/trellis/index.js";
import { agentsMdContent } from "../templates/markdown/index.js";

import {
  ALL_MANAGED_DIRS,
  getConfiguredPlatforms,
  collectPlatformTemplates,
  isManagedPath,
  isManagedRootDir,
} from "../configurators/index.js";
import { replacePythonCommandLiterals } from "../configurators/shared.js";

export interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
  allowDowngrade?: boolean;
  migrate?: boolean;
}

interface FileChange {
  path: string;
  relativePath: string;
  newContent: string;
  status: "new" | "unchanged" | "changed";
}

interface ChangeAnalysis {
  newFiles: FileChange[];
  unchangedFiles: FileChange[];
  autoUpdateFiles: FileChange[]; // Template updated, user didn't modify
  changedFiles: FileChange[]; // User modified, needs confirmation
  userDeletedFiles: FileChange[]; // User deleted (hash exists but file missing)
  protectedPaths: string[];
}

type ConflictAction = "overwrite" | "skip" | "create-new";

const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
const TRELLIS_BLOCK_START = "<!-- TRELLIS:START -->";
const TRELLIS_BLOCK_END = "<!-- TRELLIS:END -->";
const LEGACY_UNTRACKED_AGENTS_MD_BLOCK_HASHES = new Set<string>([
  // v0.5.0-beta.17 and earlier wrote AGENTS.md but did not hash-track it.
  // This hash is the pristine Trellis-managed block before the Subagents
  // section was added, so old untouched projects can be updated without a
  // false "modified by you" conflict.
  "c1f511b1cfc1902f2147da159f09cc51f380b0c9e341cdb3ac5dea5233f3e307",
]);

// Paths that should never be touched (true user data)
// spec/ is user-customized content created during init; update should never modify it
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`, // workspace/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`, // tasks/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`, // spec/
  `${DIR_NAMES.WORKFLOW}/.developer`,
  `${DIR_NAMES.WORKFLOW}/.current-task`,
];

function getTrellisManagedBlock(content: string): string | null {
  const start = content.indexOf(TRELLIS_BLOCK_START);
  if (start === -1) {
    return null;
  }

  const end = content.indexOf(TRELLIS_BLOCK_END, start);
  if (end === -1) {
    return null;
  }

  return content.slice(start, end + TRELLIS_BLOCK_END.length);
}

function replaceTrellisManagedBlock(
  existingContent: string,
  templateContent: string,
): string | null {
  const existingStart = existingContent.indexOf(TRELLIS_BLOCK_START);
  if (existingStart === -1) {
    return null;
  }

  const existingEnd = existingContent.indexOf(TRELLIS_BLOCK_END, existingStart);
  if (existingEnd === -1) {
    return null;
  }

  const templateBlock = getTrellisManagedBlock(templateContent);
  if (!templateBlock) {
    return null;
  }

  return (
    existingContent.slice(0, existingStart) +
    templateBlock +
    existingContent.slice(existingEnd + TRELLIS_BLOCK_END.length)
  );
}

/**
 * Workflow-state breadcrumb tag-block replacement (used by buildWorkflowMdTemplate).
 *
 * Each `[workflow-state:STATUS]...[/workflow-state:STATUS]` block in workflow.md
 * is the runtime source of truth for the per-turn breadcrumb that
 * inject-workflow-state.py / .js read on every UserPromptSubmit. The blocks are
 * managed by Trellis: when the CLI ships an updated breadcrumb body, every
 * downstream user project must pick it up (otherwise the per-turn nudge stays
 * silent on new mandatory steps — see Phase 3.4 commit drift / Phase 1.3 jsonl
 * curation drift, the bugs that motivated workflow-state-contract.md).
 *
 * Replacement contract:
 *   - For every status block present in the *template* workflow.md, replace
 *     the user's same-named block with the template version.
 *   - If a block exists in the template but not in the user's file (either the
 *     user removed it, or they're upgrading from a pre-tag version), append
 *     the template block at the end of the file so the runtime hook can find it.
 *   - Everything outside the named blocks (the user's narrative customizations
 *     to the Phase Index, Skill Routing tables, etc.) is preserved verbatim.
 */
const WORKFLOW_STATE_TAG_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g;

function extractWorkflowStateBlocks(content: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of content.matchAll(WORKFLOW_STATE_TAG_RE)) {
    blocks.set(match[1], match[0]);
  }
  return blocks;
}

function replaceWorkflowStateBlock(
  content: string,
  status: string,
  newBlock: string,
): { content: string; replaced: boolean } {
  const re = new RegExp(
    `\\[workflow-state:${status}\\]\\s*\\n[\\s\\S]*?\\n\\s*\\[/workflow-state:${status}\\]`,
  );
  const match = content.match(re);
  if (match?.index === undefined) {
    return { content, replaced: false };
  }
  return {
    content:
      content.slice(0, match.index) +
      newBlock +
      content.slice(match.index + match[0].length),
    replaced: true,
  };
}

function buildWorkflowMdTemplate(cwd: string): string {
  const fullPath = path.join(cwd, DIR_NAMES.WORKFLOW, "workflow.md");
  if (!fs.existsSync(fullPath)) {
    return workflowMdTemplate;
  }

  let existingContent: string;
  try {
    existingContent = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return workflowMdTemplate;
  }

  const templateBlocks = extractWorkflowStateBlocks(workflowMdTemplate);
  if (templateBlocks.size === 0) {
    // Template has no breadcrumb tags — fall back to full overwrite contract.
    return workflowMdTemplate;
  }

  const existingBlocks = extractWorkflowStateBlocks(existingContent);
  let merged = existingContent;
  const appendQueue: string[] = [];
  const customizedOverwritten: string[] = [];
  for (const [status, block] of templateBlocks) {
    const existing = existingBlocks.get(status);
    if (existing && existing !== block) {
      customizedOverwritten.push(status);
    }
    const result = replaceWorkflowStateBlock(merged, status, block);
    if (result.replaced) {
      merged = result.content;
    } else {
      // User's file lacks this tag (older format, or user pruned it). Queue
      // for append so the per-turn hook can find it; runtime degrades to
      // generic "Refer to workflow.md" otherwise.
      appendQueue.push(block);
    }
  }

  if (appendQueue.length > 0) {
    const trimmed = merged.replace(/\s+$/, "");
    merged = `${trimmed}\n\n${appendQueue.join("\n\n")}\n`;
  }

  if (customizedOverwritten.length > 0) {
    // Surface a one-line note so users who customized breadcrumb bodies know
    // their edits were replaced. Same trade-off as the AGENTS.md
    // TRELLIS:START/END managed-block: customizations inside the marked
    // region are owned by the CLI; everything outside is preserved verbatim.
    console.log(
      chalk.yellow(
        `  Note: workflow.md [workflow-state:${customizedOverwritten.join(", ")}] block(s) ` +
          `were updated to the latest CLI version. If you had customized breadcrumb wording, ` +
          `re-apply your edits to the new bodies (content outside [workflow-state:*] tags is preserved).`,
      ),
    );
  }

  return merged;
}

function buildAgentsMdTemplate(cwd: string): string {
  const fullPath = path.join(cwd, FILE_NAMES.AGENTS);
  if (!fs.existsSync(fullPath)) {
    return agentsMdContent;
  }

  const existingContent = fs.readFileSync(fullPath, "utf-8");

  // Existing file already has TRELLIS:START/END markers — replace just the
  // managed block, preserving everything outside it.
  const replaced = replaceTrellisManagedBlock(existingContent, agentsMdContent);
  if (replaced !== null) {
    return replaced;
  }

  // Existing file has no managed-block markers (pre-0.5.0-beta.18 project, or
  // user hand-wrote AGENTS.md without ever running through Trellis). Append
  // the template's managed block at the end so user content is preserved
  // instead of clobbered.
  const templateBlock = getTrellisManagedBlock(agentsMdContent);
  if (!templateBlock) {
    return agentsMdContent;
  }
  const trimmed = existingContent.replace(/\s+$/, "");
  return `${trimmed}\n\n${templateBlock}\n`;
}

function isKnownUntrackedTemplate(
  relativePath: string,
  existingContent: string,
): boolean {
  if (relativePath !== FILE_NAMES.AGENTS) {
    return false;
  }

  const managedBlock = getTrellisManagedBlock(existingContent);
  if (!managedBlock) {
    return false;
  }

  return LEGACY_UNTRACKED_AGENTS_MD_BLOCK_HASHES.has(computeHash(managedBlock));
}

/**
 * Check if a path is blocked by PROTECTED_PATHS
 */
function isProtectedPath(filePath: string): boolean {
  return PROTECTED_PATHS.some(
    (pp) =>
      filePath === pp || filePath.startsWith(pp.endsWith("/") ? pp : pp + "/"),
  );
}

/** Classified safe-file-delete item with reason */
interface SafeFileDeleteClassified {
  item: MigrationItem;
  action:
    | "delete"
    | "skip-missing"
    | "skip-modified"
    | "skip-protected"
    | "skip-update-skip";
}

/**
 * Collect and classify safe-file-delete migrations
 *
 * safe-file-delete auto-executes (no --migrate needed) when:
 * - File exists
 * - Content hash matches allowed_hashes
 * - Path is not protected or in update.skip
 */
function collectSafeFileDeletes(
  migrations: MigrationItem[],
  cwd: string,
  skipPaths: string[],
  /**
   * Bypass `update.skip` for safe-file-delete. Enable this for breaking releases
   * where honoring skip would leave the project half-migrated (old files at
   * protected paths sitting next to the new architecture forever). The hash
   * check in `allowed_hashes` is still the ultimate safety net — user-modified
   * files still stay put with a "skip-modified" warning.
   */
  bypassUpdateSkip = false,
): SafeFileDeleteClassified[] {
  const safeDeletes = migrations.filter((m) => m.type === "safe-file-delete");
  const results: SafeFileDeleteClassified[] = [];

  for (const item of safeDeletes) {
    const fullPath = path.join(cwd, item.from);

    // Check: file exists?
    if (!fs.existsSync(fullPath)) {
      results.push({ item, action: "skip-missing" });
      continue;
    }

    // Check: protected path? (user data dirs — always protected, never bypassed)
    if (isProtectedPath(item.from)) {
      results.push({ item, action: "skip-protected" });
      continue;
    }

    // Check: update.skip? (can be bypassed for breaking releases)
    if (
      !bypassUpdateSkip &&
      skipPaths.some(
        (skip) =>
          item.from === skip ||
          item.from.startsWith(skip.endsWith("/") ? skip : skip + "/"),
      )
    ) {
      results.push({ item, action: "skip-update-skip" });
      continue;
    }

    // Check: hash matches allowed_hashes?
    if (!item.allowed_hashes || item.allowed_hashes.length === 0) {
      // No allowed hashes defined — skip for safety
      results.push({ item, action: "skip-modified" });
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const fileHash = computeHash(content);
      if (item.allowed_hashes.includes(fileHash)) {
        results.push({ item, action: "delete" });
      } else {
        results.push({ item, action: "skip-modified" });
      }
    } catch {
      results.push({ item, action: "skip-missing" });
    }
  }

  return results;
}

/**
 * Print safe-file-delete summary
 */
function printSafeFileDeleteSummary(
  classified: SafeFileDeleteClassified[],
): void {
  const toDelete = classified.filter((c) => c.action === "delete");
  const modified = classified.filter((c) => c.action === "skip-modified");
  const updateSkip = classified.filter((c) => c.action === "skip-update-skip");

  if (
    toDelete.length === 0 &&
    modified.length === 0 &&
    updateSkip.length === 0
  ) {
    return;
  }

  console.log(chalk.cyan("  Deprecated commands cleanup:"));

  if (toDelete.length > 0) {
    for (const c of toDelete) {
      console.log(
        chalk.green(
          `    ✕ ${c.item.from}${c.item.description ? ` (${c.item.description})` : ""}`,
        ),
      );
    }
  }

  if (modified.length > 0) {
    for (const c of modified) {
      console.log(chalk.yellow(`    ? ${c.item.from} (modified, skipped)`));
    }
  }

  if (updateSkip.length > 0) {
    for (const c of updateSkip) {
      console.log(chalk.gray(`    ○ ${c.item.from} (skipped, update.skip)`));
    }
  }

  console.log("");
}

/**
 * Execute safe-file-delete items (delete files + clean up empty dirs)
 */
function executeSafeFileDeletes(
  classified: SafeFileDeleteClassified[],
  cwd: string,
): number {
  const toDelete = classified.filter((c) => c.action === "delete");
  let deleted = 0;

  for (const c of toDelete) {
    const fullPath = path.join(cwd, c.item.from);
    try {
      fs.unlinkSync(fullPath);
      removeHash(cwd, c.item.from);
      cleanupEmptyDirs(cwd, path.dirname(c.item.from));
      deleted++;
    } catch {
      // File may have been removed between classify and execute
    }
  }

  return deleted;
}

/**
 * Load update.skip paths from .trellis/config.yaml
 *
 * Parses simple YAML structure:
 *   update:
 *     skip:
 *       - path1
 *       - path2
 *
 * @internal Exported for testing only
 */
export function loadUpdateSkipPaths(cwd: string): string[] {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const lines = content.split("\n");
    const paths: string[] = [];
    let inUpdate = false;
    let inSkip = false;

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // Check for "update:" section (no indentation or at root level)
      if (/^update:\s*$/.test(trimmed)) {
        inUpdate = true;
        inSkip = false;
        continue;
      }

      // Check for "skip:" under update (indented)
      if (inUpdate && /^\s+skip:\s*$/.test(trimmed)) {
        inSkip = true;
        continue;
      }

      // Collect list items under skip
      if (inSkip) {
        const match = trimmed.match(/^\s+-\s+(.+)$/);
        if (match) {
          paths.push(match[1].trim().replace(/^['"]|['"]$/g, ""));
          continue;
        }
        // If line is non-empty and not a list item, we've left the skip section
        if (trimmed !== "" && !trimmed.startsWith("#")) {
          inSkip = false;
          inUpdate = false;
        }
      }

      // If we're in update but hit a non-indented line, we've left the update section
      if (
        inUpdate &&
        trimmed !== "" &&
        !trimmed.startsWith(" ") &&
        !trimmed.startsWith("#")
      ) {
        inUpdate = false;
        inSkip = false;
      }
    }

    return paths;
  } catch {
    // Config exists but failed to parse — warn user that skip rules won't apply
    console.warn(
      `Warning: failed to parse ${configPath}, update.skip rules will not be applied`,
    );
    return [];
  }
}

/**
 * Collect all template files that should be managed by update
 * Only collects templates for platforms that are already configured (have directories)
 */
/**
 * Detect if legacy Codex upgrade is needed.
 *
 * Old Trellis versions used `.agents/skills/` as codex's configDir.
 * New versions use `.codex/` for Codex-specific config and `.agents/skills/`
 * as a shared layer.
 *
 * Detection: Trellis-tracked hashes contain `.agents/skills/` entries
 * but `.codex/` does not exist. This avoids misclassifying repos that
 * have `.agents/skills/` from other tools (Kimi CLI, Amp, etc.).
 *
 * Returns true if upgrade is needed. Does NOT perform the upgrade —
 * caller should run configurePlatform("codex") after backup/confirm.
 */
function needsCodexUpgrade(cwd: string): boolean {
  if (fs.existsSync(path.join(cwd, ".codex"))) {
    return false;
  }

  const hashes = loadHashes(cwd);
  return Object.keys(hashes).some((key) => key.startsWith(".agents/skills/"));
}

function preserveExistingClaudeStatusLine(
  cwd: string,
  templates: Map<string, string>,
): void {
  const newSettingsContent = templates.get(CLAUDE_SETTINGS_PATH);
  if (!newSettingsContent) return;

  const settingsPath = path.join(cwd, CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(settingsPath)) return;

  try {
    const existingSettings = JSON.parse(
      fs.readFileSync(settingsPath, "utf-8"),
    ) as Record<string, unknown>;

    if (!Object.prototype.hasOwnProperty.call(existingSettings, "statusLine")) {
      return;
    }

    const newSettings = JSON.parse(newSettingsContent) as Record<
      string,
      unknown
    >;

    if (Object.prototype.hasOwnProperty.call(newSettings, "statusLine")) {
      return;
    }

    newSettings.statusLine = existingSettings.statusLine;
    templates.set(
      CLAUDE_SETTINGS_PATH,
      `${JSON.stringify(newSettings, null, 2)}\n`,
    );
  } catch {
    // Invalid local JSON is handled by the normal conflict path.
  }
}

function collectTemplateFiles(
  cwd: string,
  extraPlatforms?: Set<AITool>,
  /**
   * Bypass `update.skip` when collecting templates. Enable this for breaking
   * releases so new files (e.g. `continue.md` added in 0.5.0) and template
   * updates can land even under skip-protected paths. Without this, users with
   * `.claude/commands/` in their skip list would silently miss new commands.
   * Existing user customizations are still guarded at WRITE time via the
   * "Modified by you" conflict prompt — they can skip per-file there.
   */
  bypassUpdateSkip = false,
): Map<string, string> {
  const files = new Map<string, string>();
  const platforms = getConfiguredPlatforms(cwd);
  if (extraPlatforms) {
    for (const p of extraPlatforms) {
      platforms.add(p);
    }
  }

  // Python scripts (single source of truth: getAllScripts())
  for (const [scriptPath, content] of getAllScripts()) {
    files.set(`${PATHS.SCRIPTS}/${scriptPath}`, content);
  }

  // Configuration
  files.set(`${DIR_NAMES.WORKFLOW}/config.yaml`, configYamlTemplate);
  files.set(`${DIR_NAMES.WORKFLOW}/.gitignore`, gitignoreTemplate);
  // workflow.md is included here (starting v0.5.0-beta.4) because it's no longer
  // just user-facing documentation — `## Phase Index`, `## Phase 1/2/3` headings,
  // and `[workflow-state:STATUS]` tag blocks are parsed by get_context.py /
  // shared hooks, so scripts break silently when workflow.md drifts from the
  // CLI version.
  //
  // Starting v0.5.0-rc.0, the breadcrumb tag blocks
  // `[workflow-state:STATUS]...[/workflow-state:STATUS]` are managed via
  // per-block replacement (similar to AGENTS.md's TRELLIS:START/END managed
  // block) so user customizations to the rest of the file (Phase Index,
  // Skill Routing tables, narrative customizations) are preserved while the
  // runtime-critical breadcrumb bodies still pick up CLI updates. Outside
  // the tag blocks the file falls through to the normal "Modified by you"
  // confirm prompt at write time when the user has edited it.
  files.set(`${DIR_NAMES.WORKFLOW}/workflow.md`, buildWorkflowMdTemplate(cwd));
  // workspace/index.md stays excluded — it's runtime-appended by add_session.py
  // (journal index) and has no script-parsed structure.
  files.set(FILE_NAMES.AGENTS, buildAgentsMdTemplate(cwd));

  // Platform-specific templates (only for configured platforms)
  for (const platformId of platforms) {
    const platformFiles = collectPlatformTemplates(platformId);
    if (platformFiles) {
      for (const [filePath, content] of platformFiles) {
        files.set(filePath, content);
      }
    }
  }

  preserveExistingClaudeStatusLine(cwd, files);

  // Apply update.skip from config.yaml (unless bypassed for breaking release)
  if (!bypassUpdateSkip) {
    const skipPaths = loadUpdateSkipPaths(cwd);
    if (skipPaths.length > 0) {
      for (const [filePath] of [...files]) {
        if (
          skipPaths.some(
            (skip) =>
              filePath === skip ||
              filePath.startsWith(skip.endsWith("/") ? skip : skip + "/"),
          )
        ) {
          files.delete(filePath);
        }
      }
    }
  }

  // Apply python3→python replacement for Windows consistency with init-time writes
  for (const [filePath, content] of files) {
    files.set(filePath, replacePythonCommandLiterals(content));
  }

  return files;
}

/**
 * Analyze changes between current files and templates
 *
 * Uses hash tracking to distinguish between:
 * - User didn't modify + template same = skip (unchangedFiles)
 * - User didn't modify + template updated = auto-update (autoUpdateFiles)
 * - User modified = needs confirmation (changedFiles)
 */
function analyzeChanges(
  cwd: string,
  hashes: TemplateHashes,
  templates: Map<string, string>,
): ChangeAnalysis {
  const result: ChangeAnalysis = {
    newFiles: [],
    unchangedFiles: [],
    autoUpdateFiles: [],
    changedFiles: [],
    userDeletedFiles: [],
    protectedPaths: PROTECTED_PATHS,
  };

  for (const [relativePath, newContent] of templates) {
    const fullPath = path.join(cwd, relativePath);
    const exists = fs.existsSync(fullPath);

    const change: FileChange = {
      path: fullPath,
      relativePath,
      newContent,
      status: "new",
    };

    if (!exists) {
      const storedHash = hashes[relativePath];
      if (storedHash) {
        // Previously installed but user deleted — respect deletion
        result.userDeletedFiles.push(change);
      } else {
        change.status = "new";
        result.newFiles.push(change);
      }
    } else {
      const existingContent = fs.readFileSync(fullPath, "utf-8");
      if (existingContent === newContent) {
        // Content same as template - already up to date
        change.status = "unchanged";
        result.unchangedFiles.push(change);
      } else {
        // Content differs - check if user modified or template updated
        const storedHash = hashes[relativePath];
        const currentHash = computeHash(existingContent);

        if (
          (storedHash && storedHash === currentHash) ||
          (!storedHash &&
            isKnownUntrackedTemplate(relativePath, existingContent))
        ) {
          // Either the tracked hash matches, or this is a known pristine template
          // from before the path was hash-tracked. Safe to auto-update.
          change.status = "changed";
          result.autoUpdateFiles.push(change);
        } else {
          // Hash differs (or no stored hash) - user modified the file
          // Needs confirmation
          change.status = "changed";
          result.changedFiles.push(change);
        }
      }
    }
  }

  return result;
}

function collectMissingAgentsMdHash(
  changes: ChangeAnalysis,
  hashes: TemplateHashes,
): Map<string, string> {
  const files = new Map<string, string>();

  for (const file of changes.unchangedFiles) {
    if (file.relativePath === FILE_NAMES.AGENTS && !hashes[file.relativePath]) {
      files.set(file.relativePath, file.newContent);
    }
  }

  return files;
}

/**
 * Print change summary
 */
function printChangeSummary(changes: ChangeAnalysis): void {
  console.log("\nScanning for changes...\n");

  if (changes.newFiles.length > 0) {
    console.log(chalk.green("  New files (will add):"));
    for (const file of changes.newFiles) {
      console.log(chalk.green(`    + ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.cyan("  Template updated (will auto-update):"));
    for (const file of changes.autoUpdateFiles) {
      console.log(chalk.cyan(`    ↑ ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.unchangedFiles.length > 0) {
    console.log(chalk.gray("  Unchanged files (will skip):"));
    for (const file of changes.unchangedFiles.slice(0, 5)) {
      console.log(chalk.gray(`    ○ ${file.relativePath}`));
    }
    if (changes.unchangedFiles.length > 5) {
      console.log(
        chalk.gray(`    ... and ${changes.unchangedFiles.length - 5} more`),
      );
    }
    console.log("");
  }

  if (changes.changedFiles.length > 0) {
    console.log(chalk.yellow("  Modified by you (need your decision):"));
    for (const file of changes.changedFiles) {
      console.log(chalk.yellow(`    ? ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.userDeletedFiles.length > 0) {
    console.log(chalk.gray("  Deleted by you (preserved):"));
    for (const file of changes.userDeletedFiles) {
      console.log(chalk.gray(`    \u2715 ${file.relativePath}`));
    }
    console.log("");
  }

  // Only show protected paths that actually exist
  const existingProtectedPaths = changes.protectedPaths.filter((p) => {
    const fullPath = path.join(process.cwd(), p);
    return fs.existsSync(fullPath);
  });

  if (existingProtectedPaths.length > 0) {
    console.log(chalk.gray("  User data (preserved):"));
    for (const protectedPath of existingProtectedPaths) {
      console.log(chalk.gray(`    ○ ${protectedPath}/`));
    }
    console.log("");
  }
}

/**
 * Prompt user for conflict resolution
 */
async function promptConflictResolution(
  file: FileChange,
  options: UpdateOptions,
  applyToAll: { action: ConflictAction | null },
): Promise<ConflictAction> {
  // If we have a batch action, use it
  if (applyToAll.action) {
    return applyToAll.action;
  }

  // Check command-line options
  if (options.force) {
    return "overwrite";
  }
  if (options.skipAll) {
    return "skip";
  }
  if (options.createNew) {
    return "create-new";
  }

  // Interactive prompt
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "list",
      name: "action",
      message: `${file.relativePath} has changes.`,
      choices: [
        {
          name: "[1] Overwrite - Replace with new version",
          value: "overwrite",
        },
        { name: "[2] Skip - Keep your current version", value: "skip" },
        {
          name: "[3] Create copy - Save new version as .new",
          value: "create-new",
        },
        { name: "[a] Apply Overwrite to all", value: "overwrite-all" },
        { name: "[s] Apply Skip to all", value: "skip-all" },
        { name: "[n] Apply Create copy to all", value: "create-new-all" },
      ],
      default: "skip",
    },
  ]);

  if (action === "overwrite-all") {
    applyToAll.action = "overwrite";
    return "overwrite";
  }
  if (action === "skip-all") {
    applyToAll.action = "skip";
    return "skip";
  }
  if (action === "create-new-all") {
    applyToAll.action = "create-new";
    return "create-new";
  }

  return action as ConflictAction;
}

/**
 * Create a timestamped backup directory path
 */
function createBackupDirPath(cwd: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(cwd, DIR_NAMES.WORKFLOW, `.backup-${timestamp}`);
}

/**
 * Backup a single file to the backup directory
 */
function backupFile(
  cwd: string,
  backupDir: string,
  relativePath: string,
): void {
  const srcPath = path.join(cwd, relativePath);
  if (!fs.existsSync(srcPath)) return;

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(srcPath, backupPath);
}

/**
 * Directories to backup as complete snapshot (derived from platform registry)
 */
const BACKUP_DIRS = ALL_MANAGED_DIRS;

/** Root-level managed files to include in update backups. */
const BACKUP_FILES = [FILE_NAMES.AGENTS] as const;

/**
 * Patterns to exclude from backup (user data that shouldn't be backed up)
 */
const BACKUP_EXCLUDE_PATTERNS = [
  ".backup-", // Previous backups
  "/node_modules", // Installed dependencies; restore via package manager
  "/workspace/", // Developer workspace (user data)
  "/tasks/", // Task data (user data)
  "/spec/", // Spec files (user-customized content)
  "/backlog/", // Backlog data (user data)
  "/agent-traces/", // Agent traces (user data, legacy name)
  // Platform-native worktree dirs — these are full sub-repos the CLI
  // spawns for parallel sessions. Backing them up on every update would
  // snapshot the entire nested working tree. Confirmed conventions:
  //   Claude Code: .claude/worktrees/
  //   Cursor CLI:  .cursor/worktrees/
  //   Gemini CLI:  .gemini/worktrees/
  // Matches any platform using the same convention (future-proof).
  "/worktrees/",
  "/worktree/",
];

/**
 * Check if a path should be excluded from backup
 * @internal Exported for testing only
 */
export function shouldExcludeFromBackup(relativePath: string): boolean {
  // Normalize Windows backslashes to forward slashes so patterns like
  // "/worktrees/" / "/tasks/" match regardless of host OS. Without this,
  // Windows `path.relative` returns `.claude\worktrees\...` and none of
  // the slash-prefixed exclude patterns trigger — which causes
  // `collectAllFiles` to descend into platform worktrees (full nested
  // project copies) and explode the scan. Same normalization pattern
  // used by `isManagedPath` in configurators/index.ts.
  const normalized = relativePath.replace(/\\/g, "/");
  for (const pattern of BACKUP_EXCLUDE_PATTERNS) {
    if (normalized.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Create complete snapshot backup of all managed directories
 * Backs up all managed platform/workflow directories entirely
 * (excluding user data like workspace/, tasks/, backlog/)
 */
function createFullBackup(cwd: string): string | null {
  const backupDir = createBackupDirPath(cwd);
  let hasFiles = false;

  for (const dir of BACKUP_DIRS) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = collectAllFiles(dirPath, cwd);
    for (const fullPath of files) {
      const relativePath = path.relative(cwd, fullPath);

      // Skip excluded paths
      if (shouldExcludeFromBackup(relativePath)) continue;

      // Create backup
      if (!hasFiles) {
        fs.mkdirSync(backupDir, { recursive: true });
        hasFiles = true;
      }
      backupFile(cwd, backupDir, relativePath);
    }
  }

  for (const relativePath of BACKUP_FILES) {
    const fullPath = path.join(cwd, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    if (shouldExcludeFromBackup(relativePath)) continue;

    if (!hasFiles) {
      fs.mkdirSync(backupDir, { recursive: true });
      hasFiles = true;
    }
    backupFile(cwd, backupDir, relativePath);
  }

  return hasFiles ? backupDir : null;
}

/**
 * Update version file
 */
function updateVersionFile(cwd: string): void {
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  fs.writeFileSync(versionPath, VERSION);
}

/**
 * Get current installed version
 */
function getInstalledVersion(cwd: string): string {
  const versionPath = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");
  if (fs.existsSync(versionPath)) {
    return fs.readFileSync(versionPath, "utf-8").trim();
  }
  return "unknown";
}

/**
 * Fetch latest version from npm registry
 */
async function getLatestNpmVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Recursively collect all files in a directory
 */
function collectAllFiles(dirPath: string, cwd = process.cwd()): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const files: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(cwd, fullPath);

      // Never follow symlinks / Windows directory junctions — a junction
      // pointing at an ancestor would loop the scan forever. Node's
      // `isSymbolicLink()` returns true for NTFS junctions since v12.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (!shouldExcludeFromBackup(relativePath)) {
          stack.push(fullPath);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Check if a directory only contains unmodified template files
 * Returns true if safe to delete:
 * - All files are tracked and unmodified, OR
 * - All files match current template content (even if not tracked)
 */
function isDirectorySafeToReplace(
  cwd: string,
  dirRelativePath: string,
  hashes: TemplateHashes,
  templates: Map<string, string>,
): boolean {
  const dirFullPath = path.join(cwd, dirRelativePath);
  if (!fs.existsSync(dirFullPath)) return true;

  const files = collectAllFiles(dirFullPath, cwd);
  if (files.length === 0) return true; // Empty directory is safe

  for (const fullPath of files) {
    // POSIX-normalize: hashes/templates keys are persisted as POSIX, but
    // `path.relative` returns OS-native separators (backslash on Windows).
    const relativePath = toPosix(path.relative(cwd, fullPath));
    const storedHash = hashes[relativePath];
    const templateContent = templates.get(relativePath);

    // Check if file matches template content (handles untracked files)
    if (templateContent) {
      const currentContent = fs.readFileSync(fullPath, "utf-8");
      if (currentContent === templateContent) {
        // File matches template - safe
        continue;
      }
    }

    // Check if file is tracked and unmodified
    if (storedHash && !isTemplateModified(cwd, relativePath, hashes)) {
      // Tracked and unmodified - safe
      continue;
    }

    // File is either user-created or user-modified - not safe
    return false;
  }

  return true;
}

/**
 * Recursively delete a directory
 */
function removeDirectoryRecursive(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Check if a file is safe to overwrite (matches template content)
 */
function isFileSafeToReplace(
  cwd: string,
  relativePath: string,
  templates: Map<string, string>,
): boolean {
  const fullPath = path.join(cwd, relativePath);
  if (!fs.existsSync(fullPath)) return true;

  const templateContent = templates.get(relativePath);
  if (!templateContent) return false; // Not a template file

  const currentContent = fs.readFileSync(fullPath, "utf-8");
  return currentContent === templateContent;
}

/**
 * Classify migrations based on file state and user modifications
 */
function classifyMigrations(
  migrations: MigrationItem[],
  cwd: string,
  hashes: TemplateHashes,
  templates: Map<string, string>,
): ClassifiedMigrations {
  const result: ClassifiedMigrations = {
    auto: [],
    confirm: [],
    conflict: [],
    skip: [],
  };

  for (const item of migrations) {
    // safe-file-delete handled separately (not via --migrate)
    if (item.type === "safe-file-delete") continue;

    // Enforce PROTECTED_PATHS — never migrate FROM protected paths (prevents moving/deleting user data)
    if (isProtectedPath(item.from)) {
      result.skip.push(item);
      continue;
    }
    // For non-rename types, also block writing TO protected paths
    // rename/rename-dir are allowed to target protected paths (e.g., 0.2.0 renames into .trellis/workspace)
    if (
      item.to &&
      isProtectedPath(item.to) &&
      item.type !== "rename" &&
      item.type !== "rename-dir"
    ) {
      result.skip.push(item);
      continue;
    }

    const oldPath = path.join(cwd, item.from);
    const oldExists = fs.existsSync(oldPath);

    if (!oldExists) {
      // Old file doesn't exist, nothing to migrate
      result.skip.push(item);
      continue;
    }

    if (item.type === "rename" && item.to) {
      const newPath = path.join(cwd, item.to);
      const newExists = fs.existsSync(newPath);

      if (newExists) {
        // Both exist - check if new file matches template (safe to overwrite)
        if (isFileSafeToReplace(cwd, item.to, templates)) {
          // New file is just template content - safe to delete and rename
          result.auto.push(item);
        } else {
          // New file has user content - conflict
          result.conflict.push(item);
        }
      } else if (isTemplateModified(cwd, item.from, hashes)) {
        // User has modified the file - needs confirmation
        result.confirm.push(item);
      } else {
        // Unmodified template - safe to auto-migrate
        result.auto.push(item);
      }
    } else if (item.type === "rename-dir" && item.to) {
      const newPath = path.join(cwd, item.to);
      const newExists = fs.existsSync(newPath);

      if (newExists) {
        // Target exists - check if it only contains unmodified template files
        if (isDirectorySafeToReplace(cwd, item.to, hashes, templates)) {
          // Safe to delete target and rename source
          result.auto.push(item);
        } else {
          // Target has user modifications - conflict
          result.conflict.push(item);
        }
      } else {
        // Directory rename - always auto (includes user files)
        result.auto.push(item);
      }
    } else if (item.type === "delete") {
      if (isTemplateModified(cwd, item.from, hashes)) {
        // User has modified - needs confirmation before delete
        result.confirm.push(item);
      } else {
        // Unmodified - safe to auto-delete
        result.auto.push(item);
      }
    }
  }

  return result;
}

/**
 * Print migration summary
 */
function printMigrationSummary(classified: ClassifiedMigrations): void {
  const total =
    classified.auto.length +
    classified.confirm.length +
    classified.conflict.length +
    classified.skip.length;

  if (total === 0) {
    console.log(chalk.gray("  No migrations to apply.\n"));
    return;
  }

  if (classified.auto.length > 0) {
    console.log(chalk.green("  ✓ Auto-migrate (unmodified):"));
    for (const item of classified.auto) {
      if (item.type === "rename") {
        console.log(chalk.green(`    ${item.from} → ${item.to}`));
      } else if (item.type === "rename-dir") {
        console.log(chalk.green(`    [dir] ${item.from}/ → ${item.to}/`));
      } else {
        console.log(chalk.green(`    ✕ ${item.from}`));
      }
    }
    console.log("");
  }

  if (classified.confirm.length > 0) {
    console.log(chalk.yellow("  ⚠ Requires confirmation (modified by user):"));
    for (const item of classified.confirm) {
      if (item.type === "rename") {
        console.log(chalk.yellow(`    ${item.from} → ${item.to}`));
      } else {
        console.log(chalk.yellow(`    ✕ ${item.from}`));
      }
    }
    console.log("");
  }

  if (classified.conflict.length > 0) {
    console.log(chalk.red("  ⊘ Conflict (both old and new exist):"));
    for (const item of classified.conflict) {
      if (item.type === "rename-dir") {
        console.log(chalk.red(`    [dir] ${item.from}/ ↔ ${item.to}/`));
      } else {
        console.log(chalk.red(`    ${item.from} ↔ ${item.to}`));
      }
    }
    console.log(
      chalk.gray(
        "    → Resolve manually: merge or delete one, then re-run update",
      ),
    );
    console.log("");
  }

  if (classified.skip.length > 0) {
    console.log(chalk.gray("  ○ Skipping (old file not found):"));
    for (const item of classified.skip.slice(0, 3)) {
      console.log(chalk.gray(`    ${item.from}`));
    }
    if (classified.skip.length > 3) {
      console.log(chalk.gray(`    ... and ${classified.skip.length - 3} more`));
    }
    console.log("");
  }
}

/**
 * Prompt user for migration action on a single item.
 *
 * Design notes:
 * - Default is `backup-rename`: safest — preserves user's content as a .backup
 *   alongside the rename, so Enter-to-continue never destroys work or leaves
 *   stale paths behind.
 * - "Skip" leaves a stale old path that won't be cleaned by later updates —
 *   warn explicitly so users understand the consequence.
 * - Show manifest description + why-flagged so users can make an informed
 *   choice without needing to dig through the diff.
 */
async function promptMigrationAction(
  item: MigrationItem,
): Promise<MigrationAction> {
  const headline =
    item.type === "rename"
      ? `${chalk.cyan(item.from)} → ${chalk.green(item.to)}`
      : `${chalk.red("Delete")} ${chalk.cyan(item.from)}`;

  const description =
    item.description ?? "No description provided in manifest.";

  // Actions with inline guidance so users see the trade-off per choice.
  const renameLabel =
    item.type === "rename"
      ? "[r] Rename anyway — use if the file is unchanged, or any edits are fine to move as-is"
      : "[d] Delete anyway — use if you don't need this file (already migrated to replacement)";
  const backupLabel =
    item.type === "rename"
      ? "[b] Backup original, then proceed — SAFEST: writes <new-path>.backup with your current content, then renames"
      : "[b] Backup original, then proceed — SAFEST: writes <path>.backup with your current content, then deletes";
  const skipLabel =
    item.type === "rename"
      ? "[s] Skip — leaves the old path in place (you'll see it flagged on future updates until cleaned up manually)"
      : "[s] Skip — keeps the deprecated file (you'll see it flagged on future updates until cleaned up manually)";

  // Prefer the per-migration `reason` (version-specific context authored in the
  // manifest) over a generic fallback. Hardcoding version-specific hints here
  // rots fast — every release gets a new set of edge cases.
  const whyFlagged = item.reason
    ? chalk.gray(
        item.reason
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
      )
    : chalk.gray(
        `  Why prompted: file content doesn't match the Trellis template hash\n` +
          `  for this path — usually local customization. If unsure, pick [b].`,
      );

  const message = [
    headline,
    "",
    chalk.bold("  What:") + " " + description,
    whyFlagged,
    "",
    chalk.bold("  Choose:"),
  ].join("\n");

  const { choice } = await inquirer.prompt<{ choice: MigrationAction }>([
    {
      type: "list",
      name: "choice",
      message,
      choices: [
        { name: backupLabel, value: "backup-rename" as MigrationAction },
        { name: renameLabel, value: "rename" as MigrationAction },
        { name: skipLabel, value: "skip" as MigrationAction },
      ],
      default: "backup-rename",
    },
  ]);

  return choice;
}

/**
 * Clean up empty directories after file migration
 * Recursively removes empty parent directories up to .trellis root
 */
/** @internal Exported for testing only */
export function cleanupEmptyDirs(cwd: string, dirPath: string): void {
  const fullPath = path.join(cwd, dirPath);

  // Safety: don't delete outside of managed directories
  if (!isManagedPath(dirPath)) {
    return;
  }

  // Safety: never delete managed root directories themselves (e.g., .claude, .trellis)
  if (isManagedRootDir(dirPath)) {
    return;
  }

  // Check if directory exists and is empty
  if (!fs.existsSync(fullPath)) return;

  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) return;

    const contents = fs.readdirSync(fullPath);
    if (contents.length === 0) {
      fs.rmdirSync(fullPath);
      // Recursively check parent (but stop at root directories)
      const parent = path.dirname(dirPath);
      if (parent !== "." && parent !== dirPath && !isManagedRootDir(parent)) {
        cleanupEmptyDirs(cwd, parent);
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }
}

/**
 * Sort migrations for safe execution order
 * - rename-dir with deeper paths first (to handle nested directories)
 * - rename-dir before rename/delete
 */
/** @internal Exported for testing only */
export function sortMigrationsForExecution(
  migrations: MigrationItem[],
): MigrationItem[] {
  return [...migrations].sort((a, b) => {
    // rename-dir should be sorted by path depth (deeper first)
    if (a.type === "rename-dir" && b.type === "rename-dir") {
      const aDepth = a.from.split("/").length;
      const bDepth = b.from.split("/").length;
      return bDepth - aDepth; // Deeper paths first
    }
    // rename-dir before rename/delete (directories first)
    if (a.type === "rename-dir" && b.type !== "rename-dir") return -1;
    if (a.type !== "rename-dir" && b.type === "rename-dir") return 1;
    return 0;
  });
}

/**
 * Execute classified migrations
 *
 * @param options.force - Force migrate modified files without asking
 * @param options.skipAll - Skip all modified files without asking
 * If neither is set, prompts interactively for modified files
 */
async function executeMigrations(
  classified: ClassifiedMigrations,
  cwd: string,
  options: { force?: boolean; skipAll?: boolean },
): Promise<MigrationResult> {
  const result: MigrationResult = {
    renamed: 0,
    deleted: 0,
    skipped: 0,
    conflicts: classified.conflict.length,
  };

  // Sort migrations for safe execution order
  const sortedAuto = sortMigrationsForExecution(classified.auto);

  // 1. Execute auto migrations (unmodified files and directories)
  for (const item of sortedAuto) {
    if (item.type === "rename" && item.to) {
      const oldPath = path.join(cwd, item.from);
      const newPath = path.join(cwd, item.to);

      // Ensure target directory exists
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.renameSync(oldPath, newPath);

      // Update hash tracking
      renameHash(cwd, item.from, item.to);

      // Make executable if it's a script
      if (item.to.endsWith(".sh") || item.to.endsWith(".py")) {
        fs.chmodSync(newPath, "755");
      }

      // Clean up empty source directory
      cleanupEmptyDirs(cwd, path.dirname(item.from));

      result.renamed++;
    } else if (item.type === "rename-dir" && item.to) {
      const oldPath = path.join(cwd, item.from);
      const newPath = path.join(cwd, item.to);

      // If target exists (safe to replace, already checked in classification)
      // delete it first before renaming
      if (fs.existsSync(newPath)) {
        removeDirectoryRecursive(newPath);
      }

      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(newPath), { recursive: true });

      // Rename the entire directory (includes all user files)
      fs.renameSync(oldPath, newPath);

      // Batch update hash tracking for all files in the directory
      const hashes = loadHashes(cwd);
      const oldPrefix = item.from.endsWith("/") ? item.from : item.from + "/";
      const newPrefix = item.to.endsWith("/") ? item.to : item.to + "/";

      const updatedHashes: TemplateHashes = {};
      for (const [hashPath, hashValue] of Object.entries(hashes)) {
        if (hashPath.startsWith(oldPrefix)) {
          // Rename path: old prefix -> new prefix
          const newHashPath = newPrefix + hashPath.slice(oldPrefix.length);
          updatedHashes[newHashPath] = hashValue;
        } else if (hashPath.startsWith(newPrefix)) {
          // Skip old hashes from deleted target directory
          // (they will be replaced by renamed source files)
          continue;
        } else {
          // Keep unchanged
          updatedHashes[hashPath] = hashValue;
        }
      }
      saveHashes(cwd, updatedHashes);

      result.renamed++;
    } else if (item.type === "delete") {
      const filePath = path.join(cwd, item.from);
      fs.unlinkSync(filePath);

      // Remove from hash tracking
      removeHash(cwd, item.from);

      // Clean up empty directory
      cleanupEmptyDirs(cwd, path.dirname(item.from));

      result.deleted++;
    }
  }

  // 2. Handle confirm items (modified files)
  // Note: All files are already backed up by createMigrationBackup before execution
  for (const item of classified.confirm) {
    let action: MigrationAction;

    if (options.force) {
      // Force mode: proceed (already backed up)
      action = "rename";
    } else if (options.skipAll) {
      // Skip mode: skip all modified files
      action = "skip";
    } else {
      // Default: interactive prompt
      action = await promptMigrationAction(item);
    }

    if (action === "skip") {
      result.skipped++;
      continue;
    }

    // For `backup-rename`, leave an inline .backup copy of the user's modified
    // original next to the new location (for rename) or in place (for delete).
    // This is in addition to the full project snapshot at .trellis/.backup-*/;
    // the inline copy is more discoverable when the user wants to diff or merge
    // their customizations against the new template.
    if (item.type === "rename" && item.to) {
      const oldPath = path.join(cwd, item.from);
      const newPath = path.join(cwd, item.to);

      fs.mkdirSync(path.dirname(newPath), { recursive: true });

      if (action === "backup-rename") {
        // Copy original alongside the new path before the rename overwrites nothing
        // (target dir is guaranteed fresh since `conflict` is handled elsewhere).
        fs.copyFileSync(oldPath, newPath + ".backup");
      }

      fs.renameSync(oldPath, newPath);
      renameHash(cwd, item.from, item.to);

      if (item.to.endsWith(".sh") || item.to.endsWith(".py")) {
        fs.chmodSync(newPath, "755");
      }

      // Clean up empty source directory
      cleanupEmptyDirs(cwd, path.dirname(item.from));

      result.renamed++;
    } else if (item.type === "delete") {
      const filePath = path.join(cwd, item.from);

      if (action === "backup-rename") {
        // Keep a .backup copy in place before deletion so the user can recover
        // inline without digging through .trellis/.backup-*/.
        fs.copyFileSync(filePath, filePath + ".backup");
      }

      fs.unlinkSync(filePath);
      removeHash(cwd, item.from);

      // Clean up empty directory
      cleanupEmptyDirs(cwd, path.dirname(item.from));

      result.deleted++;
    }
  }

  // 3. Skip count already tracked (old files not found)
  result.skipped += classified.skip.length;

  return result;
}

/**
 * Print migration result summary
 */
function printMigrationResult(result: MigrationResult): void {
  const parts: string[] = [];

  if (result.renamed > 0) {
    parts.push(`${result.renamed} renamed`);
  }
  if (result.deleted > 0) {
    parts.push(`${result.deleted} deleted`);
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} skipped`);
  }
  if (result.conflicts > 0) {
    parts.push(
      `${result.conflicts} conflict${result.conflicts > 1 ? "s" : ""}`,
    );
  }

  if (parts.length > 0) {
    console.log(chalk.cyan(`Migration complete: ${parts.join(", ")}`));
  }
}

/**
 * Main update command
 */
export async function update(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();

  // Check if Trellis is initialized
  if (!fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW))) {
    console.log(chalk.red("Error: Trellis not initialized in this directory."));
    console.log(chalk.gray("Run 'trellis init' first."));
    return;
  }

  console.log(chalk.cyan("\nTrellis Update"));
  console.log(chalk.cyan("══════════════\n"));

  // Set up proxy before any network calls (npm version check)
  setupProxy();

  // Get versions
  const projectVersion = getInstalledVersion(cwd);
  const cliVersion = VERSION;
  const latestNpmVersion = await getLatestNpmVersion();

  // Version comparison
  const cliVsProject = compareVersions(cliVersion, projectVersion);
  const cliVsNpm = latestNpmVersion
    ? compareVersions(cliVersion, latestNpmVersion)
    : 0;

  // Display versions with context
  console.log(`Project version: ${chalk.white(projectVersion)}`);
  console.log(`CLI version:     ${chalk.white(cliVersion)}`);
  if (latestNpmVersion) {
    console.log(`Latest on npm:   ${chalk.white(latestNpmVersion)}`);
  } else {
    console.log(chalk.gray("Latest on npm:   (unable to fetch)"));
  }
  console.log("");

  // Check if CLI is outdated compared to npm
  if (cliVsNpm < 0 && latestNpmVersion) {
    console.log(
      chalk.yellow(
        `⚠️  Your CLI (${cliVersion}) is behind npm (${latestNpmVersion}).`,
      ),
    );
    console.log(chalk.yellow(`   Run: npm install -g ${PACKAGE_NAME}\n`));
  }

  // Check for downgrade situation
  if (cliVsProject < 0) {
    console.log(
      chalk.red(
        `❌ Cannot update: CLI version (${cliVersion}) < project version (${projectVersion})`,
      ),
    );
    console.log(chalk.red(`   This would DOWNGRADE your project!\n`));

    if (!options.allowDowngrade) {
      console.log(chalk.gray("Solutions:"));
      console.log(
        chalk.gray(`  1. Update your CLI: npm install -g ${PACKAGE_NAME}`),
      );
      console.log(
        chalk.gray(`  2. Force downgrade: trellis update --allow-downgrade\n`),
      );
      return;
    }

    console.log(
      chalk.yellow(
        "⚠️  --allow-downgrade flag set. Proceeding with downgrade...\n",
      ),
    );
  }

  // Migration metadata is displayed at the end to prevent scrolling off screen

  // Load template hashes for modification detection
  const hashes = loadHashes(cwd);
  const isFirstHashTracking = Object.keys(hashes).length === 0;

  // Handle unknown version - skip regular migrations but safe-file-delete still runs
  const isUnknownVersion = projectVersion === "unknown";
  if (isUnknownVersion) {
    console.log(
      chalk.yellow(
        "⚠️  No version file found. Skipping migrations — run trellis init to fix.",
      ),
    );
    console.log(chalk.gray("   Template updates will still be applied."));
    console.log(
      chalk.gray("   Safe file cleanup will still run (hash-verified).\n"),
    );
  }

  // Detect legacy Codex (has .agents/skills/ tracked by Trellis but no .codex/)
  const codexUpgradeNeeded = needsCodexUpgrade(cwd);
  if (codexUpgradeNeeded) {
    console.log(
      chalk.yellow(
        "  Legacy Codex detected: .agents/skills/ tracked without .codex/ — will create .codex/ directory",
      ),
    );
  }

  // For breaking releases with recommendMigrate + --migrate, bypass update.skip
  // across the board (safe-file-delete, new file writes, template updates).
  // Why: honoring skip here leaves users forever half-migrated — old deprecated
  // files persist under skip-protected paths, new commands like `continue.md`
  // never land, and every future update re-flags the same mess. Rename
  // migrations already ignore update.skip; this makes the rest consistent
  // during a breaking upgrade. User customizations are still guarded by the
  // per-file conflict prompt ("Modified by you") at write time.
  const breakingBypass =
    options.migrate === true &&
    cliVsProject > 0 &&
    projectVersion !== "unknown" &&
    (() => {
      const md = getMigrationMetadata(projectVersion, cliVersion);
      return md.breaking && md.recommendMigrate;
    })();

  // Collect templates (used for both migration classification and change analysis)
  const templates = collectTemplateFiles(
    cwd,
    codexUpgradeNeeded ? new Set<AITool>(["codex"]) : undefined,
    breakingBypass,
  );

  // Load update.skip paths (used for both safe-file-delete and template collection)
  const skipPaths = loadUpdateSkipPaths(cwd);

  // Collect safe-file-delete items from ALL manifests (hash match is the safety net)
  // This runs regardless of version — unknown version still gets safe cleanup
  const allMigrations = getAllMigrations();
  const safeFileDeletes = collectSafeFileDeletes(
    allMigrations,
    cwd,
    skipPaths,
    breakingBypass,
  );
  const hasSafeDeletes =
    safeFileDeletes.filter((c) => c.action === "delete").length > 0;

  // Check for pending regular migrations (skip if unknown version)
  let pendingMigrations = isUnknownVersion
    ? []
    : getMigrationsForVersion(projectVersion, cliVersion);

  // Also check for "orphaned" migrations - where source still exists but version says we shouldn't migrate
  // This handles cases where version was updated but migrations weren't applied
  const orphanedMigrations = allMigrations.filter((item) => {
    // Only check rename and rename-dir migrations
    if (item.type !== "rename" && item.type !== "rename-dir") return false;
    if (!item.from || !item.to) return false;

    const oldPath = path.join(cwd, item.from);
    const newPath = path.join(cwd, item.to);

    // Orphaned if: source exists AND target doesn't exist
    // AND this migration isn't already in pendingMigrations
    const sourceExists = fs.existsSync(oldPath);
    const targetExists = fs.existsSync(newPath);
    const alreadyPending = pendingMigrations.some(
      (m) => m.from === item.from && m.to === item.to,
    );

    return sourceExists && !targetExists && !alreadyPending;
  });

  // Add orphaned migrations to pending (they need to be applied)
  if (orphanedMigrations.length > 0) {
    console.log(
      chalk.yellow("⚠️  Detected incomplete migrations from previous updates:"),
    );
    for (const item of orphanedMigrations) {
      console.log(chalk.yellow(`    ${item.from} → ${item.to}`));
    }
    console.log("");
    pendingMigrations = [...pendingMigrations, ...orphanedMigrations];
  }

  const hasMigrations = pendingMigrations.length > 0;

  // Classify migrations (stored for later backup creation)
  let classifiedMigrations: ClassifiedMigrations | null = null;

  if (hasMigrations) {
    console.log(chalk.cyan("Analyzing migrations...\n"));

    classifiedMigrations = classifyMigrations(
      pendingMigrations,
      cwd,
      hashes,
      templates,
    );

    printMigrationSummary(classifiedMigrations);

    // Hard-stop: pending rename/delete work from a breaking release requires --migrate.
    // Why: without --migrate, those entries are skipped and update()'s later path silently
    // bumps the version stamp, leaving old paths orphaned next to new templates. Force
    // explicit opt-in so the user can't half-migrate by accident.
    const pendingMigrationCount =
      classifiedMigrations.auto.length +
      classifiedMigrations.confirm.length +
      classifiedMigrations.conflict.length;

    if (
      pendingMigrationCount > 0 &&
      !options.migrate &&
      !options.dryRun &&
      cliVsProject > 0 &&
      projectVersion !== "unknown"
    ) {
      const gateMetadata = getMigrationMetadata(projectVersion, cliVersion);
      if (gateMetadata.breaking && gateMetadata.recommendMigrate) {
        console.log(
          chalk.bgRed.white.bold(" ✖ MIGRATION REQUIRED ") +
            chalk.red(
              ` Breaking changes between ${projectVersion} → ${cliVersion} require --migrate.`,
            ),
        );
        console.log("");
        console.log(chalk.yellow(`  Run: trellis update --migrate`));
        console.log("");
        console.log(
          chalk.gray(
            "  Without --migrate, renamed/relocated files from breaking releases aren't moved,\n" +
              "  leaving your project with stale paths alongside new templates.\n" +
              "  Use --dry-run to preview what --migrate will do.",
          ),
        );
        process.exit(1);
      }
    }

    // Soft hint: non-breaking migrations or projects that chose not to set recommendMigrate
    if (!options.migrate) {
      const autoCount = classifiedMigrations.auto.length;
      const confirmCount = classifiedMigrations.confirm.length;

      if (autoCount > 0 || confirmCount > 0) {
        console.log(
          chalk.gray(
            `Tip: Use --migrate to apply migrations (prompts for modified files).`,
          ),
        );
        if (confirmCount > 0) {
          console.log(
            chalk.gray(
              `     Use --migrate -f to force all, or --migrate -s to skip modified.\n`,
            ),
          );
        } else {
          console.log("");
        }
      }
    }
  }

  // Print safe-file-delete summary (always shown, runs without --migrate)
  if (safeFileDeletes.length > 0) {
    printSafeFileDeleteSummary(safeFileDeletes);
  }

  // Analyze changes (pass hashes for modification detection)
  const changes = analyzeChanges(cwd, hashes, templates);
  const missingAgentsMdHash = collectMissingAgentsMdHash(changes, hashes);

  // Print summary
  printChangeSummary(changes);

  // First-time hash tracking hint
  if (isFirstHashTracking && changes.changedFiles.length > 0) {
    console.log(chalk.cyan("ℹ️  First update with hash tracking enabled."));
    console.log(
      chalk.gray(
        "   Changed files shown above may not be actual user modifications.",
      ),
    );
    console.log(
      chalk.gray(
        "   After this update, hash tracking will accurately detect changes.\n",
      ),
    );
  }

  // Check if there's anything to do
  const isUpgrade = cliVsProject > 0;
  const isDowngrade = cliVsProject < 0;
  const isSameVersion = cliVsProject === 0;

  // Check if we have pending migrations that need to be applied
  const hasPendingMigrations =
    options.migrate &&
    classifiedMigrations &&
    (classifiedMigrations.auto.length > 0 ||
      classifiedMigrations.confirm.length > 0);

  if (
    changes.newFiles.length === 0 &&
    changes.autoUpdateFiles.length === 0 &&
    changes.changedFiles.length === 0 &&
    !hasPendingMigrations &&
    !hasSafeDeletes
  ) {
    if (!options.dryRun && missingAgentsMdHash.size > 0) {
      updateHashes(cwd, missingAgentsMdHash);
    }

    if (isSameVersion) {
      console.log(chalk.green("✓ Already up to date!"));
    } else {
      // Version changed but no file changes needed — still update the version stamp
      updateVersionFile(cwd);
      if (isUpgrade) {
        console.log(
          chalk.green(
            `✓ No file changes needed for ${projectVersion} → ${cliVersion}`,
          ),
        );
      } else if (isDowngrade) {
        console.log(
          chalk.green(
            `✓ No file changes needed for ${projectVersion} → ${cliVersion} (downgrade)`,
          ),
        );
      }
    }
    return;
  }

  // Show what this operation will do
  if (isUpgrade) {
    console.log(
      chalk.green(`This will UPGRADE: ${projectVersion} → ${cliVersion}\n`),
    );
  } else if (isDowngrade) {
    console.log(
      chalk.red(`⚠️  This will DOWNGRADE: ${projectVersion} → ${cliVersion}\n`),
    );
  }

  // Show breaking change warning before confirm
  if (cliVsProject > 0 && projectVersion !== "unknown") {
    const preConfirmMetadata = getMigrationMetadata(projectVersion, cliVersion);
    if (preConfirmMetadata.breaking) {
      console.log(chalk.cyan("═".repeat(60)));
      console.log(
        chalk.bgRed.white.bold(" ⚠️  BREAKING CHANGES ") +
          chalk.red.bold(" Review the changes above carefully!"),
      );
      if (preConfirmMetadata.changelog.length > 0) {
        console.log("");
        console.log(chalk.white(preConfirmMetadata.changelog[0]));
      }
      if (preConfirmMetadata.recommendMigrate && !options.migrate) {
        console.log("");
        console.log(
          chalk.bgGreen.black.bold(" 💡 RECOMMENDED ") +
            chalk.green.bold(" Run with --migrate to complete the migration"),
        );
      }
      // Notice when update.skip is bypassed so user isn't surprised when
      // skipPaths-protected files get cleaned up during this breaking upgrade.
      if (breakingBypass && skipPaths.length > 0) {
        const willBypass = safeFileDeletes.filter(
          (c) =>
            c.action === "delete" &&
            skipPaths.some(
              (skip) =>
                c.item.from === skip ||
                c.item.from.startsWith(skip.endsWith("/") ? skip : skip + "/"),
            ),
        );
        if (willBypass.length > 0) {
          console.log("");
          console.log(
            chalk.bgYellow.black.bold(" ⚠ update.skip BYPASSED ") +
              chalk.yellow.bold(
                ` Breaking release — ${willBypass.length.toString()} file(s) under your update.skip paths will be cleaned up.`,
              ),
          );
          console.log(
            chalk.gray(
              "  Hash-verified: only files matching known Trellis templates are deleted. Your local customizations (hash mismatch) are still preserved.",
            ),
          );
        }
      }
      console.log(chalk.cyan("═".repeat(60)));
      console.log("");
    }
  }

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.gray("[Dry run] No changes made."));
    return;
  }

  // Batch-resolution flags are explicit consent for non-interactive runs.
  // Prompting here breaks CI and `node ... update --force --migrate` smoke tests.
  if (!options.force && !options.skipAll && !options.createNew) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Proceed?",
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(chalk.yellow("Update cancelled."));
      return;
    }
  }

  // Create complete backup of all managed platform/workflow directories
  const backupDir = createFullBackup(cwd);

  if (backupDir) {
    console.log(
      chalk.gray(`\nBackup created: ${path.relative(cwd, backupDir)}/`),
    );
  }

  // Execute migrations if --migrate flag is set
  if (options.migrate && classifiedMigrations) {
    const migrationResult = await executeMigrations(classifiedMigrations, cwd, {
      force: options.force,
      skipAll: options.skipAll,
    });
    printMigrationResult(migrationResult);

    // Hardcoded: Rename traces-*.md to journal-*.md in workspace directories
    // Why hardcoded: The migration system only supports fixed path renames, not pattern-based.
    // traces-*.md files are in .trellis/workspace/{developer}/ with variable developer names
    // and variable file numbers (traces-1.md, traces-2.md, etc.), so we can't enumerate them
    // in the migration manifest. This is a one-time migration for the 0.2.0 naming redesign.
    const workspaceDir = path.join(cwd, PATHS.WORKSPACE);
    if (fs.existsSync(workspaceDir)) {
      let journalRenamed = 0;
      const devDirs = fs.readdirSync(workspaceDir);
      for (const dev of devDirs) {
        const devPath = path.join(workspaceDir, dev);
        if (!fs.statSync(devPath).isDirectory()) continue;

        const files = fs.readdirSync(devPath);
        for (const file of files) {
          if (file.startsWith("traces-") && file.endsWith(".md")) {
            const oldPath = path.join(devPath, file);
            const newFile = file.replace("traces-", "journal-");
            const newPath = path.join(devPath, newFile);
            fs.renameSync(oldPath, newPath);
            journalRenamed++;
          }
        }
      }
      if (journalRenamed > 0) {
        console.log(
          chalk.cyan(`Renamed ${journalRenamed} traces file(s) to journal`),
        );
      }
    }
  }

  // Execute safe-file-delete (after backup, before template writes)
  let safeDeleted = 0;
  if (hasSafeDeletes) {
    safeDeleted = executeSafeFileDeletes(safeFileDeletes, cwd);
    if (safeDeleted > 0) {
      console.log(
        chalk.cyan(`\nCleaned up ${safeDeleted} deprecated command file(s)`),
      );
    }
  }

  // Track results
  let added = 0;
  let autoUpdated = 0;
  let updated = 0;
  let skipped = 0;
  let createdNew = 0;

  // Add new files
  if (changes.newFiles.length > 0) {
    console.log(chalk.blue("\nAdding new files..."));
    for (const file of changes.newFiles) {
      const dir = path.dirname(file.path);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file.path, file.newContent);

      // Make scripts executable
      if (
        file.relativePath.endsWith(".sh") ||
        file.relativePath.endsWith(".py")
      ) {
        fs.chmodSync(file.path, "755");
      }

      console.log(chalk.green(`  + ${file.relativePath}`));
      added++;
    }
  }

  // Auto-update files (template updated, user didn't modify)
  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.blue("\nAuto-updating template files..."));
    for (const file of changes.autoUpdateFiles) {
      fs.writeFileSync(file.path, file.newContent);

      // Make scripts executable
      if (
        file.relativePath.endsWith(".sh") ||
        file.relativePath.endsWith(".py")
      ) {
        fs.chmodSync(file.path, "755");
      }

      console.log(chalk.cyan(`  ↑ ${file.relativePath}`));
      autoUpdated++;
    }
  }

  // Handle changed files
  if (changes.changedFiles.length > 0) {
    console.log(chalk.blue("\n--- Resolving conflicts ---\n"));

    const applyToAll: { action: ConflictAction | null } = { action: null };

    for (const file of changes.changedFiles) {
      const action = await promptConflictResolution(file, options, applyToAll);

      if (action === "overwrite") {
        fs.writeFileSync(file.path, file.newContent);
        if (
          file.relativePath.endsWith(".sh") ||
          file.relativePath.endsWith(".py")
        ) {
          fs.chmodSync(file.path, "755");
        }
        console.log(chalk.yellow(`  ✓ Overwritten: ${file.relativePath}`));
        updated++;
      } else if (action === "create-new") {
        const newPath = file.path + ".new";
        fs.writeFileSync(newPath, file.newContent);
        console.log(chalk.blue(`  ✓ Created: ${file.relativePath}.new`));
        createdNew++;
      } else {
        console.log(chalk.gray(`  ○ Skipped: ${file.relativePath}`));
        skipped++;
      }
    }
  }

  // Update version file
  updateVersionFile(cwd);

  // Update template hashes for new, auto-updated, and overwritten files
  const filesToHash = new Map<string, string>(missingAgentsMdHash);
  for (const file of changes.newFiles) {
    filesToHash.set(file.relativePath, file.newContent);
  }
  // Auto-updated files always get new hash
  for (const file of changes.autoUpdateFiles) {
    filesToHash.set(file.relativePath, file.newContent);
  }
  // Only hash overwritten files (not skipped or .new copies)
  for (const file of changes.changedFiles) {
    const fullPath = path.join(cwd, file.relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content === file.newContent) {
        filesToHash.set(file.relativePath, file.newContent);
      }
    }
  }
  if (filesToHash.size > 0) {
    updateHashes(cwd, filesToHash);
  }

  // Print summary
  console.log(chalk.cyan("\n--- Summary ---\n"));
  if (added > 0) {
    console.log(`  Added: ${added} file(s)`);
  }
  if (autoUpdated > 0) {
    console.log(`  Auto-updated: ${autoUpdated} file(s)`);
  }
  if (updated > 0) {
    console.log(`  Updated: ${updated} file(s)`);
  }
  if (skipped > 0) {
    console.log(`  Skipped: ${skipped} file(s)`);
  }
  if (createdNew > 0) {
    console.log(`  Created .new copies: ${createdNew} file(s)`);
  }
  if (safeDeleted > 0) {
    console.log(`  Cleaned up: ${safeDeleted} deprecated file(s)`);
  }
  if (backupDir) {
    console.log(`  Backup: ${path.relative(cwd, backupDir)}/`);
  }

  const actionWord = isDowngrade ? "Downgrade" : "Update";
  console.log(
    chalk.green(
      `\n✅ ${actionWord} complete! (${projectVersion} → ${cliVersion})`,
    ),
  );

  if (createdNew > 0) {
    console.log(
      chalk.gray(
        "\nTip: Review .new files and merge changes manually if needed.",
      ),
    );
  }

  // Create migration task if there are breaking changes with migration guides
  if (cliVsProject > 0 && projectVersion !== "unknown") {
    const metadata = getMigrationMetadata(projectVersion, cliVersion);

    if (metadata.breaking && metadata.migrationGuides.length > 0) {
      // Create task directory
      const today = new Date();
      const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const taskSlug = `migrate-to-${cliVersion}`;
      const taskDirName = `${monthDay}-${taskSlug}`;
      const tasksDir = path.join(cwd, DIR_NAMES.WORKFLOW, DIR_NAMES.TASKS);
      const taskDir = path.join(tasksDir, taskDirName);

      // Check if task already exists
      if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { recursive: true });

        // Get current developer for assignee.
        // `.developer` is a key=value file (written by init_developer.py):
        //   name=<developer-name>
        //   initialized_at=<iso8601>
        // Reading it raw and .trim()-ing embeds the entire file contents
        // (including the `name=` prefix and the `initialized_at` line) into
        // the assignee field, producing bogus assignees like
        // "name=suyuan\ninitialized_at=2026-04-07T23:41:21.978312" that
        // later break session-start task rendering.
        const developerFile = path.join(cwd, DIR_NAMES.WORKFLOW, ".developer");
        let currentDeveloper = "unknown";
        if (fs.existsSync(developerFile)) {
          const raw = fs.readFileSync(developerFile, "utf-8");
          const nameMatch = raw.match(/^\s*name\s*=\s*(.+?)\s*$/m);
          if (nameMatch) {
            currentDeveloper = nameMatch[1];
          }
        }

        // Build task.json — canonical 24-field shape via shared factory.
        const taskTitle = `Migrate to v${cliVersion}`;
        const todayStr = today.toISOString().split("T")[0];
        const taskJson = emptyTaskJson({
          id: taskSlug,
          name: taskSlug,
          title: taskTitle,
          description: `Breaking change migration from v${projectVersion} to v${cliVersion}`,
          status: "planning",
          scope: "migration",
          priority: "P1",
          creator: "trellis-update",
          assignee: currentDeveloper,
          createdAt: todayStr,
          meta: { prd_status: "confirmed" },
        });

        // Write task.json
        const taskJsonPath = path.join(taskDir, "task.json");
        fs.writeFileSync(taskJsonPath, JSON.stringify(taskJson, null, 2));

        // Build PRD content
        let prdContent = `# Migration Task: Upgrade to v${cliVersion}\n\n`;
        prdContent += `**Created**: ${todayStr}\n`;
        prdContent += `**From Version**: ${projectVersion}\n`;
        prdContent += `**To Version**: ${cliVersion}\n`;
        prdContent += `**Assignee**: ${currentDeveloper}\n\n`;
        prdContent += `## Status\n\n- [ ] Review migration guide\n- [ ] Update custom files\n- [ ] Run \`trellis update --migrate\`\n- [ ] Test workflows\n\n`;

        for (const {
          version,
          guide,
          aiInstructions,
        } of metadata.migrationGuides) {
          prdContent += `---\n\n## v${version} Migration Guide\n\n`;
          prdContent += guide;
          prdContent += "\n\n";

          if (aiInstructions) {
            prdContent += `### AI Assistant Instructions\n\n`;
            prdContent += `When helping with this migration:\n\n`;
            prdContent += aiInstructions;
            prdContent += "\n\n";
          }
        }

        // Write PRD
        const prdPath = path.join(taskDir, "prd.md");
        fs.writeFileSync(prdPath, prdContent);

        console.log("");
        console.log(chalk.bgCyan.black.bold(" 📋 MIGRATION TASK CREATED "));
        console.log(
          chalk.cyan(
            `A task has been created to help you complete the migration:`,
          ),
        );
        console.log(
          chalk.white(
            `   ${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}/${taskDirName}/`,
          ),
        );
        console.log("");
        console.log(
          chalk.gray(
            "Use AI to help: Ask Claude/Cursor to read the task and fix your custom files.",
          ),
        );
      }
    }
  }

  // Display breaking change warnings at the very end (so they don't scroll off screen)
  if (cliVsProject > 0 && projectVersion !== "unknown") {
    const finalMetadata = getMigrationMetadata(projectVersion, cliVersion);

    if (finalMetadata.breaking || finalMetadata.changelog.length > 0) {
      console.log("");
      console.log(chalk.cyan("═".repeat(60)));

      if (finalMetadata.breaking) {
        console.log(
          chalk.bgRed.white.bold(" ⚠️  BREAKING CHANGES ") +
            chalk.red.bold(" This update contains breaking changes!"),
        );
        console.log("");
      }

      if (finalMetadata.changelog.length > 0) {
        console.log(chalk.cyan.bold("📋 What's Changed:"));
        for (const entry of finalMetadata.changelog) {
          console.log(chalk.white(`   ${entry}`));
        }
        console.log("");
      }

      if (finalMetadata.recommendMigrate && !options.migrate) {
        console.log(
          chalk.bgGreen.black.bold(" 💡 RECOMMENDED ") +
            chalk.green.bold(" Run with --migrate to complete the migration"),
        );
        console.log(
          chalk.gray("   This will remove legacy files and apply all changes."),
        );
        console.log("");
      }

      console.log(chalk.cyan("═".repeat(60)));
    }
  }
}
