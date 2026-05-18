# Design: Channel Worker OOM Guard

## Status

Draft. User decisions so far:

- idle worker cleanup default: 5 minutes
- live-worker budget default: 6 workers per project/scope
- live-worker overflow: clean expired idle workers first, then reject new spawn
  if still over budget; do not auto-kill arbitrary non-expired workers
- guard defaults should be stored in `.trellis/config.yaml`, with CLI flags for
  per-invocation overrides

## Problem

`trellis channel spawn` creates resident provider workers through the CLI
supervisor. Today idle workers can remain alive until the user manually kills
them. Repeated local use can accumulate Claude/Codex processes until the
machine OOMs.

`@mindfoldhq/trellis-core` already has worker state, runtime contracts, and
host-local liveness probes. It should not become the provider process manager.
The immediate fix belongs in the CLI runtime layer, with small core substrate
changes only where state projection needs a stable field.

## Boundaries

Core owns:

- worker activity projection
- `idleSince` derivation from durable events
- worker registry/list/watch API shape

CLI owns:

- spawn-time guard policy
- supervisor idle cleanup timers
- pid-file reads and process kills
- user-facing errors and override flags

Out of scope:

- full daemon runtime
- cross-machine worker management
- provider-specific memory introspection
- automatic eviction of active or non-expired workers

## Worker State

Add `idleSince?: string` to `WorkerState`.

Projection rules:

- On `spawned`: `activity = "idle"`, `idleSince = ev.ts`.
- On `turn_started`: `activity = "mid-turn"`, clear `idleSince`.
- On `turn_finished`: `activity = "idle"`, `idleSince = ev.ts`.
- On `interrupted`: `activity = "idle"`, `idleSince = ev.ts`.
- On terminal events: clear active turn fields; `idleSince` is not used for
  terminal workers.

This keeps idle definition event-sourced: idle means a live worker has no
active turn according to the durable channel log.

## Defaults

Define constants in CLI runtime policy code:

```ts
DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000;
DEFAULT_MAX_LIVE_WORKERS = 6;
```

`channel run` keeps its existing 5 minute timeout. Resident `channel spawn`
gets a default idle timeout, not a default hard lifetime timeout.

## CLI Surface

Extend `trellis channel spawn`:

- `--timeout <duration>` keeps current explicit hard-timeout behavior.
- No hard timeout is applied by default.
- `--idle-timeout <duration>` sets idle cleanup TTL for that worker.
- `--idle-timeout 0` disables idle cleanup for that worker.
- `--max-live-workers <n>` sets the live-worker budget for this spawn
  operation.
- `--max-live-workers 0` disables the spawn-time budget check.

Environment override support:

- `TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT`
- `TRELLIS_CHANNEL_MAX_LIVE_WORKERS`

Precedence:

1. CLI flag
2. environment variable
3. `.trellis/config.yaml`
4. default constant

Use existing duration parsing for durations. Reject negative durations and
negative worker limits.

## Persistent Config

Add a project-level config section to `.trellis/config.yaml`:

```yaml
channel:
  worker_guard:
    idle_timeout: 5m
    max_live_workers: 6
```

Rules:

- Missing config uses defaults.
- `idle_timeout: 0` disables idle cleanup for spawned workers by default.
- `max_live_workers: 0` disables the spawn-time budget check by default.
- CLI flags override config for one invocation.
- Environment variables override config for CI or non-project usage.

Implementation should add the same section to
`packages/cli/src/templates/trellis/config.yaml`. Existing projects should
receive it through the existing additive config-section update path rather than
overwriting user config.

## Spawn-Time Guard

Before forking a supervisor:

1. Resolve the channel and project scope.
2. Scan the project bucket for channels with `events.jsonl`.
3. Read each channel's events and project workers with `reduceWorkerRegistry`.
4. Probe local pid files to keep only live workers.
5. Clean expired idle workers:
   - worker is non-terminal
   - supervisor pid is alive
   - activity is `idle`
   - `idleSince` exists
   - `now - idleSince >= idleTimeoutMs`
6. Re-read/re-probe after cleanup.
7. If live worker count is still `>= maxLiveWorkers`, reject spawn.

The rejection error should include:

- scope/project key
- current live count and limit
- each live worker: channel, worker id, provider, lifecycle/activity, pid
- exact command shape to kill one worker
- override hint

Do not auto-kill non-expired idle workers, `mid-turn` workers, or workers with
missing/unknown activity. Blocking the new spawn is safer than killing the
wrong task.

## Idle Cleanup

Idle cleanup should run in two places:

1. Spawn-time guard: cleans stale idle workers before enforcing budget.
2. Supervisor timer: each worker self-terminates after its own idle TTL.

Supervisor timer behavior:

- Start an idle timer after `spawned`.
- Reset/start idle timer when a turn finishes or is interrupted.
- Pause/clear idle timer when a turn starts.
- On idle timeout, call `shutdown.request("SIGTERM", "idle-timeout")`.

Event schema impact:

- Extend `killed.reason` to include `"idle-timeout"`.
- Existing `killed` event remains the observable terminal record.

The explicit `--timeout` hard-timeout feature remains available, but it is not
part of the default OOM guard. The default guard is idle cleanup plus
live-worker budget enforcement.

## Compatibility

- Explicit `--timeout` remains honored.
- Omitting `--timeout` means no hard lifetime kill.
- Existing channels and workers without `idleSince` project normally; only
  newly observed `spawned` and turn events drive idle cleanup.
- `channel run` defaults remain unchanged.
- `channel kill` and `channel rm` continue using existing pid-file behavior.
- Core public API gains an optional `idleSince` field; this is additive.

## Risks

- Some providers may have long model/tool waits that look `mid-turn`; idle TTL
  must not kill those.
- If adapters fail to emit `turn_started` / `turn_finished` accurately, idle
  cleanup could misclassify. The spawn-time cleanup should require durable
  `activity === "idle"` and a live pid.
- Self idle cleanup in supervisor needs a reliable hook from turn tracking or
  stdout parse results. If that hook is too invasive, implement spawn-time idle
  cleanup first and leave supervisor self-idle cleanup behind a small follow-up
  within the same task.
