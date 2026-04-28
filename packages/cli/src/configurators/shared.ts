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
    "初始化 AI 开发会话：读取 .trellis/ 下的工作流指南、开发者身份、git 状态、活跃任务与项目规范，并对输入任务进行分流（brainstorm / 直接处理 / 任务工作流）。适用于开启新会话、恢复工作、启动新任务或重建项目上下文。",
  continue:
    "恢复当前任务：加载工作流阶段索引，判断应从哪个阶段/步骤继续，再通过 get_context.py --mode phase 拉取步骤细节。适用于回到进行中的任务且需要明确下一步时。",
  "finish-work":
    "收尾当前会话：确认质量门禁通过，提醒用户提交，归档已完成任务，并把本次进展写入开发者日志。适用于编码完成准备结束会话时。",
  "before-dev":
    "在实现前发现并注入 .trellis/spec/ 中与项目相关的编码规范。会读取目标包的 spec 索引、开发前检查清单与共享思维指南。适用于开始新编码任务、写代码前、切换包或需要刷新项目规范时。",
  brainstorm:
    "在实现前引导协作式需求澄清：创建任务目录、初始化 PRD、一次一个高价值问题、调研技术方案并收敛到 MVP 范围。适用于需求不清、方案多解，或用户提出新功能/复杂任务时。",
  check:
    "综合质量验证：规范合规、lint、type-check、tests、跨层数据流、代码复用与一致性检查。适用于代码完成后质检、提交前检查，或长会话中防止上下文漂移。",
  "break-loop":
    "进行深度缺陷分析，打破“修完就忘、反复重犯”循环。分析根因类别、修复失败原因、预防机制，并将经验沉淀到 specs。适用于 bug 修复后防止同类问题再次发生。",
  "update-spec":
    "将可执行契约与编码约定沉淀到 .trellis/spec/ 文档。适用于在调试、实现或讨论中获得了值得保留的经验时。",
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
  start: "初始化 Trellis 开发会话。",
  continue: "在正确阶段恢复当前任务。",
  "finish-work": "收尾当前会话：质量门禁、提交提醒、归档与日志。",
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
  getCommandTemplates,
  getSkillTemplates,
} from "../templates/common/index.js";

/** A resolved template ready to be written to disk. */
export interface ResolvedTemplate {
  name: string;
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

// ---------------------------------------------------------------------------
// Shared configurator write helpers
// ---------------------------------------------------------------------------

/** Write skill directories from resolved templates */
export async function writeSkills(
  skillsRoot: string,
  skills: { name: string; content: string }[],
): Promise<void> {
  ensureDir(skillsRoot);
  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(path.join(skillDir, "SKILL.md"), skill.content);
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

  return `## Required: Load Trellis Context First

This platform does NOT auto-inject task context via hook. Before doing anything else, you MUST load context yourself:

1. Run \`python3 ./.trellis/scripts/task.py current --source\` to find the active task path and source (e.g. \`Current task: .trellis/tasks/04-17-foo\`).
2. Read the task's \`prd.md\` (requirements) and \`info.md\` if it exists (technical design).
3. Read \`<task-path>/${jsonl}\` — JSONL list of dev spec files relevant to this agent.
4. For each entry in the JSONL, Read its \`file\` path — these are the dev specs you must follow.
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
  const lines = content.split("\n");

  if (lines[0] !== "---") {
    return prelude + content;
  }
  // Find closing frontmatter
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return prelude + content;
  }
  const head = lines.slice(0, close + 1).join("\n");
  const tail = lines.slice(close + 1).join("\n");
  // Skip leading blank lines in tail to keep things tidy
  const tailTrimmed = tail.replace(/^\n+/, "");
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
