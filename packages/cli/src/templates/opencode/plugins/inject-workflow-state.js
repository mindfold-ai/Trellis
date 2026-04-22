/* global process */
/**
 * Trellis Workflow State Injection Plugin
 *
 * Per-turn UserPromptSubmit equivalent for OpenCode.
 *
 * On every chat.message, if a Trellis task is active, inject a short
 * <workflow-state> breadcrumb reminding the main AI what task is active
 * and its expected flow. Breadcrumb text is pulled from the project's
 * workflow.md [workflow-state:STATUS] tag blocks (single source of
 * truth for users who fork the Trellis workflow), with hardcoded
 * fallbacks so the hook never breaks when workflow.md is missing or
 * malformed.
 *
 * Unlike session-start, this plugin does NOT dedupe — breadcrumb
 * should surface on every turn so long conversations don't drift.
 *
 * Silently skips when:
 *   - No .trellis/ directory
 *   - No active task (.trellis/.current-task missing or stale)
 *   - task.json malformed or missing status
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { TrellisContext, debugLog } from "../lib/trellis-context.js"

// Supports STATUS values with letters, digits, underscores, hyphens
// (so "in-review" / "blocked-by-team" work alongside "in_progress").
const TAG_RE = /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g

// Hardcoded defaults for built-in Trellis statuses. Used when workflow.md
// is missing, malformed, or lacks the tag for this status.
//
// `no_task` is a pseudo-status emitted when .current-task is missing — keeps
// the Next-Action reminder flowing per-turn even without an active task.
const FALLBACK_BREADCRUMBS = {
  no_task:
    "No active task.\n" +
    "Trigger words in the user message that REQUIRE creating a task " +
    "(non-negotiable, do NOT self-exempt): 重构 / 抽成 / 独立 / 分发 / " +
    "拆出来 / 搞一个 / 做成 / 接入 / 集成 / refactor / rewrite / extract / " +
    "productize / publish / build X / design Y.\n" +
    "Task is NOT required ONLY if ALL three hold: (a) zero file writes " +
    "this turn, (b) answer fits in one reply with no multi-round plan, " +
    "(c) no research beyond reading 1-2 repo files.\n" +
    "When in doubt: create task. Over-tasking is cheap; under-tasking " +
    "leaks plans and research into main context.\n" +
    "Flow: load `trellis-brainstorm` skill → it creates the task via " +
    "`python3 ./.trellis/scripts/task.py create` and drives requirements Q&A. " +
    "For research-heavy work (tool comparison, docs, cross-platform survey), " +
    "spawn `trellis-research` sub-agents via Task tool — NEVER do 3+ inline " +
    "WebFetch/WebSearch/`gh api` calls in the main conversation.",
  planning:
    "Complete prd.md via trellis-brainstorm skill; then run task.py start.\n" +
    "Research belongs in `{task_dir}/research/*.md`, written by " +
    "`trellis-research` sub-agents. Do NOT inline WebFetch/WebSearch in " +
    "main session — PRD only links to research files.",
  in_progress:
    "Flow: trellis-implement → trellis-check → trellis-update-spec → finish\n" +
    "Check conversation history + git status to determine current step; do NOT skip trellis-check.",
  completed:
    "User commits changes; then run task.py archive.",
}

/**
 * Parse workflow.md for [workflow-state:STATUS] blocks.
 * Returns {status: body}. Missing tags fall back to hardcoded defaults.
 */
function loadBreadcrumbs(directory) {
  const result = { ...FALLBACK_BREADCRUMBS }
  const workflowPath = join(directory, ".trellis", "workflow.md")
  if (!existsSync(workflowPath)) return result
  let content
  try {
    content = readFileSync(workflowPath, "utf-8")
  } catch {
    return result
  }
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
function getActiveTask(ctx) {
  const taskRef = ctx.getCurrentTask()
  if (!taskRef) return null
  const taskDir = ctx.resolveTaskDir(taskRef)
  if (!taskDir || !existsSync(taskDir)) return null
  const taskJsonPath = join(taskDir, "task.json")
  if (!existsSync(taskJsonPath)) return null
  try {
    const data = JSON.parse(readFileSync(taskJsonPath, "utf-8"))
    const status = typeof data.status === "string" ? data.status : ""
    if (!status) return null
    const id = data.id || taskRef.split("/").pop()
    return { id, status }
  } catch {
    return null
  }
}

/**
 * Build the <workflow-state>...</workflow-state> block.
 * - Known status (templates or fallback) → detailed body
 * - Unknown status → generic "refer to workflow.md"
 * - no_task pseudo-status (id === null) → header omits task info
 */
function buildBreadcrumb(id, status, templates) {
  let body = templates[status]
  if (body === undefined) {
    body = "Refer to workflow.md for current step."
  }
  const header = id === null ? `Status: ${status}` : `Task: ${id} (${status})`
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
          if (process.env.OPENCODE_NON_INTERACTIVE === "1") {
            return
          }
          if (!ctx.isTrellisProject()) {
            return
          }
          const templates = loadBreadcrumbs(directory)
          const task = getActiveTask(ctx)
          const breadcrumb = task
            ? buildBreadcrumb(task.id, task.status, templates)
            : buildBreadcrumb(null, "no_task", templates)

          const parts = output?.parts || []
          const textPartIndex = parts.findIndex(
            p => p.type === "text" && p.text !== undefined,
          )
          if (textPartIndex !== -1) {
            const originalText = parts[textPartIndex].text || ""
            parts[textPartIndex].text = `${breadcrumb}\n\n${originalText}`
          } else {
            parts.unshift({ type: "text", text: breadcrumb })
          }
          debugLog(
            "workflow-state",
            "Injected breadcrumb for task",
            task.id,
            "status",
            task.status,
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
