import path from "node:path";
import { getCommandTemplates } from "./templates.js";
import { writeFile, ensureDir } from "../utils/file-writer.js";
import { getAllAgents } from "../templates/agents/index.js";

/**
 * OpenCode configuration file content
 */
function getOpenCodeConfig(): string {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/schemas/opencode.json",
      instructions: [
        "AGENTS.md",
        ".trellis/workflow.md",
        ".trellis/structure/guides/index.md",
      ],
      agents: {
        implement: ".opencode/agents/implement.md",
        check: ".opencode/agents/check.md",
        research: ".opencode/agents/research.md",
        debug: ".opencode/agents/debug.md",
      },
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
  const agentsDir = path.join(cwd, ".opencode", "agents");

  // Create directory
  ensureDir(agentsDir);

  // Get all agent templates in OpenCode format (excludes dispatch)
  const agents = getAllAgents("opencode");

  // Write each agent file
  for (const agent of agents) {
    const filePath = path.join(agentsDir, `${agent.name}.md`);
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
