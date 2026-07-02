# Fix Pi Trellis runtime context injection

## Goal

Improve the Pi Trellis extension so compact Trellis workflow context is hidden from the visible user prompt and persists at a stable transcript position for provider prefix cache.

The intended outcome is:

- Pi users no longer see generated `<workflow-state>` / `<session-overview>` blocks appended to submitted user messages.
- Trellis does not rewrite user input with `input` transform.
- Trellis does not use request-local `context` messages for runtime prompt injection, because those messages are not persisted and move between turns, breaking provider prefix cache.
- Trellis preserves `before_agent_start.systemPrompt` for startup/full task context.
- Trellis moves the compact runtime context formerly appended by `input` into a hidden persistent Pi custom message returned from `before_agent_start`, so `<workflow-state>` / `<session-overview>` are not duplicated in `systemPrompt`.
- Bash tool calls and Trellis sub-agent launches keep the same `TRELLIS_CONTEXT_ID` session identity behavior.

## Confirmed Facts

- Current generated Pi extension lives at `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`.
- The previous `input` handler returned `action: "transform"` and appended Trellis context to user text, making generated context visible and persisted as user-authored text.
- A request-local `context` message can hide text, but request-local messages are not persisted. On the next user prompt, the old runtime context disappears and a new one appears later in the request, which disrupts provider prefix cache.
- Pi custom messages support `display: false`; hidden custom messages remain model-visible without being shown in the TUI.
- `before_agent_start` fires once per user prompt before the agent loop and can return both a modified `systemPrompt` and a message that is persisted into session history for that turn.
- Existing tests in `packages/cli/test/templates/pi.test.ts` and `packages/cli/test/configurators/platforms.test.ts` must protect the new contract.
- `.trellis/spec/cli/backend/platform-integration.md` documents Pi's injection mapping and must describe the hidden persistent custom-message path.

## Requirements

- Trellis must not register an `input` handler for runtime context injection; user input must pass through untouched.
- `input` must never return `action: "transform"` or append generated Trellis context to user text.
- Preserve the existing Pi `context` handler behavior if it only establishes the context key; do not use `context` for runtime prompt injection.
- Preserve `before_agent_start.systemPrompt` for startup/full task context, but remove per-turn `<workflow-state>` / `<session-overview>` from that path.
- `before_agent_start` must additionally return a hidden Pi custom message with `display: false` and `customType: "trellis-runtime-context"`.
- The custom message content must be model-visible and contain the compact runtime context formerly appended by `input`: current `<workflow-state>` and current `<session-overview>`.
- Keep the existing `TRELLIS_CONTEXT_ID` session-key behavior for Bash tool calls and sub-agent launches.
- Keep the existing `trellis_subagent` tool behavior and progress renderer unchanged.
- Update tests, task docs, and specs so the new behavior is explicit and regression-protected.

## Acceptance Criteria

- [ ] Generated Pi extension does not register a Trellis runtime-context `input` transform handler.
- [ ] Generated Pi extension does not use the Pi `context` event for Trellis runtime prompt injection; its existing `getKey`-only behavior may remain.
- [ ] Generated Pi extension preserves `before_agent_start.systemPrompt` startup/full task context injection without duplicating compact workflow/session context.
- [ ] Generated Pi extension additionally returns a hidden persistent custom message from `before_agent_start` containing compact workflow/session context.
- [ ] Unit tests verify user input is not rewritten, `before_agent_start` returns startup/full task system prompt context plus hidden runtime custom message, compact runtime context is absent from second-turn `systemPrompt`, and the `context` hook remains non-injecting.
- [ ] Pi platform integration spec describes the no-`input` / `before_agent_start.systemPrompt` + hidden custom message / `context` getKey-only mapping.
- [ ] Existing Pi template/configurator tests pass.

## Out of Scope

- Changing the `trellis_subagent` launcher behavior.
- Changing provider-level cache-control implementation inside pi-coding-agent.
- Changing non-Pi platform hook behavior.
- Removing `/trellis-start`; it remains a manual fallback for Pi.
