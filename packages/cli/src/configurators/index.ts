/**
 * Platform Registry — Single source of truth for platform functions and derived helpers
 *
 * All platform-specific lists (backup dirs, template dirs, configured platforms, etc.)
 * are derived from AI_TOOLS in types/ai-tools.ts. Adding a new platform requires:
 * 1. Adding to AI_TOOLS (data)
 * 2. Creating `configurators/<platform>.ts` with a `collect<Platform>Templates()`
 *    that returns the platform's file set — the one place it is described
 * 3. Adding to PLATFORM_FUNCTIONS below, normally `fromTemplates(collect…)`
 * 4. Creating the template directory
 */

import fs from "node:fs";
import path from "node:path";
import {
  AI_TOOLS,
  getManagedPaths,
  type AITool,
  type CliFlag,
} from "../types/ai-tools.js";
import { loadHashes } from "../utils/template-hash.js";

// Platform file sets — each `collect*Templates` is the single description of
// what its platform installs, and lives next to any residual behavior.
import { collectClaudeTemplates, configureClaude } from "./claude.js";
import { collectCursorTemplates } from "./cursor.js";
import { collectOpenCodeTemplates } from "./opencode.js";
import { collectCodexTemplates, configureCodex } from "./codex.js";
import { collectKiloTemplates } from "./kilo.js";
import { collectKiroTemplates } from "./kiro.js";
import { collectGeminiTemplates } from "./gemini.js";
import { collectAntigravityTemplates } from "./antigravity.js";
import { collectDevinTemplates } from "./devin.js";
import { collectQoderTemplates } from "./qoder.js";
import { collectCodebuddyTemplates } from "./codebuddy.js";
import { collectCopilotTemplates } from "./copilot.js";
import { collectDroidTemplates } from "./droid.js";
import { collectDshTemplates } from "./dsh.js";
import { collectPiTemplates } from "./pi.js";
import { collectReasonixTemplates } from "./reasonix.js";
import { collectZcodeTemplates, configureZcode } from "./zcode.js";
import { collectTraeTemplates } from "./trae.js";
import { collectOmpTemplates } from "./omp.js";
import { collectGrokTemplates } from "./grok.js";
import { collectKimiTemplates } from "./kimi.js";
import { collectSnowTemplates } from "./snow.js";

// Shared utilities
import {
  renderTemplateMap,
  writeTemplateMap,
  type PlatformConfigureOptions,
} from "./shared.js";

// =============================================================================
// Platform Functions Registry
// =============================================================================

interface PlatformFunctions {
  /** Configure platform during init (copy templates to project) */
  configure: (cwd: string, options?: PlatformConfigureOptions) => Promise<void>;
  /** Collect template files for update tracking. Undefined = platform skipped during update. */
  collectTemplates?: () => Map<string, string>;
}

/**
 * Registry entry for a platform whose configuration is exactly "write these
 * files": `configure` is derived from `collectTemplates`, so the file set is
 * described once and `trellis init` and `trellis update` cannot disagree
 * about it.
 *
 * The three platforms that also do something a `Map<path, content>` cannot
 * express (claude-code, codex, zcode) spell out both fields and keep that
 * behavior inline in their own configurator.
 */
function fromTemplates(
  collectTemplates: () => Map<string, string>,
): PlatformFunctions {
  return {
    configure: (cwd) => writeTemplateMap(cwd, collectTemplates()),
    collectTemplates,
  };
}

const PLATFORM_FUNCTIONS: Record<AITool, PlatformFunctions> = {
  "claude-code": {
    configure: configureClaude,
    collectTemplates: collectClaudeTemplates,
  },
  cursor: fromTemplates(collectCursorTemplates),
  opencode: fromTemplates(collectOpenCodeTemplates),
  codex: { configure: configureCodex, collectTemplates: collectCodexTemplates },
  kilo: fromTemplates(collectKiloTemplates),
  kiro: fromTemplates(collectKiroTemplates),
  gemini: fromTemplates(collectGeminiTemplates),
  antigravity: fromTemplates(collectAntigravityTemplates),
  devin: fromTemplates(collectDevinTemplates),
  qoder: fromTemplates(collectQoderTemplates),
  codebuddy: fromTemplates(collectCodebuddyTemplates),
  copilot: fromTemplates(collectCopilotTemplates),
  droid: fromTemplates(collectDroidTemplates),
  dsh: fromTemplates(collectDshTemplates),
  pi: fromTemplates(collectPiTemplates),
  reasonix: fromTemplates(collectReasonixTemplates),
  zcode: { configure: configureZcode, collectTemplates: collectZcodeTemplates },
  trae: fromTemplates(collectTraeTemplates),
  omp: fromTemplates(collectOmpTemplates),
  grok: fromTemplates(collectGrokTemplates),
  kimi: fromTemplates(collectKimiTemplates),
  snow: fromTemplates(collectSnowTemplates),
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
 * Detect platforms from Trellis-owned templates, not native config directories.
 *
 * A platform directory may predate Trellis. The template hash manifest records
 * only files Trellis actually wrote, while the platform template registry
 * supplies each platform's distinct file layout.
 */
export function getConfiguredPlatforms(cwd: string): Set<AITool> {
  const platforms = new Set<AITool>();
  const hashes = loadHashes(cwd);

  for (const id of PLATFORM_IDS) {
    const configDir = AI_TOOLS[id].configDir;
    const templates = collectPlatformTemplates(id);
    const hasTrackedTemplate = [...(templates?.keys() ?? [])].some(
      (relativePath) =>
        (relativePath === configDir ||
          relativePath.startsWith(`${configDir}/`)) &&
        hashes[relativePath] !== undefined,
    );
    if (hasTrackedTemplate) {
      platforms.add(id);
    }
  }
  // Back-compat: Windsurf was renamed to Devin. Require Trellis ownership or
  // a Trellis-namespaced workflow so a native Windsurf directory is not enough.
  const legacyWindsurfRoot = ".windsurf/workflows";
  const hasTrackedWindsurfTemplate = Object.keys(hashes).some((relativePath) =>
    relativePath.startsWith(`${legacyWindsurfRoot}/trellis-`),
  );
  let hasLegacyWindsurfTemplate = false;
  try {
    hasLegacyWindsurfTemplate = fs
      .readdirSync(path.join(cwd, legacyWindsurfRoot))
      .some((name) => name.startsWith("trellis-"));
  } catch {
    // Missing or unreadable legacy directory is not a configured platform.
  }
  if (hasTrackedWindsurfTemplate || hasLegacyWindsurfTemplate) {
    platforms.add("devin");
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
  options?: PlatformConfigureOptions,
): Promise<void> {
  return PLATFORM_FUNCTIONS[platformId].configure(cwd, options);
}

/**
 * Collect template files for a specific platform (for update tracking).
 * Returns undefined if the platform doesn't support template tracking.
 */
export function collectPlatformTemplates(
  platformId: AITool,
): Map<string, string> | undefined {
  const map = PLATFORM_FUNCTIONS[platformId].collectTemplates?.();
  return map ? renderTemplateMap(map) : map;
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
