# Independent source quality review: Plan2 mixed-source

Date: 2026-10-13. Profile: `quality`, verified exact legacy Task
`plan2-mixed-source`, generation 0, source `no_issue`, under the undeclared
legacy workflow (`missing_runtime_contract`). This is source quality evidence;
no formal Delivery gate, readiness, Completion or Closure result is recorded.

## Reviewed scope and result

Reviewed the complete four-file working-tree diff against
`fdb88e8e220b42df0f0b78f8b939e072d36b9be1`, exact PRD/design/implement,
check manifest and every applicable spec/research input. The full 917-line
quality-guidelines file was read from disk, not the capped injection. Core
public predecessor validators/projection and shipped Python target/selection
paths were inspected read-only to verify actual behavior.

No unresolved product/spec defect was found. Two local test-evidence issues
were corrected below. Final source quality verification passes. Packed public
entry proof remains pending; this is not whole-Task completion or installed,
business, release, #406 or #531 acceptance. #31 stays closed and upstream
acceptance remains independent of downstream work.

## Findings (fixed)

1. `packages/cli/test/commands/migrate2.integration.test.ts`, mixed inherited
   Python deferred-selection proof: an unqualified `toThrow()` could also pass
   if the current-reader schema boundary were bypassed and the nonexistent
   Delivery alone caused rejection. Replaced it with subprocess status 1 and
   actual strict-source diagnostics: schema1 `unsupported_task_schema`, known
   legacy `task_metadata_unsupported-fields`. Thus `delivery_not_found`, launch
   failure or unrelated path failure cannot count as predecessor rejection.
2. The same test's plan-order permutations repeated all 24 identical Python
   reader subprocesses, twice. After tightening the assertion, the minimum
   Python rerun exposed one 10-second timeout (reverse=true, 10.566s), with
   160 other tests passing and no assertion mismatch. Split reader proof into
   two invocation-root cases, each checking both exact Task keys and all reader
   modes. Both plan-order cases still verify authority, raw preservation,
   completed no-writer replay and exact rollback. Removed redundant reader
   execution without relaxing the unchanged 10-second timeout or product guards.

Only the owned test file was edited by this reviewer. Source/spec implementation
bytes remain unchanged. Existing helpers and synthetic fixtures are reused;
the final file has 163 cases, including all 103 original cases. No speculative
abstraction, parallel Core model, product fault hook or additional product path
was introduced.

## Findings (not fixed)

No unresolved source-level, design, interface or scope finding. AC7's fresh
offline CLI/Core pack/install/public-bin proof is deliberately outstanding under
the separate authorization boundary; ordinary source tests cannot replace it.
This known evidence gap is not represented as a passing acceptance criterion.
No real/private sample was accessed or modified by this reviewer.

## Requirement and acceptance trace

| Requirements / AC | Inspected behavior and executed source evidence | Status |
| --- | --- | --- |
| R1–R2 / AC1–AC2 | Closed enum/row selector and plan-level refinement run before repository processing. All three mixed predecessor dispositions require legacy/1.0; unknown fields and missing/invalid declarations fail. Convert/defer share one strict public-validator path over decoded original RawSnapshots; both mismatch directions and malformed/unknown originals reject with exact zero-write/full-tree assertions. Generated 28/3 inventory converts selected schema1 while retaining 30 peers; opposite legacy selection and mixed archive conversion are executed. | source verified |
| R3 / AC2–AC3 | Homogeneous overrides are forbidden for every disposition, old plans/errors retained. Mixed current/history forbid selectors and retain strict current/location/target restrictions. Single-kind mixed and current/history-only-only inventories are legal without an artificial format-count requirement. Plan1 and all original Plan2 cases remain passing. | source verified |
| R4–R5 / AC4 | Projection remains the public Core implementation, with id/source/nonzero generation/business/tree assertions and existing authority/fact checks. Legacy personnel/status remain only in exact source history. UTF-8/whitespace, modes, planning/JSONL/binary descendants and raw deferred/current sources survive. Preserve paths receive no atomic writer calls; peers gain no migration/Delivery artifacts. | source verified |
| R6 / AC5 | Frozen identity grouping, provenance/case/generation collision and one bound authority remain unchanged. Mixed same-ID cross-category, two/all-defer, missing/wrong/malformed binding, alias/path/marker/inventory/artifact and final topology/binding drift cases reject. Real synthetic registered siblings test both plan orders. Minimum-Python readers from both roots resolve each exact Task/workspace and no_current_delivery key; strict deferred selection and full-tree nonmutation are explicit. | source verified; packed identity pending |
| R6 / AC6 | An actual atomic rename is failed after the main Task becomes schema2. Same unchanged plan previews/resumes from original declared schema1/legacy snapshots. Temp cleanup, completed zero-writer replay, source/target/binding byte/mode third states and caller rollback over primary/sibling/common storage are asserted using directory/symlink/file/mode-inclusive snapshots. | source verified |
| R7 / AC7 | Public spec matches code and test matrix. Ordinary build/root quality, complete Core/CLI suites and actual Python3.9 checks have evidence below. No new CLI tar/installed manifest, full packed plan/template hash or public-bin proof exists yet for this Task. | partially verified; packed proof pending |

The existing generation classifier used during identity grouping is unchanged;
it does not select a fallback predecessor validator. Both convert and defer
reject declared-source mismatch before execution. The optional-chain owner
check change in migration2.ts is equivalent: owner_id is a required nonempty
string, so absent outcome still rejects, as does owner mismatch.

## Verification

All commands ran sequentially with stable product/dist ownership; no concurrent
Core clean/typecheck overlapped a test run. Node: v26.9.0 (not Node20 CI proof).
Minimum interpreter: `/usr/bin/python3` 3.9.6, selected by a temporary test-only
python3 symlink first on PATH. Owned shim directories were removed after runs;
no global executable/configuration was changed.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Core complete suite | 27 files; 475 pass, 1 skip; 2.90s | quality-core-full.log |
| CLI complete suite, `--maxWorkers 1` | 99 files; 2283 pass, no skips; 381.95s | quality-cli-full.log |
| Final full migrate2 under Python3.9.6, `--maxWorkers 1` | 163 pass, no skips; 49.58s | quality-migrate2-python39-reader-split-final.log |
| Final root `pnpm lint` after all fixes | pass | quality-lint-final-2.log |
| Final root `pnpm typecheck` after all fixes | pass | quality-typecheck-final-2.log |
| `git diff --check` | pass after all fixes | reviewer command output |
| Ordinary root build | implementer-executed pass, unchanged final product source | implementation-build.log |
| Four related regressions under Python3.9.6 | implementer-executed 4 files, 221 pass, no skips before reviewer-only test changes | implementation-regressions-python39-final.log |
| Python typecheck | main-executed, log inspected: 0 errors, 48 existing warnings | python-typecheck.log |
| Tracked Python syntax inventory | main reported 89 files pass under actual3.9.6; no Python/template edits in this review | main-owner evidence |

The Core skip is the existing inactive no-python placeholder in
`mem/sqlite-readonly.test.ts`; actual SQLite tests ran with an available Python.
It is not evidence of a missing interpreter or an unverified migration test.
The complete CLI suite ran at the pre-review test hash
`ffdd656cf2e954219a5a49c4be4a8bcff168c2adb989c1c127ded742d137f3cc`.
Only the two localized test fixes followed; the entire affected file was then
rerun at the final hash below. Do not claim a new complete-suite total of 2285:
that would combine executions rather than report an actual suite run. Repeating
unaffected suites is unnecessary for these test-only changes.

Failed evidence is preserved: `quality-migrate2-python39-final.log` records
160 pass / 1 timeout at the tightened-assertion, pre-split snapshot. The final
successful run has its own filename. Earlier implementer baseline/fixture/lint/
concurrent-dist failures remain described in implementation-results.md and in
their original logs; none was overwritten or relabeled as a pass.

## Exact final reviewed bytes

| Path | SHA256 |
| --- | --- |
| packages/cli/src/commands/migration2-schema.ts | 64b4be715920c020a7adb27fa03ee49e1c8bea5f04699b195b1b4f45a9728767 |
| packages/cli/src/commands/migration2.ts | 6302b38b813832b019df843b8645a6e0e4e97ad745a783d7a766094f3675a80b |
| packages/cli/test/commands/migrate2.integration.test.ts | 29499492eae77ad93b3be114adfff94cd888d9bb1a27f1a606968561e4af24f0 |
| .trellis/spec/cli/backend/commands-migrate.md | 2271680d0455f66e9b096dbc2ad1ef8ed01dd479bcaf3f447072631adedfe13a |
| prd.md | 4a2d3e8811e94f8ded3528bb679c578a276421a48b76eca48954232f454efe65 |
| design.md | 5d5e80fe248d08c7cf471483e5e032b91955a8f3c789b2cd98c98a3af604ce76 |
| implement.md | f3685607f4954982823f4c6444695210b1d93634378b300d920894b7e2065ebd |

Exact binary four-file diff SHA256 against the base:
`dd98725f2a3d6e4d3d888d5ca21e8dc1ae9da69a1dc4f6d132255348fa42f2e0`.
This identifies source evidence only, not a tarball or installed candidate.
Main owns subsequent metadata/provenance updates and any separately authorized
candidate proof. This reviewer made no Task status/gate result, branch/worktree,
commit/publication, existing-sample, Issue or outbound task-message mutation.
