/* global process */
/**
 * Trellis Session Start Plugin
 *
 * Injects context when user sends the first message in a session.
 * Uses OpenCode's chat.message hook directly so the context persists in history.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { basename, join } from "path"
import { execFileSync } from "child_process"
import { platform } from "os"
import { TrellisContext, contextCollector, debugLog } from "../lib/trellis-context.js"

const PYTHON_CMD = platform() === "win32" ? "python" : "python3"


/**
 * Return true iff jsonl has at least one row with a `file` field.
 * A freshly seeded jsonl only contains a `{"_example": ...}` row (no `file`
 * key) — that is NOT "ready". Readiness requires at least one curated entry.
 * Matches the contract used by `shared-hooks/inject-subagent-context.py`.
 */
function hasCuratedJsonlEntry(jsonlPath) {
  try {
    const content = readFileSync(jsonlPath, "utf-8")
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      try {
        const row = JSON.parse(line)
        if (row && typeof row === "object" && typeof row.file === "string" && row.file) {
          return true
        }
      } catch {
        // Ignore malformed line — move on.
      }
    }
  } catch {
    return false
  }
  return false
}

/**
 * Check current task status and return structured status string.
 * JavaScript equivalent of _get_task_status in Claude's session-start.py.
 */
function getTaskStatus(ctx) {
  const taskRef = ctx.getCurrentTask()
  if (!taskRef) {
    return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"
  }

  const taskDir = ctx.resolveTaskDir(taskRef)

  if (!taskDir || !existsSync(taskDir)) {
    return `Status: STALE POINTER\nTask: ${taskRef}\nNext: Task directory not found. Run: python3 ./.trellis/scripts/task.py finish`
  }

  let taskData = {}
  const taskJsonPath = join(taskDir, "task.json")
  if (existsSync(taskJsonPath)) {
    try {
      taskData = JSON.parse(readFileSync(taskJsonPath, "utf-8"))
    } catch {
      // Ignore parse errors
    }
  }

  const taskTitle = taskData.title || taskRef
  const taskStatus = taskData.status || "unknown"

  if (taskStatus === "completed") {
    const dirName = basename(taskDir)
    return `Status: COMPLETED\nTask: ${taskTitle}\nNext: Archive with \`python3 ./.trellis/scripts/task.py archive ${dirName}\` or start a new task`
  }

  let hasContext = false
  for (const jsonlName of ["implement.jsonl", "check.jsonl"]) {
    const jsonlPath = join(taskDir, jsonlName)
    if (existsSync(jsonlPath) && hasCuratedJsonlEntry(jsonlPath)) {
      hasContext = true
      break
    }
  }

  const hasPrd = existsSync(join(taskDir, "prd.md"))

  if (!hasPrd) {
    return `Status: NOT READY\nTask: ${taskTitle}\nMissing: prd.md not created\nNext: Write PRD (see workflow.md Phase 1.1) then curate implement.jsonl per Phase 1.3`
  }

  if (!hasContext) {
    return `Status: NOT READY\nTask: ${taskTitle}\nMissing: implement.jsonl / check.jsonl missing or empty\nNext: Curate entries per workflow.md Phase 1.3 (spec + research files only), then \`task.py start\``
  }

  return `Status: READY\nTask: ${taskTitle}\nNext: Continue with implement or check`
}

/**
 * Load Trellis config for session-start decisions.
 * Calls get_context.py --mode packages --json for reliable config data.
 */
function loadTrellisConfig(directory) {
  const scriptPath = join(directory, ".trellis", "scripts", "get_context.py")
  if (!existsSync(scriptPath)) {
    return { isMonorepo: false, packages: {}, specScope: null, activeTaskPackage: null, defaultPackage: null }
  }
  try {
    const output = execFileSync(PYTHON_CMD, [scriptPath, "--mode", "packages", "--json"], {
      cwd: directory,
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    const data = JSON.parse(output)
    if (data.mode !== "monorepo") {
      return { isMonorepo: false, packages: {}, specScope: null, activeTaskPackage: null, defaultPackage: null }
    }
    const pkgDict = {}
    for (const pkg of (data.packages || [])) {
      pkgDict[pkg.name] = pkg
    }
    return {
      isMonorepo: true,
      packages: pkgDict,
      specScope: data.specScope || null,
      activeTaskPackage: data.activeTaskPackage || null,
      defaultPackage: data.defaultPackage || null,
    }
  } catch (e) {
    debugLog("session", "loadTrellisConfig error:", e.message)
    return { isMonorepo: false, packages: {}, specScope: null, activeTaskPackage: null, defaultPackage: null }
  }
}


/**
 * Check for legacy spec directory structure in monorepo.
 */
function checkLegacySpec(directory, config) {
  if (!config.isMonorepo || Object.keys(config.packages).length === 0) {
    return null
  }

  const specDir = join(directory, ".trellis", "spec")
  if (!existsSync(specDir)) return null

  let hasLegacy = false
  for (const name of ["backend", "frontend"]) {
    if (existsSync(join(specDir, name, "index.md"))) {
      hasLegacy = true
      break
    }
  }
  if (!hasLegacy) return null

  const pkgNames = Object.keys(config.packages).sort()
  const missing = pkgNames.filter(name => !existsSync(join(specDir, name)))

  if (missing.length === 0) return null

  if (missing.length === pkgNames.length) {
    return (
      `[!] Legacy spec structure detected: found \`spec/backend/\` or \`spec/frontend/\` ` +
      `but no package-scoped \`spec/<package>/\` directories.\n` +
      `Monorepo packages: ${pkgNames.join(", ")}\n` +
      `Please reorganize: \`spec/backend/\` -> \`spec/<package>/backend/\``
    )
  }
  return (
    `[!] Partial spec migration detected: packages ${missing.join(", ")} ` +
    `still missing \`spec/<pkg>/\` directory.\n` +
    `Please complete migration for all packages.`
  )
}


/**
 * Resolve which packages should have their specs injected.
 * Returns a Set of allowed package names, or null for full scan.
 */
function resolveSpecScope(config) {
  if (!config.isMonorepo || Object.keys(config.packages).length === 0) {
    return null
  }

  const { specScope, activeTaskPackage, defaultPackage, packages } = config
  if (specScope == null) return null

  if (specScope === "active_task") {
    if (activeTaskPackage && activeTaskPackage in packages) return new Set([activeTaskPackage])
    if (defaultPackage && defaultPackage in packages) return new Set([defaultPackage])
    return null
  }

  if (Array.isArray(specScope)) {
    const valid = new Set()
    for (const entry of specScope) {
      if (entry in packages) {
        valid.add(entry)
      }
    }
    if (valid.size > 0) return valid
    if (activeTaskPackage && activeTaskPackage in packages) return new Set([activeTaskPackage])
    if (defaultPackage && defaultPackage in packages) return new Set([defaultPackage])
    return null
  }

  return null
}


/**
 * Build session context for injection
 */
function buildSessionContext(ctx) {
  const directory = ctx.directory
  const trellisDir = join(directory, ".trellis")

  const config = loadTrellisConfig(directory)
  const allowedPkgs = resolveSpecScope(config)

  const parts = []

  // 1. Header
  parts.push(`<trellis-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</trellis-context>`)

  // Legacy migration warning
  const legacyWarning = checkLegacySpec(directory, config)
  if (legacyWarning) {
    parts.push(`<migration-warning>\n${legacyWarning}\n</migration-warning>`)
  }

  // 2. Current Context (dynamic)
  const contextScript = join(trellisDir, "scripts", "get_context.py")
  if (existsSync(contextScript)) {
    const output = ctx.runScript(contextScript)
    if (output) {
      parts.push("<current-state>")
      parts.push(output)
      parts.push("</current-state>")
    }
  }

  // 3. Workflow Guide — TOC + Phase Index + Phase 1/2/3 step details.
  //    Meta sections (Core Principles / Trellis System / Breadcrumbs) are NOT
  //    injected: Core Principles is short prose; Trellis System duplicates
  //    commands in step bodies; Breadcrumbs are consumed by UserPromptSubmit hook.
  const workflowContent = ctx.readProjectFile(".trellis/workflow.md")
  if (workflowContent) {
    const allLines = workflowContent.split("\n")
    const overviewLines = [
      "# Development Workflow — Section Index",
      "Full guide: .trellis/workflow.md  (read on demand)",
      "",
      "## Table of Contents",
    ]
    for (const line of allLines) {
      if (line.startsWith("## ")) overviewLines.push(line)
    }
    overviewLines.push("", "---", "")

    // Extract range from "## Phase Index" up to (but excluding)
    // "## Workflow State Breadcrumbs". Captures Phase Index + Phase 1/2/3.
    let rangeStart = -1
    let rangeEnd = allLines.length
    for (let i = 0; i < allLines.length; i++) {
      const stripped = allLines[i].trim()
      if (rangeStart === -1 && stripped === "## Phase Index") {
        rangeStart = i
      } else if (rangeStart !== -1 && stripped === "## Workflow State Breadcrumbs") {
        rangeEnd = i
        break
      }
    }
    if (rangeStart !== -1) {
      overviewLines.push(...allLines.slice(rangeStart, rangeEnd))
    }

    parts.push("<workflow>")
    parts.push(overviewLines.join("\n").trimEnd())
    parts.push("</workflow>")
  }

  // 4. Guidelines — paths-only for most indexes; guides/ inlined (cross-package,
  //    broadly useful). Sub-agents get their specific specs via jsonl injection —
  //    main agent reads paths on demand when editing code directly.
  parts.push("<guidelines>")
  parts.push(
    "Project spec indexes are listed by path below. Each index contains a " +
    "**Pre-Development Checklist** listing the specific guideline files to " +
    "read before coding.\n\n" +
    "- If you're spawning an implement/check sub-agent, context is injected " +
    "automatically via `{task}/implement.jsonl` / `check.jsonl`. You do NOT " +
    "need to read these indexes yourself.\n" +
    "- If you're editing code directly in the main session, Read the relevant " +
    "index(es) on-demand and follow their Pre-Dev Checklist.\n"
  )

  const specDir = join(directory, ".trellis", "spec")

  // guides/ inlined
  const guidesIndex = join(specDir, "guides", "index.md")
  if (existsSync(guidesIndex)) {
    const content = ctx.readFile(guidesIndex)
    if (content) {
      parts.push(`## guides (inlined — cross-package thinking guides)\n${content}\n`)
    }
  }

  // Other indexes — paths only
  const paths = []
  if (existsSync(specDir)) {
    try {
      const subs = readdirSync(specDir).filter(name => {
        if (name.startsWith(".")) return false
        try {
          return statSync(join(specDir, name)).isDirectory()
        } catch {
          return false
        }
      }).sort()

      for (const sub of subs) {
        if (sub === "guides") continue  // already inlined above

        const indexFile = join(specDir, sub, "index.md")
        if (existsSync(indexFile)) {
          paths.push(`.trellis/spec/${sub}/index.md`)
        } else {
          if (allowedPkgs !== null && !allowedPkgs.has(sub)) continue
          try {
            const nested = readdirSync(join(specDir, sub)).filter(name => {
              try {
                return statSync(join(specDir, sub, name)).isDirectory()
              } catch {
                return false
              }
            }).sort()
            for (const layer of nested) {
              const nestedIndex = join(specDir, sub, layer, "index.md")
              if (existsSync(nestedIndex)) {
                paths.push(`.trellis/spec/${sub}/${layer}/index.md`)
              }
            }
          } catch {
            // Ignore directory read errors
          }
        }
      }
    } catch {
      // Ignore spec directory read errors
    }
  }

  if (paths.length > 0) {
    parts.push("## Available spec indexes (read on demand)")
    for (const p of paths) {
      parts.push(`- ${p}`)
    }
    parts.push("")
  }

  parts.push(
    "Discover more via: " +
    "`python3 ./.trellis/scripts/get_context.py --mode packages`"
  )
  parts.push("</guidelines>")

  // 6. Task status
  const taskStatus = getTaskStatus(ctx)
  parts.push(`<task-status>\n${taskStatus}\n</task-status>`)

  // 7. Final directive
  parts.push(`<ready>
Context loaded. Workflow index, project state, and guidelines are already injected above — do NOT re-read them.
Wait for the user's first message, then handle it following the workflow guide.
If there is an active task, ask whether to continue it.
</ready>`)

  return parts.join("\n\n")
}

function getTrellisMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {}
  }

  const trellis = metadata.trellis
  if (!trellis || typeof trellis !== "object") {
    return {}
  }

  return trellis
}

function markPartAsSessionStart(part) {
  const metadata = part.metadata && typeof part.metadata === "object"
    ? part.metadata
    : {}
  part.metadata = {
    ...metadata,
    trellis: {
      ...getTrellisMetadata(metadata),
      sessionStart: true,
    },
  }
}

function hasSessionStartMarker(part) {
  if (!part || part.type !== "text" || typeof part.text !== "string") {
    return false
  }

  return getTrellisMetadata(part.metadata).sessionStart === true
}

export function hasInjectedTrellisContext(messages) {
  if (!Array.isArray(messages)) {
    return false
  }

  return messages.some(message => {
    if (!message?.info || message.info.role !== "user" || !Array.isArray(message.parts)) {
      return false
    }

    return message.parts.some(hasSessionStartMarker)
  })
}

async function hasPersistedInjectedContext(client, directory, sessionID) {
  try {
    const response = await client.session.messages({
      path: { id: sessionID },
      query: { directory },
      throwOnError: true,
    })
    return hasInjectedTrellisContext(response.data || [])
  } catch (error) {
    debugLog(
      "session",
      "Failed to read session history for dedupe:",
      error instanceof Error ? error.message : String(error),
    )
    return false
  }
}

// OpenCode 1.2.x expects plugins to be factory functions (see inject-subagent-context.js comment).
export default async ({ directory, client }) => {
  const ctx = new TrellisContext(directory)
  debugLog("session", "Plugin loaded, directory:", directory)

  return {
      // Clear in-memory dedupe after compaction so context can be re-injected.
      event: ({ event }) => {
        try {
          if (event?.type === "session.compacted" && event?.properties?.sessionID) {
            const sessionID = event.properties.sessionID
            contextCollector.clear(sessionID)
            debugLog("session", "Cleared processed flag after compaction for session:", sessionID)
          }
        } catch (error) {
          debugLog(
            "session",
            "Error in event hook:",
            error instanceof Error ? error.message : String(error),
          )
        }
      },

      // chat.message - triggered when user sends a message.
      // Modify the message in-place so the context is persisted with updateMessage/updatePart.
      "chat.message": async (input, output) => {
        try {
          const sessionID = input.sessionID
          const agent = input.agent || "unknown"
          debugLog("session", "chat.message called, sessionID:", sessionID, "agent:", agent)

          // Skip in non-interactive mode
          if (process.env.OPENCODE_NON_INTERACTIVE === "1") {
            debugLog("session", "Skipping - non-interactive mode")
            return
          }

          // Only inject on first message
          if (contextCollector.isProcessed(sessionID)) {
            debugLog("session", "Skipping - session already processed")
            return
          }

          if (await hasPersistedInjectedContext(client, ctx.directory, sessionID)) {
            contextCollector.markProcessed(sessionID)
            debugLog("session", "Skipping - session already contains persisted Trellis context")
            return
          }

          // Build context
          const context = buildSessionContext(ctx)
          debugLog("session", "Built context, length:", context.length)

          // Inject context directly into output.parts so it gets persisted by updatePart
          const parts = output?.parts || []
          const textPartIndex = parts.findIndex(
            p => p.type === "text" && p.text !== undefined
          )

          if (textPartIndex !== -1) {
            const originalText = parts[textPartIndex].text || ""
            parts[textPartIndex].text = `${context}\n\n---\n\n${originalText}`
            markPartAsSessionStart(parts[textPartIndex])
            debugLog("session", "Injected context into chat.message text part, length:", context.length)
          } else {
            // No existing text part: prepend a new one
            const injectedPart = { type: "text", text: context }
            markPartAsSessionStart(injectedPart)
            parts.unshift(injectedPart)
            debugLog("session", "Prepended new text part with context, length:", context.length)
          }

          contextCollector.markProcessed(sessionID)

        } catch (error) {
          debugLog("session", "Error in chat.message:", error.message, error.stack)
        }
      }
  }
}
