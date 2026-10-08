# Execution plan

## Preconditions

- Review PRD/design; activate only after planning review.
- Recheck live #29, exact branch/checkout and task identity.
- Load manifest-listed specs and reproduce mixed-header failure in an isolated
  fixture. Do not mock the official writer or modify real historical worktrees.
- Native context injection truncates the large script-conventions and quality
  guidelines files. The child must directly read the relevant checked-I/O,
  two-script-tree, Python compatibility and routing-consumer sections before
  changing code; truncated injected text is not complete spec evidence.

## Ordered work

1. Refactor internal checked JSON decoding and add the minimal TaskId reservation
   projection with precise invalid-id diagnostics in canonical `common/io.py`.
2. Switch `task_utils.task_id_collisions`; preserve path/active/archive policies
   and inspect creation's Git-ref and target-directory checks.
   Move `ensure_tasks_dir` after completed preflight checks so rejected creation
   does not add an archive directory; cover normal creation from an absent root.
3. Switch `session_storage.resolve_task_identity` to identity selection followed
   by strict matching-record reads. Preserve workspace/duplicate/generation rules.
4. Remove unused Python legacy scan classifier/reader only after consumer search;
   retain Core migration classification. Verify rename/archive still validate
   selected records before uniqueness.
5. Mirror only changed Python twins to dogfood. Update directly affected specs.
6. Revise the existing test requiring unrelated source/generation/unknown fields
   to block creation. Separate identity errors from selected-record rejection.
   Add actual mixed-worktree, field-independence, preservation and resource cases.
7. Run the Trellis check agent on the complete candidate and resolve findings.

## Expected paths

- Canonical `packages/cli/src/templates/trellis/scripts/common/{io,task_utils,session_storage}.py`
  and their exact `.trellis/scripts/common/` twins.
- `task_store.py` / `active_task.py` only for directly affected error/call sites;
  no ownership algorithm redesign.
- `packages/cli/test/scripts/task-identity-source.integration.test.ts` and
  `cross-worktree-session.integration.test.ts`, directly affected regressions.
- `.trellis/spec/cli/backend/task-lifecycle.md` and the native scanner paragraph
  of `commands-migrate.md`.

## Validation

If workspace dependencies are absent, use `pnpm install --frozen-lockfile`.
Report environment/dependency failures rather than a pass.

```sh
pnpm --filter @mindfoldhq/trellis exec vitest run test/scripts/task-identity-source.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts test/scripts/task-meta.integration.test.ts test/scripts/task-archive.integration.test.ts test/commands/migrate.integration.test.ts
pnpm --filter @mindfoldhq/trellis exec vitest run test/regression.test.ts
pnpm --filter @mindfoldhq/trellis-core test
pnpm lint
pnpm typecheck
pnpm build
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
git diff --check
```

Run clean temporary-project init with built CLI, then actual shipped
create/start/session resolution beside a mixed historical sibling worktree.
Snapshot historical bytes/modes and task/session/branch resources before and
after success/rejection. Fixture owners clean only test-owned disposable data.
Check modified non-generated files against the 3000-line limit.

## Completion boundary

Map evidence to PRD acceptance scenarios and distinguish source, installed and
Guru integration results. Missing evidence is not passing. Update specs before
proposing commit. Commit/push/PR/merge, release, Guru source-lock changes, business
installation and old-resource cleanup require their own exact scope.

Current status: planning candidate; no implementation/test completion.
