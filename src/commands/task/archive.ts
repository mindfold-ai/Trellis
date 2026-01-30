/**
 * trellis task archive - Archive completed tasks
 */

import chalk from "chalk";
import { archiveTask, listArchivedTasks, listTasks } from "../../core/task.js";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";

export interface TaskArchiveOptions {
  json?: boolean;
}

export interface TaskListArchiveOptions {
  json?: boolean;
}

/**
 * Archive a completed task
 */
export async function taskArchive(
  taskName: string,
  options: TaskArchiveOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!taskName) {
    console.error(chalk.red("Error: Task name is required"));
    console.error("Usage: trellis task archive <task-name>");
    process.exit(1);
  }

  try {
    const archivePath = archiveTask(taskName, repoRoot);

    if (!archivePath) {
      console.error(chalk.red(`Error: Task not found: ${taskName}`));
      console.error("");
      console.error("Active tasks:");

      const tasks = listTasks({}, repoRoot);
      for (const { dirName } of tasks) {
        console.error(`  - ${dirName}`);
      }

      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify({ archivedTo: archivePath }));
      return;
    }

    // Extract year-month from path
    const parts = archivePath.split("/");
    const yearMonth = parts[parts.length - 2];

    console.log(chalk.green(`Archived: ${taskName} -> archive/${yearMonth}/`));
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * List archived tasks
 */
export async function taskListArchive(
  month: string | undefined,
  options: TaskListArchiveOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  const archived = listArchivedTasks(month, repoRoot);

  if (options.json) {
    console.log(JSON.stringify(archived, null, 2));
    return;
  }

  console.log(chalk.blue("Archived tasks:"));
  console.log("");

  if (archived.length === 0) {
    console.log("  (no archived tasks)");
    return;
  }

  if (month) {
    // List tasks for specific month
    console.log(`[${month}]`);
    for (const { dirName } of archived) {
      console.log(`  - ${dirName}/`);
    }
  } else {
    // Group by month
    const byMonth: Record<string, string[]> = {};
    for (const { dirName, month: m } of archived) {
      if (!byMonth[m]) {
        byMonth[m] = [];
      }
      byMonth[m].push(dirName);
    }

    for (const [m, tasks] of Object.entries(byMonth).sort().reverse()) {
      console.log(`[${m}] - ${tasks.length} task(s)`);
    }
  }
}
