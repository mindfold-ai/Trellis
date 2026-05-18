import type { AdapterEvent, ParseResult } from "./types.js";

/**
 * Codex `app-server` adapter (JSON-RPC 2.0 over stdio).
 *
 * Wire shape (real data — see research/probes/codex/*.jsonl):
 *
 *   Three inbound message kinds:
 *     1. Response to our outgoing request: { id, result } | { id, error }, no method
 *     2. Server-to-client request:         { method, id, params }    — must reply
 *     3. Notification:                     { method, params }        — fire-and-forget
 *
 *   Outbound: initialize → thread/start → turn/start
 *
 *   Translated events (per probe-findings.md):
 *     thread/start result.thread.id      → persistThreadId + persistSessionId (same UUIDv7)
 *     item/started   commandExecution    → progress(tool=shell, cmd, status=inProgress)
 *     item/started   mcpToolCall         → progress(kind=mcp, server, tool, args_summary)
 *     item/started   dynamicToolCall     → progress(kind=dynamic, namespace, tool, args)
 *     item/started   webSearch           → progress(kind=web_search, query)
 *     item/started   fileChange          → progress(kind=file_change)
 *     item/completed agentMessage        → say(text, phase)
 *     item/agentMessage/delta            → progress(kind, stream_id, text_delta)
 *     item/completed commandExecution    → optional progress(status, exitCode)
 *     item/started   collabAgentToolCall → error(reason=collab_blocked, recommendation=set features.multi_agent=false)
 *     turn/completed                     → done
 *     turn/aborted                       → error(reason=aborted)
 *     warning                            → progress(kind=warning, message)
 *     mcpServer/elicitation/request      → reply { action: accept, content: {} }  (auto-allow)
 *
 *   Notifications we skip silently:
 *     remoteControl/status/changed
 *     mcpServer/startupStatus/updated
 *     mcpServer/oauthLoginCompleted
 *     account/rateLimits/updated
 *     thread/tokenUsage/updated
 *     thread/status/changed
 *     thread/started        (we record thread id from thread/start result instead)
 *     turn/started
 *     serverRequest/resolved
 *     ItemGuardianApprovalReview* (until channel supports human-in-loop)
 *
 *  This module exposes:
 *   - parseCodexLine(line, ctx) — pure parser; ctx tracks pending outgoing ids
 *   - encodeCodexRequest / encodeCodexUserMessage — outbound framing helpers
 *   - buildCodexArgs                                — CLI args
 *   - createCodexCtx                                — state holder for pending ids
 */

export interface CodexCtx {
  /** id → label tracking outgoing requests, so adapter can recognise their responses. */
  pending: Map<number, "initialize" | "thread/start" | "turn/start" | "other">;
  /** Codex item id → stream metadata used to classify interleaved deltas. */
  items: Map<string, CodexItemMeta>;
  /** Whether the current turn has emitted a final user-visible answer. */
  finalMessageSeen: boolean;
  /** Codex may send turn/completed before the final agentMessage item. */
  pendingDone: boolean;
  /** Last-known thread id (used to scope future requests). */
  threadId?: string;
  /** Monotonic outbound id allocator. */
  nextId: number;
}

export function createCodexCtx(): CodexCtx {
  return {
    pending: new Map(),
    items: new Map(),
    finalMessageSeen: false,
    pendingDone: false,
    nextId: 1,
  };
}

interface CodexItemMeta {
  type?: string;
  phase?: string;
}

interface JsonRpcInbound {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string };
}

// ── methods we silently skip (noise filter) ──
const SKIP_METHODS = new Set<string>([
  "remoteControl/status/changed",
  "mcpServer/startupStatus/updated",
  "mcpServer/oauthLoginCompleted",
  "account/rateLimits/updated",
  "thread/tokenUsage/updated",
  "thread/status/changed",
  "thread/started",
  "turn/started",
  "serverRequest/resolved",
  "itemGuardianApprovalReview/started",
  "itemGuardianApprovalReview/completed",
]);

function summarize(input: unknown, max = 120): string {
  if (input === null || input === undefined) return "";
  let s: string;
  try {
    s = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    s = String(input);
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function parseCodexLine(line: string, ctx: CodexCtx): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { events: [] };

  let msg: JsonRpcInbound;
  try {
    msg = JSON.parse(trimmed) as JsonRpcInbound;
  } catch {
    return {
      events: [
        {
          kind: "error",
          payload: {
            message: "Failed to parse Codex stdout line",
            raw_excerpt: trimmed.slice(0, 200),
          },
        },
      ],
    };
  }

  // (1) Server-to-client request: method AND id
  if (msg.method && msg.id !== undefined) {
    return handleServerRequest(msg);
  }

  // (2) Response to our outgoing request: id present, no method
  if (msg.id !== undefined && msg.method === undefined) {
    return handleResponse(msg, ctx);
  }

  // (3) Notification
  if (msg.method) {
    return handleNotification(msg, ctx);
  }

  return { events: [] };
}

function handleServerRequest(msg: JsonRpcInbound): ParseResult {
  const events: AdapterEvent[] = [];
  let result: unknown = { action: "decline" };

  if (msg.method === "mcpServer/elicitation/request") {
    // MVP: auto-allow MCP tool calls. The channel worker spawn is already
    // trusted by whoever ran `trellis channel spawn`; permission boundary
    // is at the spawn call, not per-MCP-call.
    result = { action: "accept", content: {} };
    const params = (msg.params ?? {}) as Record<string, unknown>;
    const meta = (params._meta ?? {}) as Record<string, unknown>;
    events.push({
      kind: "progress",
      payload: {
        detail: {
          kind: "mcp_elicitation_auto_accept",
          server: params.serverName,
          tool_description: meta.tool_description,
        },
      },
    });
  } else {
    // Unknown server-initiated request: decline + log
    events.push({
      kind: "error",
      payload: {
        message: `Unknown server-initiated request: ${msg.method}`,
        request_id: msg.id,
      },
    });
  }

  return {
    events,
    side: {
      reply: [JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n"],
    },
  };
}

function handleResponse(msg: JsonRpcInbound, ctx: CodexCtx): ParseResult {
  const id = msg.id as number;
  const label = ctx.pending.get(id);
  ctx.pending.delete(id);

  const events: AdapterEvent[] = [];
  const side: ParseResult["side"] = {
    resolved: [{ id, result: msg.result, error: msg.error }],
  };

  if (msg.error) {
    events.push({
      kind: "error",
      payload: {
        message: `RPC error for ${label ?? "<unknown>"} (id=${id}): ${msg.error.message ?? ""}`,
        code: msg.error.code,
      },
    });
    return { events, side };
  }

  if (label === "thread/start" && isObject(msg.result)) {
    const thread = (msg.result as { thread?: Record<string, unknown> }).thread;
    if (isObject(thread)) {
      const threadId = (thread.id ?? thread.sessionId) as string | undefined;
      if (threadId) {
        ctx.threadId = threadId;
        side.persistThreadId = threadId;
        // Treat thread id == session id for adapter consumers (codex uses
        // same UUIDv7 for both in observed traces).
        side.persistSessionId = threadId;
      }
    }
  }

  return { events, side };
}

function handleNotification(msg: JsonRpcInbound, ctx: CodexCtx): ParseResult {
  const method = msg.method as string;

  if (SKIP_METHODS.has(method)) return { events: [] };

  switch (method) {
    case "item/started":
      return handleItemStarted(msg, ctx);
    case "item/completed":
      return handleItemCompleted(msg, ctx);
    case "item/agentMessage/delta":
      return handleAgentMessageDelta(msg, ctx);
    case "turn/completed":
      if (ctx.finalMessageSeen) {
        ctx.pendingDone = false;
        return { events: [{ kind: "done", payload: {} }] };
      }
      ctx.pendingDone = true;
      return { events: [] };
    case "turn/aborted":
      return {
        events: [{ kind: "error", payload: { message: "turn aborted" } }],
      };
    case "warning":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: {
                kind: "warning",
                message:
                  ((msg.params ?? {}) as { message?: string }).message ??
                  "<no message>",
              },
            },
          },
        ],
      };
    case "mcp/toolCall/progress":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: {
                kind: "mcp_progress",
                text_delta:
                  ((msg.params ?? {}) as { message?: string }).message ?? "",
              },
            },
          },
        ],
      };
    default:
      return { events: [] };
  }
}

function handleItemStarted(msg: JsonRpcInbound, ctx: CodexCtx): ParseResult {
  const item = ((msg.params ?? {}) as { item?: Record<string, unknown> }).item;
  if (!isObject(item)) return { events: [] };
  rememberItem(ctx, item);
  const t = item.type as string | undefined;
  switch (t) {
    case "commandExecution":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: {
                tool: "shell",
                cmd: summarize(item.command),
                status: item.status,
              },
            },
          },
        ],
      };
    case "mcpToolCall":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: {
                kind: "mcp",
                server: item.server,
                tool_name: item.tool,
                args_summary: summarize(item.arguments),
              },
            },
          },
        ],
      };
    case "dynamicToolCall":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: {
                kind: "dynamic_tool",
                namespace: item.namespace,
                tool_name: item.tool,
                args_summary: summarize(item.arguments),
              },
            },
          },
        ],
      };
    case "webSearch": {
      const action = (item.action ?? {}) as { query?: string };
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: {
                kind: "web_search",
                query: action.query,
              },
            },
          },
        ],
      };
    }
    case "fileChange":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: { kind: "file_change", status: item.status },
            },
          },
        ],
      };
    case "imageView":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: { kind: "image_view", path: item.path },
            },
          },
        ],
      };
    case "collabAgentToolCall":
      return {
        events: [
          {
            kind: "error",
            payload: {
              message:
                "Worker tried to spawn codex sub-agent (collabAgentToolCall) — channel blocks this",
              recommendation:
                "thread/start must set features.multi_agent=false to prevent recursion",
              receiver_thread_ids: item.receiverThreadIds,
            },
          },
        ],
      };
    case "agentMessage":
    case "userMessage":
    case "reasoning":
    case "plan":
    case "hookPrompt":
    case "contextCompaction":
    case "enteredReviewMode":
    case "exitedReviewMode":
      return { events: [] };
    default:
      // Unknown item type — silently passthrough (don't broadcast to peers
      // but keep events.jsonl raw record by emitting nothing here; the
      // raw line is logged separately).
      return { events: [] };
  }
}

function handleItemCompleted(msg: JsonRpcInbound, ctx: CodexCtx): ParseResult {
  const item = ((msg.params ?? {}) as { item?: Record<string, unknown> }).item;
  if (!isObject(item)) return { events: [] };
  rememberItem(ctx, item);
  const t = item.type as string | undefined;

  switch (t) {
    case "agentMessage": {
      const text = (item.text as string | undefined) ?? "";
      if (!text) return { events: [] };
      const phase = item.phase as string | undefined;
      // Codex emits `commentary` agentMessages as inline narration / thinking
      // during a turn; the actual user-visible answer is the `final_answer`
      // (or an agentMessage without a phase). Map commentary onto `progress` so the
      // log's `kind:message` stays "one turn-answer per event" and
      // `--no-progress` / `wait --kind message` behave as expected.
      if (phase === "commentary") {
        // Codex commentary chunks can be multi-kB per turn; truncating
        // here keeps events.jsonl from ballooning over long sessions
        // (list.ts / messages.ts read the whole file each invocation).
        return {
          events: [
            {
              kind: "progress",
              payload: {
                detail: {
                  kind: "commentary",
                  text_delta: summarize(text, 4000),
                },
              },
            },
          ],
        };
      }
      ctx.finalMessageSeen = true;
      const events: AdapterEvent[] = [{ kind: "message", payload: { text } }];
      if (ctx.pendingDone) {
        ctx.pendingDone = false;
        events.push({ kind: "done", payload: {} });
      }
      return { events };
    }
    case "commandExecution": {
      const exitCode = item.exitCode as number | undefined;
      if (exitCode !== undefined && exitCode !== 0) {
        return {
          events: [
            {
              kind: "progress",
              payload: {
                detail: {
                  tool: "shell",
                  status: "failed",
                  exit_code: exitCode,
                  duration_ms: item.durationMs,
                },
              },
            },
          ],
        };
      }
      return { events: [] };
    }
    case "mcpToolCall": {
      if (item.error) {
        return {
          events: [
            {
              kind: "progress",
              payload: {
                detail: {
                  kind: "mcp",
                  status: "failed",
                  server: item.server,
                  tool_name: item.tool,
                  error: summarize(item.error),
                  duration_ms: item.durationMs,
                },
              },
            },
          ],
        };
      }
      return { events: [] };
    }
    default:
      return { events: [] };
  }
}

function handleAgentMessageDelta(
  msg: JsonRpcInbound,
  ctx: CodexCtx,
): ParseResult {
  const params = msg.params ?? {};
  const delta =
    (params as { delta?: string; text?: string }).delta ??
    (params as { text?: string }).text;
  if (!delta) return { events: [] };

  const itemId =
    typeof params.itemId === "string" ? (params.itemId as string) : undefined;
  const item = isObject(params.item) ? params.item : undefined;
  if (item) rememberItem(ctx, item);
  const meta =
    itemId !== undefined ? ctx.items.get(itemId) : item && itemMeta(item);
  const kind = classifyAgentMessageDelta(meta);
  const detail: Record<string, unknown> = { kind, text_delta: delta };
  if (itemId) detail.stream_id = itemId;
  if (meta?.phase) detail.phase = meta.phase;

  return {
    events: [
      {
        kind: "progress",
        payload: { detail },
      },
    ],
  };
}

function rememberItem(ctx: CodexCtx, item: Record<string, unknown>): void {
  const id = item.id;
  if (typeof id !== "string") return;
  ctx.items.set(id, itemMeta(item));
}

function itemMeta(item: Record<string, unknown>): CodexItemMeta {
  return {
    type: typeof item.type === "string" ? item.type : undefined,
    phase: typeof item.phase === "string" ? item.phase : undefined,
  };
}

function classifyAgentMessageDelta(meta: CodexItemMeta | undefined): string {
  if (meta?.type === "reasoning") return "reasoning";
  if (meta?.phase === "commentary") return "commentary";
  return "output";
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

// ── Outbound helpers ──

export function encodeCodexRequest(
  ctx: CodexCtx,
  method: string,
  params: unknown,
  label: "initialize" | "thread/start" | "turn/start" | "other" = "other",
): { id: number; line: string } {
  const id = ctx.nextId++;
  ctx.pending.set(id, label);
  const line = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  return { id, line };
}

export function encodeCodexUserMessage(
  ctx: CodexCtx,
  text: string,
): { id: number; line: string } {
  if (!ctx.threadId) {
    throw new Error(
      "Codex adapter: thread/start has not completed; cannot send user message yet",
    );
  }
  ctx.finalMessageSeen = false;
  ctx.pendingDone = false;
  return encodeCodexRequest(
    ctx,
    "turn/start",
    {
      threadId: ctx.threadId,
      input: [{ type: "text", text }],
    },
    "turn/start",
  );
}

export function encodeCodexInterruptMessage(
  ctx: CodexCtx,
  text: string,
): { id: number; line: string } {
  return encodeCodexUserMessage(
    ctx,
    "[GRID INTERRUPT - drop current work and follow this new instruction]\n" +
      text,
  );
}

export function buildCodexArgs(opts: { model?: string }): string[] {
  const args = ["app-server"];
  if (opts.model) args.push("-c", `model="${opts.model}"`);
  return args;
}

export function buildCodexThreadStartParams(
  cwd: string,
  systemPrompt?: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    cwd,
    // MVP: aggressive permissive defaults to avoid getting stuck mid-turn.
    approvalPolicy: "never",
    sandbox: "workspace-write",
    // Disable codex native multi-agent so spawned worker can't recurse into
    // its own sub-agents (would conflict with channel's collaboration layer
    // and reproduce issue #234/#237 recursion).
    config: {
      features: {
        multi_agent: false,
        multi_agent_v2: { enabled: false },
      },
    },
  };
  if (systemPrompt?.trim()) {
    params.developerInstructions = systemPrompt;
  }
  return params;
}
