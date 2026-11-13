# Public reactivation of formal predecessor archives

## Goal

Let a workflow owner reactivate one formally completed schema1 archive as the next Task v2 generation through public maintenance. Preserve original history and let target-native consumers continue from the new identity.

This Task supplies a prerequisite for castbox/guru-trellis#635. Its source relation is `reference_only`; it does not own the whole Guru requirement or its Issue closure.

## Background

The inspected baseline is castbox/Trellis `main@6202fc2da435a4d1f0e2e67eb01f2e61ec50ca51`. Active conversion rejects archives. Manual archive resume preserves generation. Ordinary Task v2 reopen requires a current matching Completion before incrementing generation. A formally completed schema1 archive has no current-model Completion/Closure arrays. None of these paths directly provides the required conversion. Exact anchors and a genuine predecessor sample are in `research/current-boundaries.md`.

The workflow owner establishes formal completion and checks for pending old transactions. A completed status is a necessary format/state condition, not semantic proof. Core/CLI must not interpret Guru Finish summaries, GitHub disposition, semantic approval or user authorization.

## Requirements

| ID | Required behavior |
| --- | --- |
| R1 | Accept one explicitly selected canonical schema1 completed predecessor archive with exact TaskKey, archive commit, selected target and original active locator. Verify archive facts and target reachability. Preserve TaskId, source, metadata and task-tree relationships. |
| R2 | Create one active Task v2 at generation `g+1` with actual accepted-scope authority and retained raw source/artifacts. Preserve genuine historical Delivery outcomes at their original generation. Do not manufacture old Completion/Closure, inherit gates, or create an empty current Delivery. |
| R3 | Expose separate public Core validation, CLI SDK inspect/prepare and public CLI entry points. Inspect/prepare/preview are target-write-free. Reuse the existing fixed-operation maintenance executor and recovery model. |
| R4 | Repeated apply/recover/resume return the same operation and original new key. Read-only successor inspection works without a private receipt, including later legitimate generations. Normal target advancement is acceptable while the frozen facts remain reachable. |
| R5 | Preserve the original archive and old-generation sessions, bindings and resource responsibility. Conversion neither establishes nor retires environment ownership. Permit rollback before later work; preserve new-generation Task/Delivery/session/binding work and report conflict afterward. |
| R6 | Preserve active conversion, manual resume, historical closeout, tools maintenance and ordinary Task v2 reopen. Keep API-1.0 capability additive and Core/CLI builds matched. Reuse existing authority/origin resolution. |
| R7 | Prove actual matching packed CLI/Core creates a Task usable by target-native identity, continuation and next public scope consumer. Synchronize template/dogfood copies for any necessary native changes. |

## Acceptance Criteria

| ID | Observable outcome | Requirements |
| --- | --- | --- |
| AC1 | Pure Core tests accept the supported projection at exactly `g+1`, preserve identity/history, and reject ordinary mismatches and invalid current-state imports. Existing preserve-generation tests remain valid. | R1, R2, R6 |
| AC2 | Real-Git public CLI tests prove zero target writes during inspect/prepare/preview, then bounded creation of the new tree/provenance. Archive bytes/modes/directories remain intact. Missing old local resources do not block; present old resources remain unchanged. | R1–R3, R5 |
| AC3 | Fixed-operation retry, lost-output recovery and ordinary partial application retain one operation and one increment. Receiptless inspection identifies the successor, including later native reopen, without changing the original operation result. | R4 |
| AC4 | Normal target advancement succeeds when frozen facts remain reachable. Missing reachability, original active presence, source changes or occupied destination return specific diagnostics and preserve unrelated work. | R1, R4 |
| AC5 | Rollback before subsequent work removes only the operation's new tree. Real native Task/Delivery/session/binding work causes `later_work_conflict`, preserving new work and old resources. | R5 |
| AC6 | Targeted existing maintenance/migration/reopen suites pass. Public capability adds the new kind without removing old ones. Public exports and matching packed dependency resolution work. | R3, R6 |
| AC7 | One representative packed-pair installation uses public prepare/apply, native `task.py start/current`, continuation and real `accept_scope` with a real supplement file. New key/history remain correct; no dummy Delivery is introduced. | R7 |

## Out of scope

- Guru private Finish semantics, Issue disposition, cleanup and whole #635 V1–V8 acceptance.
- Alternate Python converters, weakened ordinary reopen, bulk migration, a global recovery platform, Git resource creation by maintenance or automatic next-owner execution.
- Malicious actors, forged artifacts, attack tests, locks, leases, stress, TOCTOU or additional crash/atomicity protocols. Existing ordinary partial recovery remains required.
- Full release/platform matrix, version bump, npm publication, tag or Release. Coordinate at most one representative installation sample with Guru.

## Execution boundary

Behavior and ownership decisions are resolved. Native Task status records the current execution phase. Actual test, package and native-consumer results establish acceptance; this requirements document does not itself certify implementation or validation. Commit, publication and downstream source adoption remain separate boundaries.
