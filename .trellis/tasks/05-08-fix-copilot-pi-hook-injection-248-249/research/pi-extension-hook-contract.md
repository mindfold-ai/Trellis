# Research: Pi (pi-coding-agent) Extension Hook + Tool Contract

- **Query**: How does Pi's `input` hook inject `additionalContext`? Does `registerTool` accept a prompt-snippet field? Does `session_start` inject system prompt? (Q3 / Q4 / Q5)
- **Scope**: Mixed — read local `index.ts.txt` template, then external (npm package + GitHub repo `badlogic/pi-mono`)
- **Date**: 2026-05-08
- **Pi version sources**: latest npm published 2025-11-12 (`@mariozechner/pi-coding-agent`), GitHub `main` branch of `badlogic/pi-mono`, type defs cross-checked at commit `83378aad` and tag `v0.64.0`
- **Reporter Pi version**: 0.74.0 — all features described below were already shipped well before that (see "Capability landing" at the bottom)

---

## Findings

### Authoritative type definitions (canonical)

File: `packages/coding-agent/src/core/extensions/types.ts` (repo `badlogic/pi-mono`, branch `main`).
Mirrored runtime types: `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`.

The four hooks mentioned in the question have these exact event + result shapes:

```ts
// ── input ─────────────────────────────────────────────────────────────
export interface InputEvent {
  type: "input";
  text: string;                          // raw user input, BEFORE skill / template expansion
  images?: ImageContent[];
  source: InputSource;                   // "interactive" | "rpc" | "extension"
}

export type InputEventResult =
  | { action: "continue" }
  | { action: "transform"; text: string; images?: ImageContent[] }
  | { action: "handled" };

// ── before_agent_start ────────────────────────────────────────────────
export interface BeforeAgentStartEvent {
  type: "before_agent_start";
  prompt: string;
  images?: ImageContent[];
  systemPrompt: string;                  // chained, includes prior handlers' edits
  systemPromptOptions?: { /* customPrompt, selectedTools, toolSnippets,
                             promptGuidelines, appendSystemPrompt, cwd,
                             contextFiles, skills */ };
}

export interface BeforeAgentStartEventResult {
  message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
  systemPrompt?: string;                 // REPLACES the systemPrompt for this turn
}

// ── context ───────────────────────────────────────────────────────────
export interface ContextEvent {
  type: "context";
  messages: AgentMessage[];              // the FULL message array about to be sent to the LLM
}

export interface ContextEventResult {
  messages?: AgentMessage[];             // returning replaces the array
}

// ── session_start ─────────────────────────────────────────────────────
export interface SessionStartEvent { type: "session_start"; }
// NO result type — return value is ignored. session_start is a side-effect-only hook.
```

---

## Q3 — How to inject `additionalContext` into the model on each user prompt

**The `input` hook CANNOT inject extra system context.** Its return type is the
strict 3-variant union shown above:

| Variant | Effect |
|---|---|
| `{ action: "continue" }` | Pass through to skill/template expansion, then to the agent |
| `{ action: "transform", text }` | Rewrite the user's prompt text (and images) — the LLM only sees the rewritten text |
| `{ action: "handled" }` | Skip the agent loop entirely (extension already handled the message) |

There is no `additionalContext`, no `systemPrompt`, no `messages` field on
`InputEventResult`. The current Trellis handler

```ts
pi.on("input", (event, ctx) => {
  getContextKey(event, ctx);
  return { action: "continue" };
});
```

is therefore a **legal no-op** — it never had any chance of injecting
`<additional-context>`. To inject per-turn context, one of these three
mechanisms must be used instead (in order from "most natural for Trellis" to
"most invasive"):

### Option A (recommended) — `before_agent_start`

Pi documents `before_agent_start` as: *"Fired after user submits prompt, before
agent loop. Can inject a message and/or modify the system prompt."* This is the
direct equivalent of Claude Code's `UserPromptSubmit` hook with
`additionalContext`.

```ts
pi.on("before_agent_start", async (event, ctx) => {
  const contextKey = getContextKey(event, ctx);
  const additionalContext = await runInjectWorkflowState(projectRoot, contextKey);
  if (!additionalContext) return undefined;

  return {
    // 1) Inject as a persistent custom message (preferred for "additional context"):
    message: {
      customType: "trellis-context",
      content: [{ type: "text", text: additionalContext }],
      display: "Trellis Context",
    },
    // 2) Or append to the per-turn system prompt instead:
    // systemPrompt: event.systemPrompt + "\n\n" + additionalContext,
  };
});
```

`message` is appended to the session and sent to the LLM as a real message
(stored, replayed on resume). `systemPrompt` only affects the current turn and
chains across multiple `before_agent_start` handlers (see runner code:
`emitBeforeAgentStart` chains `currentSystemPrompt` between handlers).

The current Trellis extension already uses `before_agent_start` for the
"trellis-implement" main agent prompt (line 969–982 of `index.ts.txt`). To
support per-turn injection from `inject-workflow-state.py`, that handler can
either be extended, or a second `before_agent_start` handler registered.

### Option B — `context` event

`context` fires immediately before each LLM call and receives the full
`AgentMessage[]`. Returning `{ messages: AgentMessage[] }` replaces the array.
This is heavier (whole array each turn, no message storage in session log) and
better suited to compaction / truncation use-cases. The current Trellis handler
returns `{ messages }` only when `event.messages` is already an array (line
983–987), which is essentially a pass-through.

### Option C — `pi.sendUserMessage()` from `input`

`InputEventResult` itself is closed, but `ctx` exposes runtime actions. From
inside an `input` handler you can synchronously call `pi.sendUserMessage(...)`
(or `pi.sendMessage(...)` for non-user content). However this fires a separate
turn and does not pre-pend to the user's message, so it's not the right tool
for "augment this turn's prompt".

### Difference table — which hook supports what

| Hook | Result shape | Can inject system prompt? | Can inject a message? | Can replace messages array? | Can replace user prompt? |
|---|---|---|---|---|---|
| `input` | `{ action: "continue" \| "transform" \| "handled" }` | ✗ | ✗ (use `pi.sendMessage` from ctx, side-effect) | ✗ | ✓ via `transform.text` |
| `before_agent_start` | `{ message?, systemPrompt? }` | ✓ (chained, per-turn) | ✓ (persistent custom message) | ✗ | ✗ |
| `context` | `{ messages? }` | ✗ (system prompt is separate) | ✗ | ✓ (full replacement) | ✗ |
| `session_start` | (no result type — return ignored) | ✗ | ✗ (use `pi.sendMessage` actions) | ✗ | ✗ |

Source: `packages/coding-agent/src/core/extensions/types.ts` and
`runner.ts::emitInput` / `emitContext` / `emitBeforeAgentStart` /
`emitSessionStart`.

---

## Q4 — Pi `registerTool` prompt-level guidance fields

`ToolDefinition` accepts two optional, prompt-only fields that surface the tool
to the LLM at the system-prompt level. They were introduced in PR
[#1237](https://github.com/badlogic/pi-mono/pull/1237) (merged Feb 2026, before
0.74.0) and refined by issue
[#1720](https://github.com/badlogic/pi-mono/issues/1720) (Mar 2026).

| Field | Purpose | Where it ends up |
|---|---|---|
| `promptSnippet?: string` | One-liner shown in the system prompt's **"Available tools"** list | If omitted, the custom tool is **left out** of the Available-tools section entirely (LLM sees the tool spec via the API tool list, but no high-level prose about it) |
| `promptGuidelines?: string[]` | Bullets appended to the system prompt's **"Guidelines"** section, **only while the tool is active** (after `pi.setActiveTools`) | One bullet per array item, deduplicated globally |

The earlier PR named these `shortDescription` / `systemGuidelines`; the
follow-up renamed them to the canonical `promptSnippet` / `promptGuidelines`.
Both are documented under "pi.registerTool(definition)" in
`packages/coding-agent/docs/extensions.md`.

### Reference example from Pi docs

```ts
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM as tool spec)",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use my_tool for todo planning instead of direct file edits when the user asks for a task list.",
  ],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) { /* ... */ },
});
```

### Trellis applicability (Q4 fix)

The current Trellis registration at `index.ts.txt` lines 903–960 declares
`name`, `label`, `description`, `parameters`, `execute` only — Pi will list
the tool's API schema for the LLM, but the **system prompt itself contains no
high-level orientation** on when to use `subagent`. Adding `promptSnippet` +
`promptGuidelines` is exactly what the issue reporter is asking for.

```ts
pi.registerTool?.({
  name: "subagent",
  label: "Subagent",
  description: "Run a Trellis project sub-agent with active task context.",
  promptSnippet:
    "Delegate Trellis tasks to specialised sub-agents (implement, check, brainstorm, etc.) running in isolated child processes.",
  promptGuidelines: [
    "Use the subagent tool to invoke Trellis sub-agents (trellis-implement, trellis-check, trellis-brainstorm) instead of attempting their work yourself.",
    "Pick mode='single' for a single task, 'parallel' for independent fan-out, 'chain' for dependent steps using the prompts array.",
    "Always pass the user's task as `prompt`; only override `agent` when a non-default sub-agent is required.",
  ],
  parameters: { /* unchanged */ },
  execute: async (...) => { /* unchanged */ },
});
```

Note: `promptGuidelines` are only emitted while the tool is in the active-tools
set. The default behaviour after registration is that newly-registered tools
join the active set (issue #1720 wired `refreshTools()` so this works post-init
without `/reload`), so for a tool registered at extension boot this works
out-of-the-box.

---

## Q5 — `session_start` system-prompt injection

**`session_start` cannot inject system-prompt content via its return value.**

- `SessionStartEvent` has no `Result` type in `types.ts`.
- `runner.ts::emitSessionStart` does not read the handler return value.
- The Pi docs only show side-effect usage: `console.log`, `ctx.ui.notify`,
  `ctx.ui.setStatus`, and reading session entries via
  `ctx.sessionManager.getEntries()`.

The current Trellis `session_start` handler

```ts
pi.on?.("session_start", (event, ctx) => {
  getContextKey(event, ctx);
  ctx?.ui?.notify?.("Trellis project context is available. ...", "info");
});
```

is the documented pattern. A return value would be silently ignored.

### How to make `<session-overview>` appear (Q5 fix)

The `<session-overview>` (developer name, git branch, active tasks) belongs
where it can reach every turn. Two viable strategies:

1. **Move it into `before_agent_start`** — append to `event.systemPrompt` or
   inject as a `message` on the *first* turn only (gate via `appendEntry` so
   subsequent turns don't repeat). This is what other Pi extensions do for
   "session header" content.

2. **Use `pi.sendMessage` from `session_start`** — this sends a non-user
   custom message into the session log as soon as the session loads, before
   the user's first prompt. Example:

   ```ts
   pi.on("session_start", async (event, ctx) => {
     getContextKey(event, ctx);
     const overview = buildSessionOverview(projectRoot); // dev name, branch, active tasks
     pi.sendMessage(
       {
         customType: "trellis-session-overview",
         content: [{ type: "text", text: overview }],
         display: "Trellis Session Overview",
       },
       { triggerTurn: false, deliverAs: "nextTurn" },
     );
   });
   ```

   `triggerTurn: false` keeps Pi idle (no LLM call yet); `deliverAs: "nextTurn"`
   ensures the message is included in the next user-triggered turn's context.

Strategy (1) keeps everything in one hook (`before_agent_start`) and is more
robust if the user resumes/forks a session.

---

## Recommended Trellis fixes (minimal-diff sketch)

```ts
// ── 1) registerTool: add promptSnippet + promptGuidelines (Q4) ──────
pi.registerTool?.({
  name: "subagent",
  label: "Subagent",
  description: "Run a Trellis project sub-agent with active task context.",
  promptSnippet:
    "Delegate Trellis sub-tasks (implement / check / brainstorm / continue / ...) to dedicated sub-agents.",
  promptGuidelines: [
    "Use subagent for Trellis-managed tasks instead of doing the work directly: trellis-implement, trellis-check, trellis-brainstorm, etc.",
    "Choose mode='single' (default), 'parallel' (independent fan-out), or 'chain' (dependent steps). For parallel/chain, populate `prompts` instead of `prompt`.",
  ],
  parameters: { /* unchanged */ },
  execute: async (...) => { /* unchanged */ },
});

// ── 2) before_agent_start: also inject UserPromptSubmit-style context (Q3) ──
pi.on?.("before_agent_start", async (event, ctx) => {
  const contextKey = getContextKey(event, ctx);
  const baseSystem = (event as PiBeforeAgentStartEvent).systemPrompt ?? "";
  const trellisSystem = buildTrellisContext(
    projectRoot, "trellis-implement", event, ctx, contextKey,
  );

  // Run inject-workflow-state.py (UserPromptSubmit equivalent) per turn.
  const additionalContext = await runInjectWorkflowState(
    projectRoot, contextKey, (event as PiBeforeAgentStartEvent).prompt,
  );

  return {
    systemPrompt: [baseSystem, trellisSystem].filter(Boolean).join("\n\n"),
    ...(additionalContext
      ? {
          message: {
            customType: "trellis-additional-context",
            content: [{ type: "text", text: additionalContext }],
            display: "Trellis Context",
          },
        }
      : {}),
  };
});

// ── 3) session_start: emit <session-overview> via sendMessage (Q5) ──
pi.on?.("session_start", (event, ctx) => {
  getContextKey(event, ctx);
  const overview = buildSessionOverview(projectRoot); // dev name, branch, active tasks
  if (overview) {
    pi.sendMessage?.(
      {
        customType: "trellis-session-overview",
        content: [{ type: "text", text: overview }],
        display: "Trellis Session Overview",
      },
      { triggerTurn: false, deliverAs: "nextTurn" },
    );
  }
  ctx?.ui?.notify?.(
    "Trellis project context is available. Use /trellis-continue to resume the current task.",
    "info",
  );
});

// ── 4) input: leave as no-op or remove entirely ────────────────────
// The current { action: "continue" } is a legal but pointless no-op; it can be
// removed unless there is an interactive command to intercept.
```

`runInjectWorkflowState` would spawn `python3 .trellis/scripts/inject-workflow-state.py`
with the user prompt on stdin (Claude-Code-UserPromptSubmit-style), capture
its stdout (the `additionalContext` JSON / text), and return the text payload.

---

## Capability landing (Pi version reference)

The reporter is on Pi 0.74.0 (Nov 2025+). All capabilities below are present:

| Capability | Landed in / before |
|---|---|
| `input`, `before_agent_start`, `context`, `session_start` hooks | ≤ v0.63.2 (visible in `dist/core/extensions/types.d.ts@0.63.2`) |
| `BeforeAgentStartEventResult.message` + `.systemPrompt` chaining | ≤ v0.63.2 |
| `ContextEventResult.messages` replacement | ≤ v0.63.2 |
| `pi.sendMessage` / `pi.sendUserMessage` actions | ≤ v0.64.0 (see docs at tag `v0.64.0`) |
| `ToolDefinition.promptSnippet` | PR #1237 + #1720 (Feb–Mar 2026) — present on `main` as of fetch |
| `ToolDefinition.promptGuidelines` | renamed from `systemGuidelines` in #1720 follow-up — present on `main` |
| Dynamic `registerTool` after init (no `/reload`) | issue #1720 fix `bc2fa8d6` |

For Pi 0.74.0 specifically, `promptSnippet` + `promptGuidelines` are both
available (the renames + dynamic registration shipped together earlier in the
0.7x line).

---

## External References

- `@mariozechner/pi-coding-agent` on npm: <https://www.npmjs.com/package/@mariozechner/pi-coding-agent>
- Repo: <https://github.com/badlogic/pi-mono>
- Extensions doc (canonical): <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md>
- Hooks API ref: <https://pi.dev/docs/latest/extensions> and Mintlify mirror `https://pt-act-pi-mono.mintlify.app/api/coding-agent/hooks`
- Type defs: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts>
- `types.d.ts` snapshot at v0.63.2: <https://cdn.jsdelivr.net/npm/@mariozechner/pi-coding-agent@0.63.2/dist/core/extensions/types.d.ts>
- PR #1237 — `shortDescription` / `systemGuidelines` (later renamed): <https://github.com/badlogic/pi-mono/pull/1237>
- Issue #1720 — dynamic tool registration + `promptSnippet` / `promptGuidelines` rename: <https://github.com/badlogic/pi-mono/issues/1720>
- Example `examples/extensions/dynamic-tools.ts`, `input-transform.ts`, `send-user-message.ts` in same repo

---

## Caveats / Not Found

- Local install: there is **no** `@mariozechner/pi-coding-agent` checked into
  `node_modules/` of this Trellis repo (verified via filesystem find). All
  upstream evidence is from the GitHub source + npm jsdelivr-served `.d.ts`,
  not a locally-installed copy.
- Exact Pi version where `promptSnippet`/`promptGuidelines` were renamed (vs.
  the original `shortDescription`/`systemGuidelines` from PR #1237) is not
  pinned to a tagged release in any source examined; both PR #1720's landing
  commits (`bc2fa8d6`, `8d4a4948`) are on `main` and predate Pi 0.74.0.
- I did not verify by running Pi locally that `pi.sendMessage` from inside
  `session_start` actually carries through to the next turn's LLM payload —
  documentation and `runner.ts` strongly imply it does (the runtime action is
  bound before `session_start` fires), but a runtime spike would confirm
  whether `deliverAs: "nextTurn"` is the right choice vs. `"followUp"`.
- `event` argument types in the current Trellis extension (`PiBeforeAgentStartEvent`,
  `PiContextEvent`) are local hand-rolled interfaces — they are subset-compatible
  with the upstream types but do not import them. Switching to
  `import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, … } from "@mariozechner/pi-coding-agent"`
  would catch future breaking changes automatically.
