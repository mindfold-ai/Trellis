/**
 * Trellis Context Manager
 *
 * Utility class for OpenCode plugins providing file reading,
 * JSONL parsing, and context building capabilities.
 */

import { existsSync, readFileSync, appendFileSync, readdirSync, statSync } from "fs"
import { isAbsolute, join } from "path"
import { platform } from "os"
import { execSync } from "child_process"
import { createHash } from "crypto"
import process from "process"

const PYTHON_CMD = platform() === "win32" ? "python" : "python3"
// Debug logging
const DEBUG_LOG = "/tmp/trellis-plugin-debug.log"

// Context budget (keep in sync with inject-subagent-context.py / pi extension)
const MAX_MANIFEST_ENTRIES = 50
const MAX_DIR_LISTING_FILES = 20
const MAX_ARTIFACT_CHARS = 20000
const MAX_TOTAL_CONTEXT_CHARS = 60000

// Header for the curated reference index: tells the sub-agent the listed
// references are NOT inlined and must be read on demand.
const REFERENCE_INDEX_HEADER = `## Curated Reference Index

The references below were curated for this task. Their contents are NOT inlined here — read the files yourself with your file tools (Read/Glob/Grep) before relying on them.`

function humanSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function debugLog(prefix, ...args) {
  const timestamp = new Date().toISOString()
  const msg = `[${timestamp}] [${prefix}] ${args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ")}\n`
  try {
    appendFileSync(DEBUG_LOG, msg)
  } catch {
    // ignore
  }
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function sanitizeKey(raw) {
  const safe = raw.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "")
  return safe ? safe.slice(0, 160) : ""
}

function hashValue(raw) {
  return createHash("sha256").update(raw).digest("hex").slice(0, 24)
}

function lookupString(data, keys) {
  if (!data || typeof data !== "object") return null
  for (const key of keys) {
    const value = stringValue(data[key])
    if (value) return value
  }
  for (const nestedKey of ["input", "properties", "event", "hook_input", "hookInput"]) {
    const nested = data[nestedKey]
    if (nested && typeof nested === "object") {
      const value = lookupString(nested, keys)
      if (value) return value
    }
  }
  return null
}

function buildContextKey(platformName, kind, value) {
  if (kind === "transcript") {
    return `${platformName}_transcript_${hashValue(value)}`
  }
  const safeValue = sanitizeKey(value)
  return safeValue ? `${platformName}_${safeValue}` : `${platformName}_${hashValue(value)}`
}

// Matches `trellis-implement`, `trellis-check`, `trellis-research` exactly.
// Used by chat.message plugins to skip injection inside Trellis sub-agent turns.
const TRELLIS_SUBAGENT_RE = /^trellis-(implement|check|research)$/

/**
 * Return true when the OpenCode `chat.message` input represents a Trellis
 * sub-agent turn. `input.agent` is set by OpenCode when a Task tool spawns a
 * child session with a custom agent (see `packages/opencode/src/tool/task.ts`).
 */
export function isTrellisSubagent(input) {
  if (!input || typeof input !== "object") return false
  const agent = typeof input.agent === "string" ? input.agent.trim() : ""
  return TRELLIS_SUBAGENT_RE.test(agent)
}

/**
 * Trellis Context Manager
 */
export class TrellisContext {
  constructor(directory) {
    this.directory = directory
    debugLog("context", "TrellisContext initialized", { directory })
  }

  // ============================================================
  // Trellis Project Detection
  // ============================================================

  isTrellisProject() {
    return existsSync(join(this.directory, ".trellis"))
  }

  getContextKey(platformInput = null) {
    const override = stringValue(process.env.TRELLIS_CONTEXT_ID)
    if (override) {
      return sanitizeKey(override) || hashValue(override)
    }

    const runID = stringValue(process.env.OPENCODE_RUN_ID)
    if (runID) return buildContextKey("opencode", "session", runID)

    const input = platformInput && typeof platformInput === "object" ? platformInput : null
    if (!input) return null

    const sessionID = lookupString(input, ["session_id", "sessionId", "sessionID"])
    if (sessionID) return buildContextKey("opencode", "session", sessionID)

    const conversationID = lookupString(input, ["conversation_id", "conversationId", "conversationID"])
    if (conversationID) return buildContextKey("opencode", "conversation", conversationID)

    const transcriptPath = lookupString(input, ["transcript_path", "transcriptPath", "transcript"])
    if (transcriptPath) return buildContextKey("opencode", "transcript", transcriptPath)

    return null
  }

  readContext(contextKey) {
    try {
      const contextPath = join(this.directory, ".trellis", ".runtime", "sessions", `${contextKey}.json`)
      if (!existsSync(contextPath)) return null
      return JSON.parse(readFileSync(contextPath, "utf-8"))
    } catch {
      return null
    }
  }

  /**
   * Get active task from session runtime context.
   *
   * Resolution order (mirrors Python `active_task.resolve_active_task`):
   *   1. Lookup the runtime file for the input-derived context key.
   *   2. If that misses and exactly one session runtime file exists locally,
   *      use it (`_resolveSingleSessionFallback`). Refuses to guess when 0 or
   *      ≥2 files exist so multi-window isolation holds.
   */
  getActiveTask(platformInput = null) {
    const contextKey = this.getContextKey(platformInput)
    if (contextKey) {
      const context = this.readContext(contextKey)
      const taskRef = this.normalizeTaskRef(context?.current_task || "")
      if (taskRef) {
        const taskDir = this.resolveTaskDir(taskRef)
        return {
          taskPath: taskRef,
          source: `session:${contextKey}`,
          stale: !taskDir || !existsSync(taskDir),
        }
      }
    }

    const fallback = this._resolveSingleSessionFallback()
    if (fallback) {
      return fallback
    }

    return { taskPath: null, source: "none", stale: false }
  }

  /**
   * Mirror of Python `_resolve_single_session_fallback`. Returns the task
   * pointed at by the sole session runtime file when exactly one exists,
   * else null.
   */
  _resolveSingleSessionFallback() {
    const sessionsDir = join(this.directory, ".trellis", ".runtime", "sessions")
    if (!existsSync(sessionsDir)) return null

    let files
    try {
      files = readdirSync(sessionsDir)
        .filter(name => name.endsWith(".json"))
        .sort()
    } catch {
      return null
    }
    if (files.length !== 1) return null

    const sessionFile = join(sessionsDir, files[0])
    let context
    try {
      context = JSON.parse(readFileSync(sessionFile, "utf-8"))
    } catch {
      return null
    }
    const taskRef = this.normalizeTaskRef(context?.current_task || "")
    if (!taskRef) return null

    const taskDir = this.resolveTaskDir(taskRef)
    const fallbackKey = files[0].replace(/\.json$/, "")
    return {
      taskPath: taskRef,
      source: `session-fallback:${fallbackKey}`,
      stale: !taskDir || !existsSync(taskDir),
    }
  }

  getCurrentTask(platformInput = null) {
    return this.getActiveTask(platformInput).taskPath
  }

  normalizeTaskRef(taskRef) {
    if (!taskRef) {
      return ""
    }

    if (isAbsolute(taskRef)) {
      return taskRef.trim()
    }

    let normalized = taskRef.trim().replace(/\\/g, "/")
    while (normalized.startsWith("./")) {
      normalized = normalized.slice(2)
    }

    if (normalized.startsWith("tasks/")) {
      return `.trellis/${normalized}`
    }

    return normalized
  }

  resolveTaskDir(taskRef) {
    const normalized = this.normalizeTaskRef(taskRef)
    if (!normalized) {
      return null
    }

    if (isAbsolute(normalized)) {
      return normalized
    }

    if (normalized.startsWith(".trellis/")) {
      return join(this.directory, normalized)
    }

    return join(this.directory, ".trellis", "tasks", normalized)
  }

  // ============================================================
  // File Reading Utilities
  // ============================================================

  readFile(filePath) {
    try {
      if (existsSync(filePath)) {
        return readFileSync(filePath, "utf-8")
      }
    } catch {
      // Ignore read errors
    }
    return null
  }

  readProjectFile(relativePath) {
    return this.readFile(join(this.directory, relativePath))
  }

  runScript(scriptPath, cwd = null, contextKey = null) {
    try {
      const result = execSync(`${PYTHON_CMD} "${scriptPath}"`, {
        cwd: cwd || this.directory,
        timeout: 10000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(contextKey ? { TRELLIS_CONTEXT_ID: contextKey } : {}),
        },
      })
      return result || ""
    } catch {
      return ""
    }
  }

  // ============================================================
  // JSONL Reading (reference index — contents are never inlined)
  // ============================================================

  fileSizeLabel(filePath) {
    try {
      return humanSize(statSync(filePath).size)
    } catch {
      return "missing"
    }
  }

  /**
   * Read a task artifact, truncating at MAX_ARTIFACT_CHARS with a notice.
   * `displayPath` is the path shown in the truncation notice.
   */
  readArtifact(filePath, displayPath) {
    const content = this.readFile(filePath)
    if (content && content.length > MAX_ARTIFACT_CHARS) {
      return (
        content.slice(0, MAX_ARTIFACT_CHARS) +
        `\n\n... [truncated at ${MAX_ARTIFACT_CHARS} chars — read ${displayPath} for the full content]`
      )
    }
    return content
  }

  /**
   * List .md files in a directory with sizes (no contents).
   * Returns { entries: [{ path, size }], omitted }.
   */
  listDirectoryMdFiles(dirPath, maxFiles = MAX_DIR_LISTING_FILES) {
    const entries = []
    let omitted = 0
    const fullPath = join(this.directory, dirPath)

    if (!existsSync(fullPath)) {
      return { entries, omitted }
    }

    try {
      const files = readdirSync(fullPath)
        .filter(f => f.endsWith(".md"))
        .sort()
      omitted = Math.max(0, files.length - maxFiles)
      for (const filename of files.slice(0, maxFiles)) {
        const filePath = join(dirPath, filename)
        entries.push({ path: filePath, size: this.fileSizeLabel(join(this.directory, filePath)) })
      }
    } catch {
      // Ignore directory read errors
    }

    return { entries, omitted }
  }

  /**
   * Read a JSONL manifest as curated index entries (no file bodies)
   * Supports:
   *   {"file": "path/to/file.md", "reason": "..."}
   *   {"file": "path/to/dir/", "type": "directory", "reason": "..."}
   * Returns: [{ path, type, reason }, ...]
   */
  readJsonlEntries(jsonlPath) {
    const results = []
    const content = this.readFile(jsonlPath)
    if (!content) return results

    for (const line of content.split("\n")) {
      if (!line.trim()) continue
      try {
        const item = JSON.parse(line)
        const file = item.file || item.path

        if (!file) continue

        results.push({
          path: file,
          type: item.type || "file",
          reason: typeof item.reason === "string" ? item.reason : "",
        })
      } catch {
        // Ignore parse errors for individual lines
      }
    }
    return results
  }

  /**
   * Render a JSONL manifest as a reference index: path + reason + file
   * metadata per entry (size for files, a capped .md listing for
   * directories). Referenced contents are never inlined.
   */
  buildReferenceIndex(jsonlPath, jsonlName) {
    const entries = this.readJsonlEntries(jsonlPath)
    if (entries.length === 0) return ""

    const lines = [REFERENCE_INDEX_HEADER, ""]
    for (const entry of entries.slice(0, MAX_MANIFEST_ENTRIES)) {
      const suffix = entry.reason ? ` — ${entry.reason}` : ""
      if (entry.type === "directory") {
        lines.push(`- ${entry.path} (directory)${suffix}`)
        const { entries: dirEntries, omitted } = this.listDirectoryMdFiles(entry.path)
        for (const dirEntry of dirEntries) {
          lines.push(`  - ${dirEntry.path} (${dirEntry.size})`)
        }
        if (omitted > 0) {
          lines.push(`  - ... [${omitted} more files omitted]`)
        }
      } else {
        const size = this.fileSizeLabel(join(this.directory, entry.path))
        lines.push(`- ${entry.path} (${size})${suffix}`)
      }
    }

    const omittedEntries = entries.length - MAX_MANIFEST_ENTRIES
    if (omittedEntries > 0) {
      lines.push(
        `... [${omittedEntries} more curated entries omitted — read ${jsonlName} for the full list]`
      )
    }

    return lines.join("\n")
  }

  /**
   * Join context sections, enforcing the aggregate MAX_TOTAL_CONTEXT_CHARS
   * budget. Sections that would overflow the budget are dropped and
   * reported with an explicit omission notice.
   */
  joinContextParts(parts) {
    let result = ""
    let omitted = 0
    for (const part of parts) {
      if (!part) continue
      const candidate = result ? `${result}\n\n${part}` : part
      if (candidate.length > MAX_TOTAL_CONTEXT_CHARS) {
        omitted += 1
        continue
      }
      result = candidate
    }
    if (omitted > 0) {
      result += `\n\n... [${omitted} section(s) omitted — total context cap of ${MAX_TOTAL_CONTEXT_CHARS} chars reached; read the referenced files directly]`
    }
    return result
  }
}

// ============================================================
// Context Collector (for session deduplication)
// ============================================================

class ContextCollector {
  constructor() {
    this.processed = new Set()
  }

  markProcessed(sessionID) {
    this.processed.add(sessionID)
  }

  isProcessed(sessionID) {
    return this.processed.has(sessionID)
  }

  clear(sessionID) {
    this.processed.delete(sessionID)
  }
}

// Singleton instance
export const contextCollector = new ContextCollector()

// Export debug log for plugins
export { debugLog }
