# Implementation and Verification Plan

## State and Authority

Implementation and local validation complete; delivery mutations remain gated.
Repo castbox/Trellis; base main at f08ed655d800e6580e5fe950308ac1edfe74b10e;
branch codex/fix-cross-worktree-session-binding; checkout
/Users/wumengye/Documents/GoProjects/Trellis-session-binding-repro.
Formal creator/assignee: wesleywu. The separate codex-repro fixture is not this
formal task's delivery artifact and is excluded from the commit manifest.

Each Issue/task/branch/worktree/commit/push/PR/merge/cleanup mutation requires its own displayed repo, base/head, checkout, files, commands and expected effect followed by confirmation. Test helper commits/worktrees and teardown are side effects too: present the complete fixture lifecycle batch for explicit approval before running tests. Existing reproduction resources are excluded from automatic suite cleanup.

## Implemented File Set

The exact proposed commit file set is research/commit-files.txt, relative to the
repair checkout. It includes only approved implementation, tests, specifications
and this formal task's evidence. It is not commit authorization. Additional
files still require a reason and scope update before editing.

Python source root: packages/cli/src/templates/trellis/scripts/.
Files: common/session_storage.py (new), common/active_task.py, common/paths.py,
common/session_context.py, common/packages_context.py, common/task_store.py,
common/task_utils.py, task.py, get_context.py. Include exactly matching
.trellis/scripts/ twins for each changed Python file.

Platform files under packages/cli/src/templates/:

- shared-hooks/session-start.py
- shared-hooks/inject-workflow-state.py
- shared-hooks/inject-subagent-context.py
- codex/hooks/session-start.py
- copilot/hooks/session-start.py
- claude/hooks/statusline.py
- opencode/lib/trellis-context.js
- opencode/lib/session-utils.js
- opencode/plugins/inject-workflow-state.js
- opencode/plugins/inject-subagent-context.js
- snow/hooks/write-trellis-context.py
- pi/extensions/trellis/index.ts.txt
- omp/extensions/trellis/index.ts.txt
- trellis/index.ts (new module installation registration)

The pull-based context generator also changed:
packages/cli/src/configurators/shared.ts.

Tests under packages/cli/test/:

- scripts/cross-worktree-session.integration.test.ts (new)
- templates/cross-worktree-session.test.ts (new)
- commands/cross-worktree-update.integration.test.ts (new)
- templates/opencode.test.ts
- templates/pi.test.ts
- templates/omp.test.ts
- templates/snow-write-trellis-context.test.ts
- templates/session-runtime-history.test.ts
- templates/historical-context-boundary.test.ts
- configurators/shared.test.ts
- configurators/platforms.test.ts
- regression.test.ts

Documentation: .trellis/spec/cli/backend/identity-free-task-lifecycle.md,
.trellis/spec/cli/backend/workflow-state-contract.md, .trellis/workflow.md,
packages/cli/src/templates/trellis/workflow.md.

The initially missed .ts.txt native adapters and installation registration were
added only after explicit scope approval. No blanket template rewrite occurred.
Package JSON/lockfile, release manifests/changelogs/workflows, docs-site and
guru-trellis edits remain excluded. marketplace was initialized at its recorded
gitlink solely to satisfy existing tests; the gitlink was not changed.

## Steps

- [x] Read live authority and reproduce original cross-worktree failure.
- [x] Write PRD, design, plan, research and curated context manifests.
- [x] Obtain planning review and separately scoped formal task start approval.
- [x] Obtain initial and additional projection/product/test scope approvals.
- [x] Add real-Git A1-A7 and full hook/install A8 regression cases.
- [x] Implement Python storage/resolver/lifecycle and exact dogfood twins.
- [x] Update consumers, native JS parity and necessary platform projections.
- [x] Preserve the original manual red reproduction and obtain green regression results.
- [x] Run full validation and independent Trellis check review.
- [x] Update specs and local evidence; see research/verification.md.
- [ ] Obtain exact-file commit authorization.
- [ ] Obtain separate push and PR approvals; verify head and CI.
- [ ] Stop at PR ready for independent merge authorization.

Use Trellis implement/check agents after formal start and scope approval. Main
session owns planning, integration, specs and external mutations. Assign disjoint
file ownership for parallel workers; never authorize implicit commits, resource
creation or cleanup. Start with resolver/lifecycle dependencies before consumers.

Context validation reports two oversized source specs: script-conventions.md
(124559 bytes) and quality-guidelines.md (45525 bytes), above the 32768-byte
injection limit. Before implementation/check, agents must read the relevant
sections from the original local files explicitly; injected prefixes are not
complete guideline evidence. Do not alter global injection limits for this task.

## Regression Details

A1 creates a real temporary primary repository, establishes identity there,
creates a linked worktree and task, starts there, returns to primary and runs
resolver/current/get_context plus actual stdin SessionStart/workflow hooks.
Curate fixture manifests so normal start works without --allow-empty-context.

A2 exercises finish in primary, archive --no-commit from a third checkout,
rename, multi-session binding cleanup, task hook cwd and task-relative injected
content. A3 includes identical refs with different task contents. A4 uses an
independent common-dir with the same session key. A5 covers unique, multiple and
invalid legacy candidates, new precedence and no resurrection. A6 covers
unregistration, missing/unreadable/object-invalid metadata, malformed binding,
common mismatch, invalid containment and Git discovery failure. A7 preserves
non-Git and retired-alias behavior. Add paths with spaces and supported task
symlinks. Run Python/OpenCode parity on equivalent real fixtures.

Clear inherited session/project/env-file variables in test subprocesses. Do not
let tests modify the user's real shell environment bridge or real session key.
Report unexecuted Windows/Linux and minimum-Python runs as gaps.

## Validation Commands

After approval for test-owned temporary repositories, commits, worktrees and
teardown, run from the repair checkout:

```sh
pnpm build
pnpm --filter @mindfoldhq/trellis exec vitest run test/scripts/cross-worktree-session.integration.test.ts test/templates/cross-worktree-session.test.ts test/commands/cross-worktree-update.integration.test.ts
pnpm --filter @mindfoldhq/trellis test
pnpm --filter @mindfoldhq/trellis-core test
pnpm --filter @mindfoldhq/trellis typecheck
pnpm --filter @mindfoldhq/trellis-core typecheck
pnpm lint
pnpm --filter @mindfoldhq/trellis lint:py
git diff --check
```

Dependencies were installed with pnpm install --frozen-lockfile --ignore-scripts.
Core/CLI builds succeeded. Install/update smoke uses built CLI in isolated projects: clean
install, legacy-binding upgrade, enabled-platform reapply, cross-root lifecycle
and repeated update. Read live CLI help to finalize commands before execution.
Verify no required runtime remains .new-only, versions unchanged, Python twins
synchronized and retired data unconsumed. Follow live CI's minimum Python 3.9
validation if the interpreter is available; otherwise report the gap. The
executed commands, totals and interpreter boundary are recorded in verification.md.

## Evidence and Delivery

Record command/exit/test totals/environment/failures. Compare both package.json
files and lockfile with baseline; record final commit and PR head. Snapshot
remote tags/Releases around authorized external operations. Distinguish this
session's no-publish record from proof about unrelated actors' npm activity.
No publish/dist-tag/tag/Release/manifest/changelog command is allowed.

Verify exact-SHA source build before offering downstream install commands. Do
not claim a Nightly artifact or final merged SHA without evidence. Return to
design review if semantics change materially. Preserve unrelated work and the
reproduction fixture; cleanup, discard or reset is never implicit.

The local source-build recipe was exercised on the working-tree candidate.
There is not yet a committed candidate SHA or an independently rebuilt clean
checkout at that SHA. Do not describe the original base SHA as the fix.
