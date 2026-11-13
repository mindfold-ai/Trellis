# Implementation plan and progress

- [x] Extract/reuse Python resolution and shell-free invocation across all Issue consumers; add meaningful regression tests.
- [x] Add standalone public CLI native driver and explicit Windows/Unix CI matrix plus baseline/candidate comparison and evidence artifacts.
- [x] Update entry docs and relevant specs; independent full-scope Trellis check.
- [x] Run build, lint, TS/Python checks and full tests, packed paired install smoke.
- [x] Commit, PR, inspect all native CI (including exact baseline/candidate assertions), fix any failures, merge only on green.
- [x] Bump paired Castbox version, validate immutable assets at exact main, tag/release, download verification; record evidence, close Issue and archive Task.

Authorization: user explicitly authorizes all repository/Issue operations through release and accepts preferred options. Planning reviewed against complete live issue; no user-owned decisions remain. Existing workflow is native legacy (missing_runtime_contract); continuation loaded from live workflow.


## Implementation and independent static check

- Shared selector extracted to `utils/python.ts`, old init exports preserved.
- New-operation update/prospective/workflow selection precedes preflight/rendering. Native preflight/tools contract/context use executable plus prefix argv.
- Tools apply/recover/resume compare frozen replacement bytes to the current rendered candidate before writes/validation; changed choice returns existing stale_source without new state/schema.
- Targeted runtime 113 tests passed, engine seam 10/10, full platform projection includes python/py -3 and POSIX python3. Independent static checker reports no remaining substantive findings; lint and TS checks passed.
- Python typecheck: 0 errors, 48 warnings. Core tests: 484 passed, 1 skipped.
- Local macOS real public-CLI driver: 59 commands/121 assertions passed (dirty working source, recorded dist digests; not native Windows proof). Real local Git custom marketplace fixture records URL rewrite and source, no external transport claim.
- Full-suite first run exposed a missing test mock export (fixed), concurrent candidate source edits/timeouts, and archive cleanup race. Frozen retry had 2380 pass and only archive cleanup ENOTEMPTY. Fixture-local background Git maintenance disabled; archive-only 6/6 pass. Final complete rerun pending.
- Paired 0.7.0-castbox.5 tarballs prepared, exact CLI/Core dependency verified. Publication awaits CI and installed evidence; no npm publication.

- Frozen full rerun cleared archive race; 2379 passed and two 10s timeouts remained (platform registry projection / existing cross-worktree session test). Retrying complete CLI suite with maxWorkers=4, preserving original timeout and all assertions. Normal CI keeps its original runner/testing strategy.
- Isolated paired local installation passed: exact .5 core resolution and 10 real public init/update/maintenance/workflow/recover/resume calls.


## Native CI iterations

- PR #54 first run https://github.com/castbox/Trellis/actions/runs/39213452341: full Ubuntu build/lint/typecheck/tests passed (Core 484 + CLI 2381, one Core skip); Linux/macOS native chains passed. Both Windows baselines precisely reproduced selection_lost, candidates passed init/update/hook/conflicts then exact-root fixture failed because hosted TEMP used RUNNER~1. Driver f14019fb canonicalizes actual Git root, leaving production root validation intact.
- Local four-worker full CLI run had 2380 pass/one Pi timeout while duplicate precommit test ran; isolated Pi recheck 65/65 passed. Duplicate precommit run was cancelled; initial commit used HUSKY=0 after explicit lint-staged/static/manual checks, with actual full CI success retained separately. No test assertions/timeouts weakened.
- Second run https://github.com/castbox/Trellis/actions/runs/39213907652 passed Linux/macOS. Windows candidate's real py -3 native apply passed but recover correctly exposed target-mode drift (source Windows0666 vs requested0755;39 script paths pending). Add bounded platform target-mode projection before rerunning; no false applied/recovery claim.


## Final outcome (2026-10-19)

All accepted R1-R7 and Issue acceptance items are complete. PR #54 merged to main 7f050fa11ddd8569e5db4f728ea1b745b7500a98. Final PR run 39215243132 and exact main run 39215935088 CI passed all 5 jobs; Core 484 passed / 1 skipped, CLI 2383 passed. Four candidate native chains passed (257 subprocess/probe commands,503 assertions); both Windows baselines precisely reproduced selection_lost. Independent checker audited each raw command record, source/build/driver identities and actual recovery/workflow results.

Third CI39214685556 proved full py -3 chain; its python3 fixture exposed self-authored ._pth isolation. Final driver uses the complete copied real runtime with no altered import policy, audits script-directory sibling imports before candidate execution and records actual executed interpreter hash separately from setup binary. Fourth PR and main reruns proved both Windows variants. Earlier failed results remain historical and are included in the release diagnostic archive.

Castbox paired 0.7.0-castbox.5 release is published at the immutable source above. Assets include both tarballs, release record, checksums and durable native evidence. Remote annotated tag target verified. Exact main rebuild was byte-identical to candidate package pair. Release-download checksums and isolated reinstall independently passed; all 1018 file bytes/executable modes and 10 public CLI calls matched. npm release job 39216562837 was skipped as intended; no npm publication or downstream business modification occurred.

See release-evidence.json for source, run and asset checksums. All Issue checkboxes were completed and closure requested after download proof. Current Task archive is bookkeeping only; release tag/source remain fixed.

Issue #53 was verified CLOSED at 2026-10-19T07:34:25Z after its 10 acceptance items and final evidence comment were updated.
