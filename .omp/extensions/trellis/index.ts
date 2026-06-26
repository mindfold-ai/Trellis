import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
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

function resolveContextKey(): string | null {
   // 1. 显式覆盖 — Trellis hooks 启动子进程时设置
   const override = process.env.TRELLIS_CONTEXT_ID?.trim();
   if (override) {
      return sanitizeKey(override) || hashValue(override);
   }
   return null;
}

// ---------------------------------------------------------------------------
// Active task resolution
// ---------------------------------------------------------------------------

function resolveActiveTaskStatus(
   projectRoot: string,
): { status: string; taskDir: string | null; taskTitle: string | null } {
   const sessionsDir = join(projectRoot, ".trellis", ".runtime", "sessions");
   if (!existsSync(sessionsDir)) return { status: "no_task", taskDir: null, taskTitle: null };

   // --- 通过 context key 解析 session 文件 ---
   const contextKey = resolveContextKey();
   let sessionFilePath: string | null = null;

   if (contextKey) {
      // 有身份标识：直接定位文件
      const candidate = join(sessionsDir, `${contextKey}.json`);
      if (existsSync(candidate)) {
         sessionFilePath = candidate;
      }
   }

   if (!sessionFilePath) {
      // 单 session fallback：恰好 1 个文件时使用，否则拒绝猜测
      let sessionFiles: string[];
      try {
         sessionFiles = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
      } catch {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
      if (sessionFiles.length === 1) {
         sessionFilePath = join(sessionsDir, sessionFiles[0]);
      } else {
         // 0 或 ≥2 个文件且无身份标识：返回 no_task，不跨会话猜测
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

function buildSessionContext(projectRoot: string): string {
   const script = join(projectRoot, ".trellis", "scripts", "get_context.py");
   if (!existsSync(script)) return "";

   try {
      const result = spawnSync("python3", [script], {
         cwd: projectRoot,
         encoding: "utf-8",
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
            let content = "";
            try { content = readFileSync(join(projectRoot, file), "utf-8"); } catch { }
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

   get(projectRoot: string): { workflowMsg: string } {
      const now = Date.now();
      if (
         this.key === projectRoot &&
         now - this.timestamp < TurnContextCache.TTL_MS
      ) {
         return { workflowMsg: this.workflowMsg };
      }

      const { status } = resolveActiveTaskStatus(projectRoot);

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

      this.key = projectRoot;
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
   pi.setLabel("Trellis");

   let projectRoot: string | null = null;
   const turnCache = new TurnContextCache();
   const agentType = detectAgentType();
   const isSubAgent = agentType !== null;

   // Tracks compaction boundaries — context handler skips scanning when no
   // compaction has occurred since last injection.
   let lastCompactionTs = 0;
   let lastInjectionTs = 0;

   pi.on("session_start", async (_event, ctx) => {
      projectRoot = findProjectRoot(ctx.cwd);
      // Derive context key from OMP session identity and export it so
      // resolveActiveTaskStatus() and spawned subprocesses (get_context.py,
      // task.py) can locate the correct session runtime file.
      if (!process.env.TRELLIS_CONTEXT_ID) {
         const sessionId = (ctx.sessionManager as { getSessionId?: () => string }).getSessionId?.();
         if (sessionId) {
            process.env.TRELLIS_CONTEXT_ID = buildContextKey("pi", "session", sessionId);
         }
      }

      if (!projectRoot) return;

      if (isSubAgent) {
         // Sub-agent: inject precise task context once
         const { taskDir } = resolveActiveTaskStatus(projectRoot);
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
         const sessionContext = buildSessionContext(projectRoot);
         if (sessionContext) {
            await pi.sendMessage({
               customType: "trellis-session-context",
               content: sessionContext,
               display: false,
            });
         }

         const { taskDir } = resolveActiveTaskStatus(projectRoot);
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

      // Persistent injection: workflow state for this turn
      const cached = turnCache.get(projectRoot);
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
   pi.on("context", async (event) => {
      if (!projectRoot) return;

      // Fast path: no compaction since last injection — message is still present
      if (lastInjectionTs > lastCompactionTs) return;

      const cached = turnCache.get(projectRoot);
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
               role: "custom",
               customType: "trellis-workflow-state",
               content: cached.workflowMsg,
               timestamp: Date.now(),
            },
         ],
      };
   });

   pi.on("input", async (_event, ctx) => {
      if (!projectRoot) {
         projectRoot = findProjectRoot(ctx.cwd);
      }
      // Resolve projectRoot on first input if session_start missed it
      if (!projectRoot) return { action: "continue" };
      // Pre-warm the cache so before_agent_start and context can use it
      turnCache.get(projectRoot);
      return { action: "continue" };
   });
}
