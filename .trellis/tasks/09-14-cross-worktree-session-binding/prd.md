# Fix active-task session binding across Git worktrees

## Goal

Preserve session-scoped active-task resolution and lifecycle operations across registered Git worktrees, with legacy compatibility and fail-closed validation.

## Requirements

- R1: One session can resolve its task from any registered worktree in the same Git common repository. Caller and task workspace identities remain distinguishable.
- R2: start/current/finish/archive/rename, get_context, hooks and subagent context use the intended task workspace, including metadata, relative context files and lifecycle hook cwd.
- R3: Different sessions and different repositories remain isolated. Identical relative task names in different worktrees are distinct tasks.
- R4: Corrupt, ambiguous, stale or unverifiable bindings produce explicit errors, not normal no-task results. Membership comes from live Git facts, not stored declarations.
- R5: Prefer new storage; when absent, accept only a unique valid legacy match among live registered worktrees. Non-Git projects retain local behavior.
- R6: Finish/archive cannot resurrect legacy ownership; rename repoints only bindings belonging to the exact task identity.
- R7: Preserve retired developer/workspace/journal/current-task boundaries and historical bytes. Do not introduce a repository-global current task.
- R8: Deliver an ordinary upstream fix PR awaiting separate merge authorization. Keep both package versions unchanged; prohibit tags, Releases, npm publishing, dist-tag changes, release manifests/changelogs and guru-trellis modifications.

## Acceptance Criteria

Use real temporary Git repositories and git worktree, not mocked membership helpers.

| ID | Observable acceptance | Requirements |
| --- | --- | --- |
| A1 | Establish session identity in primary before worktree creation; start task in linked checkout; resolver, current, get_context and full SessionStart/workflow-state entrypoints from primary resolve that linked task | R1, R2 |
| A2 | Finish/archive from another checkout clear appropriate bindings; rename repoints; task metadata, context files and hooks use task workspace | R2, R6 |
| A3 | Two sessions bound to separate worktrees remain isolated, including identical relative task names | R3 |
| A4 | Two independent repositories using the same context key remain isolated | R3 |
| A5 | Unique legacy match succeeds; multiple/invalid matches fail; new storage takes precedence; repeated reads and clears do not resurrect old ownership | R4, R5, R6 |
| A6 | Unregistered worktree, missing/unreadable task.json, malformed binding, common-dir mismatch and invalid task path yield explicit stale/error | R4 |
| A7 | Non-Git local behavior and historical-data protections remain intact | R5, R7 |
| A8 | Python and independent platform consumers pass runtime tests; template install/update smoke succeeds | R2, R7 |
| A9 | Full affected-package tests, type checks, lint, build and diff checks have recorded outcomes and unavailable boundaries | R1-R8 |
| A10 | Record PR head SHA, unchanged versions, publication boundaries and exact downstream source/build identity; report merged SHA only after independent merge authorization | R8 |

## Confirmed Background

Live main and local HEAD were f08ed655d800e6580e5fe950308ac1edfe74b10e on 2026-09-14. Both package versions were 0.6.17. A real linked worktree reproduced identical context keys but different task resolution; see research/reproduction.md for exact evidence and limitations.

## Out of Scope

No malicious-tampering or concurrency attack model, locking redesign, release work, broad platform refactoring or identity reintroduction. Reproduction fixtures are not formal delivery artifacts and must not be accidentally committed. There are no unresolved product decisions blocking planning review.
