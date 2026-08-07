# Install-safe OpenCode mem reader implementation plan

## Research and impact

1. Run GitNexus impact analysis on the OpenCode adapter exports, mem session
   dispatcher, warning flow, path constants, and any shared SQLite-reader
   symbols proposed for modification; stop for HIGH or CRITICAL risk review.
2. Confirm current OpenCode data-root rules and table/column/JSON shapes from
   authoritative OpenCode source plus sanitized local schema evidence.
3. Compare those features with `sqlite-readonly.ts` and record any unsupported
   page, WAL, value, or schema behavior before editing the shared parser.

## Implementation

4. Add cross-platform OpenCode database path resolution and bounded schema
   validators.
5. Implement session listing and structured warnings using the ZCode adapter's
   read-only patterns.
6. Implement one-session dialogue extraction, cleaning, ordering, and child
   linkage.
7. Add a command-scoped prepared store for search only if benchmarks show the
   one-session path would otherwise rescan unacceptably.
8. Thread warnings through the core mem API and CLI, then retire the
   unconditional unavailable warning.
9. Update the mem spec, help, package documentation, and release notes.

## Validation

- Build synthetic main/WAL/SHM fixtures covering list, extract, search,
  context, parent-child merging, compaction/hostile parts, schema alternatives,
  corruption, and concurrent snapshot changes.
- Reuse existing SQLite fixture helpers and ZCode safety tests where possible;
  do not require `sqlite3` or a native addon during tests.
- Run focused core mem and CLI mem suites, package-export tests, install tests,
  `pnpm lint`, `pnpm typecheck`, and the repository-required test suite.
- Dogfood against a local OpenCode database read-only and report counts/timing
  without persisting transcript content.
- Run GitNexus `detect_changes()` before any commit.

## Risk and rollback

- Highest risk: schema drift producing incorrect dialogue rather than a visible
  failure. Validate semantic columns and fail closed on uncertainty.
- Snapshot risk: reading active WAL state inconsistently. Reuse checksum and
  change-detection guards; never fall back to an unchecked partial snapshot.
- Performance risk: whole-database scans. Keep listing and single-session
  extraction bounded and benchmark search before adding caching complexity.
- Do not start implementation until the user reviews these artifacts.
