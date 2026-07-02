# Design: Pi compact runtime context via hidden persistent custom message

## Problem Restatement

The Pi extension must stop appending generated Trellis context to the visible user prompt. The original `input` transform made `<workflow-state>` and `<session-overview>` visible and persisted them as if the user had typed them. A request-local `context` message would hide the text, but it is not persisted; between user prompts it disappears from the old position and reappears near the new prompt, disrupting provider prefix cache.

The new contract keeps `before_agent_start.systemPrompt` for startup/full task context and moves the compact context formerly appended by `input` into a hidden custom message returned from `before_agent_start`. Pi persists that custom message into session history while hiding it from the UI with `display: false`, and `<workflow-state>` / `<session-overview>` are not duplicated in `systemPrompt`.

## Runtime Contract

| Data | Channel | Persistence | UI visibility | Rationale |
| --- | --- | ---: | ---: | --- |
| User-authored prompt | Normal Pi user message | Yes | Yes | Keep transcript clean and truthful. |
| Startup/full task context | `before_agent_start.systemPrompt` | Current agent loop | No | Preserve the existing high-priority startup/task context path without per-turn runtime duplication. |
| Compact workflow/session context | `before_agent_start.message` hidden custom message | Yes, in session history | No | Replaces old `input` transform while keeping provider prefix cache stable. |
| Bash/sub-agent session identity | `tool_call` command prefix and child process env | Tool execution only | Command mutation only | Makes `task.py current/start/finish` resolve the same session-local task. |

## Extension Flow

### `input`

Do not register a Trellis `input` handler for runtime context injection. The old handler existed to transform user text and should be removed rather than replaced with a no-op.

### `before_agent_start`

`before_agent_start` keeps startup/full task context in `systemPrompt` and additionally returns a hidden custom message for the compact runtime context:

```ts
pi.on?.("before_agent_start", (event, ctx) => {
  const k = getKey(event, ctx);
  const cur = (event as { systemPrompt?: string }).systemPrompt ?? "";
  const ctxText = buildContext(root, "trellis-implement", k);
  const turn = getTurnCtx(k);
  const startup = getStartupCtx(k, turn);
  const runtimeContext = [turn.wf, turn.ov].filter(Boolean).join("\n\n");
  return {
    message: runtimeContext
      ? {
          customType: "trellis-runtime-context",
          content: runtimeContext,
          display: false,
        }
      : undefined,
    systemPrompt: [cur, startup, ctxText].filter(Boolean).join("\n\n"),
  };
});
```

`getStartupCtx` remains one-shot per context key for the system prompt path. The custom message contains only compact runtime context (`<workflow-state>` and `<session-overview>`), matching the old `input` payload and preventing duplicate runtime context in the model request.

### `context`

Keep the existing `context` handler if it only calls `getKey(event, ctx)`. It must not append Trellis runtime messages. Request-local hidden messages are not persisted, so they move relative to previous turns and can invalidate provider prefix cache.

## Compatibility Notes

- `/trellis-start` remains generated as a manual fallback for Pi.
- `session_start` remains notify-only and should not be treated as model-visible context injection.
- `tool_call` Bash prefix behavior remains unchanged.
- `trellis_subagent` child process behavior remains unchanged.
- `customType` for the hidden compact message is `trellis-runtime-context`.

## Test Strategy

Update `packages/cli/test/templates/pi.test.ts` to cover:

- Extension registers `session_start`, `before_agent_start`, `context`, `tool_call`, and `tool_result`, but does not register `input`.
- User input is not rewritten because no `input` transform handler is registered.
- First `before_agent_start` returns `systemPrompt` with base prompt, startup context, and active-task fallback text; it must not contain `<workflow-state>`.
- First `before_agent_start` also returns `message` with `customType: "trellis-runtime-context"`, `display: false`, `<workflow-state>`, and `<session-overview>`, without base prompt or startup context.
- Second `before_agent_start` for the same context key keeps task context injection but does not repeat one-shot startup context and does not contain `<workflow-state>` / `<session-overview>` in `systemPrompt`.
- `context` remains registered but only preserves context-key behavior; it is not used for runtime message injection.

Update `packages/cli/test/configurators/platforms.test.ts` to assert the generated extension contains the hidden custom message contract, preserves `systemPrompt:`, does not contain `action: "transform"`, does not register `pi.on?.("input"`, and still registers `pi.on?.("context"`.

## Risks

- This relies on Pi persisting custom messages returned from `before_agent_start` and sending hidden custom messages to the model. That is the intended Pi contract for hidden persistent custom messages.
- The custom message is the only repeated per-turn compact workflow/session context path; startup/full task context migration and deduplication are left to a follow-up design.
