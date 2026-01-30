/**
 * Runtime path utilities for Trellis workflow
 *
 * Extends constants/paths.ts with runtime functions that interact with the filesystem.
 */

import fs from "node:fs";
import path from "node:path";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";

// Re-export constants for convenience
export { DIR_NAMES, FILE_NAMES, PATHS };

/**
 * Find the repository root by looking for .trellis directory
 * Traverses up from current directory until found or reaches filesystem root
 */
export function getRepoRoot(startDir?: string): string {
  let current = startDir ?? process.cwd();

  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, DIR_NAMES.WORKFLOW))) {
      return current;
    }
    current = path.dirname(current);
  }

  // Fallback to current directory
  return startDir ?? process.cwd();
}

/**
 * Get absolute path to tasks directory
 */
export function getTasksDir(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, PATHS.TASKS);
}

/**
 * Get absolute path to archive directory
 */
export function getArchiveDir(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, PATHS.TASKS, DIR_NAMES.ARCHIVE);
}

/**
 * Get absolute path to a specific task directory
 */
export function getTaskDir(taskName: string, repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, PATHS.TASKS, taskName);
}

/**
 * Get absolute path to developer file
 */
export function getDeveloperFilePath(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, PATHS.DEVELOPER_FILE);
}

/**
 * Get absolute path to current task pointer file
 */
export function getCurrentTaskFilePath(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, PATHS.CURRENT_TASK_FILE);
}

/**
 * Get current task directory (relative path from repo root)
 * Returns null if no current task is set
 */
export function getCurrentTask(repoRoot?: string): string | null {
  const filePath = getCurrentTaskFilePath(repoRoot);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();
  return content || null;
}

/**
 * Get current task directory (absolute path)
 * Returns null if no current task is set
 */
export function getCurrentTaskAbs(repoRoot?: string): string | null {
  const root = repoRoot ?? getRepoRoot();
  const relative = getCurrentTask(root);

  if (!relative) {
    return null;
  }

  return path.join(root, relative);
}

/**
 * Set the current task
 * @param taskPath - Relative path from repo root (e.g., ".trellis/tasks/01-21-my-task")
 */
export function setCurrentTask(taskPath: string, repoRoot?: string): void {
  const root = repoRoot ?? getRepoRoot();
  const filePath = getCurrentTaskFilePath(root);

  // Verify task directory exists
  const fullPath = path.join(root, taskPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Task directory not found: ${taskPath}`);
  }

  fs.writeFileSync(filePath, taskPath);
}

/**
 * Clear the current task pointer
 */
export function clearCurrentTask(repoRoot?: string): void {
  const filePath = getCurrentTaskFilePath(repoRoot);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Check if a current task is set
 */
export function hasCurrentTask(repoRoot?: string): boolean {
  return getCurrentTask(repoRoot) !== null;
}

/**
 * Get developer's workspace directory path
 */
export function getWorkspaceDir(
  developer: string,
  repoRoot?: string,
): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, PATHS.WORKSPACE, developer);
}

/**
 * Generate task date prefix (MM-DD format)
 */
export function generateTaskDatePrefix(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

/**
 * Convert a title to a URL-friendly slug
 * Only works reliably with ASCII characters
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/**
 * Ensure tasks directory exists
 */
export function ensureTasksDir(repoRoot?: string): void {
  const tasksDir = getTasksDir(repoRoot);
  const archiveDir = getArchiveDir(repoRoot);

  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
}

/**
 * Get relative path from repo root
 */
export function getRelativePath(absolutePath: string, repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.relative(root, absolutePath);
}

/**
 * Check if .trellis directory exists (project is initialized)
 */
export function isTrellisInitialized(repoRoot?: string): boolean {
  const root = repoRoot ?? getRepoRoot();
  return fs.existsSync(path.join(root, DIR_NAMES.WORKFLOW));
}
