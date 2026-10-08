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

// Unicode 15.0 full case-fold deltas from ECMAScript lowercasing. Identity
// overrides keep newer JS runtimes aligned with Python 3.12's Unicode data.
const CASEFOLD_OVERRIDES = Object.freeze({"\u00b5":"\u03bc","\u00df":"ss","\u0149":"\u02bcn","\u017f":"s","\u01f0":"j\u030c","\u0345":"\u03b9","\u0390":"\u03b9\u0308\u0301","\u03b0":"\u03c5\u0308\u0301","\u03c2":"\u03c3","\u03d0":"\u03b2","\u03d1":"\u03b8","\u03d5":"\u03c6","\u03d6":"\u03c0","\u03f0":"\u03ba","\u03f1":"\u03c1","\u03f5":"\u03b5","\u0587":"\u0565\u0582","\u13a0":"\u13a0","\u13a1":"\u13a1","\u13a2":"\u13a2","\u13a3":"\u13a3","\u13a4":"\u13a4","\u13a5":"\u13a5","\u13a6":"\u13a6","\u13a7":"\u13a7","\u13a8":"\u13a8","\u13a9":"\u13a9","\u13aa":"\u13aa","\u13ab":"\u13ab","\u13ac":"\u13ac","\u13ad":"\u13ad","\u13ae":"\u13ae","\u13af":"\u13af","\u13b0":"\u13b0","\u13b1":"\u13b1","\u13b2":"\u13b2","\u13b3":"\u13b3","\u13b4":"\u13b4","\u13b5":"\u13b5","\u13b6":"\u13b6","\u13b7":"\u13b7","\u13b8":"\u13b8","\u13b9":"\u13b9","\u13ba":"\u13ba","\u13bb":"\u13bb","\u13bc":"\u13bc","\u13bd":"\u13bd","\u13be":"\u13be","\u13bf":"\u13bf","\u13c0":"\u13c0","\u13c1":"\u13c1","\u13c2":"\u13c2","\u13c3":"\u13c3","\u13c4":"\u13c4","\u13c5":"\u13c5","\u13c6":"\u13c6","\u13c7":"\u13c7","\u13c8":"\u13c8","\u13c9":"\u13c9","\u13ca":"\u13ca","\u13cb":"\u13cb","\u13cc":"\u13cc","\u13cd":"\u13cd","\u13ce":"\u13ce","\u13cf":"\u13cf","\u13d0":"\u13d0","\u13d1":"\u13d1","\u13d2":"\u13d2","\u13d3":"\u13d3","\u13d4":"\u13d4","\u13d5":"\u13d5","\u13d6":"\u13d6","\u13d7":"\u13d7","\u13d8":"\u13d8","\u13d9":"\u13d9","\u13da":"\u13da","\u13db":"\u13db","\u13dc":"\u13dc","\u13dd":"\u13dd","\u13de":"\u13de","\u13df":"\u13df","\u13e0":"\u13e0","\u13e1":"\u13e1","\u13e2":"\u13e2","\u13e3":"\u13e3","\u13e4":"\u13e4","\u13e5":"\u13e5","\u13e6":"\u13e6","\u13e7":"\u13e7","\u13e8":"\u13e8","\u13e9":"\u13e9","\u13ea":"\u13ea","\u13eb":"\u13eb","\u13ec":"\u13ec","\u13ed":"\u13ed","\u13ee":"\u13ee","\u13ef":"\u13ef","\u13f0":"\u13f0","\u13f1":"\u13f1","\u13f2":"\u13f2","\u13f3":"\u13f3","\u13f4":"\u13f4","\u13f5":"\u13f5","\u13f8":"\u13f0","\u13f9":"\u13f1","\u13fa":"\u13f2","\u13fb":"\u13f3","\u13fc":"\u13f4","\u13fd":"\u13f5","\u1c80":"\u0432","\u1c81":"\u0434","\u1c82":"\u043e","\u1c83":"\u0441","\u1c84":"\u0442","\u1c85":"\u0442","\u1c86":"\u044a","\u1c87":"\u0463","\u1c88":"\ua64b","\u1c89":"\u1c89","\u1e96":"h\u0331","\u1e97":"t\u0308","\u1e98":"w\u030a","\u1e99":"y\u030a","\u1e9a":"a\u02be","\u1e9b":"\u1e61","\u1e9e":"ss","\u1f50":"\u03c5\u0313","\u1f52":"\u03c5\u0313\u0300","\u1f54":"\u03c5\u0313\u0301","\u1f56":"\u03c5\u0313\u0342","\u1f80":"\u1f00\u03b9","\u1f81":"\u1f01\u03b9","\u1f82":"\u1f02\u03b9","\u1f83":"\u1f03\u03b9","\u1f84":"\u1f04\u03b9","\u1f85":"\u1f05\u03b9","\u1f86":"\u1f06\u03b9","\u1f87":"\u1f07\u03b9","\u1f88":"\u1f00\u03b9","\u1f89":"\u1f01\u03b9","\u1f8a":"\u1f02\u03b9","\u1f8b":"\u1f03\u03b9","\u1f8c":"\u1f04\u03b9","\u1f8d":"\u1f05\u03b9","\u1f8e":"\u1f06\u03b9","\u1f8f":"\u1f07\u03b9","\u1f90":"\u1f20\u03b9","\u1f91":"\u1f21\u03b9","\u1f92":"\u1f22\u03b9","\u1f93":"\u1f23\u03b9","\u1f94":"\u1f24\u03b9","\u1f95":"\u1f25\u03b9","\u1f96":"\u1f26\u03b9","\u1f97":"\u1f27\u03b9","\u1f98":"\u1f20\u03b9","\u1f99":"\u1f21\u03b9","\u1f9a":"\u1f22\u03b9","\u1f9b":"\u1f23\u03b9","\u1f9c":"\u1f24\u03b9","\u1f9d":"\u1f25\u03b9","\u1f9e":"\u1f26\u03b9","\u1f9f":"\u1f27\u03b9","\u1fa0":"\u1f60\u03b9","\u1fa1":"\u1f61\u03b9","\u1fa2":"\u1f62\u03b9","\u1fa3":"\u1f63\u03b9","\u1fa4":"\u1f64\u03b9","\u1fa5":"\u1f65\u03b9","\u1fa6":"\u1f66\u03b9","\u1fa7":"\u1f67\u03b9","\u1fa8":"\u1f60\u03b9","\u1fa9":"\u1f61\u03b9","\u1faa":"\u1f62\u03b9","\u1fab":"\u1f63\u03b9","\u1fac":"\u1f64\u03b9","\u1fad":"\u1f65\u03b9","\u1fae":"\u1f66\u03b9","\u1faf":"\u1f67\u03b9","\u1fb2":"\u1f70\u03b9","\u1fb3":"\u03b1\u03b9","\u1fb4":"\u03ac\u03b9","\u1fb6":"\u03b1\u0342","\u1fb7":"\u03b1\u0342\u03b9","\u1fbc":"\u03b1\u03b9","\u1fbe":"\u03b9","\u1fc2":"\u1f74\u03b9","\u1fc3":"\u03b7\u03b9","\u1fc4":"\u03ae\u03b9","\u1fc6":"\u03b7\u0342","\u1fc7":"\u03b7\u0342\u03b9","\u1fcc":"\u03b7\u03b9","\u1fd2":"\u03b9\u0308\u0300","\u1fd3":"\u03b9\u0308\u0301","\u1fd6":"\u03b9\u0342","\u1fd7":"\u03b9\u0308\u0342","\u1fe2":"\u03c5\u0308\u0300","\u1fe3":"\u03c5\u0308\u0301","\u1fe4":"\u03c1\u0313","\u1fe6":"\u03c5\u0342","\u1fe7":"\u03c5\u0308\u0342","\u1ff2":"\u1f7c\u03b9","\u1ff3":"\u03c9\u03b9","\u1ff4":"\u03ce\u03b9","\u1ff6":"\u03c9\u0342","\u1ff7":"\u03c9\u0342\u03b9","\u1ffc":"\u03c9\u03b9","\ua7cb":"\ua7cb","\ua7cc":"\ua7cc","\ua7ce":"\ua7ce","\ua7d2":"\ua7d2","\ua7d4":"\ua7d4","\ua7da":"\ua7da","\ua7dc":"\ua7dc","\uab70":"\u13a0","\uab71":"\u13a1","\uab72":"\u13a2","\uab73":"\u13a3","\uab74":"\u13a4","\uab75":"\u13a5","\uab76":"\u13a6","\uab77":"\u13a7","\uab78":"\u13a8","\uab79":"\u13a9","\uab7a":"\u13aa","\uab7b":"\u13ab","\uab7c":"\u13ac","\uab7d":"\u13ad","\uab7e":"\u13ae","\uab7f":"\u13af","\uab80":"\u13b0","\uab81":"\u13b1","\uab82":"\u13b2","\uab83":"\u13b3","\uab84":"\u13b4","\uab85":"\u13b5","\uab86":"\u13b6","\uab87":"\u13b7","\uab88":"\u13b8","\uab89":"\u13b9","\uab8a":"\u13ba","\uab8b":"\u13bb","\uab8c":"\u13bc","\uab8d":"\u13bd","\uab8e":"\u13be","\uab8f":"\u13bf","\uab90":"\u13c0","\uab91":"\u13c1","\uab92":"\u13c2","\uab93":"\u13c3","\uab94":"\u13c4","\uab95":"\u13c5","\uab96":"\u13c6","\uab97":"\u13c7","\uab98":"\u13c8","\uab99":"\u13c9","\uab9a":"\u13ca","\uab9b":"\u13cb","\uab9c":"\u13cc","\uab9d":"\u13cd","\uab9e":"\u13ce","\uab9f":"\u13cf","\uaba0":"\u13d0","\uaba1":"\u13d1","\uaba2":"\u13d2","\uaba3":"\u13d3","\uaba4":"\u13d4","\uaba5":"\u13d5","\uaba6":"\u13d6","\uaba7":"\u13d7","\uaba8":"\u13d8","\uaba9":"\u13d9","\uabaa":"\u13da","\uabab":"\u13db","\uabac":"\u13dc","\uabad":"\u13dd","\uabae":"\u13de","\uabaf":"\u13df","\uabb0":"\u13e0","\uabb1":"\u13e1","\uabb2":"\u13e2","\uabb3":"\u13e3","\uabb4":"\u13e4","\uabb5":"\u13e5","\uabb6":"\u13e6","\uabb7":"\u13e7","\uabb8":"\u13e8","\uabb9":"\u13e9","\uabba":"\u13ea","\uabbb":"\u13eb","\uabbc":"\u13ec","\uabbd":"\u13ed","\uabbe":"\u13ee","\uabbf":"\u13ef","\ufb00":"ff","\ufb01":"fi","\ufb02":"fl","\ufb03":"ffi","\ufb04":"ffl","\ufb05":"st","\ufb06":"st","\ufb13":"\u0574\u0576","\ufb14":"\u0574\u0565","\ufb15":"\u0574\u056b","\ufb16":"\u057e\u0576","\ufb17":"\u0574\u056d","\ud803\udd50":"\ud803\udd50","\ud803\udd51":"\ud803\udd51","\ud803\udd52":"\ud803\udd52","\ud803\udd53":"\ud803\udd53","\ud803\udd54":"\ud803\udd54","\ud803\udd55":"\ud803\udd55","\ud803\udd56":"\ud803\udd56","\ud803\udd57":"\ud803\udd57","\ud803\udd58":"\ud803\udd58","\ud803\udd59":"\ud803\udd59","\ud803\udd5a":"\ud803\udd5a","\ud803\udd5b":"\ud803\udd5b","\ud803\udd5c":"\ud803\udd5c","\ud803\udd5d":"\ud803\udd5d","\ud803\udd5e":"\ud803\udd5e","\ud803\udd5f":"\ud803\udd5f","\ud803\udd60":"\ud803\udd60","\ud803\udd61":"\ud803\udd61","\ud803\udd62":"\ud803\udd62","\ud803\udd63":"\ud803\udd63","\ud803\udd64":"\ud803\udd64","\ud803\udd65":"\ud803\udd65","\ud81b\udea0":"\ud81b\udea0","\ud81b\udea1":"\ud81b\udea1","\ud81b\udea2":"\ud81b\udea2","\ud81b\udea3":"\ud81b\udea3","\ud81b\udea4":"\ud81b\udea4","\ud81b\udea5":"\ud81b\udea5","\ud81b\udea6":"\ud81b\udea6","\ud81b\udea7":"\ud81b\udea7","\ud81b\udea8":"\ud81b\udea8","\ud81b\udea9":"\ud81b\udea9","\ud81b\udeaa":"\ud81b\udeaa","\ud81b\udeab":"\ud81b\udeab","\ud81b\udeac":"\ud81b\udeac","\ud81b\udead":"\ud81b\udead","\ud81b\udeae":"\ud81b\udeae","\ud81b\udeaf":"\ud81b\udeaf","\ud81b\udeb0":"\ud81b\udeb0","\ud81b\udeb1":"\ud81b\udeb1","\ud81b\udeb2":"\ud81b\udeb2","\ud81b\udeb3":"\ud81b\udeb3","\ud81b\udeb4":"\ud81b\udeb4","\ud81b\udeb5":"\ud81b\udeb5","\ud81b\udeb6":"\ud81b\udeb6","\ud81b\udeb7":"\ud81b\udeb7","\ud81b\udeb8":"\ud81b\udeb8"})

function unicodeCasefold(value) {
  return Array.from(value, char => CASEFOLD_OVERRIDES[char] ?? char.toLowerCase()).join("")
}

function visibleIdentityCandidates(taskRef) {
  const candidates = [taskRef]
  const match = taskRef.match(/^\d{2}-\d{2}-(.+)$/)
  if (match) candidates.push(match[1])
  return candidates
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

function pathWithin(root, candidate) {
  const rel = relative(root, candidate)
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"))
}

function bindingExists(root, candidate) {
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
  const bytes = readFileSync(file)
  if (!isUtf8(bytes)) throw new Error("binding_encoding_error")
  const data = JSON.parse(bytes.toString("utf-8"))
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_binding")
  return data
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
      return { data, root, facts }
    }
    if (facts.common) {
      const offset = relative(facts.gitRoot, root)
      for (const worktree of [...new Set(facts.roots)].sort()) {
        const candidate = join(worktree, offset)
        const workflow = join(candidate, ".trellis")
        if (!bindingExists(candidate, workflow)) continue
        const workspace = validateWorkspace(candidate, facts)
        const obsolete = join(
          workspace, ".trellis", ".runtime", "sessions", `${contextKey}.json`,
        )
        if (bindingExists(workspace, obsolete)) {
          throw new Error(`unsupported_binding_schema: ${obsolete}; run task.py start`)
        }
      }
    }
    return null
  }

  _validateBinding({ data, root, facts }) {
    if (data.schema_version !== 2) throw new Error("unsupported_schema")
    const keys = Object.keys(data).sort()
    if (JSON.stringify(keys) !== JSON.stringify(["lifecycle_generation", "schema_version", "task_id"])) {
      throw new Error("invalid_binding_fields")
    }
    if (typeof data.task_id !== "string" || !data.task_id.trim()) throw new Error("invalid_task_id")
    if (!Number.isInteger(data.lifecycle_generation) || data.lifecycle_generation < 0) {
      throw new Error("invalid_lifecycle_generation")
    }
    const requestedFold = unicodeCasefold(data.task_id)
    const offset = facts.common ? relative(facts.gitRoot, root) : ""
    const workspaces = facts.common
      ? [...new Set(facts.roots.map(worktree => join(worktree, offset)))]
      : [root]
    const exact = []
    const mismatches = []
    const casefoldConflicts = []
    for (const candidate of workspaces) {
      const workflow = join(candidate, ".trellis")
      if (!bindingExists(candidate, workflow)) continue
      const workspace = validateWorkspace(candidate, facts)
      const tasksDir = join(workspace, ".trellis", "tasks")
      if (!bindingExists(workspace, tasksDir)) continue
      let names
      try {
        names = readdirSync(tasksDir).sort()
      } catch (error) {
        throw new Error(`task_inventory_failed: ${error.message}`)
      }
      for (const name of names) {
        if (name === "archive") continue
        const taskDir = join(tasksDir, name)
        let taskStat
        try { taskStat = statSync(taskDir) } catch { continue }
        if (!taskStat.isDirectory()) continue
        const taskFile = join(taskDir, "task.json")
        const visibleMatch = visibleIdentityCandidates(name)
          .some(value => unicodeCasefold(value) === requestedFold)
        let metadata
        try {
          metadata = readBinding(workspace, taskFile)
        } catch (error) {
          if (visibleMatch) throw new Error(`task_metadata_invalid: ${taskFile}: ${error.message}`)
          continue
        }
        if (typeof metadata.id !== "string" || !metadata.id.trim()) {
          if (visibleMatch) throw new Error(`invalid_task_id: ${taskFile}`)
          continue
        }
        if (unicodeCasefold(metadata.id) !== requestedFold) continue
        if (metadata.id !== data.task_id) {
          casefoldConflicts.push(`${taskDir}=${JSON.stringify(metadata.id)}`)
          continue
        }
        const generation = Object.hasOwn(metadata, "lifecycle_generation")
          ? metadata.lifecycle_generation : 0
        if (!Number.isInteger(generation) || generation < 0) {
          throw new Error(`invalid_lifecycle_generation: ${taskFile}`)
        }
        const resolved = {
          taskPath: relative(workspace, taskDir).split("\\").join("/"),
          taskWorkspaceRoot: workspace,
          resolvedTaskPath: taskDir,
          repositoryCommonDir: facts.common,
        }
        if (generation === data.lifecycle_generation) exact.push(resolved)
        else mismatches.push(`${taskDir}=${generation}`)
      }
    }
    if (casefoldConflicts.length) throw new Error(`task_id_casefold_collision: ${casefoldConflicts.join(", ")}`)
    if (exact.length > 1 || (exact.length && mismatches.length)) {
      const local = exact.filter(item => realpathSync(item.taskWorkspaceRoot) === realpathSync(this.directory))
      if (local.length === 1) return { ...local[0] }
      throw new Error("ambiguous_task_identity")
    }
    if (!exact.length && mismatches.length) throw new Error(`stale_lifecycle_generation: ${mismatches.join(", ")}`)
    if (!exact.length) throw new Error("stale_task_identity")
    return {
      ...exact[0],
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
    const root = realpathSync(this.directory)
    const facts = repositoryFacts(root)
    validateWorkspace(root, facts)
    const sessionsDir = facts.common
      ? join(facts.common, "trellis", "sessions")
      : join(root, ".trellis", ".runtime", "sessions")
    if (!bindingExists(root, sessionsDir)) return null

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
    const file = join(sessionsDir, files[0])
    const data = readBinding(root, file)
    const active = this._validateBinding({ data, root, facts })
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
      const lexical = relative(tasksRoot, candidate).split("\\").join("/")
      if (!lexical || lexical.split("/").length !== 1 || lexical === ".." || lexical === "archive" || isAbsolute(lexical)) return null
      const actualRoot = realpathSync(tasksRoot)
      const actual = realpathSync(candidate)
      const actualRef = relative(actualRoot, actual).split("\\").join("/")
      if (!actualRef || actualRef.split("/").length !== 1 || !pathWithin(actualRoot, actual) || actualRef === "archive") return null
      if (!statSync(actual).isDirectory()) return null
      const canonical = join(tasksRoot, actualRef)
      return canonical
    } catch {
      return null
    }
  }

  // ============================================================
  // File Reading Utilities
  // ============================================================

  isActivePath(filePath) {
    try {
      realpathSync(filePath)
      return true
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
