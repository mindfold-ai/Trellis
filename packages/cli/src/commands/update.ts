import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { PATHS, DIR_NAMES } from "../constants/paths.js";
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
import { setupProxy } from "../utils/proxy.js";

// Import templates for comparison
import {
  getAllScripts,
  // Configuration
  configYamlTemplate,
  worktreeYamlTemplate,
  gitignoreTemplate,
} from "../templates/trellis/index.js";

import {
  ALL_MANAGED_DIRS,
  getConfiguredPlatforms,
  collectPlatformTemplates,
  isManagedPath,
  isManagedRootDir,
} from "../configurators/index.js";

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

// Paths that should never be touched (true user data)
// spec/ is user-customized content created during init; update should never modify it
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`, // workspace/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`, // tasks/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`, // spec/
  `${DIR_NAMES.WORKFLOW}/.developer`,
  `${DIR_NAMES.WORKFLOW}/.current-task`,
];

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

    // Check: protected path?
    if (isProtectedPath(item.from)) {
      results.push({ item, action: "skip-protected" });
      continue;
    }

    // Check: update.skip?
    if (
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

function collectTemplateFiles(
  cwd: string,
  extraPlatforms?: Set<AITool>,
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
  files.set(`${DIR_NAMES.WORKFLOW}/worktree.yaml`, worktreeYamlTemplate);
  files.set(`${DIR_NAMES.WORKFLOW}/.gitignore`, gitignoreTemplate);
  // workflow.md and workspace/index.md are user-customizable; only created during init

  // Platform-specific templates (only for configured platforms)
  for (const platformId of platforms) {
    const platformFiles = collectPlatformTemplates(platformId);
    if (platformFiles) {
      for (const [filePath, content] of platformFiles) {
        files.set(filePath, content);
      }
    }
  }

  // Apply update.skip from config.yaml
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

        if (storedHash && storedHash === currentHash) {
          // Hash matches stored hash - user didn't modify, template was updated
          // Safe to auto-update
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

/**
 * Patterns to exclude from backup (user data that shouldn't be backed up)
 */
const BACKUP_EXCLUDE_PATTERNS = [
  ".backup-", // Previous backups
  "/workspace/", // Developer workspace (user data)
  "/tasks/", // Task data (user data)
  "/spec/", // Spec files (user-customized content)
  "/backlog/", // Backlog data (user data)
  "/agent-traces/", // Agent traces (user data, legacy name)
];

/**
 * Check if a path should be excluded from backup
 */
function shouldExcludeFromBackup(relativePath: string): boolean {
  for (const pattern of BACKUP_EXCLUDE_PATTERNS) {
    if (relativePath.includes(pattern)) {
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

    const files = collectAllFiles(dirPath);
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
function collectAllFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectAllFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
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

  const files = collectAllFiles(dirFullPath);
  if (files.length === 0) return true; // Empty directory is safe

  for (const fullPath of files) {
    const relativePath = path.relative(cwd, fullPath);
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
 * Prompt user for migration action on a single item
 */
async function promptMigrationAction(
  item: MigrationItem,
): Promise<MigrationAction> {
  const action =
    item.type === "rename"
      ? `${item.from} → ${item.to}`
      : `Delete ${item.from}`;

  const { choice } = await inquirer.prompt<{ choice: MigrationAction }>([
    {
      type: "list",
      name: "choice",
      message: `${action}\nThis file has been modified. What would you like to do?`,
      choices: [
        {
          name:
            item.type === "rename" ? "[r] Rename anyway" : "[d] Delete anyway",
          value: "rename" as MigrationAction,
        },
        {
          name: "[b] Backup original, then proceed",
          value: "backup-rename" as MigrationAction,
        },
        {
          name: "[s] Skip this migration",
          value: "skip" as MigrationAction,
        },
      ],
      default: "skip",
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

    // For backup-rename, just proceed (backup already done)
    // Proceed with rename or delete
    if (item.type === "rename" && item.to) {
      const oldPath = path.join(cwd, item.from);
      const newPath = path.join(cwd, item.to);

      fs.mkdirSync(path.dirname(newPath), { recursive: true });
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

  // Collect templates (used for both migration classification and change analysis)
  const templates = collectTemplateFiles(
    cwd,
    codexUpgradeNeeded ? new Set<AITool>(["codex"]) : undefined,
  );

  // Load update.skip paths (used for both safe-file-delete and template collection)
  const skipPaths = loadUpdateSkipPaths(cwd);

  // Collect safe-file-delete items from ALL manifests (hash match is the safety net)
  // This runs regardless of version — unknown version still gets safe cleanup
  const allMigrations = getAllMigrations();
  const safeFileDeletes = collectSafeFileDeletes(allMigrations, cwd, skipPaths);
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

    // Show hint about --migrate flag (execution happens later after backup)
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
      console.log(chalk.cyan("═".repeat(60)));
      console.log("");
    }
  }

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.gray("[Dry run] No changes made."));
    return;
  }

  // Confirm
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
  const filesToHash = new Map<string, string>();
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

        // Build task.json
        const taskTitle = `Migrate to v${cliVersion}`;
        const todayStr = today.toISOString().split("T")[0];
        const taskJson = {
          title: taskTitle,
          description: `Breaking change migration from v${projectVersion} to v${cliVersion}`,
          status: "planning",
          dev_type: null,
          scope: "migration",
          priority: "P1",
          creator: "trellis-update",
          assignee: currentDeveloper,
          createdAt: todayStr,
          completedAt: null,
          branch: null,
          base_branch: null,
          worktree_path: null,
          current_phase: 0,
          next_action: [
            { phase: 1, action: "review-guide" },
            { phase: 2, action: "update-files" },
            { phase: 3, action: "run-migrate" },
            { phase: 4, action: "test" },
          ],
          commit: null,
          pr_url: null,
          subtasks: [],
          children: [],
          parent: null,
          meta: {},
        };

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
