/**
 * Platform adapter module
 *
 * Provides platform detection and unified access to platform-specific functionality.
 */

import fs from "node:fs";
import path from "node:path";
import type { Platform, PlatformAdapter } from "./types.js";
import { claudeAdapter } from "./claude/index.js";

// Re-export types
export type {
  Platform,
  PlatformAdapter,
  LaunchAgentOptions,
  AgentProcess,
  AgentLogEntry,
  ContextGenerator,
} from "./types.js";

// Re-export Claude adapter and launcher
export { claudeAdapter } from "./claude/index.js";
export {
  launchAgent as launchClaudeAgent,
  isAgentRunning as isClaudeAgentRunning,
  stopAgent as stopClaudeAgent,
  getSessionId as getClaudeSessionId,
  getResumeCommand as getClaudeResumeCommand,
  getAgentFilePath as getClaudeAgentFilePath,
  agentFileExists as claudeAgentFileExists,
  type ClaudeLaunchOptions,
  type ClaudeLaunchResult,
} from "./claude/index.js";

/**
 * Platform configuration directories
 */
const PLATFORM_CONFIG_DIRS: Record<Platform, string> = {
  claude: ".claude",
  opencode: ".opencode",
  cursor: ".cursor",
  codex: ".codex",
};

/**
 * Registered platform adapters
 */
const adapters: Partial<Record<Platform, PlatformAdapter>> = {
  claude: claudeAdapter,
  // opencode: opencodeAdapter,  // TODO: implement
  // cursor: cursorAdapter,      // TODO: implement
  // codex: codexAdapter,        // TODO: implement
};

/**
 * Detect the current platform based on config directories
 *
 * Checks for platform-specific config directories in order of priority:
 * 1. .claude/ - Claude Code
 * 2. .opencode/ - OpenCode
 * 3. .cursor/ - Cursor
 * 4. .codex/ - Codex
 *
 * @param repoRoot - Repository root path (defaults to cwd)
 * @returns Detected platform or null if none found
 */
export function detectPlatform(repoRoot?: string): Platform | null {
  const root = repoRoot ?? process.cwd();

  // Check in priority order
  const platforms: Platform[] = ["claude", "opencode", "cursor", "codex"];

  for (const platform of platforms) {
    const configDir = PLATFORM_CONFIG_DIRS[platform];
    if (fs.existsSync(path.join(root, configDir))) {
      return platform;
    }
  }

  return null;
}

/**
 * Get the platform adapter for a specific platform
 *
 * @param platform - Platform to get adapter for
 * @returns Platform adapter
 * @throws Error if platform adapter is not implemented
 */
export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform];

  if (!adapter) {
    throw new Error(
      `Platform adapter for '${platform}' is not yet implemented. ` +
        `Currently supported: ${Object.keys(adapters).join(", ")}`,
    );
  }

  return adapter;
}

/**
 * Get the platform adapter for the current environment
 *
 * Detects the platform and returns the appropriate adapter.
 *
 * @param repoRoot - Repository root path (defaults to cwd)
 * @returns Platform adapter
 * @throws Error if no platform detected or adapter not implemented
 */
export function getPlatformAdapter(repoRoot?: string): PlatformAdapter {
  const platform = detectPlatform(repoRoot);

  if (!platform) {
    throw new Error(
      "Could not detect platform. Ensure you have a platform config directory " +
        "(e.g., .claude/, .opencode/) in your project root.",
    );
  }

  return getAdapter(platform);
}

/**
 * Check if a platform is supported (has an implemented adapter)
 */
export function isPlatformSupported(platform: Platform): boolean {
  return platform in adapters;
}

/**
 * Get list of supported platforms
 */
export function getSupportedPlatforms(): Platform[] {
  return Object.keys(adapters) as Platform[];
}
