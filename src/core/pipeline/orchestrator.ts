/**
 * Pipeline orchestrator
 *
 * High-level orchestration for the multi-agent pipeline:
 * - Start pipeline (create worktree + launch agent + register)
 * - Stop pipeline (terminate agent + update status)
 * - Cleanup pipeline (remove worktree + archive task)
 * - Monitor pipeline (check status + process health)
 */

import fs from "node:fs";
import path from "node:path";
import { getRepoRoot } from "../paths.js";
import { readTask, updateTask, archiveTask } from "../task/crud.js";
import { getPlatformAdapter } from "../platforms/index.js";
import { getCurrentBranchAsync } from "../git/base.js";
import {
  type Agent,
  type StartPipelineOptions,
  type StartPipelineResult,
  type StopPipelineOptions,
  type CleanupPipelineOptions,
  type PipelineStatus,
} from "./schemas.js";
import {
  addAgent,
  getAgentById,
  getAgentByTaskDir,
  removeAgent,
  listAgents,
  updateAgentStatus,
  isProcessRunning,
  syncAgentStatuses,
} from "./state.js";
import {
  createPipelineWorktree,
  removePipelineWorktree,
  prepareWorktreeForTask,
  getWorktreePathForTask,
} from "./worktree.js";

// =============================================================================
// Start Pipeline
// =============================================================================

/**
 * Start a multi-agent pipeline for a task
 *
 * This orchestrates the full pipeline startup:
 * 1. Validate task (prd.md exists, not rejected)
 * 2. Create worktree with environment setup
 * 3. Launch agent via platform adapter
 * 4. Register agent to registry
 *
 * @param options - Pipeline start options
 * @returns Pipeline start result
 * @throws Error if task is invalid or platform doesn't support multi-agent
 */
export async function startPipeline(
  options: StartPipelineOptions,
): Promise<StartPipelineResult> {
  const { taskDir, verbose = false } = options;
  const repoRoot = options.repoRoot ?? getRepoRoot();

  // Normalize task directory path
  const taskDirAbs = path.isAbsolute(taskDir)
    ? taskDir
    : path.join(repoRoot, taskDir);
  const taskDirRel = path.isAbsolute(taskDir)
    ? path.relative(repoRoot, taskDir)
    : taskDir;

  // 1. Validate task
  const task = readTask(taskDirAbs);

  if (!task) {
    throw new Error(`Task not found: ${taskDir}`);
  }

  // Check for rejection
  if (task.status === "rejected") {
    const rejectedPath = path.join(taskDirAbs, "REJECTED.md");
    let reason = "Unknown reason";

    if (fs.existsSync(rejectedPath)) {
      reason = fs.readFileSync(rejectedPath, "utf-8");
    }

    throw new Error(`Task was rejected: ${reason}`);
  }

  // Check for prd.md (plan completed)
  const prdPath = path.join(taskDirAbs, "prd.md");
  if (!fs.existsSync(prdPath)) {
    throw new Error(
      "prd.md not found - Plan Agent may not have completed. " +
        "Run 'trellis pipeline plan' first.",
    );
  }

  // Check for branch
  if (!task.branch) {
    throw new Error(
      "branch field not set in task.json. Please set branch first: " +
        'trellis task update <task> --branch "task/my-branch"',
    );
  }

  // 2. Get platform adapter and check capabilities
  const adapter = getPlatformAdapter(repoRoot);

  if (!adapter.supportsMultiAgent()) {
    throw new Error(
      `Platform '${adapter.platform}' does not support multi-agent pipeline. ` +
        "Please use manual workflow or switch to a supported platform.",
    );
  }

  // 3. Get or create worktree
  const baseBranch =
    task.base_branch ?? (await getCurrentBranchAsync(repoRoot)) ?? "main";

  let worktreePath = getWorktreePathForTask(taskDirAbs, repoRoot);

  if (!worktreePath) {
    if (verbose) {
      console.error("Creating worktree...");
    }

    const worktreeResult = await createPipelineWorktree({
      branch: task.branch,
      baseBranch,
      taskDir: taskDirRel,
      repoRoot,
      verbose,
    });

    worktreePath = worktreeResult.worktreePath;

    // Update task with worktree info (both in main repo and worktree)
    const taskUpdates = {
      worktree_path: worktreePath,
      base_branch: baseBranch,
      status: "in_progress" as const,
    };

    // Update main repo copy
    updateTask(taskDirAbs, taskUpdates);

    // Update worktree copy so pipeline commands see correct state
    const worktreeTaskDir = path.join(worktreePath, taskDirRel);
    updateTask(worktreeTaskDir, taskUpdates);

    if (verbose) {
      console.error(`Worktree created: ${worktreePath}`);
      console.error(`Files copied: ${worktreeResult.filesCopied}`);
      console.error(`Hooks run: ${worktreeResult.hooksRun}`);
    }
  } else {
    if (verbose) {
      console.error(`Using existing worktree: ${worktreePath}`);
    }

    // Ensure task is prepared in worktree
    await prepareWorktreeForTask(worktreePath, taskDirRel, repoRoot);

    // Update task status to in_progress (same as new worktree case)
    const taskUpdates = {
      worktree_path: worktreePath,
      base_branch: baseBranch,
      status: "in_progress" as const,
    };

    // Update main repo copy
    updateTask(taskDirAbs, taskUpdates);

    // Update worktree copy
    const worktreeTaskDir = path.join(worktreePath, taskDirRel);
    updateTask(worktreeTaskDir, taskUpdates);
  }

  // 4. Launch agent
  if (verbose) {
    console.error("Launching agent...");
  }

  const agentProcess = await adapter.launchAgent({
    agentType: "dispatch",
    workDir: worktreePath,
    taskDir: taskDirRel,
    background: true,
  });

  if (verbose) {
    console.error(`Agent started with PID: ${agentProcess.pid}`);
    console.error(`Log file: ${agentProcess.logFile}`);
  }

  // 5. Create agent record and register
  const agentId = task.id ?? path.basename(task.branch).replace(/\//g, "-");

  const agent: Agent = {
    id: agentId,
    worktree_path: worktreePath,
    pid: agentProcess.pid,
    started_at: new Date().toISOString(),
    task_dir: taskDirRel,
    status: "running",
    session_id: agentProcess.sessionId,
  };

  addAgent(agent, repoRoot);

  if (verbose) {
    console.error(`Agent registered: ${agentId}`);
  }

  return {
    agent,
    worktreePath,
    logFile: agentProcess.logFile,
  };
}

// =============================================================================
// Stop Pipeline
// =============================================================================

/**
 * Stop a running pipeline
 *
 * Terminates the agent process and updates registry status.
 * Does NOT remove worktree - use cleanup for that.
 *
 * @param options - Stop options
 * @returns True if agent was stopped
 */
export async function stopPipeline(
  options: StopPipelineOptions,
): Promise<boolean> {
  const { agentId, force = false } = options;
  const repoRoot = options.repoRoot ?? getRepoRoot();

  const agent = getAgentById(agentId, repoRoot);

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Check if process is running
  if (!isProcessRunning(agent.pid)) {
    // Already stopped, just update status
    updateAgentStatus(agentId, "stopped", repoRoot);
    return true;
  }

  // Send termination signal
  try {
    const signal = force ? "SIGKILL" : "SIGTERM";
    process.kill(agent.pid, signal);

    // Update status
    updateAgentStatus(agentId, "stopped", repoRoot);

    return true;
  } catch {
    // Process might have already exited
    updateAgentStatus(agentId, "stopped", repoRoot);
    return true;
  }
}

// =============================================================================
// Cleanup Pipeline
// =============================================================================

/**
 * Clean up a pipeline
 *
 * Removes the worktree and optionally archives the task.
 * Agent should be stopped first.
 *
 * @param options - Cleanup options
 */
export async function cleanupPipeline(
  options: CleanupPipelineOptions,
): Promise<void> {
  const { agentId, archive = false, force = false } = options;
  const repoRoot = options.repoRoot ?? getRepoRoot();

  const agent = getAgentById(agentId, repoRoot);

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Ensure agent is stopped
  if (agent.status === "running" && isProcessRunning(agent.pid)) {
    await stopPipeline({ agentId, repoRoot, force });
  }

  // Remove worktree
  if (fs.existsSync(agent.worktree_path)) {
    await removePipelineWorktree(agent.worktree_path, {
      repoRoot,
      force,
    });
  }

  // Remove from registry
  removeAgent(agentId, repoRoot);

  // Archive task if requested
  if (archive) {
    const taskDirName = path.basename(agent.task_dir);
    archiveTask(taskDirName, repoRoot);
  }
}

// =============================================================================
// Pipeline Status
// =============================================================================

/**
 * Get detailed status for a pipeline
 *
 * @param agentId - Agent ID
 * @param repoRoot - Repository root path
 * @returns Pipeline status or null if not found
 */
export function getPipelineStatus(
  agentId: string,
  repoRoot?: string,
): PipelineStatus | null {
  const root = repoRoot ?? getRepoRoot();

  const agent = getAgentById(agentId, root);

  if (!agent) {
    return null;
  }

  // Read task info from worktree (where agent is actually working)
  // The worktree has its own copy of task.json that gets updated during execution
  const taskDirAbs = path.join(agent.worktree_path, agent.task_dir);
  const task = readTask(taskDirAbs);

  if (!task) {
    return null;
  }

  // Check process status
  const processRunning = isProcessRunning(agent.pid);

  // Update status if needed
  if (agent.status === "running" && !processRunning) {
    updateAgentStatus(agentId, "stopped", root);
    agent.status = "stopped";
  }

  // Read last few log lines if available
  const logFile = path.join(agent.worktree_path, ".agent-log");
  let lastLogLines: string[] | undefined;

  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      lastLogLines = lines.slice(-10);
    } catch {
      // Ignore read errors
    }
  }

  return {
    agent,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      branch: task.branch,
      current_phase: task.current_phase,
    },
    processRunning,
    lastLogLines,
  };
}

/**
 * List all pipelines with status
 *
 * @param repoRoot - Repository root path
 * @returns Array of pipeline statuses
 */
export function listPipelineStatuses(repoRoot?: string): PipelineStatus[] {
  const root = repoRoot ?? getRepoRoot();

  // Sync statuses first
  syncAgentStatuses(root);

  const agents = listAgents(root);
  const statuses: PipelineStatus[] = [];

  for (const agent of agents) {
    const status = getPipelineStatus(agent.id, root);

    if (status) {
      statuses.push(status);
    }
  }

  return statuses;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a task has an active pipeline
 *
 * @param taskDir - Task directory (relative or absolute)
 * @param repoRoot - Repository root path
 * @returns True if there's an active (running) agent for this task
 */
export function hasActivePipeline(
  taskDir: string,
  repoRoot?: string,
): boolean {
  const root = repoRoot ?? getRepoRoot();
  const taskDirRel = path.isAbsolute(taskDir)
    ? path.relative(root, taskDir)
    : taskDir;

  const agent = getAgentByTaskDir(taskDirRel, root);

  if (!agent) {
    return false;
  }

  return agent.status === "running" && isProcessRunning(agent.pid);
}

/**
 * Get agent for a task
 *
 * @param taskDir - Task directory (relative or absolute)
 * @param repoRoot - Repository root path
 * @returns Agent or null
 */
export function getAgentForTask(
  taskDir: string,
  repoRoot?: string,
): Agent | null {
  const root = repoRoot ?? getRepoRoot();
  const taskDirRel = path.isAbsolute(taskDir)
    ? path.relative(root, taskDir)
    : taskDir;

  return getAgentByTaskDir(taskDirRel, root);
}
