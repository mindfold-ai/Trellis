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
 | "codex"
 | "kilo"
 | "kiro"
 | "gemini"
 | "antigravity"
 | "devin"
 | "qoder"
 | "codebuddy"
 | "copilot"
 | "droid"
 | "pi"
 | "reasonix"
 | "zcode"
 | "trae"
 | "omp";

/**
 * Template directory categories
 */
export type TemplateDir =
 | "common"
 | "claude"
 | "cursor"
 | "opencode"
 | "codex"
 | "kilo"
 | "kiro"
 | "gemini"
 | "antigravity"
 | "devin"
 | "qoder"
 | "codebuddy"
 | "copilot"
 | "droid"
 | "pi"
 | "reasonix"
 | "zcode"
 | "trae"
 | "omp";

/**
 * CLI flag names for platform selection (e.g., --claude, --cursor, --kilo, --kiro, --gemini, --antigravity)
 * Must match keys in InitOptions (src/commands/init.ts)
 */
export type CliFlag =
 | "claude"
 | "cursor"
 | "opencode"
 | "codex"
 | "kilo"
 | "kiro"
 | "gemini"
 | "antigravity"
 | "devin"
 | "qoder"
 | "codebuddy"
 | "copilot"
 | "droid"
 | "pi"
 | "reasonix"
 | "zcode"
 | "trae"
 | "omp";

/**
 * Template context for placeholder resolution.
 * Controls how common templates are rendered per platform.
 */
export interface TemplateContext {
 /** Prefix for cross-referencing other commands/skills */
 cmdRefPrefix: "/trellis:" | "/trellis-" | "$" | "/" | "/skill trellis-";
 /** Description of AI executor actions shown in role tables */
 executorAI:
 | "Bash scripts or Task calls"
 | "Bash scripts or tool calls"
 | "Bash scripts or Agent calls"
 | "Bash scripts or file reads";
 /** Label for user-invocable actions */
 userActionLabel:
 | "Slash commands"
 | "Skills"
 | "Workflows"
 | "Prompts"
 | "Commands";
 /** Platform supports spawning sub-agents with isolated context */
 agentCapable: boolean;
 /** Platform has hook system (SessionStart, PreToolUse) */
 hasHooks: boolean;
 /**
  * CLI flag value for this platform (e.g. "claude", "codex", "kiro").
  * Substituted into template commands via {{CLI_FLAG}} so rendered skill /
  * command files can pass `--platform <flag>` to scripts that need to know
  * the invoking platform, removing the need to re-detect at runtime.
  * Duplicates the top-level `AIToolConfig.cliFlag` for convenience — the
  * invariant is maintained in `AI_TOOLS` config blocks.
  */
 cliFlag: CliFlag;
}

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
 /** Template context for placeholder resolution in common templates */
 templateContext: TemplateContext;
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
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or Task calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "claude",
  },
 },
 cursor: {
  name: "Cursor",
  templateDirs: ["common", "cursor"],
  configDir: ".cursor",
  cliFlag: "cursor",
  defaultChecked: true,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "/trellis-",
   executorAI: "Bash scripts or Task calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "cursor",
  },
 },
 opencode: {
  name: "OpenCode",
  templateDirs: ["common", "opencode"],
  configDir: ".opencode",
  cliFlag: "opencode",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or Task calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: false,
   cliFlag: "opencode",
  },
 },
 codex: {
  name: "Codex (also writes .agents/skills/ — read by Cursor, Gemini CLI, GitHub Copilot, Amp, Kimi Code)",
  templateDirs: ["common", "codex"],
  configDir: ".codex",
  supportsAgentSkills: true,
  cliFlag: "codex",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "$",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Skills",
   agentCapable: true,
   hasHooks: false,
   cliFlag: "codex",
  },
 },
 kilo: {
  name: "Kilo CLI",
  templateDirs: ["common", "kilo"],
  configDir: ".kilocode",
  cliFlag: "kilo",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or file reads",
   userActionLabel: "Workflows",
   agentCapable: false,
   hasHooks: false,
   cliFlag: "kilo",
  },
 },
 kiro: {
  name: "Kiro Code",
  templateDirs: ["common", "kiro"],
  configDir: ".kiro/skills",
  extraManagedPaths: [".kiro/agents", ".kiro/hooks"],
  cliFlag: "kiro",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "$",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Skills",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "kiro",
  },
 },
 gemini: {
  name: "Gemini CLI",
  templateDirs: ["common", "gemini"],
  configDir: ".gemini",
  supportsAgentSkills: true,
  cliFlag: "gemini",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "gemini",
  },
 },
 antigravity: {
  name: "Antigravity",
  templateDirs: ["common", "antigravity"],
  configDir: ".agent/workflows",
  extraManagedPaths: [".agent/skills"],
  cliFlag: "antigravity",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/",
   executorAI: "Bash scripts or file reads",
   userActionLabel: "Workflows",
   agentCapable: false,
   hasHooks: false,
   cliFlag: "antigravity",
  },
 },
 devin: {
  name: "Devin",
  templateDirs: ["common", "devin"],
  configDir: ".devin/workflows",
  extraManagedPaths: [".devin/skills"],
  cliFlag: "devin",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/trellis-",
   executorAI: "Bash scripts or file reads",
   userActionLabel: "Workflows",
   agentCapable: false,
   hasHooks: false,
   cliFlag: "devin",
  },
 },
 qoder: {
  name: "Qoder",
  templateDirs: ["common", "qoder"],
  configDir: ".qoder",
  cliFlag: "qoder",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "$",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Skills",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "qoder",
  },
 },
 codebuddy: {
  name: "CodeBuddy",
  templateDirs: ["common", "codebuddy"],
  configDir: ".codebuddy",
  cliFlag: "codebuddy",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or Task calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "codebuddy",
  },
 },
 copilot: {
  name: "GitHub Copilot",
  templateDirs: ["common", "copilot"],
  configDir: ".github/copilot",
  extraManagedPaths: [
   ".github/agents",
   ".github/hooks",
   ".github/prompts",
   ".github/skills",
  ],
  cliFlag: "copilot",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "/",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Prompts",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "copilot",
  },
 },
 droid: {
  name: "Factory Droid",
  templateDirs: ["common", "droid"],
  configDir: ".factory",
  cliFlag: "droid",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "/trellis-",
   executorAI: "Bash scripts or Task calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "droid",
  },
 },
 pi: {
  name: "Pi Agent",
  templateDirs: ["common", "pi"],
  configDir: ".pi",
  cliFlag: "pi",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/trellis-",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "pi",
  },
 },
 reasonix: {
  name: "Reasonix",
  templateDirs: ["common", "reasonix"],
  configDir: ".reasonix",
  cliFlag: "reasonix",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/skill trellis-",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Skills",
   agentCapable: true,
   hasHooks: false,
   cliFlag: "reasonix",
  },
 },
 zcode: {
  name: "ZCode",
  templateDirs: ["common", "zcode"],
  configDir: ".zcode",
  supportsAgentSkills: true,
  extraManagedPaths: [".zcode/cli/agents", ".zcode/commands"],
  cliFlag: "zcode",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or Agent calls",
   userActionLabel: "Skills",
   agentCapable: true,
   hasHooks: false,
   cliFlag: "zcode",
  },
 },
 trae: {
  name: "Trae",
  templateDirs: ["common", "trae"],
  configDir: ".trae",
  cliFlag: "trae",
  defaultChecked: false,
  hasPythonHooks: true,
  templateContext: {
   cmdRefPrefix: "/trellis-",
   executorAI: "Bash scripts or tool calls",
   userActionLabel: "Commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "trae",
  },
 },
 omp: {
  name: "Oh My Pi",
  templateDirs: ["common", "omp"],
  configDir: ".omp",
  cliFlag: "omp",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
   cmdRefPrefix: "/trellis:",
   executorAI: "Bash scripts or Task calls",
   userActionLabel: "Slash commands",
   agentCapable: true,
   hasHooks: true,
   cliFlag: "omp",
  },
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
