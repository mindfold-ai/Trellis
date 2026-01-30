/**
 * trellis task create - Create a new task
 */

import chalk from "chalk";
import { createTask } from "../../core/task.js";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import type { TaskPriority } from "../../types/task.js";

export interface TaskCreateOptions {
  slug?: string;
  assignee?: string;
  priority?: string;
  description?: string;
  json?: boolean;
}

/**
 * Create a new task
 */
export async function taskCreate(
  title: string,
  options: TaskCreateOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!title) {
    console.error(chalk.red("Error: Task title is required"));
    console.error(
      "Usage: trellis task create <title> [--slug <name>] [--priority P0|P1|P2|P3]",
    );
    process.exit(1);
  }

  // Validate priority
  const validPriorities = ["P0", "P1", "P2", "P3"];
  const priority = (options.priority ?? "P2") as TaskPriority;
  if (!validPriorities.includes(priority)) {
    console.error(chalk.red(`Error: Invalid priority. Use: ${validPriorities.join(", ")}`));
    process.exit(1);
  }

  try {
    const taskPath = createTask(
      title,
      {
        slug: options.slug,
        assignee: options.assignee,
        priority,
        description: options.description,
      },
      repoRoot,
    );

    if (options.json) {
      console.log(JSON.stringify({ path: taskPath }));
      return;
    }

    // Output path first for script chaining
    console.log(taskPath);

    console.error(chalk.green(`Created task: ${taskPath.split("/").pop()}`));
    console.error("");
    console.error(chalk.blue("Next steps:"));
    console.error("  1. Create prd.md with requirements");
    console.error(
      `  2. Run: trellis task context init ${taskPath} <dev_type>`,
    );
    console.error(`  3. Run: trellis task start ${taskPath}`);
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
