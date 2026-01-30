/**
 * Claude Code platform adapter
 *
 * Implements PlatformAdapter for Claude Code, providing:
 * - Context file generation (implement.jsonl, check.jsonl, debug.jsonl)
 * - Agent launching via `claude` CLI
 * - Log parsing for status monitoring
 */

import fs from "node:fs";
import path from "node:path";
import type { DevType, ContextEntry } from "../../../types/task.js";
import type {
  PlatformAdapter,
  LaunchAgentOptions,
  AgentProcess,
  AgentLogEntry,
} from "../types.js";
import { claudeContextGenerator } from "./context.js";
import { launchAgent as launchClaudeAgent } from "./launcher.js";
import type { ClaudeLaunchOptions } from "./launcher.js";

/**
 * Write JSONL entries to a file
 */
function writeJsonl(filePath: string, entries: ContextEntry[]): void {
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(filePath, content);
}

/**
 * Claude Code platform adapter
 */
export const claudeAdapter: PlatformAdapter = {
  platform: "claude",

  getConfigDir(): string {
    return ".claude";
  },

  supportsMultiAgent(): boolean {
    return true;
  },

  supportsHooks(): boolean {
    return true;
  },

  generateContextFiles(taskDir: string, devType: DevType): void {
    // Generate implement.jsonl
    const implementEntries = [...claudeContextGenerator.getImplementBase()];

    switch (devType) {
      case "backend":
      case "test":
        implementEntries.push(...claudeContextGenerator.getImplementBackend());
        break;
      case "frontend":
        implementEntries.push(...claudeContextGenerator.getImplementFrontend());
        break;
      case "fullstack":
        implementEntries.push(...claudeContextGenerator.getImplementBackend());
        implementEntries.push(...claudeContextGenerator.getImplementFrontend());
        break;
    }

    writeJsonl(path.join(taskDir, "implement.jsonl"), implementEntries);

    // Generate check.jsonl
    writeJsonl(
      path.join(taskDir, "check.jsonl"),
      claudeContextGenerator.getCheckContext(devType),
    );

    // Generate debug.jsonl
    writeJsonl(
      path.join(taskDir, "debug.jsonl"),
      claudeContextGenerator.getDebugContext(devType),
    );
  },

  async launchAgent(options: LaunchAgentOptions): Promise<AgentProcess> {
    // Use the launcher module for robust agent launching
    const launchOptions: ClaudeLaunchOptions = {
      agentType: options.agentType,
      workDir: options.workDir,
      agentFile: options.agentFile,
      background: options.background ?? true,
      verbose: false,
    };

    const result = await launchClaudeAgent(launchOptions);

    return {
      pid: result.pid,
      logFile: result.logFile ?? path.join(options.workDir, ".agent-log"),
      sessionId: result.sessionId,
    };
  },

  parseAgentLog(line: string): AgentLogEntry | null {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      // Claude's JSON output format
      if (parsed.type === "tool_use" || parsed.type === "tool_result") {
        return {
          type: "tool_call",
          timestamp: new Date().toISOString(),
          content: parsed,
        };
      }

      if (parsed.type === "text") {
        return {
          type: "message",
          timestamp: new Date().toISOString(),
          content: parsed.text,
        };
      }

      if (parsed.type === "error") {
        return {
          type: "error",
          timestamp: new Date().toISOString(),
          content: parsed.message ?? parsed,
        };
      }

      return null;
    } catch {
      // Not JSON, might be plain text output
      return null;
    }
  },
};

// Re-export context generator for direct access if needed
export { claudeContextGenerator };

// Re-export launcher functions and types
export {
  launchAgent,
  isAgentRunning,
  stopAgent,
  getSessionId,
  getResumeCommand,
  getAgentFilePath,
  agentFileExists,
  type ClaudeLaunchOptions,
  type ClaudeLaunchResult,
} from "./launcher.js";
