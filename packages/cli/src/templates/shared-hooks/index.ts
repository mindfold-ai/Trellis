/**
 * Shared hook templates — platform-independent Python hook scripts.
 *
 * These scripts read only from .trellis/ paths (JSONL, prd.md, spec/) and
 * have no platform-specific placeholders. They can be written as-is to any
 * platform's hooks directory.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export interface HookScript {
  /** Filename (e.g., "session-start.py") */
  name: string;
  /** Script content — no placeholders, ready to write directly */
  content: string;
}

export type SharedHookName =
  | "session-start.py"
  | "inject-shell-session-context.py"
  | "inject-workflow-state.py"
  | "inject-subagent-context.py";

export type SharedHookPlatform =
  | "claude"
  | "cursor"
  | "codex"
  | "gemini"
  | "qoder"
  | "copilot"
  | "codebuddy"
  | "droid"
  | "kiro"
  | "trae"
  | "zcode";

/**
 * Which shared hooks each platform actually invokes. Single source of truth
 * for shared-hook distribution — both `writeSharedHooks` (runtime install)
 * and `collectSharedHooks` (`trellis update` diff) read from this table.
 *
 * Routing rules encoded here:
 * - `session-start.py` — shipped by every platform with a SessionStart
 *   hook event *except* codex + copilot, which bundle a platform-specific
 *   session-start.py under their own template dirs.
 * - `inject-workflow-state.py` — every platform with a UserPromptSubmit
 *   (or equivalent) event. Kiro + codex self-included; platforms without
 *   per-turn main-session hooks are excluded.
 * - `inject-subagent-context.py` — platforms with native sub-agent context
 *   delivery. Most use a PreToolUse prompt mutation; Codex uses its
 *   SubagentStart `additionalContext` event. Class-2 (pull-based) platforms
 *   such as copilot, gemini, qoder, and trae still load context from a
 *   self-loading agent profile.
 * - Kiro supports per-turn + spawn hooks on both surfaces (per the official
 *   docs https://kiro.dev/docs/cli/hooks/): the CLI custom agent declares
 *   `hooks.userPromptSubmit` + `hooks.agentSpawn`, and the IDE declares a
 *   `.kiro.hook` with `when.type=promptSubmit`. So Kiro ships
 *   `session-start.py` (agentSpawn overview), `inject-workflow-state.py`
 *   (per-turn breadcrumb), and `inject-subagent-context.py` (sub-agent
 *   spawn). The scripts emit a plain-text Kiro branch — Kiro adds a hook's
 *   stdout directly to the conversation context (no JSON envelope).
 * - Claude Code `statusLine` is intentionally not installed by default.
 *   Users can add their own statusLine command in `.claude/settings.json`,
 *   or opt in to the Trellis one via `trellis init --with-statusline`
 *   (installed from `templates/claude/hooks/`, not from this table — no
 *   other platform has a statusLine event).
 * - ZCode (3.x) ships a workspace hook config at `.zcode/config.json` covering
 *   SessionStart + UserPromptSubmit in the main session, plus PreToolUse for
 *   `Agent|Task`. Live probing confirmed `hookSpecificOutput.updatedInput`
 *   reaches the sub-agent prompt, so ZCode is class-1 and ships
 *   `inject-subagent-context.py`.
 */
export const SHARED_HOOKS_BY_PLATFORM: Record<
  SharedHookPlatform,
  readonly SharedHookName[]
> = {
  claude: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  cursor: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-subagent-context.py",
  ],
  codex: ["inject-workflow-state.py", "inject-subagent-context.py"],
  gemini: ["session-start.py", "inject-workflow-state.py"],
  qoder: ["session-start.py", "inject-workflow-state.py"],
  copilot: ["inject-workflow-state.py"],
  codebuddy: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  droid: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  kiro: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  trae: ["session-start.py", "inject-workflow-state.py"],
  zcode: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
};

/**
 * Get all shared hook scripts. Content is platform-independent and can be
 * written directly without placeholder resolution.
 */
export function getSharedHookScripts(): HookScript[] {
  const scripts: HookScript[] = [];
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith(".py"))
    .sort();

  for (const file of files) {
    scripts.push({ name: file, content: readTemplate(file) });
  }

  return scripts;
}

/**
 * Get the shared hook scripts that a given platform actually registers.
 * Drives both `writeSharedHooks` and `collectSharedHooks` so distribution
 * never drifts from the per-platform capability declared above.
 */
export function getSharedHookScriptsForPlatform(
  platform: SharedHookPlatform,
): HookScript[] {
  const allowed = new Set<string>(SHARED_HOOKS_BY_PLATFORM[platform]);
  return getSharedHookScripts().filter((h) => allowed.has(h.name));
}
