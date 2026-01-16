/**
 * Command templates for Trellis workflow
 *
 * All templates are in common/ and work with all supported AI tools.
 * The claude/ directory is reserved for future Claude-specific commands.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { AITool, TemplateDir } from "../../types/ai-tools.js";
import { getTemplateDirs } from "../../types/ai-tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read a command template from the specified subdirectory
 */
function readCommand(subdir: string, filename: string): string {
  const filePath = join(__dirname, subdir, filename);
  return readFileSync(filePath, "utf-8");
}

// =============================================================================
// Tool-specific Templates
// =============================================================================

// Claude-specific commands
export const claudeStartTemplate: string = readCommand(
  "claude",
  "start.md.txt",
);
export const claudeParallelTemplate: string = readCommand(
  "claude",
  "parallel.md.txt",
);

// Cursor-specific commands
export const cursorStartTemplate: string = readCommand(
  "cursor",
  "start.md.txt",
);

// OpenCode-specific commands
export const opencodeStartTemplate: string = readCommand(
  "opencode",
  "start.md.txt",
);

// =============================================================================
// Common Templates (work with all AI tools)
// =============================================================================

// Core workflow commands
export const recordAgentFlowTemplate: string = readCommand(
  "common",
  "record-agent-flow.txt",
);
export const onboardDeveloperTemplate: string = readCommand(
  "common",
  "onboard-developer.txt",
);

// Development check commands
export const checkFrontendTemplate: string = readCommand(
  "common",
  "check-frontend.txt",
);
export const checkBackendTemplate: string = readCommand(
  "common",
  "check-backend.txt",
);
export const checkCrossLayerTemplate: string = readCommand(
  "common",
  "check-cross-layer.txt",
);

// Pre-development commands
export const beforeFrontendDevTemplate: string = readCommand(
  "common",
  "before-frontend-dev.txt",
);
export const beforeBackendDevTemplate: string = readCommand(
  "common",
  "before-backend-dev.txt",
);

// Work completion commands
export const finishWorkTemplate: string = readCommand(
  "common",
  "finish-work.txt",
);
export const breakLoopTemplate: string = readCommand(
  "common",
  "break-loop.txt",
);

// Utility commands
export const createCommandTemplate: string = readCommand(
  "common",
  "create-command.txt",
);
export const integrateSkillTemplate: string = readCommand(
  "common",
  "integrate-skill.txt",
);

// =============================================================================
// Template Registry
// =============================================================================

/**
 * Command template definition
 */
export interface CommandTemplate {
  /** Command name (used for filename) */
  name: string;
  /** Template content */
  content: string;
  /** Human-readable description */
  description: string;
  /** Which directory this template belongs to */
  category: TemplateDir;
}

/**
 * All available command templates
 */
const ALL_TEMPLATES: CommandTemplate[] = [
  // Claude-specific
  {
    name: "start",
    content: claudeStartTemplate,
    description: "Initialize AI agent with project context",
    category: "claude",
  },
  {
    name: "parallel",
    content: claudeParallelTemplate,
    description: "Multi-agent pipeline in isolated worktrees",
    category: "claude",
  },
  // Cursor-specific
  {
    name: "start",
    content: cursorStartTemplate,
    description: "Initialize AI agent with project context",
    category: "cursor",
  },
  // OpenCode-specific
  {
    name: "start",
    content: opencodeStartTemplate,
    description: "Initialize AI agent with project context",
    category: "opencode",
  },
  // Common
  {
    name: "record-agent-flow",
    content: recordAgentFlowTemplate,
    description: "Record successful agent workflow patterns",
    category: "common",
  },
  {
    name: "onboard-developer",
    content: onboardDeveloperTemplate,
    description: "Onboard new developer to the project",
    category: "common",
  },
  {
    name: "check-frontend",
    content: checkFrontendTemplate,
    description: "Check frontend code quality",
    category: "common",
  },
  {
    name: "check-backend",
    content: checkBackendTemplate,
    description: "Check backend code quality",
    category: "common",
  },
  {
    name: "check-cross-layer",
    content: checkCrossLayerTemplate,
    description: "Check cross-layer integration",
    category: "common",
  },
  {
    name: "before-frontend-dev",
    content: beforeFrontendDevTemplate,
    description: "Pre-flight check before frontend development",
    category: "common",
  },
  {
    name: "before-backend-dev",
    content: beforeBackendDevTemplate,
    description: "Pre-flight check before backend development",
    category: "common",
  },
  {
    name: "finish-work",
    content: finishWorkTemplate,
    description: "Complete and document work session",
    category: "common",
  },
  {
    name: "break-loop",
    content: breakLoopTemplate,
    description: "Break out of repetitive patterns",
    category: "common",
  },
  {
    name: "create-command",
    content: createCommandTemplate,
    description: "Create a new slash command",
    category: "common",
  },
  {
    name: "integrate-skill",
    content: integrateSkillTemplate,
    description:
      "Integrate a skill into project guidelines (requires openskills)",
    category: "common",
  },
];

/**
 * Get command templates available for a specific AI tool
 */
export function getTemplatesForTool(tool: AITool): CommandTemplate[] {
  const allowedDirs = getTemplateDirs(tool);
  return ALL_TEMPLATES.filter((t) => allowedDirs.includes(t.category));
}

/**
 * Get all command templates
 */
export function getAllTemplates(): CommandTemplate[] {
  return ALL_TEMPLATES;
}

/**
 * Get a specific template by name
 */
export function getTemplateByName(name: string): CommandTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.name === name);
}
