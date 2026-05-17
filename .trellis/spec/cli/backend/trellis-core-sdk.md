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
- template copying, dogfooding paths, migration manifest application, and update UX
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

Core exposes domains as explicit subpaths, not from one root barrel:

```ts
import { createChannelStore } from "@mindfoldhq/trellis-core/channel";
import { searchMemSessions } from "@mindfoldhq/trellis-core/mem";
```

`mem` is published as the `@mindfoldhq/trellis-core/mem` subpath only. It is intentionally **not** re-exported from the `@mindfoldhq/trellis-core` root barrel — that keeps the root API small and stops `DialogueTurn` / `SearchHit` / `MemFilter` from leaking into the root surface. The `mem` public API is `listMemSessions`, `searchMemSessions`, `readMemContext`, `extractMemDialogue`, `listMemProjects`, plus their input/output types and `MemSessionNotFoundError`. Anything under `packages/core/src/mem/internal/` (JSONL/path helpers) is private and must not be deep-imported by the CLI.

The `mem` domain follows the same core API rules as the rest of core: no `zod`, no `console.*`, no `process.exit`. It returns structured results with a `warnings` array; the CLI decides how to surface warnings and what exit code to use.

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
