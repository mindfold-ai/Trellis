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
import { Buffer, isUtf8 } from "buffer"
import process from "process"

const PYTHON_CMD = platform() === "win32" ? "python" : "python3"
// Debug logging
const DEBUG_LOG = "/tmp/trellis-plugin-debug.log"

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

// ============================================================
// Context Injection Limits (issue #441)
//
// Notice text and behavior mirrored byte-for-byte from the shared-hooks
// Python sub-agent context injection hook and the Pi extension. Changing
// wording here requires changing it there too.
// ============================================================

const DEFAULT_CONTEXT_INJECTION_LIMITS = {
  max_file_bytes: 32768,
  max_artifact_bytes: 65536,
  max_total_bytes: 131072,
}

/**
 * Truncate `buf` to at most `cap` bytes without splitting a UTF-8
 * multi-byte sequence. `cap <= 0` means "no limit".
 */
function truncateUtf8(buf, cap) {
  if (cap <= 0 || buf.length <= cap) return buf
  let i = cap
  // Back off over continuation bytes (10xxxxxx) to find the lead byte.
  while (i > 0 && (buf[i - 1] & 0xc0) === 0x80) i--
  if (i === 0) return Buffer.alloc(0)
  const lead = buf[i - 1]
  if (lead & 0x80) {
    let seqLen = 1
    if ((lead & 0xe0) === 0xc0) seqLen = 2
    else if ((lead & 0xf0) === 0xe0) seqLen = 3
    else if ((lead & 0xf8) === 0xf0) seqLen = 4
    // Drop the lead byte too if its full sequence didn't fit.
    if (i - 1 + seqLen > cap) i--
  }
  return buf.subarray(0, i)
}

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
    if (ch === "#" && (idx === 0 || /\s/.test(value[idx - 1]))) {
      return value.slice(0, idx)
    }
  }
  return value
}

function unquoteYaml(s) {
  if (s.length >= 2 && s[0] === s[s.length - 1] && (s[0] === '"' || s[0] === "'")) {
    return s.slice(1, -1)
  }
  return s
}

/**
 * Line-based parser for ONLY the `context_injection:` block of
 * `.trellis/config.yaml`. Not a general YAML parser — mirrors
 * `common.config.get_context_injection_limits()` semantics for this
 * section only (missing keys keep the default; invalid/negative values
 * fall back to the default for that key with a debugLog warning).
 */
function readContextInjectionLimits(repoRoot) {
  const limits = { ...DEFAULT_CONTEXT_INJECTION_LIMITS }
  let text = null
  try {
    text = readFileSync(join(repoRoot, ".trellis", "config.yaml"), "utf-8")
  } catch {
    return limits
  }
  if (!text) return limits

  let inSection = false
  let sectionIndent = -1
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!inSection) {
      if (/^context_injection\s*:\s*(#.*)?$/.test(trimmed)) {
        inSection = true
        sectionIndent = rawLine.length - rawLine.trimStart().length
      }
      continue
    }
    if (!trimmed || trimmed.startsWith("#")) continue
    const indent = rawLine.length - rawLine.trimStart().length
    if (indent <= sectionIndent) break
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    if (!(key in limits)) continue
    const raw = unquoteYaml(stripInlineComment(m[2]).trim()).trim()
    if (!/^-?\d+$/.test(raw) || parseInt(raw, 10) < 0) {
      // invalid/negative -> keep default (Python warns on stderr)
      debugLog("context", `invalid context_injection.${key} value: ${raw}; using default ${limits[key]}`)
      continue
    }
    limits[key] = parseInt(raw, 10)
  }
  return limits
}

/** Tracks the running total of bytes emitted into the sub-agent context. */
class ContextBudget {
  constructor(maxTotalBytes) {
    this.maxTotalBytes = maxTotalBytes
    this.used = 0
  }

  hasRoom(size) {
    if (this.maxTotalBytes <= 0) return true
    return this.used + size <= this.maxTotalBytes
  }

  add(size) {
    this.used += size
  }
}

function truncateNotice(path, cap) {
  return `\n[Trellis: truncated at ${cap} bytes — read ${path} for the full content]`
}

function isBinaryContent(data) {
  return data.includes(0) || !isUtf8(data)
}

function binaryNotice(path, size, reason) {
  return `[Trellis: not inlined (binary file) — ${path} (${size} bytes): ${reason}]`
}

function indexNotice(path, size, reason) {
  return `[Trellis: not inlined (total context limit reached) — ${path} (${size} bytes): ${reason}]`
}

/**
 * Return an inlined `=== header ===` block, or degrade to an index
 * notice once the total context budget is exhausted.
 */
function budgetedBlock(budget, header, plainPath, content, reason, sizeForIndex) {
  const block = `=== ${header} ===\n${content}`
  const blockBytes = Buffer.byteLength(block, "utf-8")
  if (!budget.hasRoom(blockBytes)) {
    const notice = indexNotice(plainPath, sizeForIndex, reason)
    budget.add(Buffer.byteLength(notice, "utf-8"))
    return notice
  }
  budget.add(blockBytes)
  return block
}

/** Read raw file bytes, return null if file doesn't exist. */
function readFileBytes(basePath, filePath) {
  const fullPath = isAbsolute(filePath) ? filePath : join(basePath, filePath)
  try {
    if (!statSync(fullPath).isFile()) return null
  } catch {
    return null
  }
  try {
    return readFileSync(fullPath)
  } catch {
    return null
  }
}

/** Read a JSONL-referenced file, apply the per-file cap, then budget it. */
function materializeFile(basePath, filePath, reason, limits, budget) {
  const data = readFileBytes(basePath, filePath)
  if (data === null) return null

  const size = data.length
  if (isBinaryContent(data)) {
    const notice = binaryNotice(filePath, size, reason)
    budget.add(Buffer.byteLength(notice, "utf-8"))
    return notice
  }
  const cap = limits.max_file_bytes
  const truncated = truncateUtf8(data, cap)
  let content = truncated.toString("utf-8")
  if (truncated.length < size) content += truncateNotice(filePath, cap)

  return budgetedBlock(budget, filePath, filePath, content, reason, size)
}

/**
 * Read all .md files in a directory, applying the same per-file and
 * total caps as a single-file JSONL entry.
 */
function materializeDirectory(basePath, dirPath, reason, limits, budget, maxFiles = 20) {
  const blocks = []
  const fullPath = isAbsolute(dirPath) ? dirPath : join(basePath, dirPath)

  let files
  try {
    if (!statSync(fullPath).isDirectory()) return blocks
    files = readdirSync(fullPath)
      .filter(f => f.endsWith(".md") && statSync(join(fullPath, f)).isFile())
      .sort()
  } catch {
    return blocks
  }

  for (const filename of files.slice(0, maxFiles)) {
    const relativePath = join(dirPath, filename)
    const block = materializeFile(basePath, relativePath, reason, limits, budget)
    if (block) blocks.push(block)
  }
  return blocks
}

/**
 * Read a task artifact (prd/design/implement.md), apply the per-artifact
 * cap, then budget it.
 */
function materializeArtifact(basePath, filePath, headerLabel, reason, limits, budget) {
  const data = readFileBytes(basePath, filePath)
  if (data === null) return null

  const size = data.length
  const cap = limits.max_artifact_bytes
  const truncated = truncateUtf8(data, cap)
  let content = truncated.toString("utf-8")
  if (truncated.length < size) content += truncateNotice(filePath, cap)

  return budgetedBlock(budget, headerLabel, filePath, content, reason, size)
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
  // JSONL Reading
  // ============================================================

  /**
   * Read a JSONL file and materialize referenced files/directories into
   * context blocks, applying per-file caps and the shared total budget
   * (issue #441). Mirrors Python `_materialize_jsonl_entries`.
   * Supports:
   *   {"file": "path/to/file.md", "reason": "..."}
   *   {"file": "path/to/dir/", "type": "directory", "reason": "..."}
   *
   * Missing referenced files are skipped silently (Python `_materialize_file`
   * returns None for them).
   */
  readJsonlWithFiles(jsonlPath, limits, budget) {
    const blocks = []
    const content = this.readFile(jsonlPath)
    if (!content) return blocks

    for (const line of content.split("\n")) {
      if (!line.trim()) continue
      try {
        const item = JSON.parse(line)
        const file = item.file || item.path
        const entryType = item.type || "file"
        const reason = item.reason || "-"

        if (!file) continue

        if (entryType === "directory") {
          blocks.push(...materializeDirectory(this.directory, file, reason, limits, budget))
        } else {
          const block = materializeFile(this.directory, file, reason, limits, budget)
          if (block) blocks.push(block)
        }
      } catch {
        // Ignore parse errors for individual lines
      }
    }
    return blocks
  }

  buildContextFromEntries(blocks) {
    return blocks.join("\n\n")
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

// Context injection limits (issue #441) — exported for plugins and tests
export {
  DEFAULT_CONTEXT_INJECTION_LIMITS,
  truncateUtf8,
  readContextInjectionLimits,
  ContextBudget,
  materializeFile,
  materializeDirectory,
  materializeArtifact,
}
