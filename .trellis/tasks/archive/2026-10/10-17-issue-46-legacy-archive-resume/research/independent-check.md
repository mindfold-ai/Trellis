# Independent quality check

Reviewer: Trellis check subagent, whole Issue #46 diff plus untracked new tests,
live Issue, Task PRD/design/plan, package specs and public maintenance contract.

No implementation findings; no reviewer edits. Reviewed generation/history/gate
separation, archive/source/destination and former-path ownership, identity
collisions, native continuation/actual next public consumers, carrier freshness,
fixed replay and later-work-safe rollback. No Python/templates changed.

## Final completed checks
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS; final source/build frozen before final packaging.
- Core complete suite: 28 files; 484 passed, 1 existing skipped.
- `pnpm --filter @mindfoldhq/trellis exec vitest run --maxWorkers=2`: PASS;
  all 107 files and 2369 tests.
- `git diff --check`: PASS.
- Parent Python `lint:py`: 0 errors, 48 existing unused import warnings.

## Initial full default-concurrency run
Core passed; CLI had 2366 passes and 3 failures: 10s timeouts in existing
`migrate2.integration.test.ts` inherited-copy reverse=true and `omp.test.ts`
selected-v2 cross-worktree context, plus ENOTEMPTY during temporary fixture
cleanup in `task-archive.integration.test.ts`. Complete reduced-worker rerun
passed unchanged; no runner/test workaround was committed. CI remains an
independent default-runner check, recorded with PR delivery.

## Separate evidence
Parent owns final exact packed CLI/Core install/native verification. Guru #577
owns private original-owner/Markdown integration and joint semantic acceptance;
this check does not claim those downstream results.

## Subsequent default-runner proof
Source commit pre-commit hook ran complete `pnpm test` at the unchanged default
concurrency: Core 484 passed/1 skipped and CLI 2369 passed. No test or runner
changes were needed. Final committed-source rebuild matches the installed pair.

Documentation commit hook rerun encountered the same `task-archive` temporary
fixture `ENOTEMPTY` cleanup flake after 2368 CLI passes. It is retried with
`VITEST_MAX_WORKERS=2`, still running the entire unmodified hook/suite; no bypass
or source/test workaround. Source commit default-concurrency pass remains valid.

The two-worker documentation hook still hit the same cleanup flake. Inspection
of both failed synthetic directories found only recreated empty
`.git/objects/pack` directories, consistent with detached Git maintenance racing
fixture removal. Command-local `gc.autoDetach=false` and
`maintenance.autoDetach=false` make maintenance foreground without disabling it.
The unmodified archive suite then passed 6/6. The documentation hook is rerun in
that process-only environment; repository/global Git config is unchanged.
