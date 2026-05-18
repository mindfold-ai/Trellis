# Implementation Plan: Channel Worker OOM Guard

## Order

1. Core worker projection
   - Add `idleSince?: string` to `WorkerState`.
   - Update `reduceWorkerRegistry` projection rules.
   - Add/adjust core worker-state tests for spawn idle, turn start clearing,
     turn finish/interrupted resetting, and terminal behavior.

2. CLI guard policy module
   - Add a focused module under `packages/cli/src/commands/channel/` for
     worker guard policy.
   - Define defaults:
     - idle TTL: 5m
     - max live workers: 6
   - Implement flag/env/config/default resolution.
   - Read `.trellis/config.yaml` channel worker guard settings.
   - Implement project-scope live worker scan using existing channel project
     layout, events, worker registry, and pid files.
   - Implement expired idle cleanup by killing only live idle workers whose
     `idleSince` exceeds the configured idle TTL.

3. Spawn integration
   - Extend `SpawnOptions` and CLI command options:
     - `--idle-timeout <duration>`
     - `--max-live-workers <n>`
   - Keep `--timeout` explicit-only; do not add a default hard TTL.
   - Run guard before writing supervisor config / forking supervisor.
   - Print actionable overflow errors.

4. Supervisor idle timeout
   - Extend `SupervisorConfig` with `idleTimeoutMs`.
   - Pass it from spawn into supervisor config.
   - Add a supervisor idle timer that does not kill `mid-turn` workers.
   - Prefer `killed.reason = "idle-timeout"`; update core event type/spec
     accordingly.

5. Specs and docs
   - Update `.trellis/spec/cli/backend/commands-channel.md`:
     - new defaults
     - new flags/env vars
     - `.trellis/config.yaml` guard section
     - overflow behavior
     - idle-timeout event reason
   - Update `packages/cli/src/templates/trellis/config.yaml` with the new
     config section.
   - Add update/migration manifest support if needed so existing project
     configs receive the section additively.
   - Update task PRD acceptance checkboxes when implemented.

6. Validation
   - `pnpm --filter @mindfoldhq/trellis-core test`
   - `pnpm --filter @mindfoldhq/trellis test -- --runInBand` if supported, or
     targeted Vitest files for channel tests
   - `pnpm typecheck`
   - `pnpm lint`
   - `gitnexus_detect_changes({scope:"all"})`

## Files Likely To Change

- `packages/core/src/channel/internal/store/worker-state.ts`
- `packages/core/src/channel/internal/store/events.ts`
- `packages/core/src/channel/index.ts`
- `packages/core/test/channel/worker-state.test.ts`
- `packages/core/test/channel/channel-runtime.test.ts`
- `packages/cli/src/commands/channel/spawn.ts`
- `packages/cli/src/commands/channel/supervisor.ts`
- `packages/cli/src/commands/channel/supervisor/shutdown.ts`
- `packages/cli/src/commands/channel/supervisor/turns.ts`
- `packages/cli/src/commands/channel/index.ts`
- `packages/cli/src/templates/trellis/config.yaml`
- `packages/cli/src/commands/update.ts` or migration manifests if additive
  config-section registration is required
- `packages/cli/test/commands/channel*.test.ts`
- `.trellis/spec/cli/backend/commands-channel.md`

## Review Gates

- Do not edit supervisor/runtime symbols without GitNexus impact checks.
- Keep provider adapter behavior unchanged unless tests prove the idle timer
  needs an explicit turn hook.
- Do not move CLI supervisor/provider adapter code into core.
- Do not add a background daemon.

## Rollback

- Core `idleSince` is additive and can remain if CLI guard needs rollback.
- Spawn guard defaults can be disabled by setting effective idle/limit values
  to zero.
- Supervisor idle timer should be isolated so it can be reverted without
  touching explicit `--timeout` behavior.
