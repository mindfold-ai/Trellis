/**
 * AI Tool Types and Registry
 *
 * Defines supported AI coding tools and which command templates they can use.
 */

/**
 * Supported AI coding tools
 */
export type AITool =
  | "claude-code"
  | "cursor"
  | "opencode"
  | "iflow"
  | "codex"
  | "kilo"
  | "kiro"
  | "gemini"
  | "antigravity"
  | "windsurf"
  | "qoder"
  | "codebuddy"
  | "copilot"
  | "droid";

/**
 * Template directory categories
 */
export type TemplateDir =
  | "common"
  | "claude"
  | "cursor"
  | "opencode"
  | "iflow"
  | "codex"
  | "kilo"
  | "kiro"
  | "gemini"
  | "antigravity"
  | "windsurf"
  | "qoder"
  | "codebuddy"
  | "copilot"
  | "droid";

/**
 * CLI flag names for platform selection (e.g., --claude, --cursor, --kilo, --kiro, --gemini, --antigravity)
 * Must match keys in InitOptions (src/commands/init.ts)
 */
export type CliFlag =
  | "claude"
  | "cursor"
  | "opencode"
  | "iflow"
  | "codex"
  | "kilo"
  | "kiro"
  | "gemini"
  | "antigravity"
  | "windsurf"
  | "qoder"
  | "codebuddy"
  | "copilot"
  | "droid";

/**
 * Configuration for an AI tool
 */
export interface AIToolConfig {
  /** Display name of the tool */
  name: string;
  /** Command template directory names to include */
  templateDirs: TemplateDir[];
  /** Config directory name in the project root (e.g., ".claude") */
  configDir: string;
  /**
   * Whether the platform supports the shared `.agents/skills/` layer
   * (agentskills.io open standard). When true, `.agents/skills` is added
   * to the platform's managed paths automatically.
   */
  supportsAgentSkills?: boolean;
  /** Additional managed paths beyond configDir (e.g., .github/hooks for Copilot) */
  extraManagedPaths?: string[];
  /** CLI flag name for --flag options (e.g., "claude" for --claude) */
  cliFlag: CliFlag;
  /** Whether this tool is checked by default in interactive init prompt */
  defaultChecked: boolean;
  /** Whether this tool uses Python hooks (affects Windows encoding detection) */
  hasPythonHooks: boolean;
}

/**
 * Registry of all supported AI tools and their configurations.
 * This is the single source of truth for platform data.
 *
 * When adding a new platform, add an entry here and create:
 * 1. src/configurators/{platform}.ts — configure function
 * 2. src/templates/{platform}/ — template files
 * 3. Register in src/configurators/index.ts — PLATFORM_FUNCTIONS
 * 4. Add CLI flag in src/cli/index.ts
 * 5. Add to InitOptions in src/commands/init.ts
 */
export const AI_TOOLS: Record<AITool, AIToolConfig> = {
  "claude-code": {
    name: "Claude Code",
    templateDirs: ["common", "claude"],
    configDir: ".claude",
    cliFlag: "claude",
    defaultChecked: true,
    hasPythonHooks: true,
  },
  cursor: {
    name: "Cursor",
    templateDirs: ["common", "cursor"],
    configDir: ".cursor",
    cliFlag: "cursor",
    defaultChecked: true,
    hasPythonHooks: false,
  },
  opencode: {
    name: "OpenCode",
    templateDirs: ["common", "opencode"],
    configDir: ".opencode",
    cliFlag: "opencode",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  iflow: {
    name: "iFlow CLI",
    templateDirs: ["common", "iflow"],
    configDir: ".iflow",
    cliFlag: "iflow",
    defaultChecked: false,
    hasPythonHooks: true,
  },
  codex: {
    name: "Codex (also writes .agents/skills/ — read by Cursor, Gemini CLI, GitHub Copilot, Amp, Kimi Code)",
    templateDirs: ["common", "codex"],
    configDir: ".codex",
    supportsAgentSkills: true,
    cliFlag: "codex",
    defaultChecked: false,
    hasPythonHooks: true,
  },
  kilo: {
    name: "Kilo CLI",
    templateDirs: ["common", "kilo"],
    configDir: ".kilocode",
    cliFlag: "kilo",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  kiro: {
    name: "Kiro Code",
    templateDirs: ["common", "kiro"],
    configDir: ".kiro/skills",
    cliFlag: "kiro",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  gemini: {
    name: "Gemini CLI",
    templateDirs: ["common", "gemini"],
    configDir: ".gemini",
    cliFlag: "gemini",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  antigravity: {
    name: "Antigravity",
    templateDirs: ["common", "antigravity"],
    configDir: ".agent/workflows",
    cliFlag: "antigravity",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  windsurf: {
    name: "Windsurf",
    templateDirs: ["common", "windsurf"],
    configDir: ".windsurf/workflows",
    cliFlag: "windsurf",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  qoder: {
    name: "Qoder",
    templateDirs: ["common", "qoder"],
    configDir: ".qoder",
    cliFlag: "qoder",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  codebuddy: {
    name: "CodeBuddy",
    templateDirs: ["common", "codebuddy"],
    configDir: ".codebuddy",
    cliFlag: "codebuddy",
    defaultChecked: false,
    hasPythonHooks: false,
  },
  copilot: {
    name: "GitHub Copilot",
    templateDirs: ["common", "copilot"],
    configDir: ".github/copilot",
    extraManagedPaths: [".github/hooks", ".github/prompts"],
    cliFlag: "copilot",
    defaultChecked: false,
    hasPythonHooks: true,
  },
  droid: {
    name: "Factory Droid",
    templateDirs: ["common", "droid"],
    configDir: ".factory",
    cliFlag: "droid",
    defaultChecked: false,
    hasPythonHooks: false,
  },
};

/**
 * Get the configuration for a specific AI tool
 */
export function getToolConfig(tool: AITool): AIToolConfig {
  return AI_TOOLS[tool];
}

/**
 * Get all managed paths for a specific tool.
 */
export function getManagedPaths(tool: AITool): string[] {
  const config = AI_TOOLS[tool];
  const paths = [config.configDir];
  if (config.supportsAgentSkills) {
    paths.push(".agents/skills");
  }
  if (config.extraManagedPaths) {
    paths.push(...config.extraManagedPaths);
  }
  return paths;
}

/**
 * Get template directories for a specific tool
 */
export function getTemplateDirs(tool: AITool): TemplateDir[] {
  return AI_TOOLS[tool].templateDirs;
}
