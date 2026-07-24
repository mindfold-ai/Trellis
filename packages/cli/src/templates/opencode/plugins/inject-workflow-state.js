/* global process, console */
/**
 * Trellis Workflow State Injection Plugin
 *
 * Per-turn UserPromptSubmit equivalent for OpenCode.
 *
 * On every chat.message, if a Trellis task is active, inject a short
 * <workflow-state> breadcrumb reminding the main AI what task is
 * active and its expected flow. Breadcrumb text is pulled exclusively
 * from the project's workflow.md [workflow-state:STATUS] tag blocks —
 * workflow.md is the single source of truth. When the active task's
 * task.json selects a workflow variant ("workflow": "<id>"), the tag
 * blocks are read from .trellis/workflows/<id>.md instead (missing
 * variant file → one stderr warning + fallback to workflow.md; see
 * resolveWorkflowMd). There are no fallback
 * tables in this plugin: when workflow.md is missing or a tag is
 * absent, the breadcrumb degrades to a generic
 * "Refer to workflow.md for current step." line so users see (and fix)
 * the broken state instead of the plugin silently masking it.
 *
 * Unlike session-start, this plugin does NOT dedupe — the breadcrumb
 * should surface on every turn so long conversations don't drift.
 *
 * Silently skips when:
 *   - No .trellis/ directory
 *   - No active task in the session runtime context
 *   - task.json malformed or missing status
 */

import { existsSync, readFileSync, statSync } from "fs"
import { join } from "path"
import { TrellisContext, debugLog, isTrellisSubagent } from "../lib/trellis-context.js"

// Supports STATUS values with letters, digits, underscores, hyphens
// (so "in-review" / "blocked-by-team" work alongside "in_progress").
const TAG_RE = /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g

// Escape hatch for the per-turn breadcrumb (issue #427). Mirrors
// `common.config.get_prompt_injection_config()` / the shared Python hook's
// `_resolve_skip_keyword()` + `prompt_has_skip_keyword()`.
const DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD = "no-trellis"

function stripInlineComment(value) {
  let inQuote = null
  for (let idx = 0; idx < value.length; idx++) {
    const ch = value[idx]
    if (inQuote) {
      if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      continue
    }
    if (ch === "#" && (idx === 0 || /\s/.test(value[idx - 1]))) return value.slice(0, idx)
  }
  return value
}

function unquoteYaml(s) {
  if (s.length >= 2 && s[0] === s[s.length - 1] && (s[0] === '"' || s[0] === "'")) return s.slice(1, -1)
  return s
}

/**
 * Line-based parser for ONLY the `prompt_injection:` block of
 * `.trellis/config.yaml`. Not a general YAML parser — mirrors
 * `common.config.get_prompt_injection_config()` semantics for this section
 * only (missing key keeps the default; non-string value keeps the default).
 */
function readSkipKeyword(directory) {
  const path = join(directory, ".trellis", "config.yaml")
  if (!existsSync(path)) return DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD
  let text
  try {
    text = readFileSync(path, "utf-8")
  } catch {
    return DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD
  }

  let inSection = false
  let sectionIndent = -1
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!inSection) {
      if (/^prompt_injection\s*:\s*(#.*)?$/.test(trimmed)) {
        inSection = true
        sectionIndent = rawLine.length - rawLine.trimStart().length
      }
      continue
    }
    if (!trimmed || trimmed.startsWith("#")) continue
    const indent = rawLine.length - rawLine.trimStart().length
    if (indent <= sectionIndent) break
    const m = trimmed.match(/^skip_keyword\s*:\s*(.*)$/)
    if (!m) continue
    return unquoteYaml(stripInlineComment(m[1]).trim())
  }
  return DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD
}

/**
 * Case-insensitive, word-boundary match of `keyword` in `text`. Hyphen
 * counts as a word char so "no-trellisx" / "xno-trellis" don't match, but
 * punctuation/whitespace boundaries do. Empty keyword never matches.
 */
function promptHasSkipKeyword(text, keyword) {
  if (!keyword || typeof text !== "string") return false
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i")
  return pattern.test(text)
}

// Per-task workflow selection (mirrors the Python resolver in
// .trellis/scripts/common/workflow_selection.py). Ids are restricted to
// [A-Za-z0-9_-]+ so a task.json value can never traverse outside
// .trellis/workflows/.
const WORKFLOW_ID_RE = /^[A-Za-z0-9_-]+$/

// Map a workflow id to its .trellis/workflows/<id>.md file if valid and
// present, else "". Shared by every resolution layer. Never throws.
function libraryVariant(directory, workflowId) {
  if (!workflowId || !WORKFLOW_ID_RE.test(workflowId)) return ""
  const variantPath = join(directory, ".trellis", "workflows", `${workflowId}.md`)
  try {
    if (statSync(variantPath).isFile()) return variantPath
  } catch {
    // ENOENT etc. — missing variant file.
  }
  return ""
}

// Personal override id from the gitignored .developer file (`workflow=<id>`
// line). "" when absent/unreadable. Never throws.
function developerWorkflowId(directory) {
  try {
    const text = readFileSync(join(directory, ".trellis", ".developer"), "utf-8")
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("workflow=")) return line.slice("workflow=".length).trim()
    }
  } catch {
    // No .developer / unreadable — no personal override.
  }
  return ""
}

// Team-shared default id from config.yaml's top-level `default_workflow:` key.
// Commented lines (starting with '#') are naturally excluded by the anchor.
// "" when unset/unreadable. Never throws.
const DEFAULT_WORKFLOW_RE = /^default_workflow:\s*(['"]?)([A-Za-z0-9_-]+)\1\s*(?:#.*)?$/m
function configDefaultWorkflowId(directory) {
  try {
    const text = readFileSync(join(directory, ".trellis", "config.yaml"), "utf-8")
    const m = text.match(DEFAULT_WORKFLOW_RE)
    if (m) return m[2]
  } catch {
    // No config.yaml / unreadable — no team default.
  }
  return ""
}

/**
 * Resolve which workflow markdown file feeds this turn's breadcrumbs.
 *
 * Precedence (identical across all Trellis consumers), highest to lowest —
 * each layer resolves an id to .trellis/workflows/<id>.md and falls through
 * when unset, invalid, or naming a missing file:
 *   1. Per-task pin  — active task's task.json "workflow" (session-bound; a
 *      bad id / missing file warns once on stderr, then falls through).
 *   2. Personal      — .developer `workflow=<id>` (gitignored, per-developer).
 *   3. Team default  — config.yaml `default_workflow` (git-tracked, shared).
 *   4. Global        — .trellis/workflow.md.
 * With neither a pin nor the personal/team keys set, this is the global path.
 * Never throws.
 */
function resolveWorkflowMd(ctx, directory, platformInput) {
  const globalPath = join(directory, ".trellis", "workflow.md")

  // 1. Per-task pin (session-bound explicit choice).
  let workflowId = ""
  try {
    const active = ctx.getActiveTask(platformInput)
    if (active.taskPath && !active.stale) {
      const taskDir = ctx.resolveTaskDir(active.taskPath)
      if (taskDir) {
        const data = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf-8"))
        if (data && typeof data.workflow === "string") workflowId = data.workflow
      }
    }
  } catch {
    // No active task / unreadable task.json — not a selection.
    workflowId = ""
  }
  if (workflowId) {
    const pinned = libraryVariant(directory, workflowId)
    if (pinned) return pinned
    console.error(
      `Warning: active task selects workflow ${JSON.stringify(workflowId)} but .trellis/workflows/ has no matching file; using default workflow resolution`,
    )
  }

  // 2. Personal override, then 3. team default — silent on miss (defaults,
  // not an explicit per-task choice). 4. Global fallback.
  const personal = libraryVariant(directory, developerWorkflowId(directory))
  if (personal) return personal
  const team = libraryVariant(directory, configDefaultWorkflowId(directory))
  if (team) return team
  return globalPath
}

/**
 * Parse the resolved workflow markdown for [workflow-state:STATUS] blocks.
 *
 * Returns {status: body}. The workflow file is the single source of
 * truth — there are no fallback tables here. Missing tags (or a missing /
 * unreadable workflow file) fall back to a generic line in
 * buildBreadcrumb so users see the broken state and fix workflow.md
 * rather than the plugin silently masking it.
 */
function loadBreadcrumbs(workflowPath) {
  if (!existsSync(workflowPath)) return {}
  let content
  try {
    content = readFileSync(workflowPath, "utf-8")
  } catch {
    return {}
  }
  const result = {}
  for (const match of content.matchAll(TAG_RE)) {
    const status = match[1]
    const body = match[2].trim()
    if (body) result[status] = body
  }
  return result
}

/**
 * Get (taskId, status) from active task, or null if no active task.
 */
function getActiveTask(ctx, platformInput = null) {
  const active = ctx.getActiveTask(platformInput)
  const taskRef = active.taskPath
  if (!taskRef) return null
  const taskDir = ctx.resolveTaskDir(taskRef)
  if (active.stale || !taskDir || !existsSync(taskDir)) {
    return { id: taskRef.split("/").pop(), status: "stale", source: active.source }
  }
  const taskJsonPath = join(taskDir, "task.json")
  if (!existsSync(taskJsonPath)) return null
  try {
    const data = JSON.parse(readFileSync(taskJsonPath, "utf-8"))
    const status = typeof data.status === "string" ? data.status : ""
    if (!status) return null
    const id = data.id || taskRef.split("/").pop()
    return { id, status, source: active.source }
  } catch {
    return null
  }
}

/**
 * Build the <workflow-state>...</workflow-state> block.
 * - Known status (tag present in workflow.md) → detailed body
 * - Unknown status (no tag, or workflow.md missing) → generic
 *   "Refer to workflow.md for current step." line
 * - no_task pseudo-status (id === null) → header omits task info
 */
function buildBreadcrumb(id, status, templates) {
  let body = templates[status]
  if (body === undefined) {
    body = "Refer to workflow.md for current step."
  }
  let header = id === null ? `Status: ${status}` : `Task: ${id} (${status})`
  return `<workflow-state>\n${header}\n${body}\n</workflow-state>`
}

// OpenCode 1.2.x expects plugins to be factory functions (see inject-subagent-context.js comment).
export default async ({ directory }) => {
  const ctx = new TrellisContext(directory)
  debugLog("workflow-state", "Plugin loaded, directory:", directory)

  return {
      // chat.message fires on every user message. Inject breadcrumb in-place
      // so it persists in conversation history.
      "chat.message": async (input, output) => {
        try {
          // Skip Trellis sub-agent turns — the per-turn breadcrumb is for the
          // main session only; sub-agent context comes from the parent's
          // tool.execute.before injection.
          if (isTrellisSubagent(input)) {
            debugLog("workflow-state", "Skipping trellis subagent turn:", input?.agent)
            return
          }
          if (process.env.TRELLIS_HOOKS === "0" || process.env.TRELLIS_DISABLE_HOOKS === "1") {
            return
          }
          if (process.env.OPENCODE_NON_INTERACTIVE === "1") {
            return
          }
          if (!ctx.isTrellisProject()) {
            return
          }

          const parts = output?.parts || []
          const textPartIndex = parts.findIndex(
            p => p.type === "text" && p.text !== undefined,
          )
          const originalText = textPartIndex !== -1 ? (parts[textPartIndex].text || "") : ""

          // Escape hatch (issue #427): user prompt contains the skip keyword
          // as a standalone word — emit nothing for this turn only.
          if (promptHasSkipKeyword(originalText, readSkipKeyword(directory))) {
            debugLog("workflow-state", "Skipping turn: skip keyword present in prompt")
            return
          }

          const templates = loadBreadcrumbs(resolveWorkflowMd(ctx, directory, input))
          const task = getActiveTask(ctx, input)
          const breadcrumb = task
            ? buildBreadcrumb(task.id, task.status, templates, task.source)
            : buildBreadcrumb(null, "no_task", templates)

          if (textPartIndex !== -1) {
            parts[textPartIndex].text = `${breadcrumb}\n\n${originalText}`
          } else {
            parts.unshift({ type: "text", text: breadcrumb })
          }
          debugLog(
            "workflow-state",
            "Injected breadcrumb for task",
            task ? task.id : "none",
            "status",
            task ? task.status : "no_task",
          )
        } catch (error) {
          debugLog(
            "workflow-state",
            "Error in chat.message:",
            error instanceof Error ? error.message : String(error),
          )
        }
      },
  }
}
