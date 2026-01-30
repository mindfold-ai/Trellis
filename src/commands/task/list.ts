/**
 * trellis task list - List active tasks
 */

import chalk from "chalk";
import { listTasks } from "../../core/task.js";
import { getDeveloper } from "../../core/developer.js";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import type { TaskStatus } from "../../types/task.js";

export interface TaskListOptions {
  mine?: boolean;
  status?: string;
  json?: boolean;
}

/**
 * List active tasks
 */
export async function taskList(options: TaskListOptions): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  const developer = getDeveloper(repoRoot);

  // Validate status if provided
  const validStatuses: TaskStatus[] = ["planning", "in_progress", "completed", "archived"];
  if (options.status && !validStatuses.includes(options.status as TaskStatus)) {
    console.error(
      chalk.red(`Error: Invalid status. Use: ${validStatuses.join(", ")}`),
    );
    process.exit(1);
  }

  const tasks = listTasks(
    {
      mine: options.mine,
      status: options.status as TaskStatus | undefined,
    },
    repoRoot,
  );

  if (options.json) {
    const output = tasks.map((t) => ({
      dirName: t.dirName,
      ...t.task,
      isCurrent: t.isCurrent,
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Header
  if (options.mine) {
    if (!developer) {
      console.error(
        chalk.red("Error: No developer set. Run: trellis init -u <name>"),
      );
      process.exit(1);
    }
    console.log(chalk.blue(`My tasks (assignee: ${developer}):`));
  } else {
    console.log(chalk.blue("All active tasks:"));
  }
  console.log("");

  if (tasks.length === 0) {
    if (options.mine) {
      console.log("  (no tasks assigned to you)");
    } else {
      console.log("  (no active tasks)");
    }
  } else {
    for (const { task, dirName, isCurrent } of tasks) {
      const marker = isCurrent ? chalk.green(" <- current") : "";
      if (options.mine) {
        console.log(`  - ${dirName}/ (${task.status})${marker}`);
      } else {
        console.log(
          `  - ${dirName}/ (${task.status}) [${chalk.cyan(task.assignee)}]${marker}`,
        );
      }
    }
  }

  console.log("");
  console.log(`Total: ${tasks.length} task(s)`);
}
