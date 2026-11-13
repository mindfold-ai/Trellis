# Quality review: Plan2 inherited registered copies

Date: 2026-10-13. Profile: quality, verified legacy Task `plan2-worktree-copies`, status `in_progress`. This review records evidence only, with no formal gate/lifecycle result, commit, publication, branch change, original business write or downstream acceptance.

## Scope and result

Reviewed the complete working diff against base `780819aa98057038a7d6e21b5d66c11d61c23518`: CLI executor, closed plan schema, integration tests and migration specification. Also read the Task PRD/design/implementation plan, both context manifests, source analysis, independent planning research and implementation evidence. Read the full saved hook output and relevant specs from disk, including the full quality guidelines rather than relying on truncated injection.

No product implementation defect or unresolved design finding was found. One local regression-test gap was corrected below. The corrected candidate passes root lint/typecheck and all three targeted suites. At the initial review, whole-repository tests, final CLI build/pack and installed binary/runtime acceptance were pending; the subsequent audit sections record their actual completion. This report does not record Task completion or any formal lifecycle result.

## Findings fixed

- File: `packages/cli/test/commands/migrate2.integration.test.ts`, same-workspace negative case in `binding-reviewed inherited registered Task copies`.
- Issue: the fixture changed only the peer plan row and added another directory, leaving the original sibling occupied Task without a disposition. It consequently rejected at the earlier incomplete-inventory guard and did not exercise the intended same-workspace identity-group protection.
- Fix: move the synthetic peer directory to the declared main-workspace location and move its preserved planning decisions with it. Complete inventory stays valid, and the test now explicitly asserts `Task identity collision`. Source/schema behavior is unchanged.

## Findings not fixed

None. No public contract, Core/Python change or scope expansion was needed.

## Verified behavior and boundaries

- The additive closed binding rows derive only fixed common-dir preserve paths, validate canonical raw snapshots, safe integer identity/revision fields, exact JSON keys and unique actual current checkout. No binding producer or arbitrary common-root writer is introduced.
- Complete frozen original source groups admit exact identity/generation/immutable provenance in distinct canonical workspaces/Task directories, one active conversion/current authority and independently valid declared-predecessor deferred peers. Case/generation/source differences, archived/unknown historical occupation, all-defer and multiple authority groups still reject; projection stays single-entry and order independent.
- Branch-local metadata/planning may differ. Deferred records/artifacts, bindings and selected root planning retain raw bytes/modes; null-source preserve decisions cannot create peer artifacts. Existing ownership checks deny peer migration/Delivery writes.
- Existing bindings for unique active identities require reviewed evidence as well. Native absence stays compatible, while the public marker boundary is checked across all eligible Git roots. Git-free marker/no-binding compatibility remains intact, and Git-free binding inputs reject.
- Final preflight re-reads registrations, suffix/common-directory identity and each planned workspace's actual Git top/common directory, canonical Task directories, selected checkouts, binding absence and marker predicates. It revalidates safe paths and the complete prepared byte/mode set before mutation; dry-run detects changes from its observed state. No locking or write-phase transactional guarantee is claimed.
- Common projected sessions preserve exact Task/generation and resolve only the sole active authority/eligible Delivery. Preserve-only sessions gain no inferred eligibility. Public shipped Python from both controlled roots selected the bound authority in targeted tests; packed CLI/runtime proof is still pending with the main owner.
- Same-plan completed and ordinary-failure partial replay uses original source groups, preserves files without rewrites, rejects third states, and supports exact preview-owned rollback. Plan1 and unique-ID compatibility regressions remain passing.

## Verification

| Command | Actual result | Evidence |
| --- | --- | --- |
| `pnpm lint` | Pass after correction, both packages | `/tmp/plan2-check-lint.log` |
| `pnpm typecheck` | Pass after correction, Core build and CLI TypeScript | `/tmp/plan2-check-typecheck.log` |
| `pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts test/commands/migrate.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts` | 142 tests passed in 3 files; 37.02 seconds | `/tmp/plan2-check-targeted.log` |
| `git diff --check` | Pass | Actual command exit 0 |

The first targeted rerun overlapped root typecheck's Core clean/build and failed import resolution in two suites. This was a reviewer scheduling error; the successful rerun above occurred after the build completed. No product fix was made for that error.

## Exact reviewed inputs

The tracked base-to-working diff SHA-256, after the fixture correction, is `da2d84d1431d7278bb1776e48785e6f86fffe758985850b61532a83876a2db1d`. It covers all four modified tracked files. New Task documents are identified separately below; this newly added report is outside its own input digest. Machine-readable evidence is `/tmp/plan2-quality-review-inputs.json`.

| Input | Raw SHA-256 |
| --- | --- |
| `.trellis/spec/cli/backend/commands-migrate.md` | `0ee123a93712fb52016eade2ce9e1ce30823e78c932ad5e62bbf4a85df7fc50b` |
| `packages/cli/src/commands/migration2-schema.ts` | `baf5d7f62b4ff6e16a6f32f9e75dc18f41652539ba4da1f0e99244076d1664ee` |
| `packages/cli/src/commands/migration2.ts` | `70ae76e4e504a0f60e5753b38a3a7cebb6afcb5b66ef5bfb319378b24165659a` |
| `packages/cli/test/commands/migrate2.integration.test.ts` | `2ada5d51874741577c14244a2aa08e5c99b5197d42f5dbf5c05b031a086edf94` |
| Task `prd.md` | `09141a171d06da767dcb514c90c9ad9f5db8ab39f4ff0e2ee8bd1c67f3946212` |
| Task `design.md` | `b275681ca4e4b4e1f80064e330380dff786bb78d6a6d6f8f3f1a7d5e5234a3cc` |
| Task `implement.md` | `2041917e86ca77755d71686fd6ac48c3100153359171ac588698fb53df15c50a` |
| Each Task context manifest | `5a4d82d75053d8ba44687c590083ce8114d6ffb4f01ce2c5cb264e4e864c765f` |

Implementation evidence's earlier test-file hash identifies the pre-review fixture. The main owner must use the corrected hash above for final candidate/build/test provenance. Issue #31 remains completed and closed; no #531 prerequisite or joint acceptance applies.

## Installed-candidate evidence audit

Independently audited the main owner's proof under `/tmp/plan2-worktree-copies-candidate-q9h3iZ`: `installed-proof.py`, `fault-on-fourth-write.mjs`, the installed-only synthetic fixture generator, result JSON, command outputs, source manifests, package identities and installed-byte/mode comparison. No source/test edits were needed.

The 1,257-entry source manifests before build and after packing are exactly equal. Recomputed their declared sorted-key canonical digest: `17ea37fbfcfe81a7e2c43f223cacdeee6ebd4c90cd28fff74c143a75bebd1a50`. This manifest excludes Task evidence, so it is separate from the earlier four-file working-diff digest. Independently opened both tar archives and checked every regular member against the installed package's actual bytes/mode: CLI 713 and Core 270 files, all matching. Independently verified both tar hashes and the reviewed plan hash.

| Artifact | Verified SHA-256 |
| --- | --- |
| CLI tar | `185ed1db6865b72138bb10b6d799225721bf50fddfb370f84d8ec330558f472d` |
| Core tar | `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967` |
| Reviewed installed plan | `5c14bec56c837c88355ed8219c7e9d62549d8a1e1e58db522a6052035e580f83` |
| `installed-proof.py` | `051138152eab3e579ca47dd5e4c2487573e3a8355486b7deb5bfcc2601b8ef52` |
| `fault-on-fourth-write.mjs` | `fcdb2ed8c185298fa805c68393c33552166c7ffcabd956259d3f2a8a7c3e0e52` |
| Installed-only fixture generator | `95b0aacdc77b5e0ed6b49067752c6613bfd601279206fc82570e6637c96d429b` |

The proof invokes the packed public `bin/trellis.js migrate` entry, not source TypeScript. Its fixtures commit synthetic predecessor Tasks before registered sibling creation and use opposite actual checkout bindings, differing branch planning and modes. The proof's recursive snapshots cover both workspaces, their common Git directory, files, directory modes and symlinks. Preview covers 120 actions and leaves all 132 initial entries unchanged. Preserve actions include both raw binding snapshots.

Fault injection changes Node's actual rename operation only under the controlled fixture and fails on the fourth `.trellis` atomic replacement. The observed command error contains the injected failure, and the snapshot proves some earlier writes completed. Same-plan preview then stays unchanged and conflict-free; execution finishes both projections. Peer records/planning/modes remain exact with no peer migration/Delivery additions, selected history retains original raw sources, and projected common sessions match the reviewed schema-3 records. Completed replay from the opposite root makes no snapshot changes.

Independently queried `/usr/bin/python3 --version`: Python 3.9.6. Installed scripts from each root are run for each of the two sessions: four exact Task workspace and Task/Delivery/generation routes. Current context, Delivery current, schema/API runtime contract and declared continuation outputs are validated together. Reader probes leave the migrated snapshot intact. Direct deferred selection fails with the concrete `unsupported_task_schema` output and no writes. Raw binding byte and mode drift each produces preview third-state conflict, execution rejection and no changed snapshot; restoring the controlled injection returns exactly to the migrated state. Caller rollback restores only preview-owned non-preserve files, removes additions and new empty directories, and returns exactly to the original directory-inclusive snapshot.

This is sufficient installed synthetic evidence for the bounded upstream contract. It is not original business-tree cutover, downstream business gate recovery, joint acceptance or a full release matrix. No new issue was found in this evidence audit.

### Whole-suite status at audit

The first root `pnpm test` log records Core 475 passed with one existing optional SQLite skip; CLI 2,218 passed and seven failures, each explicitly `Test timed out in 10000ms`. The seven are the two new inherited-copy positives plus five existing Delivery hook/Pi/OMP tests. No assertion mismatch, package import failure or subprocess failure is reported in that run. The main owner reports running packing/installed proof concurrently with that first suite, so resource contention is a plausible cause, not yet a proven excuse to count it as passing.

The isolated complete CLI rerun with `--maxWorkers 4` and unchanged timeout/source subsequently completed: 2,224 passed and one failed in 99 files, 135.11 seconds (`full-cli-bounded.log`). Both new inherited-copy positives passed at 7.902 and 6.388 seconds. The sole remaining failure is the existing OMP selected-v2 cross-worktree test, again explicitly a 10,000ms timeout. This narrows the problem but still is a failed full run. Recommend isolating the OMP file to establish its actual duration and, if that passes, a complete lower-concurrency run without changing the timeout/source. Whole-suite acceptance remains pending. This audit does not relabel either timeout run as a pass or change timeout settings.

## Final acceptance-map refresh

Reviewed the complete same candidate again against `research/final-verification.md` and the approved PRD/design/implementation plan. All four tracked file hashes and the tracked diff still match this report's earlier independent review. `source-after-checks.json` equals the before-build manifest exactly, retaining the 1,257-entry source digest `17ea37fbfcfe81a7e2c43f223cacdeee6ebd4c90cd28fff74c143a75bebd1a50`. The corrected test hash is explicitly distinguished from the implementer's earlier handoff. The migration specification's fixed binding, original-source grouping, preservation, unique authority, failure matrix, compatibility and pre-write rechecks agree with the actual code paths; no additional source/spec or AC-map finding was found.

AC1–AC5 have the installed/regression evidence described above. AC6 correctly keeps full CLI acceptance pending its final result. The isolated OMP file then passed 44/44, 42.22 seconds, with the former timeout case taking 4.088 seconds and the existing 10-second limit unchanged. The saved `omp-isolated-captured.log` is explicitly a final tool-output summary, not a complete redirected log. The subsequent raw complete CLI serial log independently shows the whole OMP file passing 44 tests in 41.751 seconds and both inherited-copy positives passing in 4.690/4.963 seconds. At this refresh the remaining full suite is still running; these partial observations do not establish its final success.

## Final quality outcome

Independently read the completed raw `full-cli-serial.log`: all 99 test files and all 2,225 tests passed, 500.20 seconds. No failed-test section or remaining timeout appears. The main owner observed process exit 0. This is the complete CLI suite with `--maxWorkers=1`, unchanged source and unchanged 10-second timeout. Together with the complete Core run (475 passed, one explicitly retained optional SQLite skip), the full local test scope now has actual passing outcomes. Previous failed timeout runs remain honestly recorded above; their disappearance under unchanged-source lower-concurrency runs supports resource contention, without pretending those earlier commands passed.

Independently compared `source-final.json` against the original before-build manifest and recomputed its canonical digest. They are exactly equal at 1,257 entries and `17ea37fbfcfe81a7e2c43f223cacdeee6ebd4c90cd28fff74c143a75bebd1a50`; the tracked diff remains `da2d84d1431d7278bb1776e48785e6f86fffe758985850b61532a83876a2db1d`. Read the final updated `implement.md` outcome and `research/final-verification.md`: all AC1–AC6 are correctly backed by the reviewed source, regressions and controlled installed proof. No stale pending whole-suite claim remains in that final owner evidence map.

Final unresolved findings: **none**. Lint, TypeScript, targeted suites, complete local suites, build and installed-candidate evidence are sufficient for this bounded implementation quality review. Minimum-Python syntax/type evidence is separately reported, with warnings/skips retained. No additional implementation/specification change is recommended. Commit, publication, remote CI, source closure and Task wrap-up remain the main/user workflow boundaries; this reviewer neither authorizes nor executes them. This conclusion does not claim original business cutover, downstream recovery, joint acceptance or release validation.
