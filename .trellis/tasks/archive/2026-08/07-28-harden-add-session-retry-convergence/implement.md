# add_session retry convergence implementation plan

## Implementation

1. Run GitNexus impact analysis for every runtime symbol that will change,
   including `generate_session_content`, `add_session`, index mutation, and
   `_auto_commit_workspace`; stop for HIGH or CRITICAL risk review.
2. Capture the current direct-call and wrapper reproducer for commit-subject
   placeholders, index failure after append, and auto-commit failure followed
   by retry.
3. Add input normalization, bounded commit validation, local subject
   resolution, and a stable record fingerprint before any mutation.
4. Implement the pending-record classifier and the absent, journal-recorded,
   index-recorded, committed, and blocked transitions from `design.md`.
5. Make journal/index writes crash-safe and preserve exact journal rotation and
   index formatting.
6. Return a real failure status and checkpoint when auto-commit fails; prove a
   subsequent identical request resumes instead of appending.
7. Update both the authoritative packaged template and dogfood runtime copy,
   plus CLI help and script-convention documentation where the public contract
   changes.
8. Coordinate or link the final evidence wording from
   `07-27-track-journal-evidence-contradictions` without absorbing that task.

## Validation

- Extend `packages/cli/test/scripts/add-session.integration.test.ts` with a
  numbered failure/retry matrix matching the PRD acceptance criteria.
- Cover subject escaping, unresolved OIDs, no-commit planning, no-auto-commit,
  rotation, append/index/commit fault injection, repeated completed records,
  concurrency, and malformed pending markers.
- Verify only Trellis-owned workspace/current-task paths are staged.
- Verify dogfood/template byte parity and no generated placeholders.
- Run focused integration tests, `pnpm lint`, `pnpm typecheck`, and the
  repository-required CLI test suite.
- Run GitNexus `detect_changes()` before any commit.

## Risk and rollback

- Highest risk: adopting the wrong prior journal entry. Require a unique exact
  marker plus uncommitted-state proof before reuse.
- Write-safety risk: a crash while replacing a large journal. Preserve the
  original on failure and test temp-file cleanup.
- Compatibility risk: rejecting an unresolved commit that legacy code
  accepted. Implement the accepted accurate-evidence requirement and explicit
  mapping fallback consistently across help, tests, and templates.
- Do not start implementation until the user reviews these artifacts.
