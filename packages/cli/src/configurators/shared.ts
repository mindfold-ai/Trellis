/**
 * Shared utilities for platform configurators.
 *
 * Extracted here to avoid circular dependencies (index.ts imports configurators,
 * configurators cannot import from index.ts).
 */

import type { TemplateContext } from "../types/ai-tools.js";

/**
 * Get the Python command based on platform.
 * Windows uses 'python', macOS/Linux use 'python3'.
 */
export function getPythonCommandForPlatform(
  platform: NodeJS.Platform = process.platform,
): "python" | "python3" {
  return platform === "win32" ? "python" : "python3";
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
  let result = content.replace(RE_PYTHON_CMD, getPythonCommandForPlatform());

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

// ---------------------------------------------------------------------------
// Template wrapping utilities
// ---------------------------------------------------------------------------

/** Skill description registry — maps template name to auto-trigger description. */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  start:
    "Initializes an AI development session by reading workflow guides, developer identity, git status, active tasks, and project guidelines from .trellis/. Classifies incoming tasks and routes to brainstorm, direct edit, or task workflow. Use when beginning a new coding session, resuming work, starting a new task, or re-establishing project context.",
  continue:
    "Resume work on the current task. Loads the workflow Phase Index, figures out which phase/step to pick up at, then pulls the step-level detail via get_context.py --mode phase. Use when coming back to an in-progress task and you need to know what to do next.",
  "finish-work":
    "Wrap up the current session: verify quality gate passed, remind user to commit, archive completed tasks, and record session progress to the developer journal. Use when done coding and ready to end the session.",
  "before-dev":
    "Discovers and injects project-specific coding guidelines from .trellis/spec/ before implementation begins. Reads spec indexes, pre-development checklists, and shared thinking guides for the target package. Use when starting a new coding task, before writing any code, switching to a different package, or needing to refresh project conventions and standards.",
  brainstorm:
    "Guides collaborative requirements discovery before implementation. Creates task directory, seeds PRD, asks high-value questions one at a time, researches technical choices, and converges on MVP scope. Use when requirements are unclear, there are multiple valid approaches, or the user describes a new feature or complex task.",
  check:
    "Comprehensive quality verification: spec compliance, lint, type-check, tests, cross-layer data flow, code reuse, and consistency checks. Use when code is written and needs quality verification, before committing changes, or to catch context drift during long sessions.",
  "break-loop":
    "Deep bug analysis to break the fix-forget-repeat cycle. Analyzes root cause category, why fixes failed, prevention mechanisms, and captures knowledge into specs. Use after fixing a bug to prevent the same class of bugs.",
  "update-spec":
    "Captures executable contracts and coding conventions into .trellis/spec/ documents. Use when learning something valuable from debugging, implementing, or discussion that should be preserved for future sessions.",
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
  const baseName = name.replace(/^trellis-/, "");
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
  start: "Initialize a Trellis development session.",
  continue: "Resume work on the current task at the correct phase.",
  "finish-work":
    "Wrap up the current session: quality gate, commit reminder, archive, journal.",
};

/** Wrap resolved command content with YAML frontmatter (name + description). */
export function wrapWithCommandFrontmatter(
  name: string,
  content: string,
): string {
  const baseName = name.replace(/^trellis-/, "");
  const description = COMMAND_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing command description for "${baseName}". Add it to COMMAND_DESCRIPTIONS in shared.ts.`,
    );
  }
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`;
}

// ---------------------------------------------------------------------------
// Shared configurator helpers
// ---------------------------------------------------------------------------

import path from "node:path";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  type CommonTemplate,
  getBundledSkillTemplates,
  getCommandTemplates,
  getSkillTemplates,
} from "../templates/common/index.js";

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
 * `start.md` is only emitted for agent-less platforms (kilo, antigravity,
 * windsurf). On agent-capable platforms, the session-start hook / plugin
 * already injects the workflow overview, so a user-facing `start` command
 * would be redundant.
 */
function filterCommands(
  templates: CommonTemplate[],
  ctx: TemplateContext,
): CommonTemplate[] {
  if (ctx.agentCapable) {
    return templates.filter((t) => t.name !== "start");
  }
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
    name: `trellis-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `trellis-${tmpl.name}`,
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
 * Resolve only the 5 skill templates with trellis- prefix + SKILL.md frontmatter.
 * Used by "both" platforms for the auto-triggered skills.
 */
export function resolveSkills(ctx: TemplateContext): ResolvedTemplate[] {
  return getSkillTemplates().map((tmpl) => ({
    name: `trellis-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `trellis-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
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
// Shared configurator write helpers
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

/** Write skill directories from resolved templates and bundled skill files. */
export async function writeSkills(
  skillsRoot: string,
  skills: { name: string; content: string }[],
  bundledSkills: readonly ResolvedSkillFile[] = [],
): Promise<void> {
  ensureDir(skillsRoot);
  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(path.join(skillDir, "SKILL.md"), skill.content);
  }
  for (const skillFile of bundledSkills) {
    const targetPath = path.join(skillsRoot, skillFile.relativePath);
    ensureDir(path.dirname(targetPath));
    await writeFile(targetPath, skillFile.content);
  }
}

/** Write agent/droid definition files */
export async function writeAgents(
  agentsDir: string,
  agents: { name: string; content: string }[],
  ext = ".md",
): Promise<void> {
  ensureDir(agentsDir);
  for (const agent of agents) {
    await writeFile(path.join(agentsDir, `${agent.name}${ext}`), agent.content);
  }
}

/** Write the shared hook scripts that `platform` actually registers. */
export async function writeSharedHooks(
  hooksDir: string,
  platform: import("../templates/shared-hooks/index.js").SharedHookPlatform,
): Promise<void> {
  const { getSharedHookScriptsForPlatform } =
    await import("../templates/shared-hooks/index.js");
  ensureDir(hooksDir);
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    await writeFile(path.join(hooksDir, hook.name), hook.content);
  }
}

// ---------------------------------------------------------------------------
// Pull-based sub-agent prelude (for class-2 platforms whose hook can't
// inject sub-agent prompts: gemini, qoder, codex, copilot)
//
// Only implement & check need task-level context (prd + jsonl specs).
// research is orthogonal: it searches the spec tree and doesn't depend on an
// active task. Hook-based platforms mirror this (their `get_research_context`
// injects a spec-tree overview, not prd/jsonl). We leave research untouched.
// ---------------------------------------------------------------------------

export type SubAgentType = "implement" | "check";

/** Build the standard "load Trellis context first" prelude block. */
export function buildPullBasedPrelude(agentType: SubAgentType): string {
  // JSONL filenames stay as implement.jsonl / check.jsonl — they are internal
  // context buckets keyed by role (not by platform-visible agent name).
  const jsonl = agentType === "check" ? "check.jsonl" : "implement.jsonl";
  const prdGate =
    agentType === "implement"
      ? "2. Read the task's `task.json` and verify `meta.prd_status` is `confirmed` or `override`. If it is `draft` or missing, stop immediately, explain that PRD confirmation is required, and do NOT edit code.\n3. Read the task's `prd.md` (requirements) and `info.md` if it exists (technical design).\n4. Read `<task-path>/implement.jsonl` — JSONL list of dev spec files relevant to this agent.\n5. For each entry in the JSONL, Read its `file` path — these are the dev specs you must follow."
      : "2. Read the task's `prd.md` (requirements) and `info.md` if it exists (technical design).\n3. Read `<task-path>/check.jsonl` — JSONL list of dev spec files relevant to this agent.\n4. For each entry in the JSONL, Read its `file` path — these are the dev specs you must follow.";

  return `## Required: Load Trellis Context First

This platform does NOT auto-inject task context via hook. Before doing anything else, you MUST load context yourself:

1. Run \`python3 ./.trellis/scripts/task.py current --source\` to find the active task path and source (e.g. \`Current task: .trellis/tasks/04-17-foo\`).
${prdGate}
   **Skip rows without a \`"file"\` field** (e.g. \`{"_example": "..."}\` seed rows left over from \`task.py create\` before the curator ran).

If \`${jsonl}\` has no curated entries (only a seed row, or the file is missing), fall back to: read \`prd.md\`, list available specs with \`python3 ./.trellis/scripts/get_context.py --mode packages\`, and pick the specs that match the task domain yourself. Do NOT block on the missing jsonl — proceed with prd-only context plus your spec judgment.

If there is no active task or the task has no \`prd.md\`, ask the user what to work on; do NOT proceed without context.

---

`;
}

/** Insert prelude into a markdown agent definition (after YAML frontmatter). */
export function injectPullBasedPreludeMarkdown(
  content: string,
  agentType: SubAgentType,
): string {
  const prelude = buildPullBasedPrelude(agentType);
  const sections = splitMarkdownFrontmatter(content);

  if (!sections) {
    return prelude + content;
  }

  const head = `---\n${sections.frontmatter}\n---`;
  const tailTrimmed = sections.body.replace(/^(\r?\n)+/, "");
  return `${head}\n\n${prelude}${tailTrimmed}`;
}

/** Insert prelude into a TOML agent (codex `developer_instructions`). */
export function injectPullBasedPreludeToml(
  content: string,
  agentType: SubAgentType,
): string {
  const prelude = buildPullBasedPrelude(agentType);
  // Match: developer_instructions = """  followed by newline
  const re = /(developer_instructions\s*=\s*""")(\r?\n)/;
  if (!re.test(content)) {
    return content;
  }
  return content.replace(re, `$1$2${prelude}`);
}

/** Best-effort detect agent type from filename ("trellis-implement.md" → "implement").
 *  Returns null for research and unknown names — they skip the prelude.
 */
export function detectSubAgentType(name: string): SubAgentType | null {
  const base = name.replace(/\.(md|toml|prompt\.md)$/, "");
  if (base === "trellis-implement" || base === "trellis-check") {
    return base === "trellis-implement" ? "implement" : "check";
  }
  return null;
}

/** Shared transform: given a list of agents, prepend pull-based prelude to
 *  implement/check definitions. Used by both configurator (init-time write)
 *  and collectPlatformTemplates (update-time hash comparison) so the two
 *  code paths always agree on what's on disk.
 */
export interface AgentContent {
  name: string;
  content: string;
}

interface MarkdownFrontmatterSections {
  body: string;
  frontmatter: string;
}

function splitMarkdownFrontmatter(
  content: string,
): MarkdownFrontmatterSections | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
  };
}

export function applyPullBasedPreludeMarkdown(
  agents: readonly AgentContent[],
): AgentContent[] {
  return agents.map((a) => {
    const t = detectSubAgentType(a.name);
    if (!t) return { ...a };
    return {
      ...a,
      content: injectPullBasedPreludeMarkdown(a.content, t),
    };
  });
}

function mapLegacyToolToCopilot(tool: string): string[] {
  switch (tool) {
    case "Read":
      return ["read"];
    case "Write":
    case "Edit":
      return ["edit"];
    case "Glob":
    case "Grep":
      return ["search"];
    case "Bash":
      return ["execute"];
    case "mcp__exa__web_search_exa":
    case "mcp__exa__get_code_context_exa":
      return ["web", "exa/*"];
    case "mcp__chrome-devtools__*":
      return ["chrome-devtools/*"];
    case "Skill":
      return [];
    default:
      return [];
  }
}

function normalizeCopilotMarkdownAgentFrontmatter(content: string): string {
  const sections = splitMarkdownFrontmatter(content);
  if (!sections) {
    return content;
  }

  const frontmatter = sections.frontmatter.split(/\r?\n/);
  const body = sections.body;
  const normalized: string[] = [];

  for (const line of frontmatter) {
    if (!line.startsWith("tools:")) {
      normalized.push(line);
      continue;
    }

    const legacyTools = line
      .slice("tools:".length)
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const tools = [...new Set(legacyTools.flatMap(mapLegacyToolToCopilot))];

    normalized.push("tools:");
    for (const tool of tools) {
      normalized.push(`  - ${tool}`);
    }
  }

  return `---\n${normalized.join("\n")}\n---\n${body}`;
}

export function normalizeCopilotMarkdownAgents(
  agents: readonly AgentContent[],
): AgentContent[] {
  return agents.map((agent) => ({
    ...agent,
    content: normalizeCopilotMarkdownAgentFrontmatter(agent.content),
  }));
}

export function applyPullBasedPreludeToml(
  agents: readonly AgentContent[],
): AgentContent[] {
  return agents.map((a) => {
    const t = detectSubAgentType(a.name);
    if (!t) return { ...a };
    return {
      ...a,
      content: injectPullBasedPreludeToml(a.content, t),
    };
  });
}
