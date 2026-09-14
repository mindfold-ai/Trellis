/**
 * Trellis Context Manager
 *
 * Utility class for OpenCode plugins providing file reading,
 * JSONL parsing, and context building capabilities.
 */

import { existsSync, readFileSync, appendFileSync, readdirSync, realpathSync, statSync, lstatSync } from "fs"
import { dirname, isAbsolute, join, relative, resolve } from "path"
import { platform } from "os"
import { execSync, execFileSync } from "child_process"
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
  const text = readFileBytes(repoRoot, join(repoRoot, ".trellis", "config.yaml"))?.toString("utf-8")
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

function isHistoricalPath(filePath, basePath) {
  const absolute = resolve(filePath)
  const protectedName = name => [".developer", "workspace", "agent-traces"].includes(name) || name.startsWith(".backup-")
  const parts = absolute.split("\\").join("/").split("/")
  if (parts.some((name, index) => name === ".trellis" && protectedName(parts[index + 1] || ""))) return true
  if (basePath !== undefined) {
    try {
      const workflowRoot = realpathSync(join(basePath, ".trellis"))
      const first = relative(workflowRoot, absolute).split("\\").join("/").split("/")[0]
      return protectedName(first)
    } catch {
      return false
    }
  }
  return false
}

function pathWithin(root, candidate) {
  const rel = relative(root, candidate)
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"))
}

// Resolve existing ancestors too: missing descendants of historical aliases
// must be rejected before an existence probe or content read.
function activeStoragePath(root, candidate) {
  if (isHistoricalPath(candidate, root)) throw new Error("historical_path")
  let parent = resolve(candidate)
  while (true) {
    try {
      lstatSync(parent)
      const actual = resolve(realpathSync(parent), relative(parent, resolve(candidate)))
      if (isHistoricalPath(actual, root)) throw new Error("historical_path")
      return candidate
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      const next = dirname(parent)
      if (next === parent) throw error
      parent = next
    }
  }
}

function bindingExists(root, candidate) {
  activeStoragePath(root, candidate)
  try {
    lstatSync(candidate)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

function gitOutput(root, args) {
  const excluded = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"])
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !excluded.has(key)))
  env.LC_ALL = "C"
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"], env,
  })
}

function commonDir(root) {
  const value = gitOutput(root, ["rev-parse", "--git-common-dir"]).replace(/[\r\n]+$/, "")
  return realpathSync(resolve(root, value))
}

function repositoryFacts(root) {
  let common
  try {
    common = commonDir(root)
  } catch (error) {
    // A failed Git probe in an apparent checkout is not a non-Git project.
    for (let parent = root; ; parent = dirname(parent)) {
      if (bindingExists(root, join(parent, ".git"))) throw new Error("git_discovery_failed")
      if (dirname(parent) === parent) break
    }
    if (!String(error.stderr || "").includes("not a git repository")) throw new Error("git_discovery_failed")
    return { common: null, roots: [root], gitRoot: root }
  }
  const roots = gitOutput(root, ["worktree", "list", "--porcelain", "-z"])
    .split("\0").filter(field => field.startsWith("worktree ")).map(field => {
      const candidate = field.slice("worktree ".length)
      try { return realpathSync(candidate) } catch { return null }
    }).filter(Boolean)
  const gitRoot = realpathSync(gitOutput(root, ["rev-parse", "--show-toplevel"]).replace(/[\r\n]+$/, ""))
  if (!roots.includes(gitRoot) || !pathWithin(gitRoot, root)) throw new Error("unregistered_workspace")
  return { common, roots, gitRoot }
}

function validateWorkspace(root, facts) {
  const actual = realpathSync(root)
  activeStoragePath(actual, join(actual, ".trellis"))
  if (!statSync(join(actual, ".trellis")).isDirectory()) throw new Error("invalid_workspace")
  if (!facts.common) {
    if (actual !== facts.roots[0]) throw new Error("workspace_mismatch")
    return actual
  }
  const gitRoot = realpathSync(gitOutput(actual, ["rev-parse", "--show-toplevel"]).replace(/[\r\n]+$/, ""))
  if (!facts.roots.includes(gitRoot) || !pathWithin(gitRoot, actual)) throw new Error("unregistered_workspace")
  if (commonDir(actual) !== facts.common) throw new Error("common_dir_mismatch")
  return actual
}

function readBinding(root, file) {
  activeStoragePath(root, file)
  const bytes = readFileSync(file)
  if (!isUtf8(bytes)) throw new Error("binding_encoding_error")
  const data = JSON.parse(bytes.toString("utf-8"))
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_binding")
  return data
}

/** Read raw file bytes, return null if file doesn't exist. */
function readFileBytes(basePath, filePath) {
  const fullPath = isAbsolute(filePath) ? filePath : join(basePath, filePath)
  if (isHistoricalPath(fullPath)) return null
  try {
    if (isHistoricalPath(realpathSync(fullPath), basePath)) return null
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
  if (isHistoricalPath(fullPath)) return blocks

  let files
  try {
    if (isHistoricalPath(realpathSync(fullPath), basePath)) return blocks
    if (!statSync(fullPath).isDirectory()) return blocks
    files = readdirSync(fullPath)
      .filter(f => f.endsWith(".md") && !isHistoricalPath(join(fullPath, f)) && statSync(join(fullPath, f)).isFile())
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

  // OpenCode exports no session identity into the environment: no OPENCODE_*
  // name in the 1.17.18 binary or the 1.18.13 source carries one. The plugin
  // hook input is the only source, and the `export TRELLIS_CONTEXT_ID=` prefix
  // this plugin adds to Bash commands is the only way that identity reaches a
  // child process. TRELLIS_CONTEXT_ID is honored here so a nested Trellis run
  // inherits its parent's key; do not add platform-native env names next to it
  // without evidence a vendor sets them.
  getContextKey(platformInput = null) {
    const override = stringValue(process.env.TRELLIS_CONTEXT_ID)
    if (override) {
      return sanitizeKey(override) || hashValue(override)
    }

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
    const binding = this._readSessionBinding(contextKey)
    if (!binding) return null
    this._validateBinding(binding)
    return binding.data
  }

  _readSessionBinding(contextKey) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(contextKey || "")) throw new Error("invalid_context_key")
    const root = realpathSync(this.directory)
    const facts = repositoryFacts(root)
    validateWorkspace(root, facts)
    const store = facts.common
      ? join(facts.common, "trellis", "sessions")
      : join(root, ".trellis", ".runtime", "sessions")
    const current = join(store, `${contextKey}.json`)
    if (bindingExists(root, current)) {
      const data = readBinding(root, current)
      return { data, root, facts, legacy: facts.common === null, versioned: facts.common !== null || "schema_version" in data }
    }
    if (!facts.common) return null

    const offset = relative(facts.gitRoot, root)
    const candidates = []
    const legacyRoots = new Set(facts.roots.flatMap(worktree => [worktree, join(worktree, offset)]))
    for (const legacyRoot of legacyRoots) {
      const file = join(legacyRoot, ".trellis", ".runtime", "sessions", `${contextKey}.json`)
      activeStoragePath(root, file)
      if (!bindingExists(legacyRoot, file)) continue
      validateWorkspace(legacyRoot, facts)
      const data = readBinding(legacyRoot, file)
      const binding = { data, root: legacyRoot, facts, legacy: true, versioned: "schema_version" in data }
      this._validateBinding(binding)
      candidates.push(binding)
    }
    if (candidates.length > 1) throw new Error("ambiguous_legacy_binding")
    return candidates[0] || null
  }

  _validateBinding({ data, root, facts, versioned, legacy }) {
    let workspace = root
    if (versioned) {
      if (data.schema_version !== 1) throw new Error("unsupported_schema")
      if (data.repository_common_dir !== facts.common) throw new Error("common_dir_mismatch")
      if (typeof data.task_workspace_root !== "string" || !isAbsolute(data.task_workspace_root)) throw new Error("invalid_workspace")
      workspace = validateWorkspace(data.task_workspace_root, facts)
      if (legacy && workspace !== root) throw new Error("foreign_legacy_workspace")
    }
    if (typeof data.current_task !== "string" || !data.current_task.trim() || isAbsolute(data.current_task)) throw new Error("invalid_task_path")
    const ref = this.normalizeTaskRef(data.current_task)
    const taskContext = new TrellisContext(workspace)
    const taskDir = taskContext.resolveTaskDir(ref)
    if (!taskDir) throw new Error("invalid_task_path")
    const metadata = readBinding(workspace, join(taskDir, "task.json"))
    if (Object.keys(metadata).length === 0) throw new Error("empty_task_metadata")
    return {
      taskPath: relative(workspace, taskDir).split("\\").join("/"),
      taskWorkspaceRoot: workspace,
      resolvedTaskPath: taskDir,
      repositoryCommonDir: facts.common,
    }
  }

  /** Exact identity only. A known key miss or error never borrows a session. */
  getActiveTask(platformInput = null) {
    const contextKey = this.getContextKey(platformInput)
    const empty = {
      taskPath: null, source: "none", stale: false, error: null, contextKey,
      invocationRoot: resolve(this.directory), repositoryCommonDir: null,
      taskWorkspaceRoot: null, resolvedTaskPath: null,
    }
    try {
      const facts = repositoryFacts(realpathSync(this.directory))
      validateWorkspace(this.directory, facts)
      empty.repositoryCommonDir = facts.common
      if (!contextKey) return empty
      const binding = this._readSessionBinding(contextKey)
      if (!binding) return empty
      return { ...empty, ...this._validateBinding(binding), source: `session:${contextKey}` }
    } catch (error) {
      return { ...empty, source: contextKey ? `session:${contextKey}` : "none", stale: true, error: error.message }
    }
  }

  /**
   * Mirror of Python `_resolve_single_session_fallback`. Returns the task
   * pointed at by the sole session runtime file when exactly one exists,
   * else null.
   */
  _resolveSingleSessionFallback() {
    if (this.getContextKey()) return null
    const sessionsDir = join(this.directory, ".trellis", ".runtime", "sessions")
    if (!bindingExists(this.directory, sessionsDir)) return null

    let files
    try {
      files = readdirSync(sessionsDir)
        .filter(name => name.endsWith(".json"))
        .sort()
    } catch (error) {
      throw new Error(`binding_read_failed: ${error.message}`)
    }
    if (files.length !== 1) return null

    const fallbackKey = files[0].replace(/\.json$/, "")
    const root = realpathSync(this.directory)
    const facts = repositoryFacts(root)
    validateWorkspace(root, facts)
    let file = join(sessionsDir, files[0])
    let legacy = true
    if (facts.common) {
      const commonFile = join(facts.common, "trellis", "sessions", files[0])
      if (bindingExists(root, commonFile)) {
        file = commonFile
        legacy = false
      }
    }
    const data = readBinding(root, file)
    const active = this._validateBinding({ data, root, facts, legacy, versioned: !legacy || "schema_version" in data })
    if (active.taskWorkspaceRoot !== root) return null
    return {
      ...active,
      source: `session-fallback:${fallbackKey}`,
      contextKey: fallbackKey, invocationRoot: root, stale: false, error: null,
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

  /**
   * Return `candidate` when it lands inside the project, else null.
   *
   * A task ref is not always something the user typed. `task.py` now refuses
   * to store one that leaves the project, but a session file written before
   * that fix can still hold one, and `trellis update` does not rewrite session
   * files — so a poisoned pointer outlives the upgrade that closed the writer.
   * Both sides are resolved so a task directory symlinked outside is refused
   * too, but the original `candidate` is returned on success: callers build
   * paths relative to `this.directory`, and handing them a realpath would break
   * that whenever the project itself sits behind a symlink.
   */
  containInProject(candidate) {
    try {
      const rel = relative(realpathSync(this.directory), realpathSync(candidate))
      if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
        return null
      }
      return candidate
    } catch {
      return null
    }
  }

  resolveTaskDir(taskRef) {
    const normalized = this.normalizeTaskRef(taskRef)
    if (!normalized) {
      return null
    }

    const candidate = isAbsolute(normalized)
      ? normalized
      : normalized.startsWith(".trellis/")
        ? join(this.directory, normalized)
        : join(this.directory, ".trellis", "tasks", normalized)

    try {
      const tasksRoot = join(this.directory, ".trellis", "tasks")
      activeStoragePath(this.directory, tasksRoot)
      activeStoragePath(this.directory, candidate)
      const lexical = relative(tasksRoot, candidate).split("\\").join("/")
      if (!lexical || lexical.split("/").length !== 1 || lexical === ".." || lexical === "archive" || isAbsolute(lexical)) return null
      const actualRoot = realpathSync(tasksRoot)
      const actual = realpathSync(candidate)
      const actualRef = relative(actualRoot, actual).split("\\").join("/")
      if (!actualRef || actualRef.split("/").length !== 1 || !pathWithin(actualRoot, actual) || actualRef === "archive") return null
      if (!statSync(actual).isDirectory()) return null
      const canonical = join(tasksRoot, actualRef)
      activeStoragePath(this.directory, join(canonical, "task.json"))
      return canonical
    } catch {
      return null
    }
  }

  // ============================================================
  // File Reading Utilities
  // ============================================================

  isActivePath(filePath) {
    if (isHistoricalPath(filePath)) return false
    try {
      return !isHistoricalPath(realpathSync(filePath), this.directory)
    } catch {
      return false
    }
  }

  readFile(filePath) {
    if (!this.isActivePath(filePath)) return null
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
