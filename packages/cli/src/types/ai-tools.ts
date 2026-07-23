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
  | "omp"
  | "grok"
  | "kimi"
  | "snow";

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
  | "omp"
  | "grok"
  | "kimi"
  | "snow";

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
  | "omp"
  | "grok"
  | "kimi"
  | "snow";

/**
 * Template context for placeholder resolution.
 * Controls how common templates are rendered per platform.
 */
export interface TemplateContext {
  /** Prefix for cross-referencing other commands/skills */
  cmdRefPrefix:
    | "/trellis:"
    | "/trellis-"
    | "$"
    | "/"
    | "/skill trellis-"
    | "/skill:trellis-";
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
    // hasHooks: false — OpenCode has no session-start hook. The pre-v0.5.0
    // `.opencode/commands/trellis/start.md` deprecation in
    // migrations/manifests/0.5.0-beta.0.json assumed a hook would replace it;
    // that never happened for OpenCode, so `resolveCommands`/`filterCommands`
    // (see configurators/shared.ts) still generate `/start` as the live
    // fallback command for this `agentCapable && !hasHooks` platform.
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
      ".github/copilot-instructions.md",
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
    // Pi also writes .agents/skills/, which is read by Cursor, Gemini CLI,
    // GitHub Copilot, Amp, and Kimi Code. Keep that detail here rather than
    // in `name` — `name` leaks verbatim into `trellis platforms` output and
    // init checkboxes, where a long parenthetical reads badly.
    name: "Pi Agent",
    templateDirs: ["common", "pi"],
    configDir: ".pi",
    supportsAgentSkills: true,
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
    // `.zcode/cli/agents` is the pre-ZCode-update discovery path. Kept managed
    // during the transition so `trellis update --migrate` (rename-dir →
    // `.zcode/agents/`) and `trellis uninstall` can clean up the now-empty
    // `.zcode/cli/` parent. Drop this entry once the migration has shipped and
    // no project still holds the legacy dir. Only empty dirs are ever removed,
    // so user files are never touched (see cleanupEmptyDirs in update.ts).
    extraManagedPaths: [
      ".zcode/cli/agents",
      ".zcode/agents",
      ".zcode/commands",
      ".zcode/skills",
      // Hooks assets written by configureZcode.
      ".zcode/hooks",
    ],
    cliFlag: "zcode",
    defaultChecked: false,
    hasPythonHooks: true,
    templateContext: {
      cmdRefPrefix: "/trellis:",
      executorAI: "Bash scripts or Agent calls",
      userActionLabel: "Skills",
      agentCapable: true,
      // ZCode (3.x) supports a workspace hook config at .zcode/config.json
      // with SessionStart / UserPromptSubmit / PreToolUse events. PreToolUse
      // can mutate sub-agent prompts, so ZCode is class-1 hook-inject.
      hasHooks: true,
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
  /**
   * Grok Build (xAI) — class-2 pull-based platform.
   *
   * Phase 0 verified (Grok 0.2.101): skills/agents/AGENTS.md load correctly;
   * Claude-style hook `additionalContext` is NOT injected into the model.
   * Do not set hasHooks/hasPythonHooks true until Grok consumes hook stdout.
   * Commands are flat under `.grok/commands/trellis-*.md` (Grok slash-command layout).
   */
  grok: {
    name: "Grok Build",
    templateDirs: ["common", "grok"],
    configDir: ".grok",
    extraManagedPaths: [".grok/skills", ".grok/commands", ".grok/agents"],
    cliFlag: "grok",
    defaultChecked: false,
    hasPythonHooks: false,
    templateContext: {
      cmdRefPrefix: "/trellis-",
      executorAI: "Bash scripts or Agent calls",
      userActionLabel: "Skills",
      agentCapable: true,
      hasHooks: false,
      cliFlag: "grok",
    },
  },
  /**
   * Kimi Code CLI — class-2 pull-based platform.
   *
   * Kimi reads project skills from `.kimi-code/skills/` AND the shared
   * `.agents/skills/` (agentskills.io standard), so workflow/bundled skills go
   * to the shared root via the neutral resolver (byte-identical to
   * Codex/Gemini/Pi writes) while user-invocable entry points
   * (`trellis-start` / `trellis-continue` / `trellis-finish-work`, invoked as
   * `/skill:trellis-<name>`) and the Trellis sub-agent prompts live under
   * `.kimi-code/skills/`.
   *
   * Kimi has no project-level hooks/settings file Trellis may write (hooks are
   * user-level `~/.kimi-code/config.toml` only) and no project-level custom
   * sub-agent definitions (only the built-in coder/explore/plan sub-agents), so
   * the Trellis agent prompts ship as skills with the pull-based prelude.
   */
  kimi: {
    name: "Kimi Code",
    templateDirs: ["common", "kimi"],
    configDir: ".kimi-code",
    supportsAgentSkills: true,
    cliFlag: "kimi",
    defaultChecked: false,
    hasPythonHooks: false,
    templateContext: {
      cmdRefPrefix: "/skill:trellis-",
      executorAI: "Bash scripts or Agent calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: false,
      cliFlag: "kimi",
    },
  },
  /**
   * Snow CLI - class-1 platform.
   *
   * Skills: `.snow/skills/` (Claude Code Skills compatible)
   * Commands: `.snow/commands/trellis-*.json` (type: prompt)
   * Agents: `.snow/agents/` (project discovery; no class-2 pull prelude)
   * Hooks: `.snow/hooks/` emit additionalContext JSON (session/user/sub-agent)
   *
   * hasHooks=true: SessionStart injects context -> trellis-start is filtered out.
   * hasPythonHooks=true: ships write-trellis-context.py under .snow/hooks/.
   * Primary agent path is `.snow/agents/*.md` only (no legacy JSON fragment).
   *
   * CLI flag: `--snow`.
   * Detection uses configDir `.snow/skills` so bare `.snow/settings.json` is not
   * a false-positive "configured" project.
   */
  snow: {
    name: "Snow CLI",
    templateDirs: ["common", "snow"],
    configDir: ".snow/skills",
    extraManagedPaths: [
      ".snow/commands",
      ".snow/agents",
      ".snow/hooks",
      ".snow/SNOW.md",
    ],
    cliFlag: "snow",
    defaultChecked: false,
    hasPythonHooks: true,
    templateContext: {
      cmdRefPrefix: "/trellis-",
      executorAI: "Bash scripts or Agent calls",
      userActionLabel: "Skills",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "snow",
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
