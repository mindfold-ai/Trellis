import type { AdapterEvent, ParseResult } from "./types.js";

/**
 * Claude `--input-format stream-json --output-format stream-json` adapter.
 *
 * Trace shape (real data, see research/probes/claude/list-files.jsonl):
 *   - system.subtype=hook_started   → skip (Claude-core hook lifecycle)
 *   - system.subtype=hook_response  → skip
 *   - system.subtype=init           → persist session_id; no event broadcast
 *   - assistant.message.content[]   → per-block: text → say, tool_use → progress,
 *                                      thinking → skip (verbose-only)
 *   - user.message.content[]        → tool_result → skip (noisy)
 *   - rate_limit_event              → skip
 *   - result                        → done (success) or error
 */

interface ClaudeRawMsg {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: ClaudeMessageContent;
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
}

interface ClaudeMessageContent {
  role?: string;
  model?: string;
  content?: ClaudeBlock[];
}

interface ClaudeBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

function summarizeInput(input: unknown, max = 120): string {
  if (input === null || input === undefined) return "";
  let s: string;
  try {
    s = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    s = String(input);
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function isMcpToolName(name: string): boolean {
  return /^mcp__/.test(name);
}

/**
 * Parse one line of Claude stream-json stdout.
 * Returns the channel events to emit + any side effects.
 *
 * Pure function: same input always produces same output. No I/O.
 */
export function parseClaudeLine(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { events: [] };

  let msg: ClaudeRawMsg;
  try {
    msg = JSON.parse(trimmed) as ClaudeRawMsg;
  } catch {
    return {
      events: [
        {
          kind: "error",
          payload: {
            message: "Failed to parse Claude stdout line",
            raw_excerpt: trimmed.slice(0, 200),
          },
        },
      ],
    };
  }

  switch (msg.type) {
    case "system":
      return handleSystem(msg);
    case "assistant":
      return handleAssistant(msg);
    case "user":
      return { events: [] };
    case "rate_limit_event":
      return { events: [] };
    case "result":
      return handleResult(msg);
    case "control_response":
      // Acknowledgement of our outbound control_request (e.g. interrupt).
      // Silently consume — supervisor doesn't need to wait on it.
      return { events: [] };
    default:
      return { events: [] };
  }
}

function handleSystem(msg: ClaudeRawMsg): ParseResult {
  if (msg.subtype === "init" && msg.session_id) {
    return {
      events: [],
      side: { persistSessionId: msg.session_id },
    };
  }
  return { events: [] };
}

function handleAssistant(msg: ClaudeRawMsg): ParseResult {
  const blocks = msg.message?.content;
  if (!Array.isArray(blocks)) return { events: [] };

  const events: AdapterEvent[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "text": {
        if (b.text && b.text.length > 0) {
          events.push({ kind: "message", payload: { text: b.text } });
        }
        break;
      }
      case "tool_use": {
        const name = b.name ?? "";
        const payload: Record<string, unknown> = {
          detail: {
            tool: name,
            input_summary: summarizeInput(b.input),
          },
        };
        if (isMcpToolName(name)) {
          const parts = name.split("__");
          (payload.detail as Record<string, unknown>).kind = "mcp";
          if (parts.length >= 3) {
            (payload.detail as Record<string, unknown>).server = parts[1];
            (payload.detail as Record<string, unknown>).tool_name = parts
              .slice(2)
              .join("__");
          }
        }
        events.push({ kind: "progress", payload });
        break;
      }
      case "thinking":
        // skip in default mode
        break;
      default:
        // unknown block type — skip silently
        break;
    }
  }
  return { events };
}

function handleResult(msg: ClaudeRawMsg): ParseResult {
  if (msg.is_error) {
    return {
      events: [
        {
          kind: "error",
          payload: {
            message: msg.result ?? "Claude reported is_error",
            duration_ms: msg.duration_ms,
          },
        },
      ],
    };
  }
  // Intentionally do NOT copy `msg.result` into `done.text`. Claude already
  // emitted the final text as an `assistant.message.content[].text` block,
  // which we turned into a `kind:message` event above. Repeating it on
  // `done` makes GUI consumers render the answer twice.
  return {
    events: [
      {
        kind: "done",
        payload: {
          duration_ms: msg.duration_ms,
          total_cost_usd: msg.total_cost_usd,
          num_turns: msg.num_turns,
        },
      },
    ],
  };
}

/**
 * Encode a channel user message into Claude stream-json stdin line(s).
 */
export function encodeClaudeUserMessage(text: string): string {
  const lines: string[] = [];
  lines.push(
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text }],
      },
    }),
  );
  return lines.join("\n") + "\n";
}

/**
 * Send Claude's provider-level interrupt control request before the
 * replacement prompt. Current SDK behavior is best-effort, but keeping it
 * separate from channel message metadata makes interrupt an explicit command path.
 */
export function encodeClaudeInterruptMessage(text: string): string {
  const lines = [
    JSON.stringify({
      type: "control_request",
      request_id: `trellis-int-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      request: { subtype: "interrupt" },
    }),
    encodeClaudeUserMessage(text).trimEnd(),
  ];
  return lines.join("\n") + "\n";
}

/**
 * Build the Claude CLI args for `claude -p` in stream-json mode.
 */
export function buildClaudeArgs(opts: {
  resumeSessionId?: string;
  model?: string;
  verbose?: boolean;
  /** Appended to Claude's default system prompt (per agent definition body). */
  systemPrompt?: string;
}): string[] {
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--permission-mode",
    "bypassPermissions",
    "--dangerously-skip-permissions",
  ];
  if (opts.verbose !== false) args.push("--verbose");
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  if (opts.model) args.push("--model", opts.model);
  if (opts.systemPrompt?.trim()) {
    args.push("--append-system-prompt", opts.systemPrompt);
  }
  return args;
}
