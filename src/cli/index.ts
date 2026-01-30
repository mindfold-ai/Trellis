import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { init } from "../commands/init.js";
import { update } from "../commands/update.js";
import { context } from "../commands/context.js";
import { developerInit, developerShow, developerGet } from "../commands/developer.js";
import {
  taskCreate,
  taskList,
  taskStart,
  taskFinish,
  taskArchive,
  taskListArchive,
  taskInitContext,
  taskAddContext,
  taskValidate,
  taskListContext,
  taskBootstrap,
} from "../commands/task/index.js";
import { sessionAdd, sessionStatus } from "../commands/session.js";
import { DIR_NAMES } from "../constants/paths.js";

interface PackageJson {
  name: string;
  version: string;
}

// Read version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, "../../package.json");
const packageJson: PackageJson = JSON.parse(
  fs.readFileSync(packageJsonPath, "utf-8"),
);
export const VERSION: string = packageJson.version;
export const PACKAGE_NAME: string = packageJson.name;

/**
 * Compare two semver versions. Returns:
 * -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string): number[] =>
    v.split(".").map((n) => parseInt(n, 10) || 0);

  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

/**
 * Check if a Trellis update is available (compare project version with CLI version)
 */
function checkForUpdates(cwd: string): void {
  const versionFile = path.join(cwd, DIR_NAMES.WORKFLOW, ".version");

  if (!fs.existsSync(versionFile)) return;

  const projectVersion = fs.readFileSync(versionFile, "utf-8").trim();
  const cliVersion = VERSION;
  const comparison = compareVersions(cliVersion, projectVersion);

  if (comparison > 0) {
    // CLI is newer than project - update available
    console.log(
      chalk.yellow(
        `\n⚠️  Trellis update available: ${projectVersion} → ${cliVersion}`,
      ),
    );
    console.log(chalk.gray(`   Run: trellis update\n`));
  } else if (comparison < 0) {
    // CLI is older than project - CLI needs updating
    console.log(
      chalk.yellow(
        `\n⚠️  Your CLI (${cliVersion}) is older than project (${projectVersion})`,
      ),
    );
    console.log(chalk.gray(`   Run: npm install -g ${PACKAGE_NAME}\n`));
  }
}

// Check for updates at CLI startup (only if .trellis exists)
const cwd = process.cwd();
if (fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW))) {
  checkForUpdates(cwd);
}

const program = new Command();

program
  .name("trellis")
  .description(
    "AI-assisted development workflow framework for Cursor, Claude Code and more",
  )
  .version(VERSION, "-v, --version", "output the version number");

program
  .command("init")
  .description("Initialize trellis in the current project")
  .option("--cursor", "Include Cursor commands")
  .option("--claude", "Include Claude Code commands")
  // .option("--opencode", "Include OpenCode commands")  // TODO: Re-enable when OpenCode support is stable
  .option("-y, --yes", "Skip prompts and use defaults")
  .option(
    "-u, --user <name>",
    "Initialize developer identity with specified name",
  )
  .option("-f, --force", "Overwrite existing files without asking")
  .option("-s, --skip-existing", "Skip existing files without asking")
  .action(async (options: Record<string, unknown>) => {
    try {
      await init(options);
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });

program
  .command("update")
  .description("Update trellis configuration and commands to latest version")
  .option("--dry-run", "Preview changes without applying them")
  .option("-f, --force", "Overwrite all changed files without asking")
  .option("-s, --skip-all", "Skip all changed files without asking")
  .option("-n, --create-new", "Create .new copies for all changed files")
  .option("--allow-downgrade", "Allow downgrading to an older version")
  .option("--migrate", "Apply pending file migrations (renames/deletions)")
  .action(async (options: Record<string, unknown>) => {
    try {
      await update({
        dryRun: options.dryRun as boolean,
        force: options.force as boolean,
        skipAll: options.skipAll as boolean,
        createNew: options.createNew as boolean,
        allowDowngrade: options.allowDowngrade as boolean,
        migrate: options.migrate as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });

// =============================================================================
// Context Command
// =============================================================================

program
  .command("context")
  .description("Display session context for AI agents")
  .option("-j, --json", "Output in JSON format")
  .action(async (options: Record<string, unknown>) => {
    await context({ json: options.json as boolean });
  });

// =============================================================================
// Developer Commands
// =============================================================================

const developerCmd = program
  .command("developer")
  .description("Manage developer identity");

developerCmd
  .command("init <name>")
  .description("Initialize developer identity")
  .option("-j, --json", "Output in JSON format")
  .action(async (name: string, options: Record<string, unknown>) => {
    await developerInit(name, { json: options.json as boolean });
  });

developerCmd
  .command("show")
  .description("Show current developer info")
  .option("-j, --json", "Output in JSON format")
  .action(async (options: Record<string, unknown>) => {
    await developerShow({ json: options.json as boolean });
  });

developerCmd
  .command("get")
  .description("Get developer name (for scripting)")
  .action(async () => {
    await developerGet();
  });

// =============================================================================
// Task Commands
// =============================================================================

const taskCmd = program.command("task").description("Manage tasks");

taskCmd
  .command("create <title>")
  .description("Create a new task")
  .option("-s, --slug <name>", "Custom slug for task directory")
  .option("-a, --assignee <developer>", "Assign to developer")
  .option("-p, --priority <level>", "Priority (P0-P3)", "P2")
  .option("-d, --description <text>", "Task description")
  .option("-j, --json", "Output in JSON format")
  .action(async (title: string, options: Record<string, unknown>) => {
    await taskCreate(title, {
      slug: options.slug as string | undefined,
      assignee: options.assignee as string | undefined,
      priority: options.priority as string | undefined,
      description: options.description as string | undefined,
      json: options.json as boolean,
    });
  });

taskCmd
  .command("list")
  .description("List active tasks")
  .option("-m, --mine", "Show only tasks assigned to me")
  .option("-s, --status <status>", "Filter by status")
  .option("-j, --json", "Output in JSON format")
  .action(async (options: Record<string, unknown>) => {
    await taskList({
      mine: options.mine as boolean,
      status: options.status as string | undefined,
      json: options.json as boolean,
    });
  });

taskCmd
  .command("start <task-dir>")
  .description("Set a task as the current task")
  .action(async (taskDir: string) => {
    await taskStart(taskDir);
  });

taskCmd
  .command("finish")
  .description("Clear the current task")
  .action(async () => {
    await taskFinish();
  });

taskCmd
  .command("archive <task-name>")
  .description("Archive a completed task")
  .option("-j, --json", "Output in JSON format")
  .action(async (taskName: string, options: Record<string, unknown>) => {
    await taskArchive(taskName, { json: options.json as boolean });
  });

taskCmd
  .command("list-archive [month]")
  .description("List archived tasks")
  .option("-j, --json", "Output in JSON format")
  .action(async (month: string | undefined, options: Record<string, unknown>) => {
    await taskListArchive(month, { json: options.json as boolean });
  });

taskCmd
  .command("bootstrap [project-type]")
  .description("Create bootstrap task for first-time setup (fills project guidelines)")
  .option("-j, --json", "Output in JSON format")
  .action(async (projectType: string | undefined, options: Record<string, unknown>) => {
    await taskBootstrap(projectType, { json: options.json as boolean });
  });

// Task context subcommands
const taskContextCmd = taskCmd
  .command("context")
  .description("Manage task context files");

taskContextCmd
  .command("init <task-dir> <dev-type>")
  .description("Initialize context files (implement.jsonl, check.jsonl, debug.jsonl)")
  .option("-j, --json", "Output in JSON format")
  .action(
    async (taskDir: string, devType: string, options: Record<string, unknown>) => {
      await taskInitContext(taskDir, devType, { json: options.json as boolean });
    },
  );

taskContextCmd
  .command("add <task-dir> <jsonl-file> <path> [reason]")
  .description("Add a context entry to a JSONL file")
  .action(
    async (taskDir: string, jsonlFile: string, filePath: string, reason?: string) => {
      await taskAddContext(taskDir, jsonlFile, filePath, reason);
    },
  );

taskContextCmd
  .command("validate <task-dir>")
  .description("Validate context files")
  .option("-j, --json", "Output in JSON format")
  .action(async (taskDir: string, options: Record<string, unknown>) => {
    await taskValidate(taskDir, { json: options.json as boolean });
  });

taskContextCmd
  .command("list <task-dir>")
  .description("List context entries")
  .option("-j, --json", "Output in JSON format")
  .action(async (taskDir: string, options: Record<string, unknown>) => {
    await taskListContext(taskDir, { json: options.json as boolean });
  });

// =============================================================================
// Session Commands
// =============================================================================

const sessionCmd = program.command("session").description("Manage development sessions");

sessionCmd
  .command("add <title>")
  .description("Add a new session to the journal")
  .option("-c, --commit <hash>", "Commit hash(es), comma-separated for multiple")
  .option("-s, --summary <text>", "Brief summary of the session")
  .option("--content <text>", "Detailed content (or pipe via stdin)")
  .option("-j, --json", "Output in JSON format")
  .action(async (title: string, options: Record<string, unknown>) => {
    await sessionAdd(title, {
      commit: options.commit as string | undefined,
      summary: options.summary as string | undefined,
      content: options.content as string | undefined,
      json: options.json as boolean,
    });
  });

sessionCmd
  .command("status")
  .description("Show journal status")
  .option("-j, --json", "Output in JSON format")
  .action(async (options: Record<string, unknown>) => {
    await sessionStatus({ json: options.json as boolean });
  });

program.parse();
