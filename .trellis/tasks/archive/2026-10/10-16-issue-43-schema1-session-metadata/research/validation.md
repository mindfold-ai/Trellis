# Issue #43 implementation validation

## Candidate and scope

- Workspace: `/Users/wumengye/Documents/GoProjects/Trellis-worktrees/43-schema1-session-metadata`.
- Branch: `codex/43-schema1-session-metadata`; source HEAD/base: `138961cbcac8367d15abe3d9d2f06101fa921cf6`.
- Both Core and CLI versions: `0.7.0-castbox.3`. This is an uncommitted local candidate, not a canonical committed-and-clean Guru adoption source.
- SHA-256 of `git diff --binary -- packages/core/src/task/maintenance.ts packages/core/test/task/maintenance.test.ts packages/cli/test/commands/maintenance-tasks.integration.test.ts .trellis/spec/cli/backend/commands-maintain.md`: `5cf7891f13ce7759a149416227461e2f44115923c5d1be653f46e30ae4eec429`.
- Built maintenance candidate fingerprints: CLI `57bca6844467c6af8a02151f580217d36b031e9cab8f5e36ec9206a856998bda`; Core `8e0b5d28d931db20b220159b934c4b748edc406299a63ff4dbd095e3f6b2d595`. Captured using built `candidateIdentity()` after build/typecheck; source and dist both participate in fingerprints.
- Environment: macOS, Node `v26.11.1`, pnpm `10.32.1`, native test Python `/usr/bin/python3` `3.9.6`.

## Regression evidence

Tests were added before changing production classification. Against the original classifier, exact scoped commands selected only the requested file:

- `pnpm --filter @mindfoldhq/trellis-core exec vitest run test/task/maintenance.test.ts`: **1 failed, 4 passed**. New writer-format test failed with `MaintenanceError: unsupported_carrier: Unknown path-based session`.
- `pnpm build`: passed for the original pair.
- `pnpm --filter @mindfoldhq/trellis exec vitest run test/commands/maintenance-tasks.integration.test.ts`: **2 failed, 13 passed**. Both metadata-bearing real-Git scenarios failed at `inspectBindings` calling the original Core classifier with the same unsupported-carrier diagnostic.

The bounded fix reuses the existing finite metadata validator for the complete schema-1 writer shape and the existing unversioned shape. Minimal schema-1, identity2/3 and all existing path/common-directory matching stay intact. No CLI production code or current writer changed.

Core coverage retains the existing minimal record, checks all nine optional aliases, rejects empty aliases/unknown fields/malformed or partial metadata, and verifies Task/workspace/common-directory ownership mismatches.

Real-Git CLI scenarios keep selected and unselected metadata-bearing sessions in shared storage, with unselected records sorted first. They verify read-only inspect/prepare, selected conversion/history effects, applied-result recovery, same-operation replay and exact rollback. Original bytes and POSIX modes of the selected Task, shared sessions and peer worktree are compared. Existing partial-retirement recovery and native continuation/selection scenarios remain covered by the same suite.

The new scenarios also spawn Node against built `packages/cli/dist/index.js` and public `@mindfoldhq/trellis-core/task/maintenance`, exercising `maintenance.inspectTaskTarget`, public closeout preparation and Core classification with the complete writer record in the disposable real-Git target. This is actual built-entry execution, not source-only validation.

## Checks

- `pnpm install --frozen-lockfile`: passed; lockfile unchanged.
- Core scoped test after fix: **5 passed**.
- `pnpm build`: passed, Core before CLI.
- CLI scoped test stable rerun: **15 passed**.
- `pnpm lint`: passed. Initial lint found dynamic deletion in the new test; replaced with a filtered object construction and reran successfully.
- `pnpm typecheck`: passed (builds Core, checks CLI).
- `pnpm --filter @mindfoldhq/trellis-core typecheck`: passed.
- `python3 .trellis/scripts/task.py validate .trellis/tasks/10-16-issue-43-schema1-session-metadata`: passed, 7 entries per manifest. Known warning: quality guidelines exceed the 32 KiB hook injection limit; full file was read explicitly.
- `git diff --check`: passed.
- Full `pnpm test`: **failed**. Core: **28 files passed, 480 tests passed, 1 skipped**. CLI: **99 files passed / 5 failed, 2319 tests passed / 8 failed**, 104 files total, 131.03 seconds. All 15 maintenance-task scenarios passed in this full default-parallel run, as did public maintenance, engine, tools and ordinary migration coverage outside the failures listed below.

One early post-fix scoped CLI run had **14 passed, 1 failed** because root typecheck was started while integration was still running, rebuilding Core dist between plan preparation and execution. The existing candidate fingerprint correctly rejected that mutation as `candidate_mismatch`. After typecheck completed, the same CLI suite was rerun with stable source/build inputs and all **15 passed**. This scheduling mistake is not hidden or counted as successful evidence.

First full run found an environment dependency failure in `test/templates/trellis.test.ts`: the pinned `marketplace` submodule was not initialized and `marketplace/workflows/tdd/workflow.md` was missing. Initialized only the recorded gitlink `7d5298d16e07c328c09493eed1f0652571744b17` with `git submodule update --init marketplace`; no gitlink/ref update. `pnpm --filter @mindfoldhq/trellis exec vitest run test/templates/trellis.test.ts` then passed **29/29**.

The other seven full-run failures were default **10000 ms timeouts** in existing tests: two `migrate2.integration.test.ts` inherited-authority cases (`reverse=false/true`), one `cross-worktree-session.integration.test.ts` finish/archive case, two `pi.test.ts` linked-workspace cases and two equivalent `omp.test.ts` cases. No assertion or candidate mismatch was reported for these failures. Reran the four files together using `pnpm --filter @mindfoldhq/trellis exec vitest run test/commands/migrate2.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts test/templates/pi.test.ts test/templates/omp.test.ts`: **4 files / 296 tests passed**, 76.39 seconds, normal parallelism and unchanged timeouts. This result is separate from full-suite success; the recorded full run remains failed. No suite serialization, timeout increase, cache suppression or implementation change was made to bypass these results. Built candidate fingerprints were rechecked after the full run and remain identical to those above.

## Limits

No commit, push, PR, release, Issue closure, Guru write, global installation or real business Task/session migration occurred. Tests used disposable repositories and existing recovery references. Upstream code/build/integration proof does not establish Guru #575 installation, native continuation, business acceptance or the full release/platform matrix. Recheck source/build identity after any later source change or authorized commit before preparing a downstream candidate.

## Authorized commit hook validation

The first authorized `git commit` was rejected by the unchanged pre-commit hook: Core 480 passed/1 skipped; CLI 2323 passed/4 failed across three template files. `pi` (one case) and `omp` (two cases) hit their existing 10000 ms timeout; `delivery-carriers.integration.test.ts` lacked the expected selected PRD because its existing Python hook subprocess returned `spawnSync python3 ETIMEDOUT`. No commit was created. The failure is retained separately from the earlier full run and scoped reruns.

Retry the complete unchanged hook with `VITEST_MAX_WORKERS=2 git commit ...`: two parallel workers reduce concurrent fixture/subprocess load while retaining every test, existing timeout and cache behavior. No test/hook/config source is changed or skipped. This is an explicitly adjusted execution profile, not a passing default-parallel result.

The two-worker complete hook also failed: Core 480 passed/1 skipped; CLI 2325 passed/2 failed (103 files passed, one failed; 252.93 seconds). Only the two existing `migrate2.integration.test.ts` inherited-authority reverse cases exceeded 10000 ms. The previous platform/hook failures passed. No commit was created. Retrying the entire unchanged hook with `VITEST_MAX_WORKERS=1` explicitly serializes file execution to remove fixture resource contention, with every test and its original timeout intact. This is a separate execution profile and does not establish a passing default-parallel run; no candidate fingerprint, hook, test or production-code change is used to bypass failure.

## Final committed and merged evidence

The unchanged complete pre-commit hook passed under `VITEST_MAX_WORKERS=1`: Core 28 files, 480 passed/1 skipped; CLI 104 files, 2327 passed. Local commit `e28e44b7d45533584732aad74fd869a8bec7b466` was created with all reviewed code/test/spec/planning changes. Its built package fingerprints were rechecked unchanged, and the worktree was clean. The successful single-worker execution does not rewrite earlier parallel failures.

PR https://github.com/castbox/Trellis/pull/44 merged reviewed head `e28e44b7d45533584732aad74fd869a8bec7b466` into main as `2a6f10ba3c0a2f27e0587e49e6c2f9b6a1f9d9d0`; Issue #43 closed automatically. PR CI https://github.com/castbox/Trellis/actions/runs/38851508674 and exact merged-main CI https://github.com/castbox/Trellis/actions/runs/38851816688 both completed successfully using repository CI configuration. Main CI success was verified live on 2026-10-16 before local Task archival.

These later successful full-CI runs supersede the earlier pending-full-pass limitation for the exact reviewed and merged candidates; the original local failures remain recorded as historical evidence. Guru installation/native continuation/business acceptance remain downstream-owned. No branch/worktree cleanup or local main synchronization occurred.
