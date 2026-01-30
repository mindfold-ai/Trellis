/**
 * Task utility functions
 *
 * Provides helper functions for task path validation, lookup, and archiving checks.
 */

import fs from "node:fs";
import path from "node:path";
import { getRepoRoot, getTasksDir, getTaskDir } from "../paths.js";
import { FILE_NAMES, PATHS } from "../../constants/paths.js";
import { type Task, type TaskStatus } from "./schemas.js";
import { readTask } from "./crud.js";

/**
 * Validate if a task path is safe to operate on
 *
 * Checks for:
 * - Empty or null paths
 * - Absolute paths (not allowed)
 * - Path traversal attempts (.., ./, etc.)
 * - Paths that resolve to repo root
 *
 * @param taskPath - Relative task path to validate
 * @param repoRoot - Repository root path
 * @returns true if the path is safe, false otherwise
 */
export function isValidTaskPath(taskPath: string, repoRoot?: string): boolean {
  const root = repoRoot ?? getRepoRoot();

  // Check empty or null
  if (!taskPath || taskPath === "null") {
    return false;
  }

  // Reject absolute paths
  if (path.isAbsolute(taskPath)) {
    return false;
  }

  // Reject path traversal attempts
  if (
    taskPath === "." ||
    taskPath === ".." ||
    taskPath.startsWith("./") ||
    taskPath.startsWith("../") ||
    taskPath.includes("..")
  ) {
    return false;
  }

  // Final check: ensure resolved path is not the repo root
  const absPath = path.join(root, taskPath);
  if (fs.existsSync(absPath)) {
    try {
      const resolved = fs.realpathSync(absPath);
      const rootResolved = fs.realpathSync(root);
      if (resolved === rootResolved) {
        return false;
      }
    } catch {
      // If realpath fails, path is likely invalid
      return false;
    }
  }

  return true;
}

/**
 * Validate if a task directory is valid (exists and contains task.json)
 *
 * @param taskDir - Absolute path to task directory
 * @returns true if directory is a valid task directory
 */
export function isValidTaskDir(taskDir: string): boolean {
  if (!fs.existsSync(taskDir)) {
    return false;
  }

  const taskJsonPath = path.join(taskDir, FILE_NAMES.TASK_JSON);
  return fs.existsSync(taskJsonPath);
}

/**
 * Get the full absolute path to a task directory
 *
 * @param taskDirOrName - Task directory name or relative path
 * @param repoRoot - Repository root path
 * @returns Absolute path to the task directory
 */
export function getTaskFullPath(taskDirOrName: string, repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();

  // If it's already an absolute path, return as-is
  if (path.isAbsolute(taskDirOrName)) {
    return taskDirOrName;
  }

  // If it's a relative path starting with .trellis, join with root
  if (taskDirOrName.startsWith(PATHS.TASKS)) {
    return path.join(root, taskDirOrName);
  }

  // Otherwise, treat as task name and use getTaskDir
  return getTaskDir(taskDirOrName, root);
}

/**
 * Get relative path to a task directory from repo root
 *
 * @param taskDir - Absolute path to task directory
 * @param repoRoot - Repository root path
 * @returns Relative path (e.g., ".trellis/tasks/01-21-my-task")
 */
export function getTaskRelativePath(taskDir: string, repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.relative(root, taskDir);
}

/**
 * Check if a task can be archived
 *
 * A task can be archived if:
 * - It exists and is valid
 * - Status is "completed" or "rejected"
 *
 * @param task - Task object to check
 * @returns true if the task can be archived
 */
export function canArchiveTask(task: Task): boolean {
  const archivableStatuses: TaskStatus[] = ["completed", "rejected"];
  return archivableStatuses.includes(task.status);
}

/**
 * Check if a task directory can be archived by path
 *
 * @param taskDir - Absolute path to task directory
 * @returns true if the task can be archived, false otherwise
 */
export function canArchiveTaskDir(taskDir: string): boolean {
  const task = readTask(taskDir);
  if (!task) {
    return false;
  }
  return canArchiveTask(task);
}

/**
 * Find task directory by name (exact or suffix match)
 *
 * Searches for:
 * 1. Exact match by directory name
 * 2. Suffix match (e.g., "my-task" matches "01-21-my-task")
 *
 * @param taskName - Task name or slug to search for
 * @param repoRoot - Repository root path
 * @returns Absolute path to task directory, or null if not found
 */
export function findTaskDirByName(
  taskName: string,
  repoRoot?: string,
): string | null {
  const tasksDir = getTasksDir(repoRoot);

  if (!fs.existsSync(tasksDir)) {
    return null;
  }

  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });

  // Try exact match first
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === taskName) {
      const taskDir = path.join(tasksDir, entry.name);
      if (isValidTaskDir(taskDir)) {
        return taskDir;
      }
    }
  }

  // Try suffix match
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(`-${taskName}`)) {
      const taskDir = path.join(tasksDir, entry.name);
      if (isValidTaskDir(taskDir)) {
        return taskDir;
      }
    }
  }

  return null;
}

/**
 * Get task name from directory path
 *
 * @param taskDir - Absolute or relative task directory path
 * @returns Task directory name (basename)
 */
export function getTaskNameFromDir(taskDir: string): string {
  return path.basename(taskDir);
}

/**
 * Parse date prefix from task directory name
 *
 * @param taskDirName - Task directory name (e.g., "01-21-my-task")
 * @returns Object with month, day, and slug, or null if format doesn't match
 */
export function parseTaskDirName(
  taskDirName: string,
): { month: string; day: string; slug: string } | null {
  const match = taskDirName.match(/^(\d{2})-(\d{2})-(.+)$/);
  if (!match) {
    return null;
  }

  return {
    month: match[1],
    day: match[2],
    slug: match[3],
  };
}

/**
 * Check if a task has a PRD document
 *
 * @param taskDir - Absolute path to task directory
 * @returns true if prd.md exists in the task directory
 */
export function hasPrd(taskDir: string): boolean {
  const prdPath = path.join(taskDir, FILE_NAMES.PRD);
  return fs.existsSync(prdPath);
}

/**
 * Get task PRD path
 *
 * @param taskDir - Absolute path to task directory
 * @returns Absolute path to prd.md
 */
export function getPrdPath(taskDir: string): string {
  return path.join(taskDir, FILE_NAMES.PRD);
}

/**
 * Check if task status allows starting work
 *
 * @param status - Task status to check
 * @returns true if work can be started on this task
 */
export function canStartTask(status: TaskStatus): boolean {
  return status === "planning";
}

/**
 * Check if task status indicates active work
 *
 * @param status - Task status to check
 * @returns true if task is actively being worked on
 */
export function isActiveTask(status: TaskStatus): boolean {
  return status === "in_progress";
}

/**
 * Check if task status indicates completion
 *
 * @param status - Task status to check
 * @returns true if task is finished (completed, archived, or rejected)
 */
export function isFinishedTask(status: TaskStatus): boolean {
  return status === "completed" || status === "archived" || status === "rejected";
}
