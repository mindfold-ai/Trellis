# add_session retry convergence design

## Boundary

Keep `add_session.py` as the public entry point and treat one normalized
recording request as a small resumable state machine. The producer owns
accurate rendering, journal/index consistency, and the status of its optional
auto-commit; it does not own downstream PR lifecycle work.

## Recommended record identity

Compute a bounded fingerprint from developer, date, title, summary, package,
branch, validated commit OIDs and subjects, structured changes, tests, and next
steps. Persist the fingerprint as machine-readable metadata associated with the
journal entry, using a format that does not alter rendered human evidence.

The fingerprint is a retry key only while the matching record is pending in
the worktree. Once the exact record is committed, an identical later request
is treated as a new session unless the caller supplies an explicit
idempotency key. This avoids collapsing legitimate repeated sessions.

## State machine

1. **Preflight**: normalize inputs, validate commit tokens, resolve accurate
   subjects, locate developer state, and compute the record identity. No writes
   occur before preflight succeeds.
2. **Absent**: atomically append the complete marked entry and advance to
   `journal-recorded`.
3. **Journal recorded**: atomically create or repair the exact index row and
   advance to `index-recorded`.
4. **Index recorded**: when auto-commit is enabled, stage only the existing
   Trellis-owned scope and attempt commit.
5. **Committed**: verify the exact journal/index changes are contained in the
   resulting commit and return success.
6. **Blocked**: return nonzero with the last verified checkpoint. Retain valid
   pending state so the same request can resume.

A retry first inspects the current journal tail, index row, Git worktree, and
record marker. It repairs only a unique exact match. Missing, conflicting,
partially written, already-committed, or multiply matching state is never
silently adopted.

## Commit evidence

Accept only bounded commit OIDs before invoking Git as argv. Resolve subjects
from the local object database without shell interpolation. The accepted
compatibility contract is fail-before-write when an OID cannot be resolved.
Callers that legitimately record an unavailable object may provide an explicit
one-to-one OID mapping; validate the mapping before mutation and render the
supplied subject after Markdown-safe escaping. Never substitute generic prose
such as `see git log` or `not recorded`.

## Write safety and concurrency

Use temp-in-same-directory plus replace for index and any full-journal update.
If append semantics are retained, add an exact record marker and a lock or
compare-and-retry guard so two writers cannot claim the same session number.
Do not hold a lock while executing Git. Revalidate the pending record before
staging and again before reporting success.

## Compatibility and rollback

- Existing structured flags and `--stdin` behavior remain supported.
- `session_auto_commit: false` stops after verified journal/index state.
- Planning commit `-` renders the existing no-commit statement.
- A new optional explicit idempotency key must be bounded and argv-safe.
- Rollback may disable retry adoption while preserving valid journal data; it
  must never delete an ambiguous pending entry.
