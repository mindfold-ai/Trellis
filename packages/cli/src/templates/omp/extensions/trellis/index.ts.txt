import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, dirname, isAbsolute, relative, resolve } from "node:path";
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

   const taskDir = join(projectRoot, currentTask);
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

function buildTaskContext(projectRoot: string, taskDir: string, agentType?: AgentType): string {
   const parts: string[] = [];
   // Resolved once per call (not per referenced file) — avoids re-parsing
   // config.yaml for every jsonl row.
   const trustedRoots = resolveTrustedRoots(projectRoot);

   // prd.md and info.md — always included
   let prd = "";
   try { prd = readFileSync(join(taskDir, "prd.md"), "utf-8"); } catch { }
   if (prd.trim()) parts.push(`## PRD\n\n${prd.trim()}`);

   let info = "";
   try { info = readFileSync(join(taskDir, "info.md"), "utf-8"); } catch { }
   if (info.trim()) parts.push(`## Info\n\n${info.trim()}`);

   // Determine which jsonl files to read based on agent type
   let jsonlNames: string[];
   if (agentType === "trellis-implement") {
      jsonlNames = ["implement.jsonl"];
   } else if (agentType === "trellis-check") {
      jsonlNames = ["check.jsonl"];
   } else if (agentType === "trellis-research") {
      jsonlNames = []; // research agent gets only prd + info
   } else {
      jsonlNames = ["implement.jsonl", "check.jsonl"]; // main session: all
   }

   for (const jsonlName of jsonlNames) {
      const jsonlPath = join(taskDir, jsonlName);
      if (!existsSync(jsonlPath)) continue;

      let lines: string[];
      try {
         lines = readFileSync(jsonlPath, "utf-8").split(/\r?\n/);
      } catch {
         continue;
      }

      const fileChunks: string[] = [];
      for (const line of lines) {
         const trimmed = line.trim();
         if (!trimmed) continue;
         try {
            const row = JSON.parse(trimmed) as Record<string, unknown>;
            const file = typeof row.file === "string" ? row.file.trim() : "";
            if (!file) continue;
            const targetPath = resolveProjectFile(projectRoot, file, trustedRoots);
            if (!targetPath) continue;
            let content = "";
            try { content = readFileSync(targetPath, "utf-8"); } catch { }
            if (content.trim()) {
               fileChunks.push(`### ${file}\n\n${content.trim()}`);
            }
         } catch {
            // seed rows and malformed lines are non-fatal
         }
      }

      if (fileChunks.length > 0) {
         parts.push(`## ${jsonlName}\n\n${fileChunks.join("\n\n---\n\n")}`);
      }
   }

   return parts.length > 0
      ? `<task-context>\n${parts.join("\n\n")}\n</task-context>`
      : "";
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
   private static readonly TTL_MS = 1500;

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

      this.workflowMsg = `<workflow-state>\n${workflowBody}\n</workflow-state>\n\n<session-overview>\n${SESSION_OVERVIEW_TEXT}\n</session-overview>`;

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

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function(pi: ExtensionAPI): void {
   let projectRoot: string | null = null;
   const turnCache = new TurnContextCache();
   const agentType = detectAgentType();
   const isSubAgent = agentType !== null;

   // Tracks compaction boundaries — context handler skips scanning when no
   // compaction has occurred since last injection.
   let lastCompactionTs = 0;
   let lastInjectionTs = 0;

   const rememberContextKey = (ctx?: { sessionManager?: { getSessionId?: () => string | undefined; getSessionFile?: () => string | undefined } }): string | null => {
      const key = deriveContextKey(ctx);
      if (!key) return null;
      return key;
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
                  customType: "trellis-task-context",
                  content: taskContext,
                  display: false,
               });
            }
         }
      } else {
         // Main session: inject session context (global map) + task context
         const sessionContext = buildSessionContext(projectRoot, contextKey);
         if (sessionContext) {
            await pi.sendMessage({
               customType: "trellis-session-context",
               content: sessionContext,
               display: false,
            });
         }

         const { taskDir } = resolveActiveTaskStatus(projectRoot, contextKey);
         if (taskDir) {
            const taskContext = buildTaskContext(projectRoot, taskDir);
            if (taskContext) {
               await pi.sendMessage({
                  customType: "trellis-task-context",
                  content: taskContext,
                  display: false,
               });
            }
         }

         ctx.ui.notify("Trellis workflow system available", "info");
      }
   });

   pi.on("session_before_compact", async () => {
      lastCompactionTs = Date.now();
   });

   pi.on("before_agent_start", async (_event, ctx) => {
      if (!projectRoot) {
         projectRoot = findProjectRoot(ctx.cwd);
      }
      if (!projectRoot) return;
      const contextKey = rememberContextKey(ctx);

      // Persistent injection: workflow state for this turn
      const cached = turnCache.get(projectRoot, contextKey);
      lastInjectionTs = Date.now();

      return {
         message: {
            customType: "trellis-workflow-state",
            content: cached.workflowMsg,
            display: false,
         },
      };
   });

   // context fires before EVERY LLM API call (including tool-use continuations
   // and post-compaction agent.continue() paths). Acts as a safety net when
   // before_agent_start's persisted message was removed by compaction.
   pi.on("context", async (event, ctx) => {
      if (!projectRoot) return;
      const contextKey = rememberContextKey(ctx);

      // Fast path: no compaction since last injection — message is still present
      if (lastInjectionTs > lastCompactionTs) return;

      const cached = turnCache.get(projectRoot, contextKey);
      if (!cached.workflowMsg) return;

      // Post-compaction: reverse-scan to confirm absence before injecting
      const messages = event.messages as { role?: string; customType?: string }[];
      for (let i = messages.length - 1; i >= 0; i--) {
         if (messages[i].role === "custom" && messages[i].customType === "trellis-workflow-state") {
            lastInjectionTs = Date.now();
            return;
         }
      }

      lastInjectionTs = Date.now();
      return {
         messages: [
            ...event.messages,
            {
               role: "custom" as const,
               customType: "trellis-workflow-state",
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

   pi.on("input", async (_event, ctx) => {
      if (!projectRoot) {
         projectRoot = findProjectRoot(ctx.cwd);
      }
      // Resolve projectRoot on first input if session_start missed it
      if (!projectRoot) return;
      const contextKey = rememberContextKey(ctx);
      // Pre-warm the cache so before_agent_start and context can use it
      turnCache.get(projectRoot, contextKey);
   });
}
