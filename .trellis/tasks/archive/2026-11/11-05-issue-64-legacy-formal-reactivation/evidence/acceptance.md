# Issue 64 acceptance evidence

## Scope and fixed candidate identity

Baseline: `origin/main@3c37c75897f530c3ae8c5c4d85f6c1f3455b2e5f`.
Public contract: maintenance API `1.0`; Task schema `2.0`; matching CLI/Core
`0.7.0-castbox.6`, fixed source `619133c62d1487c5fbecbf9e00cea9e3f5ea52a6`.
Exact source/build/package SHA256 and installation instructions:
https://github.com/castbox/Trellis/releases/tag/issue-64-candidate-619133c62d14.
`candidate-record.json` preserves the full identity locally.
A version label alone is insufficient: this is a separately pinned Issue 64 build,
not a replacement for the existing published Castbox .6 artifacts.

## Acceptance map

| Issue requirement | Owning evidence |
| --- | --- |
| Fixed original ten-field predecessor, no normalization | `packages/cli/test/fixtures/legacy-formal/task.json`, Core formal tests, installed candidate probe's ten-field fixture |
| Exact location -> public family/TaskId/generation; g0 -> g1 and source | Locator-only `inspect-task`; shared Core formal-family/source validators; public integration suite and installed probe |
| Pending, applied lost output and same-operation resume | Formal suite runs both families; installed probe ordinary write interruption + actual recover/resume bin processes |
| Receiptless active/archive discovery and retained identity consumers | Shared public successor source check; formal suite native/SDK relocation/archive; installed Core relocation/native archive and original-entry inspection |
| Ordinary mismatch and existing-family compatibility | Core source/family errors; parameterized real-Git suite; existing maintenance/manual-resume/native Delivery regressions |
| Matched installable CLI/Core/capability | Fixed pair tarball hashes, isolated install, actual public contract/bin/SDK/native results recorded with release candidate |

## Boundaries

These are desensitized isolated Git fixtures with owner-authored projections and
legal public Git facts. No real Guru business archive, target installation,
historical PR/Finish semantic qualification, binding/continuation routing or joint
acceptance is performed or implied. Ordinary native Completion/Closure in the
fixture is later successor lifecycle work and is never imported by conversion.
Pending proof injects one ordinary filesystem write error through the installed
public SDK and then uses fresh actual CLI processes. This does not claim broad
crash-consistency or concurrency guarantees.

## Verification results

- Core targeted suites: **50/50**; both-family public formal real-Git suite: **42/42**; existing CLI/native regressions: **68/68**.
- Independent complete main-relative quality review: no remaining actionable findings. Corrected one stale documentation exclusion; no product fix required.
- Independent built Core / actual Python 3.9 retained-predecessor parity: **16/16** positive/negative cases.
- Main `pnpm lint`, `pnpm typecheck`, `pnpm build`, CLI Python typecheck, Python 3.9.6 compile, shipped/dogfood byte parity and `git diff --check`: passed. Python has 0 errors and 48 existing warnings.
- Actual packed pair installed into an isolated npm prefix: CLI and Core both `0.7.0-castbox.6`; CLI packed dependency is exactly `0.7.0-castbox.6`.
- Installed-candidate probe: **passed**, 40 actual subprocess calls with Python 3.9.6. Same TaskId generation 0 -> 1, matching caller `reference_only` source, raw archive preserved, no inherited gates/Completion/Closure. Installed Core relocation and later native successor Completion/Closure/archive passed. Original-entry receiptless archived discovery and original-operation recover/resume remained correct.
- Ordinary interrupted write: public recovery returned `pending` without `reactivated_task`; actual bin resume returned `applied` on the same operation and generation 1.
- The first probe attempt exposed only a driver `/tmp` versus `/private/tmp` comparison error; canonicalizing the fixture root enabled the intended write interruption. No product change was required. Final raw report is a candidate asset; summary and its SHA256 are retained here.
- Full pre-commit and remote CI are recorded at delivery follow-through below; these local observations do not imply Guru acceptance.


## Delivery follow-through

Implementation source commit: `619133c62d1487c5fbecbf9e00cea9e3f5ea52a6`.
PR targeting main: https://github.com/castbox/Trellis/pull/65.
Fixed separately pinned candidate: https://github.com/castbox/Trellis/releases/tag/issue-64-candidate-619133c62d14.
Attached assets: both matching tarballs, SHA256SUMS, candidate-record.json,
INSTALL.md, actual probe driver and raw 40-subprocess report.

The implementation commit's required full pre-commit hook passed Core **529**
with **1 existing skipped** test, and CLI **2434**. The candidate was uploaded
without replacing any existing asset and without npm publication. All five remote PR CI jobs passed on source commit `619133c62d1487c5fbecbf9e00cea9e3f5ea52a6`:
https://github.com/castbox/Trellis/actions/runs/42015654747.
PR #65 merged as `ca0e8b931d19ccb87802d6866abd2113a6f707c0`; Issue #64 closed.
Published assets were downloaded, all six SHA256SUMS entries checked, both packages
freshly installed and the actual 40-command probe rerun successfully with identical
candidate fingerprints. Supplemental published-download proof/raw report/checksums
are attached without replacing the original candidate assets.

Two attempted documentation-only commits reran the unchanged full suite and hit
existing 10-second subprocess timing limits (plus update-probe timing assertions)
under local machine load. No product failure or code change resulted. The original
implementation commit had already passed its full hook, and the same source passed
all five remote CI jobs. After verifying remaining changes are only task records,
metadata commits/archival skip duplicate Husky execution; no functional validation
gate is omitted.
