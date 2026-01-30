/**
 * trellis pipeline plan - Start Plan Agent to analyze requirements
 *
 * This command:
 * 1. Creates a task directory with initial metadata
 * 2. Starts Plan Agent in background
 * 3. Plan Agent produces fully configured task directory (prd.md, etc.)
 *
 * After completion, use `trellis pipeline start` to launch the Dispatch Agent.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import { ensureDeveloper } from "../../core/developer/index.js";
import { createTask } from "../../core/task/index.js";
import { getPlatformAdapter } from "../../core/platforms/index.js";
import { agentFileExists } from "../../core/platforms/claude/launcher.js";
import type { DevType, TaskPriority } from "../../types/task.js";

export interface PipelinePlanOptions {
  name: string;
  type: DevType;
  verbose?: boolean;
  json?: boolean;
}

export interface PipelinePlanResult {
  taskDir: string;
  pid: number;
  logFile: string;
}

/**
 * Start Plan Agent to analyze requirements and create task configuration
 */
export async function pipelinePlan(
  requirement: string,
  options: PipelinePlanOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  // Validate environment
  if (!isTrellisInitialized(repoRoot)) {
    console.error(chalk.red("Error: Trellis not initialized. Run: trellis init"));
    process.exit(1);
  }

  // Check platform support
  const adapter = getPlatformAdapter(repoRoot);
  if (!adapter.supportsMultiAgent()) {
    console.error(
      chalk.red(
        `Error: Platform '${adapter.platform}' does not support multi-agent pipeline.`,
      ),
    );
    console.error("Please use manual workflow or switch to a supported platform.");
    process.exit(1);
  }

  // Validate dev type
  const validDevTypes: DevType[] = ["backend", "frontend", "fullstack", "test"];
  if (!validDevTypes.includes(options.type)) {
    console.error(
      chalk.red(`Error: Invalid dev type. Use: ${validDevTypes.join(", ")}`),
    );
    process.exit(1);
  }

  // Validate plan agent exists
  if (!agentFileExists("plan", repoRoot)) {
    console.error(
      chalk.red("Error: Plan agent not found at .claude/agents/plan.md"),
    );
    console.error("Ensure your Trellis setup includes the plan agent.");
    process.exit(1);
  }

  // Ensure developer is initialized
  const developer = ensureDeveloper(repoRoot);

  if (!options.json) {
    console.error("");
    console.error(chalk.blue("=== Multi-Agent Pipeline: Plan ==="));
    console.error(`Task: ${options.name}`);
    console.error(`Type: ${options.type}`);
    console.error(`Requirement: ${requirement}`);
    console.error("");
  }

  // Step 1: Create task directory
  if (!options.json) {
    console.error(chalk.yellow("Step 1: Creating task directory..."));
  }

  const taskPath = createTask(
    requirement,
    {
      slug: options.name,
      assignee: developer,
      priority: "P2" as TaskPriority,
      description: requirement,
    },
    repoRoot,
  );

  const taskDirAbs = path.join(repoRoot, taskPath);

  if (!options.json) {
    console.error(chalk.green(`Task directory: ${taskPath}`));
  }

  // Step 2: Start Plan Agent
  if (!options.json) {
    console.error(chalk.yellow("Step 2: Starting Plan Agent in background..."));
  }

  const logFile = path.join(taskDirAbs, ".plan-log");
  fs.writeFileSync(logFile, "");

  // Create runner script for Plan Agent
  const runnerScript = path.join(taskDirAbs, ".plan-runner.sh");
  const runnerContent = createPlanRunnerScript({
    repoRoot,
    taskName: options.name,
    devType: options.type,
    taskDir: taskPath,
    requirement,
  });

  fs.writeFileSync(runnerScript, runnerContent, { mode: 0o755 });

  // Launch Plan Agent in background
  const { execa } = await import("execa");

  const subprocess = execa(runnerScript, [], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      AGENT_HTTPS_PROXY: process.env.https_proxy ?? process.env.HTTPS_PROXY ?? "",
      AGENT_HTTP_PROXY: process.env.http_proxy ?? process.env.HTTP_PROXY ?? "",
      AGENT_ALL_PROXY: process.env.all_proxy ?? process.env.ALL_PROXY ?? "",
    },
  });

  // Pipe output to log file
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  if (subprocess.stdout) {
    subprocess.stdout.pipe(logStream);
  }
  if (subprocess.stderr) {
    subprocess.stderr.pipe(logStream);
  }

  subprocess.unref();

  const pid = subprocess.pid ?? 0;

  if (!options.json) {
    console.error(chalk.green(`Plan Agent started (PID: ${pid})`));
  }

  // Output result
  const result: PipelinePlanResult = {
    taskDir: taskPath,
    pid,
    logFile,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Data output to stdout for piping
    console.log(taskPath);

    // User messages to stderr
    console.error("");
    console.error(chalk.green("=== Plan Agent Running ==="));
    console.error("");
    console.error(`  Task:  ${options.name}`);
    console.error(`  Type:  ${options.type}`);
    console.error(`  Dir:   ${taskPath}`);
    console.error(`  Log:   ${logFile}`);
    console.error(`  PID:   ${pid}`);
    console.error("");
    console.error(chalk.yellow("To monitor:"));
    console.error(`  tail -f ${logFile}`);
    console.error("");
    console.error(chalk.yellow("After completion, run:"));
    console.error(`  trellis pipeline start ${taskPath}`);
  }
}

/**
 * Create runner script for Plan Agent
 */
function createPlanRunnerScript(options: {
  repoRoot: string;
  taskName: string;
  devType: DevType;
  taskDir: string;
  requirement: string;
}): string {
  const { repoRoot, taskName, devType, taskDir, requirement } = options;

  // Escape single quotes in requirement
  const escapedRequirement = requirement.replace(/'/g, "'\"'\"'");

  return `#!/bin/bash
cd "${repoRoot}"

export PLAN_TASK_NAME="${taskName}"
export PLAN_DEV_TYPE="${devType}"
export PLAN_TASK_DIR="${taskDir}"
export PLAN_REQUIREMENT='${escapedRequirement}'

export https_proxy="\${AGENT_HTTPS_PROXY:-}"
export http_proxy="\${AGENT_HTTP_PROXY:-}"
export all_proxy="\${AGENT_ALL_PROXY:-}"
export CLAUDE_NON_INTERACTIVE=1

# Use --agent flag to load plan agent directly
claude -p --agent plan --dangerously-skip-permissions --output-format stream-json --verbose "Start planning for task: ${taskName}"

# Self-delete the runner script
rm -f "$0"
`;
}
