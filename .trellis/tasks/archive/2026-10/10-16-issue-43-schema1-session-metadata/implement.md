# Implementation plan

Status: implementation and independent quality review completed locally on 2026-10-16; work committed, PR #44 merged, Issue #43 closed and exact merged-main CI passed on 2026-10-16; local Task archival follows. Task remains `in_progress` until workflow closeout. Validation outcomes and full-suite caveat are recorded in `research/validation.md` and `research/check.md`.

## Ordered work

- [x] Read live Issue #43, current workflow and remote maintenance code.
- [x] Trace the historical native writer and existing Core/CLI test coverage.
- [x] Write PRD, design, research and implementation/check context manifests.
- [x] Obtain artifact review and approval for implementation and the exact isolated workspace described in `design.md` (user: 确认继续).
- [x] Rechecked remote at the approved SHA; created the approved branch/workspace, moved this exact Task without duplicate identity, and verified the session workspace binding and continuation contract.
- [x] Read target package specs, added `commands-maintain.md` to both manifests, validated them, and activated with `task.py start` after approval (status `in_progress`).
- [x] Dispatch `trellis-implement` with `Active task: <verified exact task path>`; scope ownership to the Core classifier and corresponding tests/spec clarification. Require context injection or child-side loading. Preserve other agents' edits.
- [x] Add writer-derived failing Core and real-Git CLI regressions for A1-A6; verify the baseline failure is the reported unsupported-carrier error.
- [x] Make the bounded Core classifier change. Do not relax current writers or skip unknown carriers in CLI.
- [x] Build matching packages and run the checks below; add evidence to `research/validation.md` with exact candidate identity and limitations.
- [x] Dispatch `trellis-check` for the full accepted scope, including unknown-field rejection, unselected bytes/modes, recovery/rollback, public maintenance entry and duplicate-test avoidance. Fix findings and rerun affected checks.
- [x] Clarify the finite schema-1 metadata contract in `.trellis/spec/cli/backend/commands-maintain.md`; assess other specs only if the final behavior requires it.
- [x] Presented complete local result and obtained separate local-commit authorization (user: 确认继续). Publication remains separately unauthorized. No push, PR, merge, release, cleanup, Guru write or Issue closure is authorized by planning approval.

## Validation commands and evidence

Run in the approved implementation workspace, with `pnpm@10.32.1` and matching installed workspace dependencies:

```sh
pnpm install --frozen-lockfile
pnpm --filter @mindfoldhq/trellis-core test -- test/task/maintenance.test.ts
pnpm build
pnpm --filter @mindfoldhq/trellis test -- test/commands/maintenance-tasks.integration.test.ts
pnpm lint
pnpm typecheck
pnpm test
python3 .trellis/scripts/task.py validate .trellis/tasks/10-16-issue-43-schema1-session-metadata
git diff --check
```

Use the existing public maintenance API/bin tests and an exact built namespace smoke check to verify the writer-derived record through `/task/maintenance` and `maintenance.inspectTaskTarget`/prepare. Confirm `vitest run` actually selects the intended files; adapt invocation only to repository tooling. Full tests retain Plan1/Plan2 and ordinary maintenance/update regressions. Do not serialize suites or suppress caches to hide candidate identity changes.

Record source SHA plus dirty diff identity before commit, both package versions, build result, named targeted test counts and full-check results. After any authorized commit, recheck the source/build correspondence before giving Guru a canonical candidate. A package validator's acceptance of a source object is separate from successful build/integration execution. Environment-unavailable checks are blocked/skipped, never passing.

## Planned file scope and review points

- `packages/core/src/task/maintenance.ts`: sole production change expected; preserve all identity/path matching contracts.
- `packages/core/test/task/maintenance.test.ts`: positive writer compatibility and bounded rejection/ownership regression.
- `packages/cli/test/commands/maintenance-tasks.integration.test.ts`: real shared-session conversion/history/recovery/rollback coverage.
- `.trellis/spec/cli/backend/commands-maintain.md`: supported predecessor-format clarification.
- This Task's planning and validation artifacts.

If implementation requires changes beyond this boundary, explain evidence and update design before broadening. Rollback of fixture operations uses their original recovery refs. No actual Task migration or package installation outside disposable test targets.

## Local acceptance outcome

Independent check found no actionable findings across A1-A7. Stable targeted checks passed: Core 5/5, CLI 15/15, build/lint/typechecks. Full first run: Core 480 passed/1 skipped; CLI 2319 passed/8 failed (seven existing 10-second timeouts and an absent pinned marketplace submodule). Exact dependency initialization resolved the template failure (29/29), and all four timeout files passed together unchanged (296/296). These scoped reruns do not constitute a single full-suite pass. Candidate diff and CLI/Core fingerprints were independently confirmed. No commit/publication or business migration has occurred.

## Authorized commit

User approved one local commit `fix(maintenance): #43 兼容旧原生 schema-1 会话元数据` containing the four reviewed code/test/spec files and this Task directory. The commit hook runs its configured checks. No push, PR, merge, release, cleanup or business migration is authorized by this approval.

## Delivered outcome

Reviewed work commit `e28e44b7` was published through PR #44 and merged as `2a6f10ba`; both exact PR and merged-main CI passed. Original local failures and later successful profiles are preserved in validation evidence. Accepted A1-A7 is complete for upstream Issue #43; Guru #575 adoption and business acceptance remain outside this Task. Task bookkeeping archive publication requires a separately reviewed commit.
