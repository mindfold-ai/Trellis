/**
 * Platform Registry — Single source of truth for platform functions and derived helpers
 *
 * All platform-specific lists (backup dirs, template dirs, configured platforms, etc.)
 * are derived from AI_TOOLS in types/ai-tools.ts. Adding a new platform requires:
 * 1. Adding to AI_TOOLS (data)
 * 2. Adding to PLATFORM_FUNCTIONS below (behavior)
 * 3. Creating the configurator file + template directory
 */

import fs from "node:fs";
import path from "node:path";
import {
  AI_TOOLS,
  getManagedPaths,
  type AITool,
  type CliFlag,
} from "../types/ai-tools.js";

// Platform configurators
import { configureClaude } from "./claude.js";
import { configureCursor } from "./cursor.js";
import { configureOpenCode, collectOpenCodeTemplates } from "./opencode.js";
import { configureCodex } from "./codex.js";
import { configureKilo } from "./kilo.js";
import { configureKiro } from "./kiro.js";
import { configureGemini } from "./gemini.js";
import { configureAntigravity } from "./antigravity.js";
import { configureWindsurf } from "./windsurf.js";
import { configureQoder } from "./qoder.js";
import { configureCodebuddy } from "./codebuddy.js";
import { configureCopilot } from "./copilot.js";
import { configureDroid } from "./droid.js";
import { configurePi, collectPiTemplates } from "./pi.js";

// Shared utilities
import {
  replacePythonCommandLiterals,
  resolvePlaceholders,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  wrapWithCommandFrontmatter,
  collectSkillTemplates,
  applyPullBasedPreludeMarkdown,
  applyPullBasedPreludeToml,
  normalizeCopilotMarkdownAgents,
} from "./shared.js";

// Platform-specific template content (hooks, agents, settings — NOT commands/skills)
import {
  getAllAgents as getClaudeAgents,
  getSettingsTemplate as getClaudeSettings,
} from "../templates/claude/index.js";
import {
  getAllAgents as getCodexAgents,
  getAllCodexSkills as getCodexPlatformSkills,
  getAllHooks as getCodexHooks,
  getConfigTemplate as getCodexConfigTemplate,
  getHooksConfig as getCodexHooksConfig,
} from "../templates/codex/index.js";
import {
  getAllHooks as getCopilotHooks,
  getHooksConfig as getCopilotHooksConfig,
} from "../templates/copilot/index.js";
import {
  getAllAgents as getQoderAgents,
  getSettingsTemplate as getQoderSettings,
} from "../templates/qoder/index.js";
import {
  getAllAgents as getCodebuddyAgents,
  getSettingsTemplate as getCodebuddySettings,
} from "../templates/codebuddy/index.js";
import {
  getAllDroids as getDroidDroids,
  getSettingsTemplate as getDroidSettings,
} from "../templates/droid/index.js";
import {
  getAllAgents as getCursorAgents,
  getHooksConfig as getCursorHooksConfig,
} from "../templates/cursor/index.js";
import {
  getAllAgents as getGeminiAgents,
  getSettingsTemplate as getGeminiSettings,
} from "../templates/gemini/index.js";
import { getAllAgents as getKiroAgents } from "../templates/kiro/index.js";
import {
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../templates/shared-hooks/index.js";

// =============================================================================
// Platform Functions Registry
// =============================================================================

interface PlatformFunctions {
  /** Configure platform during init (copy templates to project) */
  configure: (cwd: string) => Promise<void>;
  /** Collect template files for update tracking. Undefined = platform skipped during update. */
  collectTemplates?: () => Map<string, string>;
}

/**
 * Platform functions registry — maps each AITool to its behavior.
 * When adding a new platform, add an entry here.
 */
/** Helper: collect the shared hook scripts that `platform` actually
 *  registers. Keyed off SHARED_HOOKS_BY_PLATFORM so runtime install
 *  (writeSharedHooks) and update diff (collectSharedHooks) never drift.
 */
function collectSharedHooks(
  hooksPath: string,
  platform: SharedHookPlatform,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    files.set(`${hooksPath}/${hook.name}`, hook.content);
  }
  return files;
}

/** Apply python3→python replacement to all content in a template map. */
function replaceInMap(map: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, content] of map) {
    result.set(key, replacePythonCommandLiterals(content));
  }
  return result;
}

/** Helper: collect commands + skills for "both" platforms */
function collectBothTemplates(
  ctx: import("../types/ai-tools.js").TemplateContext,
  cmdPath: (name: string) => string,
  skillRoot: string,
  wrapCmd?: (filePath: string, content: string) => string,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const cmd of resolveCommands(ctx)) {
    const filePath = cmdPath(cmd.name);
    files.set(filePath, wrapCmd ? wrapCmd(filePath, cmd.content) : cmd.content);
  }
  for (const [filePath, content] of collectSkillTemplates(
    skillRoot,
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }
  return files;
}

const PLATFORM_FUNCTIONS: Record<AITool, PlatformFunctions> = {
  "claude-code": {
    configure: configureClaude,
    collectTemplates: () => {
      const ctx = AI_TOOLS["claude-code"].templateContext;
      const files = collectBothTemplates(
        ctx,
        (n) => `.claude/commands/trellis/${n}.md`,
        ".claude/skills",
      );
      for (const agent of getClaudeAgents()) {
        files.set(`.claude/agents/${agent.name}.md`, agent.content);
      }
      for (const [k, v] of collectSharedHooks(".claude/hooks", "claude")) {
        files.set(k, v);
      }
      const settings = getClaudeSettings();
      files.set(
        `.claude/${settings.targetPath}`,
        resolvePlaceholders(settings.content),
      );
      return files;
    },
  },
  cursor: {
    configure: configureCursor,
    collectTemplates: () => {
      const files = collectBothTemplates(
        AI_TOOLS.cursor.templateContext,
        (n) => `.cursor/commands/trellis-${n}.md`,
        ".cursor/skills",
      );
      for (const agent of getCursorAgents()) {
        files.set(`.cursor/agents/${agent.name}.md`, agent.content);
      }
      for (const [k, v] of collectSharedHooks(".cursor/hooks", "cursor")) {
        files.set(k, v);
      }
      files.set(
        ".cursor/hooks.json",
        resolvePlaceholders(getCursorHooksConfig()),
      );
      return files;
    },
  },
  opencode: {
    configure: configureOpenCode,
    collectTemplates: () => collectOpenCodeTemplates(),
  },
  codex: {
    configure: configureCodex,
    collectTemplates: () => {
      const files = new Map<string, string>();
      const ctx = AI_TOOLS.codex.templateContext;
      for (const [filePath, content] of collectSkillTemplates(
        ".agents/skills",
        resolveAllAsSkills(ctx),
        resolveBundledSkills(ctx),
      )) {
        files.set(filePath, content);
      }
      for (const skill of getCodexPlatformSkills()) {
        files.set(`.codex/skills/${skill.name}/SKILL.md`, skill.content);
      }
      for (const agent of applyPullBasedPreludeToml(getCodexAgents())) {
        files.set(`.codex/agents/${agent.name}.toml`, agent.content);
      }
      for (const hook of getCodexHooks()) {
        files.set(`.codex/hooks/${hook.name}`, hook.content);
      }
      // Shared hooks (inject-workflow-state.py only) — mirror configureCodex
      for (const [k, v] of collectSharedHooks(".codex/hooks", "codex")) {
        files.set(k, v);
      }
      files.set(
        ".codex/hooks.json",
        resolvePlaceholders(getCodexHooksConfig()),
      );
      const config = getCodexConfigTemplate();
      files.set(`.codex/${config.targetPath}`, config.content);
      return files;
    },
  },
  kilo: {
    configure: configureKilo,
    collectTemplates: () =>
      collectBothTemplates(
        AI_TOOLS.kilo.templateContext,
        (n) => `.kilocode/workflows/${n}.md`,
        ".kilocode/skills",
      ),
  },
  kiro: {
    configure: configureKiro,
    collectTemplates: () => {
      const files = new Map<string, string>();
      const ctx = AI_TOOLS.kiro.templateContext;
      for (const [filePath, content] of collectSkillTemplates(
        ".kiro/skills",
        resolveAllAsSkills(ctx),
        resolveBundledSkills(ctx),
      )) {
        files.set(filePath, content);
      }
      for (const agent of getKiroAgents()) {
        files.set(
          `.kiro/agents/${agent.name}.json`,
          resolvePlaceholders(agent.content),
        );
      }
      for (const [k, v] of collectSharedHooks(".kiro/hooks", "kiro")) {
        files.set(k, v);
      }
      return files;
    },
  },
  gemini: {
    configure: configureGemini,
    collectTemplates: () => {
      const ctx = AI_TOOLS.gemini.templateContext;
      const files = new Map<string, string>();
      for (const cmd of resolveCommands(ctx)) {
        const toml = `description = "Trellis: ${cmd.name}"\n\nprompt = """\n${cmd.content}\n"""\n`;
        files.set(`.gemini/commands/trellis/${cmd.name}.toml`, toml);
      }
      for (const [filePath, content] of collectSkillTemplates(
        ".gemini/skills",
        resolveSkills(ctx),
        resolveBundledSkills(ctx),
      )) {
        files.set(filePath, content);
      }
      for (const agent of applyPullBasedPreludeMarkdown(getGeminiAgents())) {
        files.set(`.gemini/agents/${agent.name}.md`, agent.content);
      }
      for (const [k, v] of collectSharedHooks(".gemini/hooks", "gemini")) {
        files.set(k, v);
      }
      files.set(
        ".gemini/settings.json",
        resolvePlaceholders(getGeminiSettings()),
      );
      return files;
    },
  },
  antigravity: {
    configure: configureAntigravity,
    collectTemplates: () =>
      collectBothTemplates(
        AI_TOOLS.antigravity.templateContext,
        (n) => `.agent/workflows/${n}.md`,
        ".agent/skills",
      ),
  },
  windsurf: {
    configure: configureWindsurf,
    collectTemplates: () =>
      collectBothTemplates(
        AI_TOOLS.windsurf.templateContext,
        (n) => `.windsurf/workflows/trellis-${n}.md`,
        ".windsurf/skills",
      ),
  },
  qoder: {
    configure: configureQoder,
    collectTemplates: () => {
      const files = collectBothTemplates(
        AI_TOOLS.qoder.templateContext,
        (n) => `.qoder/commands/trellis-${n}.md`,
        ".qoder/skills",
        (filePath, content) => {
          const name = path.basename(filePath, ".md");
          return wrapWithCommandFrontmatter(name, content);
        },
      );
      for (const agent of applyPullBasedPreludeMarkdown(getQoderAgents())) {
        files.set(`.qoder/agents/${agent.name}.md`, agent.content);
      }
      for (const [k, v] of collectSharedHooks(".qoder/hooks", "qoder")) {
        files.set(k, v);
      }
      const settings = getQoderSettings();
      files.set(
        `.qoder/${settings.targetPath}`,
        resolvePlaceholders(settings.content),
      );
      return files;
    },
  },
  codebuddy: {
    configure: configureCodebuddy,
    collectTemplates: () => {
      const files = collectBothTemplates(
        AI_TOOLS.codebuddy.templateContext,
        (n) => `.codebuddy/commands/trellis/${n}.md`,
        ".codebuddy/skills",
      );
      for (const agent of getCodebuddyAgents()) {
        files.set(`.codebuddy/agents/${agent.name}.md`, agent.content);
      }
      for (const [k, v] of collectSharedHooks(
        ".codebuddy/hooks",
        "codebuddy",
      )) {
        files.set(k, v);
      }
      const settings = getCodebuddySettings();
      files.set(
        `.codebuddy/${settings.targetPath}`,
        resolvePlaceholders(settings.content),
      );
      return files;
    },
  },
  copilot: {
    configure: configureCopilot,
    collectTemplates: () => {
      const ctx = AI_TOOLS.copilot.templateContext;
      const files = new Map<string, string>();
      for (const cmd of resolveCommands(ctx)) {
        files.set(`.github/prompts/${cmd.name}.prompt.md`, cmd.content);
      }
      for (const [filePath, content] of collectSkillTemplates(
        ".github/skills",
        resolveSkills(ctx),
        resolveBundledSkills(ctx),
      )) {
        files.set(filePath, content);
      }
      // Copilot's own session-start hook
      for (const hook of getCopilotHooks()) {
        files.set(`.github/copilot/hooks/${hook.name}`, hook.content);
      }
      // Shared hooks (inject-workflow-state.py only). Copilot bundles its own
      // session-start.py above; sub-agent context is pull-based (class-2).
      for (const [k, v] of collectSharedHooks(
        ".github/copilot/hooks",
        "copilot",
      )) {
        files.set(k, v);
      }
      // Agents: reuse Cursor content + prepend pull-based prelude, then
      // normalize Cursor's Claude-style tools frontmatter for Copilot.
      for (const agent of applyPullBasedPreludeMarkdown(
        normalizeCopilotMarkdownAgents(getCursorAgents()),
      )) {
        files.set(`.github/agents/${agent.name}.agent.md`, agent.content);
      }
      const hooksConfig = resolvePlaceholders(getCopilotHooksConfig());
      files.set(".github/copilot/hooks.json", hooksConfig);
      files.set(".github/hooks/trellis.json", hooksConfig);
      return files;
    },
  },
  droid: {
    configure: configureDroid,
    collectTemplates: () => {
      const files = collectBothTemplates(
        AI_TOOLS.droid.templateContext,
        (n) => `.factory/commands/trellis/${n}.md`,
        ".factory/skills",
      );
      for (const droid of getDroidDroids()) {
        files.set(`.factory/droids/${droid.name}.md`, droid.content);
      }
      for (const [k, v] of collectSharedHooks(".factory/hooks", "droid")) {
        files.set(k, v);
      }
      const settings = getDroidSettings();
      files.set(
        `.factory/${settings.targetPath}`,
        resolvePlaceholders(settings.content),
      );
      return files;
    },
  },
  pi: {
    configure: configurePi,
    collectTemplates: () => collectPiTemplates(),
  },
};

// =============================================================================
// Derived Helpers — all derived from AI_TOOLS registry
// =============================================================================

/** All platform IDs */
export const PLATFORM_IDS = Object.keys(AI_TOOLS) as AITool[];

/** All platform config directory names (e.g., [".claude", ".cursor", ".opencode"]) */
export const CONFIG_DIRS = PLATFORM_IDS.map((id) => AI_TOOLS[id].configDir);

/** All managed paths for every platform (primary configDir + extra managed paths). */
export const PLATFORM_MANAGED_DIRS = PLATFORM_IDS.flatMap((id) =>
  getManagedPaths(id),
);

/** All directories managed by Trellis (including .trellis itself) */
export const ALL_MANAGED_DIRS = [".trellis", ...new Set(PLATFORM_MANAGED_DIRS)];

/**
 * Detect which platforms are configured by checking for configDir existence.
 *
 * Note: Detection uses only `configDir` (the platform-specific directory),
 * NOT shared layers like `.agents/skills/`. This prevents false positives
 * where a shared directory triggers detection of a specific platform.
 */
export function getConfiguredPlatforms(cwd: string): Set<AITool> {
  const platforms = new Set<AITool>();
  for (const id of PLATFORM_IDS) {
    if (fs.existsSync(path.join(cwd, AI_TOOLS[id].configDir))) {
      platforms.add(id);
    }
  }
  return platforms;
}

/**
 * Get platform IDs that have Python hooks (for Windows encoding detection)
 */
export function getPlatformsWithPythonHooks(): AITool[] {
  return PLATFORM_IDS.filter((id) => AI_TOOLS[id].hasPythonHooks);
}

/**
 * Check if a path starts with any managed directory
 */
export function isManagedPath(dirPath: string): boolean {
  // Normalize Windows backslashes to forward slashes for consistent matching
  const normalized = dirPath.replace(/\\/g, "/");
  return ALL_MANAGED_DIRS.some(
    (d) => normalized.startsWith(d + "/") || normalized === d,
  );
}

/**
 * Check if a directory name is a managed root directory (should not be deleted)
 */
export function isManagedRootDir(dirName: string): boolean {
  return ALL_MANAGED_DIRS.includes(dirName);
}

/**
 * Get all managed paths for a platform.
 */
export function getPlatformManagedPaths(platformId: AITool): string[] {
  return getManagedPaths(platformId);
}

/**
 * Get the configure function for a platform
 */
export function configurePlatform(
  platformId: AITool,
  cwd: string,
): Promise<void> {
  return PLATFORM_FUNCTIONS[platformId].configure(cwd);
}

/**
 * Collect template files for a specific platform (for update tracking).
 * Returns undefined if the platform doesn't support template tracking.
 */
export function collectPlatformTemplates(
  platformId: AITool,
): Map<string, string> | undefined {
  const map = PLATFORM_FUNCTIONS[platformId].collectTemplates?.();
  return map ? replaceInMap(map) : map;
}

/**
 * Build TOOLS array for interactive init prompt, derived from AI_TOOLS registry
 */
export function getInitToolChoices(): {
  key: CliFlag;
  name: string;
  defaultChecked: boolean;
  platformId: AITool;
}[] {
  return PLATFORM_IDS.map((id) => ({
    key: AI_TOOLS[id].cliFlag,
    name: AI_TOOLS[id].name,
    defaultChecked: AI_TOOLS[id].defaultChecked,
    platformId: id,
  }));
}

/**
 * Resolve CLI flag name to AITool id (e.g., "claude" → "claude-code")
 */
export function resolveCliFlag(flag: string): AITool | undefined {
  return PLATFORM_IDS.find((id) => AI_TOOLS[id].cliFlag === flag);
}
