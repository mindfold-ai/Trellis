import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { PATHS, DIR_NAMES } from "../constants/paths.js";
import { VERSION } from "../cli/index.js";

// Import templates for comparison
import {
  commonPathsScript,
  commonDeveloperScript,
  commonGitContextScript,
  commonWorktreeScript,
  multiAgentStartScript,
  multiAgentCleanupScript,
  multiAgentStatusScript,
  worktreeYamlTemplate,
  workflowMdTemplate,
  gitignoreTemplate,
  initDeveloperScript,
  getDeveloperScript,
  featureScript,
  getContextScript,
  addSessionScript,
  createBootstrapScript,
} from "../templates/trellis/index.js";

import {
  guidesIndexContent,
  guidesCrossLayerThinkingGuideContent,
  guidesCodeReuseThinkingGuideContent,
} from "../templates/markdown/index.js";

import { getCommandTemplates } from "../configurators/templates.js";
import {
  getAllAgents,
  getAllHooks,
  getSettingsTemplate,
} from "../templates/claude/index.js";

export interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
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
  changedFiles: FileChange[];
  protectedPaths: string[];
}

type ConflictAction = "overwrite" | "skip" | "create-new";

// Paths that should never be touched
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.PROGRESS}`, // agent-traces/
  `${DIR_NAMES.WORKFLOW}/.developer`,
  `${DIR_NAMES.WORKFLOW}/.current-feature`,
  `${PATHS.STRUCTURE}/frontend`,
  `${PATHS.STRUCTURE}/backend`,
];

/**
 * Collect all template files that should be managed by update
 */
function collectTemplateFiles(_cwd: string): Map<string, string> {
  const files = new Map<string, string>();

  // Scripts - common
  files.set(`${PATHS.SCRIPTS}/common/paths.sh`, commonPathsScript);
  files.set(`${PATHS.SCRIPTS}/common/developer.sh`, commonDeveloperScript);
  files.set(`${PATHS.SCRIPTS}/common/git-context.sh`, commonGitContextScript);
  files.set(`${PATHS.SCRIPTS}/common/worktree.sh`, commonWorktreeScript);

  // Scripts - multi-agent
  files.set(`${PATHS.SCRIPTS}/multi-agent/start.sh`, multiAgentStartScript);
  files.set(`${PATHS.SCRIPTS}/multi-agent/cleanup.sh`, multiAgentCleanupScript);
  files.set(`${PATHS.SCRIPTS}/multi-agent/status.sh`, multiAgentStatusScript);

  // Scripts - main
  files.set(`${PATHS.SCRIPTS}/init-developer.sh`, initDeveloperScript);
  files.set(`${PATHS.SCRIPTS}/get-developer.sh`, getDeveloperScript);
  files.set(`${PATHS.SCRIPTS}/feature.sh`, featureScript);
  files.set(`${PATHS.SCRIPTS}/get-context.sh`, getContextScript);
  files.set(`${PATHS.SCRIPTS}/add-session.sh`, addSessionScript);
  files.set(`${PATHS.SCRIPTS}/create-bootstrap.sh`, createBootstrapScript);

  // Configuration
  files.set(`${DIR_NAMES.WORKFLOW}/worktree.yaml`, worktreeYamlTemplate);
  files.set(`${DIR_NAMES.WORKFLOW}/.gitignore`, gitignoreTemplate);
  files.set(PATHS.WORKFLOW_GUIDE_FILE, workflowMdTemplate);

  // Structure - guides only (frontend/backend are protected)
  files.set(`${PATHS.STRUCTURE}/guides/index.md`, guidesIndexContent);
  files.set(
    `${PATHS.STRUCTURE}/guides/cross-layer-thinking-guide.md`,
    guidesCrossLayerThinkingGuideContent,
  );
  files.set(
    `${PATHS.STRUCTURE}/guides/code-reuse-thinking-guide.md`,
    guidesCodeReuseThinkingGuideContent,
  );

  // Claude commands
  const claudeCommands = getCommandTemplates("claude-code");
  for (const [name, content] of Object.entries(claudeCommands)) {
    files.set(`.claude/commands/${name}.md`, content);
  }

  // Cursor commands
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

  return files;
}

/**
 * Analyze changes between current files and templates
 */
function analyzeChanges(cwd: string): ChangeAnalysis {
  const templates = collectTemplateFiles(cwd);
  const result: ChangeAnalysis = {
    newFiles: [],
    unchangedFiles: [],
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
        change.status = "unchanged";
        result.unchangedFiles.push(change);
      } else {
        change.status = "changed";
        result.changedFiles.push(change);
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
    console.log(chalk.yellow("  Changed files (need your decision):"));
    for (const file of changes.changedFiles) {
      console.log(chalk.yellow(`    ? ${file.relativePath}`));
    }
    console.log("");
  }

  console.log(chalk.gray("  Protected (never touched):"));
  for (const protectedPath of changes.protectedPaths) {
    console.log(chalk.gray(`    ○ ${protectedPath}/`));
  }
  console.log("");
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
 * Create backup of files that will be changed
 */
function createBackup(cwd: string, changes: ChangeAnalysis): string | null {
  const filesToBackup = changes.changedFiles;
  if (filesToBackup.length === 0) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = path.join(cwd, DIR_NAMES.WORKFLOW, `.backup-${timestamp}`);

  fs.mkdirSync(backupDir, { recursive: true });

  for (const file of filesToBackup) {
    if (fs.existsSync(file.path)) {
      const relativePath = file.relativePath;
      const backupPath = path.join(backupDir, relativePath);
      const backupParent = path.dirname(backupPath);

      fs.mkdirSync(backupParent, { recursive: true });
      fs.copyFileSync(file.path, backupPath);
    }
  }

  return backupDir;
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

  // Get versions
  const installedVersion = getInstalledVersion(cwd);

  console.log(chalk.cyan("\nTrellis Update"));
  console.log(chalk.cyan("══════════════\n"));
  console.log(`Current version: ${chalk.gray(installedVersion)}`);
  console.log(`Available version: ${chalk.green(VERSION)}`);

  // Analyze changes
  const changes = analyzeChanges(cwd);

  // Print summary
  printChangeSummary(changes);

  // Check if there's anything to do
  if (changes.newFiles.length === 0 && changes.changedFiles.length === 0) {
    console.log(chalk.green("✓ Already up to date!"));
    return;
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

  // Create backup if needed
  const backupDir = createBackup(cwd, changes);

  // Track results
  let added = 0;
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
      if (file.relativePath.endsWith(".sh")) {
        fs.chmodSync(file.path, "755");
      }

      console.log(chalk.green(`  + ${file.relativePath}`));
      added++;
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
        if (file.relativePath.endsWith(".sh")) {
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

  // Print summary
  console.log(chalk.cyan("\n--- Summary ---\n"));
  if (added > 0) {
    console.log(`  Added: ${added} file(s)`);
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

  console.log(
    chalk.green(`\n✅ Update complete! (${installedVersion} → ${VERSION})`),
  );

  if (createdNew > 0) {
    console.log(
      chalk.gray(
        "\nTip: Review .new files and merge changes manually if needed.",
      ),
    );
  }
}
