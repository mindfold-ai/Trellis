/**
 * Agent templates for Multi-Agent Pipeline
 *
 * Supports multiple output formats:
 * - Claude Code: YAML frontmatter with name, description, tools (string), model
 * - OpenCode: YAML frontmatter with description, tools (object)
 *
 * The agent body content is shared across formats.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  AGENT_METADATA,
  getAgentMetadata,
  getAgentNamesForFormat,
  type AgentMetadata,
  type AgentTools,
} from "./metadata.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Output format type
 */
export type AgentFormat = "claude" | "opencode";

/**
 * Read an agent body template (without frontmatter)
 */
function readAgentBody(name: string): string {
  const filePath = join(__dirname, "bodies", `${name}.md`);
  return readFileSync(filePath, "utf-8");
}

/**
 * Format tools as Claude Code style (comma-separated string)
 */
function formatClaudeTools(tools: AgentTools): string {
  const toolNames: string[] = [];
  if (tools.read) toolNames.push("Read");
  if (tools.write) toolNames.push("Write");
  if (tools.edit) toolNames.push("Edit");
  if (tools.bash) toolNames.push("Bash");
  if (tools.glob) toolNames.push("Glob");
  if (tools.grep) toolNames.push("Grep");
  // Add external tools for agents that have them
  toolNames.push("mcp__exa__web_search_exa", "mcp__exa__get_code_context_exa");
  return toolNames.join(", ");
}

/**
 * Format tools as OpenCode style (YAML object)
 */
function formatOpenCodeTools(tools: AgentTools): string {
  const lines = [
    `  read: ${tools.read}`,
    `  write: ${tools.write}`,
    `  edit: ${tools.edit}`,
    `  bash: ${tools.bash}`,
    `  glob: ${tools.glob}`,
    `  grep: ${tools.grep}`,
  ];
  return lines.join("\n");
}

/**
 * Generate Claude Code frontmatter
 */
function generateClaudeFrontmatter(meta: AgentMetadata): string {
  const lines = [
    "---",
    `name: ${meta.name}`,
    `description: |`,
    `  ${meta.description}`,
    `tools: ${formatClaudeTools(meta.tools)}`,
  ];
  if (meta.model) {
    lines.push(`model: ${meta.model}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

/**
 * Generate OpenCode frontmatter
 *
 * OpenCode agents use:
 * - description: Brief description of agent purpose
 * - mode: subagent (invoked via @mention) | primary (cycled with Tab) | all
 * - tools: Object with boolean values for each tool
 */
function generateOpenCodeFrontmatter(meta: AgentMetadata): string {
  const lines = [
    "---",
    `description: ${meta.description}`,
    "mode: subagent",
    "tools:",
    formatOpenCodeTools(meta.tools),
    "---",
    "",
  ];
  return lines.join("\n");
}

/**
 * Get full agent content with format-specific frontmatter
 */
export function getAgentContent(name: string, format: AgentFormat): string {
  const meta = getAgentMetadata(name);
  if (!meta) {
    throw new Error(`Unknown agent: ${name}`);
  }

  if (format === "opencode" && !meta.supportsOpenCode) {
    throw new Error(`Agent ${name} does not support OpenCode format`);
  }

  const body = readAgentBody(name);
  const frontmatter =
    format === "claude"
      ? generateClaudeFrontmatter(meta)
      : generateOpenCodeFrontmatter(meta);

  return frontmatter + body;
}

/**
 * Agent template definition (for backwards compatibility)
 */
export interface AgentTemplate {
  /** Agent name (used for filename) */
  name: string;
  /** Template content */
  content: string;
  /** Human-readable description */
  description: string;
}

/**
 * Get all agent templates for a specific format
 */
export function getAllAgents(format: AgentFormat = "claude"): AgentTemplate[] {
  const names = getAgentNamesForFormat(format);
  return names.map((name) => {
    const meta = AGENT_METADATA[name];
    return {
      name,
      content: getAgentContent(name, format),
      description: meta.description,
    };
  });
}

/**
 * Get a specific agent template by name
 */
export function getAgentByName(
  name: string,
  format: AgentFormat = "claude",
): AgentTemplate | undefined {
  const meta = getAgentMetadata(name);
  if (!meta) return undefined;

  if (format === "opencode" && !meta.supportsOpenCode) {
    return undefined;
  }

  return {
    name,
    content: getAgentContent(name, format),
    description: meta.description,
  };
}

// Legacy exports for backwards compatibility
export const implementAgentTemplate: string = getAgentContent(
  "implement",
  "claude",
);
export const checkAgentTemplate: string = getAgentContent("check", "claude");
export const debugAgentTemplate: string = getAgentContent("debug", "claude");
export const researchAgentTemplate: string = getAgentContent(
  "research",
  "claude",
);
export const dispatchAgentTemplate: string = getAgentContent(
  "dispatch",
  "claude",
);
