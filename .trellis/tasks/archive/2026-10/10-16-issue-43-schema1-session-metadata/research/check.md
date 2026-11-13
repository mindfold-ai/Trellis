# Independent quality review — Issue #43

Profile: ordinary quality verification; no formal Delivery gate or lifecycle result recorded.

## Findings

No actionable correctness, scope, spec synchronization or test coverage finding in the complete intended four-file diff against `138961cbcac8367d15abe3d9d2f06101fa921cf6`. No product code or tests were changed during review.

The classifier recognizes exactly the existing minimal schema-1 shape or complete historical writer metadata shape. The shared finite alias validator preserves unversioned behavior and rejects unknown fields, partial/invalid metadata and non-null run state. Workspace/path/common-directory matching and identity2/3 validation remain unchanged. CLI inspection still positively classifies each carrier before filtering; no unsupported-record bypass or current execution authority was introduced.

Historical writer provenance was checked directly against `43fffc170927c85d9f7fc106cc5a059e80d4530b` `_context_metadata`/`set_active_task`. Applicable Core boundary, full quality-guidelines, test conventions, integration patterns, maintenance contract and exact Task planning artifacts were inspected. No writer/template sync is necessary because this change is maintenance-only predecessor recognition.

## Accepted scope assessment

| Acceptance | Review evidence |
| --- | --- |
| A1 | Complete writer record classifies as selected `path1`; real-Git inspect and prepare keep source snapshots unchanged. |
| A2 | Core covers all nine aliases and retains minimal schema-1 and existing carrier cases. |
| A3 | Core separates Task/workspace/common-dir mismatches; real-Git unrelated Task and peer-workspace records sort before selected record and retain bytes/modes through apply/recover/rollback. |
| A4 | Conversion checks exact identity3 replacement, raw source retention, original-operation replay/recovery and exact rollback. |
| A5 | Closeout checks raw archived Task and selected retirement; existing suite retains archive ordering, native no-selection and partial-retirement recovery proof. |
| A6 | Closed-format negative tests reject unknown keys, partial metadata, empty aliases and malformed required metadata. |
| A7 | Validation evidence records matching versions, source/diff identity, built fingerprints, baseline failures, stable targeted results and full-run limitations. Dirty candidate is explicitly not canonical Guru adoption proof. |

Core tests own format/ownership assertions; CLI regressions add orchestration/bytes/modes and built public namespace behavior rather than a second format matrix. Conversion and closeout have different selected effects and both merit coverage.

## Verification

Independently rerun after the stable handover:

- `pnpm lint`: passed for both packages.
- `pnpm --filter @mindfoldhq/trellis-core typecheck`: passed.
- `pnpm --filter @mindfoldhq/trellis typecheck`: passed against matching existing Core build; no rebuild raced integration.
- `git diff --check`: passed.
- Four-file binary diff SHA-256: `5cf7891f13ce7759a149416227461e2f44115923c5d1be653f46e30ae4eec429`.
- Built `candidateIdentity()` matches implementation evidence: CLI `57bca6844467c6af8a02151f580217d36b031e9cab8f5e36ec9206a856998bda`; Core `8e0b5d28d931db20b220159b934c4b748edc406299a63ff4dbd095e3f6b2d595`; both `0.7.0-castbox.3`.

Accepted stable implementation test/build evidence in `validation.md` without duplicating expensive suites: build passed; targeted Core 5/5 and CLI 15/15 passed, including built public Core/CLI smoke. Full Core passed 480 tests with one skipped. Full CLI run failed (2319 passed, eight failed): one absent pinned marketplace dependency and seven existing 10-second timeout failures. Marketplace template rerun passed 29/29 after initializing its unchanged pinned gitlink; the four timeout files rerun together with normal parallelism and unchanged timeouts passed 296/296. All maintenance-task tests also passed in the original full run. These reruns do not establish a successful single full-suite run.

Conclusion: Issue #43 targeted acceptance is supported; lint and type checks pass, no implementation finding remains. Full-suite status retains the recorded failure and rerun caveat. No release/platform matrix, Guru installation/business acceptance, publication or closure is asserted.
