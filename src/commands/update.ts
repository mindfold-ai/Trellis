import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { PATHS, DIR_NAMES } from "../constants/paths.js";
import { VERSION, PACKAGE_NAME } from "../cli/index.js";
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

// Import templates for comparison
import {
  // Python scripts - package init
  scriptsInit,
  // Python scripts - common
  commonInit,
  commonPaths,
  commonDeveloper,
  commonGitContext,
  commonWorktree,
  commonTaskQueue,
  commonTaskUtils,
  commonPhase,
  commonRegistry,
  commonCliAdapter,
  // Python scripts - multi_agent
  multiAgentInit,
  multiAgentStart,
  multiAgentCleanup,
  multiAgentStatus,
  multiAgentCreatePr,
  multiAgentPlan,
  // Python scripts - main
  getDeveloperScript,
  initDeveloperScript,
  taskScript,
  getContextScript,
  addSessionScript,
  createBootstrapScript,
  // Configuration
  worktreeYamlTemplate,
  workflowMdTemplate,
  gitignoreTemplate,
} from "../templates/trellis/index.js";

import {
  guidesIndexContent,
  guidesCrossLayerThinkingGuideContent,
  guidesCodeReuseThinkingGuideContent,
  guidesCrossPlatformThinkingGuideContent,
  // Backend structure (multi-doc)
  backendIndexContent,
  backendDirectoryStructureContent,
  backendDatabaseGuidelinesContent,
  backendLoggingGuidelinesContent,
  backendQualityGuidelinesContent,
  backendErrorHandlingContent,
  // Frontend structure (multi-doc)
  frontendIndexContent,
  frontendDirectoryStructureContent,
  frontendTypeSafetyContent,
  frontendHookGuidelinesContent,
  frontendComponentGuidelinesContent,
  frontendQualityGuidelinesContent,
  frontendStateManagementContent,
  // Workspace
  workspaceIndexContent,
} from "../templates/markdown/index.js";

import { getCommandTemplates } from "../configurators/templates.js";
import {
  getAllAgents,
  getAllHooks,
  getSettingsTemplate,
} from "../templates/claude/index.js";
import {
  getAllAgents as getAllIflowAgents,
  getAllCommands as getAllIflowCommands,
  getAllHooks as getAllIflowHooks,
  getSettingsTemplate as getIflowSettingsTemplate,
} from "../templates/iflow/index.js";

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
  protectedPaths: string[];
}

type ConflictAction = "overwrite" | "skip" | "create-new";

// Paths that should never be touched (true user data)
// Note: frontend/backend spec dirs removed - they should be created if missing,
// and existing files are protected by hash-based modification tracking
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`, // workspace/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`, // tasks/
  `${DIR_NAMES.WORKFLOW}/.developer`,
  `${DIR_NAMES.WORKFLOW}/.current-task`,
];

/**
 * Collect all template files that should be managed by update
 */
function collectTemplateFiles(_cwd: string): Map<string, string> {
  const files = new Map<string, string>();

  // Python scripts - package init
  files.set(`${PATHS.SCRIPTS}/__init__.py`, scriptsInit);

  // Python scripts - common
  files.set(`${PATHS.SCRIPTS}/common/__init__.py`, commonInit);
  files.set(`${PATHS.SCRIPTS}/common/paths.py`, commonPaths);
  files.set(`${PATHS.SCRIPTS}/common/developer.py`, commonDeveloper);
  files.set(`${PATHS.SCRIPTS}/common/git_context.py`, commonGitContext);
  files.set(`${PATHS.SCRIPTS}/common/worktree.py`, commonWorktree);
  files.set(`${PATHS.SCRIPTS}/common/task_queue.py`, commonTaskQueue);
  files.set(`${PATHS.SCRIPTS}/common/task_utils.py`, commonTaskUtils);
  files.set(`${PATHS.SCRIPTS}/common/phase.py`, commonPhase);
  files.set(`${PATHS.SCRIPTS}/common/registry.py`, commonRegistry);
  files.set(`${PATHS.SCRIPTS}/common/cli_adapter.py`, commonCliAdapter);

  // Python scripts - multi_agent
  files.set(`${PATHS.SCRIPTS}/multi_agent/__init__.py`, multiAgentInit);
  files.set(`${PATHS.SCRIPTS}/multi_agent/start.py`, multiAgentStart);
  files.set(`${PATHS.SCRIPTS}/multi_agent/cleanup.py`, multiAgentCleanup);
  files.set(`${PATHS.SCRIPTS}/multi_agent/status.py`, multiAgentStatus);
  files.set(`${PATHS.SCRIPTS}/multi_agent/create_pr.py`, multiAgentCreatePr);
  files.set(`${PATHS.SCRIPTS}/multi_agent/plan.py`, multiAgentPlan);

  // Python scripts - main
  files.set(`${PATHS.SCRIPTS}/init_developer.py`, initDeveloperScript);
  files.set(`${PATHS.SCRIPTS}/get_developer.py`, getDeveloperScript);
  files.set(`${PATHS.SCRIPTS}/task.py`, taskScript);
  files.set(`${PATHS.SCRIPTS}/get_context.py`, getContextScript);
  files.set(`${PATHS.SCRIPTS}/add_session.py`, addSessionScript);
  files.set(`${PATHS.SCRIPTS}/create_bootstrap.py`, createBootstrapScript);

  // Configuration
  files.set(`${DIR_NAMES.WORKFLOW}/worktree.yaml`, worktreeYamlTemplate);
  files.set(`${DIR_NAMES.WORKFLOW}/.gitignore`, gitignoreTemplate);
  files.set(PATHS.WORKFLOW_GUIDE_FILE, workflowMdTemplate);

  // Workspace index (template file, not user data)
  files.set(`${PATHS.WORKSPACE}/index.md`, workspaceIndexContent);

  // Spec - guides
  files.set(`${PATHS.SPEC}/guides/index.md`, guidesIndexContent);
  files.set(
    `${PATHS.SPEC}/guides/cross-layer-thinking-guide.md`,
    guidesCrossLayerThinkingGuideContent,
  );
  files.set(
    `${PATHS.SPEC}/guides/code-reuse-thinking-guide.md`,
    guidesCodeReuseThinkingGuideContent,
  );
  files.set(
    `${PATHS.SPEC}/guides/cross-platform-thinking-guide.md`,
    guidesCrossPlatformThinkingGuideContent,
  );

  // Spec - backend (created if missing, protected by hash tracking if modified)
  files.set(`${PATHS.SPEC}/backend/index.md`, backendIndexContent);
  files.set(
    `${PATHS.SPEC}/backend/directory-structure.md`,
    backendDirectoryStructureContent,
  );
  files.set(
    `${PATHS.SPEC}/backend/database-guidelines.md`,
    backendDatabaseGuidelinesContent,
  );
  files.set(
    `${PATHS.SPEC}/backend/logging-guidelines.md`,
    backendLoggingGuidelinesContent,
  );
  files.set(
    `${PATHS.SPEC}/backend/quality-guidelines.md`,
    backendQualityGuidelinesContent,
  );
  files.set(
    `${PATHS.SPEC}/backend/error-handling.md`,
    backendErrorHandlingContent,
  );

  // Spec - frontend (created if missing, protected by hash tracking if modified)
  files.set(`${PATHS.SPEC}/frontend/index.md`, frontendIndexContent);
  files.set(
    `${PATHS.SPEC}/frontend/directory-structure.md`,
    frontendDirectoryStructureContent,
  );
  files.set(`${PATHS.SPEC}/frontend/type-safety.md`, frontendTypeSafetyContent);
  files.set(
    `${PATHS.SPEC}/frontend/hook-guidelines.md`,
    frontendHookGuidelinesContent,
  );
  files.set(
    `${PATHS.SPEC}/frontend/component-guidelines.md`,
    frontendComponentGuidelinesContent,
  );
  files.set(
    `${PATHS.SPEC}/frontend/quality-guidelines.md`,
    frontendQualityGuidelinesContent,
  );
  files.set(
    `${PATHS.SPEC}/frontend/state-management.md`,
    frontendStateManagementContent,
  );

  // Claude commands (in trellis/ subdirectory for namespace)
  const claudeCommands = getCommandTemplates("claude-code");
  for (const [name, content] of Object.entries(claudeCommands)) {
    files.set(`.claude/commands/trellis/${name}.md`, content);
  }

  // Cursor commands (flat structure with trellis- prefix, Cursor doesn't support subdirs)
  const cursorCommands = getCommandTemplates("cursor");
  for (const [name, content] of Object.entries(cursorCommands)) {
    files.set(`.cursor/commands/${name}.md`, content);
  }

  // Claude agents
  const agents = getAllAgents();
  for (const agent of agents) {
    files.set(`.claude/agents/${agent.name}.md`, agent.content);
  }

  // Claude hooks
  const hooks = getAllHooks();
  for (const hook of hooks) {
    files.set(`.claude/${hook.targetPath}`, hook.content);
  }

  // Claude settings
  const settingsTemplate = getSettingsTemplate();
  files.set(`.claude/${settingsTemplate.targetPath}`, settingsTemplate.content);

  // iFlow commands
  const iflowCommands = getAllIflowCommands();
  for (const command of iflowCommands) {
    files.set(`.iflow/commands/${command.name}.md`, command.content);
  }

  // iFlow agents
  const iflowAgents = getAllIflowAgents();
  for (const agent of iflowAgents) {
    files.set(`.iflow/agents/${agent.name}.md`, agent.content);
  }

  // iFlow hooks
  const iflowHooks = getAllIflowHooks();
  for (const hook of iflowHooks) {
    files.set(`.iflow/${hook.targetPath}`, hook.content);
  }

  // iFlow settings
  const iflowSettingsTemplate = getIflowSettingsTemplate();
  files.set(`.iflow/${iflowSettingsTemplate.targetPath}`, iflowSettingsTemplate.content);

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
      change.status = "new";
      result.newFiles.push(change);
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
 * Directories to backup as complete snapshot
 */
const BACKUP_DIRS = [".trellis", ".claude", ".cursor", ".iflow", ".opencode"];

/**
 * Patterns to exclude from backup (user data that shouldn't be backed up)
 */
const BACKUP_EXCLUDE_PATTERNS = [
  ".backup-", // Previous backups
  "/workspace/", // Developer workspace (user data)
  "/tasks/", // Task data (user data)
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
 * Backs up .trellis, .claude, .cursor, .iflow, .opencode directories entirely
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
 * Compare two semver versions (handles prerelease versions)
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 *
 * Semver rules:
 * - 0.3.0-beta.1 < 0.3.0 (prerelease is less than release)
 * - 0.3.0-alpha < 0.3.0-beta (alphabetically)
 * - 0.3.0-beta.1 < 0.3.0-beta.2 (numerically)
 */
function compareVersions(a: string, b: string): number {
  // Split into base version and prerelease parts
  const [aBase, aPrerelease] = a.split("-", 2);
  const [bBase, bPrerelease] = b.split("-", 2);

  // Parse base version (only numeric parts before any hyphen)
  const parseBase = (v: string): number[] =>
    v.split(".").map((n) => parseInt(n, 10) || 0);

  const aBaseParts = parseBase(aBase);
  const bBaseParts = parseBase(bBase);
  const maxBaseLen = Math.max(aBaseParts.length, bBaseParts.length);

  // Compare base versions first
  for (let i = 0; i < maxBaseLen; i++) {
    const aVal = aBaseParts[i] ?? 0;
    const bVal = bBaseParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }

  // Base versions are equal, compare prerelease
  // No prerelease > prerelease (1.0.0 > 1.0.0-beta)
  if (!aPrerelease && bPrerelease) return 1;
  if (aPrerelease && !bPrerelease) return -1;
  if (!aPrerelease && !bPrerelease) return 0;

  // Both have prerelease, compare them
  // Split prerelease by dots and compare each part
  const aPre = aPrerelease!.split(".");
  const bPre = bPrerelease!.split(".");
  const maxPreLen = Math.max(aPre.length, bPre.length);

  for (let i = 0; i < maxPreLen; i++) {
    const aP = aPre[i];
    const bP = bPre[i];

    // Missing part means shorter prerelease comes first
    if (aP === undefined) return -1;
    if (bP === undefined) return 1;

    // Try numeric comparison first
    const aNum = parseInt(aP, 10);
    const bNum = parseInt(bP, 10);
    const aIsNum = !isNaN(aNum) && String(aNum) === aP;
    const bIsNum = !isNaN(bNum) && String(bNum) === bP;

    // Numeric identifiers have lower precedence than string identifiers
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;

    if (aIsNum && bIsNum) {
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
    } else {
      // String comparison
      if (aP < bP) return -1;
      if (aP > bP) return 1;
    }
  }

  return 0;
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
function cleanupEmptyDirs(cwd: string, dirPath: string): void {
  const fullPath = path.join(cwd, dirPath);

  // Safety: don't delete outside of expected directories
  if (
    !dirPath.startsWith(".trellis/") &&
    !dirPath.startsWith(".claude/") &&
    !dirPath.startsWith(".cursor/") &&
    !dirPath.startsWith(".iflow/") &&
    !dirPath.startsWith(".opencode/")
  ) {
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
      if (
        parent !== "." &&
        parent !== dirPath &&
        parent !== ".trellis" &&
        parent !== ".claude" &&
        parent !== ".cursor" &&
        parent !== ".iflow" &&
        parent !== ".opencode"
      ) {
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
function sortMigrationsForExecution(
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

  // Handle unknown version - skip migrations but continue with template updates
  const isUnknownVersion = projectVersion === "unknown";
  if (isUnknownVersion) {
    console.log(
      chalk.yellow("⚠️  No version file found. Skipping migrations."),
    );
    console.log(chalk.gray("   Template updates will still be applied."));
    console.log(
      chalk.gray(
        "   If your project used old file paths, you may need to rename them manually.\n",
      ),
    );
  }

  // Collect templates (used for both migration classification and change analysis)
  const templates = collectTemplateFiles(cwd);

  // Check for pending migrations (skip if unknown version)
  let pendingMigrations = isUnknownVersion
    ? []
    : getMigrationsForVersion(projectVersion, cliVersion);

  // Also check for "orphaned" migrations - where source still exists but version says we shouldn't migrate
  // This handles cases where version was updated but migrations weren't applied
  const allMigrations = getAllMigrations();
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
    !hasPendingMigrations
  ) {
    if (isSameVersion) {
      console.log(chalk.green("✓ Already up to date!"));
    } else if (isUpgrade) {
      console.log(
        chalk.green(
          `✓ No file changes needed for ${projectVersion} → ${cliVersion}`,
        ),
      );
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
          chalk.red.bold(" Review the changes above carefully!")
      );
      if (preConfirmMetadata.changelog.length > 0) {
        console.log("");
        console.log(chalk.white(preConfirmMetadata.changelog[0]));
      }
      if (preConfirmMetadata.recommendMigrate && !options.migrate) {
        console.log("");
        console.log(
          chalk.bgGreen.black.bold(" 💡 RECOMMENDED ") +
            chalk.green.bold(" Run with --migrate to complete the migration")
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

  // Create complete backup of .trellis, .claude, .cursor, .iflow, .opencode directories
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
      if (file.relativePath.endsWith(".sh") || file.relativePath.endsWith(".py")) {
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
      if (file.relativePath.endsWith(".sh") || file.relativePath.endsWith(".py")) {
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
        if (file.relativePath.endsWith(".sh") || file.relativePath.endsWith(".py")) {
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

        // Get current developer for assignee
        const developerFile = path.join(cwd, DIR_NAMES.WORKFLOW, ".developer");
        let currentDeveloper = "unknown";
        if (fs.existsSync(developerFile)) {
          currentDeveloper = fs.readFileSync(developerFile, "utf-8").trim();
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

        for (const { version, guide, aiInstructions } of metadata.migrationGuides) {
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
            `A task has been created to help you complete the migration:`
          )
        );
        console.log(chalk.white(`   ${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}/${taskDirName}/`));
        console.log("");
        console.log(
          chalk.gray(
            "Use AI to help: Ask Claude/Cursor to read the task and fix your custom files."
          )
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
            chalk.red.bold(" This update contains breaking changes!")
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
            chalk.green.bold(" Run with --migrate to complete the migration")
        );
        console.log(
          chalk.gray("   This will remove legacy files and apply all changes.")
        );
        console.log("");
      }

      console.log(chalk.cyan("═".repeat(60)));
    }
  }
}
