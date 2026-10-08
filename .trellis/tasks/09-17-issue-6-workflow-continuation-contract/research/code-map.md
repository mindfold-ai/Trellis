# Issue #6 repository code map

Captured on 2026-09-17 from the live Issue contract and current repository
state. This is a navigation aid, not a replacement for the source files.

## Canonical entry generation

- `packages/cli/src/templates/common/commands/start.md` is the canonical
  `trellis-start` body. It currently contains active-task routing based on
  status and planning artifacts.
- `packages/cli/src/templates/common/commands/continue.md` is the canonical
  `trellis-continue` body. Its Step 3 is the legacy status/artifact route table
  that Issue #6 removes.
- `packages/cli/src/configurators/shared.ts:239` owns generated skill
  descriptions; `COMMAND_DESCRIPTIONS` starts near line 281.
- `resolveAllAsSkills`, `resolveCommands`, and platform collectors project the
  common templates. `packages/cli/src/configurators/index.ts:222` exposes
  `collectPlatformTemplates`, which is the registry-wide test surface.

## Runtime extraction

- `.trellis/scripts/get_context.py` and
  `packages/cli/src/templates/trellis/scripts/get_context.py` resolve the exact
  active task before delegating CLI parsing. They only change to the task
  workspace for `--mode phase`; continuation must stay in the invocation repo.
- `.trellis/scripts/common/git_context.py` and the template twin own `--mode`
  choices and dispatch. Current choices are `default`, `record`, `packages`,
  and `phase`.
- `.trellis/scripts/common/workflow_phase.py` is limited to Phase Index/step
  extraction and platform filtering. A separate continuation module keeps the
  new structural protocol from becoming a semantic phase router.
- Existing regression coverage for `--mode phase` begins around
  `packages/cli/test/regression.test.ts:7339`.
- Template/dogfood Python byte identity is enforced near
  `packages/cli/test/regression.test.ts:11291`.

## Root-native workflow and external registry boundary

- Bundled native workflow source:
  `packages/cli/src/templates/trellis/workflow.md`.
- Dogfood native workflow: `.trellis/workflow.md`.
- The root `marketplace` gitlink baseline is
  `7d5298d16e07c328c09493eed1f0652571744b17`. Marketplace workflow content is
  not owned or migrated by this candidate.
- External marketplace/custom workflow authors must add a valid continuation
  block before active-task resume. Runtime extraction fails closed when they do
  not.
- `packages/cli/src/utils/workflow-resolver.ts` resolves bundled and marketplace
  workflows but should not gain workflow-semantic routing.
- `packages/cli/test/commands/workflow.integration.test.ts` covers native init,
  marketplace init/switch, update preservation, and `.new` conflict behavior.
- `packages/cli/test/templates/trellis.test.ts` covers root template invariants
  and is the right place for bundled/dogfood native structural and named-route
  checks.
- `castbox/guru-trellis#419` is not blocked by marketplace workflow migration:
  its preset consumes no marketplace workflow components.

## Session binding and linked worktrees

- The active-task resolver remains out of scope. Continuation consumes its
  exact task identity, task workspace, and repository identity.
- `packages/cli/test/templates/cross-worktree-session.test.ts` exercises
  installed entry/hook behavior with a task in a linked worktree.
- `packages/cli/test/scripts/cross-worktree-session.integration.test.ts`
  exercises resolver outcomes and persistent session binding behavior.
- Issue #6 requires task facts from the linked binding but continuation text
  from the invocation repository's current `.trellis/workflow.md`.

## Trellis Meta

- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-workflow.md`
  currently tells workflow authors to synchronize a `/trellis:continue` route
  table. That section must be replaced by the continuation-block ownership
  rule.
- `references/local-architecture/workflow.md` and
  `references/platform-files/skills-and-commands.md` describe the relationship
  between workflow and platform entries and must remain consistent.

## Required validation focus

1. Structural parser matrix: valid, missing, duplicate, empty, unclosed,
   missing-open/mismatched, and nested.
2. No legacy status/artifact route rows in generated start/continue entries.
3. Exact no-binding behavior (`no_current_task`) without inventory selection.
4. Stale/conflict/ambiguous binding stops continuation.
5. Linked task facts plus invocation-workflow continuation.
6. Immediate workflow-switch behavior with no cache or `.new` fallback.
7. Bundled/dogfood native workflow parity and Python script twin parity.
8. Existing fixture/mock workflow switch coverage remains intact without
   reading real marketplace workflow files.
