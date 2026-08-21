# Implementation plan: Full reversible Trellis ablation

1. Read CLI backend/unit-test specs and this task's research context.
2. Re-index GitNexus and run upstream impact on every existing symbol before
   editing; report high/critical risk and stop if found.
3. Extract the shared managed-removal planner/structured registry from
   uninstall without behavior change.
4. Run uninstall scrubber, integration, dirty-guard, and over-delete suites.
5. Add strict external transaction state, project/path validation,
   non-dereferencing backup, fingerprints, atomic transitions, conflicts, and
   exact restore primitives with unit tests.
6. Add ablate/restore orchestration and CLI registration with dry-run,
   confirmation, rollback, verification, and fresh-session guidance.
7. Add full integration/error/recovery tests and preserve uninstall regression
   behavior.
8. Add backend spec plus relevant README/docs-site English/Chinese docs. Do not
   document selective or release syntax.
9. Run focused tests, `pnpm lint`, `pnpm typecheck`, `pnpm test:cli`,
   `pnpm build`, spec checks, `git diff --check`, filename-only secret scan,
   and GitNexus `detect-changes` against `main`.
10. Run independent Trellis check, fix confirmed findings, and rerun the gate.
11. Build the CLI and validate dry-run/ablate/restore/conflict in disposable
    CastForge worktrees with an isolated external state root.
12. Run sequential same-prompt ephemeral Codex control/treatment trials from
    the same CastForge revision; compare deterministic results, application
    diffs, time/usage/tool metrics, interventions, and workflow behavior.
13. Update #530, commit, push the feature branch, and open a draft PR only after
    all checks and cleanup succeed.

## Required focused commands

```bash
pnpm --filter @mindfoldhq/trellis test -- test/utils/uninstall-scrubbers.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/commands/uninstall.integration.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/commands/uninstall-dirty-guard.integration.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/commands/init-uninstall-overdelete.integration.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/utils/ablation-store.test.ts test/commands/ablate.integration.test.ts
pnpm lint
pnpm typecheck
pnpm test:cli
pnpm build
git diff --check
```

## Rollback

- Feature tests use temporary projects/state roots only.
- Local project validation uses disposable worktrees only.
- Retain transaction backups until verified restore.
- Abandon the clean feature worktree/branch if necessary; never reset or clean
  an occupied canonical checkout.
