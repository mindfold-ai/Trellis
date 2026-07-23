---
name: commands-mem
description: "Cross-platform AI session memory: subcommands, schemas, indexing, cleaning pipeline, search relevance"
paths:
  - packages/cli/src/commands/mem.ts
---
# `tl mem` — Cross-Platform AI Session Memory

How Trellis indexes, searches, and extracts dialogue from on-disk session files
written by Claude Code, Codex, OpenCode, Pi Agent, and ZCode.

The retrieval engine lives in `@mindfoldhq/trellis-core/mem` (`packages/core/src/mem/`);
`packages/cli/src/commands/mem.ts` is a thin CLI wrapper over it. See "Package
boundary" below before "Subcommand surface".

---

## Overview

`tl mem` is an offline reader over **local AI session stores**. It does not
attach to running CLIs or talk to any remote service — it parses the files those
CLIs already drop on disk:

| Platform    | Session root                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/projects/<sanitized-cwd>/<id>.jsonl`                                                    |
| Codex       | `~/.codex/sessions/**/rollout-<ts>-<id>.jsonl`                                                     |
| OpenCode    | Reader unavailable in 0.6.0-beta.4 (reverted, see Notes)                                           |
| Pi Agent    | `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<id>.jsonl` or env/settings custom session dir |
| ZCode       | `~/.zcode/cli/db/db.sqlite` plus active `db.sqlite-wal` / `db.sqlite-shm` files                    |

For every session, `mem` can: list metadata (id / cwd / time), grep cleaned
dialogue across all of them, drill into a single session for a token-budgeted
context window around hits, or dump full cleaned dialogue. The cleaned form
strips Trellis / platform injection tags so search hits aren't dominated by
session-start preamble.

The retrieval domain does **not** depend on the rest of the Trellis runtime (no
`configurators/`, no Python scripts) and does **not** depend on the CLI: it uses
only `node:fs / node:path / node:os` and is free of `zod`, `console.*`, and
`process.exit`. The CLI exposes it through a single `runMem(args)` entry point
invoked from the `tl` Commander wire.

> **Audience for this spec**: contributors extending `mem` — adding new
> platforms, new subcommands, or new flags. The goal is to keep the cleaning
> pipeline, filtering semantics, and ranking heuristics consistent across
> platforms when changes are made.

---

## Package boundary

`mem` is split between `@mindfoldhq/trellis-core` and the CLI. See
`trellis-core-sdk.md` for the general rule; the `mem`-specific split:

**Core owns** (`packages/core/src/mem/`, public surface at the
`@mindfoldhq/trellis-core/mem` subpath — **not** the root barrel):

- persisted-session readers / adapters for Claude Code, Codex, OpenCode, Pi,
  and ZCode (`adapters/{claude,codex,opencode,pi,zcode}.ts`)
- search, relevance scoring, excerpt selection (`search.ts`)
- dialogue cleaning (`dialogue.ts`), filtering (`filter.ts`)
- dialogue-context extraction (`context.ts`), brainstorm-phase slicing
  (`phase.ts`), project aggregation (`projects.ts`)
- the orchestration API: `listMemSessions`, `searchMemSessions`,
  `readMemContext`, `extractMemDialogue`, `listMemProjects`, plus their
  input/output types and `MemSessionNotFoundError`
- low-level JSONL / path helpers under `packages/core/src/mem/internal/`
  (private — the CLI must not deep-import them)

**CLI owns** (`packages/cli/src/commands/mem.ts`):

- `runMem`, argv parsing (`parseArgv`), and CLI flag → `MemFilter` translation
- terminal rendering: `printSessions`, `shortDate`, `shortPath`, row formatting
- `--json` output shaping (preserving the stable JSON field names)
- the OpenCode-unavailable stderr notice (`warnOpencodeUnavailable`)
- `process.exit` codes and `die`

The CLI imports core through the public subpath only:

```ts
import { searchMemSessions } from "@mindfoldhq/trellis-core/mem";
```

Core search/context/extract results carry a `warnings` array. List/projects
preserve their array return types and accept an optional `onWarning` sink. The
CLI decides how to print warnings and what exit code to use; core never prints
or exits.

---

## Subcommand surface

Entry point: `commands/mem.ts:runMem` dispatches on `argv.cmd` after
`commands/mem.ts:parseArgv`, then calls the matching core `@mindfoldhq/trellis-core/mem`
API and renders the result. The cross-cutting `--platform / --since / --until /
--cwd / --global / --limit` flags are parsed by the CLI and translated into a
core `MemFilter`.

| Subcommand               | Function                      | Purpose                                                                                                                                                                                   |
| ------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`                   | `commands/mem.ts:cmdList`     | List session metadata sorted by recency, capped at `--limit` (default 50). Default subcommand when none given.                                                                            |
| `search <kw>`            | `commands/mem.ts:cmdSearch`   | Multi-token AND grep over cleaned dialogue across all matching sessions; ranks by weighted relevance score; emits per-session excerpts.                                                   |
| `context <id>`           | `commands/mem.ts:cmdContext`  | Drill-down on a single session: top-N hit turns + N turns of context on either side, char-budgeted. With no `--grep`, returns the first N turns (session opening).                        |
| `extract <id>`           | `commands/mem.ts:cmdExtract`  | Dump full cleaned dialogue for one session; `--grep` filters turns by AND-substring.                                                                                                      |
| `projects`               | `commands/mem.ts:cmdProjects` | Aggregate distinct cwds across platforms with last-active timestamp + per-platform counts. AI uses this as a directory of "门牌号" (project paths) before picking a `--cwd` for `search`. |
| `help` / `--help` / `-h` | `commands/mem.ts:cmdHelp`     | Print full flag reference.                                                                                                                                                                |

### Flags

Cross-cutting (`buildFilter`):

| Flag                                          | Default         | Notes                                                                                                                                                                |
| --------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--platform claude\|codex\|opencode\|pi\|zcode\|all` | `all` | Validated by the CLI against the `MemSourceFilter` union (hand-written guard, no zod). Unknown value → exit 2. |
| `--since YYYY-MM-DD`                          | none            | Inclusive lower bound. Parsed by `new Date(value)`; invalid → exit 2.                                                                                                |
| `--until YYYY-MM-DD`                          | none            | Inclusive upper bound; parser appends `T23:59:59.999Z` so a date string covers the whole UTC day.                                                                    |
| `--cwd <path>`                                | `process.cwd()` | Project scope. Resolved with `path.resolve`. Combined with `--global` → `--global` wins.                                                                             |
| `--global`                                    | off             | Drops cwd scoping (`f.cwd = undefined`).                                                                                                                             |
| `--limit N`                                   | `50`            | Cap on output rows. Internally bumped to `1_000_000` for `search` candidate gathering and `findSessionById` so the limit only controls _display_, not search recall. |

Subcommand-specific:

| Flag                 | Subcommands          | Default               | Notes                                                                                                                                                              |
| -------------------- | -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--grep KW`          | `extract`, `context` | none                  | Multi-token AND. `extract` filters turns by substring; `context` ranks turns and shows top hits. Required-non-empty for `context --grep`.                          |
| `--turns N`          | `context`            | `3`                   | Number of hit turns to surface.                                                                                                                                    |
| `--around M`         | `context`            | `1`                   | Turns of context on either side of each hit; deduped via `Set`.                                                                                                    |
| `--max-chars N`      | `context`            | `6000` (~1500 tokens) | Total char budget. Per-turn cap is `floor(N/2)`; turns exceeding it are head-truncated with `…[+X chars]`.                                                         |
| `--include-children` | `search`, `context`  | off                   | Merge OpenCode sub-agent descendants into parent before search/context (only OpenCode populates `parent_id`). No-op in 0.6.0-beta.4 (OpenCode reader unavailable). |
| `--json`             | all                  | off                   | Machine-readable output for AI consumption.                                                                                                                        |

---

## Platform indexing

Each platform adapter lives in `packages/core/src/mem/adapters/` and exports
three functions:

| Platform | `*ListSessions(f)`                                   | `*ExtractDialogue(s)`     | `*Search(s, kw)`                                  |
| -------- | ---------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| Claude   | `core/mem/adapters/claude.ts:claudeListSessions`     | `claudeExtractDialogue`   | `claudeSearch`                                    |
| Codex    | `core/mem/adapters/codex.ts:codexListSessions`       | `codexExtractDialogue`    | `codexSearch`                                     |
| OpenCode | `core/mem/adapters/opencode.ts:opencodeListSessions` | `opencodeExtractDialogue` | `opencodeSearch` (degraded no-op in 0.6.0-beta.4) |
| Pi       | `core/mem/adapters/pi.ts:piListSessions`             | `piExtractDialogue`       | `piSearch`                                        |
| ZCode    | `core/mem/adapters/zcode.ts:zcodeListSessions`       | `zcodeExtractDialogue`    | `zcodeSearch`                                     |

`core/mem/sessions.ts:listAll` fans out to the platform list functions and
merges results sorted by `updated ?? created` descending; the same module's
`extractDialogue` / `searchSession` helpers dispatch on `s.platform`.

### Claude Code

- **Layout**: `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`. The cwd is
  sanitized as `cwd.replace(/[/_]/g, "-")`. When `--cwd` is set, `mem` resolves
  the single project directory directly; otherwise it walks every project dir.
- **Index**: when present, `<projectDir>/sessions-index.json` provides
  `cwd / created / title` per session id, saving a JSONL scan. Missing fields
  fall back to scanning the first 100 events (`findInJsonl`) for a `cwd`, then
  the very first event (`readJsonlFirst`) for a creation timestamp.
- **Updated**: `fs.statSync(filePath).mtime`.
- **Cleaning** (`core/mem/adapters/claude.ts:claudeExtractDialogue`):
  - User turns: `type === "user"` AND `message.role === "user"` AND
    `content` is a string (Array content = tool_result, dropped).
  - Assistant turns: `type === "assistant"` AND `message.role === "assistant"`
    AND `content` is array of blocks; only `block.type === "text"` blocks kept.
    `thinking` and `tool_use` blocks dropped wholesale.
  - **Compaction**: when a `user` event has `isCompactSummary === true`, all
    pre-compact turns are discarded and replaced with a single synthetic
    `[compact summary]\n<text>` user turn.

### Codex

- **Layout**: `~/.codex/sessions/**/rollout-<YYYY-MM-DDTHH-MM-SS>-<id>.jsonl`.
  `core/mem/internal/paths.ts:walkDir` recurses lazily via a stack-based generator.
- **Filename timestamp**: parsed by regex
  `/^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/` and converted to ISO
  by replacing `T??-??-??` with `T??:??:??Z`. Used as fallback `created` if the
  first event lacks `timestamp`.
- **Metadata**: read from the first JSONL event's `payload` (id, cwd).
- **Cleaning** (`core/mem/adapters/codex.ts:codexExtractDialogue`):
  - Real turns: top-level event with `payload.type === "message"` and
    `payload.role` parseable to `user` / `assistant` (drops `developer` /
    `system`).
  - Each `payload.content[]` part is kept iff `type` is `input_text` or
    `output_text`. Other types ignored.
  - **Compaction**: a top-level `type: "compacted"` event carries
    `payload.replacement_history[]` — each item with `type === "message"`
    becomes a synthetic `[compact]\n<text>` turn, and prior turns are
    discarded.

### Pi Agent

#### 1. Scope / Trigger

Adding or changing Pi support means editing the zero-dependency adapter at
`core/mem/adapters/pi.ts`, the explicit dispatchers in `core/mem/sessions.ts`,
project aggregation in `core/mem/projects.ts`, and CLI platform validation/help
in `commands/mem.ts`.

#### 2. Signatures

The Pi adapter exports the same platform functions as the other adapters plus
its phase collector:

```ts
export function piListSessions(f: MemFilter): MemSessionInfo[];
export function piExtractDialogue(s: MemSessionInfo): DialogueTurn[];
export function piSearch(s: MemSessionInfo, kw: string): SearchHit;
export function collectPiTurnsAndEvents(s: MemSessionInfo): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
};
```

#### 3. Contracts

- **Roots**: inspect the default root under
  `~/.pi/agent/sessions/--<encoded-cwd>--/`, `PI_CODING_AGENT_DIR`,
  `PI_CODING_AGENT_SESSION_DIR`, global `~/.pi/agent/settings.json`, and the
  scoped project's `.pi/settings.json`. Resolve relative `sessionDir` values
  from the directory containing their settings file, matching Pi's settings
  contract. Custom session dirs contain direct `.jsonl` files and must be
  filtered by the header `cwd`.
- **Metadata**: the first row must be a `type: "session"` header. Emit
  `platform: "pi"`, `id`, `cwd`, `created`, `updated`, `filePath`, and optional
  `title` from the latest `session_info.name`. Do not use the first user
  message as a title.
- **Active branch**: Pi JSONL is tree-shaped. Build `id -> entry`, choose the
  last non-header entry in file order as the active leaf, then walk `parentId`
  to root. Never scan all rows linearly for dialogue/search.
- **Compaction**: if the active path contains compactions, use the latest one:
  emit `[compact summary]` first, then entries from `firstKeptEntryId` up to the
  compaction entry, then entries after compaction. Discard older pre-compaction
  entries and their `task.py` boundary events.
- **Cleaning**: keep user text, assistant `text` blocks, `custom_message` text,
  `[branch summary]`, and `[compact summary]`. Drop thinking, tool results,
  bash output, image payloads, and tool-call arguments from dialogue.
- **Phase signals**: collect `task.py create|start` from assistant `toolCall`
  blocks where `name` is `bash` or `shell` and `arguments.command` is a string,
  and from `message.role === "bashExecution"` with string `command`.

#### 4. Validation & Error Matrix

| Condition                                            | Required behavior                                   |
| ---------------------------------------------------- | --------------------------------------------------- |
| Missing Pi roots                                     | Return `[]` silently                                |
| Malformed JSONL row or unknown entry type            | Skip silently                                       |
| Header has unknown cwd under `--cwd` scope           | Drop the session                                    |
| Abandoned branch contains matching text              | `search` / `extract` must not include it            |
| Discarded pre-compaction text contains matching text | `search` / `extract` must not include it            |
| `--phase brainstorm` has no Pi `task.py` boundary    | Shared no-boundary warning + full dialogue fallback |
| `--phase implement` has no Pi `task.py` boundary     | Shared no-boundary warning + empty result           |

#### 5. Good/Base/Bad Cases

- Good: `trellis mem search kw --platform pi --cwd /repo` searches only the
  cleaned active branch for `/repo`, with compaction already applied.
- Base: `trellis mem list --platform pi --json` returns metadata rows with the
  latest session name when `/name` or `--name` was used.
- Bad: a linear scan over every Pi row leaks `/tree` abandoned branches and old
  pre-compaction history into search results.

#### 6. Tests Required

- Core adapter fixtures for listing, title, settings/custom root, cleaned
  extraction, active branch, compaction, and search.
- Core phase fixtures for assistant `toolCall` and `bashExecution` boundaries,
  including compaction dropping stale events.
- Public API tests for `platform: "pi"`, `readMemContext`,
  `extractMemDialogue(... phase: "brainstorm")`, and `listMemProjects().by_platform.pi`.
- CLI tests for `--platform pi`, JSON list/search/context/extract output, and
  help text.

#### 7. Wrong vs Correct

Wrong — linear scan leaks inactive history:

```ts
readJsonl(file, (entry) => {
  if (entry.type === "message") turns.push(turnFromMessage(entry.message));
});
```

Correct — resolve the active path first, then clean:

```ts
const path = walkParentIdsFromLastLeaf(entries);
const effective = applyLatestPiCompaction(path);
for (const entry of effective) addCleanTurnAndTaskEvents(entry);
```

### ZCode

- **Layout**: one shared SQLite database at `~/.zcode/cli/db/db.sqlite` with
  `session`, `message`, and `part` tables. Recent commits may exist only in the
  sibling WAL.
- **Snapshot safety**: the zero-dependency reader double-reads the WAL-index
  header, fixes the committed end mark at `mxFrame`, validates WAL header/frame
  cumulative checksums, and retries when main/WAL/shm changes during capture.
- **Single-session memory**: extract/context traverse `message` and `part` with
  predicates and retain only rows belonging to the requested session. Search
  prepares one whole-db store for the command and releases it in `finally`.
- **Degradation**: missing storage means no sessions. Corrupt files, unstable
  WAL snapshots, or missing required tables/columns produce empty ZCode output
  plus one structured `zcode-db-unreadable` warning; core never prints it.
- **Cleaning/phase**: text parts become user/assistant turns; compaction starts
  the effective dialogue at the latest summary; Bash tool parts provide
  `task.py create|start` boundaries.

### OpenCode (reader unavailable as of 0.6.0-beta.4+)

In 0.6.0-beta.3 a SQLite-backed reader was added for OpenCode 1.2+
(which migrated from JSON tree to `~/.local/share/opencode/opencode.db`).
That release relied on a `better-sqlite3` native dependency that broke
installation on Windows + restricted networks (China, corporate
firewalls): `prebuild-install` timed out fetching binaries, the fallback
`node-gyp` rebuild required VS2017+ build tools, and `trellis` failed to
install at all on machines that did not have a C toolchain. 0.6.0-beta.4
reverted the dependency. See `quality-guidelines.md` "Native dependency
policy" for the broader rule.

Current behavior:

- `opencodeListSessions` returns `[]`.
- `opencodeExtractDialogue` returns `[]`.
- `opencodeSearch` returns an empty hit.
- All three call `warnOpencodeUnavailable()` which writes one stderr line
  per process (cached via module-level flag).

Re-enabling OpenCode requires an install-resilient backend. Acceptable
options, ordered by preference:

1. **Pure-JS / WASM** — `sql.js` bundled WASM. No native build, identical
   bytes on every platform, slightly higher memory cost.
2. **Shell-out** — invoke the user's system `sqlite3` CLI when present;
   skip OpenCode with a clear message when absent. No native build, zero
   bundle cost, depends on host.
3. **`node:sqlite`** — once it graduates from experimental in Node LTS.
   Native but ships with the runtime, no install-time compile.
4. **`optionalDependencies` + soft-degrade** — only as a last resort, and
   only if the soft-degrade path matches today's "empty list + one-shot
   warning" UX exactly so a missing dep does not regress install reliability.

See follow-up task notes.

### `SessionInfo` contract

Every list function emits items conforming to the `MemSessionInfo` type
(`core/mem/types.ts`):

| Field       | Required      | Source                                                                                                                                                  |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`  | yes           | `claude` / `codex` / `opencode` / `pi` / `zcode`                                                                                                        |
| `id`        | yes           | platform session id                                                                                                                                     |
| `title`     | optional      | Claude index `title`, OpenCode `title`, Pi latest `session_info.name`; Codex has no title                                                               |
| `cwd`       | optional      | OpenCode `directory`, Claude index/event `cwd`, Codex first-event `payload.cwd`, Pi session header `cwd`                                                |
| `created`   | optional ISO  | first-event/header timestamp; Codex falls back to filename timestamp                                                                                    |
| `updated`   | optional ISO  | `fs.statSync(file).mtime` for Claude/Codex fallback; Pi prefers latest user/assistant activity and falls back to mtime; OpenCode `session.time_updated` |
| `filePath`  | yes           | absolute path to the session's primary file (OpenCode: shared `opencode.db`)                                                                            |
| `parent_id` | OpenCode only | sub-agent linkage from `session.parent_id`; Pi `parentSession` is fork/clone source metadata and must not participate in `--include-children`           |

---

## Filtering & overlap semantics

The single most important invariant in `mem.ts`:

> **Sessions are filtered by interval overlap, not by single-point `created` comparison.**

### `inRange` vs `inRangeOverlap`

| Helper                              | Semantics                                                                                      | Use site                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `core/mem/filter.ts:inRange`        | Single-point: `f.since ≤ t ≤ f.until`. Pass-through if `iso` undefined or unparseable.         | Internal-only; **not used for session list filtering** |
| `core/mem/filter.ts:inRangeOverlap` | Interval: keep iff session lifetime `[start, end]` overlaps query window `[f.since, f.until]`. | Used by every `*ListSessions` function                 |

### Why overlap is mandatory

Long-lived sessions cross day boundaries. A Claude session created on 2026-04-01
but still receiving messages on 2026-04-05 must show up under
`--since 2026-04-03`. With single-point `inRange(created, f)` it would be
silently dropped despite being demonstrably active inside the window. Audit
trail: `task.05-08-mem-since-cross-day-filter`.

The historical Codex bug deserves a callout. The list function used to
short-circuit on `!inRange(tsFromName, f)` _before_ even reading the file —
plausible-looking optimization, but `tsFromName` is the session's **creation
time**, so a cross-day session was dropped solely because it started before
`--since`. This was removed; Codex now stats every file and applies overlap on
`[created, updated]`. The performance cost is one `fs.statSync` per Codex
rollout per list call, which is negligible compared to the JSONL parse already
happening.

**Rule**: when adding a new platform, both `start` and `end` go through
`inRangeOverlap`. Never short-circuit on a single timestamp. If a platform only
exposes one timestamp, pass it as both `start` and `end` — `inRangeOverlap` is
defined to handle that degenerate case.

### `sameProject` semantics

`core/mem/filter.ts:sameProject` returns true iff target is undefined (no scope),
or if `path.resolve(sessionCwd) === path.resolve(target)`, or if the session
cwd is a descendant directory (`startsWith(target + sep)`). Sessions whose cwd
is unknown are dropped under cwd scoping but kept under `--global`.

---

## Cleaning pipeline

Before any search or display, raw turn text passes through:

1. **`core/mem/dialogue.ts:stripInjectionTags`** — case-insensitive removal of
   `<tag>...</tag>` blocks for every entry in `INJECTION_TAGS`. Also strips
   AGENTS.md preamble (`^# AGENTS\.md instructions for...` until the next
   blank-line + capital/CJK boundary). Collapses runs of `\n` to `\n\n` and
   trims.
2. **`core/mem/dialogue.ts:isBootstrapTurn`** — applied AFTER tag stripping. Drops
   the entire turn (returns `null` from the per-platform builder) when:
   - `cleaned.startsWith("# AGENTS.md instructions for")`, OR
   - `originalLength > 4000` AND `cleaned` begins with `<INSTRUCTIONS>` (case
     insensitive). The size threshold avoids false-dropping a tiny user reply
     that happens to start with `<INSTRUCTIONS>`.
3. **Compaction handling** — Claude `isCompactSummary` and Codex `compacted`
   events both reset accumulated turns and replace them with synthetic
   `[compact …]` markers (see platform sections above).

### Why the pipeline matters for search

Once turns are cleaned, search reduces to **multi-token AND substring matching
on lowercased text** — `searchInDialogue` does not need a tokenizer or stemmer.
The cleaning pipeline is what makes plain `String.prototype.includes` viable:
Trellis / platform injection tags would otherwise dominate every match.

If you need to add a new injection tag (e.g. a new Trellis hook adds
`<my-new-tag>`), append it to the `INJECTION_TAGS` array and add a fixture-based
test. Do not write platform-specific stripping logic; the tag list is shared.

`INJECTION_TAGS` currently covers:

```
system-reminder, task-status, ready, current-state, workflow,
workflow-state, guidelines, instructions, command-name, command-message,
command-args, local-command-stdout, local-command-stderr,
permissions instructions, collaboration_mode, environment_context,
auto_compact_summary, user_instructions
```

`permissions instructions` (with a space) is intentional — Codex emits it
exactly that way.

---

## Search relevance scoring

`core/mem/search.ts:searchInDialogue` returns a `SearchHit` with per-role hit
counts and excerpts. `core/mem/search.ts:relevanceScore` is the ranker:

```
score(hit) = (3 * user_count + asst_count) / total_turns
```

### Weight rationale

- **User hits weighted ×3**: the user's own words anchor topic intent. An
  assistant repeating "session insight" twenty times in elaboration scores
  lower than the user mentioning it twice — assistant elaboration is downstream
  of what the user actually cared about.
- **Normalized by `total_turns`**: a tight 18-hit short session must outrank a
  sprawling 58-hit long session. Without normalization, every long session
  would dominate.

### Tie-breaking (`cmdSearch`)

```
1. score (descending)
2. raw count (descending)
3. updated ?? created (descending) — recency
```

### Excerpt selection

Within a turn, hit positions are scored by:

1. **Coverage** — distinct query tokens visible in the chunk (descending).
2. **Anchor rarity** — `1 / tokenFreq[anchorToken]` (descending). A chunk
   anchored on the rarest matching token best signals where the user actually
   talked about the topic; chunks anchored on common tokens (project name,
   "the") are mostly noise.
3. **Earliest start** — final stable tie-break.

Chunks come from `core/mem/search.ts:chunkAround` — paragraph-aligned by `\n\n`
on either side of the hit, falling back to a centered char window if the
natural paragraph exceeds `maxChars` (default `400`). Truncation is reported
via the `truncated` flag and surfaces as leading / trailing `…` in the snippet.

User-role excerpts are emitted **before** assistant excerpts in the final list
(see the `[...userExcerpts, ...asstExcerpts]` concatenation in
`searchInDialogue`). With `maxExcerpts = 3` (default), a turn with three user
hits and ten assistant hits will surface only user excerpts.

### Chunk dedup

`seenStarts` set prevents adjacent hit positions inside the same paragraph
from generating multiple overlapping excerpts. Two hits in one paragraph
collapse to one chunk.

---

## Sub-agent merging (`--include-children`)

OpenCode is the only platform with a native parent-child link
(the `parent_id` column on the SQLite `session` table). When
`--include-children` is set:

1. `core/mem/sessions.ts:buildChildIndex` walks the candidate list and builds a
   `Map<parent_id, descendants[]>` with **transitive flattening** — a parent
   maps to all descendants, not just direct children.
2. **Search**: `core/mem/sessions.ts:searchSessionWithChildren` concatenates the
   parent's cleaned dialogue with every descendant's cleaned dialogue and runs
   `searchInDialogue` once over the merged turn list. Scores reflect topic
   density across the entire sub-agent tree.
3. **Filter absorbed children**: any candidate whose `parent_id` is also in the
   candidate set is dropped from the result list — the parent already absorbs
   its hit.
4. **Context** (`cmdContext`): same merge; children turns are appended after
   parent turns in `extractDialogue` order; the count of merged children is
   surfaced in output.

Claude and Codex pass through unchanged — `parent_id` is undefined, so they
never absorb children.

---

## Boundaries — what `mem.ts` does NOT do

- **No live process attach**: only reads files already on disk. Sessions
  in-flight may be partially indexed (the JSONL is append-only, so reads are
  consistent at line granularity).
- **No global cross-cwd implicit search**: by default everything is cwd-scoped
  to `process.cwd()`. Cross-project queries require explicit `--global` or the
  `projects` subcommand to discover other cwds first.
- **No write path**: `mem` never modifies session files, indexes, or any other
  state. It is a strict reader.
- **No remote/cloud sync**: OpenCode's optional cloud sync is invisible here.
  Local OpenCode reading is also unavailable in 0.6.0-beta.4 (reverted — see
  the OpenCode section above).
- **No transitive dependency on Trellis runtime**: `core/mem/` does not import
  from `configurators/`, `migrations/`, `templates/`, or `.trellis/scripts`,
  and does not depend on the CLI package. It uses only
  `node:fs / node:path / node:os` — no `zod`, no `console.*`, no
  `process.exit`. The OpenCode native-dep path (`better-sqlite3`) was removed
  in 0.6.0-beta.4.
- **No OpenCode-style sub-agent linkage outside OpenCode**: even if a future
  Codex / Claude release exposes parent-child IDs, the current
  `buildChildIndex` only consults `s.parent_id`, which only OpenCode emits.
  Adding cross-platform sub-agent merging means extending `SessionInfo`.

---

## Search index gaps (known limitations)

`mem search` / `mem extract --grep` / `mem context --grep` operate on the
**cleaned dialogue text only** — user messages plus assistant `text` blocks,
post-`stripInjectionTags`. The following raw-JSONL fields are deliberately
excluded from the search index:

| Excluded field                              | Where it lives                              | Example value the index misses                 |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `tool_use.name`                             | Claude assistant blocks (`type:"tool_use"`) | `"Skill"`, `"Bash"`, `"Read"`                  |
| `tool_use.input.*`                          | same                                        | `{"skill":"res-literature-search","args":"…"}` |
| `tool_use.id`                               | same                                        | `toolu_01XYZ…`                                 |
| `tool_result.content`                       | Claude user blocks (`type:"tool_result"`)   | command stdout, file contents                  |
| `thinking` blocks                           | Claude assistant blocks (`type:"thinking"`) | extended-thinking text                         |
| Codex `payload.tool_call.*`                 | Codex events with `type:"tool_call"`        | similar tool metadata                          |
| Codex `payload.function_call_output.*`      | tool result events                          | function output                                |
| `cwd`, `gitBranch`, `version`, `entrypoint` | top-level event metadata                    | `feat/v0.6.0-beta`, `2.1.132`                  |

**User-visible consequence**: queries phrased in terms of _what tool / skill /
agent was invoked_ return false-negatives even when the conversation used that
tool heavily. For example, `tl mem search "Skill"` against a session that
called `Skill` 40 times will return 0 hits — the tool name lives in
`tool_use.name`, which is dropped at extraction time.

This is **by design**: the dialogue cleaner exists to make `String.includes`
relevance ranking work on conversational text. Indexing tool metadata would
flood every assistant turn with `Skill`/`Read`/`Bash`/`Edit`/etc. and destroy
signal-to-noise. The right tool for tool-usage queries is **raw `grep` over
the JSONL files**:

```bash
# What skills did this session invoke?
grep -oE '"name":"Skill","input":\{[^}]+\}' \
  ~/.claude/projects/-Users-…-Trellis/<session-id>.jsonl

# Cross-session skill usage in a project
grep -hoE '"skill":"[a-z0-9-]+"' \
  ~/.claude/projects/-Users-…-Trellis/*.jsonl | sort | uniq -c
```

**Decision rule** for choosing between `tl mem` and raw `grep`:

| Searching for                                                       | Tool                     |
| ------------------------------------------------------------------- | ------------------------ |
| User/assistant said something / discussed a topic / made a decision | `tl mem search`          |
| What tool / skill / agent / sub-agent was used                      | `grep` over JSONL        |
| Tool call frequency / parameters                                    | `grep` + `jq` over JSONL |
| Cross-session topic recall (concepts in dialogue)                   | `tl mem search`          |

A future enhancement could add an opt-in `--include-tools` flag to
`extractDialogue` that emits synthetic `[tool: <name>]` turns or surfaces
tool metadata as a separate result stream, but the current scope does not.
Document the limitation, point users at `grep`, do not silently lower
relevance quality on the conversational path.

---

## Phase slicing (`--phase`)

`tl mem extract <id> --phase <brainstorm|implement|all>` slices the cleaned
dialogue by Trellis brainstorm windows, allowing the high-density discussion
turns (user thinking, AI proposals being rejected, decision rationale) to be
extracted independently from implementation work.

### Three values

| `--phase`       | Behavior                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all` (default) | Pre-existing behavior — full cleaned dialogue, unchanged.                                                                                         |
| `brainstorm`    | Returns only turns inside `[task.py create, task.py start)` windows.                                                                              |
| `implement`     | Returns turns OUTSIDE every brainstorm window (i.e., turns the user spent doing the actual work, plus session warm-up before the first `create`). |

### Boundary signal

A brainstorm window is bounded by `task.py` invocations recovered from
platform-native shell-call events (which the dialogue cleaners discard):

- **Window start**: a Bash-equivalent shell call whose command matches
  `task.py create`.
  - Claude: assistant `tool_use` block with `name === "Bash"`,
    `input.command` is the command string.
  - Codex: top-level `function_call` event with `name` ∈ `{"exec_command",
"shell"}`. The command string is recovered by
    `core/mem/adapters/codex.ts:commandFromCodexArguments`, which accepts every
    shape Codex versions emit: a raw shell string, a stringified JSON object,
    or a raw object — with the command under `cmd`, `command`, or `argv[]`
    (joined with spaces).
- **Window end**: the next `task.py start` shell call in the same session.

Pi uses the same boundary model, with shell commands recovered from assistant
`toolCall` blocks named `bash` / `shell` (`arguments.command`) and from
`bashExecution.command` messages.

The detection is performed by `core/mem/adapters/claude.ts:collectClaudeTurnsAndEvents`
(Claude), `core/mem/adapters/codex.ts:collectCodexTurnsAndEvents` (Codex), and
`core/mem/adapters/pi.ts:collectPiTurnsAndEvents` (Pi) — each is a single pass
that produces both the cleaned `DialogueTurn[]` (semantically identical to the
platform's `*ExtractDialogue`) AND a list of `task.py` events with their
`turnIndex` (the cleaned-turn index AT THE TIME the shell call was seen).

### Regex compatibility

`core/mem/phase.ts:parseTaskPyCommand` parses individual Bash commands. It must
cover every shape Trellis users actually write:

```
\b(?:python3?|py(?:\s+-3)?)?\s*\S*[/\\]?task\.py\s+(create|start)\b
```

Concretely supported invokers + path forms:

- `python ./.trellis/scripts/task.py create "title"`
- `python3 ./.trellis/scripts/task.py create my-task`
- `py -3 .trellis/scripts/task.py create ...` (Windows launcher)
- `python3 .trellis\\scripts\\task.py start ...` (JSONL-double-escaped backslash)
- `python3 .trellis\scripts\task.py start ...` (single backslash)
- `task.py start <task-dir>` (PATH + chmod +x, no invoker prefix)
- `python3 /Users/.../task.py create ...` (absolute path)

The parser also captures `--slug FOO` / `--slug=FOO` for create events and the
positional task-dir for start events. False-positive guard: `task.py` must
appear at the start of the command, after whitespace, or after a path
separator — never embedded inside a flag value like `--slug=task.py-create-x`.

### Shell-arg parsing in `task.py` boundary detection

Boundary detection runs against real Bash command strings copy-pasted by the
AI from a shell prompt, not against a synthesized argv. The parser stack —
`core/mem/phase.ts:parseTaskPyCommandsAll` → `parseTaskPyCommand` →
`splitShellArgs` → `slugFromTaskDir` — has to absorb several real-world
Bash idioms that surface in dogfood JSONL streams.

| Pattern (real-world)                                                                                             | Edge                                               | Required handling                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `SMOKE=$(python3 task.py create demo --slug demo)`                                                               | trailing `)` glued onto last arg                   | `splitShellArgs` strips trailing `;                                                                                                                         | &()` from each token before yielding |
| `SMOKE=$(task.py create …); task.py start "$SMOKE"`                                                              | TWO `task.py` calls in one Bash command            | `parseTaskPyCommandsAll` returns ALL matches, not just the first                                                                                            |
| `EOF\nWith --slug, task.py start runs after create…` (heredoc commit message body containing the literal phrase) | prose, not a command                               | False-positive guard: token after `task.py` must be a known subcommand at a word boundary; surrounding context must look like an invocation, not a sentence |
| `python3 .trellis/scripts/task.py start .trellis/tasks/05-08-foo`                                                | task-dir has `MM-DD-` prefix from `task.py create` | `slugFromTaskDir` strips a leading `MM-DD-` so a `create --slug foo` pairs with this `start` via slug match                                                 |
| `--slug=foo` vs `--slug foo`                                                                                     | `=` vs space                                       | `splitShellArgs` is whitespace-only; the `=` form is captured by the equals branch in `parseTaskPyCommand`                                                  |

The "two-call" case is the load-bearing one: a brainstorm window opens on the
first `task.py create` inside the same Bash command and closes on the
second `task.py start`, so missing the second call would silently drop the
window. `parseTaskPyCommandsAll` was added in 0.6.0-beta.5 specifically to
fix that drop after a real `--phase brainstorm` dogfood run on this repo
returned 0 windows on a session that contained 6 tasks.

When extending the parser:

- New surface forms (e.g., `tl task create` if Trellis ever ships a wrapper)
  must be added to `parseTaskPyCommand`'s regex AND must round-trip through
  the same shell-token cleanup; do not handle quoting separately.
- Token edge-stripping (`;|&()`) is the canonical place for shell metacharacter
  cleanup. Don't push it into the slug regex or `slugFromTaskDir` — keeping
  it at the tokenizer means future call sites get the cleanup for free.
- The "prose vs invocation" heuristic ("bare-word + space + capital letter")
  is intentionally conservative: false negatives (drop a real call inside a
  weird heredoc) are recoverable via `--phase all` fallback; false positives
  (treat prose as an invocation) corrupt the window labeling and have no
  recovery short of re-running with `--phase all`.

### Pairing strategy (multi-task sessions)

A single Claude session often contains N `[create, start)` pairs as the user
moves through several tasks. Pairing in
`core/mem/phase.ts:buildBrainstormWindows`:

1. **Slug match wins**: any create with an explicit `--slug` is paired with
   the first unmatched start whose `taskDir`'s last segment equals that slug,
   regardless of position.
2. **FIFO fallback**: remaining creates pair with the next unmatched start
   appearing AFTER them in event order.
3. **Output order**: windows are sorted by `startTurn` ascending (so output
   reflects chronological session flow).

Each window emits a label: the explicit slug if known, else
`slugFromTaskDir(start.taskDir)`, else `window-N`.

### Multi-window output format

`--phase brainstorm` with multiple windows emits a separator before each
group:

```
--- task: <slug-or-label> ---

## Human

...
```

In `--json` mode, the output adds:

```json
{
  "phase": "brainstorm",
  "windows": [{ "label": "demo", "startTurn": 1, "endTurn": 3 }, ...],
  "total_turns": 5,
  "groups": [{ "label": "demo", "turns": [...] }, ...],
  "turns": [...]   // flat concatenation of all groups, for legacy parsers
}
```

`groups` is the structured form (one entry per window). `turns` is a flat
concatenation kept for backwards compatibility with consumers that parsed the
pre-`--phase` output.

### Fallback matrix

| Condition                                                              | `--phase brainstorm`                                     | `--phase implement`       |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------- |
| Both `create` and `start` found, paired                                | Slice `[start, end)` of each window                      | Turns NOT in any window   |
| `create` found, no following `start`                                   | `[create, totalTurns)` (window kept open to session end) | Turns before any `create` |
| `start` found, no preceding `create` (task created in earlier session) | `[0, start)`                                             | Turns at or after `start` |
| Neither found                                                          | Full dialogue + stderr warning                           | Empty + stderr warning    |
| `start.turnIndex < create.turnIndex` (event interleave anomaly)        | Window discarded                                         | (no impact)               |

Warnings are emitted to stderr (`console.error`) so they don't pollute the
machine-readable stdout used by `--json` consumers.

### Platform coverage

| Platform | `--phase brainstorm` / `implement`                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude   | Native — boundary detection on `tool_use` (Bash) blocks in raw JSONL                                                                        |
| Codex    | Native — boundary detection on `function_call` events whose `name` is `exec_command` or `shell` (Codex's Bash twin)                         |
| Pi       | Native — boundary detection on assistant `toolCall` blocks named `bash` / `shell` and `bashExecution.command` messages on the active branch |
| ZCode    | Native — boundary detection on `part.data` Bash tool records after compaction has selected the effective dialogue                         |
| OpenCode | Reader unavailable in 0.6.0-beta.4+ (returns empty + warning)                                                                               |

`core/mem/adapters/codex.ts:collectCodexTurnsAndEvents` is the Codex twin of
`collectClaudeTurnsAndEvents`. Same single-pass shape: it produces both the
cleaned `DialogueTurn[]` (semantically identical to `codexExtractDialogue`)
AND the list of `task.py` events with `turnIndex`, with the boundary signal
read from `function_call` events whose `name === "exec_command"` (or `"shell"`)
and whose argument payload contains `task.py create|start`. The dispatcher in
`cmdExtract` picks the right collector by `s.platform`. Pairing
(`buildBrainstormWindows`), labeling (`slugFromTaskDir`), and the fallback
matrix above are shared across Claude, Codex, and Pi — only the raw-event
parser differs.

OpenCode is the only outstanding gap and is gated on the OpenCode reader
itself; see "OpenCode reader status" below.

### Combining with `--grep`

`--phase` runs FIRST, then `--grep` filters turns within the resulting slice.
Order matters: `--grep KW --phase brainstorm` searches only inside the
brainstorm windows, not the entire session.

### Common pitfall: tool_use / function_call is dropped during cleaning

`claudeExtractDialogue`, `codexExtractDialogue`, and `piExtractDialogue`
discard the shell-call carrier blocks (Claude `tool_use`, Codex top-level
`function_call`, Pi `toolCall` / `bashExecution`) because their text is not
user/assistant dialogue.
Boundary signals live in those blocks, so phase slicing CANNOT post-filter
cleaned turns — the signals would already be gone. The implementation does
its own raw-JSONL pass per platform (`collectClaudeTurnsAndEvents` /
`collectCodexTurnsAndEvents` / `collectPiTurnsAndEvents`) that builds turns and
tracks shell-call events together. When adding a new boundary signal (e.g., for
OpenCode once the reader returns), follow this pattern: read raw events in a
single pass, do not consume the cleaned `DialogueTurn[]`.

### Compaction resets task.py event list, not just turns

Every per-platform collector must discard BOTH `turns` AND stale `events` when
compaction changes the effective dialogue — `collectClaudeTurnsAndEvents` on
Claude `isCompactSummary` events, `collectCodexTurnsAndEvents` on Codex
top-level `type === "compacted"` events, and `collectPiTurnsAndEvents` when the
latest active-path `compaction` drops entries before `firstKeptEntryId`.
Pre-compact `task.py` events anchor to
`turnIndex` values that index into the now-collapsed dialogue (replaced by
a single `[compact summary]` / `[compact]` synthetic turn). Carrying them
forward and pairing with post-compact `start` events would emit a window
referencing dialogue that no longer exists. Symptom (if forgotten): a
window with `startTurn` deep inside the post-compact region but labeled
with a stale slug from the pre-compact task. Fix: any new boundary
detector that mutates or rebuilds a `turns` accumulator on compaction must also
reset or rebuild its event accumulator from the same effective entries.

---

## Common pitfalls

When extending or refactoring `mem.ts`:

### Single-point `inRange` for session list filtering

**Wrong**: `if (!inRange(created, f)) continue;` — drops cross-day sessions.
**Correct**: `if (!inRangeOverlap(created, updated, f)) continue;` — see
`core/mem/adapters/codex.ts:codexListSessions` for the canonical pattern.

### Short-circuiting on filename timestamp

**Wrong**: skip Codex sessions where `tsFromName < f.since` without reading the
file. **Correct**: stat the file for `updated` and apply `inRangeOverlap`.
Filename ts is creation time; `--since` filtering must consider the active
window.

### Bypassing `stripInjectionTags`

Adding raw turn text to `searchInDialogue` skips injection-tag removal and
inflates hit counts on every Trellis-using session. Always run text through
`stripInjectionTags` _before_ the bootstrap check, and pass the
post-strip text into `isBootstrapTurn` along with `originalLength` so the size
threshold is computed against the raw input.

### Mishandling compaction

Claude and Codex compaction events reset the `turns` array; Pi compaction first
rebuilds the effective active branch from the latest `compaction` entry. A
linear Pi scan is wrong because old entries remain on disk. The synthetic
markers (`[compact summary]` / `[compact]`) are intentional — they make
compaction visible to readers and surface correctly in `extract` output.

### Forgetting to advance `from` past the matched token

In `searchInDialogue`, `from = idx + tok.length` is required to avoid an
infinite loop when a token has length zero. The `tokens.filter(Boolean)` guard
in `kw.toLowerCase().split(/\s+/).filter(Boolean)` ensures empty tokens are
dropped before this loop.

### `readJsonl` chunked streaming + `0x7b` fast-reject

`core/mem/internal/jsonl.ts:readJsonl` is the canonical JSONL reader for every
platform adapter. It is **not** `fs.readFileSync` + `data.split("\n")` — that pattern
allocated the entire file (tens of MB on long Claude sessions) as one string
and could not honor the `"stop"` short-circuit until the whole file was
already in memory.

Current implementation:

1. **Chunked sync streaming** via `fs.openSync` + `fs.readSync` with a
   256 KB buffer. Lines are reassembled across chunk boundaries via a
   `leftover` string; only one chunk's worth of bytes is resident at a time.
2. **Byte-prefix fast-reject** — before allocating an exception path, skip
   any line whose first byte is not `0x7b` (`{`). A JSONL event line begins
   with `{` virtually always; blank lines, occasional preambles, partial
   writes from a still-running CLI, etc. all get rejected without paying the
   `JSON.parse` + runtime-guard cost. The check is `line.charCodeAt(0)
!== OPEN_BRACE`.
3. **`"stop"` short-circuit** — the visitor closure can return `"stop"` to
   signal "I have what I need" (used by `readJsonlFirst` and
   `findInJsonl(maxLines<100)`). The reader closes the file and returns
   immediately, never reading further chunks.

Measured impact on a 36 MB Claude session (Trellis dogfood):

| Operation                           | Before (full read + split) | After (chunked + 0x7b skip) |
| ----------------------------------- | -------------------------- | --------------------------- |
| `tl mem list`                       | ~3.5s                      | ~0.67s                      |
| `tl mem extract --phase brainstorm` | ~5.8s                      | ~0.73s                      |

Rules for extending:

- Every platform adapter MUST go through `readJsonl` / `readJsonlFirst` /
  `findInJsonl`. Never reintroduce `fs.readFileSync` for a session file.
- Don't replace the `0x7b` fast-reject with a regex test or a `trim`
  comparison — the byte-level check is the cheapest filter.
- Keep the visitor closure pure-synchronous. Async closures would force the
  read loop into `for await`, which on `fs.openSync` handles is more
  expensive than a sync chunk read and breaks the `"stop"` short-circuit.

### Mock `node:os` BEFORE importing the adapters

Module-load constants in `core/mem/internal/paths.ts` (`CLAUDE_PROJECTS`,
`CODEX_SESSIONS`, …) capture `os.homedir()` once. Core tests must mock
`node:os` via `vi.hoisted` and `vi.mock("node:os", ...)` _before_
`await import("../../src/mem/adapters/...")`. See
`packages/core/test/mem/adapters.test.ts` for the canonical pattern.

### Adding a new platform without updating all dispatchers

A new platform requires updates in:

| Site                                             | What                         |
| ------------------------------------------------ | ---------------------------- |
| `MemSourceKind` (`core/mem/types.ts`)            | union member                 |
| `core/mem/sessions.ts:listAll`                   | call to new `*ListSessions`  |
| `core/mem/sessions.ts:extractDialogue`           | switch case                  |
| `core/mem/sessions.ts:searchSession`             | switch case                  |
| `core/mem/projects.ts` `by_platform` aggregation | new key with default `0`     |
| CLI `cmdHelp`                                    | mention in `--platform` line |

There is no exhaustiveness check — TypeScript's `switch` over `s.platform`
will warn for unhandled cases only if every dispatcher uses an explicit
discriminated union, which they do; trust the compiler here.

---

## Runtime validation (no zod)

`core/mem/` does **not** use `zod` — `@mindfoldhq/trellis-core` keeps a
zero-dependency surface (see `trellis-core-sdk.md`). External platform shapes
are modeled as loose TypeScript `interface`s with every field optional, and
the adapters guard fields at the point of use with plain `typeof` / `Array.isArray`
checks. The public domain types live in `core/mem/types.ts`:

| Type                                                                 | Domain                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `MemSourceKind` / `MemSourceFilter`                                  | `"claude" \| "codex" \| "opencode" \| "pi" \| "zcode"` (+ `"all"` for filters) |
| `MemSessionInfo`                                                     | unified session metadata across platforms                           |
| `DialogueRole` / `DialogueTurn`                                      | `"user" \| "assistant"` and a cleaned turn                          |
| `SearchExcerpt` / `SearchHit` / `MemSearchMatch` / `MemSearchResult` | search output                                                       |
| `MemFilter`                                                          | normalized cross-cutting filter (CLI flags translate into this)     |
| `MemContextTurn` / `MemContextResult`                                | dialogue-context window output                                      |
| `BrainstormWindow` / `MemDialogueGroup` / `MemExtractResult`         | phase-slicing output                                                |
| `MemProjectSummary`                                                  | project aggregation output                                          |
| `MemWarning`                                                         | structured warning returned to the CLI                              |

The loose per-platform event interfaces (`CodexEvent`, `CodexPayload`,
`ClaudeEvent`, …) stay local to their adapter file.

### Validation rules

- **Stay loose**: external event interfaces keep every field optional, so an
  upstream format addition never breaks parsing — unknown fields are simply
  ignored.
- **Guard at use**: check `typeof x === "string"` / `Array.isArray(x)` before
  consuming a field; never assume shape.
- **Keep schema-mismatch silent**: `readJsonl` skips lines that fail
  `JSON.parse`. Don't log per-line warnings — production session files contain
  legitimately diverse event shapes (tool_result, errors, telemetry) that we
  don't care about. Surface a structured `MemWarning` only for whole-operation
  conditions the caller should know about.

When extending `MemSessionInfo` (e.g. adding a `conversation_id` field for a
new platform), every `*ListSessions` function must populate the field (or
explicitly leave it undefined for platforms that don't have it). Forgetting to
populate it on platform A while platform B does will cause inconsistent output
across platforms.

---

## Output formatting

Formatting is CLI-only — these helpers live in `packages/cli/src/commands/mem.ts`,
never in core:

| Helper                          | Purpose                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `commands/mem.ts:shortDate`     | `iso.slice(0, 16).replace("T", " ")` — minute-precision local-looking timestamp |
| `commands/mem.ts:shortPath`     | replaces `$HOME` with `~`; `(no cwd)` when undefined                            |
| `commands/mem.ts:printSessions` | tabular human-readable dump shared by `cmdList`                                 |

Every subcommand supports `--json`. JSON output is structurally stable and is
the contract for AI agents consuming `mem` output. The CLI maps core's
camelCase result fields to the stable user-visible JSON names (`platform`,
`by_platform`, `parent_id`, `is_hit`, `total_turns`, …). If you change a field
name in JSON output (e.g. rename `hit_count` → `total_hits`), assume an AI
somewhere is parsing it and version the change.

---

## Test conventions

Tests follow the package boundary: pure retrieval logic is tested in core,
CLI-wrapper behavior is tested in the CLI.

Core tests (`packages/core/test/mem/`):

| File                | What it covers                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers.test.ts`   | filtering / cleaning / search primitives: `inRange`, `inRangeOverlap`, `sameProject`, `stripInjectionTags`, `isBootstrapTurn`, `chunkAround`, `searchInDialogue`, `relevanceScore` |
| `adapters.test.ts`  | per-platform `*ListSessions` / `*ExtractDialogue` / `*Search` against synthetic JSONL / JSON fixtures with mocked `os.homedir()`                                                   |
| `phase.test.ts`     | `parseTaskPyCommand(sAll)`, `commandFromCodexArguments`, `collectClaudeTurnsAndEvents`, `collectCodexTurnsAndEvents`, `collectPiTurnsAndEvents`, `buildBrainstormWindows`          |
| `cross-day.test.ts` | cross-day session must survive `--since` later than `created`; pins the `inRangeOverlap` contract                                                                                  |
| `api.test.ts`       | the public orchestration API (`listMemSessions`, `searchMemSessions`, `readMemContext`, `extractMemDialogue`, `listMemProjects`) returning structured results + warnings           |

CLI tests (`packages/cli/test/commands/`):

| File                      | What it covers                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `mem-helpers.test.ts`     | CLI-only helpers: `parseArgv`, CLI flag → `MemFilter` translation, `shortDate`, `shortPath`                           |
| `mem-integration.test.ts` | end-to-end `runMem` with stdout capture, `--json` output shape, exit behavior, the OpenCode-unavailable stderr notice |

### Fixture pattern (core adapter tests)

Mandatory for any new platform-parser test in `packages/core/test/mem/`:

1. **`vi.hoisted` block** mints a tmpdir for `fakeHome`. This runs _before_
   module resolution so `core/mem/internal/paths.ts`'s `os.homedir()`-derived
   constants capture the fake value.
2. **`vi.mock("node:os", ...)`** preserves the rest of the `os` API
   (`tmpdir`, `EOL`, etc.) — Vitest itself uses them. Spread `actual` and only
   override `homedir`.
3. **`await import("../../src/mem/adapters/...")`** _after_ the mock is set up.
4. **Per-test fixture seeding**: write minimal JSONL / JSON files into
   `<fakeHome>/.claude/projects/...` or `<fakeHome>/.codex/sessions/...`.
   OpenCode fixture seeding is not applicable in 0.6.0-beta.4 — the reader
   is a degraded no-op and tests assert "returns empty".
5. **`utimesSync`** is the canonical way to anchor `mtime` for `updated`
   assertions — `fs.statSync(file).mtime` is what the adapters read.
6. **`afterEach`** cleans up its own fixture files; tests must be isolated
   from each other within the suite.

### What new tests must cover

When adding a feature to `mem`:

- A new core filter / cleaning / search primitive → `core/test/mem/helpers.test.ts`.
- A new injection tag → `helpers.test.ts` `stripInjectionTags` test asserting
  the tag is removed AND a paragraph adjacent to the tag survives intact.
- A new platform → new `*ListSessions` / `*ExtractDialogue` block in
  `core/test/mem/adapters.test.ts` mirroring the existing per-platform groups.
- A bug fix touching filtering → `core/test/mem/cross-day.test.ts` style
  regression: a fixture with a known boundary case + the assertion that pins
  the fix.
- A new shell-arg / Codex-argument form picked up by the phase parsers →
  `core/test/mem/phase.test.ts` fixture with the exact literal the AI emitted
  (`SMOKE=$(...)`, heredoc-embedded prose, `argv[]` arrays, etc.) plus an
  assertion on the resulting window count and slug labels. The dogfood case
  studies live under `.trellis/tasks/05-08-mem-phase-slice/` and
  `.trellis/tasks/05-09-mem-phase-multi/`.
- A new CLI flag or output change → `mem-helpers.test.ts` for parsing +
  `mem-integration.test.ts` for end-to-end behavior.

### What tests must NOT do

- Don't assert on whole stdout block in human-readable mode — the format
  changes (line spacing, padding). Assert on `--json` output instead.
- Don't write fixtures outside `fakeHome`. The adapters' path constants only
  know about `HOME`-derived paths; tests using `os.tmpdir()` directly will not
  be exercised by the parsers.
- Don't import a core adapter without the `node:os` mock in place — the
  constants would lock onto the real `~/.claude` etc. and your test would
  either pass by accident or pollute the developer's actual session store.
- Don't move pure retrieval assertions into the CLI suite. If a CLI test would
  only exercise core logic, write it in `packages/core/test/mem/` instead.

---

## Public API surface

### Core — `@mindfoldhq/trellis-core/mem`

The reusable retrieval API, importable by the CLI, daemons, and future SDK
consumers. Exposed only on the `/mem` subpath — **not** the root barrel.

| Export                                                                                                                                                      | Use                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `listMemSessions`, `searchMemSessions`, `readMemContext`, `extractMemDialogue`, `listMemProjects`                                                           | five orchestration entry points; search/context/extract return `warnings`, list/projects accept `onWarning` |
| `MemSessionNotFoundError`                                                                                                                                   | typed error for `context` / `extract` against an unknown session id                        |
| `MemSessionInfo`, `MemFilter`, `DialogueTurn`, `SearchHit`, `MemSearchResult`, `MemContextResult`, `MemExtractResult`, `MemProjectSummary`, `MemWarning`, … | input/output types (see `core/mem/types.ts`)                                               |

Internal core modules (`filter.ts`, `search.ts`, `dialogue.ts`, `context.ts`,
`phase.ts`, the adapters, and everything under `internal/`) are exercised
directly by `packages/core/test/mem/**` but are **not** part of the published
subpath surface — the CLI must not deep-import them.

### CLI — `packages/cli/src/commands/mem.ts`

| Export                                                       | Use                                          |
| ------------------------------------------------------------ | -------------------------------------------- |
| `runMem(args)`                                               | Entry point — `tl mem ...` calls into this   |
| `parseArgv(argv)` and the CLI flag → `MemFilter` translation | argv parsing — used by `mem-helpers.test.ts` |
| `shortDate`, `shortPath`                                     | terminal formatting — tested directly        |

The CLI wrapper composes the core API, renders results, maps warnings to
stderr, emits the OpenCode-unavailable notice, and owns exit codes.

---

## Reference

- `packages/core/src/mem/` — retrieval engine (adapters, search, context, phase, projects)
- `packages/core/src/mem/index.ts` — `@mindfoldhq/trellis-core/mem` public surface
- `packages/cli/src/commands/mem.ts` — CLI wrapper (`runMem`, argv parsing, rendering)
- `packages/core/test/mem/` — core retrieval tests (helpers, adapters, phase, cross-day, api)
- `packages/cli/test/commands/mem-helpers.test.ts` — CLI argv / formatting tests
- `packages/cli/test/commands/mem-integration.test.ts` — end-to-end `runMem`
- `.trellis/tasks/05-14-mem-core-channel-reuse/` — the mem-core extraction task
- `.trellis/tasks/05-08-mem-since-cross-day-filter/` — historical context for
  the `inRangeOverlap` switch
- `.trellis/tasks/05-08-mem-phase-slice/` — historical context for the
  `--phase` flag and `[task.py create, start)` boundary signal
