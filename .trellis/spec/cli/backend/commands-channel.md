# `trellis channel` — Multi-Agent Collaboration Runtime (Code Spec)

Executable contracts for `packages/cli/src/commands/channel/`. Read this
before editing any file under that path. Trigger qualifies for mandatory
code-spec depth (new command surface + cross-layer event contract + infra
integration via env wiring and storage layout).

---

## 1. Scope / Trigger

| Trigger | Why this requires code-spec depth |
|---------|------------------------------------|
| New top-level `channel` command tree (14 subcommands) | New CLI surface — signatures must be locked |
| Event-stream protocol (events.jsonl, fixed kind taxonomy) | Cross-component contract: workers, supervisor, CLI all parse the same payloads |
| Per-worker subprocess supervision (claude / codex) | Infra integration: process lifecycle + signal handling |
| Disk layout migration (legacy flat → project buckets) | Infra: irreversible filesystem move + cross-tool path conventions (claude code parity) |
| Worker provider plugin (`WorkerAdapter`) | Extension contract: future providers depend on shape stability |
| Env wiring (`TRELLIS_CHANNEL_ROOT/PROJECT/AS`) | Cross-process configuration |

### Current Core / CLI Boundary

`@mindfoldhq/trellis-core/channel` owns reusable channel domain behavior:
event schemas, reducers, durable mutation APIs, idempotency, worker registry,
inbox policy, and public SDK contracts.

`packages/cli/src/commands/channel/store/*` still exists and is current code,
not dead code. Some files are thin re-export / compatibility modules over core
(`schema.ts`, `filter.ts`, `thread-state.ts`); others remain CLI-local runtime
primitives for supervisor / spawn / kill / wait paths during the supervisor
migration (`events.ts`, `paths.ts`, `lock.ts`, `watch.ts`). Do not delete these
wrappers until their callers have moved to core APIs. New reusable behavior
belongs in core; CLI-local files should only handle terminal UX, process
supervision, pid/cursor sidecars, and migration glue.

---

## 2. Signatures

### CLI commands (`commands/channel/index.ts`)

```
trellis channel create <name> [opts]
  --scope <scope>        : project | global (default project)
  --type <type>          : chat | forum (default chat)
  --task <path>          : associated Trellis task directory (string)
  --project <slug>       : project metadata tag (string; NOT the bucket key)
  --labels <csv>         : comma-separated labels
  --description <text>   : stable channel description
  --context-file <abs-path> : absolute context file (repeatable)
  --context-raw <text>      : raw context text (repeatable)
  --cwd <path>           : cwd recorded in create event (default process.cwd())
  --by <agent>           : creator identity (default "main")
  --force                : if channel exists, kill workers + rmrf + recreate
  --ephemeral            : mark for hide-from-list + prune --ephemeral
  → stdout: "Created channel '<name>' at <abs-path>"
  → stderr (if --ephemeral): hint about list --all / prune --ephemeral
  → exit 0 success; throw if --force=false and channel exists

trellis channel spawn <name> [opts]
  --scope <scope>        : project | global
  --agent <name>         : load .trellis/agents/<name>.md (sets provider / as / system prompt)
  --provider <p>         : claude | codex (overrides agent)
  --as <worker-name>     : worker identifier (default = agent name)
  --cwd <path>           : worker cwd (default process.cwd())
  --model <id>           : model override
  --resume <id>          : resume an existing session/thread id
  --timeout <duration>   : auto-kill after duration (e.g. "30m", "1h", "7200s")
                           — no default; opt-in hard cutoff
  --warn-before <duration>: emit `supervisor_warning` before timeout
                           (default "5m"; "0ms" disables warning)
  --file <path>          : context file (repeatable, glob OK)
  --jsonl <path>         : manifest of {file, reason} entries (repeatable)
  --by <agent>           : caller identity recorded on `spawned` event
  --inbox-policy <policy>: explicitOnly | broadcastAndExplicit (default explicitOnly)
                           — durable worker inbox delivery policy recorded on `spawned`
  --idle-timeout <duration>: OOM-guard idle-cleanup TTL for this worker
                           (default 5m from .trellis/config.yaml; "0" disables idle cleanup;
                           supervisor self-terminates with `killed{reason:"idle-timeout"}`
                           when continuously idle past the TTL — never mid-turn)
  --max-live-workers <n> : spawn-time live-worker budget for this project/scope
                           (default 6 from .trellis/config.yaml; "0" disables the
                           budget check; expired idle workers are cleaned first,
                           then `spawn` rejects with an actionable error if still over)
  → stdout (one line, JSON): {"pid": number, "log": string, "worker": string}
  → throws if worker name in use, agent not found, provider missing, channel not found,
    or live-worker budget exhausted after expired idle cleanup

trellis channel send <name> [text] [opts]
  --as <agent>           : sender identity (REQUIRED)
  --scope <scope>        : project | global
  --to <agents>          : CSV of target worker names (default: broadcast)
  --stdin                : read body from stdin
  --text-file <path>     : read body from file
  --delivery-mode <mode> : appendOnly | requireKnownWorker | requireRunningWorker
  [text] positional      : inline body
  → stdout: appended event as JSON
  → throws if none of stdin/textFile/[text] provided

trellis channel interrupt <name> [text] [opts]
  --as <agent>           : requester identity (REQUIRED)
  --to <agent>           : target worker name (REQUIRED)
  --scope <scope>        : project | global
  --stdin                : read replacement instruction from stdin
  --text-file <path>     : read replacement instruction from file
  [text] positional      : inline replacement instruction
  → stdout: appended `interrupt_requested` event as JSON
  → supervisor appends `interrupted` and sends the replacement instruction to the worker

trellis channel wait <name> [opts]
  --as <agent>           : caller identity (REQUIRED, also default --to)
  --scope <scope>        : project | global
  --timeout <duration>   : max wait (no timeout = wait indefinitely)
  --from <agents>        : CSV — only wake on events from these authors
  --kind <kind[,kind...]> : only wake on these event kinds (CSV, OR semantics)
  --thread <key>         : only wake on this thread key
  --action <action>      : only wake on this thread action
  --to <target>          : only wake on events to this target (default = --as)
  --include-progress     : also wake on progress events
  --all                  : require EVERY agent in --from to emit a match (default: first-match wins)
  → stdout: matching event(s) as JSON (one line each)
  → exit 0 satisfied; exit 124 timeout
  → on --all timeout: stderr "timeout: still waiting on <csv>"

trellis channel messages <name> [opts]
  --scope <scope>        : project | global
  --raw                  : one JSON event per line
  --follow               : tail new events after history (Ctrl-C to stop)
  --last <N>             : show only the last N matching
  --since <seq>          : only events with seq > N
  --kind <kind>          : filter by kind
  --from <agents>        : filter by author (CSV)
  --to <target>          : filter by routing target
  --thread <key>         : filter by thread key
  --action <action>      : filter by thread action
  --no-progress          : hide progress events
  → stdout: formatted (default) or raw JSON event stream; forum channels default to thread list view unless event filters are set

trellis channel list [opts]
  --scope <scope>        : project | global
  --json                 : emit JSON array instead of table
  --project <slug>       : filter by `task` field substring
  --all                  : include ephemeral channels (marked with " *")
  --all-projects         : scan every project bucket (default: only cwd's project)
  → stdout: table or JSON
  → footer (if hidden ephemerals): "(N ephemeral channels hidden — use --all to show)"

trellis channel kill <name> [opts]
  --as <agent>           : worker name (REQUIRED)
  --scope <scope>        : project | global
  --force                : SIGKILL immediately (skip graceful)
  → exit 0 sent; non-zero if no such worker

trellis channel rm <name> [opts]
  --scope <scope>        : project | global
  → kill any live workers, rmrf channel dir
  → exit 0 removed; throws if not found

trellis channel title set <name> [opts]
  --scope <scope>        : project | global
  --as <agent>           : author identity (default "main")
  --title <text>         : display title; does not change channel address
  → stdout: appended `channel` title event as JSON

trellis channel title clear <name> [opts]
  --scope <scope>        : project | global
  --as <agent>           : author identity (default "main")
  → stdout: appended `channel` title clear event as JSON

trellis channel prune [opts]
  --scope <scope>        : project | global
  --all                  : remove all channels (except live + --keep)
  --empty                : remove channels with only the create event
  --idle <duration>      : remove channels whose last event is older than duration
  --ephemeral            : remove only ephemeral channels
  --keep <csv>           : whitelist channel names
  --yes                  : actually delete (default is dry-run)
  --dry-run              : show what would be removed (default behavior)
  → throws if --all/--empty/--idle/--ephemeral specified more than one
  → stdout: list of candidates + "(dry-run) would remove N" or "Removed N"

trellis channel run [name] [opts]
  (auto-generates name "run-<8hex>" if not provided, --ephemeral implied)
  --agent / --provider / --as / --cwd / --model / --file / --jsonl  : same as spawn
  --message <text>       : inline prompt
  --message-file <path>  : read prompt from file
  --stdin                : read prompt from stdin
  --timeout <duration>   : max wait for done (default 5m)
  → on success: stdout = worker's final message body, channel auto-rm'd, exit 0
  → on failure (error/killed/timeout): channel preserved, stderr "channel kept for inspection: <path>", exit 1

trellis channel post <name> <action> [opts]
  --as <agent>           : author identity (REQUIRED)
  --scope <scope>        : project | global
  --thread <key>         : thread key (required except action=opened)
  --title <text>         : thread title (opened)
  --text <text>          : event body (comment/opened)
  --stdin                : read event body from stdin
  --text-file <path>     : read event body from file
  --description <text>   : stable thread description
  --status <status>      : thread status
  --labels <csv>         : replace thread labels
  --assignees <csv>      : replace thread assignees
  --summary <text>       : thread summary
  --context-file <abs-path> : absolute context file (repeatable)
  --context-raw <text>      : raw context text (repeatable)
  → stdout: appended `thread` event as JSON
  → throws unless channel `type` is `forum`

trellis channel context add <name> [opts]
  --scope <scope>        : project | global
  --as <agent>           : author identity (default "main")
  --thread <key>         : mutate thread-level context instead of channel-level context
  --file <abs-path>      : absolute context file (repeatable)
  --raw <text>           : raw context text (repeatable)
  → stdout: appended `context` event as JSON

trellis channel context delete <name> [opts]
  --scope <scope>        : project | global
  --as <agent>           : author identity (default "main")
  --thread <key>         : mutate thread-level context instead of channel-level context
  --file <abs-path>      : absolute context file (repeatable)
  --raw <text>           : raw context text (repeatable)
  → stdout: appended `context` event as JSON

trellis channel context list <name> [opts]
  --scope <scope>        : project | global
  --thread <key>         : show thread-level context instead of channel-level context
  --raw                  : one context entry JSON per line
  → stdout: projected current context

trellis channel forum <name> [opts]
  --scope <scope>        : project | global
  --status <status>      : filter reduced thread list by status
  --raw                  : one reduced thread state JSON per line
  → stdout: thread list summary

trellis channel thread <name> <thread> [opts]
  --scope <scope>        : project | global
  --raw                  : one raw `thread` event per line
  → stdout: one thread timeline summary

trellis channel thread rename <name> <old-thread> <new-thread> [opts]
  --as <agent>           : author identity (REQUIRED)
  --scope <scope>        : project | global
  → stdout: appended `thread` rename event as JSON

```

### Internal modules

```ts
// store/paths.ts (storage-layer signatures)
channelRoot(): string                                       // TRELLIS_CHANNEL_ROOT ?? ~/.trellis/channels
projectKey(cwd: string): string                             // sanitize: /[\\/_]/g→"-" then /[^A-Za-z0-9.-]/g→"-"
currentProjectKey(): string                                 // TRELLIS_CHANNEL_PROJECT env ?? projectKey(process.cwd())
projectDir(project?: string): string                        // <root>/<project>
assertSafeName(name, kind = "channel"): void                // ^[A-Za-z0-9._-]+$, rejects "."/".."; throws "Invalid <kind> name: ..."
channelDir(name, project?: string): string                  // <root>/<project>/<name> — calls assertSafeName(name) first; the one chokepoint every helper below routes through, so create/rm/run/spawn all reject traversal names (see filesystem-safety.md §2)
eventsPath(name, project?): string                          // <channelDir>/events.jsonl
lockPath(name, project?): string                            // <channelDir>/<name>.lock
workerFile(name, worker, suffix, project?): string          // <channelDir>/<worker>.<suffix> — calls assertSafeName(worker, "worker")
workerLockPath(name, worker, project?): string              // <channelDir>/<worker>.spawnlock — calls assertSafeName(worker, "worker")
migrateLegacyChannels(): void                               // idempotent; moves flat → _legacy/
ensureBucketMarker(project: string): void                   // touch <project>/.bucket
listProjects(): string[]                                    // bucket names (has .bucket OR is reserved)
selectExistingChannelProject(name: string): string          // throws if not found / ambiguous
resolveChannelProjectForCreate(name, opts?): ChannelRef      // maps --scope to project bucket
resolveExistingChannelRef(name, opts?): ChannelRef           // resolves --scope and rejects global/project ambiguity

// store/events.ts
appendEvent(name, partial: Omit<ChannelEvent,'seq'|'ts'>, project?): Promise<ChannelEvent>
  // Atomic under withLock(lockPath(name)).
  // Assigns seq through `.seq` sidecar with JSONL tail validation/repair.
  // If partial.idempotencyKey is present, checks the durable JSONL inside
  // the same channel lock and returns the original same-kind event without
  // appending a duplicate. Empty keys and cross-kind key reuse are errors.
  // Must not full-scan events.jsonl on the normal append path.
  // Returns event with ts (ISO) and seq (monotonic).
readChannelEvents(name, project?): Promise<ChannelEvent[]>
readChannelMetadata(name, project?): Promise<ChannelMetadata>
reduceChannelMetadata(events): ChannelMetadata
  // Single source of truth for channel metadata projection.
  // Replays create metadata, legacy linkedContext, channel-level context
  // add/delete, and display title set/clear. Legacy type:"thread" /
  // type:"threads" are NOT upgraded to "forum" — they project to "chat".
isCreateEvent(ev): ev is CreateChannelEvent
isThreadEvent(ev): ev is ThreadChannelEvent
metadataFromCreateEvent(ev?): ChannelMetadata
  // Internal legacy compatibility helper only. Do not export from
  // @mindfoldhq/trellis-core/channel and do not call from CLI renderers.

watchEvents(name, filter: WatchFilter, opts?: {signal?, fromStart?, sinceSeq?, project?}): AsyncGenerator<ChannelEvent>
  // Default: from EOF (live tail). fromStart: from byte 0. sinceSeq: skip seq <= N.
  // Driven by fs.watch + 200ms poll fallback.

// store/filter.ts
matchesEventFilter(ev, filter): boolean
  // Single source of truth for kind/thread/action/from/to/progress matching.
  // Used by both historical `messages` reads and live `watchEvents`.

// store/thread-state.ts
reduceThreads(events): ThreadState[]
formatThreadList(states): string[]
  // Single source of truth for replaying thread state and rendering thread list rows.
  // ThreadState includes `lastSeq` so reduced state can point back to the last event.

// adapters/index.ts
interface WorkerAdapter {
  readonly provider: Provider;                              // "claude" | "codex"
  buildArgs(view: SupervisorView): string[];                // CLI args for spawn()
  createCtx(): AdapterCtx;                                  // per-worker state
  handshake?(args: {child, ctx, view}): Promise<void>;      // optional pre-traffic init
  isReady(ctx: AdapterCtx): boolean;                        // safe to forward inbox now?
  parseLine(line: string, ctx: AdapterCtx): ParseResult;    // stdout line → events + side effects
  encodeUserMessage(text: string, ctx: AdapterCtx): string;
  encodeInterruptMessage(text: string, ctx: AdapterCtx): string;
}

// supervisor/shutdown.ts
interface ShutdownController {
  request(signal: NodeJS.Signals, reason: "explicit-kill"|"timeout"|"crash"|"idle-timeout"): Promise<void>;
  claim(reason): boolean;                                   // sync intent latch (no ladder)
  isShuttingDown(): boolean;
  reason(): ShutdownReason | null;
  markTerminalEmitted(): void;                              // call BEFORE await appendEvent({kind:"done"|"error"})
  hasTerminalEvent(): boolean;
  finalizeOnExit(code: number|null, signal: NodeJS.Signals|null): Promise<void>;
  awaitFinalize(): Promise<void>;
}
```

---

## 3. Contracts

### Event payload contracts (events.jsonl)

All events carry: `seq: number` (monotonic ≥ 1), `ts: string` (ISO 8601),
`by: string` (author identity), `kind: ChannelEventKind`. Any extra fields
are kind-specific.

```ts
type ChannelEventKind = "create" | "join" | "leave" | "message" | "thread" | "context" | "channel" | "spawned"
  | "killed" | "respawned" | "progress" | "done" | "error" | "waiting" | "awake"
  | "undeliverable" | "interrupt_requested" | "turn_started" | "turn_finished" | "interrupted"
  | "supervisor_warning";
```

| Kind | Required (beyond base) | Optional | Producer |
|------|------------------------|----------|----------|
| `create` | `cwd: string`, `scope: "project"\|"global"`, `type: "chat"\|"forum"` | `task: string`, `project: string`, `labels: string[]`, `description: string`, `context: ContextEntry[]`, `ephemeral: true`, `origin: "cli"`, `meta: object` | CLI |
| `spawned` | `as: string`, `provider: "claude"\|"codex"`, `pid: number` | `agent: string`, `files: string[]`, `manifests: string[]`, `inboxPolicy: "explicitOnly"\|"broadcastAndExplicit"` | supervisor / core `spawnWorker` |
| `message` | `text: string` | `to: string \| string[]` | any |
| `thread` | `action: ThreadAction`, `thread: string` | `title`, `text`, `description`, `status`, `labels`, `assignees`, `summary`, `context`, `newThread` | CLI / agents |
| `context` | `target: "channel"\|"thread"`, `action: "add"\|"delete"`, `context: ContextEntry[]` | `thread` when `target="thread"` | CLI / agents |
| `channel` | `action: "title"` | `title: string \| null` | CLI / agents |
| `progress` | `detail: object` (free-form) | — | adapter |
| `done` | — | `duration_ms: number`, `total_cost_usd: number`, `num_turns: number`, `synthesized: true`, `exit_code: number` | adapter (real) / supervisor (synthesised) |
| `error` | `message: string` | `detail: object`, `provider: string`, `synthesized: true`, `exit_code`, `exit_signal` | supervisor / adapter |
| `killed` | `reason: "explicit-kill"\|"timeout"\|"crash"\|"idle-timeout"`, `signal: NodeJS.Signals` | `timeout_ms: number` (if reason="timeout"), `idle_timeout_ms: number` (if reason="idle-timeout"), `worker: string` | supervisor / cli:kill |
| `supervisor_warning` | `worker: string`, `reason: "approaching_timeout"`, `timeout_ms: number`, `remaining_ms: number` | — | supervisor |
| `respawned` | (reserved, no fields yet) | — | (future) |
| `undeliverable` | `targetWorker: string`, `messageSeq: number`, `reason: "worker-terminal"\|"worker-unknown"` | — | core `sendMessage` (strict delivery modes only) |
| `interrupt_requested` | `worker: string` | `turnId: string`, `reason: "user"\|"system"\|"timeout"\|"superseded"`, `message: string` | core `requestInterrupt` / `interruptWorker` |
| `turn_started` | `worker: string`, `inputSeq: number` | `turnId: string` | adapter / supervisor |
| `turn_finished` | `worker: string` | `inputSeq: number`, `turnId: string`, `outcome: "done"\|"error"\|"aborted"` | adapter / supervisor |
| `interrupted` | `worker: string`, `method: "provider"\|"stdin"\|"signal"\|"none"`, `outcome: "interrupted"\|"queued"\|"unsupported"\|"no-active-turn"\|"failed"` | `turnId: string`, `reason`, `message: string` | core `interruptWorker` / CLI supervisor |

**Author identity (`by`) shape**: `"main"`, `"<worker-name>"`, `"supervisor:<worker>"`, or `"cli:<command>"` (e.g. `cli:kill`).

**Worker lifecycle / inbox / delivery contracts** (owned by `@mindfoldhq/trellis-core`):

- `reduceWorkerRegistry(events, channel?)` is the SOT worker projection. Worker
  lifecycle (`starting`/`running`/`done`/`error`/`killed`/`crashed`) and turn
  activity (`idle`/`mid-turn`) are projected purely from durable events — never
  from pid files or inbox cursors. `pendingMessageCount` counts deliverable
  `message` events with seq greater than the latest consumed
  `turn_started.inputSeq`. Pid files feed `probeWorkerRuntime` /
  `reconcileWorkerLiveness` only; `reconcileWorkerLiveness` performs no durable
  writes unless `appendTerminalEvents: true`.
- Inbox policy applies to `kind:"message"` only. `explicitOnly` (default)
  consumes only messages whose `to` targets the worker; `broadcastAndExplicit`
  also consumes broadcasts. Old `spawned` events without `inboxPolicy` project
  as `explicitOnly`. `matchesInboxPolicy` is the shared SOT used by the worker
  reducer and the supervisor inbox watcher.
- `sendMessage` delivery modes: `appendOnly` (default — append-only / pre-spawn
  backlog compatible), `requireKnownWorker`, `requireRunningWorker`. Strict modes
  append the `message` event first, then append `undeliverable` for targeted
  workers failing the selected condition. Broadcast messages never produce
  `undeliverable`. CLI exposes this through `trellis channel send
  --delivery-mode <mode>`.
- Interrupt is a first-class API, not a magic tag. `requestInterrupt` appends
  `interrupt_requested` only; `interruptWorker(input, runtime)` appends
  `interrupt_requested`, calls the injected `WorkerRuntime`, then appends
  `interrupted` with `method` / `outcome`. CLI exposes this through
  `trellis channel interrupt`; message tags are not an interrupt path.
- Worker inbox read/watch is owned by core. `readWorkerInbox(input)` returns
  the matching `message` events for a worker by composing
  `resolveChannelRef`, `readChannelEvents`, `reduceWorkerRegistry`, and
  `matchesInboxPolicy`; `limit` is a non-negative integer applied after
  inbox filtering (`0` returns `[]`), `afterSeq` is exclusive, and `cursor`
  on each returned message equals the message `seq`.
  `watchWorkerInbox(input)` is an `async` function returning an
  `AsyncGenerator<WorkerInboxMessage>` — upfront validation and a
  `lastSeq` snapshot happen on the outer call so unknown / terminal worker
  errors are eager and the watch is not racy against later appends.
  The generator ends when a terminal event (`killed`, synthesized `done`,
  or supervisor / synthesized `error`) for the watched worker arrives, and
  does NOT cross a same-id respawn — to watch a future respawn, callers
  re-resolve via `watchWorkers` first. `fromStart` / explicit `sinceSeq`
  are clamped to the current worker generation floor (the latest terminal
  event before the current `spawned`) so old-generation messages do not
  replay while post-terminal / pre-spawn backlog remains consumable.
  Cancellation is only via `AbortSignal`; core does not provide `timeoutMs`.
  Stable error type
  `WorkerInboxError` carries `code`, `channel`, `workerId`; codes are
  `WORKER_INBOX_WORKER_NOT_FOUND` and `WORKER_INBOX_WORKER_TERMINAL`. Core
  reasons only from the durable event log; it does not claim OS process
  liveness and does not persist cursor state. CLI supervisor inbox
  consolidation (`packages/cli/src/commands/channel/supervisor/inbox.ts`)
  is intentionally deferred — adapter readiness, stdin encoding, turn
  queueing, interrupt compatibility, and `<worker>.inbox-cursor` remain
  CLI-local concerns.

### Core channel durable idempotency

#### 1. Scope / Trigger

- Trigger: `@mindfoldhq/trellis-core` mutation APIs need replay safety for
  daemon/API callers that may retry a logical command after a crash or lost
  receipt.
- This is an event-log storage contract: the physical `events.jsonl` append
  and seq allocation boundary must decide whether a keyed write is new or a
  replay.
- Scope: core channel mutation APIs and the append primitive. CLI flags and
  worker lifecycle behavior are not part of this contract.

#### 2. Signatures

```ts
interface BaseChannelEvent {
  seq: number;
  ts: string;
  kind: ChannelEventKind;
  by: string;
  idempotencyKey?: string;
}

interface SendMessageOptions {
  idempotencyKey?: string;
  text: string;
  to?: string | string[];
}

interface PostThreadOptions {
  idempotencyKey?: string;
  action: ThreadAction;
  thread: string;
}

appendEvent(
  name: string,
  partial: Omit<ChannelEvent, "seq" | "ts">,
  project?: string,
): Promise<ChannelEvent>;
```

`idempotencyKey` is explicit on the public mutation options that persist it.
Do not add it to a shared mutation option type unless every inheriting mutation
API writes the key and has replay tests.

#### 3. Contracts

- Idempotency is scoped to one resolved channel event log. The same key in a
  different channel is independent.
- `appendEvent` validates the key, enters the channel lock, reads the durable
  event log when a key is present, and returns an existing same-kind event
  without appending.
- Calls without `idempotencyKey` preserve append-only behavior.
- Returned replay events keep their original `seq` and `ts`; callers must use
  that returned event as the authoritative receipt.
- `sendMessage` strict delivery modes still append the message event first.
  Replays classify delivery from the returned persistent event (`event.to`),
  not from the retry payload (`opts.to`).
  When the message call has an idempotency key, generated `undeliverable`
  side-effect events use deterministic derived keys:
  `` `${idempotencyKey}:undeliverable:${targetWorker}` ``.

#### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| `idempotencyKey` omitted | Append a new event exactly as before. |
| `idempotencyKey` is `""` or whitespace-only | Throw `idempotencyKey must be a non-empty string`. |
| Same channel/key/kind already exists | Return the existing event; do not append or advance seq. |
| Same channel/key exists with another kind | Throw a cross-kind reuse error naming the existing kind. |
| Same key used in another channel | Treat as independent; append according to that channel's log. |
| `sendMessage` strict replay for same failed target | Return original message and do not duplicate `undeliverable`. |
| `sendMessage` strict replay with different retry `to` | Ignore retry target drift; classify only the persisted message `to`. |

#### 5. Good/Base/Bad Cases

- Good: a daemon retries `sendMessage({ idempotencyKey: "cmd-123" })` after
  restart; core reads JSONL, returns the original `message` event, and the
  caller commits the original `seq`.
- Base: a normal CLI/user `sendMessage` does not pass a key; each call appends
  a distinct `message`.
- Bad: a caller uses key `cmd-123` for a `message` and later for a `thread`
  event in the same channel; core rejects the second write.

#### 6. Tests Required

- Unit: duplicate keyed `sendMessage` returns original `seq` / `ts` and only
  one `message` event exists.
- Unit: duplicate keyed `postThread` returns original `seq` / `ts` and only
  one `thread` event exists.
- Unit: unkeyed calls still append distinct events.
- Unit: empty / whitespace-only keys reject.
- Unit: cross-kind key reuse rejects.
- Unit: strict delivery replay does not duplicate `undeliverable` events.
- Unit: strict delivery replay with target drift does not append side effects
  for targets absent from the original persisted message.
- Unit: direct `appendEvent` keyed replay returns the persisted event.

#### 7. Wrong vs Correct

**Wrong** (process-local idempotency only; restart loses the key):

```ts
if (seenKeys.has(key)) return seenKeys.get(key);
const event = await appendEvent(channel, partial);
seenKeys.set(key, event);
return event;
```

**Correct** (the event log is the source of truth):

```ts
return withLock(lockPath(channel), async () => {
  const existing = findByIdempotencyKey(eventsPath(channel), key);
  if (existing) return existing;
  return appendJsonlWithNextSeq(channel, partial);
});
```

### Worker OOM guard

CLI-owned safeguard against unbounded resident-worker accumulation.

#### 1. Scope / Trigger

- Trigger: `spawn` now enforces process-lifecycle limits before forking a
  long-lived worker supervisor.
- This is infra code: it reads config/env, scans durable event state plus
  worker sidecars, verifies OS pids, signals supervisors, and writes terminal
  channel events through the normal shutdown path.
- Boundary: core only projects `WorkerState.idleSince`; CLI owns budget
  enforcement, pid verification, idle cleanup, and supervisor idle timers.

#### 2. Signatures

```ts
type WorkerGuardConfig = {
  idleTimeoutMs: number;    // default 300_000; 0 disables idle cleanup
  maxLiveWorkers: number;   // default 6; 0 disables spawn budget
};
```

CLI additions:

```
trellis channel spawn <name>
  --idle-timeout <duration>  # "5m" default; "0" disables idle cleanup
  --max-live-workers <n>     # 6 default; 0 disables live-worker budget
```

Config:

```yaml
channel:
  worker_guard:
    idle_timeout: 5m
    max_live_workers: 6
```

Env:

```
TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT=5m
TRELLIS_CHANNEL_MAX_LIVE_WORKERS=6
```

#### 3. Contracts

- Configuration precedence is CLI flag → env → `.trellis/config.yaml` →
  built-in default. `0` disables the corresponding guard at every layer.
- The live-worker budget is per project bucket. `spawn` scans every channel
  in that bucket and counts non-terminal workers with live pids. It also
  counts `<worker>.reservation` sidecars as `lifecycle:"starting"` live
  workers until the supervisor appends `spawned`.
- The budget scan, expired-idle cleanup, reservation write, supervisor fork,
  and parent pid-file write run under `<projectBucket>/.worker-guard.lock`.
  The per-worker spawn lock is still used inside that project lock.
- A worker becomes idle-cleanup eligible only when projected as
  `activity:"idle"` and `idleSince` is present. `turn_started` clears
  `idleSince`; `turn_finished` and `interrupted` set it. Mid-turn workers and
  workers without `idleSince` are never killed by the idle guard.
- Automatic cleanup may only signal a pid whose command line verifies as
  `channel __supervisor <exact-channel> <exact-worker>`. Alive but unverified
  pids remain counted in the overflow list and are not auto-killed.
- Spawn-time idle cleanup writes a one-shot `<worker>.shutdown-reason` sidecar
  with `idle-timeout` before sending `SIGTERM`. The supervisor consumes that
  sidecar and emits the single terminal event:
  `killed{reason:"idle-timeout", idle_timeout_ms:N}`.
- Each supervisor also schedules its own idle timer after `spawned` is
  durable. The timer pauses on `turn_started`, resets on idle enter, and calls
  `shutdown.request("SIGTERM", "idle-timeout")` after continuous idle expiry.
- There is no default hard TTL. Explicit `--timeout` keeps its existing
  opt-in hard cutoff behavior and is independent from idle cleanup.

#### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| `--idle-timeout` invalid duration | commander rejects using the existing duration parser |
| `--max-live-workers <n>` is negative / non-integer | commander rejects with an argument error |
| `idle_timeout: 0` or `TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT=0` | idle cleanup disabled; workers are still counted for budget unless budget is also disabled |
| `max_live_workers: 0` or `TRELLIS_CHANNEL_MAX_LIVE_WORKERS=0` | budget check disabled; supervisor idle self-termination still works if TTL > 0 |
| Live count after expired-idle cleanup is `>= maxLiveWorkers` | reject `spawn` with live worker list, `trellis channel kill` hints, and override hint |
| Idle worker pid is live but command line is unverified | count it; do not auto-signal it |
| Worker is running a turn when idle TTL expires | do nothing until it returns to idle |
| Supervisor receives external SIGTERM with `shutdown-reason=idle-timeout` | append `killed` with `reason:"idle-timeout"` and `idle_timeout_ms` |
| Supervisor receives SIGTERM without sidecar | append `killed` with `reason:"explicit-kill"` |

#### 5. Good/Base/Bad Cases

- Good: six resident idle workers exist, three are past `idle_timeout`; a
  seventh `spawn` cleans the expired workers and proceeds.
- Base: six live workers are all active or not expired; a seventh `spawn`
  rejects and prints the live workers plus kill hints.
- Bad: a stale pid file points at an unrelated process; the guard counts it
  as a live blocker but does not signal that process.

#### 6. Tests Required

- Core reducer: `spawned` initializes `idleSince`, `turn_started` clears it,
  `turn_finished` / `interrupted` restore it, and terminal events clear it.
- CLI guard: config/env/flag precedence, default `5m` / `6`, disable via `0`,
  budget rejection, idle cleanup, reservation counting, and exact pid-command
  verification.
- Supervisor: idle timer starts only after durable `spawned`, pauses mid-turn,
  emits `idle-timeout` through the normal shutdown controller, and cleans pid /
  reservation / shutdown-reason sidecars.

#### 7. Wrong vs Correct

**Wrong** (hard-kills arbitrary idle-looking pids):

```ts
if (Date.now() - Date.parse(worker.lastSeen) > ttl) {
  process.kill(worker.pid, "SIGTERM");
}
```

**Correct** (uses projected idle state plus verified supervisor ownership):

```ts
if (
  worker.activity === "idle" &&
  worker.idleSince &&
  isExpired(worker.idleSince, ttl) &&
  worker.supervisorVerified
) {
  writeShutdownReason(worker, "idle-timeout");
  process.kill(worker.pid, "SIGTERM");
}
```

### Codex progress stream metadata

#### 1. Scope / Trigger

- Trigger: `packages/cli/src/commands/channel/adapters/codex.ts` converts
  Codex `app-server` JSON-RPC notifications into channel `progress` events.
- This is a cross-layer event contract: the worker adapter writes
  `events.jsonl`, `messages --raw` exposes the payload, and downstream UI/SDK
  consumers replay streamed text from the same fields.
- Codex can emit more than one `agentMessage` stream in a turn. Treating all
  `item/agentMessage/delta` payloads as one untyped `text_delta` stream makes
  interleaved commentary/final-output tokens unrecoverable.

#### 2. Signatures

```ts
type CodexProgressDeltaDetail = {
  kind: "output" | "commentary" | "reasoning";
  text_delta: string;          // backward-compatible streamed token/chunk
  stream_id?: string;          // Codex params.itemId when present
  phase?: string;              // Codex item.phase when known
};

type CodexItemMeta = {
  type?: string;               // item.type from item/started or item/completed
  phase?: string;              // item.phase from item/started or item/completed
};
```

Adapter state:

```ts
interface CodexCtx {
  pending: Map<number, "initialize" | "thread/start" | "turn/start" | "other">;
  items: Map<string, CodexItemMeta>;
  threadId?: string;
  nextId: number;
}
```

#### 3. Contracts

| Codex input | Required adapter behavior |
|-------------|---------------------------|
| `item/started` with `item.id` | Store `item.id -> {type, phase}` in `ctx.items`; do not emit an event for plain `agentMessage`, `reasoning`, `plan`, or prompt scaffolding items. |
| `item/completed` with `item.id` | Refresh `ctx.items` before projecting completed events, so later deltas for the same id still have metadata. |
| `item/agentMessage/delta` with `params.delta` or `params.text` | Emit one `progress` event with `detail.text_delta` unchanged. |
| `item/agentMessage/delta` with `params.itemId` | Add `detail.stream_id = params.itemId`. |
| Known `phase:"commentary"` | Add `detail.kind = "commentary"` and `detail.phase = "commentary"`. |
| Known `phase:"final_answer"` or unknown phase on `agentMessage` | Add `detail.kind = "output"`; add `detail.phase` only when known. |
| Known `type:"reasoning"` | Add `detail.kind = "reasoning"`. |
| Completed `agentMessage` with `phase:"commentary"` | Continue projecting it as `progress.detail.kind = "commentary"` with summarized `text_delta`. |
| Completed `agentMessage` with `phase:"final_answer"` or no phase | Continue projecting it as `kind:"message"`; this remains the canonical completed assistant answer. |

Consumer contract:

- Group streamed Codex deltas by `detail.stream_id` when present.
- Use `detail.kind` for lane routing (`output`, `commentary`, `reasoning`).
- Keep `kind:"message"` as the durable completed assistant answer; streamed
  deltas are activity/progress, not the authoritative final body.

#### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Delta event has no `delta` and no `text` | Emit no event. |
| Delta event has `itemId` but no remembered metadata | Emit `detail.kind = "output"`, keep `detail.stream_id`, keep `detail.text_delta`. |
| Delta event has inline `params.item` | Record that item metadata before classification. |
| `item.id` is missing or not a string | Do not write to `ctx.items`; continue normal event projection. |
| Unknown `item.type` / unknown `phase` | Do not throw; default streamed delta kind to `output`. |
| Multiple streams interleave in one turn | Do not buffer/reorder globally; preserve event order and make streams separable through `stream_id`. |

#### 5. Good/Base/Bad Cases

- Good: `item/started(agentMessage id=msg_final phase=final_answer)` followed
  by `item/agentMessage/delta(itemId=msg_final)` emits
  `{kind:"output", stream_id:"msg_final", phase:"final_answer", text_delta}`.
- Base: `item/agentMessage/delta(itemId=msg_unknown)` without prior metadata
  emits `{kind:"output", stream_id:"msg_unknown", text_delta}`.
- Bad: two Codex streams write only `{text_delta}`; replay consumers concatenate
  both streams into unreadable text and cannot reconstruct either lane.

#### 6. Tests Required

- Unit: `parseCodexLine` records `item/started` metadata and classifies a
  commentary delta as `detail.kind = "commentary"`.
- Unit: interleaved final/commentary streams produce different
  `detail.stream_id` values and route to `output` vs `commentary`.
- Unit: unknown `itemId` preserves `detail.text_delta` and adds fallback
  `detail.kind = "output"` plus `detail.stream_id`.
- Integration or fixture: recorded Codex trace with interleaved deltas can be
  replayed without consumers treating the whole turn as one mono stream.

#### 7. Wrong vs Correct

**Wrong** (loses stream identity):

```ts
return {
  events: [{ kind: "progress", payload: { detail: { text_delta: delta } } }],
};
```

**Correct** (old field preserved, new fields make streams separable):

```ts
const detail: Record<string, unknown> = { kind, text_delta: delta };
if (itemId) detail.stream_id = itemId;
if (meta?.phase) detail.phase = meta.phase;
return { events: [{ kind: "progress", payload: { detail } }] };
```

**Channel type semantics**:
- `chat` is the default and remains timeline-first.
- `forum` is thread-list-first (a topic area whose threads are individual topics): `messages <channel>` pretty output starts with a reduced thread list unless event filters are set; `messages --raw` always prints one event per JSONL line.
- Legacy event logs with `type:"thread"` / `type:"threads"` are NOT upgraded to `forum`; they project to `chat`, so forum/thread APIs reject them as non-forum channels. New CLI writes and accepts only `forum`; `--type thread` and `--type threads` both throw with a clear "Use '--type forum'" error.
- Pretty output for create/thread events shows `description` and a short `context` summary; raw output remains the full JSONL event.
- `send` always appends `kind:"message"` and never targets a thread.
- `post` appends `kind:"thread"` and is only valid on `type:"forum"` channels.

**Thread action taxonomy**: `opened`, `comment`, `status`, `labels`, `assignees`, `summary`, `processed`, `rename`.

**Channel action taxonomy**: `title`. This is display-title metadata only, not address rename. Channel address remains the storage directory key; a future address rename must be a separate storage operation such as `channel move`.

**Future event attribution model**:

Current v1 events use `by` as a lightweight author alias and `to` as an
optional routing target. Do not grow `by` into a business identity object.
For multi-user products that consume channel events through the future core
API, the next event contract should add:

```ts
type EventOrigin = "cli" | "api" | "worker";

type ChannelEventBase = {
  seq: number;
  ts: string;
  kind: ChannelEventKind;
  by: string;
  to?: string | string[];
  origin?: EventOrigin;
  meta?: Record<string, unknown>;
};
```

- `by` stays a display/filter alias used by `messages --from` and
  `wait --from`; it is not a user table key, org id, or permission claim.
- `to` stays a routing handle for channel workers / agents.
- `origin` records the public write entrypoint: `cli` for
  `trellis channel ...`, `api` for the future channel core/library, and
  `worker` for supervisor / worker runtime writes.
- `meta` is a pass-through JSON object for Trellis runtime details and
  external systems. Trellis persists it, emits it in `--raw`, and may support
  simple path equality filters; it does not validate business semantics.

External products should put tenant, user, project, task, server,
or permission snapshots under their own namespace, for example
`meta.external.authorId`. Trellis must not define `user`, `org`, or
`displayName` schemas in the channel protocol.

The existing create-event optional `origin: "run"` is a legacy mode marker,
not the future write-entrypoint field. When introducing `origin`, move that
mode marker to `meta.trellis.createMode = "run"` or an equivalent
non-conflicting field.

**Context shape**:
```ts
type ContextEntry =
  | { type: "file"; path: string }   // absolute path only
  | { type: "raw"; text: string };
```

Context may appear on the channel create event and on a thread opened event.
Legacy event logs may still contain `linkedContext`; readers normalize it to
`context`, but new writes must not emit `linkedContext`.

**Routing (`to`) semantics**: omitted = broadcast. Workers ONLY consume events with `to` matching their own name (broadcasts are operator/user-facing). CLI filters (`--to <target>`) follow `watchEvents` rules: events with no `to` pass through (broadcast); explicit `to` mismatch rejects.

**Terminal event invariant**: every spawned worker MUST eventually produce exactly one of `done` or supervisor-synthesised fallback. `ShutdownController.markTerminalEmitted()` claims the slot **synchronously before** `await appendEvent({kind: done|error})` to prevent races with `finalizeOnExit`.

### Storage layout contract

```
<root>/                              # TRELLIS_CHANNEL_ROOT ?? ~/.trellis/channels
├── _legacy/                         # reserved bucket (auto-migrated flat channels)
│   └── .bucket
├── _default/                        # reserved bucket name (currently unused)
├── _global/                         # global-scope channels
└── <projectKey(cwd)>/               # one bucket per project
    ├── .bucket                      # marker — distinguishes bucket from legacy channel
    └── <channel-name>/
        ├── events.jsonl             # single source of truth, append-only
        ├── .seq                     # last committed event seq sidecar; repairable from events.jsonl
        ├── <name>.lock              # O_EXCL append-mutex (pid-stamped)
        ├── <worker>.pid             # supervisor pid
        ├── <worker>.worker-pid      # worker child pid
        ├── <worker>.config          # serialized SupervisorConfig JSON
        ├── <worker>.log             # raw worker stdout+stderr
        ├── <worker>.session-id      # claude resume key (persists across cleanup)
        ├── <worker>.thread-id       # codex resume key (persists across cleanup)
        ├── <worker>.inbox-cursor    # last seq forwarded to worker stdin (persists)
        ├── <worker>.shutdown-reason # one-shot external shutdown reason sidecar
        ├── <worker>.reservation     # pre-spawn budget reservation sidecar
        ├── <worker>.spawnlock       # per-worker spawn mutex
        └── .worker-guard.lock       # project-bucket live-worker budget mutex
```

**Bucket discovery rules**:
- Top-level dir is a bucket iff it has `.bucket` file OR name is `_legacy` / `_default` / `_global`
- Any other top-level dir with `events.jsonl` inside is a legacy channel → auto-migrated
- Reserved bucket names: `_legacy`, `_default`, `_global` (never written as projectKey output because projectKey never starts with `_`)

**Cleanup contract** (`cleanup(channel, worker)` in supervisor.ts):
- ALWAYS removes: `pid`, `worker-pid`, `config`, `spawnlock`,
  `shutdown-reason`, `reservation`
- NEVER removes: `log`, `session-id`, `thread-id`, `inbox-cursor`, `events.jsonl`, `.seq`

`channel rm` deletes the entire channel directory; the cleanup contract above
only applies to per-worker supervisor cleanup.

### Env wiring

| Variable | Required? | Default | Used by |
|----------|-----------|---------|---------|
| `TRELLIS_CHANNEL_ROOT` | optional | `~/.trellis/channels` | `channelRoot()` — override storage root |
| `TRELLIS_CHANNEL_PROJECT` | optional | `projectKey(process.cwd())` | `currentProjectKey()` — lock current project bucket |
| `TRELLIS_CHANNEL_AS` | optional | `"main"` | `spawn.ts` — default for `spawnedBy` on `spawned` event (lets workers spawning workers record correct lineage) |
| `TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT` | optional | `.trellis/config.yaml` then `5m` | worker OOM guard idle-cleanup TTL; duration string, `0` disables |
| `TRELLIS_CHANNEL_MAX_LIVE_WORKERS` | optional | `.trellis/config.yaml` then `6` | worker OOM guard live-worker budget; non-negative integer, `0` disables |
| `TRELLIS_HOOKS` | set to `"0"` by supervisor | n/a | supervised workers — disables trellis hooks inside the worker process (prevents recursive hook injection) |

**Env precedence**:
- `TRELLIS_CHANNEL_PROJECT` set externally → that bucket (advanced)
- `TRELLIS_CHANNEL_PROJECT` not set → derive from `process.cwd()`
- `selectExistingChannelProject(name)` may **mutate `process.env.TRELLIS_CHANNEL_PROJECT`** when falling back to a unique cross-bucket match, so the rest of the CLI invocation lands on the same bucket

---

## 4. Validation & Error Matrix

### CLI-level

| Condition | Behavior |
|-----------|----------|
| `create <name>` and channel exists, no `--force` | throw `"Channel '<name>' already exists at <dir>. Use --force to overwrite."` |
| `create --force` with live workers | killLiveWorkers (SIGTERM → 1.5s → SIGKILL) → rmrf → recreate |
| `spawn` and channel not found | throw `"Channel '<name>' not found at <dir>"` |
| `spawn` with no `--provider` and no `--agent` providing it | throw `"Missing --provider (and the agent definition has no \`provider:\` frontmatter)"` |
| `spawn` with no `--as` and no `--agent` providing fallback name | throw `"Missing --as (no agent name to fall back to)"` |
| `spawn` and worker name already has a live pid | throw `"Worker '<as>' is already running in channel '<name>' (pid <N>)"` |
| `spawn` and `--provider` not in REGISTRY | exit 1, stderr `"--provider must be one of: claude, codex"` |
| `send` with none of `--stdin`/`--text-file`/`[text]` | throw (missing body) |
| `send`/`spawn`/`wait`/`messages`/`kill`/`rm` with channel in both project and global scopes but no `--scope` | throw `"Channel '<name>' exists in global and project scopes. Use --scope global or --scope project."` before writing |
| `post` against a `chat` channel | throw `"Channel '<name>' is type 'chat'. 'post' requires a forum channel."` |
| `post <action>` with invalid action | throw `"Invalid thread action '<action>'..."` |
| `post` without `--thread` for non-`opened` action | throw `"--thread is required unless action is 'opened'"` |
| `--context-file <path>` with relative path | throw `"--context-file must be absolute: <path>"` |
| `wait --all` without `--from` | throw `"--all requires --from <a,b,...>"` |
| `wait` timeout | exit 124; if `--all`, stderr `"timeout: still waiting on <csv>"` |
| `prune` with >1 of `--all/--empty/--idle/--ephemeral` | throw `"prune flags are mutually exclusive: <flags>. Pick one."` |
| `prune` without `--yes` | print candidates + `(dry-run)` notice; exit 0 without deleting |
| `run` worker exits with `error` or `killed` before `done` | exit 1, stderr `"channel kept for inspection: <path>"` |
| `selectExistingChannelProject(name)` channel exists in ≥2 project buckets | throw `"Channel '<name>' exists in multiple project buckets: <csv>. Run from the owning project cwd or use --scope."` |
| `selectExistingChannelProject(name)` not found anywhere | throw `"Channel '<name>' not found in current project bucket (<key>) or any known project bucket"` |

### Supervisor-level

| Condition | Behavior |
|-----------|----------|
| `child.on("error")` before `child.once("spawn")` (ENOENT etc.) | emit ONE `error{message:"worker spawn failed: ..."}`, run `cleanup()`, `process.exit(1)` — NO `spawned` event |
| Duplicate `child.on("error")` fire after spawn-fail handled | guard with `if (spawnFailed) return` — no double event |
| Post-spawn `error` (worker died after start) | `await appendEvent({kind:"error", message})` THEN `await shutdown.request("SIGTERM", "crash")` — ordering enforced via async IIFE |
| Adapter handshake throws | `await appendEvent({kind:"error", detail:{source:"handshake"}, message})` THEN `shutdown.request("SIGTERM", "crash")` |
| Shutdown requested during `await spawnSettled` | after settle, check `shutdown.isShuttingDown()` — if true, `await shutdown.awaitFinalize()` and return (no `spawned` event written) |
| `child.on("exit")` and adapter never emitted done/error | `finalizeOnExit` synthesises `done{synthesized:true, exit_code:0}` (code=0) or `error{synthesized:true, exit_code, exit_signal}` (otherwise). `by` = worker name (NOT `supervisor:<worker>`) so `wait --from <worker>` wakes. |
| `child.on("exit")` and shutdown was requested | NO synthesis (`killed` event already serves as terminal). `finalizeOnExit` only `await killedPromise` then exits. |
| Kill ladder liveness check | `child.exitCode === null && child.signalCode === null` (NOT `child.killed` — that means "kill() called", not "process exited") |

### Security boundaries

| Surface | Validator | Reject behavior |
|---------|-----------|-----------------|
| Channel / worker name as a path segment (create/rm/run/spawn/…) | `assertSafeName(name, kind)` — `^[A-Za-z0-9._-]+$`, rejects `.`/`..` — called inside `channelDir` (and `workerFile`/`workerLockPath` for the worker segment), the one chokepoint every path helper routes through | throw `"Invalid <kind> name: ..."` before any filesystem call (see [Filesystem Safety](./filesystem-safety.md) §2) |
| Worker / channel name in protocol prompt | `safeIdentifier(s)` strips `/[\r\n\x00-\x08\x0b-\x1f\x7f]/` | silent strip (still produces a valid string) — defense-in-depth on top of the `assertSafeName` chokepoint above, not a substitute for it |
| `--file <path>` | `jailedRealpath(path, cwd)` requires `realpath(path).startsWith(realpath(cwd) + sep)` | skip file, stderr warn |
| `--jsonl <path>` | same jail | skip manifest entry, stderr warn |
| Symlink swap during read | `lstat` BEFORE `stat` to detect symlinks before resolve | treat as not found |
| `--agent <name>` | `/^[A-Za-z0-9._-]+$/` regex | throw |
| `--agent` resolved path | `realpath(path).startsWith(realpath(agentsRoot) + sep)` | throw |
| Frontmatter parse | `Object.create(null)`, reject keys in `["__proto__","prototype","constructor"]` | skip key |
| Context file per-file size | `MAX_PER_FILE_BYTES = 1_000_000` (1MB) | truncate + stderr warn |
| Context total size | `WARN_TOTAL_BYTES = 500_000` (500KB) | stderr warn (still loads) |

---

## 5. Good / Base / Bad Cases

### Case A — `channel run` happy path

**Good** (typical short task):
```bash
$ TRELLIS_CHANNEL_ROOT=/tmp/test trellis channel run --provider codex --message "say hi in 3 words"
Hi, glad you're here.
$ echo $?
0
$ ls /tmp/test/.../-tmp-*/run-*/   # ← channel removed after success
ls: ... No such file or directory
```

**Base** (normal CR with single worker):
```bash
$ trellis channel run --agent check --message-file /tmp/cr-brief.md --timeout 15m
## Files Checked
...
Issues Found
- ...
$ echo $?
0
```

**Bad** (provider missing → spawn-fail → channel kept for inspection):
```bash
$ PATH=/usr/bin trellis channel run --provider claude --message "hi" --timeout 30s
channel kept for inspection: /Users/.../-.../-run-4a520e0f
(ephemeral — will be removed by `channel prune --ephemeral`)
Error: timeout waiting for cx done
$ echo $?
1
# events.jsonl has [create, error] only — no spawned (correctly suppressed by pre-spawn guard)
```

### Case B — Multi-worker review with `wait --all`

**Good**:
```bash
trellis channel create cr-feature --ephemeral
trellis channel spawn cr-feature --agent check
trellis channel spawn cr-feature --agent check --provider codex --as check-cx
trellis channel send cr-feature --as main --to check --text-file brief.md
trellis channel send cr-feature --as main --to check-cx --text-file brief.md
trellis channel wait cr-feature --as main --kind done --from check,check-cx --all --timeout 15m
# stdout: two done event JSON lines (one per worker)
# exit 0 (both finished)
```

**Bad** (one worker times out):
```bash
trellis channel wait cr-feature --as main --kind done --from check,check-cx --all --timeout 30s
# stdout: only `done` from check (if any)
# stderr: "timeout: still waiting on check-cx"
# exit 124
```

### Case C — Cross-cwd addressing

**Good** (channel created in trellis repo, accessed from /tmp via unique-match fallback):
```bash
$ cd /Users/me/work/trellis && trellis channel create unique-name
$ cd /tmp && trellis channel send unique-name --as main --text "hi"
# selectExistingChannelProject finds unique-name in only one bucket → mutates env → succeeds
```

**Bad** (same name exists in multiple buckets):
```bash
$ cd /tmp && trellis channel send cr-r1 --as main --text "hi"
Error: Channel 'cr-r1' exists in multiple project buckets: -Users-me-work-trellis, -Users-me-work-app. Run from the owning project cwd or use --scope.
```

### Case D — Global forum channel

**Good** (local feedback channel shared across projects):
```bash
trellis channel create trellis-issue --scope global --type forum \
  --description "Local Trellis feedback channel" \
  --context-file /Users/me/work/Trellis/.trellis/spec/cli/backend/commands-channel.md
trellis channel post trellis-issue opened --scope global --as main \
  --thread forum-mode \
  --title "Forum mode" \
  --description "Track forum feedback." \
  --labels channel,ux
trellis channel post trellis-issue comment --scope global --as arch \
  --thread forum-mode \
  --text "Reviewed the functional shape."
trellis channel messages trellis-issue --scope global
# forum-mode [open] Forum mode labels=channel,ux
```

**Bad** (`send` is not a thread primitive):
```bash
trellis channel send trellis-issue --scope global --as main --thread forum-mode "hi"
# Error: unknown option '--thread'
```

### Case E — Spawn-fail event sequence

**Wrong** (pre-r5 behavior, never ship):
```
[create]
[spawned] pid=undefined        ← misleading, worker never started
[error]                        ← race with spawned
[killed]                       ← duplicate noise
# supervisor never exits (Node didn't emit `exit` for ENOENT)
```

**Correct** (post-r5):
```
[create]
[error] message="worker spawn failed: spawn claude ENOENT"
# supervisor process.exit(1); no spawned, no killed; pid file cleaned
```

---

## 6. Tests Required

| Surface | Test type | Assertion points |
|---------|-----------|-------------------|
| `paths.projectKey(cwd)` | unit | (a) `"/Users/x"` → `"-Users-x"`, (b) backslash → `-`, (c) CJK/spaces/`#` → `-`, (d) idempotent on re-sanitized input |
| `TRELLIS_CHANNEL_ROOT` override | integration | create a channel with env override; assert events land under that root, not `~/.trellis/channels` |
| Global/project scope collision | integration | create same name in `_global` and current project; unscoped write throws before appending, explicit `--scope global` succeeds |
| Thread reducer | unit/integration | create `type=forum`; post `opened` + `comment` + `status`; assert reduced state has title/status/labels/assignees/comment count |
| Thread reducer cursor | unit/integration | reduced state records `lastSeq` from the last thread event applied |
| Thread pretty output | integration | default thread list prints the thread-view hint; create/thread event views print description and context summaries |
| `matchesEventFilter` | unit | kind/from/thread/action/progress/to semantics match both `messages` and `watchEvents` consumers |
| `parseCsv` helper | unit | comma-separated options share trimming and empty-entry behavior |
| `post` chat rejection | integration | create default `chat`; `post opened` throws and events.jsonl remains unchanged |
| `context` validation | unit/integration | absolute file path accepted; relative file path rejected; raw empty rejected; legacy `linkedContext` reads into normalized `context` |
| Metadata reducer | unit/integration | create metadata, legacy `linkedContext`, channel-level context add/delete, title set/clear, and legacy `type:"thread"` project through `reduceChannelMetadata` |
| Thread rename reducer | unit/integration | conflict rejected; alias chain resolves; old-key `showThread` includes pre-rename and late old-key events; thread context follows alias resolver |
| `paths.migrateLegacyChannels()` | integration | (a) flat dir with events.jsonl → moves to `_legacy/<name>/`, (b) bucket marker dir → skipped, (c) `_legacy`/`_default` → skipped, (d) idempotent (no-op second call) |
| `paths.selectExistingChannelProject(name)` | integration | (a) current bucket has channel → returns currentProjectKey, (b) only one other bucket has it → mutates env + returns that bucket, (c) two buckets have it → throws with `Channel '<name>' exists in multiple` message, (d) none have it → throws with current bucket name in error |
| `appendEvent` atomicity | concurrent | spawn N parallel `appendEvent` calls; assert seqs are strictly monotonic 1..N with no duplicates or gaps |
| `appendEvent` sidecar recovery | unit/integration | (a) missing `.seq` rebuilds from JSONL, (b) non-integer `.seq` rebuilds from JSONL, (c) `.seq` lower than JSONL tail repairs without duplicate seq, (d) `.seq` higher than JSONL tail repairs without a gap |
| `withLock` stale-lock recovery | unit | write lockfile with dead-pid contents; subsequent `withLock` call recovers and proceeds |
| `watchEvents` modes | integration | (a) default reads from EOF, (b) `fromStart:true` reads from byte 0, (c) `sinceSeq:N` skips events with seq ≤ N |
| `matchesFilter` `to` semantics | unit | (a) event with no `to` passes when filter.to set (broadcast OK), (b) event with `to=X` only passes filter.to=X, (c) `filter.to="exclusive"` requires explicit `to` |
| Spawn-fail path (ENOENT) | e2e | `PATH=/no/claude trellis channel spawn ...` → events.jsonl has ONE error event, no spawned, no killed; supervisor exited; pid file removed |
| Happy turn (claude / codex) | e2e | spawn → send "hi" → wait done; assert events sequence is `create → spawned → message(to) → ...progress... → message(by:worker) → done` with no synthesised events |
| Codex streamed delta metadata | unit/fixture | `parseCodexLine` stores `item/started` metadata; deltas keep `text_delta`, add `kind`, add `stream_id` from `itemId`, and route interleaved `final_answer` / `commentary` streams into different lanes |
| Cold-exit fallback synthesis | e2e | kill worker child PID directly (bypassing supervisor); assert `finalizeOnExit` synthesises terminal event with `by=workerName`, `synthesized:true` |
| Kill ladder | e2e | `channel kill`, assert events.jsonl has `killed{reason:"explicit-kill", signal:"SIGTERM"}` AND supervisor process gone within 6s |
| `markTerminalEmitted` race | concurrent | trigger adapter `done` and `child.on("exit")` near-simultaneously; assert exactly one terminal event (no duplicate synthesised one) |
| `wait --all` satisfaction | integration | spawn 2 workers, send each a prompt; `wait --all --from a,b --kind done`; assert exit 0 after both done events seen |
| `wait --all` timeout | integration | spawn 2 workers; kill one before it can done; `wait --all` exits 124 with `"timeout: still waiting on <killed-one>"` on stderr |
| `channel run` success cleanup | e2e | run happy; assert channel directory does not exist after exit |
| `channel run` failure preserves | e2e | run with bad provider; assert exit 1, stderr matches "channel kept for inspection:", channel directory still exists, `events.jsonl` has create+error |
| `--ephemeral` create + list + prune | integration | (a) `list` default hides, (b) `list --all` shows with `*`, (c) `list` footer prints "(N ephemeral channels hidden ...)", (d) `prune --ephemeral` only deletes ephemeral, (e) `prune --ephemeral --idle 1h` throws mutex error |
| Path-traversal jail | security | `--file /etc/passwd` from cwd `/tmp/work` → file skipped, stderr warn |
| `assertSafeName` / `channelDir` traversal guard | security | (a) `".."`, `"."`, `"../x"`, `"../../x"`, `"a/b"`, `"a\b"` → throw `Invalid channel name`, (b) ordinary names (`"a"`, `"chat-only"`, `"a.b"`) accepted, (c) `channelDir("../../escape")` throws before resolving a path — duplicated in both `core` and `cli` copies of `paths.ts` |
| Agent name validator | security | `--agent ../../evil` → throw |
| Frontmatter prototype pollution | security | a `.trellis/agents/<name>.md` fixture with `__proto__: ...` frontmatter → key dropped, no pollution observable |
| `safeIdentifier` | unit | newline / NUL / control chars stripped from worker name in protocol prompt |

---

## 7. Wrong vs Correct (key patterns)

### Pattern 1 — Marking adapter-emitted terminal events

**Wrong** (race with `finalizeOnExit`):
```ts
for (const ev of result.events) {
  await appendEvent(channelName, ev);     // ← worker process may exit during this await
  if (ev.kind === "done" || ev.kind === "error") {
    shutdown.markTerminalEmitted();        // ← too late; finalizeOnExit already synthesised a fallback
  }
}
```

**Correct** (sync-prepend the claim):
```ts
for (const ev of result.events) {
  if (ev.kind === "done" || ev.kind === "error") {
    shutdown.markTerminalEmitted();        // ← sync; finalizeOnExit observes this immediately
  }
  await appendEvent(channelName, ev);
}
```

### Pattern 2 — Post-spawn error handler ordering

**Wrong** (killed may land before error):
```ts
child.on("error", err => {
  void appendEvent({kind:"error", message: err.message});
  void shutdown.request("SIGTERM", "crash");   // ← runs in parallel; killed-append may win the lock
});
```

**Correct** (await error first, then request shutdown):
```ts
child.on("error", err => {
  if (spawnFailed) return;                    // L1 fix: defend against double-fire
  shutdown.claim("crash");                    // ← sync intent so concurrent code sees isShuttingDown
  void (async () => {
    try {
      await appendEvent({kind:"error", message: err.message});
    } catch { /* ignore — exiting anyway */ }
    await shutdown.request("SIGTERM", "crash");
  })();
});
```

### Pattern 3 — Liveness check in kill ladder

**Wrong** (`child.killed` is "kill() was called", not "process exited"):
```ts
setTimeout(() => {
  if (!child.killed) child.kill("SIGKILL");   // ← never fires, child.killed=true after first kill()
}, GRACE_MS);
```

**Correct**:
```ts
setTimeout(() => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}, GRACE_MS);
```

### Pattern 4 — Resolving a channel from a different cwd

**Wrong** (assumes current bucket):
```ts
const dir = channelDir(name);                 // ← uses cwd-derived bucket; throws if user is in /tmp
```

**Correct** (resolve before using paths):
```ts
selectExistingChannelProject(name);            // mutates TRELLIS_CHANNEL_PROJECT env if needed
const dir = channelDir(name);                 // ← now reads the locked env
```

### Pattern 5 — Synthesised terminal event author

**Wrong** (breaks `wait --from <worker>`):
```ts
await appendEvent({
  kind: "done",
  by: `supervisor:${workerName}`,             // ← wait --from worker --kind done won't wake
  synthesized: true,
});
```

**Correct**:
```ts
await appendEvent({
  kind: "done",
  by: workerName,                             // ← same `by` as adapter would have used
  synthesized: true,
});
```

---

## File Reference

```
commands/channel/
├── index.ts                  CLI Commander registration
├── create.ts                 channel create
├── spawn.ts                  channel spawn + supervisor fork
├── send.ts                   channel send
├── wait.ts                   channel wait (+ --all)
├── messages.ts               channel messages (+ --follow)
├── threads.ts                channel post / forum / thread
├── list.ts                   channel list (+ --all-projects / --all)
├── rm.ts                     channel rm + prune
├── kill.ts                   channel kill
├── run.ts                    channel run (one-shot wrapper)
├── supervisor.ts             supervisor process orchestrator
├── supervisor/shutdown.ts    ShutdownController state machine
├── supervisor/stdout.ts      line-pump + applyParseResult
├── supervisor/inbox.ts       inbox watcher + cursor
├── supervisor/idle.ts        OOM-guard idle timer (pause / reset / cancel)
├── guard.ts                  OOM-guard policy + spawn-time scan + idle cleanup
├── adapters/index.ts         WorkerAdapter REGISTRY + Provider type
├── adapters/types.ts         AdapterEvent / ParseResult shapes
├── adapters/claude.ts        Claude stream-JSON adapter
├── adapters/codex.ts         Codex app-server JSON-RPC adapter
├── store/paths.ts            project bucket helpers + migration
├── store/events.ts           appendEvent + ChannelEvent kind taxonomy
├── store/schema.ts           scope/type/thread/context parsers
├── store/filter.ts           shared event filtering SOT
├── store/thread-state.ts     thread replay + thread list formatting SOT
├── store/lock.ts             withLock (O_EXCL + stale-pid recovery)
├── store/watch.ts            watchEvents (fs.watch + poll fallback)
├── context-loader.ts         --file / --jsonl injection (jailed realpath)
└── agent-loader.ts           --agent loader (frontmatter parse + path jail)
```

---

## Future work (not in scope of this spec)

- **`StorageAdapter` abstraction** for cloud-backed stores (S3 / DynamoDB / Redis). Today `store/*` calls `fs.*` directly; adapter pattern is the prerequisite for any non-local backend.
- **events.jsonl rotation** — triggers when single file > 100MB OR > 100k events. Schema split + reader-merge is the open design question.
- **Event attribution + pass-through metadata** — keep `by` as a lightweight alias, add `origin: "cli"|"api"|"worker"` for the write entrypoint, and store business identity/context in `meta` without teaching Trellis user/org semantics.
- **GUI frontend** consuming `events.jsonl` via fs.watch (Electron) or polling. CLI render rules in `messages.ts` translate directly.
