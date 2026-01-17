/**
 * OpenCode configurator (TODO: Re-enable when OpenCode support is stable)
 *
 * This file is a placeholder. OpenCode support requires:
 * 1. A stable OpenCode configuration format
 * 2. An .opencode/ directory to dogfood from (like .cursor/ and .claude/)
 * 3. Updates to the init command to enable the opencode option
 */

import path from "node:path";
import { writeFile, ensureDir } from "../utils/file-writer.js";

/**
 * OpenCode configuration file content
 */
function getOpenCodeConfig(): string {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      instructions: [
        "AGENTS.md",
        ".trellis/workflow.md",
        ".trellis/structure/guides/index.md",
      ],
    },
    null,
    2,
  );
}

/**
 * Configure OpenCode with slash commands
 *
 * TODO: Implement dogfooding pattern like Cursor and Claude
 */
export async function configureOpenCode(cwd: string): Promise<void> {
  const opencodeDir = path.join(cwd, ".opencode");
  const commandsDir = path.join(opencodeDir, "commands");

  // Create directory
  ensureDir(commandsDir);

  // TODO: Copy from .opencode/ directory when available
  // For now, just create the config file
  const configPath = path.join(cwd, ".opencode.json");
  await writeFile(configPath, getOpenCodeConfig());
}

/**
 * Configure OpenCode agents
 *
 * TODO: Implement when OpenCode agent format is stable
 */
export async function configureOpenCodeAgents(_cwd: string): Promise<void> {
  // TODO: Implement when OpenCode agent format is stable
}

/**
 * Configure OpenCode with full support
 */
export async function configureOpenCodeFull(cwd: string): Promise<void> {
  await configureOpenCode(cwd);
  await configureOpenCodeAgents(cwd);
}
