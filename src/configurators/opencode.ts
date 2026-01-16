import path from "node:path";
import { getCommandTemplates } from "./templates.js";
import { writeFile, ensureDir } from "../utils/file-writer.js";
import { getAllAgents } from "../templates/agents/index.js";

/**
 * OpenCode configuration file content
 *
 * Note: Custom agents are auto-discovered from .opencode/agent/ directory,
 * so we don't need to define them in the config file.
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
 * OpenCode uses .opencode/commands/ for slash commands,
 * similar to Claude Code's .claude/commands/
 */
export async function configureOpenCode(cwd: string): Promise<void> {
  const opencodeDir = path.join(cwd, ".opencode");
  const commandsDir = path.join(opencodeDir, "commands");

  // Create directory
  ensureDir(commandsDir);

  // Get command templates for OpenCode
  const templates = getCommandTemplates("opencode");

  // Write each command file
  for (const [name, content] of Object.entries(templates)) {
    const filePath = path.join(commandsDir, `${name}.md`);
    await writeFile(filePath, content);
  }

  // Write .opencode.json configuration
  const configPath = path.join(cwd, ".opencode.json");
  await writeFile(configPath, getOpenCodeConfig());
}

/**
 * Configure OpenCode agents
 *
 * Uses the shared agent templates with OpenCode-specific frontmatter format.
 * OpenCode agents use YAML frontmatter with tools as boolean object.
 */
export async function configureOpenCodeAgents(cwd: string): Promise<void> {
  const agentDir = path.join(cwd, ".opencode", "agent");

  // Create directory
  ensureDir(agentDir);

  // Get all agent templates in OpenCode format (excludes dispatch)
  const agents = getAllAgents("opencode");

  // Write each agent file
  for (const agent of agents) {
    const filePath = path.join(agentDir, `${agent.name}.md`);
    await writeFile(filePath, agent.content);
  }
}

/**
 * Configure OpenCode with full support
 *
 * This includes:
 * - Slash commands
 * - Agent configurations
 * - .opencode.json configuration
 */
export async function configureOpenCodeFull(cwd: string): Promise<void> {
  await configureOpenCode(cwd);
  await configureOpenCodeAgents(cwd);
}
