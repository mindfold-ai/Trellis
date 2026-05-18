# Guard channel workers against OOM

## Goal

Prevent local Trellis channel workers from exhausting user machines when
resident agents accumulate or run too long. The first release should add a
practical safety floor for CLI-managed workers without turning
`@mindfoldhq/trellis-core` into a provider-specific process manager.

## Requirements

- Add default protection for idle `trellis channel spawn` workers. Users should
  not need to remember manual cleanup to avoid unbounded resident workers.
- Add an idle-worker cleanup policy: a live worker with no active turn for the
  default idle TTL is eligible for cleanup.
- Default idle TTL is 5 minutes.
- Default live-worker budget is 6 workers per project/scope.
- Enforce a live-worker budget per scope/project before spawning. When the
  budget is reached, clean expired idle workers first; if the budget is still
  reached, reject the new spawn instead of guessing which non-expired worker to
  kill.
- Store default guard policy in project configuration so users can change it
  once instead of passing flags on every spawn.
- Keep `trellis channel run` behavior compatible: it already has a default
  timeout and should continue to preserve failed ephemeral channels for
  inspection.
- Keep the `@mindfoldhq/trellis-core` / CLI boundary intact:
  - core owns event schema, worker state projection, runtime contracts, and
    local liveness observation helpers;
  - CLI supervisor owns provider process launch, pid files, signals, and
    process exit behavior.
- Add a clear configuration / override path so advanced local dogfooding can
  intentionally run longer-lived workers without disabling safeguards by
  accident.
- Make guard actions observable through existing channel event surfaces
  (`supervisor_warning`, `killed`, `error`, worker registry, logs) rather than
  silently killing processes.
- Prefer bounded, reviewable runtime controls over a full daemon rewrite in
  this task.

## Acceptance Criteria

- [x] `trellis channel spawn` has a documented default idle cleanup policy
      unless explicitly overridden.
- [x] `trellis channel spawn` does not add a default hard timeout; explicit
      `--timeout` behavior remains unchanged.
- [x] There is a documented way to configure or opt out of default idle cleanup
      for intentional long-running idle sessions.
- [x] There is at least one worker-count or process-budget guard that prevents
      unlimited live worker accumulation in the same project/channel scope.
- [x] Default live-worker budget is 6.
- [x] `.trellis/config.yaml` has a documented channel worker guard section for
      idle cleanup TTL and max live workers.
- [x] Default idle cleanup kills workers that have been continuously idle for
      5 minutes, and does not kill workers that are `mid-turn`.
- [x] When live-worker budget is still exhausted after expired idle cleanup,
      `channel spawn` fails with a clear error listing live workers and the
      command shape for killing or overriding.
- [x] Guard failures and guard-triggered kills are visible in channel events,
      worker listing, or stderr/log output.
- [x] Existing explicit `--timeout`, `--warn-before`, `channel kill`,
      `channel rm`, `channel run`, strict delivery, and worker registry tests
      continue to pass.
- [x] Specs are updated to describe the new lifecycle defaults and overrides.
- [x] The task does not move CLI supervisor/provider adapter code wholesale into
      `packages/core`.

## Evidence Pass

Inspected sources:

- `packages/core/src/channel/api/runtime.ts`
- `packages/core/src/channel/api/spawn.ts`
- `packages/core/src/channel/api/workers.ts`
- `packages/core/src/channel/internal/store/worker-state.ts`
- `packages/cli/src/commands/channel/spawn.ts`
- `packages/cli/src/commands/channel/supervisor.ts`
- `packages/cli/src/commands/channel/supervisor/shutdown.ts`
- `packages/cli/src/commands/channel/kill.ts`
- `packages/cli/src/commands/channel/run.ts`
- `packages/cli/src/commands/channel/index.ts`
- `.trellis/tasks/05-14-channel-lib-worker-lifecycle-subscriptions/prd.md`
- `.trellis/tasks/05-14-channel-lib-worker-lifecycle-subscriptions/design.md`
- `.trellis/tasks/05-15-worker-dispatcher-observability-gaps/prd.md`
- `.trellis/spec/cli/backend/commands-channel.md`
- GitNexus query:
  `channel worker spawn supervisor timeout kill liveness process management memory OOM`

Confirmed facts:

- `@mindfoldhq/trellis-core` defines a provider-injected `WorkerRuntime`
  contract and event/state APIs. It does not launch Claude/Codex processes
  directly.
- `spawnWorker()` in core calls `runtime.start()` and appends a `spawned`
  event. It does not enforce idle cleanup, memory, or worker-count policy
  itself.
- CLI supervisor owns real child process launch, stdout/stderr pumping, signal
  handlers, pid files, cleanup, timeout kill, and pre-timeout warning.
- `trellis channel run` defaults to a 5 minute timeout.
- `trellis channel spawn` exposes `--timeout` and `--warn-before`, but no
  default timeout is applied when `--timeout` is omitted.
- Existing prior design explicitly rejected moving the whole CLI supervisor
  into core. The intended shape is reusable core contracts plus CLI/runtime
  execution policy.
- Core already has host-local `probeWorkerRuntime()` and
  `reconcileWorkerLiveness()` helpers, but these only observe/reconcile pid
  liveness; they do not enforce process budgets.
- Existing specs document timeout, warning, killed events, pid files, and
  cleanup behavior, but not a default resident-worker budget.

Repository-answerable questions already resolved:

- The OOM risk is not primarily a `trellis-core` memory leak based on current
  code shape; the immediate gap is unbounded idle resident process accumulation
  in CLI-managed workers.
- A full daemon rewrite is not required for the first protective release.
- Existing event schema can already represent killed worker outcomes.

Resolved product decisions:

- Default idle TTL is 5 minutes.
- Default live-worker budget is 6 workers per project/scope.
- Live-worker budget overflow should reject a new spawn after expired idle
  cleanup. It should not automatically kill old non-expired workers.
- No default hard TTL. Running workers should not be killed only because wall
  clock time elapsed. Hard timeout remains explicit via `--timeout`.
- Guard defaults should be stored in `.trellis/config.yaml`, with CLI flags as
  per-invocation overrides.

Remaining product decision:

- None blocking current design.

## Brainstorm Rounds

1. Decision: Create a focused OOM guard task instead of expanding the existing
   channel-as-lib design task.
   Evidence: Current issue is an operational safety regression in live CLI
   usage. Existing channel-as-lib work covers reusable substrate, not default
   process budgets.
   User answer: "ok" after agreeing this needs work because personal usage
   already OOMs.
   Resulting requirement: First implementation slice should add immediate
   resident worker safeguards while preserving core/CLI boundaries.
2. Decision: Live-worker budget overflow behavior.
   Evidence: Current worker registry can list active workers, but cannot know
   user intent. Auto-killing an arbitrary existing worker risks killing an
   expensive task.
   User answer: Asked what happens when the limit is exceeded.
   Resulting requirement: On budget overflow, first clean expired idle workers.
   If still over budget, reject the new spawn and print/list the live workers
   so the user can kill or override intentionally.
3. Decision: Idle definition and default cleanup.
   Evidence: Core already tracks `WorkerActivity = "idle" | "mid-turn"`.
   `idle` means the worker process is alive but no active turn is projected
   from channel events.
   User answer: "Idle TTL 默认搞成 5min 就清理".
   Resulting requirement: Default idle cleanup TTL is 5 minutes. Cleanup only
   targets workers continuously projected as idle; `mid-turn` workers are not
   killed by idle cleanup.
4. Decision: Hard TTL default.
   Evidence: Hard TTL kills a worker based only on wall-clock lifetime, which
   can interrupt a valid long-running `mid-turn` task.
   User answer: "hard TTL 可以直接不用要，搞一个 idle 的默认删除时间+可配置就行".
   Resulting requirement: Do not add a default hard TTL. Keep existing
   explicit `--timeout` behavior for users who intentionally want a hard
   cutoff.
5. Decision: Live-worker budget default and config storage.
   Evidence: Existing Trellis project configuration lives in
   `.trellis/config.yaml`; `trellis update` already supports appending new
   config sections for existing projects.
   User answer: "live worker 最大值搞成 6 吧，然后最好做一个可配置项存储".
   Resulting requirement: Default max live workers is 6. Store channel worker
   guard defaults in `.trellis/config.yaml`, while keeping CLI flags for
   temporary overrides.

## Notes

- This is complex enough to require `design.md` and `implement.md` before
  `task.py start`.
