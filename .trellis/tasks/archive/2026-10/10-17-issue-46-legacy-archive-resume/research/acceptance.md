# Issue #46 acceptance

## Candidate identity

Public capability source commit: `a06b1f764f003001b35fe125177203211fb2152c`.
Baseline: `fda3e12181b72d7aa33cdad54066d33d3386b621`.
Both packages retain version `0.7.0-castbox.4`; no version publication occurred.
This candidate is identified by source/build/API, not that already-used label.

`package-identity.json` records final tarball SHA256, exact installed source-build
manifest digests and byte equivalence after rebuilding the committed source:
CLI 736 dist files; Core 272. CLI tarball pins Core exactly to the same version.
`packed-install-verification.json` is the completed real public-bin/installed-SDK
and target-native report. The reproducible harness is
`verify-packed-candidate.mjs`; paired downstream instructions are in
`guru-577-handoff.md`.

## Acceptance map

| Criterion | Actual evidence |
| --- | --- |
| AC1 same Task/native continuation | New real-Git resume tests and final packed fixture; original archive, original active path and resumed active path are intentionally different. Actual schema1 session replacement, native task current, continuation, delivery history and next scope owner succeed. Legal explicit-task no-session route also passes. |
| AC2 historical facts/current work | Packed fixture verifies a real local commit SHA/tree, retained delivered outcome, original scope/history and zero gates/Completion/Closure/new Delivery, then native scope revision preserves history. Integration test separately executes real create_delivery after restore. |
| AC3 existing semantics | Complete Core + CLI suites pass, including formal reopen, old active conversion, historical closeout and full migration Plan2. No current lifecycle writer or Python/template was changed. |
| AC4 diagnostics/ownership | Core validation and CLI regressions cover intent/format/path/key/scope, schema2/formal facts, inherited gates, same-ID/all-generation/casefold conflicts, original-path reuse and unrelated Task/session preservation. |
| AC5 bounded replay/rollback | Public apply/recover/resume and native tests preserve operation/key/source; partial writer failure/exact rollback, source-tree drift, new carriers, reused paths and later work are covered. Final packed rollback refuses overwriting real later scope work. Existing tools candidate/restore compatibility tests remain passing. |
| AC6 candidate/build/native | Actual packed matching install, exact dependency, full dist comparison, independent quality review and native target proof are recorded. No affected Python/template twin requires changes; full template regressions pass. Guru joint acceptance is explicitly separate. |

## Verification

- Independent lint, typecheck and build: PASS; no implementation findings or fixes.
- Core complete suite: 484 passed, 1 existing skipped (28 files).
- CLI complete suite: 2369 passed (107 files), independent two-worker run.
- Source commit pre-commit hook reran the unmodified DEFAULT-concurrency complete
  suite: Core 484 passed/1 skipped; CLI 2369 passed. Thus the initial three
  timeout/temp-cleanup failures did not reproduce in either complete rerun.
- Python lint: 0 errors, 48 existing unused-import warnings.
- Final committed-source rebuild matches all installed dist bytes.
- Final packed installation/native/next-consumer verification: PASS.

## Evidence limits

The isolated fixture is public targeted acceptance, not real CMS restoration.
Guru #577 owns Markdown/Skill intent, original private owner maintenance and
joint next-owner semantic acceptance; those are not claimed complete here.
No release, global install, business repository writes, resource cleanup or full
multiplatform release matrix is included. Remote PR/CI/merge facts are recorded
with delivery rather than inferred from these local checks.
