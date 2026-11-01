/**
 * Shared utilities for platform configurators.
 *
 * Extracted here to avoid circular dependencies (index.ts imports configurators,
 * configurators cannot import from index.ts).
 */

import type { TemplateContext } from "../types/ai-tools.js";

/**
 * Per-platform configure options threaded from `trellis init` flags.
 * Defined here (not in index.ts) so configurators can reference it without
 * a circular import.
 */
export type PlatformConfigureOptions = Record<string, never>;

/**
 * Module-level resolved Python command, set by the init flow after probing.
 *
 * Windows commonly has Python under one of: `python`, `python3`, `py -3` —
 * which one works varies by installer (python.org / Microsoft Store / py
 * launcher). `init.ts` detects which is available, then calls
 * `setResolvedPythonCommand` so all subsequent template / configurator writes
 * use the resolved value instead of the platform default.
 *
 * If unset (e.g. unit tests bypass init), `getPythonCommandForPlatform` falls
 * back to the static platform default (`python` on Windows, `python3`
 * elsewhere) — preserving legacy behavior.
 */
let resolvedPythonCommand: string | null = null;

export function setResolvedPythonCommand(cmd: string): void {
  const trimmed = cmd.trim();
  resolvedPythonCommand = trimmed || null;
}

/** Test helper — clear the resolved cache between unit tests. */
export function resetResolvedPythonCommand(): void {
  resolvedPythonCommand = null;
}

/**
 * Get the Python command for the host platform.
 *
 * Returns the resolved command if `setResolvedPythonCommand` has been called;
 * otherwise the static platform default — Windows: `python`, others:
 * `python3`. Pass an explicit `platform` arg only for unit tests (it bypasses
 * the resolved cache).
 */
export function getPythonCommandForPlatform(
  platform?: NodeJS.Platform,
): string {
  if (platform === undefined && resolvedPythonCommand) {
    return resolvedPythonCommand;
  }
  const target = platform ?? process.platform;
  return target === "win32" ? "python" : "python3";
}

/**
 * Replace literal `python3` with the resolved Python command, excluding
 * shebang lines.
 *
 * Applied at init/update write time so that all file types (including .py,
 * .md, .toml, .json) get the correct command for the host platform without
 * template-level changes.
 *
 * No-op when the resolved command is `python3` (the template default).
 * Idempotent: running it twice produces the same result.
 */
export function replacePythonCommandLiterals(content: string): string {
  const target = getPythonCommandForPlatform();
  if (target === "python3") return content;
  return content
    .split("\n")
    .map((line) =>
      line.startsWith("#!") ? line : line.replaceAll("python3", target),
    )
    .join("\n");
}

/**
 * Resolve platform-specific placeholders in template content.
 *
 * When called without a context, only resolves {{PYTHON_CMD}} (legacy behavior
 * for settings.json, hooks.json, etc.).
 *
 * When called with a TemplateContext, additionally resolves:
 * - {{CMD_REF:name}}         → platform-specific command reference
 * - {{EXECUTOR_AI}}          → AI executor description
 * - {{USER_ACTION_LABEL}}    → user action label
 * - {{CLI_FLAG}}             → platform cli flag (e.g. "claude", "codex")
 * - {{#FLAG}}...{{/FLAG}}    → conditional include (when FLAG is true)
 * - {{^FLAG}}...{{/FLAG}}    → negated conditional (when FLAG is false)
 *
 * Supported conditional flags: AGENT_CAPABLE, HAS_HOOKS
 */
// Pre-compiled regexes for placeholder resolution
const RE_PYTHON_CMD = /\{\{PYTHON_CMD\}\}/g;
const RE_CMD_REF = /\{\{CMD_REF:([\w][\w-]*)\}\}/g;
const RE_EXECUTOR_AI = /\{\{EXECUTOR_AI\}\}/g;
const RE_USER_ACTION_LABEL = /\{\{USER_ACTION_LABEL\}\}/g;
const RE_CLI_FLAG = /\{\{CLI_FLAG\}\}/g;
const RE_BLANK_LINES = /\n{3,}/g;

const CONDITIONAL_FLAGS = ["AGENT_CAPABLE", "HAS_HOOKS"] as const;
const CONDITIONAL_REGEXES = Object.fromEntries(
  CONDITIONAL_FLAGS.map((flag) => [
    flag,
    {
      pos: new RegExp(
        `\\{\\{#${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`,
        "g",
      ),
      neg: new RegExp(
        `\\{\\{\\^${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`,
        "g",
      ),
    },
  ]),
) as Record<(typeof CONDITIONAL_FLAGS)[number], { pos: RegExp; neg: RegExp }>;

export function resolvePlaceholders(
  content: string,
  context?: TemplateContext,
): string {
  let result = replacePythonCommandLiterals(
    content.replace(RE_PYTHON_CMD, getPythonCommandForPlatform()),
  );

  if (!context) return result;

  // Simple substitutions
  result = result.replace(
    RE_CMD_REF,
    (_match, name: string) => `${context.cmdRefPrefix}${name}`,
  );
  result = result.replace(RE_EXECUTOR_AI, context.executorAI);
  result = result.replace(RE_USER_ACTION_LABEL, context.userActionLabel);
  result = result.replace(RE_CLI_FLAG, context.cliFlag);

  // Conditional blocks
  const flagValues: Record<(typeof CONDITIONAL_FLAGS)[number], boolean> = {
    AGENT_CAPABLE: context.agentCapable,
    HAS_HOOKS: context.hasHooks,
  };

  for (const flag of CONDITIONAL_FLAGS) {
    const value = flagValues[flag];
    const { pos, neg } = CONDITIONAL_REGEXES[flag];
    // Reset lastIndex for global regexes reused across calls
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    result = result.replace(pos, value ? "$1" : "");
    result = result.replace(neg, value ? "" : "$1");
  }

  // Clean up blank lines left by removed conditional blocks
  result = result.replace(RE_BLANK_LINES, "\n\n");

  return result;
}

/**
 * Resolve placeholders for files written under `.agents/skills/` (the shared
 * Agent Skills directory consumed by multiple platforms via the upstream
 * `.agents/skills/` workspace alias — Codex, Gemini CLI 0.40+, etc.).
 *
 * Identical to {@link resolvePlaceholders} except that {@link CMD_REF} is
 * rendered in a platform-neutral form (`` `name` (Trellis command) ``)
 * instead of substituting a platform-specific prefix. This is the only
 * placeholder that varies between platforms in the auto-triggered skill templates
 * from `common/skills/`, so
 * neutralizing it makes the rendered SKILL.md files byte-identical regardless
 * of which Trellis configurator wrote them — eliminating the
 * "last-writer-wins" collision when both Codex and Gemini target
 * `.agents/skills/`.
 *
 * `{{CLI_FLAG}}`, `{{EXECUTOR_AI}}`, `{{USER_ACTION_LABEL}}`, conditionals,
 * and `{{PYTHON_CMD}}` are still resolved from the platform context. The
 * shared skills do not use those placeholders, so they remain platform-
 * neutral. Codex-only skill files (e.g. `trellis-continue/SKILL.md`,
 * `trellis-finish-work/SKILL.md` written via `resolveAllAsSkillsNeutral`) DO
 * use `{{CLI_FLAG}}` / `{{PYTHON_CMD}}` and resolve to Codex-correct values
 * — no other platform writes those files, so byte-identity is not required.
 */
export function resolvePlaceholdersNeutral(
  content: string,
  context?: TemplateContext,
): string {
  let result = replacePythonCommandLiterals(
    content.replace(RE_PYTHON_CMD, getPythonCommandForPlatform()),
  );

  if (!context) return result;

  // Neutral form for the only collision-causing placeholder
  result = result.replace(
    RE_CMD_REF,
    (_match, name: string) => `\`${name}\` (Trellis command)`,
  );
  result = result.replace(RE_EXECUTOR_AI, context.executorAI);
  result = result.replace(RE_USER_ACTION_LABEL, context.userActionLabel);
  result = result.replace(RE_CLI_FLAG, context.cliFlag);

  // Conditional blocks (resolved per platform — none of the auto-triggered
  // shared skills use conditionals, but Codex-only command-as-skill files might in future).
  const flagValues: Record<(typeof CONDITIONAL_FLAGS)[number], boolean> = {
    AGENT_CAPABLE: context.agentCapable,
    HAS_HOOKS: context.hasHooks,
  };

  for (const flag of CONDITIONAL_FLAGS) {
    const value = flagValues[flag];
    const { pos, neg } = CONDITIONAL_REGEXES[flag];
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    result = result.replace(pos, value ? "$1" : "");
    result = result.replace(neg, value ? "" : "$1");
  }

  result = result.replace(RE_BLANK_LINES, "\n\n");

  return result;
}

// ---------------------------------------------------------------------------
// Template wrapping utilities
// ---------------------------------------------------------------------------

/** Skill description registry — maps template name to auto-trigger description. */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  remember:
    "Save confirmed decisions, rejected approaches worth not retrying, and reusable findings. Update an existing README, docs page, or spec instead of copying it, and link that file from the journal. Use when asked to remember, to update the project description from current code, when a decision is confirmed, or for a useful session/compact handoff.",
  "update-spec":
    "Captures durable contracts into .trellis/spec/ as short markdown, or updates the README or docs section that already states them. Use when a boundary should still hold next session, or when asked to refresh the project description from current code without turning plans into implemented features.",
};

/**
 * Wrap resolved template content with YAML frontmatter for skill format.
 * Used by platforms that use SKILL.md (Codex, Kiro, Qoder, etc.).
 */
export function wrapWithSkillFrontmatter(
  name: string,
  content: string,
): string {
  // Look up description by base name (without trellis- prefix)
  const baseName = name.replace(/^mini-trellis-/, "").replace(/^trellis-/, "");
  const description = SKILL_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing skill description for "${baseName}". Add it to SKILL_DESCRIPTIONS in shared.ts.`,
    );
  }
  return `---\nname: ${name}\ndescription: "${description}"\n---\n\n${content}`;
}

/**
 * One-line blurbs shown in a `/` command palette — kept separate from
 * SKILL_DESCRIPTIONS, which is long prose aimed at the skill matcher.
 */
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  remember:
    "Update the existing project description or topic, keep plans out of implemented capabilities, and record a linked journal entry.",
};

/** Wrap resolved command content with YAML frontmatter (name + description). */
export function wrapWithCommandFrontmatter(
  name: string,
  content: string,
): string {
  const baseName = name.replace(/^mini-trellis-/, "").replace(/^trellis-/, "");
  const description = COMMAND_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing command description for "${baseName}". Add it to COMMAND_DESCRIPTIONS in shared.ts.`,
    );
  }
  // JSON.stringify produces a double-quoted YAML scalar, which is safe even
  // when the description contains a colon (an unquoted plain scalar cannot
  // contain ": " — some parsers reject it outright, e.g. Trae CLI's SlashCommand
  // schema; others silently truncate at the second colon).
  return `---\nname: ${name}\ndescription: ${JSON.stringify(
    description,
  )}\n---\n\n${content}`;
}

// ---------------------------------------------------------------------------
// Shared configurator helpers
// ---------------------------------------------------------------------------

import path from "node:path";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { mergeJsonFile } from "../utils/managed-merge.js";
import {
  type CommonTemplate,
  getBundledSkillTemplates,
  getCommandTemplates,
  getSkillTemplates,
} from "../templates/common/index.js";
import {
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../templates/shared-hooks/index.js";

/** A resolved template ready to be written to disk. */
export interface ResolvedTemplate {
  name: string;
  content: string;
}

/** A resolved file inside a multi-file skill directory. */
export interface ResolvedSkillFile {
  /** POSIX path relative to the skills root, e.g. "trellis-meta/SKILL.md" */
  relativePath: string;
  content: string;
}

/**
 * Filter command templates based on platform capabilities.
 *
 * `start.md` is stripped only on platforms that are BOTH `agentCapable` AND
 * `hasHooks` — those platforms (Claude Code, Cursor, Kiro, Gemini, Qoder,
 * CodeBuddy, Copilot, Droid, Pi) have a SessionStart-style hook that
 * auto-injects the workflow overview, so a user-facing `start` would be
 * redundant.
 *
 * `agentCapable && !hasHooks` platforms (Codex, ZCode, OpenCode, Reasonix, Grok)
 * have no such hook (or use an out-of-band plugin), so they need the
 * user-invocable `trellis-start` skill / `start.md` command as fallback.
 * Snow is class-1 (`hasHooks: true`) with auto inject + project agents.
 * Agent-less platforms (Kilo, Antigravity, Devin) also keep `start` since
 * they rely entirely on user-triggered workflows.
 */
function filterCommands(
  templates: CommonTemplate[],
  _ctx: TemplateContext,
): CommonTemplate[] {
  return templates;
}

/**
 * Resolve ALL templates as skills with trellis- prefix.
 * Used by skill-only platforms (Kiro, Qoder, Codex) where everything is a skill.
 *
 * `start` is filtered out on agent-capable platforms — the session-start hook
 * injects the workflow overview instead.
 */
export function resolveAllAsSkills(ctx: TemplateContext): ResolvedTemplate[] {
  const templates = [
    ...filterCommands(getCommandTemplates(), ctx),
    ...getSkillTemplates(),
  ];
  return templates.map((tmpl) => ({
    name: `mini-trellis-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `mini-trellis-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
    ),
  }));
}

/**
 * Resolve command templates as plain commands (no wrapping).
 * Used by "both" platforms for the user-ritual commands.
 *
 * `start` is filtered out on agent-capable platforms.
 */
export function resolveCommands(ctx: TemplateContext): ResolvedTemplate[] {
  return filterCommands(getCommandTemplates(), ctx).map((tmpl) => ({
    name: tmpl.name,
    content: resolvePlaceholders(tmpl.content, ctx),
  }));
}

/**
 * Resolve the auto-triggered skill templates from `common/skills/` with trellis- prefix + SKILL.md frontmatter.
 * Used by "both" platforms for the auto-triggered skills.
 */
export function resolveSkills(ctx: TemplateContext): ResolvedTemplate[] {
  return getSkillTemplates().map((tmpl) => ({
    name: `mini-trellis-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `mini-trellis-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
    ),
  }));
}

/**
 * Same as {@link resolveSkills} but uses {@link resolvePlaceholdersNeutral}
 * so the rendered SKILL.md files are byte-identical across any two platforms
 * that target `.agents/skills/`. Use this for shared `.agents/skills/`
 * writes (Gemini); platform-private skill roots should keep
 * {@link resolveSkills}.
 */
export function resolveSkillsNeutral(ctx: TemplateContext): ResolvedTemplate[] {
  return getSkillTemplates().map((tmpl) => ({
    name: `mini-trellis-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `mini-trellis-${tmpl.name}`,
      resolvePlaceholdersNeutral(tmpl.content, ctx),
    ),
  }));
}

/**
 * Same as {@link resolveAllAsSkills} but uses
 * {@link resolvePlaceholdersNeutral} for the shared common skills. The 2 command
 * templates (continue, finish-work) folded into the skill set still resolve
 * `{{CLI_FLAG}}` / `{{PYTHON_CMD}}` per platform — only Codex writes those
 * files into `.agents/skills/`, so byte-identity isn't required there.
 */
export function resolveAllAsSkillsNeutral(
  ctx: TemplateContext,
): ResolvedTemplate[] {
  const templates = [
    ...filterCommands(getCommandTemplates(), ctx),
    ...getSkillTemplates(),
  ];
  return templates.map((tmpl) => ({
    name: `mini-trellis-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `mini-trellis-${tmpl.name}`,
      resolvePlaceholdersNeutral(tmpl.content, ctx),
    ),
  }));
}

/**
 * Resolve multi-file built-in skills.
 *
 * Unlike workflow skills, bundled skills already contain their own SKILL.md
 * frontmatter and may include references/assets. They are still rendered
 * through placeholder resolution so init and update get byte-identical output.
 */
export function resolveBundledSkills(
  ctx: TemplateContext,
): ResolvedSkillFile[] {
  return getBundledSkillTemplates().flatMap((skill) =>
    skill.files.map((file) => ({
      relativePath: `${skill.name}/${file.relativePath}`,
      content: resolvePlaceholders(file.content, ctx),
    })),
  );
}

// ---------------------------------------------------------------------------
// Shared collectors
// ---------------------------------------------------------------------------

/** Collect skill files under a target root for update hash tracking. */
export function collectSkillTemplates(
  skillsRoot: string,
  skills: readonly { name: string; content: string }[],
  bundledSkills: readonly ResolvedSkillFile[] = [],
): Map<string, string> {
  const files = new Map<string, string>();
  for (const skill of skills) {
    files.set(`${skillsRoot}/${skill.name}/SKILL.md`, skill.content);
  }
  for (const skillFile of bundledSkills) {
    files.set(`${skillsRoot}/${skillFile.relativePath}`, skillFile.content);
  }
  return files;
}

// ---------------------------------------------------------------------------
// Template maps — a platform's file set, described once
//
// `collect<Platform>Templates()` returns `Map<relPath, content>`: the single
// description of what a platform installs. `trellis update` diffs that map and
// `configure` writes it through `writeTemplateMap`. Nothing else enumerates a
// platform's files — two descriptions that disagree is how `trellis update`
// silently stops managing a file (manifests/0.5.7.json).
// ---------------------------------------------------------------------------

/** Apply the python3 → python rewrite to every entry of a template map. */
export function renderTemplateMap(
  files: Map<string, string>,
): Map<string, string> {
  const rendered = new Map<string, string>();
  for (const [relPath, content] of files) {
    rendered.set(relPath, replacePythonCommandLiterals(content));
  }
  return rendered;
}

/**
 * Write a collected template map into `cwd`.
 *
 * Renders through {@link renderTemplateMap} first — the same rewrite
 * `collectPlatformTemplates` applies on the update path — so a file's
 * init-time bytes and its update-time expected bytes cannot drift.
 */
export async function writeTemplateMap(
  cwd: string,
  files: Map<string, string>,
): Promise<void> {
  const mergeJsonPaths = new Set([
    ".claude/settings.json",
    ".codex/hooks.json",
    ".cursor/hooks.json",
    ".pi/settings.json",
  ]);
  for (const [relPath, content] of renderTemplateMap(files)) {
    const absPath = path.join(cwd, ...relPath.split("/"));
    ensureDir(path.dirname(absPath));
    if (mergeJsonPaths.has(relPath)) {
      const result = mergeJsonFile(absPath, content);
      if (result === "invalid") {
        console.warn(`  ⚠ Skipped ${relPath}: existing file is not valid JSON`);
      }
      continue;
    }
    await writeFile(absPath, content);
  }
}

/**
 * Collect the shared hook scripts that `platform` actually registers, keyed
 * under `hooksPath`. Driven by SHARED_HOOKS_BY_PLATFORM so a platform's hook
 * set is never restated per configurator.
 */
export function collectSharedHooks(
  hooksPath: string,
  platform: SharedHookPlatform,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    files.set(`${hooksPath}/${hook.name}`, hook.content);
  }
  return files;
}
