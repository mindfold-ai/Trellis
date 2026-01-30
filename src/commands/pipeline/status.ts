/**
 * trellis pipeline status - View pipeline/agent status
 *
 * Modes:
 * - No arguments: List all agents with summary
 * - With agent-id: Show detailed status for specific agent
 * - --watch: Watch log in real-time
 * - --registry: Show raw registry data
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { execaSync } from "execa";
import { getRepoRoot, isTrellisInitialized } from "../../core/paths.js";
import { ensureDeveloper } from "../../core/developer/index.js";
import {
  listPipelineStatuses,
  getPipelineStatus,
  getRegistryPath,
  readRegistry,
  getPhaseInfo,
  type PipelineStatus,
} from "../../core/pipeline/index.js";
import { getSessionId, getResumeCommand } from "../../core/platforms/claude/launcher.js";

export interface PipelineStatusOptions {
  watch?: boolean;
  registry?: boolean;
  json?: boolean;
}

/**
 * Show pipeline status
 */
export async function pipelineStatus(
  agentId: string | undefined,
  options: PipelineStatusOptions,
): Promise<void> {
  const repoRoot = getRepoRoot();

  // Validate environment
  if (!isTrellisInitialized(repoRoot)) {
    console.error(chalk.red("Error: Trellis not initialized. Run: trellis init"));
    process.exit(1);
  }

  // Ensure developer is initialized
  ensureDeveloper(repoRoot);

  // Handle special modes
  if (options.registry) {
    showRegistry(repoRoot, options.json);
    return;
  }

  if (options.watch) {
    if (!agentId) {
      console.error(chalk.red("Error: Agent ID required for --watch mode"));
      console.error("Usage: trellis pipeline status <agent-id> --watch");
      process.exit(1);
    }
    await watchAgent(agentId, repoRoot);
    return;
  }

  // Show status
  if (agentId) {
    showAgentDetail(agentId, repoRoot, options.json);
  } else {
    showSummary(repoRoot, options.json);
  }
}

/**
 * Show summary of all agents
 */
function showSummary(repoRoot: string, json?: boolean): void {
  const statuses = listPipelineStatuses(repoRoot);

  if (json) {
    console.log(JSON.stringify(statuses, null, 2));
    return;
  }

  // Count running vs stopped
  const running = statuses.filter((s) => s.processRunning).length;

  console.log(chalk.blue("=== Multi-Agent Status ==="));
  console.log(`  Agents: ${chalk.green(running.toString())} running / ${statuses.length} registered`);
  console.log("");

  if (statuses.length === 0) {
    console.log("  (no agents registered)");
    console.log("");
    console.log(chalk.gray("Use 'trellis pipeline start <task-dir>' to start an agent."));
    return;
  }

  // Group by status
  const runningAgents = statuses.filter((s) => s.processRunning);
  const stoppedAgents = statuses.filter((s) => !s.processRunning);

  // Show running agents first
  if (runningAgents.length > 0) {
    console.log(chalk.cyan("Running Agents:"));
    for (const status of runningAgents) {
      printAgentSummary(status, repoRoot);
    }
    console.log("");
  }

  // Show stopped agents
  if (stoppedAgents.length > 0) {
    console.log(chalk.red("Stopped Agents:"));
    for (const status of stoppedAgents) {
      printStoppedAgent(status, repoRoot);
    }
    console.log("");
  }

  console.log(chalk.gray("Use 'trellis pipeline status <agent-id>' for details."));
}

/**
 * Print summary line for a running agent
 */
function printAgentSummary(status: PipelineStatus, _repoRoot: string): void {
  const { agent, task } = status;

  // Get elapsed time
  const elapsed = calcElapsed(agent.started_at);

  // Get phase info from worktree (where agent is actually working)
  const taskDir = path.join(agent.worktree_path, agent.task_dir);
  const phaseInfo = getPhaseInfo(taskDir);

  // Get modified files count
  const modified = countModifiedFiles(agent.worktree_path);

  console.log(`  ${chalk.green(">")} ${chalk.cyan(agent.id)} ${chalk.green("[running]")}`);
  console.log(`      Phase:    ${phaseInfo}`);
  console.log(`      Elapsed:  ${elapsed}`);
  console.log(`      Branch:   ${chalk.gray(task.branch ?? "N/A")}`);
  console.log(`      Modified: ${modified} file(s)`);
  console.log(`      PID:      ${chalk.gray(agent.pid.toString())}`);
}

/**
 * Print summary line for a stopped agent
 */
function printStoppedAgent(status: PipelineStatus, _repoRoot: string): void {
  const { agent, task } = status;

  // Check if completed successfully
  if (task.status === "completed") {
    console.log(`  ${chalk.green("*")} ${agent.id} ${chalk.green("[completed]")}`);
    return;
  }

  // Stopped/interrupted agent
  const sessionId = getSessionId(agent.worktree_path);
  console.log(`  ${chalk.red("o")} ${agent.id} ${chalk.red("[stopped]")}`);

  if (sessionId) {
    const resumeCmd = getResumeCommand(agent.worktree_path, sessionId);
    console.log(`      ${chalk.yellow("Resume:")} ${resumeCmd}`);
  }
}

/**
 * Show detailed status for a specific agent
 */
function showAgentDetail(agentId: string, repoRoot: string, json?: boolean): void {
  const status = getPipelineStatus(agentId, repoRoot);

  if (!status) {
    console.error(chalk.red(`Error: Agent not found: ${agentId}`));
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  const { agent, task, processRunning } = status;

  console.log(chalk.blue(`=== Agent Detail: ${agent.id} ===`));
  console.log("");
  console.log(`  ID:        ${agent.id}`);
  console.log(`  PID:       ${agent.pid}`);
  if (agent.session_id) {
    console.log(`  Session:   ${agent.session_id}`);
  }
  console.log(`  Worktree:  ${agent.worktree_path}`);
  console.log(`  Task Dir:  ${agent.task_dir}`);
  console.log(`  Started:   ${agent.started_at}`);
  console.log("");

  // Status
  if (processRunning) {
    console.log(`  Status:    ${chalk.green("Running")}`);
  } else {
    console.log(`  Status:    ${chalk.red("Stopped")}`);
    const sessionId = getSessionId(agent.worktree_path);
    if (sessionId) {
      console.log("");
      console.log(`  ${chalk.yellow("Resume:")} cd ${agent.worktree_path} && claude --resume ${sessionId}`);
    }
  }

  // Task info
  console.log("");
  console.log(chalk.blue("=== Task Info ==="));
  console.log("");
  console.log(`  ID:          ${task.id}`);
  console.log(`  Title:       ${task.title}`);
  console.log(`  Status:      ${task.status}`);
  console.log(`  Branch:      ${task.branch ?? "N/A"}`);
  console.log(`  Phase:       ${task.current_phase}`);

  // Git changes
  console.log("");
  console.log(chalk.blue("=== Git Changes ==="));
  console.log("");

  const changes = getGitChanges(agent.worktree_path);
  if (changes.length === 0) {
    console.log("  (no changes)");
  } else {
    for (const change of changes.slice(0, 10)) {
      console.log(`  ${change}`);
    }
    if (changes.length > 10) {
      console.log(`  ... and ${changes.length - 10} more`);
    }
  }

  // Recent log
  if (status.lastLogLines && status.lastLogLines.length > 0) {
    console.log("");
    console.log(chalk.blue("=== Recent Log ==="));
    console.log("");
    for (const line of status.lastLogLines) {
      console.log(`  ${line.substring(0, 100)}...`);
    }
  }
}

/**
 * Watch agent log in real-time
 */
async function watchAgent(agentId: string, repoRoot: string): Promise<void> {
  const status = getPipelineStatus(agentId, repoRoot);

  if (!status) {
    console.error(chalk.red(`Error: Agent not found: ${agentId}`));
    process.exit(1);
  }

  const logFile = path.join(status.agent.worktree_path, ".agent-log");

  if (!fs.existsSync(logFile)) {
    console.error(chalk.red(`Error: Log file not found: ${logFile}`));
    process.exit(1);
  }

  console.log(chalk.blue(`Watching: ${logFile}`));
  console.log(chalk.gray("Press Ctrl+C to stop"));
  console.log("");

  // Use tail -f for watching
  const { execa } = await import("execa");

  try {
    await execa("tail", ["-f", logFile], {
      stdio: "inherit",
    });
  } catch {
    // Ctrl+C will throw, which is expected
  }
}

/**
 * Show raw registry data
 */
function showRegistry(repoRoot: string, json?: boolean): void {
  const registryPath = getRegistryPath(repoRoot);
  const registry = readRegistry(repoRoot);

  if (json) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(chalk.blue("=== Agent Registry ==="));
  console.log("");
  console.log(`File: ${registryPath}`);
  console.log("");
  console.log(JSON.stringify(registry, null, 2));
}

/**
 * Calculate elapsed time from ISO timestamp
 */
function calcElapsed(started: string): string {
  try {
    const startDate = new Date(started);
    const now = new Date();
    const elapsedMs = now.getTime() - startDate.getTime();

    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  } catch {
    return "N/A";
  }
}

/**
 * Count modified files in a worktree
 */
function countModifiedFiles(worktreePath: string): number {
  try {
    if (!fs.existsSync(worktreePath)) {
      return 0;
    }

    const result = execaSync("git", ["status", "--short"], {
      cwd: worktreePath,
    });

    const lines = result.stdout.split("\n").filter(Boolean);
    return lines.length;
  } catch {
    return 0;
  }
}

/**
 * Get git changes in a worktree
 */
function getGitChanges(worktreePath: string): string[] {
  try {
    if (!fs.existsSync(worktreePath)) {
      return [];
    }

    const result = execaSync("git", ["status", "--short"], {
      cwd: worktreePath,
    });

    return result.stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
