/**
 * trellis task start/finish - Current task management
 */

import chalk from "chalk";
import path from "node:path";
import fs from "node:fs";
import {
  getCurrentTask,
  setCurrentTask,
  clearCurrentTask,
  getRepoRoot,
  isTrellisInitialized,
} from "../../core/paths.js";

/**
 * Set a task as the current task
 */
export async function taskStart(taskDir: string): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!taskDir) {
    console.error(chalk.red("Error: Task directory is required"));
    console.error("Usage: trellis task start <task-dir>");
    process.exit(1);
  }

  // Handle both absolute and relative paths
  let relativePath = taskDir;
  if (path.isAbsolute(taskDir)) {
    relativePath = path.relative(repoRoot, taskDir);
  }

  // Verify directory exists
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(chalk.red(`Error: Task directory not found: ${relativePath}`));
    process.exit(1);
  }

  try {
    setCurrentTask(relativePath, repoRoot);
    console.log(chalk.green(`✓ Current task set to: ${relativePath}`));
    console.log("");
    console.log(
      chalk.blue("The hook will now inject context from this task's jsonl files."),
    );
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * Clear the current task
 */
export async function taskFinish(): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  const current = getCurrentTask(repoRoot);

  if (!current) {
    console.log(chalk.yellow("No current task set"));
    return;
  }

  clearCurrentTask(repoRoot);
  console.log(chalk.green(`✓ Cleared current task (was: ${current})`));
}
