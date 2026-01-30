/**
 * trellis pipeline start - Start Dispatch Agent for a task
 *
 * This command:
 * 1. Validates task (prd.md exists, not rejected)
 * 2. Creates worktree with environment setup
 * 3. Launches Dispatch Agent via platform adapter
 * 4. Registers agent to registry
 */

import chalk from "chalk";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import { ensureDeveloper } from "../../core/developer/index.js";
import { getPlatformAdapter } from "../../core/platforms/index.js";
import { agentFileExists } from "../../core/platforms/claude/launcher.js";
import {
  startPipeline,
  type StartPipelineResult,
} from "../../core/pipeline/index.js";

export interface PipelineStartOptions {
  verbose?: boolean;
  json?: boolean;
}

/**
 * Start Dispatch Agent for a task
 *
 * Creates worktree, copies environment files, runs hooks, and launches agent.
 */
export async function pipelineStart(
  taskDir: string,
  options: PipelineStartOptions,
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

  // Validate dispatch agent exists
  if (!agentFileExists("dispatch", repoRoot)) {
    console.error(
      chalk.red("Error: Dispatch agent not found at .claude/agents/dispatch.md"),
    );
    console.error("Ensure your Trellis setup includes the dispatch agent.");
    process.exit(1);
  }

  // Ensure developer is initialized
  ensureDeveloper(repoRoot);

  if (!options.json) {
    console.error("");
    console.error(chalk.blue("=== Multi-Agent Pipeline: Start ==="));
    console.error(`Task: ${taskDir}`);
    console.error("");
  }

  try {
    // Start the pipeline (orchestrator handles all the steps)
    const result = await startPipeline({
      taskDir,
      repoRoot,
      verbose: options.verbose,
    });

    outputResult(result, options);
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));

      // Provide helpful hints for common errors
      if (error.message.includes("prd.md not found")) {
        console.error("");
        console.error(chalk.yellow("Hint: Run 'trellis pipeline plan' first to create the PRD."));
      } else if (error.message.includes("branch field not set")) {
        console.error("");
        console.error(chalk.yellow("Hint: Edit task.json and set the 'branch' field."));
      } else if (error.message.includes("rejected")) {
        console.error("");
        console.error(chalk.yellow("Hint: Review REJECTED.md and revise the requirements."));
      }
    } else {
      console.error(chalk.red("Error:"), error);
    }
    process.exit(1);
  }
}

/**
 * Output the result in the appropriate format
 */
function outputResult(result: StartPipelineResult, options: PipelineStartOptions): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          agentId: result.agent.id,
          pid: result.agent.pid,
          sessionId: result.agent.session_id,
          worktreePath: result.worktreePath,
          taskDir: result.agent.task_dir,
          logFile: result.logFile,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Data output to stdout for piping
  console.log(result.agent.id);

  // User messages to stderr
  console.error("");
  console.error(chalk.green("=== Agent Started ==="));
  console.error("");
  console.error(`  ID:        ${result.agent.id}`);
  console.error(`  PID:       ${result.agent.pid}`);
  if (result.agent.session_id) {
    console.error(`  Session:   ${result.agent.session_id}`);
  }
  console.error(`  Worktree:  ${result.worktreePath}`);
  console.error(`  Task:      ${result.agent.task_dir}`);
  console.error(`  Log:       ${result.logFile}`);
  console.error("");
  console.error(chalk.yellow("To monitor:"));
  console.error(`  tail -f ${result.logFile}`);
  console.error("");
  console.error(chalk.yellow("To stop:"));
  console.error(`  kill ${result.agent.pid}`);
  console.error("");
  if (result.agent.session_id) {
    console.error(chalk.yellow("To resume:"));
    console.error(`  cd ${result.worktreePath} && claude --resume ${result.agent.session_id}`);
  }
}
