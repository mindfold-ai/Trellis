# Restore install-safe OpenCode mem reader

## Goal

Restore complete, read-only OpenCode 1.2+ session discovery and recall in
`trellis mem` without reintroducing a mandatory native dependency or any
install-time toolchain/network fragility.

## Background

- OpenCode 1.2 moved session storage to SQLite. The first Trellis reader used
  `better-sqlite3`, whose prebuilt download and `node-gyp` fallback broke
  installations on Windows and restricted networks, so beta.4 reverted it.
- The current OpenCode adapter is a no-op and the CLI emits a one-shot
  unavailable warning. The recent cross-repository workflow investigation
  therefore could not include OpenCode sessions.
- Trellis now ships a zero-dependency, read-only, WAL-aware SQLite parser for
  the ZCode adapter in `packages/core/src/mem/internal/sqlite-readonly.ts`.
  This is the preferred foundation; adding WASM, a native module, or a required
  system `sqlite3` command is unnecessary unless repository evidence proves
  the existing reader cannot support OpenCode's schema.
- No active Trellis task or dedicated GitHub issue currently owns restoration;
  platform-support epic #349 tracks platform setup rather than memory recall.

## Requirements

- R1: Reuse the existing zero-dependency SQLite reader and snapshot-safety
  contract. Do not add a mandatory native, WASM, external binary, network, or
  install-time build dependency.
- R2: Resolve OpenCode's supported data-directory and `opencode.db` location on
  macOS, Linux, and Windows, including documented overrides. Missing storage is
  a normal empty result, not a crash.
- R3: Validate the required `session`, `message`, and `part` tables and bounded
  column alternatives before scanning. Unknown or incompatible schemas must
  degrade with one structured warning while other platforms continue.
- R4: Implement list, search, context, and extract with the shared
  `MemSessionInfo`, `DialogueTurn`, filtering, cleaning, token-budget, and time
  semantics. Preserve `parent_id` so `--include-children` merges sub-agent
  sessions correctly.
- R5: Capture a consistent read-only main/WAL/SHM snapshot and never mutate,
  migrate, checkpoint, lock, or copy over OpenCode's live database.
- R6: Bound memory and repeated scans. Search may prepare one command-scoped
  store; single-session extraction must retain only the requested session's
  rows where feasible and release prepared state in `finally`.
- R7: Replace the unconditional CLI unavailable notice with structured
  missing/unreadable/schema/snapshot warnings. Emit at most one warning per
  condition per command and keep core free of direct terminal output.
- R8: Preserve Claude, Codex, Pi, and ZCode behavior and the public
  `@mindfoldhq/trellis-core/mem` package boundary.
- R9: Update `commands-mem.md`, help text, fixtures, and release notes so they no
  longer claim OpenCode recall is unavailable once the reader ships.

## Dependencies and coordination

- Build on `packages/core/src/mem/internal/sqlite-readonly.ts` and the ZCode
  adapter's warning, prepared-store, and WAL-snapshot patterns.
- Use archived `05-08-mem-opencode-sqlite` for schema and behavior history, but
  reject its `better-sqlite3` dependency decision.
- Preserve the install-reliability lesson from archived
  `05-09-revert-opencode-sqlite-emergency` and the native-dependency policy.
- Coordinate with the public mem contract in
  `.trellis/spec/cli/backend/commands-mem.md`; this task does not expand general
  platform installation tracked by issue #349.

## Acceptance Criteria

- [ ] `trellis mem list --platform opencode` returns synthetic and dogfood
      OpenCode 1.2+ sessions with correct ID, cwd, title, timestamps, database
      path, and parent relationship.
- [ ] Search, context, and extract return cleaned dialogue for only the selected
      scope and merge child sessions when requested.
- [ ] Active WAL-only rows are visible from a validated consistent snapshot,
      and concurrent-write instability produces a bounded retry warning rather
      than inconsistent dialogue.
- [ ] Missing database, corrupt database, unsupported page/schema feature,
      missing columns, hostile JSON, and replaced-path fixtures fail safely and
      leave other platforms usable.
- [ ] Installation and execution require no compiler, native addon download,
      system SQLite executable, or network access.
- [ ] Existing mem API, Claude, Codex, Pi, and ZCode tests remain green.
- [ ] Core/CLI warnings, docs, help, package exports, lint, typecheck, and the
      relevant test suites pass.

## Out of Scope

- Writing to, migrating, repairing, or indexing OpenCode's database.
- Restoring pre-1.2 legacy JSON storage unless current usage evidence justifies
  a separate compatibility task.
- Adding full-text search indexes or a persistent Trellis cache.
- Changing OpenCode's own session schema or runtime behavior.
- Expanding phase slicing beyond the existing explicit fallback unless task
  boundary evidence is already available in stored messages.
