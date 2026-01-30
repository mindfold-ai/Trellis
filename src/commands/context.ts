/**
 * trellis context - Display session context for AI agents
 */

import fs from "node:fs";
import chalk from "chalk";
import {
  getRepoRoot,
  getCurrentTask,
  isTrellisInitialized,
  PATHS,
} from "../core/paths.js";
import {
  getDeveloper,
  getActiveJournalFile,
  countLines,
} from "../core/developer.js";
import {
  getGitStatus,
  getRecentCommits,
  isGitRepo,
} from "../core/git.js";
import { readTask, listTasks } from "../core/task.js";
import path from "node:path";

export interface ContextOptions {
  json?: boolean;
}

interface TaskSummary {
  dir: string;
  name: string;
  status: string;
}

interface ContextOutput {
  developer: string | null;
  git: {
    branch: string;
    isClean: boolean;
    uncommittedChanges: number;
    recentCommits: Array<{ hash: string; message: string }>;
  };
  tasks: {
    active: TaskSummary[];
    directory: string;
  };
  currentTask: {
    path: string | null;
    name: string | null;
    status: string | null;
    hasPrd: boolean;
  };
  journal: {
    file: string | null;
    lines: number;
    nearLimit: boolean;
  };
}

/**
 * Generate context data
 */
function getContextData(): ContextOutput {
  const repoRoot = getRepoRoot();
  const developer = getDeveloper(repoRoot);
  const gitStatus = getGitStatus(repoRoot);
  const recentCommits = getRecentCommits(5, repoRoot);

  // Get active tasks
  const tasks = listTasks({}, repoRoot);
  const activeTasks: TaskSummary[] = tasks.map((t) => ({
    dir: t.dirName,
    name: t.task.name,
    status: t.task.status,
  }));

  // Get current task
  const currentTaskPath = getCurrentTask(repoRoot);
  let currentTaskName: string | null = null;
  let currentTaskStatus: string | null = null;
  let hasPrd = false;

  if (currentTaskPath) {
    const taskDir = path.join(repoRoot, currentTaskPath);
    const task = readTask(taskDir);
    if (task) {
      currentTaskName = task.name;
      currentTaskStatus = task.status;
    }
    hasPrd = fs.existsSync(path.join(taskDir, "prd.md"));
  }

  // Get journal info
  const journalFile = getActiveJournalFile(repoRoot);
  const journalLines = journalFile ? countLines(journalFile) : 0;
  const journalRelative = journalFile
    ? path.relative(repoRoot, journalFile)
    : null;

  return {
    developer,
    git: {
      branch: gitStatus.branch,
      isClean: gitStatus.isClean,
      uncommittedChanges: gitStatus.uncommittedChanges,
      recentCommits,
    },
    tasks: {
      active: activeTasks,
      directory: PATHS.TASKS,
    },
    currentTask: {
      path: currentTaskPath,
      name: currentTaskName,
      status: currentTaskStatus,
      hasPrd,
    },
    journal: {
      file: journalRelative,
      lines: journalLines,
      nearLimit: journalLines > 1800,
    },
  };
}

/**
 * Output context in JSON format
 */
function outputJson(data: ContextOutput): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Output context in text format
 */
function outputText(data: ContextOutput): void {
  const repoRoot = getRepoRoot();

  console.log("========================================");
  console.log("SESSION CONTEXT");
  console.log("========================================");
  console.log("");

  // Developer
  console.log("## DEVELOPER");
  if (!data.developer) {
    console.log(
      chalk.red("ERROR: Not initialized. Run: trellis init -u <name>"),
    );
    return;
  }
  console.log(`Name: ${data.developer}`);
  console.log("");

  // Git Status
  console.log("## GIT STATUS");
  console.log(`Branch: ${data.git.branch}`);
  if (data.git.isClean) {
    console.log("Working directory: Clean");
  } else {
    console.log(
      `Working directory: ${data.git.uncommittedChanges} uncommitted change(s)`,
    );
  }
  console.log("");

  // Recent Commits
  console.log("## RECENT COMMITS");
  if (data.git.recentCommits.length === 0) {
    console.log("(no commits)");
  } else {
    for (const commit of data.git.recentCommits) {
      console.log(`${commit.hash} ${commit.message}`);
    }
  }
  console.log("");

  // Current Task
  console.log("## CURRENT TASK");
  if (data.currentTask.path) {
    console.log(`Path: ${data.currentTask.path}`);
    if (data.currentTask.name) {
      console.log(`Name: ${data.currentTask.name}`);
    }
    if (data.currentTask.status) {
      console.log(`Status: ${data.currentTask.status}`);
    }
    if (data.currentTask.hasPrd) {
      console.log("");
      console.log("[!] This task has prd.md - read it for task details");
    }
  } else {
    console.log("(none)");
  }
  console.log("");

  // Active Tasks
  console.log("## ACTIVE TASKS");
  if (data.tasks.active.length === 0) {
    console.log("(no active tasks)");
  } else {
    for (const task of data.tasks.active) {
      const marker =
        data.currentTask.path?.includes(task.dir)
          ? chalk.green(" <- current")
          : "";
      console.log(`- ${task.dir}/ (${task.status})${marker}`);
    }
  }
  console.log(`Total: ${data.tasks.active.length} active task(s)`);
  console.log("");

  // My Tasks
  console.log("## MY TASKS (Assigned to me)");
  const myTasks = listTasks({ mine: true }, repoRoot);
  if (myTasks.length === 0) {
    console.log("(no tasks assigned to you)");
  } else {
    for (const { task } of myTasks) {
      console.log(`- [${task.priority}] ${task.title} (${task.status})`);
    }
  }
  console.log("");

  // Journal
  console.log("## JOURNAL FILE");
  if (data.journal.file) {
    console.log(`Active file: ${data.journal.file}`);
    console.log(`Line count: ${data.journal.lines} / 2000`);
    if (data.journal.nearLimit) {
      console.log(chalk.yellow("[!] WARNING: Approaching 2000 line limit!"));
    }
  } else {
    console.log("No journal file found");
  }
  console.log("");

  // Paths
  console.log("## PATHS");
  console.log(`Workspace: ${PATHS.WORKSPACE}/${data.developer}/`);
  console.log(`Tasks: ${PATHS.TASKS}/`);
  console.log(`Spec: ${PATHS.SPEC}/`);
  console.log("");

  console.log("========================================");
}

/**
 * Main context command handler
 */
export async function context(options: ContextOptions): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isTrellisInitialized(repoRoot)) {
    console.error(
      chalk.red("Error: Trellis not initialized. Run: trellis init"),
    );
    process.exit(1);
  }

  if (!isGitRepo(repoRoot)) {
    console.error(chalk.red("Error: Not a git repository"));
    process.exit(1);
  }

  const data = getContextData();

  if (options.json) {
    outputJson(data);
  } else {
    outputText(data);
  }
}
