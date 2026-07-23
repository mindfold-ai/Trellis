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

/**
 * Resolve which workflow markdown file feeds this turn's breadcrumbs.
 *
 * Rule (identical across all Trellis consumers):
 * - Active task's task.json has a non-empty string "workflow" field whose
 *   id matches [A-Za-z0-9_-]+ AND .trellis/workflows/<id>.md is a file →
 *   use that path.
 * - Selection present but id invalid / variant file missing → one warning
 *   line on stderr (never stdout — stdout is hook JSON on other hosts)
 *   and fall back to the global .trellis/workflow.md.
 * - No active task / no "workflow" field / anything unreadable → global
 *   path, silently. Never throws.
 */
function resolveWorkflowMd(ctx, directory, platformInput) {
  const globalPath = join(directory, ".trellis", "workflow.md")
  let workflowId = ""
  try {
    const active = ctx.getActiveTask(platformInput)
    if (!active.taskPath || active.stale) return globalPath
    const taskDir = ctx.resolveTaskDir(active.taskPath)
    if (!taskDir) return globalPath
    const data = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf-8"))
    if (data && typeof data.workflow === "string") workflowId = data.workflow
  } catch {
    // No active task / unreadable task.json — not a selection, no warning.
    return globalPath
  }
  if (!workflowId) return globalPath
  if (WORKFLOW_ID_RE.test(workflowId)) {
    const variantPath = join(directory, ".trellis", "workflows", `${workflowId}.md`)
    try {
      if (statSync(variantPath).isFile()) return variantPath
    } catch {
      // ENOENT etc. — treated as a missing variant file; warn below.
    }
  }
  console.error(
    `Warning: active task selects workflow ${JSON.stringify(workflowId)} but .trellis/workflows/ has no matching file; using .trellis/workflow.md`,
  )
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
