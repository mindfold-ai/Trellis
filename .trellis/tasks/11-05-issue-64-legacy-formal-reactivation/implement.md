# Execution plan

## Ordered work
- [x] U1: Research existing formal/legacy contracts and targeted fixture/consumer paths; review PRD/design/plan.
- [x] U2: Add minimal shared Core formal predecessor/source consistency validation, projection extension and focused pure regressions.
- [x] U3: Wire CLI verification, receiptless successor checks and capability; preserve frozen operation semantics.
- [x] U4: Update only affected TS and shipped/dogfood Python retained-predecessor consumers; exercise actual successor relocation/archive.
- [x] U5: Add real-Git public integration tests using the untouched ten-field fixture. Cover pending/applied lost result/resume, receiptless active/archive discovery, mismatch errors and original bytes/resources. Retain targeted existing formal/schema2/manual-resume regressions.
- [x] U6: Update commands-maintain code-spec with signatures, finite family/generation/source contract, write set, error matrix, examples and tests.
- [x] U7: Run affected Core/CLI suites, lint, TS/Python typechecks, Python minimum-syntax/parity checks and matching build. Dispatch independent Trellis check; resolve findings.
- [x] U8: Commit, pack fixed CLI/Core pair, fresh install and actual built public-bin execution. Record source SHA, package digests, API, commands/results and scope limits. Make artifacts reproducibly accessible.
- [x] U9: Open PR against main, observe required CI, resolve findings, merge authorized change, record delivery and close Issue only on all accepted scope evidence. Archive only this Trellis task and leave clean state.

## Validation
Use the package Vitest maintenance/formal/migration/reopen suites selected by actual changes; pnpm lint; pnpm typecheck; pnpm --filter @mindfoldhq/trellis lint:py; pnpm build. Verify Python 3.9 compatibility for changed scripts and shipped/dogfood equality. Use actual packed matching public bin/SDK and target-native consumers on isolated repositories. Mock/DTO-only checks cannot satisfy AC1–AC3/AC5. Full unrelated install/platform/release matrix and Guru joint acceptance are excluded.

## Gates and rollback
No implementation until artifact review and task.py start. Core rules precede dependent CLI/Python work. Return to planning for material scope/contract changes. Independent check precedes commit/PR. Stop mutations on concrete mismatches; do not widen operation writes. Final completion requires actual fixed candidate and public execution evidence, not merely passing unit tests or closing the Issue.

## Stable implementation evidence

Core targeted suites: 50/50. Public formal real-Git suite: 42/42, parameterized
across schema1 and untouched ten-field legacy predecessors. Existing CLI/native
regressions: 68/68 across five files. A final exact-scope newline parity correction
has a focused Core regression. Shared formal classification also replaced a
private preparation-time schema1 literal discovered by actual legacy execution.

Main gates passed: pnpm lint; pnpm typecheck; pnpm --filter @mindfoldhq/trellis
lint:py (0 errors, 48 existing warnings); changed Python scripts compile under
/usr/bin/python3 3.9.6; shipped/dogfood task_utils.py byte parity; git diff --check.
Independent check and packed candidate execution remain separate pending gates.

## Installed candidate and review

Independent `trellis-check` reports no remaining actionable defects; it corrected
one stale documentation sentence and independently compared 16 Core/Python cases.
Actual packed pair fresh install and 40-command probe passed under Python 3.9.6,
including real TS relocation/native archive and pending->same-operation applied.
See evidence/acceptance.md, independent-check.md and installed-probe-summary.json.
The final source commit/digests, artifact access and PR/CI outcome follow after commit.

Fixed source: 619133c62d1487c5fbecbf9e00cea9e3f5ea52a6. PR #65 targets main.
Candidate release issue-64-candidate-619133c62d14 contains both matching .6
packages, exact SHA256/source/build record, install instructions and raw probe.
Full implementation pre-commit passed Core529/1skip and CLI2434.

PR #65 merged to main as ca0e8b931d19ccb87802d6866abd2113a6f707c0 after all five
remote checks passed (Actions 42015654747). Issue #64 is CLOSED. Published-download
SHA256 verification, fresh pair install and second actual 40-command probe passed
with identical candidate fingerprints. Only this task's records remain to archive.
Metadata commits skip repeated Husky runs after the unchanged implementation's
successful full pre-commit + remote CI; local doc-only retries encountered unrelated
pre-existing timing limits under machine load, with no product edits.
