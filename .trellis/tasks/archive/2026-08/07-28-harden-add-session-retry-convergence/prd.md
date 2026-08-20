# Harden add_session retry convergence and commit evidence

## Goal

Make direct and wrapped `add_session.py` recording produce accurate,
placeholder-free commit evidence and converge safely after an interrupted or
failed append, index update, or auto-commit without duplicating a session.

## Background

- GitHub issue #394 and archived task `07-22-script-qol-batch` added structured
  `--change`, `--test`, and `--next-step` inputs and removed the old
  `(Add details)` and `(Add test results)` sections.
- The authoritative template still renders `(see git log)` for every supplied
  commit in
  `packages/cli/src/templates/trellis/scripts/add_session.py:281-286`.
- The current flow appends the journal, updates `index.md`, and only then calls
  the fallible workspace auto-commit at lines 575-609. The auto-commit helper
  warns on failure but does not give the caller a durable retry checkpoint.
- Downstream command-pack wrappers compensate by resolving commit subjects and
  reusing a matching pending journal entry. Direct Trellis calls and older
  wrappers still expose the producer gap.

## Requirements

- R1: Eliminate `(see git log)` from newly generated records. Resolve each
  bounded commit OID to its local subject before the first mutation, or accept
  an explicit validated subject mapping. If accurate evidence cannot be
  established, stop before writing rather than fabricating a message.
- R2: Define a stable recording identity from normalized semantic inputs and
  persist enough bounded evidence to recognize the same pending request across
  process retries. Do not deduplicate a separately completed, committed
  recording merely because its prose is identical.
- R3: Treat journal append, index update, and optional auto-commit as one
  resumable state machine. A retry must reuse or repair the matching uncommitted
  record and then continue from the last verified checkpoint.
- R4: If the journal entry exists but the index update did not complete, repair
  the exact index row without appending another entry. If both exist but
  auto-commit failed, retry only the scoped commit step.
- R5: Return nonzero with an actionable checkpoint when a requested
  auto-commit fails. Preserve the exact pending record for retry; never report
  the overall operation as fully successful solely because the append worked.
- R6: Make journal and index state writes crash-safe according to
  `.trellis/spec/cli/backend/filesystem-safety.md`. Partial or malformed
  pending evidence must fail safely and must not be guessed into completion.
- R7: Preserve `session_auto_commit: false`, planning-session commit `-`,
  journal rotation, branch/package fields, scoped staging, and unrelated-work
  protections.
- R8: Keep the authoritative packaged template and dogfood runtime copy
  synchronized and use only Python 3.9-compatible standard-library code.

## Dependencies and coordination

- Build on archived `07-22-script-qol-batch` and closed GitHub issue #394; do
  not reopen their completed structured-section scope.
- Coordinate evidence wording with active
  `07-27-track-journal-evidence-contradictions`, but keep producer transaction
  and retry behavior owned here.
- `07-23-align-task-validation-preflight` owns `_example` task-context rows and
  is not a dependency for this recorder fix.
- Downstream wrappers may retain compatibility behavior until consumers adopt
  a Trellis release containing this contract.

## Accepted compatibility decision

Approved 2026-07-28: a non-planning recording with an unresolved commit OID
fails before any journal or index mutation. The only compatibility escape hatch
is an explicit, validated one-to-one OID-to-subject mapping. The producer must
never substitute generic or inferred placeholder prose.

## Acceptance Criteria

- [ ] New committed-session records contain accurate local commit subjects and
      none of `(Add details)`, `(Add test results)`, or `(see git log)`.
- [ ] A commit that cannot be validated or resolved fails before journal or
      index mutation with an actionable diagnostic, unless the caller supplied
      a valid explicit subject mapping for that exact OID.
- [ ] Failure after journal write but before index completion is repaired on
      retry without a second session entry.
- [ ] Failure after journal and index completion but before auto-commit is
      retried from the commit checkpoint without duplicate content.
- [ ] A successfully committed prior record does not suppress a legitimately
      new session with otherwise identical prose.
- [ ] Concurrent, malformed, replaced-path, interrupted-write, and journal
      rotation fixtures fail safely without corrupting or overwriting a record.
- [ ] Auto-commit-disabled and planning-session behavior remains compatible.
- [ ] Dogfood/template parity, focused integration tests, lint, typecheck, and
      the relevant CLI test suite pass.

## Out of Scope

- Changing task-context JSONL scaffolding or validation.
- Recording CI or review-provider evidence not supplied to this command.
- Broad Git transaction management outside Trellis-owned workspace/current-task
  paths.
- Removing downstream compatibility wrappers before fleet adoption proves the
  upstream behavior.

## Rescope (2026-08-08, sd-ai-command-pack cross-repo review)

Added requirement (relocated from the pack backlog): session NUMBERING must
be collision-proof, not just file-merge-safe. Upstream a5374864 mitigated the
file collision (journal-*.md merge=union + worktree warning) but
`add_session.py` still derives the next session number from the working tree
alone, so two branches recording before merging claim the same number
(observed twice on 2026-08-06 in sd-ai-command-pack). R7 as written PRESERVES
the colliding behavior and is amended by this note: numbering must converge
under concurrent branches (e.g., derive from union of local + default-branch
journals, or use a collision-detecting retry).
