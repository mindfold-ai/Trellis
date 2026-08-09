# Install-safe OpenCode mem reader design

## Architecture

Implement OpenCode as a normal `@mindfoldhq/trellis-core/mem` adapter over the
existing zero-dependency SQLite snapshot reader. Keep filesystem/schema/dialogue
logic in core; keep argument parsing and terminal warning rendering in the CLI.

Do not introduce another SQLite backend unless a focused compatibility probe
shows an OpenCode database feature the existing reader cannot support. In that
case, extend the shared read-only parser with regression fixtures rather than
adding an install-time dependency.

## Data flow

1. Resolve candidate OpenCode data roots using documented platform and override
   semantics, then select a unique existing `opencode.db`.
2. Snapshot the main database plus active WAL/SHM using
   `openSqliteReadOnly`'s stability checks.
3. Validate required tables and accepted column variants before retaining
   rows.
4. Map `session` rows to `MemSessionInfo`, including `parent_id`.
5. For a requested session, select its `message` rows and associated `part`
   rows, parse bounded JSON payloads, order deterministically, and convert
   user/assistant text parts to cleaned `DialogueTurn` values.
6. Reuse shared filters, injection stripping, search, context windows, child
   expansion, and token budgeting.
7. Return structured warnings to the CLI; never print from core.

## Schema boundary

The initial adapter should expect the semantic fields established by current
OpenCode 1.2+ stores:

- `session`: identifier, title, directory/cwd, created and updated time, and
  optional parent session.
- `message`: identifier, session identifier, created time, and role-bearing
  data.
- `part`: message identifier, created time, and typed text/tool data.

Column names and JSON shapes must be probed defensively from synthetic fixtures
and current upstream OpenCode evidence. Missing required semantics produce an
unsupported-schema warning; they are not guessed by positional column order.

## Snapshot, performance, and warnings

- Reuse the checksum-validated WAL snapshot path already exercised by ZCode.
- Listing scans only session metadata.
- Extract/context retain one session's messages and parts.
- Cross-session search may prepare one whole-database store for the command and
  must release it in `finally`.
- Warning codes distinguish unreadable database, unstable snapshot, and
  unsupported schema. Missing storage produces no warning.
- Paths and external JSON in diagnostics are bounded and escaped.

## Compatibility and rollout

- Preserve existing public function names where possible; add optional warning
  arrays consistently with ZCode rather than introducing CLI-only side effects.
- Remove `warnOpencodeUnavailable()` only when all OpenCode call paths expose
  structured degradation.
- Keep the existing explicit phase-slicing fallback until stored task-boundary
  behavior is separately proven.
- Rollback restores the silent core no-op and one-shot CLI warning without any
  data migration because the adapter is read-only.
