/* global process */
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { basename, join } from "path"
import { execFileSync } from "child_process"
import { platform } from "os"
import { debugLog } from "./trellis-context.js"

const PYTHON_CMD = platform() === "win32" ? "python" : "python3"

const FIRST_REPLY_NOTICE = `<first-reply-notice>
On the first visible assistant reply in this session, begin with exactly one short Chinese sentence:
Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。
Then continue directly with the user's request. This notice is one-shot: do not repeat it after the first assistant reply in the same session.
</first-reply-notice>`

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
        // Ignore malformed line
      }
    }
  } catch {
    return false
  }
  return false
}

function getTaskStatus(ctx, platformInput = null) {
  const active = ctx.getActiveTask(platformInput)
  const taskRef = active.taskPath
  if (!taskRef) {
    return (
      `Status: NO ACTIVE TASK\nSource: ${active.source}\n` +
      "Next: Describe what you want to work on\n" +
      "Research reminder: for research-heavy external/technical discovery, dispatch `trellis-research` " +
      "sub-agents and persist findings to `{TASK_DIR}/research/*.md`; do NOT research inline with " +
      "WebFetch/WebSearch/gh api in the main session."
    )
  }

  const taskDir = ctx.resolveTaskDir(taskRef)

  if (active.stale || !taskDir || !existsSync(taskDir)) {
    return `Status: STALE POINTER\nTask: ${taskRef}\nSource: ${active.source}\nNext: Task directory not found. Run: python3 ./.trellis/scripts/task.py finish`
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
    return `Status: COMPLETED\nTask: ${taskTitle}\nSource: ${active.source}\nNext: Archive with \`python3 ./.trellis/scripts/task.py archive ${dirName}\` or start a new task`
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
    return (
      `Status: NOT READY\nTask: ${taskTitle}\nSource: ${active.source}\n` +
      "Missing: prd.md not created\n" +
      "Next: Write PRD (see workflow.md Phase 1.1) then curate implement.jsonl per Phase 1.3\n" +
      "Research reminder: delegate external/technical discovery to `trellis-research`; findings must go " +
      "to `{TASK_DIR}/research/*.md`, and the PRD should link to those files."
    )
  }

  if (!hasContext) {
    return `Status: NOT READY\nTask: ${taskTitle}\nSource: ${active.source}\nMissing: implement.jsonl / check.jsonl missing or empty\nNext: Curate entries per workflow.md Phase 1.3 (spec + \`trellis-research\` files from \`{TASK_DIR}/research/*.md\` only), then \`task.py start\``
  }

  return (
    `Status: READY\nTask: ${taskTitle}\n` +
    `Source: ${active.source}\n` +
    "Next required action: dispatch `trellis-implement` per Phase 2.1. " +
    "For agent-capable platforms, main-session implementation is blocked: do NOT inspect implementation details, " +
    "edit code, or run implementation inline unless the user's CURRENT message contains an inline override. " +
    "After implementation, dispatch `trellis-check` per Phase 2.2 before reporting completion. " +
    "Before commit/finish, explicitly run/load `trellis-update-spec` for Phase 3.3 and record whether " +
    "spec updates were made; sub-agent spec edits do not replace this explicit judgment.\n" +
    "User override (per-turn escape hatch): if the user's CURRENT message explicitly tells the " +
    "main session to handle it directly (\"你直接改\" / \"别派 sub-agent\" / \"main session 写就行\" / " +
    "\"do it inline\" / \"不用 sub-agent\"), honor it for this turn and edit code directly. " +
    "Per-turn only; without one of these current-turn phrases, main-session implementation remains blocked."
  )
}

function loadTrellisConfig(directory, contextKey = null) {
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
      env: {
        ...process.env,
        ...(contextKey ? { TRELLIS_CONTEXT_ID: contextKey } : {}),
      },
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

export function buildSessionContext(ctx, platformInput = null) {
  const directory = ctx.directory
  const trellisDir = join(directory, ".trellis")
  const contextKey = typeof ctx.getContextKey === "function"
    ? ctx.getContextKey(platformInput)
    : null

  const config = loadTrellisConfig(directory, contextKey)
  const allowedPkgs = resolveSpecScope(config)

  const parts = []

  parts.push(`<trellis-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</trellis-context>`)
  parts.push(FIRST_REPLY_NOTICE)

  const legacyWarning = checkLegacySpec(directory, config)
  if (legacyWarning) {
    parts.push(`<migration-warning>\n${legacyWarning}\n</migration-warning>`)
  }

  const contextScript = join(trellisDir, "scripts", "get_context.py")
  if (existsSync(contextScript)) {
    const output = ctx.runScript(contextScript, undefined, contextKey)
    if (output) {
      parts.push("<current-state>")
      parts.push(output)
      parts.push("</current-state>")
    }
  }

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

  parts.push("<guidelines>")
  parts.push(
    "Project spec indexes are listed by path below. Each index contains a " +
    "**Pre-Development Checklist** listing the specific guideline files to " +
    "read before coding.\n\n" +
    "- If you're spawning an implement/check sub-agent, context is injected " +
    "automatically via `{task}/implement.jsonl` / `check.jsonl`. You do NOT " +
    "need to read these indexes yourself.\n" +
    "- For agent-capable platforms, do NOT edit code directly in the main " +
    "session; dispatch `trellis-implement` and `trellis-check` so JSONL " +
    "context is loaded by the sub-agents.\n"
  )

  const specDir = join(directory, ".trellis", "spec")

  const guidesIndex = join(specDir, "guides", "index.md")
  if (existsSync(guidesIndex)) {
    const content = ctx.readFile(guidesIndex)
    if (content) {
      parts.push(`## guides (inlined — cross-package thinking guides)\n${content}\n`)
    }
  }

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
        if (sub === "guides") continue

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

  const taskStatus = getTaskStatus(ctx, platformInput)
  parts.push(`<task-status>\n${taskStatus}\n</task-status>`)

  parts.push(`<ready>
Context loaded. Workflow index, project state, and guidelines are already injected above — do NOT re-read them.
When the user sends the first message, follow <task-status> and the workflow guide.
If a task is READY, execute its Next required action without asking whether to continue.
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

export async function hasPersistedInjectedContext(client, directory, sessionID) {
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

export function markContextInjected(part) {
  markPartAsSessionStart(part)
}
