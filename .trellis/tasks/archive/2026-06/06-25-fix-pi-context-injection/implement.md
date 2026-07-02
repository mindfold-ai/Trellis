# Implementation Plan

## Files to Change

- `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
- `packages/cli/test/templates/pi.test.ts`
- `packages/cli/test/configurators/platforms.test.ts`
- `.trellis/spec/cli/backend/platform-integration.md`
- `.trellis/tasks/06-25-fix-pi-context-injection/prd.md`
- `.trellis/tasks/06-25-fix-pi-context-injection/design.md`
- `.trellis/tasks/06-25-fix-pi-context-injection/implement.md`

## Ordered Steps

1. Update Pi extension event handlers.
   - Remove the Trellis runtime-context `input` transform handler instead of keeping a no-op handler.
   - Preserve `before_agent_start.systemPrompt` for startup/full task context, but remove per-turn `turn.wf` / `turn.ov` from that path.
   - Add `before_agent_start.message` as a hidden persistent custom message for the compact runtime context formerly appended by `input`.
   - Keep the existing `context` handler if it only calls `getKey(event, ctx)`; do not use `context` for prompt injection.

2. Update Pi template tests.
   - Assert user input is not rewritten because no `input` handler is registered.
   - Assert first `before_agent_start` returns `systemPrompt` with startup/task context and a hidden compact runtime custom message.
   - Assert second `before_agent_start` does not repeat one-shot startup context or compact runtime context in `systemPrompt`.
   - Assert `context` remains registered but no longer carries runtime message injection logic.

3. Update configurator tests.
   - Generated Pi extension should contain the `message` hidden custom-message contract.
   - Generated Pi extension should contain `customType: "trellis-runtime-context"` and `display: false`.
   - Generated Pi extension should contain `systemPrompt:` and `pi.on?.("context"`.
   - Generated Pi extension should not contain `action: "transform"` or `pi.on?.("input"`.

4. Update platform integration spec.
   - Document that Pi no longer registers an `input` handler for Trellis runtime context injection.
   - Document `before_agent_start.systemPrompt` as the preserved startup/full task context path.
   - Document `before_agent_start.message` as the only per-turn compact workflow-state and session overview path.
   - Document that `context` remains getKey-only and is not used for Trellis runtime prompt injection because request-local messages are not prefix-cache stable.

5. Run targeted validation.
   - `pnpm --filter @mindfoldhq/trellis test test/templates/pi.test.ts test/configurators/platforms.test.ts test/configurators/index.test.ts`

6. Before finalizing implementation, run GitNexus `detect_changes()` as required by repository rules.
   - Preferred: `node .gitnexus/run.cjs detect_changes --scope compare --base-ref main`
   - Fallback: `node .gitnexus/run.cjs detect_changes`

## Expected Code Shape

`input`:

```ts
// No Trellis runtime-context input handler. Do not register pi.on?.("input", ...).
```

`before_agent_start`:

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

`context`:

```ts
pi.on?.("context", (event, ctx) => {
  getKey(event, ctx);
});
```

## Validation Details

Specific behaviors to assert in tests:

- Input handling:
  - No `input` handler is registered for Trellis runtime context injection.
  - Generated extension does not contain `action: "transform"`.

- First `before_agent_start`:
  - Return object has both `systemPrompt` and `message`.
  - `systemPrompt` contains base prompt, `Trellis compact SessionStart context`, `<first-reply-notice>`, `<trellis-workflow>`, `Phase 1: Plan`, and `No active Trellis task found`; it does not contain `<workflow-state>`.
  - `message` has `customType: "trellis-runtime-context"` and `display: false`; Pi converts it to a persisted `role: "custom"` session message.
  - `message.content` contains `<workflow-state>` and `<session-overview>`, and does not contain base prompt or one-shot startup context.

- Second `before_agent_start` for same context key:
  - Return object still has both `systemPrompt` and hidden runtime custom message.
  - Startup context is not repeated in `systemPrompt`.
  - Active task context remains present in `systemPrompt`; workflow-state and session overview remain present only in the hidden runtime custom message.

- Handler registration:
  - `input` handler is absent.
  - `context`, `tool_call`, and `tool_result` handlers remain present.

## Rollback Plan

If `before_agent_start.message` proves incompatible with Pi runtime, revert only the custom message addition and test/spec changes from this task. Keep user input unmodified unless a separate Pi-supported hidden persistent channel is identified.
