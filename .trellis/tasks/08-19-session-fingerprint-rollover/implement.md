# Implementation plan

All edits land in `packages/cli/src/templates/trellis/scripts/add_session.py`,
then get copied byte-identical to `.trellis/scripts/add_session.py`. The parity
guard in `test/regression.test.ts` fails if the copy is skipped.

## Steps

1. **Split the payload.** Extract `_fingerprint_payload(...)` from the body of
   `compute_record_fingerprint`, without the `date` key. `compute_record_fingerprint`
   drops its `today` parameter and hashes the payload as-is; `compute_legacy_fingerprint`
   takes a `date` and hashes the payload with `"date"` inserted.
   → verify: `python3 -c` recomputes a known v1 hash from the old code path and
     matches `compute_legacy_fingerprint` exactly.

2. **Version the marker.** `render_marker` emits `v=2 fp=...`; add
   `render_legacy_marker` emitting the bare `fp=...` form. Add a compiled regex
   for parsing a marker line into (version, fp).
   → verify: round-trip both forms through the parser.

3. **Add `resolve_effective_marker`.** v2 hit wins; otherwise scan journal files
   for v1 marker lines, read each entry's own `**Date**:` line, recompute, compare.
   Unique match returns that v1 marker; multiple matches return an error string
   in the shape `classify_record` already uses.
   → verify: covered by step 6's test.

4. **Wire `cmd_add_session`.** Drop `today` from the fingerprint call, call the
   resolver, surface its error the same way `classify_error` is surfaced, and
   pass the effective marker into `classify_record` and `generate_session_content`.
   → verify: `today` no longer reaches any fingerprint call — `grep -n
     "fingerprint(" add_session.py` shows no `today` argument.

5. **Copy to `.trellis/scripts/`.**
   → verify: `diff -q` between the two paths is silent.

6. **Tests** in `test/scripts/add-session.integration.test.ts`, alongside the
   existing retry suite:
   - interrupt after journal+index, rewrite the entry's marker and `**Date**:`
     to a prior day under the v1 scheme, retry → resumes, marker count stays 1.
   - a same-day v1 marker still resolves (the migration case without a rollover).
   - two distinct titles on one day → two entries, two markers.
   → verify: `pnpm vitest run test/scripts/add-session.integration.test.ts`.

## Validation

    pnpm vitest run test/scripts/add-session.integration.test.ts   # new + existing retry suite
    pnpm vitest run test/regression.test.ts                        # parity guard
    pnpm vitest run                                                # baseline 1829/1829, plus new

## Rollback

Single commit; `git revert` it. No migration to unwind — v1 markers are read,
never rewritten (design.md §"Compatibility and rollback").
