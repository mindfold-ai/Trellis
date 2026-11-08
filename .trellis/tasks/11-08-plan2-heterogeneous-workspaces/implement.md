# Implementation and verification

1. [x] Inspect and preserve original candidate and history-only commit; bind original Task.
2. [x] Reconcile with merged PR #66 without weakening peer equality or binding.
3. [x] Verify historical Guru field evidence; correct nullable package paths and remove unrelated test formatting churn.
4. [x] Implement bounded artifact digest snapshots, incremental file hashing and exact root-record paths.
5. [x] Verify real 925 MiB preservation, digest/mode drift and source-shape rejection; verify mixed-version execute/replay/caller rollback.
6. [x] Finish honest completed predecessor/current invocation/session authority cases and focused coverage.
7. [ ] Run current Core/CLI lint, typecheck/build, focused/full tests and required Python validation. Record failures honestly.
8. [x] Independent full-range review against current main; repair findings and rerun affected checks.
9. [ ] Commit original-owner candidate, publish PR, verify CI and merge authorized main delivery.
10. [ ] Clean build and pack matching CLI/Core from actual merge SHA; report merge parents/tree, package/build/CI identity and source contract.

## Evidence so far

- Original candidate was unverified; backed up to `/tmp/trellis-plan2-original-candidate.patch` and `/tmp/trellis-plan2-original-task-20261108` and retained in a named Git stash.
- Core focused migration/maintenance: 16/16 pass after seven-field/null correction.
- Artifact/version focused: 16/16 pass, including actual 925 MiB artifact (about 2.6 s), execute/replay and exact rollback.
- CLI typecheck passes at that intermediate tree.
- Baseline integration hook: 108/109 CLI files passed; 4 Python regression tests timed out under local host load. No timeout/config bypass was applied; current final checks remain required.

- Independent complete-range review passed after correcting one P2 session-carrier authority issue. Current source/session focus 27/27 + Git-free2/2 pass. Earlier complete candidate suite: Core531pass/1skip; CLI2477pass/1 stale expected-diagnostic failure, now corrected. Final hook rerun remains required.
