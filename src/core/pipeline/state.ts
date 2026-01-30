/**
 * Pipeline state management
 *
 * Unified state management for:
 * - Agent registry (workspace/{developer}/.agents/registry.json)
 * - Phase tracking (task.json current_phase field)
 * - Current task pointer (.trellis/.current-task)
 */

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  getWorkspaceDir,
  getCurrentTask as getCurrentTaskPath,
  setCurrentTask as setCurrentTaskPath,
  clearCurrentTask as clearCurrentTaskPath,
} from "../paths.js";
import { ensureDeveloper } from "../developer/index.js";
import { readTask, writeTask } from "../task/crud.js";
import { FILE_NAMES } from "../../constants/paths.js";
import {
  type Agent,
  type AgentStatus,
  type Registry,
  DEFAULT_REGISTRY,
  safeParseRegistry,
} from "./schemas.js";

// =============================================================================
// Registry File Management
// =============================================================================

/**
 * Get the agents directory path for current developer
 *
 * @param repoRoot - Repository root path
 * @returns Absolute path to agents directory
 */
export function getAgentsDir(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  const developer = ensureDeveloper(root);
  const workspaceDir = getWorkspaceDir(developer, root);
  return path.join(workspaceDir, ".agents");
}

/**
 * Get the registry file path
 *
 * @param repoRoot - Repository root path
 * @returns Absolute path to registry.json
 */
export function getRegistryPath(repoRoot?: string): string {
  return path.join(getAgentsDir(repoRoot), "registry.json");
}

/**
 * Ensure registry file exists with valid structure
 */
function ensureRegistry(repoRoot?: string): void {
  const agentsDir = getAgentsDir(repoRoot);
  const registryPath = getRegistryPath(repoRoot);

  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(
      registryPath,
      JSON.stringify(DEFAULT_REGISTRY, null, 2) + "\n",
    );
  }
}

/**
 * Read the registry file
 *
 * @param repoRoot - Repository root path
 * @returns Registry object
 */
export function readRegistry(repoRoot?: string): Registry {
  const registryPath = getRegistryPath(repoRoot);

  if (!fs.existsSync(registryPath)) {
    return DEFAULT_REGISTRY;
  }

  try {
    const content = fs.readFileSync(registryPath, "utf-8");
    const parsed = safeParseRegistry(JSON.parse(content));

    if (parsed.success) {
      return parsed.data;
    }

    console.warn(`Invalid registry format, returning empty: ${parsed.error.message}`);
    return DEFAULT_REGISTRY;
  } catch {
    return DEFAULT_REGISTRY;
  }
}

/**
 * Write the registry file
 *
 * @param registry - Registry to write
 * @param repoRoot - Repository root path
 */
export function writeRegistry(registry: Registry, repoRoot?: string): void {
  ensureRegistry(repoRoot);
  const registryPath = getRegistryPath(repoRoot);
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
}

// =============================================================================
// Agent Registry Operations
// =============================================================================

/**
 * Add an agent to the registry
 *
 * Replaces existing agent with same ID if present.
 *
 * @param agent - Agent to add
 * @param repoRoot - Repository root path
 */
export function addAgent(agent: Agent, repoRoot?: string): void {
  const registry = readRegistry(repoRoot);

  // Remove existing agent with same ID
  registry.agents = registry.agents.filter((a) => a.id !== agent.id);

  // Add new agent
  registry.agents.push(agent);

  writeRegistry(registry, repoRoot);
}

/**
 * Get an agent by ID
 *
 * @param id - Agent ID to find
 * @param repoRoot - Repository root path
 * @returns Agent or null if not found
 */
export function getAgentById(id: string, repoRoot?: string): Agent | null {
  const registry = readRegistry(repoRoot);
  return registry.agents.find((a) => a.id === id) ?? null;
}

/**
 * Get an agent by worktree path
 *
 * @param worktreePath - Worktree path to find
 * @param repoRoot - Repository root path
 * @returns Agent or null if not found
 */
export function getAgentByWorktree(
  worktreePath: string,
  repoRoot?: string,
): Agent | null {
  const registry = readRegistry(repoRoot);
  const normalizedPath = path.resolve(worktreePath);
  return (
    registry.agents.find(
      (a) => path.resolve(a.worktree_path) === normalizedPath,
    ) ?? null
  );
}

/**
 * Get an agent by task directory
 *
 * @param taskDir - Task directory (relative path)
 * @param repoRoot - Repository root path
 * @returns Agent or null if not found
 */
export function getAgentByTaskDir(
  taskDir: string,
  repoRoot?: string,
): Agent | null {
  const registry = readRegistry(repoRoot);
  return registry.agents.find((a) => a.task_dir === taskDir) ?? null;
}

/**
 * Search for an agent by ID or task directory containing search term
 *
 * @param search - Search term
 * @param repoRoot - Repository root path
 * @returns First matching agent or null
 */
export function searchAgent(search: string, repoRoot?: string): Agent | null {
  const registry = readRegistry(repoRoot);

  return (
    registry.agents.find(
      (a) => a.id === search || a.task_dir.includes(search),
    ) ?? null
  );
}

/**
 * Remove an agent by ID
 *
 * @param id - Agent ID to remove
 * @param repoRoot - Repository root path
 */
export function removeAgent(id: string, repoRoot?: string): void {
  const registry = readRegistry(repoRoot);
  registry.agents = registry.agents.filter((a) => a.id !== id);
  writeRegistry(registry, repoRoot);
}

/**
 * Remove an agent by worktree path
 *
 * @param worktreePath - Worktree path
 * @param repoRoot - Repository root path
 */
export function removeAgentByWorktree(
  worktreePath: string,
  repoRoot?: string,
): void {
  const registry = readRegistry(repoRoot);
  const normalizedPath = path.resolve(worktreePath);
  registry.agents = registry.agents.filter(
    (a) => path.resolve(a.worktree_path) !== normalizedPath,
  );
  writeRegistry(registry, repoRoot);
}

/**
 * List all registered agents
 *
 * @param repoRoot - Repository root path
 * @returns Array of agents
 */
export function listAgents(repoRoot?: string): Agent[] {
  const registry = readRegistry(repoRoot);
  return registry.agents;
}

/**
 * Update an agent's status
 *
 * @param id - Agent ID
 * @param status - New status
 * @param repoRoot - Repository root path
 * @returns Updated agent or null if not found
 */
export function updateAgentStatus(
  id: string,
  status: AgentStatus,
  repoRoot?: string,
): Agent | null {
  const registry = readRegistry(repoRoot);
  const agent = registry.agents.find((a) => a.id === id);

  if (!agent) {
    return null;
  }

  agent.status = status;
  writeRegistry(registry, repoRoot);

  return agent;
}

// =============================================================================
// Phase Management
// =============================================================================

/**
 * Get the current phase number for a task
 *
 * @param taskDir - Absolute path to task directory
 * @returns Current phase number (0 if not set)
 */
export function getCurrentPhase(taskDir: string): number {
  const task = readTask(taskDir);
  return task?.current_phase ?? 0;
}

/**
 * Get the total number of phases for a task
 *
 * @param taskDir - Absolute path to task directory
 * @returns Total phase count
 */
export function getTotalPhases(taskDir: string): number {
  const task = readTask(taskDir);
  return task?.next_action?.length ?? 0;
}

/**
 * Get the action name for a specific phase
 *
 * @param taskDir - Absolute path to task directory
 * @param phase - Phase number (1-based)
 * @returns Action name or null if not found
 */
export function getPhaseAction(taskDir: string, phase: number): string | null {
  const task = readTask(taskDir);

  if (!task) {
    return null;
  }

  const phaseAction = task.next_action.find((a) => a.phase === phase);
  return phaseAction?.action ?? null;
}

/**
 * Get formatted phase info string
 *
 * @param taskDir - Absolute path to task directory
 * @returns Formatted string like "1/4 (implement)"
 */
export function getPhaseInfo(taskDir: string): string {
  const task = readTask(taskDir);

  if (!task) {
    return "N/A";
  }

  const current = task.current_phase;
  const total = task.next_action.length;
  const action = getPhaseAction(taskDir, current);

  if (current === 0) {
    return `0/${total} (pending)`;
  }

  return `${current}/${total} (${action ?? "unknown"})`;
}

/**
 * Set the current phase for a task
 *
 * @param taskDir - Absolute path to task directory
 * @param phase - Phase number to set
 * @returns True if successful
 */
export function setPhase(taskDir: string, phase: number): boolean {
  const task = readTask(taskDir);

  if (!task) {
    return false;
  }

  task.current_phase = phase;
  writeTask(taskDir, task);

  return true;
}

/**
 * Advance to the next phase
 *
 * @param taskDir - Absolute path to task directory
 * @returns New phase number, or -1 if already at final phase or error
 */
export function advancePhase(taskDir: string): number {
  const task = readTask(taskDir);

  if (!task) {
    return -1;
  }

  const current = task.current_phase;
  const total = task.next_action.length;
  const next = current + 1;

  if (next > total) {
    // Already at final phase
    return current;
  }

  task.current_phase = next;
  writeTask(taskDir, task);

  return next;
}

/**
 * Get the phase number for a specific action
 *
 * @param taskDir - Absolute path to task directory
 * @param action - Action name to find
 * @returns Phase number or 0 if not found
 */
export function getPhaseForAction(taskDir: string, action: string): number {
  const task = readTask(taskDir);

  if (!task) {
    return 0;
  }

  const phaseAction = task.next_action.find((a) => a.action === action);
  return phaseAction?.phase ?? 0;
}

/**
 * Check if a phase is completed
 *
 * @param taskDir - Absolute path to task directory
 * @param phase - Phase number to check
 * @returns True if current_phase > phase
 */
export function isPhaseCompleted(taskDir: string, phase: number): boolean {
  const current = getCurrentPhase(taskDir);
  return current > phase;
}

/**
 * Check if we're currently at a specific action
 *
 * @param taskDir - Absolute path to task directory
 * @param action - Action name to check
 * @returns True if current phase matches the action's phase
 */
export function isCurrentAction(taskDir: string, action: string): boolean {
  const current = getCurrentPhase(taskDir);
  const actionPhase = getPhaseForAction(taskDir, action);
  return current === actionPhase;
}

// =============================================================================
// Current Task Pointer
// =============================================================================

/**
 * Set the current task for a specific directory (usually worktree)
 *
 * This sets .current-task in the target directory, not the main repo.
 *
 * @param targetDir - Directory where to set current task (e.g., worktree path)
 * @param taskDir - Task directory (relative path)
 */
export function setCurrentTaskInDir(targetDir: string, taskDir: string): void {
  const trellisDir = path.join(targetDir, ".trellis");

  if (!fs.existsSync(trellisDir)) {
    fs.mkdirSync(trellisDir, { recursive: true });
  }

  const currentTaskFile = path.join(trellisDir, FILE_NAMES.CURRENT_TASK);
  fs.writeFileSync(currentTaskFile, taskDir);
}

/**
 * Get the current task for a specific directory
 *
 * @param targetDir - Directory to check (e.g., worktree path)
 * @returns Task directory (relative path) or null
 */
export function getCurrentTaskInDir(targetDir: string): string | null {
  const currentTaskFile = path.join(
    targetDir,
    ".trellis",
    FILE_NAMES.CURRENT_TASK,
  );

  if (!fs.existsSync(currentTaskFile)) {
    return null;
  }

  return fs.readFileSync(currentTaskFile, "utf-8").trim() || null;
}

/**
 * Clear the current task for a specific directory
 *
 * @param targetDir - Directory to clear (e.g., worktree path)
 */
export function clearCurrentTaskInDir(targetDir: string): void {
  const currentTaskFile = path.join(
    targetDir,
    ".trellis",
    FILE_NAMES.CURRENT_TASK,
  );

  if (fs.existsSync(currentTaskFile)) {
    fs.unlinkSync(currentTaskFile);
  }
}

// Re-export main repo current task functions for convenience
export {
  getCurrentTaskPath as getCurrentTask,
  setCurrentTaskPath as setCurrentTask,
  clearCurrentTaskPath as clearCurrentTask,
};

// =============================================================================
// Process Status Checking
// =============================================================================

/**
 * Check if a process is running
 *
 * @param pid - Process ID to check
 * @returns True if process is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync agent statuses with actual process states
 *
 * Updates agents with stopped status if their process is no longer running.
 *
 * @param repoRoot - Repository root path
 * @returns Number of agents updated
 */
export function syncAgentStatuses(repoRoot?: string): number {
  const registry = readRegistry(repoRoot);
  let updated = 0;

  for (const agent of registry.agents) {
    if (agent.status === "running" && !isProcessRunning(agent.pid)) {
      agent.status = "stopped";
      updated++;
    }
  }

  if (updated > 0) {
    writeRegistry(registry, repoRoot);
  }

  return updated;
}
