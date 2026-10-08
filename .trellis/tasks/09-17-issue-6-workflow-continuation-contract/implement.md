# Implementation plan: Issue #6 continuation contract

Implementation starts only after the user approves this planning summary and
`task.py start` successfully binds the task.

## 1. Load implementation context

- Load `trellis-before-dev`/injected sub-agent context.
- Re-read Issue #6 and record the approved scope correction before code
  changes; do not claim marketplace migration as delivered.
- Confirm the checkout/branch target and preserve unrelated worktree changes.
- Run the focused baseline tests for workflow templates, runtime phase parsing,
  workflow command integration, and cross-worktree session behavior.

## 2. Add the structural extractor

- Add the continuation parser module to the shipped Trellis Python templates.
- Mirror it into the dogfood `.trellis/scripts/common/` tree.
- Add `continuation` to `get_context.py`/`common/git_context.py` CLI mode.
- Emit stable `invalid_continuation_contract` diagnostics with workflow path and
  structural subtype.
- Keep continuation mode in the invocation repository; do not switch to the
  bound task workspace.

Focused validation:

```bash
pnpm --filter @mindfoldhq/trellis test -- regression.test.ts
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
```

## 3. Migrate root native workflows

- Add one native continuation contract to the bundled and dogfood workflows.
- Replace active-task breadcrumb route details with a requirement to load the
  continuation contract while retaining broad lifecycle guidance.
- Add template assertions for exactly one valid non-empty block in bundled and
  dogfood native and for the named native continuation routes.
- Restore the `marketplace` gitlink to
  `7d5298d16e07c328c09493eed1f0652571744b17`; do not modify or release
  marketplace workflow content.

## 4. Thin the canonical entries

- Rewrite `common/commands/start.md` and `continue.md` to use exact current-task
  facts plus `--mode continuation`.
- Make continue emit `no_current_task` on an empty exact binding.
- Remove all workflow-specific status/artifact route rows and inventory-based
  task selection guidance.
- Update shared skill/command descriptions to match the new behavior.
- Verify every platform projection carries the canonical behavior.

## 5. Preserve init/update/switch semantics

- Extend workflow resolver/command tests with a valid custom continuation
  fixture distinct from native.
- Prove fresh init, native update, non-native switch, immediate re-read,
  modified-file `.new`, and `.new` exclusion.
- Do not add a production TypeScript semantic route table or content cache.
- Preserve the existing fixture/mock workflow switch tests; they prove the
  general protocol without making external marketplace content part of this
  candidate.

## 6. Cover task authority and recovery boundaries

- Assert each named legacy native route against both root-owned native workflow
  copies.
- Extend no-binding tests so project inventory cannot select a task.
- Extend stale/conflict/ambiguous cases so continuation is not executed.
- Extend linked-worktree coverage so task facts come from the bound workspace
  while continuation comes from the invocation repository workflow.
- Add semantic-neutrality assertions for extractor/hooks/entries.

## 7. Update Trellis Meta and specs

- Remove the `trellis-meta` instruction to synchronize `/trellis:continue`
  route tables.
- Document continuation as workflow-only semantic authority and extraction as
  structural/read-only.
- Update `commands-workflow.md`, `workflow-state-contract.md`, and
  `platform-integration.md`; update `script-conventions.md` only if the new
  parser introduces a reusable Python error/CLI pattern.

## 8. Quality gate

Run focused tests first, then the repository gates required by the affected
specs:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm lint:py
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
```

Also run targeted commands against fixture repositories for:

```bash
python3 .trellis/scripts/get_context.py --mode continuation
python3 .trellis/scripts/get_context.py --mode phase
```

Report exact pass/fail counts and any environment-related skips separately.

## 9. Review and finish

- Dispatch `trellis-check` for full-scope verification.
- Resolve findings without expanding into Guru Team Issue #419.
- Run `trellis-update-spec` for durable contracts learned during implementation.
- Present the final diff and validation evidence before any commit/push/PR
  action; those side effects require separate authorization.

The final report must state that marketplace workflow migration remains outside
this candidate and that it does not block `castbox/guru-trellis#419`, whose
preset consumes no marketplace workflow components.

## Rollback points

- Steps 2-4 form one root-native protocol unit; do not ship only the extractor,
  only entry thinning, or only native workflow blocks.
- Test/doc refinements can be reverted independently if they do not weaken the
  protocol gate.
- No persisted schema or user data requires migration rollback.
