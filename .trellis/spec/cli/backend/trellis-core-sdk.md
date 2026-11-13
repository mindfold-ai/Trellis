# Trellis Core SDK

> Package boundary and coding rules for `@mindfoldhq/trellis-core` and the CLI.

---

## Overview

Trellis is split into two version-locked packages:

| Package | Responsibility |
|---|---|
| `@mindfoldhq/trellis-core` | Reusable domain logic, storage primitives, reducers, task APIs, channel APIs, and typed contracts. |
| `@mindfoldhq/trellis` | CLI argument parsing, terminal rendering, command wiring, process exit behavior, template installation, migrations, and release scripts. |

The CLI should be a thin shell around core where a capability needs to be shared with other integrations. The core package must stay independent of terminal UX and CLI process control.

---

## Package boundary

Core owns:

- channel storage and event append/read helpers
- channel and thread state reducers
- task record helpers that are useful outside the CLI
- structured types shared by CLI, tests, and future SDK consumers
- pure validation and normalization logic that should not depend on Commander or Chalk
- the `mem` retrieval domain under `packages/core/src/mem/`: persisted-session readers (Claude Code / Codex / OpenCode), search and relevance scoring, dialogue-context extraction, brainstorm-phase slicing, and project aggregation

CLI owns:

- command definitions and option parsing (including `tl mem` argv parsing)
- help text and terminal output (including `tl mem` row formatting and `--json` shaping)
- prompts, confirmations, exit codes, and `process.exit`
- the OpenCode-unavailable stderr notice for `tl mem` (a presentation concern, not a core one)
- template copying, dogfooding paths, and current-version update UX
- release scripts and CI-specific package orchestration

When logic starts in the CLI but is needed by another package or embedding app, move the reusable part into core and leave only CLI rendering and option translation in the CLI package.

---

## Import rules

CLI code must import core through public exports:

```ts
import { createChannelStore } from "@mindfoldhq/trellis-core/channel";
```

Do not deep-import core internals:

```ts
// forbidden
import { parseEvent } from "../../core/src/channel/internal/parse-event";
```

Core public exports must be declared explicitly in `packages/core/package.json`. Do not expose wildcard internal paths. Export entries should provide `types`, `import`, and `default` targets.

### Subpath exports

Issue #31 D1 adds the explicitly versioned `/task/v2` API (Task schema 2.0,
Delivery API 1.0). Legacy `/task` stays pinned during the migration window.
Schema-2 aggregate writes and Python equivalents share one behavior fixture
corpus; do not expose v2 implicitly from the root or dual-write a Task.
See [Delivery Lifecycle](./delivery-lifecycle.md) for the public authority and
finite cutover prerequisites.

Migration consumers pin `/task/legacy-migration` for the original predecessor
projection and `/task/migration-v2` for `validateTaskV2Projection`. Neither is a
current lifecycle writer. Plan-1 callers must not depend on future `/task`
exports changing shape. The v2 store owns immutable result/preimage enforcement,
Task-local relocation and `resolveTaskArtifactLocator`; consumers must use its
origin-aware resolver rather than copying path rebasing into each reader.

For an already validated maintenance projection whose active tree does not yet
exist, `/task/v2` also exports the existing pure
`authorityLocator(ref: AuthorityRef, context?: TaskArtifactContext): string`.
Context contains `task_id`, selected/planned `task_root` and preserved
`artifact_origin`. This helper only maps SHA-bound origin locators; fixed Git
locators stay unchanged. It does not load/select a Task, validate caller context,
verify content or grant authority. Preparation derives context from its validated
projection and explicit destination, then verifies actual/planned content.
Ordinary `resolveTaskArtifactLocator` and context-aware `verifyAuthority` retain
their live selected-Task validation. Reuse the same mapping implementation.

`/task/v2` also exports the read-only `verifyHistoricalCommit(root, fact)` for
normal local delivery and explicit migration. It validates a closed DeliveryFact
at the public boundary and accepts only `local_commit`; manual/PR results need
their own original producer verification. The full SHA-1/SHA-256 commit OID must
identify an actual commit whose selected tree blobs and executable bits match
the candidate content digest. Current HEAD and worktree content do not replace
that immutable historical tree. This helper performs no lifecycle or file write.

Core exposes domains as explicit subpaths, not from one root barrel:

```ts
import { createChannelStore } from "@mindfoldhq/trellis-core/channel";
import { searchMemSessions } from "@mindfoldhq/trellis-core/mem";
```

`mem` is published as the `@mindfoldhq/trellis-core/mem` subpath only. It is intentionally **not** re-exported from the `@mindfoldhq/trellis-core` root barrel — that keeps the root API small and stops `DialogueTurn` / `SearchHit` / `MemFilter` from leaking into the root surface. The `mem` public API is `listMemSessions`, `searchMemSessions`, `readMemContext`, `extractMemDialogue`, `listMemProjects`, plus their input/output types and `MemSessionNotFoundError`. Anything under `packages/core/src/mem/internal/` (JSONL/path helpers) is private and must not be deep-imported by the CLI.

The `mem` domain follows the same core API rules as the rest of core: no `zod`, no `console.*`, no `process.exit`. Structured search/context/extract results carry a `warnings` array; list/projects preserve their historical array return types and expose warnings through an optional `onWarning` callback. The CLI decides how to surface warnings and what exit code to use.

---

## Core API design

Core APIs return structured values and throw typed, domain-specific errors when callers need to handle failures.

Core APIs must not:

- call `process.exit`
- print terminal output
- depend on Chalk, Commander, Inquirer, or CLI-only helpers
- read CLI argv directly
- assume the current working directory unless the API contract says so

Prefer small composable functions over one function that parses options, mutates storage, and formats output. The CLI can compose the pieces for user-facing commands.

---

## Storage and state

State transitions should have one owner.

For channel and thread work:

- event file format belongs to core
- event append and sequence allocation belong to core
- durable idempotency for keyed mutation replays belongs to core; keyed
  writes must check the persisted channel event log inside the append lock and
  return the original same-kind event instead of duplicating JSONL rows
- reducers that compute channel/thread summaries belong to core
- CLI commands call core APIs and render results

Do not duplicate `lastSeq`, event classification, linked context parsing, or thread status rules across command files. Add a core helper instead, then use it from the CLI.

---

## Channel runtime substrate

Core owns the reusable channel runtime substrate so CLI, external daemons,
and future SDK consumers share one implementation instead of each
re-parsing `events.jsonl`, pid files, and worker state.

Core owns:

- worker lifecycle event schema (`undeliverable`, `interrupt_requested`,
  `turn_started`, `turn_finished`, `interrupted`) and `spawned.inboxPolicy`
- `reduceWorkerRegistry` — the SOT worker-state projection (pure; durable
  events only, never pid files or inbox cursors)
- `listWorkers` / `watchWorkers` — worker read/watch APIs
- `probeWorkerRuntime` / `reconcileWorkerLiveness` — host-local pid-file
  observation, kept separate from the durable projection;
  `reconcileWorkerLiveness` defaults to no durable writes
- `readChannelEvents` cursor pagination (`beforeSeq` / `afterSeq` / `limit`);
  the read-all default is preserved when no option is set
- `watchChannels` + `channelCursorKey` — cross-channel fan-in with
  per-channel cursors and dynamic channel discovery (project / global scope)
- `matchesInboxPolicy` + delivery modes (`classifyDelivery`,
  `DeliveryMode`) — delivery classification
- the provider-injected runtime contract (`WorkerRuntime`,
  `WorkerStartInput`, `WorkerInterruptResult`, …) plus `spawnWorker`,
  `requestInterrupt`, and `interruptWorker`

CLI owns: Commander argv, terminal rendering, exit codes, provider adapter
implementations (`WorkerAdapter`), the supervisor process launch / signal /
pid-file details, and `process.exit`. Core must not import CLI provider
adapters or shell-specific process behavior — the `WorkerRuntime` is
injected. Do not move `packages/cli/src/commands/channel/supervisor.ts`
wholesale into core.

---

## Build and typecheck contract

Fresh checkouts do not have `packages/core/dist`. The root `typecheck` script must build core before checking the CLI so TypeScript can resolve core declarations.

Required order:

```bash
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis typecheck
```

The release and CI flows must keep this order. A CLI typecheck that only works after a developer has previously built core locally is invalid.

---

## Versioning contract

Core and CLI always publish together with the exact same version.

During development:

- CLI depends on core with `workspace:*`.
- Core and CLI can be tested independently.

During release:

- `bump-versions.js` updates both package versions together.
- `verify-packed-cli` confirms pnpm rewrote `workspace:*` to the exact release version in the packed CLI artifact.
- CI publishes core first, then CLI.
- CI verifies both packages are visible on public npm.

Release/versioning details live in `release-process.md`.

---

## Tests

Core behavior should be tested in `packages/core` when the behavior can run without CLI rendering. CLI tests should cover option parsing, terminal output, command orchestration, and integration with template/migration flows.

If a CLI test duplicates a pure core test, move the pure assertion to core and keep only the CLI-specific behavior in the CLI test.

`mem` is the worked example of this rule: the pure retrieval/search/phase/adapter tests live in `packages/core/test/mem/**`, while `packages/cli/test/commands/mem-*.test.ts` keeps only CLI-wrapper coverage — argv parsing, `--json` output shape, exit behavior, and the OpenCode warning.

## Boundary: core task schema vs .trellis Python scripts

`packages/core/src/task/schema.ts` is the single TS-side source of truth for the
`task.json` shape (including `meta: Record<string, unknown>` with its own
validation). The `.trellis/scripts/` Python layer implements *behavior* on top of
that shape (create/list/set-meta/validate) and has NO parallel
implementation in core — jsonl validation, list tree rendering, and task
rendering exist only in Python.

Rule of thumb when changing task behavior:

- New/changed `task.json` **field or shape** → update `schema.ts` AND the Python
  writers together.
- New **behavior** on existing fields (flags, rendering, warnings) → Python
  (template + dogfood copies) only; core needs nothing.
- The only template code with a genuine dual implementation is sub-agent context
  injection (Python shared hook ↔ Pi extension) — see the Context Injection
  Limits Contract in platform-integration.md.

Unknown task properties are rejected by the canonical SDK record and Python
task readers. See [Task Lifecycle](./task-lifecycle.md).

## Independent maintenance boundary

[Independent maintenance](./commands-maintain.md) adds an explicit tools-only and
selected-task CLI/SDK boundary. It does not relax this document's ordinary
operation, current writer, or complete migration contracts.

`/task/maintenance` also owns the pure
`validateFormalArchiveReactivationProjection(source, projection, facts)` boundary
for one explicitly selected completed schema1 archive. It validates an exact
generation increment and preserved identity/history; CLI owns archive/target Git
facts, retained-file verification and the fixed-operation writer. Keep ordinary
`validateTaskV2Projection` generation-preserving. Shared identity/tree/history
logic may be private Core code with explicit generation rules; never alter source
generation merely to pass the ordinary validator. Do not expose that private
helper as another public migration API or duplicate conversion in Python.

The [formal predecessor archive contract](./commands-maintain.md#formal-predecessor-archive-reactivation)
owns the separate request/result, provenance and successor-inspection rules.
These do not change current Task v2 reopen or make Core responsible for workflow
completion judgment, GitHub disposition or environment resource ownership.
