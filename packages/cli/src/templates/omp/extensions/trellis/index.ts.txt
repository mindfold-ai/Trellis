import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync, readSync } from "node:fs";
import { join, dirname, basename, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Project root detection
// ---------------------------------------------------------------------------

function findProjectRoot(startDir: string): string | null {
   let current = startDir;
   while (true) {
      if (existsSync(join(current, ".trellis"))) return current;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
   }
   return null;
}

// ---------------------------------------------------------------------------
// Session identity helpers (mirrors Python _sanitize_key / _hash_value / _context_key)
// ---------------------------------------------------------------------------

function sanitizeKey(raw: string): string {
   const safe = raw.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
   return safe ? safe.slice(0, 160) : "";
}

function hashValue(raw: string): string {
   return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function buildContextKey(platformName: string, kind: string, value: string): string {
   if (kind === "transcript") {
      return `${platformName}_transcript_${hashValue(value)}`;
   }
   const safeValue = sanitizeKey(value);
   return safeValue ? `${platformName}_${safeValue}` : `${platformName}_${hashValue(value)}`;
}

function deriveContextKey(ctx?: { sessionManager?: { getSessionId?: () => string | undefined; getSessionFile?: () => string | undefined } }): string | null {
   const sessionId = ctx?.sessionManager?.getSessionId?.();
   if (sessionId) {
      return buildContextKey("omp", "session", sessionId);
   }
   const sessionFile = ctx?.sessionManager?.getSessionFile?.();
   if (sessionFile) {
      return buildContextKey("omp", "transcript", sessionFile);
   }
   const override = process.env.TRELLIS_CONTEXT_ID?.trim();
   return override ? sanitizeKey(override) || hashValue(override) : null;
}

function isInsideRoot(root: string, candidate: string): boolean {
   const rel = relative(root, candidate);
   return rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
}

// ---------------------------------------------------------------------------
// Trusted context roots (mirrors packages/cli/src/commands/channel/context-trust.ts;
// standalone copy since templates don't import from the CLI package).
// ---------------------------------------------------------------------------

const AUTO_TRUST_ENTRIES = ["tasks", "workspace"];

function stripTrustValue(s: string): string {
   return s.trim().replace(/\s*#.*$/, "").trim().replace(/^['"]|['"]$/g, "");
}

function parseChannelTrustSection(content: string): { trustedDirs: string[]; autoTrustSymlinks?: boolean } {
   const lines = content.split("\n");
   const trustedDirs: string[] = [];
   let autoTrustSymlinks: boolean | undefined;
   let inChannel = false;
   let inList = false;

   for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      const trimmed = line.trimEnd();
      if (trimmed.trim().startsWith("#")) continue;

      if (/^channel:\s*$/.test(trimmed)) {
         inChannel = true;
         inList = false;
         continue;
      }
      if (!inChannel) continue;

      if (trimmed.trim() !== "" && /^\S/.test(line)) {
         inChannel = false;
         inList = false;
         continue;
      }
      if (trimmed.trim() === "") continue;

      if (inList) {
         const item = trimmed.match(/^ {4}-\s*(.+)$/);
         if (item) {
            const val = stripTrustValue(item[1]!);
            if (val) trustedDirs.push(val);
            continue;
         }
         inList = false;
      }

      if (/^ {2}trusted_context_dirs:\s*$/.test(trimmed)) {
         inList = true;
         continue;
      }

      const boolMatch = trimmed.match(/^ {2}auto_trust_trellis_symlinks:\s*(.+)$/);
      if (boolMatch) {
         const val = stripTrustValue(boolMatch[1]!).toLowerCase();
         if (val === "false") autoTrustSymlinks = false;
         else if (val === "true") autoTrustSymlinks = true;
         else process.stderr.write(`[channel] channel.auto_trust_trellis_symlinks: invalid value '${val}', ignoring\n`);
         continue;
      }
   }

   return { trustedDirs, autoTrustSymlinks };
}

function resolveTrustedRoots(projectRoot: string): string[] {
   const configPath = join(projectRoot, ".trellis", "config.yaml");
   let config: { trustedDirs: string[]; autoTrustSymlinks?: boolean } = { trustedDirs: [] };
   if (existsSync(configPath)) {
      try {
         config = parseChannelTrustSection(readFileSync(configPath, "utf-8"));
      } catch {
         // ignore
      }
   }

   const roots: string[] = [];
   for (const entry of config.trustedDirs) {
      try {
         roots.push(realpathSync(resolve(projectRoot, entry)));
      } catch {
         // entry not found or invalid — skip
      }
   }

   if (config.autoTrustSymlinks !== false) {
      for (const entryName of AUTO_TRUST_ENTRIES) {
         const entryPath = join(projectRoot, ".trellis", entryName);
         try {
            if (lstatSync(entryPath).isSymbolicLink()) {
               roots.push(realpathSync(entryPath));
            }
         } catch {
            // missing / broken symlink — nothing to trust
         }
      }
   }

   return [...new Set(roots)];
}

function resolveProjectFile(
   projectRoot: string,
   file: string,
   trustedRoots: string[],
): string | null {
   try {
      const rootReal = realpathSync(projectRoot);
      const targetReal = realpathSync(resolve(projectRoot, file));
      if (isInsideRoot(rootReal, targetReal)) return targetReal;
      if (trustedRoots.some((root) => isInsideRoot(root, targetReal))) return targetReal;
      return null;
   } catch {
      return null;
   }
}

function displayProjectPath(projectRoot: string, filePath: string, taskDir?: string): string {
   const direct = relative(projectRoot, filePath).split("\\").join("/");
   if (direct && !direct.startsWith("../") && !isAbsolute(direct)) return direct;
   if (taskDir) {
      const taskRelative = relative(projectRoot, taskDir).split("\\").join("/");
      const taskLabel = taskRelative && !taskRelative.startsWith("../") && !isAbsolute(taskRelative)
         ? taskRelative
         : `.trellis/tasks/${basename(taskDir)}`;
      const withinTask = relative(taskDir, filePath).split("\\").join("/");
      if (withinTask && !withinTask.startsWith("../") && !isAbsolute(withinTask)) {
         return `${taskLabel}/${withinTask}`;
      }
   }
   try {
      return relative(realpathSync(projectRoot), realpathSync(filePath)).split("\\").join("/");
   } catch {
      return relative(projectRoot, filePath).split("\\").join("/");
   }
}

// ---------------------------------------------------------------------------
// Active task resolution
// ---------------------------------------------------------------------------

function resolveActiveTaskStatus(
   projectRoot: string,
   contextKey: string | null,
): { status: string; taskDir: string | null; taskTitle: string | null } {
   const sessionsDir = join(projectRoot, ".trellis", ".runtime", "sessions");
   if (!existsSync(sessionsDir)) return { status: "no_task", taskDir: null, taskTitle: null };

   // --- 通过 context key 解析 session 文件 ---
   let sessionFilePath: string | null = null;

   if (contextKey) {
      const candidate = join(sessionsDir, `${contextKey}.json`);
      if (existsSync(candidate)) {
         sessionFilePath = candidate;
      } else {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
   } else {
      // No identity: use single-session fallback only when there is exactly one session file.
      let sessionFiles: string[];
      try {
         sessionFiles = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
      } catch {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
      if (sessionFiles.length === 1) {
         sessionFilePath = join(sessionsDir, sessionFiles[0]);
      } else {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
   }

   // --- 读取 session 数据 ---
   let sessionData: Record<string, unknown>;
   try {
      sessionData = JSON.parse(readFileSync(sessionFilePath, "utf-8"));
   } catch {
      return { status: "no_task", taskDir: null, taskTitle: null };
   }

   const currentTask = sessionData.current_task;
   if (typeof currentTask !== "string" || !currentTask)
      return { status: "no_task", taskDir: null, taskTitle: null };

   // Same jail the jsonl-referenced files already go through below. `task.py`
   // now refuses to store a ref that leaves the project, but a session file
   // written before that fix can still hold one, and `trellis update` does not
   // rewrite session files — so a poisoned pointer outlives the upgrade that
   // closed the writer.
   const taskDir = resolveProjectFile(projectRoot, currentTask, resolveTrustedRoots(projectRoot));
   if (!taskDir) return { status: "no_task", taskDir: null, taskTitle: null };
   const taskJsonPath = join(taskDir, "task.json");
   if (!existsSync(taskJsonPath)) return { status: "no_task", taskDir: null, taskTitle: null };

   let taskData: Record<string, unknown>;
   try {
      taskData = JSON.parse(readFileSync(taskJsonPath, "utf-8"));
   } catch {
      return { status: "no_task", taskDir: null, taskTitle: null };
   }

   return {
      status: typeof taskData.status === "string" ? taskData.status : "planning",
      taskDir,
      taskTitle: typeof taskData.title === "string" ? taskData.title : null,
   };
}

// ---------------------------------------------------------------------------
// Session context — spawns get_context.py default mode (same as Claude hook)
// ---------------------------------------------------------------------------

const SESSION_CONTEXT_TIMEOUT_MS = 5000;

function buildSessionContext(projectRoot: string, contextKey: string | null): string {
   const script = join(projectRoot, ".trellis", "scripts", "get_context.py");
   if (!existsSync(script)) return "";

   try {
      const result = spawnSync("python3", [script], {
         cwd: projectRoot,
         encoding: "utf-8",
         env: contextKey
            ? { ...process.env, TRELLIS_CONTEXT_ID: contextKey }
            : process.env,
         timeout: SESSION_CONTEXT_TIMEOUT_MS,
         windowsHide: true,
      });
      if (result.status !== 0 || !result.stdout?.trim()) {
         return "";
      }
      return `<session-context>\n${result.stdout.trim()}\n</session-context>`;
   } catch {
      return "";
   }
}

// ---------------------------------------------------------------------------
// Task context — prd.md, info.md, and jsonl-referenced spec/research files
// ---------------------------------------------------------------------------

type AgentType = "trellis-implement" | "trellis-check" | "trellis-research" | null;

function taskContextJsonlNames(agentType?: AgentType): string[] {
   if (agentType === "trellis-implement") return ["implement.jsonl"];
   if (agentType === "trellis-check") return ["check.jsonl"];
   if (agentType === "trellis-research") return [];
   return ["implement.jsonl", "check.jsonl"];
}

function taskContextInputPaths(projectRoot: string, taskDir: string, agentType?: AgentType): string[] {
   const trustedRoots = resolveTrustedRoots(projectRoot);
   const paths = new Set<string>([
      join(projectRoot, ".trellis", "config.yaml"),
      join(taskDir, "prd.md"),
      join(taskDir, "info.md"),
   ]);
   for (const jsonlName of taskContextJsonlNames(agentType)) {
      const jsonlPath = join(taskDir, jsonlName);
      paths.add(jsonlPath);
      if (!existsSync(jsonlPath)) continue;
      const displayPath = displayProjectPath(projectRoot, jsonlPath, taskDir);
      const { lines } = readJsonlLines(jsonlPath, displayPath);
      for (const line of lines) {
         try {
            const row = JSON.parse(line.trim()) as Record<string, unknown>;
            const file = typeof row.file === "string" ? row.file.trim() : "";
            const candidatePath = file ? resolve(projectRoot, file) : "";
            if (candidatePath && isInsideRoot(resolve(projectRoot), candidatePath)) paths.add(candidatePath);
            const targetPath = file ? resolveProjectFile(projectRoot, file, trustedRoots) : null;
            if (targetPath) paths.add(targetPath);
         } catch {
            // Seed rows and malformed lines do not contribute referenced files.
         }
      }
   }
   return [...paths];
}

function taskContextSignature(projectRoot: string, taskDir: string, agentType?: AgentType): string {
   return taskContextInputPaths(projectRoot, taskDir, agentType).map((filePath) => {
      try {
         const stat = statSync(filePath);
         return `${filePath}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      } catch {
         return `${filePath}:missing`;
      }
   }).join("\n");
}

interface ContextInjectionLimits {
   max_file_bytes: number;
   max_artifact_bytes: number;
   max_total_bytes: number;
   /** Largest unified diff (bytes) appended for one file before falling back to the full block. */
   diff_max_bytes: number;
   /** Consecutive diffs allowed per file within one compaction epoch before a full block resets the baseline. */
   diff_max_stack: number;
}

const DEFAULT_CONTEXT_INJECTION_LIMITS: ContextInjectionLimits = {
   max_file_bytes: 32768,
   max_artifact_bytes: 65536,
   max_total_bytes: 131072,
   diff_max_bytes: 8192,
   diff_max_stack: 3,
};

const MAX_JSONL_BYTES = 1024 * 1024;

function stripInlineComment(value: string): string {
   let quote: string | null = null;
   for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (quote) {
         if (char === quote) quote = null;
         continue;
      }
      if (char === "'" || char === '"') {
         quote = char;
         continue;
      }
      if (char === "#" && (i === 0 || /\s/.test(value[i - 1]!))) {
         return value.slice(0, i);
      }
   }
   return value;
}

function unquoteYaml(value: string): string {
   return value.length >= 2 && value[0] === value[value.length - 1] &&
      (value[0] === "'" || value[0] === '"')
      ? value.slice(1, -1)
      : value;
}

function readContextInjectionLimits(projectRoot: string): ContextInjectionLimits {
   const limits = { ...DEFAULT_CONTEXT_INJECTION_LIMITS };
   let config = "";
   try { config = readFileSync(join(projectRoot, ".trellis", "config.yaml"), "utf-8"); } catch { return limits; }

   let inSection = false;
   let sectionIndent = -1;
   for (const rawLine of config.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!inSection) {
         if (/^context_injection\s*:\s*(#.*)?$/.test(trimmed)) {
            inSection = true;
            sectionIndent = rawLine.length - rawLine.trimStart().length;
         }
         continue;
      }
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = rawLine.length - rawLine.trimStart().length;
      if (indent <= sectionIndent) break;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (!match || !(match[1] in limits)) continue;
      const rawValue = unquoteYaml(stripInlineComment(match[2]!).trim()).trim();
      if (!/^\d+$/.test(rawValue)) continue;
      (limits as unknown as Record<string, number>)[match[1]!] = Number.parseInt(rawValue, 10);
   }
   return limits;
}

class ContextBudget {
   private totalBytesUsed: number;
   private terminalSummaryEmitted = false;
   private stopped = false;
   constructor(private readonly maxTotalBytes: number, initialUsed = 0) {
      this.totalBytesUsed = initialUsed;
   }

   get used(): number {
      return this.totalBytesUsed;
   }

   hasRoom(bytes: number): boolean {
      return !this.stopped && (this.maxTotalBytes <= 0 || this.totalBytesUsed + bytes <= this.maxTotalBytes);
   }

   emit(text: string): string | null {
      const bytes = Buffer.byteLength(text, "utf-8");
      if (!this.hasRoom(bytes)) return null;
      this.totalBytesUsed += bytes;
      return text;
   }

   emitCandidate(primary: string | null, fallback: string | null): string | null {
      if (primary !== null) {
         const direct = this.emit(primary);
         if (direct !== null) return direct;
      }
      if (fallback !== null) {
         const notice = this.emit(fallback);
         if (notice !== null) return notice;
      }
      return this.emitTerminalSummary();
   }

   private emitTerminalSummary(): string | null {
      if (this.terminalSummaryEmitted) return null;
      this.terminalSummaryEmitted = true;
      this.stopped = true;
      const summary = "[Trellis: context limit reached; omitted entries remain authoritative on disk and require_read paths above.]";
      if (this.maxTotalBytes <= 0) {
         this.totalBytesUsed += Buffer.byteLength(summary, "utf-8");
         return summary;
      }
      const remaining = this.maxTotalBytes - this.totalBytesUsed;
      if (remaining <= 0) return null;
      const bounded = truncateUtf8(Buffer.from(summary, "utf-8"), remaining).toString("utf-8");
      this.totalBytesUsed += Buffer.byteLength(bounded, "utf-8");
      return bounded;
   }
}

type Utf8Status = "valid" | "incomplete" | "invalid";

function utf8Status(data: Buffer): Utf8Status {
   for (let index = 0; index < data.length; index++) {
      const lead = data[index]!;
      if (lead <= 0x7f) continue;

      let length: number;
      let secondMin = 0x80;
      let secondMax = 0xbf;
      if (lead >= 0xc2 && lead <= 0xdf) length = 2;
      else if (lead >= 0xe0 && lead <= 0xef) {
         length = 3;
         if (lead === 0xe0) secondMin = 0xa0;
         if (lead === 0xed) secondMax = 0x9f;
      } else if (lead >= 0xf0 && lead <= 0xf4) {
         length = 4;
         if (lead === 0xf0) secondMin = 0x90;
         if (lead === 0xf4) secondMax = 0x8f;
      } else return "invalid";

      if (index + length > data.length) {
         for (let tail = index + 1; tail < data.length; tail++) {
            const min = tail === index + 1 ? secondMin : 0x80;
            const max = tail === index + 1 ? secondMax : 0xbf;
            if (data[tail]! < min || data[tail]! > max) return "invalid";
         }
         return "incomplete";
      }
      const second = data[index + 1]!;
      if (second < secondMin || second > secondMax) return "invalid";
      for (let continuation = index + 2; continuation < index + length; continuation++) {
         const byte = data[continuation]!;
         if (byte < 0x80 || byte > 0xbf) return "invalid";
      }
      index += length - 1;
   }
   return "valid";
}

function truncateUtf8(data: Buffer, cap: number): Buffer {
   if (cap <= 0 || data.length <= cap) return data;
   if (utf8Status(data.subarray(0, cap)) === "valid") return data.subarray(0, cap);
   // A bounded read has already been validated as a complete UTF-8 stream.
   // Only its final, incomplete code point may make the cap prefix invalid.
   for (let end = cap - 1; end >= Math.max(0, cap - 4); end--) {
      const candidate = data.subarray(0, end);
      if (utf8Status(candidate) === "valid") return candidate;
   }
   return Buffer.alloc(0);
}

function isUtf8(data: Buffer): boolean {
   return utf8Status(data) === "valid";
}

function readFilePrefix(filePath: string, maxBytes: number): { data: Buffer; size: number } | null {
   let fd: number | null = null;
   try {
      fd = openSync(filePath, "r");
      if (maxBytes <= 0) {
         const data = readFileSync(fd);
         return { data, size: fstatSync(fd).size };
      }
      // Read a few extra bytes so a UTF-8 sequence crossing the cap can be
      // validated before truncateUtf8 removes its incomplete suffix. The
      // descriptor keeps the read bounded if the path is replaced or grows.
      const data = Buffer.allocUnsafe(maxBytes + 4);
      const bytesRead = readFully(fd, data);
      return { data: data.subarray(0, bytesRead), size: fstatSync(fd).size };
   } catch {
      return null;
   } finally {
      if (fd !== null) closeSync(fd);
   }
}

function readFully(fd: number, buffer: Buffer): number {
   let total = 0;
   while (total < buffer.length) {
      const bytesRead = readSync(fd, buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
   }
   return total;
}

function omittedNotice(file: string, size: number | null, reason: string): string {
   const sizeText = size === null ? "unknown bytes" : `${size} bytes`;
   return `### ${file} [omitted]\n\n[Trellis: omitted (${reason}) — ${file} (${sizeText}); required_read: ${file}]`;
}

interface MaterializedFile {
   block: string | null;
   notice: string;
}

function materialize(
   targetPath: string,
   displayPath: string,
   reason: string,
   maxBytes: number,
   kind: "file" | "artifact",
): MaterializedFile {
   const file = readFilePrefix(targetPath, maxBytes);
   if (!file) {
      return { block: null, notice: omittedNotice(displayPath, null, `${kind} is missing or unreadable`) };
   }
   const { data, size } = file;
   const encodingStatus = utf8Status(data);
   if (data.includes(0) || encodingStatus === "invalid" || (encodingStatus === "incomplete" && size <= data.length)) {
      return { block: null, notice: omittedNotice(displayPath, size, `binary or non-UTF-8 ${kind}: ${reason}`) };
   }
   const truncated = truncateUtf8(data, maxBytes);
   let content = truncated.toString("utf-8");
   let status: "inline" | "truncated" = "inline";
   if (truncated.length < size) {
      status = "truncated";
      content += `\n[Trellis: truncated at ${maxBytes} bytes — read ${displayPath} for the full content]`;
   }
   return {
      block: `### ${displayPath} [${status}]\n\n${content}`,
      notice: omittedNotice(displayPath, size, `total context limit reached: ${reason}`),
   };
}

function readJsonlLines(jsonlPath: string, displayPath: string): { lines: string[]; omitted: string | null } {
   let fd: number | null = null;
   try {
      fd = openSync(jsonlPath, "r");
      const data = Buffer.allocUnsafe(MAX_JSONL_BYTES + 1);
      const bytesRead = readFully(fd, data);
      const size = fstatSync(fd).size;
      if (bytesRead > MAX_JSONL_BYTES || size > MAX_JSONL_BYTES) {
         return {
            lines: [],
            omitted: omittedNotice(displayPath, size, `manifest exceeds ${MAX_JSONL_BYTES} byte parse limit`),
         };
      }
      const content = data.subarray(0, bytesRead);
      if (!isUtf8(content)) {
         return { lines: [], omitted: omittedNotice(displayPath, size, "manifest is not valid UTF-8") };
      }
      return { lines: content.toString("utf-8").split(/\r?\n/), omitted: null };
   } catch {
      return { lines: [], omitted: omittedNotice(displayPath, null, "manifest is missing or unreadable") };
   } finally {
      if (fd !== null) closeSync(fd);
   }
}

/** One ordered unit of task context, before the total-bytes budget is applied. */
type TaskContextEntry =
   | { kind: "artifact"; displayPath: string; materialized: MaterializedFile }
   | { kind: "manifest-omitted"; section: string; displayPath: string; notice: string }
   | { kind: "file"; section: string; displayPath: string; materialized: MaterializedFile };

/**
 * Materializes prd.md, info.md and every manifest-referenced file in the order
 * they are injected. Per-file caps are applied here; the shared total budget is
 * applied by the consumer so the same entries can feed both the system prompt
 * block and the per-file update baselines.
 */
function materializeTaskContextFiles(projectRoot: string, taskDir: string, agentType?: AgentType): TaskContextEntry[] {
   const entries: TaskContextEntry[] = [];
   // Resolved once per call (not per referenced file) — avoids re-parsing
   // config.yaml for every jsonl row.
   const trustedRoots = resolveTrustedRoots(projectRoot);
   const limits = readContextInjectionLimits(projectRoot);

   // prd.md and info.md — always included
   const prdPath = join(taskDir, "prd.md");
   if (existsSync(prdPath)) {
      const displayPath = displayProjectPath(projectRoot, prdPath, taskDir);
      entries.push({
         kind: "artifact",
         displayPath,
         materialized: materialize(
            prdPath,
            displayPath,
            "Requirements document",
            limits.max_artifact_bytes,
            "artifact",
         ),
      });
   }
   const infoPath = join(taskDir, "info.md");
   if (existsSync(infoPath)) {
      const displayPath = displayProjectPath(projectRoot, infoPath, taskDir);
      entries.push({
         kind: "artifact",
         displayPath,
         materialized: materialize(infoPath, displayPath, "Task information", limits.max_artifact_bytes, "artifact"),
      });
   }

   // A file may be referenced by both manifests. Use the resolved real path so
   // relative aliases and symlinked paths cannot consume the context budget twice.
   const includedPaths = new Set<string>();

   for (const jsonlName of taskContextJsonlNames(agentType)) {
      const jsonlPath = join(taskDir, jsonlName);
      if (!existsSync(jsonlPath)) continue;

      const relativeJsonlPath = displayProjectPath(projectRoot, jsonlPath, taskDir);
      const manifest = readJsonlLines(jsonlPath, relativeJsonlPath);
      if (manifest.omitted) {
         entries.push({
            kind: "manifest-omitted",
            section: jsonlName,
            displayPath: relativeJsonlPath,
            notice: manifest.omitted,
         });
         continue;
      }

      for (const line of manifest.lines) {
         const trimmed = line.trim();
         if (!trimmed) continue;
         try {
            const row = JSON.parse(trimmed) as Record<string, unknown>;
            const file = typeof row.file === "string" ? row.file.trim() : "";
            if (!file) continue;
            const targetPath = resolveProjectFile(projectRoot, file, trustedRoots);
            if (!targetPath) continue;
            if (includedPaths.has(targetPath)) continue;
            includedPaths.add(targetPath);
            entries.push({
               kind: "file",
               section: jsonlName,
               displayPath: file,
               materialized: materialize(
                  targetPath,
                  file,
                  typeof row.reason === "string" ? row.reason : "-",
                  limits.max_file_bytes,
                  "file",
               ),
            });
         } catch {
            // seed rows and malformed lines are non-fatal
         }
      }
   }
   return entries;
}

/** Text the model is meant to see for one entry when the total budget allows it. */
function entryBlock(entry: TaskContextEntry): string {
   if (entry.kind === "manifest-omitted") return entry.notice;
   return entry.materialized.block ?? entry.materialized.notice;
}

interface RenderedTaskContext {
   content: string;
   /** Display paths whose materialized text was replaced by a notice or dropped by the total budget. */
   omittedPaths: Set<string>;
}

/**
 * Renders materialized entries into the `<task-context>` block under the
 * shared total budget. `omittedPaths` lets the caller avoid diffing against
 * text the model never received.
 */
function renderTaskContext(projectRoot: string, entries: TaskContextEntry[]): RenderedTaskContext {
   const parts: string[] = [];
   const omittedPaths = new Set<string>();
   const limits = readContextInjectionLimits(projectRoot);
   const prefix =
      "<task-context>\nContext is bounded by .trellis/config.yaml. Files marked [truncated] or [omitted] remain authoritative on disk; use their required_read path before relying on missing detail.\n\n";
   const suffix = "\n</task-context>";
   const wrapperBytes = Buffer.byteLength(prefix + suffix, "utf-8");
   if (limits.max_total_bytes > 0 && limits.max_total_bytes < wrapperBytes) {
      for (const entry of entries) omittedPaths.add(entry.displayPath);
      return { content: "", omittedPaths };
   }
   const budget = new ContextBudget(limits.max_total_bytes, wrapperBytes);

   // Emits `primary` (or `fallback` once the budget is exhausted) and reports
   // whether the text the baseline will remember (`shown`) is what went out.
   const appendCandidate = (primary: string | null, fallback: string | null, shown: string): boolean => {
      const separator = parts.length > 0 ? "\n\n" : "";
      const output = budget.emitCandidate(
         primary === null ? null : separator + primary,
         fallback === null ? null : separator + fallback,
      );
      if (output !== null) parts.push(output);
      return output === separator + shown;
   };

   let sectionName: string | null = null;
   let fileChunks: string[] = [];
   let sectionHeaderEmitted = false;
   const flushSection = (): void => {
      if (fileChunks.length > 0) parts.push(fileChunks.join(""));
      fileChunks = [];
      sectionHeaderEmitted = false;
      sectionName = null;
   };

   for (const entry of entries) {
      if (entry.kind === "artifact") {
         const shown = entryBlock(entry);
         if (!appendCandidate(entry.materialized.block, entry.materialized.notice, shown)) {
            omittedPaths.add(entry.displayPath);
         }
         continue;
      }
      if (entry.section !== sectionName) {
         flushSection();
         sectionName = entry.section;
      }
      if (entry.kind === "manifest-omitted") {
         const text = `## ${entry.section}\n\n${entry.notice}`;
         if (!appendCandidate(text, null, text)) omittedPaths.add(entry.displayPath);
         sectionName = null;
         continue;
      }
      const sectionPrefix = sectionHeaderEmitted
         ? "\n\n---\n\n"
         : `${parts.length > 0 ? "\n\n" : ""}## ${entry.section}\n\n`;
      const primary = entry.materialized.block === null ? null : `${sectionPrefix}${entry.materialized.block}`;
      const output = budget.emitCandidate(primary, `${sectionPrefix}${entry.materialized.notice}`);
      if (output !== null) {
         fileChunks.push(output);
         sectionHeaderEmitted = true;
      }
      if (output !== `${sectionPrefix}${entryBlock(entry)}`) omittedPaths.add(entry.displayPath);
   }
   flushSection();

   if (parts.length === 0) return { content: "", omittedPaths };
   const context = `${prefix}${parts.join("")}${suffix}`;
   if (limits.max_total_bytes <= 0 || Buffer.byteLength(context, "utf-8") <= limits.max_total_bytes)
      return { content: context, omittedPaths };
   const suffixBytes = Buffer.byteLength(suffix, "utf-8");
   const bodyLimit = Math.max(0, limits.max_total_bytes - suffixBytes);
   const body = truncateUtf8(Buffer.from(`${prefix}${parts.join("")}`, "utf-8"), bodyLimit).toString("utf-8");
   return { content: `${body}${suffix}`, omittedPaths };
}

function buildTaskContext(projectRoot: string, taskDir: string, agentType?: AgentType): string {
   return renderTaskContext(projectRoot, materializeTaskContextFiles(projectRoot, taskDir, agentType)).content;
}

// ---------------------------------------------------------------------------
// Prompt injection config (escape hatch)
// ---------------------------------------------------------------------------

// Mirrors DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD in inject-workflow-state.py:
// the skip keyword defaults to "no-trellis"; an explicit "" disables the
// escape hatch entirely.
const DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD = "no-trellis";

// PyYAML-compatible resolution of scalars that parse as non-strings: null
// (empty, ~, null variants), bool (YAML 1.1 set), and numbers. Quoted scalars
// never reach this check and stay strings.
function isYamlNonStringScalar(raw: string): boolean {
   if (raw === "" || raw === "~" || /^(?:null|Null|NULL)$/.test(raw)) return true;
   if (/^(?:true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/.test(raw)) return true;
   // PyYAML int resolver: binary/octal/decimal/hex; leading-zero decimals are not ints.
   if (/^[-+]?(?:0[bB][01_]+|0[0-7_]+|0[xX][0-9a-fA-F_]+|[1-9][\d_]*|0)$/.test(raw)) return true;
   // PyYAML float resolver: requires a dot and a signed exponent ("1.5e+3",
   // not "1.5e3" — the latter stays a string in PyYAML).
   return /^[-+]?(?:\d[\d_]*\.[\d_]*|\.[\d_]+)(?:[eE][-+]\d+)?$/.test(raw) ||
      /^[-+]?\.(?:inf|Inf|INF)$/.test(raw) ||
      /^\.(?:nan|NaN|NAN)$/.test(raw);
}

function readPromptInjectionSkipKeyword(projectRoot: string): string {
   let config = "";
   try { config = readFileSync(join(projectRoot, ".trellis", "config.yaml"), "utf-8"); } catch { return DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD; }

   let inSection = false;
   let sectionIndent = -1;
   for (const rawLine of config.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!inSection) {
         if (/^prompt_injection\s*:\s*(#.*)?$/.test(trimmed)) {
            inSection = true;
            sectionIndent = rawLine.length - rawLine.trimStart().length;
         }
         continue;
      }
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = rawLine.length - rawLine.trimStart().length;
      if (indent <= sectionIndent) break;
      const match = trimmed.match(/^skip_keyword\s*:\s*(.*)$/);
      if (!match) continue;
      const rawValue = stripInlineComment(match[1]!).trim();
      const unquoted = unquoteYaml(rawValue);
      // Preserve YAML scalar typing, mirroring _resolve_skip_keyword's
      // isinstance(raw, str) check: a bare non-string scalar (bool/null/
      // number, including an empty value) falls back to the default, while
      // quoted scalars — including an explicit "" — stay strings.
      if (unquoted === rawValue && isYamlNonStringScalar(rawValue)) {
         return DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD;
      }
      return unquoted.trim();
   }
   return DEFAULT_PROMPT_INJECTION_SKIP_KEYWORD;
}

// Mirrors prompt_has_skip_keyword() in inject-workflow-state.py: hyphen counts
// as a word char so "no-trellisx" / "xno-trellis" / "foo-no-trellis" don't
// match, but punctuation/whitespace boundaries do. Empty keyword never matches.
function shouldSkipWorkflowState(
   userInput: string,
   skipKeyword: string,
): boolean {
   if (!skipKeyword) return false;
   const escapedKeyword = skipKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   const pattern = new RegExp(`(?<![\\w-])${escapedKeyword}(?![\\w-])`, "i");
   return pattern.test(userInput);
}

// ---------------------------------------------------------------------------
// Per-turn cache — prevents redundant workflow-state resolution within a
// single event cascade (input, before_agent_start, and context fire closely)
// ---------------------------------------------------------------------------

const SESSION_OVERVIEW_TEXT =
   "Trellis workflow system active. Use skills and agents as directed by the workflow state.";

class TurnContextCache {
   private key: string | null = null;
   private timestamp = 0;
   private workflowMsg = "";
   private skipThisTurn = false;
   private static readonly TTL_MS = 1500;

   // Called once per user turn (input event) with the skip decision for that
   // turn; invalidates the cache so every reader in the cascade
   // (before_agent_start, context) resolves the same turn state.
   beginTurn(skipThisTurn: boolean): void {
      this.skipThisTurn = skipThisTurn;
      this.key = null;
   }

   get(projectRoot: string, contextKey: string | null): { workflowMsg: string } {
      const now = Date.now();
      const cacheKey = `${projectRoot}:${contextKey ?? ""}`;
      if (
         this.key === cacheKey &&
         now - this.timestamp < TurnContextCache.TTL_MS
      ) {
         return { workflowMsg: this.workflowMsg };
      }

      const { status } = resolveActiveTaskStatus(projectRoot, contextKey);

      const workflowPath = join(projectRoot, ".trellis", "workflow.md");
      let workflowMd = "";
      try { workflowMd = readFileSync(workflowPath, "utf-8"); } catch { }

      let workflowBody = "";
      if (workflowMd) {
         const blocks = parseWorkflowStateBlocks(workflowMd);
         const activeBlock = blocks.find((b) => b.status === status);
         if (activeBlock) {
            workflowBody = `[workflow-state:${activeBlock.status}]\n${activeBlock.content}\n[/workflow-state:${activeBlock.status}]`;
         }
      }
      if (!workflowBody) {
         workflowBody = "Refer to workflow.md for current step.";
      }

      // When skip keyword is present, skip workflow state injection this turn
      this.workflowMsg = this.skipThisTurn
         ? ""
         : `<workflow-state>\n${workflowBody}\n</workflow-state>\n\n<session-overview>\n${SESSION_OVERVIEW_TEXT}\n</session-overview>`;

      this.key = cacheKey;
      this.timestamp = now;
      return { workflowMsg: this.workflowMsg };
   }
}

// ---------------------------------------------------------------------------
// Workflow-state tag parsing
// ---------------------------------------------------------------------------

const WORKFLOW_STATE_RE =
   /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g;

interface WorkflowStateBlock {
   status: string;
   content: string;
}

function parseWorkflowStateBlocks(markdown: string): WorkflowStateBlock[] {
   const blocks: WorkflowStateBlock[] = [];
   for (const match of markdown.matchAll(WORKFLOW_STATE_RE)) {
      blocks.push({
         status: match[1],
         content: match[2].trim(),
      });
   }
   return blocks;
}

// ---------------------------------------------------------------------------
// Sub-agent detection
// ---------------------------------------------------------------------------

const TRELLIS_AGENTS = new Set(["trellis-implement", "trellis-check", "trellis-research"]);

function detectAgentType(): AgentType {
   const blocked = process.env.PI_BLOCKED_AGENT;
   if (blocked && TRELLIS_AGENTS.has(blocked)) {
      return blocked as AgentType;
   }
   return null;
}

const SESSION_CONTEXT_TYPE = "trellis-session-context";
const TASK_CONTEXT_TYPE = "trellis-task-context";
const TASK_CONTEXT_UPDATE_TYPE = "trellis-task-context-update";
const WORKFLOW_STATE_TYPE = "trellis-workflow-state";

// ---------------------------------------------------------------------------
// Line diff — self-contained Myers O(ND) with unified output. The provider
// prefix cache only survives when history is append-only, so task file
// changes are delivered as diffs against the last snapshot the model saw.
// ---------------------------------------------------------------------------

/** Lines per side beyond which a diff is not attempted; the full block is sent instead. */
const DIFF_MAX_LINES = 4000;
/** Edit-distance ceiling for the Myers search; larger rewrites fall back to the full block. */
const DIFF_MAX_EDITS = 1000;
const DIFF_CONTEXT_LINES = 3;

interface DiffEdit {
   kind: " " | "-" | "+";
   line: string;
}

function splitLines(text: string): string[] {
   if (text === "") return [];
   const lines = text.split("\n");
   if (lines[lines.length - 1] === "") lines.pop();
   return lines;
}

function myersEdits(a: string[], b: string[], maxEdits: number): DiffEdit[] | null {
   const n = a.length;
   const m = b.length;
   const max = Math.min(maxEdits, n + m);
   const offset = max + 1;
   const width = 2 * max + 3;
   const trace: Int32Array[] = [];
   const v = new Int32Array(width);
   v[offset + 1] = 0;
   let found = -1;
   for (let d = 0; d <= max; d++) {
      trace.push(Int32Array.from(v));
      for (let k = -d; k <= d; k += 2) {
         let x: number;
         if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) {
            x = v[offset + k + 1]!;
         } else {
            x = v[offset + k - 1]! + 1;
         }
         let y = x - k;
         while (x < n && y < m && a[x] === b[y]) {
            x++;
            y++;
         }
         v[offset + k] = x;
         if (x >= n && y >= m) {
            found = d;
            break;
         }
      }
      if (found >= 0) break;
   }
   if (found < 0) return null;

   const edits: DiffEdit[] = [];
   let x = n;
   let y = m;
   for (let d = found; d >= 0; d--) {
      const vd = trace[d]!;
      const k = x - y;
      let prevK: number;
      if (k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!)) {
         prevK = k + 1;
      } else {
         prevK = k - 1;
      }
      const prevX = vd[offset + prevK]!;
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
         edits.push({ kind: " ", line: a[x - 1]! });
         x--;
         y--;
      }
      if (d > 0) {
         if (x === prevX) edits.push({ kind: "+", line: b[prevY]! });
         else edits.push({ kind: "-", line: a[prevX]! });
      }
      x = prevX;
      y = prevY;
   }
   edits.reverse();
   return edits;
}

/**
 * Produces a unified diff between two snapshots of one file.
 *
 * @returns `''` when the texts are identical, `null` when a diff is not
 *   attempted (too many lines or too many edits), otherwise unified hunks.
 */
export function unifiedDiff(previous: string, current: string, displayPath: string): string | null {
   if (previous === current) return "";
   const a = splitLines(previous);
   const b = splitLines(current);
   if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) return null;

   // Trim the shared prefix and suffix so typical localized edits keep the
   // Myers search tiny regardless of file size.
   let start = 0;
   while (start < a.length && start < b.length && a[start] === b[start]) start++;
   let endA = a.length;
   let endB = b.length;
   while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
   }
   const middle = myersEdits(a.slice(start, endA), b.slice(start, endB), DIFF_MAX_EDITS);
   if (middle === null) return null;
   const edits: DiffEdit[] = [
      ...a.slice(0, start).map((line): DiffEdit => ({ kind: " ", line })),
      ...middle,
      ...a.slice(endA).map((line): DiffEdit => ({ kind: " ", line })),
   ];

   // Group changes into hunks; merge when the gap fits inside twice the context.
   const changeIndexes: number[] = [];
   for (let index = 0; index < edits.length; index++) {
      if (edits[index]!.kind !== " ") changeIndexes.push(index);
   }
   if (changeIndexes.length === 0) return "";
   const ranges: Array<[number, number]> = [];
   for (const index of changeIndexes) {
      const from = Math.max(0, index - DIFF_CONTEXT_LINES);
      const to = Math.min(edits.length - 1, index + DIFF_CONTEXT_LINES);
      const last = ranges[ranges.length - 1];
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
      else ranges.push([from, to]);
   }

   const out: string[] = [`--- ${displayPath} (previous snapshot)`, `+++ ${displayPath} (current)`];
   let oldLine = 1;
   let newLine = 1;
   let cursor = 0;
   for (const [from, to] of ranges) {
      for (; cursor < from; cursor++) {
         const edit = edits[cursor]!;
         if (edit.kind !== "+") oldLine++;
         if (edit.kind !== "-") newLine++;
      }
      let oldCount = 0;
      let newCount = 0;
      const body: string[] = [];
      for (let index = from; index <= to; index++) {
         const edit = edits[index]!;
         if (edit.kind !== "+") oldCount++;
         if (edit.kind !== "-") newCount++;
         body.push(`${edit.kind}${edit.line}`);
      }
      // Match git: an empty side reports the line before the hunk.
      const oldStart = oldCount === 0 ? oldLine - 1 : oldLine;
      const newStart = newCount === 0 ? newLine - 1 : newLine;
      out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body);
      oldLine += oldCount;
      newLine += newCount;
      cursor = to + 1;
   }
   return out.join("\n");
}

// ---------------------------------------------------------------------------
// Task context update planning (pure). The system prompt carries the first
// snapshot for the life of the process; every later change is appended as a
// persisted message so provider-bound history never rewrites earlier bytes.
// ---------------------------------------------------------------------------

/** Last text sent to the model for one task file, plus its diff stack within the current epoch. */
export interface TaskFileBaseline {
   block: string;
   stackedDiffs: number;
   stackedDiffBytes: number;
   /**
    * The model may no longer hold `block` verbatim (the update carrying it was
    * omitted by the budget, or a compaction happened since), so the next change
    * must be sent in full instead of as a diff against it.
    */
   stale: boolean;
   /**
    * The model never received `block` at all (omitted by the system prompt or
    * update budget), so the file is re-sent in full on the next update pass
    * even when it did not change on disk.
    */
   unseen: boolean;
}

/** Baseline for the bound task; `files` preserves injection order. */
export interface TaskContextBaseline {
   taskDir: string;
   /** Project-relative label used in update headers. */
   taskLabel: string;
   signature: string;
   files: Map<string, TaskFileBaseline>;
}

/** Current on-disk snapshot of the bound task. */
export interface TaskContextSnapshot {
   taskDir: string;
   taskLabel: string;
   signature: string;
   files: Array<{ displayPath: string; block: string }>;
}

export interface TaskContextUpdatePlan {
   /** Message body to append, or `''` when nothing changed. */
   content: string;
   baseline: TaskContextBaseline | null;
}

export interface TaskContextUpdateInput {
   previous: TaskContextBaseline | null;
   current: TaskContextSnapshot | null;
   limits: Pick<ContextInjectionLimits, "max_total_bytes" | "diff_max_bytes" | "diff_max_stack">;
   /** True once after a compaction: earlier snapshots may be summarized away, so diffs need a fresh base. */
   epochReset: boolean;
   /** True when the system prompt holds a task block; only affects the wording of the update header. */
   promptHasTask: boolean;
}

const UPDATE_PREFIX = `<${TASK_CONTEXT_UPDATE_TYPE}>\n`;
const UPDATE_SUFFIX = `\n</${TASK_CONTEXT_UPDATE_TYPE}>`;

function snapshotFiles(entries: TaskContextEntry[]): TaskContextSnapshot["files"] {
   const files: TaskContextSnapshot["files"] = [];
   const seen = new Set<string>();
   for (const entry of entries) {
      if (seen.has(entry.displayPath)) continue;
      seen.add(entry.displayPath);
      files.push({ displayPath: entry.displayPath, block: entryBlock(entry) });
   }
   return files;
}

function baselineFrom(snapshot: TaskContextSnapshot, stalePaths: ReadonlySet<string> = new Set()): TaskContextBaseline {
   const files = new Map<string, TaskFileBaseline>();
   for (const file of snapshot.files) {
      files.set(file.displayPath, {
         block: file.block,
         stackedDiffs: 0,
         stackedDiffBytes: 0,
         stale: stalePaths.has(file.displayPath),
         unseen: stalePaths.has(file.displayPath),
      });
   }
   return {
      taskDir: snapshot.taskDir,
      taskLabel: snapshot.taskLabel,
      signature: snapshot.signature,
      files,
   };
}

/**
 * Decides what to append for this turn and what the next baseline is.
 *
 * Section shapes degrade in order: unified diff, full block, omitted notice
 * (when the shared total budget is exhausted). A full block is used whenever
 * there is no baseline for the file, the baseline is stale (compaction since
 * it was sent, or its update was omitted), the per-file diff stack is
 * exhausted, the diffs stacked since the last full send would exceed one full
 * block, or the diff itself is larger than `diff_max_bytes` or the block.
 */
export function planTaskContextUpdate(input: TaskContextUpdateInput): TaskContextUpdatePlan {
   const { previous, current, limits, epochReset, promptHasTask } = input;
   if (!current) {
      if (!previous) return { content: "", baseline: null };
      const label = previous.taskLabel;
      return {
         content: `${UPDATE_PREFIX}Task context for ${label} is no longer active. Ignore its files in the system prompt and earlier updates unless a task is bound again.${UPDATE_SUFFIX}`,
         baseline: null,
      };
   }

   const sameTask = previous !== null && previous.taskDir === current.taskDir;
   const headerLines: string[] = [];
   if (previous && !sameTask) {
      headerLines.push(
         `Task context for ${previous.taskLabel} is no longer active; the sections below describe the newly bound task.`,
      );
   }
   if (!sameTask && !promptHasTask) {
      headerLines.push(
         "The system prompt holds no task context for this task; the sections below are the full baseline.",
      );
   } else if (!sameTask) {
      headerLines.push("The sections below are the full baseline for the newly bound task.");
   } else {
      headerLines.push(
         `Task context changed on disk. Each section below supersedes the same file in ${promptHasTask ? "the system prompt and in earlier updates" : "earlier updates"}.`,
      );
   }
   headerLines.push("Files on disk remain authoritative; use read for anything not shown.");
   const header = `${headerLines.join(" ")}\n\n`;

   const nextFiles = new Map<string, TaskFileBaseline>();
   interface Section {
      primary: string;
      fallback: string;
      /** Baseline entry to downgrade to stale when `primary` does not go out; null for removal notices. */
      file: { displayPath: string; block: string } | null;
   }
   const sections: Section[] = [];
   // A different task has no usable baseline: every file starts without `old`.
   const previousFiles = sameTask && previous ? previous.files : new Map<string, TaskFileBaseline>();

   for (const file of current.files) {
      const old = previousFiles.get(file.displayPath);
      if (old && old.block === file.block && !old.unseen) {
         // Unchanged. After a compaction the update that carried `old.block` may
         // have been summarized away, so its next change must be sent in full.
         nextFiles.set(file.displayPath, epochReset && !old.stale ? { ...old, stale: true } : old);
         continue;
      }
      const blockBytes = Buffer.byteLength(file.block, "utf-8");
      let diff: string | null = null;
      if (old && !old.stale && !epochReset && old.stackedDiffs < limits.diff_max_stack) {
         const candidate = unifiedDiff(old.block, file.block, file.displayPath);
         const candidateBytes = candidate === null ? 0 : Buffer.byteLength(candidate, "utf-8");
         // A diff is only worth it when it is cheaper than the block itself and
         // the diffs stacked since the last full send still cost less than one
         // full resend; otherwise the full block resets the stack.
         if (
            candidate !== null &&
            candidate !== "" &&
            candidateBytes <= limits.diff_max_bytes &&
            candidateBytes < blockBytes &&
            old.stackedDiffBytes + candidateBytes <= blockBytes
         ) {
            diff = candidate;
         }
      }
      const fallback = `## ${file.displayPath} [omitted]\n\n[Trellis: omitted (update budget reached) — ${file.displayPath}; required_read: ${file.displayPath}]`;
      if (diff !== null && old) {
         sections.push({ primary: `## ${file.displayPath} (diff)\n\n${diff}`, fallback, file });
         nextFiles.set(file.displayPath, {
            block: file.block,
            stackedDiffs: old.stackedDiffs + 1,
            stackedDiffBytes: old.stackedDiffBytes + Buffer.byteLength(diff, "utf-8"),
            stale: false,
            unseen: false,
         });
      } else {
         sections.push({ primary: `## ${file.displayPath} (full)\n\n${file.block}`, fallback, file });
         nextFiles.set(file.displayPath, {
            block: file.block,
            stackedDiffs: 0,
            stackedDiffBytes: 0,
            stale: false,
            unseen: false,
         });
      }
   }
   for (const displayPath of previousFiles.keys()) {
      if (nextFiles.has(displayPath)) continue;
      const text = `## ${displayPath} (removed)\n\nNo longer part of the task context.`;
      sections.push({ primary: text, fallback: text, file: null });
   }

   const baseline: TaskContextBaseline = {
      taskDir: current.taskDir,
      taskLabel: current.taskLabel,
      signature: current.signature,
      files: nextFiles,
   };
   if (sections.length === 0) return { content: "", baseline };

   const wrapperBytes = Buffer.byteLength(UPDATE_PREFIX + header + UPDATE_SUFFIX, "utf-8");
   const budget = new ContextBudget(limits.max_total_bytes, wrapperBytes);
   const parts: string[] = [];
   for (const section of sections) {
      const separator = parts.length > 0 ? "\n\n" : "";
      const primary = separator + section.primary;
      const output = budget.emitCandidate(primary, separator + section.fallback);
      if (output !== null) parts.push(output);
      if (section.file && output !== primary) {
         // The model only got a notice (or nothing): remember the current text so
         // the change is not re-reported, but never diff against it.
         nextFiles.set(section.file.displayPath, {
            block: section.file.block,
            stackedDiffs: 0,
            stackedDiffBytes: 0,
            stale: true,
            unseen: true,
         });
      }
   }
   return {
      content: `${UPDATE_PREFIX}${header}${parts.join("")}${UPDATE_SUFFIX}`,
      baseline,
   };
}
// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
   let projectRoot: string | null = null;
   const turnCache = new TurnContextCache();
   const agentType = detectAgentType();
   const isSubAgent = agentType !== null;

   // Set when a compaction is announced and cleared once a workflow breadcrumb
   // has been persisted or re-projected afterwards. A boolean instead of a
   // timestamp pair: two events inside the same millisecond must not reopen
   // the safety net.
   let compactionPending = false;

   // Provider prefix caches invalidate from byte 0 whenever the system prompt
   // changes, so the task block appended to the system prompt is memoized per
   // context key + project root and stays byte-identical for the life of the
   // process. Later on-disk changes travel through persisted update messages.
   const memoizedTaskBlocks = new Map<string, string>();
   const taskBaselines = new Map<string, TaskContextBaseline | null>();
   // Set by session_before_compact and consumed by the next update planning:
   // earlier snapshots may have been summarized away, so the first change after
   // a compaction re-sends the full block instead of a diff.
   let baselineEpochInvalidated = false;

   const rememberContextKey = (ctx?: {
      sessionManager?: {
         getSessionId?: () => string | undefined;
         getSessionFile?: () => string | undefined;
      };
   }): string | null => {
      const key = deriveContextKey(ctx);
      if (!key) return null;
      return key;
   };

   const promptKey = (root: string, contextKey: string | null): string => `${contextKey ?? "default"}::${root}`;

   const snapshotTask = (
      taskDir: string,
      root: string,
   ): { snapshot: TaskContextSnapshot; entries: TaskContextEntry[] } => {
      // Signature before content: a write landing between the two reads then
      // leaves the stored signature older than the text, so the next turn
      // re-plans (and stays silent if the content matches) instead of missing it.
      const signature = taskContextSignature(root, taskDir, agentType);
      const entries = materializeTaskContextFiles(root, taskDir, agentType);
      return {
         entries,
         snapshot: {
            taskDir,
            taskLabel: displayProjectPath(root, taskDir, taskDir),
            signature,
            files: snapshotFiles(entries),
         },
      };
   };

   pi.on("session_start", async (_event, ctx) => {
      projectRoot = findProjectRoot(ctx.cwd);
      const contextKey = rememberContextKey(ctx);

      if (!projectRoot) return;

      if (isSubAgent) {
         // Sub-agent: inject precise task context once
         const { taskDir } = resolveActiveTaskStatus(projectRoot, contextKey);
         if (taskDir) {
            const taskContext = buildTaskContext(projectRoot, taskDir, agentType);
            if (taskContext) {
               await pi.sendMessage({
                  customType: TASK_CONTEXT_TYPE,
                  content: taskContext,
                  display: false,
               });
            }
         }
      } else {
         // Main session: inject session context (global map). The task context
         // is carried by the system prompt from the first turn onwards.
         const sessionContext = buildSessionContext(projectRoot, contextKey);
         if (sessionContext) {
            await pi.sendMessage({
               customType: SESSION_CONTEXT_TYPE,
               content: sessionContext,
               display: false,
            });
         }

         ctx.ui.notify("Trellis workflow system available", "info");
      }
   });

   pi.on("session_before_compact", async () => {
      compactionPending = true;
      baselineEpochInvalidated = true;
   });

   pi.on("before_agent_start", async (event, ctx) => {
      if (!projectRoot) {
         projectRoot = findProjectRoot(ctx.cwd);
      }
      if (!projectRoot) return;
      const contextKey = rememberContextKey(ctx);

      // Persistent injection: workflow state for this turn
      const cached = turnCache.get(projectRoot, contextKey);
      compactionPending = false;

      const message = cached.workflowMsg
         ? {
              customType: WORKFLOW_STATE_TYPE,
              content: cached.workflowMsg,
              display: false,
           }
         : undefined;

      if (isSubAgent) return message ? { message } : undefined;

      // Task block: snapshot once per context key, then keep the system prompt
      // byte-identical. `event.systemPrompt` already carries earlier handlers'
      // segments; only append, never replace.
      const key = promptKey(projectRoot, contextKey);
      let block = memoizedTaskBlocks.get(key);
      if (block === undefined) {
         const { taskDir } = resolveActiveTaskStatus(projectRoot, contextKey);
         block = "";
         let baseline: TaskContextBaseline | null = null;
         if (taskDir) {
            // One materialization feeds both the prompt block and the baseline so
            // later diffs are computed against exactly the text the model saw.
            const { snapshot, entries } = snapshotTask(taskDir, projectRoot);
            const rendered = renderTaskContext(projectRoot, entries);
            block = rendered.content;
            if (block) baseline = baselineFrom(snapshot, rendered.omittedPaths);
         }
         memoizedTaskBlocks.set(key, block);
         taskBaselines.set(key, baseline);
      }
      const basePrompt = (event as { systemPrompt?: unknown }).systemPrompt;
      const systemPrompt = block && Array.isArray(basePrompt) ? [...basePrompt, block] : undefined;
      if (!message && !systemPrompt) return;
      return {
         ...(message ? { message } : {}),
         ...(systemPrompt ? { systemPrompt } : {}),
      };
   });

   // Second handler: append-only task context refresh. Runs after the memoize
   // handler above (same registration order), returns at most one persisted
   // message per turn and never touches the system prompt.
   pi.on("before_agent_start", async (_event, ctx) => {
      if (!projectRoot || isSubAgent) return;
      const contextKey = rememberContextKey(ctx);
      const key = promptKey(projectRoot, contextKey);
      if (!memoizedTaskBlocks.has(key)) return;
      // Skip turn (escape hatch): inject nothing and leave the baseline alone so
      // the change is still reported on the next normal turn.
      if (!turnCache.get(projectRoot, contextKey).workflowMsg) return;

      const previous = taskBaselines.get(key) ?? null;
      const { taskDir } = resolveActiveTaskStatus(projectRoot, contextKey);
      const epochReset = baselineEpochInvalidated;
      if (
         taskDir &&
         previous &&
         previous.taskDir === taskDir &&
         !epochReset &&
         previous.signature === taskContextSignature(projectRoot, taskDir, agentType)
      ) {
         return;
      }
      baselineEpochInvalidated = false;
      const plan = planTaskContextUpdate({
         previous,
         current: taskDir ? snapshotTask(taskDir, projectRoot).snapshot : null,
         limits: readContextInjectionLimits(projectRoot),
         epochReset,
         promptHasTask: (memoizedTaskBlocks.get(key) ?? "") !== "",
      });
      taskBaselines.set(key, plan.baseline);
      if (!plan.content) return;
      return {
         message: {
            customType: TASK_CONTEXT_UPDATE_TYPE,
            content: plan.content,
            display: false,
         },
      };
   });

   // context fires before EVERY LLM API call (including tool-use continuations
   // and post-compaction agent.continue() paths). It only acts as a safety net
   // for the workflow breadcrumb; task context is never rewritten here because
   // any change to an earlier message breaks the provider prefix cache.
   pi.on("context", async (event, ctx) => {
      if (!projectRoot) return;
      const contextKey = rememberContextKey(ctx);

      const messages = event.messages as { role?: string; customType?: string; content?: string }[];

      // Resolve the turn state before the fast path: a skip turn must still
      // run breadcrumb cleanup even when nothing else changed.
      const cached = turnCache.get(projectRoot, contextKey);
      const skipping = !cached.workflowMsg;

      if (!skipping && !compactionPending) return;

      if (skipping) {
         // Skip turn (escape hatch): drop any persisted breadcrumb from an
         // earlier turn so the skip actually takes effect.
         const withoutBreadcrumb = messages.filter(
            (message) => !(message.role === "custom" && message.customType === WORKFLOW_STATE_TYPE),
         );
         if (withoutBreadcrumb.length === messages.length) return;
         compactionPending = false;
         return { messages: withoutBreadcrumb };
      }

      // Post-compaction: reverse-scan to confirm absence before injecting
      for (let i = messages.length - 1; i >= 0; i--) {
         if (messages[i].role === "custom" && messages[i].customType === WORKFLOW_STATE_TYPE) {
            compactionPending = false;
            return;
         }
      }

      compactionPending = false;
      return {
         messages: [
            ...messages,
            {
               role: "custom" as const,
               customType: WORKFLOW_STATE_TYPE,
               content: cached.workflowMsg,
               display: false,
               timestamp: Date.now(),
            },
         ],
      };
   });

   // OMP passes Bash event.input through to the tool execution parameters, so
   // inject the session key through the shell-agnostic env field. An explicit
   // per-call value wins over the derived key.
   pi.on("tool_call", (event, ctx) => {
      if (event.toolName !== "bash") return;
      const contextKey = rememberContextKey(ctx);
      if (!contextKey) return;
      const input = event.input as { env?: Record<string, string> };
      input.env = {
         TRELLIS_CONTEXT_ID: contextKey,
         ...input.env,
      };
   });

   pi.on("input", async (event, ctx) => {
      if (!projectRoot) {
         projectRoot = findProjectRoot(ctx.cwd);
      }
      // Resolve projectRoot on first input if session_start missed it
      if (!projectRoot) return;
      const contextKey = rememberContextKey(ctx);

      // Check if this turn should skip workflow state injection
      const skipKeyword = readPromptInjectionSkipKeyword(projectRoot);
      const skipThisTurn = shouldSkipWorkflowState(event.text ?? "", skipKeyword);

      // Record the turn's skip decision and pre-warm the cache so
      // before_agent_start and context can use it
      turnCache.beginTurn(skipThisTurn);
      turnCache.get(projectRoot, contextKey);
   });
}
