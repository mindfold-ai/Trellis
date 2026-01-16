/**
 * AI Tool Types and Registry
 *
 * Defines supported AI coding tools and which command templates they can use.
 */

/**
 * Supported AI coding tools
 */
export type AITool = "claude-code" | "cursor" | "opencode";

/**
 * Template directory categories
 */
export type TemplateDir = "common" | "claude" | "cursor" | "opencode";

/**
 * Configuration for an AI tool
 */
export interface AIToolConfig {
  /** Display name of the tool */
  name: string;
  /** Command template directory names to include */
  templateDirs: TemplateDir[];
}

/**
 * Registry of all supported AI tools and their configurations
 */
export const AI_TOOLS: Record<AITool, AIToolConfig> = {
  "claude-code": {
    name: "Claude Code",
    templateDirs: ["common", "claude"],
  },
  cursor: {
    name: "Cursor",
    templateDirs: ["common", "cursor"],
  },
  opencode: {
    name: "OpenCode",
    templateDirs: ["common", "opencode"],
  },
};

/**
 * Get the configuration for a specific AI tool
 */
export function getToolConfig(tool: AITool): AIToolConfig {
  return AI_TOOLS[tool];
}

/**
 * Get template directories for a specific tool
 */
export function getTemplateDirs(tool: AITool): TemplateDir[] {
  return AI_TOOLS[tool].templateDirs;
}
