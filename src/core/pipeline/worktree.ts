/**
 * Pipeline worktree management
 *
 * Extended worktree operations for the multi-agent pipeline.
 * Builds on top of core/git/worktree.ts with pipeline-specific functionality.
 */

import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { getRepoRoot } from "../paths.js";
import {
  createWorktree as gitCreateWorktree,
  removeWorktree as gitRemoveWorktree,
  getWorktreeByBranch,
  worktreeExistsForBranch,
} from "../git/worktree.js";
import {
  loadWorktreeConfig,
  getWorktreeBaseDir,
} from "../git/config.js";
import { getCurrentBranchAsync } from "../git/base.js";
import { readTask, updateTask } from "../task/crud.js";
import { setCurrentTaskInDir } from "./state.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating a pipeline worktree
 */
export interface CreatePipelineWorktreeOptions {
  /** Git branch name for the worktree */
  branch: string;
  /** Base branch to create from (defaults to current branch) */
  baseBranch?: string;
  /** Task directory (relative path) - will be copied and set as current task */
  taskDir?: string;
  /** Repository root path */
  repoRoot?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Result from creating a pipeline worktree
 */
export interface CreatePipelineWorktreeResult {
  /** Absolute path to the created worktree */
  worktreePath: string;
  /** Branch name */
  branch: string;
  /** Base branch (PR target) */
  baseBranch: string;
  /** Files copied count */
  filesCopied: number;
  /** Hooks executed count */
  hooksRun: number;
}

// =============================================================================
// Pipeline Worktree Operations
// =============================================================================

/**
 * Create a worktree for the pipeline with all necessary setup
 *
 * This performs the complete worktree setup for multi-agent pipeline:
 * 1. Create git worktree
 * 2. Copy environment files
 * 3. Copy task directory (if not committed yet)
 * 4. Run post-create hooks
 * 5. Set current task in worktree
 *
 * @param options - Worktree creation options
 * @returns Creation result with worktree path and statistics
 */
export async function createPipelineWorktree(
  options: CreatePipelineWorktreeOptions,
): Promise<CreatePipelineWorktreeResult> {
  const { branch, taskDir, verbose = false } = options;
  const repoRoot = options.repoRoot ?? getRepoRoot();

  // Determine base branch
  const baseBranch =
    options.baseBranch ?? (await getCurrentBranchAsync(repoRoot)) ?? "main";

  // Check if worktree already exists
  if (await worktreeExistsForBranch(branch, repoRoot)) {
    const existing = await getWorktreeByBranch(branch, repoRoot);
    if (existing) {
      if (verbose) {
        console.error(`Worktree already exists: ${existing.path}`);
      }
      return {
        worktreePath: existing.path,
        branch,
        baseBranch,
        filesCopied: 0,
        hooksRun: 0,
      };
    }
  }

  // Create worktree using git module
  if (verbose) {
    console.error(`Creating worktree for branch: ${branch}`);
  }

  const worktreePath = await gitCreateWorktree(
    branch,
    undefined, // Let git module determine path from config
    baseBranch,
    repoRoot,
  );

  // Copy additional files not handled by git module
  let filesCopied = 0;

  // Copy task directory if provided and not yet committed
  if (taskDir) {
    const taskDirAbs = path.join(repoRoot, taskDir);
    const targetTaskDir = path.join(worktreePath, taskDir);

    if (fs.existsSync(taskDirAbs)) {
      // Ensure parent directory exists
      const targetParent = path.dirname(targetTaskDir);
      if (!fs.existsSync(targetParent)) {
        fs.mkdirSync(targetParent, { recursive: true });
      }

      // Copy task directory recursively
      await copyDirectoryRecursive(taskDirAbs, targetTaskDir);
      filesCopied++;

      if (verbose) {
        console.error(`Copied task directory: ${taskDir}`);
      }
    }

    // Set current task in worktree
    setCurrentTaskInDir(worktreePath, taskDir);

    if (verbose) {
      console.error(`Set current task in worktree: ${taskDir}`);
    }
  }

  // Note: Environment files and post-create hooks are already handled
  // by the git/worktree.ts createWorktree function

  // Get counts from config for reporting
  const config = loadWorktreeConfig(repoRoot);
  const hooksRun = config.post_create?.length ?? 0;

  return {
    worktreePath,
    branch,
    baseBranch,
    filesCopied,
    hooksRun,
  };
}

/**
 * Remove a pipeline worktree and update related state
 *
 * @param worktreePath - Path to the worktree to remove
 * @param options - Removal options
 */
export async function removePipelineWorktree(
  worktreePath: string,
  options: {
    repoRoot?: string;
    force?: boolean;
    verbose?: boolean;
  } = {},
): Promise<void> {
  const { repoRoot, force = false, verbose = false } = options;

  if (!fs.existsSync(worktreePath)) {
    if (verbose) {
      console.error(`Worktree directory does not exist: ${worktreePath}`);
    }
    return;
  }

  if (verbose) {
    console.error(`Removing worktree: ${worktreePath}`);
  }

  await gitRemoveWorktree(worktreePath, force, repoRoot);

  if (verbose) {
    console.error(`Worktree removed successfully`);
  }
}

/**
 * Prepare worktree for task execution
 *
 * Ensures the worktree has all necessary files for agent execution:
 * - Task directory is present
 * - Current task is set
 * - task.json is updated with worktree_path
 *
 * @param worktreePath - Path to the worktree
 * @param taskDir - Task directory (relative path)
 * @param repoRoot - Repository root path
 */
export async function prepareWorktreeForTask(
  worktreePath: string,
  taskDir: string,
  repoRoot?: string,
): Promise<void> {
  const root = repoRoot ?? getRepoRoot();
  const taskDirAbs = path.join(root, taskDir);

  // Copy task directory to worktree if not present
  const targetTaskDir = path.join(worktreePath, taskDir);
  if (!fs.existsSync(targetTaskDir) && fs.existsSync(taskDirAbs)) {
    const targetParent = path.dirname(targetTaskDir);
    if (!fs.existsSync(targetParent)) {
      fs.mkdirSync(targetParent, { recursive: true });
    }
    await copyDirectoryRecursive(taskDirAbs, targetTaskDir);
  }

  // Set current task in worktree
  setCurrentTaskInDir(worktreePath, taskDir);

  // Read existing task to preserve base_branch if already set
  const existingTask = readTask(taskDirAbs);

  // Only calculate base_branch if not already set in task
  const baseBranch =
    existingTask?.base_branch ?? (await getCurrentBranchAsync(root));

  // Update task.json with worktree_path (in both main repo and worktree)
  // Only update base_branch if it wasn't already set
  const updates: { worktree_path: string; base_branch?: string } = {
    worktree_path: worktreePath,
  };

  if (!existingTask?.base_branch) {
    updates.base_branch = baseBranch;
  }

  // Update in main repo
  updateTask(taskDirAbs, updates);

  // Update in worktree (if task.json exists there)
  if (fs.existsSync(targetTaskDir)) {
    updateTask(targetTaskDir, updates);
  }
}

/**
 * Get the worktree path for a task
 *
 * Checks task.json for worktree_path, or derives from branch name.
 *
 * @param taskDir - Task directory (relative or absolute path)
 * @param repoRoot - Repository root path
 * @returns Worktree path or null
 */
export function getWorktreePathForTask(
  taskDir: string,
  repoRoot?: string,
): string | null {
  const root = repoRoot ?? getRepoRoot();
  const taskDirAbs = path.isAbsolute(taskDir)
    ? taskDir
    : path.join(root, taskDir);

  const task = readTask(taskDirAbs);

  if (!task) {
    return null;
  }

  // Check if worktree_path is set in task
  if (task.worktree_path && fs.existsSync(task.worktree_path)) {
    return task.worktree_path;
  }

  // Try to find by branch
  if (task.branch) {
    const baseDir = getWorktreeBaseDir(root);
    const worktreePath = path.join(baseDir, task.branch);

    if (fs.existsSync(worktreePath)) {
      return worktreePath;
    }
  }

  return null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Copy a directory recursively
 *
 * @param src - Source directory
 * @param dest - Destination directory
 */
async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Run a shell command in a directory
 *
 * @param command - Command to run
 * @param cwd - Working directory
 * @param verbose - Log output
 * @returns True if command succeeded
 */
export async function runCommand(
  command: string,
  cwd: string,
  verbose = false,
): Promise<boolean> {
  try {
    if (verbose) {
      console.error(`Running: ${command}`);
    }

    await execa(command, { cwd, shell: true });
    return true;
  } catch {
    if (verbose) {
      console.error(`Command failed: ${command}`);
    }
    return false;
  }
}
