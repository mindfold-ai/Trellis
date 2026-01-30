/**
 * trellis pipeline cleanup - Clean up agent and worktree
 *
 * This command:
 * 1. Stops the agent process (if running)
 * 2. Archives task directory (optional)
 * 3. Removes agent from registry
 * 4. Removes git worktree
 */

import chalk from "chalk";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import { ensureDeveloper } from "../../core/developer/index.js";
import {
  cleanupPipeline,
  getPipelineStatus,
  searchAgent,
} from "../../core/pipeline/index.js";

export interface PipelineCleanupOptions {
  archive?: boolean;
  force?: boolean;
  json?: boolean;
}

/**
 * Clean up an agent and its worktree
 */
export async function pipelineCleanup(
  agentId: string,
  options: PipelineCleanupOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  // Validate environment
  if (!isTrellisInitialized(repoRoot)) {
    console.error(chalk.red("Error: Trellis not initialized. Run: trellis init"));
    process.exit(1);
  }

  // Ensure developer is initialized
  ensureDeveloper(repoRoot);

  // Try to find agent (supports partial matching)
  const agent = searchAgent(agentId, repoRoot);

  if (!agent) {
    console.error(chalk.red(`Error: Agent not found: ${agentId}`));
    console.error("");
    console.error(chalk.gray("Use 'trellis pipeline status' to list available agents."));
    process.exit(1);
  }

  // Use the found agent's actual ID
  const actualAgentId = agent.id;

  // Get status for display
  const status = getPipelineStatus(actualAgentId, repoRoot);

  if (!options.json) {
    console.log("");
    console.log(chalk.blue("=== Cleanup Agent ==="));
    console.log("");
    console.log(`  Agent ID:  ${actualAgentId}`);
    console.log(`  Worktree:  ${agent.worktree_path}`);
    console.log(`  Task Dir:  ${agent.task_dir}`);
    if (status) {
      console.log(`  Status:    ${status.processRunning ? chalk.green("Running") : chalk.red("Stopped")}`);
    }
    console.log("");
  }

  try {
    // Perform cleanup
    await cleanupPipeline({
      agentId: actualAgentId,
      repoRoot,
      archive: options.archive,
      force: options.force,
    });

    // Output result
    if (options.json) {
      console.log(
        JSON.stringify({
          agentId: actualAgentId,
          archived: options.archive ?? false,
          success: true,
        }),
      );
    } else {
      console.log(chalk.green("Cleanup complete:"));
      console.log(`  - Agent stopped and removed from registry`);
      console.log(`  - Worktree removed`);
      if (options.archive) {
        console.log(`  - Task archived`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    } else {
      console.error(chalk.red("Error:"), error);
    }
    process.exit(1);
  }
}
