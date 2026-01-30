/**
 * Claude Code agent launcher
 *
 * Provides functions to launch, check, and stop Claude Code agents.
 * This module handles the specifics of the `claude` CLI command,
 * including session management, background execution, and proxy settings.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execa } from "execa";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for launching a Claude agent
 */
export interface ClaudeLaunchOptions {
  /** Agent type (e.g., "dispatch", "plan") - maps to .claude/agents/{type}.md */
  agentType: string;
  /** Working directory (usually worktree path) */
  workDir: string;
  /** Custom agent file path (overrides agentType) */
  agentFile?: string;
  /** Session ID for resume support (auto-generated if not provided) */
  sessionId?: string;
  /** Run in background (default: true) */
  background?: boolean;
  /** Enable verbose output (default: false) */
  verbose?: boolean;
  /** Initial prompt to send (default: "Start the pipeline") */
  prompt?: string;
}

/**
 * Result from launching a Claude agent
 */
export interface ClaudeLaunchResult {
  /** Process ID */
  pid: number;
  /** Session ID (for resume) */
  sessionId: string;
  /** Log file path (if background) */
  logFile?: string;
  /** Runner script path (if background) */
  runnerScript?: string;
  /** Session ID file path */
  sessionIdFile?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default agent directory relative to repo root */
const CLAUDE_AGENTS_DIR = ".claude/agents";

/** Default initial prompt */
const DEFAULT_PROMPT = "Start the pipeline";

// =============================================================================
// Launch Functions
// =============================================================================

/**
 * Launch a Claude Code agent
 *
 * This is the main entry point for launching agents. It handles:
 * - Session ID generation
 * - Background/foreground execution
 * - Proxy settings from environment
 * - Log file management
 *
 * @param options - Launch options
 * @returns Launch result with PID and session info
 */
export async function launchAgent(
  options: ClaudeLaunchOptions,
): Promise<ClaudeLaunchResult> {
  const {
    agentType,
    workDir,
    agentFile,
    sessionId: providedSessionId,
    background = true,
    verbose = false,
    prompt = DEFAULT_PROMPT,
  } = options;

  // Generate or use provided session ID
  const sessionId = providedSessionId ?? randomUUID();

  // Determine agent identifier
  // Claude Code accepts just the agent name (e.g., "dispatch") and looks up in .claude/agents/
  const agentFilePath = agentFile ?? agentType;

  // Build file paths
  const logFile = path.join(workDir, ".agent-log");
  const sessionIdFile = path.join(workDir, ".session-id");

  // Save session ID for resume support
  fs.writeFileSync(sessionIdFile, sessionId + "\n");

  if (background) {
    return launchBackground({
      workDir,
      agentFilePath,
      sessionId,
      verbose,
      prompt,
      logFile,
      sessionIdFile,
    });
  } else {
    return launchForeground({
      workDir,
      agentFilePath,
      sessionId,
      verbose,
      prompt,
      sessionIdFile,
    });
  }
}

/**
 * Launch agent in background mode
 *
 * Creates a runner script and executes it with nohup-like behavior.
 * This matches the behavior of start.sh in the shell implementation.
 */
async function launchBackground(options: {
  workDir: string;
  agentFilePath: string;
  sessionId: string;
  verbose: boolean;
  prompt: string;
  logFile: string;
  sessionIdFile: string;
}): Promise<ClaudeLaunchResult> {
  const {
    workDir,
    agentFilePath,
    sessionId,
    verbose,
    prompt,
    logFile,
    sessionIdFile,
  } = options;

  // Ensure log file exists
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, "");
  }

  // Create runner script for background execution
  // This preserves proxy settings and allows process to continue after parent exits
  const runnerScript = path.join(workDir, ".agent-runner.sh");
  const runnerContent = createRunnerScript({
    workDir,
    agentFilePath,
    sessionId,
    verbose,
    prompt,
  });

  fs.writeFileSync(runnerScript, runnerContent, { mode: 0o755 });

  // Get proxy settings from environment
  const proxyEnv = {
    AGENT_HTTPS_PROXY: process.env.https_proxy ?? process.env.HTTPS_PROXY ?? "",
    AGENT_HTTP_PROXY: process.env.http_proxy ?? process.env.HTTP_PROXY ?? "",
    AGENT_ALL_PROXY: process.env.all_proxy ?? process.env.ALL_PROXY ?? "",
  };

  // Start the runner script in background
  const subprocess = execa(runnerScript, [], {
    cwd: workDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...proxyEnv,
    },
  });

  // Pipe stdout and stderr to log file
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  if (subprocess.stdout) {
    subprocess.stdout.pipe(logStream);
  }

  if (subprocess.stderr) {
    subprocess.stderr.pipe(logStream);
  }

  // Unref to allow parent to exit
  subprocess.unref();

  const pid = subprocess.pid ?? 0;

  return {
    pid,
    sessionId,
    logFile,
    runnerScript,
    sessionIdFile,
  };
}

/**
 * Launch agent in foreground mode
 *
 * Runs the agent in the current terminal with inherited stdio.
 */
async function launchForeground(options: {
  workDir: string;
  agentFilePath: string;
  sessionId: string;
  verbose: boolean;
  prompt: string;
  sessionIdFile: string;
}): Promise<ClaudeLaunchResult> {
  const { workDir, agentFilePath, sessionId, verbose, prompt, sessionIdFile } =
    options;

  // Build claude command arguments
  const args = buildClaudeArgs({
    agentFilePath,
    sessionId,
    verbose,
    prompt,
  });

  // Start claude in foreground
  const subprocess = execa("claude", args, {
    cwd: workDir,
    stdio: "inherit",
    env: {
      ...process.env,
      CLAUDE_NON_INTERACTIVE: "1",
    },
  });

  const pid = subprocess.pid ?? 0;

  return {
    pid,
    sessionId,
    sessionIdFile,
  };
}

// =============================================================================
// Process Management
// =============================================================================

/**
 * Check if an agent process is running
 *
 * @param pid - Process ID to check
 * @returns True if process is running
 */
export function isAgentRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop an agent process
 *
 * @param pid - Process ID to stop
 * @param force - Use SIGKILL instead of SIGTERM
 * @returns True if process was stopped or already stopped
 */
export async function stopAgent(pid: number, force = false): Promise<boolean> {
  try {
    if (!isAgentRunning(pid)) {
      return true; // Already stopped
    }

    const signal = force ? "SIGKILL" : "SIGTERM";
    process.kill(pid, signal);

    // Wait briefly for process to terminate
    await waitForProcessEnd(pid, 5000);

    return true;
  } catch {
    // Process might have already exited
    return true;
  }
}

/**
 * Wait for a process to end
 *
 * @param pid - Process ID to wait for
 * @param timeoutMs - Maximum time to wait
 * @returns True if process ended within timeout
 */
async function waitForProcessEnd(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 100;

  while (Date.now() - startTime < timeoutMs) {
    if (!isAgentRunning(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  return !isAgentRunning(pid);
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Read session ID from a worktree
 *
 * @param workDir - Working directory (worktree path)
 * @returns Session ID or null if not found
 */
export function getSessionId(workDir: string): string | null {
  const sessionIdFile = path.join(workDir, ".session-id");

  if (!fs.existsSync(sessionIdFile)) {
    return null;
  }

  try {
    return fs.readFileSync(sessionIdFile, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get the command to resume an agent session
 *
 * @param workDir - Working directory (worktree path)
 * @param sessionId - Session ID (or reads from file if not provided)
 * @returns Resume command string or null if no session
 */
export function getResumeCommand(
  workDir: string,
  sessionId?: string,
): string | null {
  const sid = sessionId ?? getSessionId(workDir);

  if (!sid) {
    return null;
  }

  return `cd ${workDir} && claude --resume ${sid}`;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build claude CLI arguments
 */
function buildClaudeArgs(options: {
  agentFilePath: string;
  sessionId: string;
  verbose: boolean;
  prompt: string;
}): string[] {
  const { agentFilePath, sessionId, verbose, prompt } = options;

  const args: string[] = [
    "-p", // Print mode
    "--agent",
    agentFilePath,
    "--session-id",
    sessionId,
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
  ];

  if (verbose) {
    args.push("--verbose");
  }

  // Add the initial prompt
  args.push(prompt);

  return args;
}

/**
 * Create the runner script content for background execution
 *
 * This script is executed via nohup to ensure the agent continues
 * running after the parent process exits.
 */
function createRunnerScript(options: {
  workDir: string;
  agentFilePath: string;
  sessionId: string;
  verbose: boolean;
  prompt: string;
}): string {
  const { agentFilePath, sessionId, verbose, prompt } = options;

  // Build the claude command
  const args = buildClaudeArgs({
    agentFilePath,
    sessionId,
    verbose,
    prompt,
  });

  // Escape for shell
  const escapedArgs = args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`);
  const claudeCommand = `claude ${escapedArgs.join(" ")}`;

  return `#!/bin/bash
cd "$(dirname "$0")"

# Proxy settings from environment (passed via AGENT_* vars)
export https_proxy="\${AGENT_HTTPS_PROXY:-}"
export http_proxy="\${AGENT_HTTP_PROXY:-}"
export all_proxy="\${AGENT_ALL_PROXY:-}"

# Non-interactive mode
export CLAUDE_NON_INTERACTIVE=1

# Run claude
${claudeCommand}
`;
}

/**
 * Get the agent file path for a given agent type
 *
 * @param agentType - Agent type (e.g., "dispatch")
 * @param repoRoot - Repository root path
 * @returns Absolute path to agent file
 */
export function getAgentFilePath(agentType: string, repoRoot: string): string {
  return path.join(repoRoot, CLAUDE_AGENTS_DIR, `${agentType}.md`);
}

/**
 * Check if an agent file exists
 *
 * @param agentType - Agent type
 * @param repoRoot - Repository root path
 * @returns True if agent file exists
 */
export function agentFileExists(agentType: string, repoRoot: string): boolean {
  return fs.existsSync(getAgentFilePath(agentType, repoRoot));
}
