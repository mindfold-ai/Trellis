# Implementation and validation plan

## Entry conditions

Review PRD, design, research and both context manifests. Keep this Task in planning until native artifact review and implementation approval are complete. Creation/selection is not activation.

Main session owns planning, context curation, spec integration and Git boundaries. After activation, dispatch native `trellis-implement`, then full-scope `trellis-check`. Each dispatch starts with the exact `Active task:` path, states its role and prohibits recursive implement/check dispatch. No product code changes belong to this planning step.

Context validation reports that `quality-guidelines.md` and `script-conventions.md` exceed the installed 32768-byte per-file injection limit. Both agents must read these original files completely through bounded reads before relying on them; truncated native injection is not a complete load. Do not change injection settings or replace the specs with shortened copies. The dispatch must repeat this loading requirement.

## Ordered work

| Step | Files and responsibility | Completion observation |
| --- | --- | --- |
| U1 | `packages/core/src/task/maintenance.ts`, `migration-v2.ts`; private `migration-projection.ts` only if needed | Separate formal projection validator, shared pure rules where needed, unchanged ordinary public migration semantics. |
| U2 | `packages/cli/src/commands/maintenance/tasks.ts` | Separate closed inputs, exact Git/archive checks, receiptless provenance lookup and retained-reference validation. |
| U3 | `packages/cli/src/commands/maintenance/shared.ts` | New plan guard/result variant, original fixed-operation replay and rollback checks for output-generation later work. |
| U4 | `packages/cli/src/commands/maintenance/api.ts`, `command.ts`; verify `packages/cli/src/index.ts` namespace | Public exports/CLI wiring and additive capability. No Core root wildcard or deep import. |
| U5 | Existing readers in `packages/cli/src/templates/trellis/scripts/common/`, matching dogfood twins, and `packages/core/src/task/v2/store.ts` identity reservation | Real rename exposed retained-predecessor collision. Fix the narrow relocation read boundary in native and SDK owners, with Python 3.9/parity evidence; no second converter or create reservation relaxation. |
| U6 | `.trellis/spec/cli/backend/commands-maintain.md`, relevant Core SDK/Delivery lifecycle spec | Document the three routes, actual I/O, provenance, reference resolution and recovery/rollback semantics. |
| U7 | Tests below and one representative paired installation | Satisfy AC1–AC7 and existing maintenance regressions. |
| U8 | Full-scope Check, spec decision, exact native commit plan | Report actual evidence and limits. Commit/push/PR/merge remain separate; no automatic Guru source-lock adoption. |

U1 precedes U2/U3. U2–U4 form one usable public capability. U5–U7 complete native/package proof before final Check. A material design change returns to planning; do not silently substitute a different lifecycle route.

## Acceptance matrix

| Test | Location and behavior | Acceptance |
| --- | --- | --- |
| U-T1 | New `packages/core/test/task/formal-archive-reactivation.test.ts`: supported schema1, exact increment, identity/tree/source/history preservation, no current Delivery or inherited gate/Completion/Closure. Existing migration tests retain preserve-generation behavior. | AC1 |
| U-T2 | New `packages/cli/test/commands/maintenance-formal-reactivation.integration.test.ts`: real Git archive/target, inspect/prepare/preview zero writes, bounded apply, archive bytes/modes/empty directories and old local records preserved. | AC2 |
| U-T3 | Same CLI suite: fixed-operation apply/recover/resume, lost output and ordinary partial replay using existing engine helpers. One increment and one operation. | AC3 |
| U-T4 | Receiptless lookup after apply and after real later native completion/reopen. Normal conflicting sources return facts/diagnostics. Original operation result remains fixed. | AC3 |
| U-T5 | Real target advancement, missing archive reachability, original active presence, ordinary source changes and legitimately occupied destination. Unrelated work remains intact. | AC4 |
| U-T6 | Rollback before later work; separate real native Task/scope/session/binding/Delivery updates prove refusal afterward. Old-generation resources remain intact. | AC5 |
| U-T7 | Existing Core maintenance/migration and CLI maintenance tools/tasks/resume/engine/native Delivery suites; public capability and export/command wiring. Pure Core assertions are not duplicated in CLI. | AC6 |
| U-T8 | One actual matching packed CLI/Core installation, public prepare/apply and native `task.py start/current`, `get_context.py --mode continuation`, `delivery.py apply` with real `accept_scope`, actual supplement file and declared task-scope owner. Read back key/history and no dummy Delivery. | AC7 |

Reuse existing real-Git fixtures and public-bin/native patterns. `release-preflight.js` demonstrates packing and exact dependency rewrite, while `native-python-regression.mjs` exercises a built source checkout. Neither is itself a complete paired installation helper. U-T8 must pack the actual Core and CLI and install both local tarballs in one isolated prefix, avoiding an older same-version Core from the registry. Temporary fixtures that delete `.git` immediately must disable automatic Git maintenance locally, as current test guidance requires. Preserve fixture provenance versus genuine historical data. Do not add attack/tamper/stress cases; running existing regressions does not expand this Task's accepted scope.

## Planned checks

The following commands define required checks. Report actual run results separately; listing a command is not evidence that it passed:

```sh
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis-core test test/task/maintenance.test.ts test/task/migration-v2.test.ts test/task/formal-archive-reactivation.test.ts
pnpm --filter @mindfoldhq/trellis test test/commands/maintenance-formal-reactivation.integration.test.ts test/commands/maintenance-resume.integration.test.ts test/commands/maintenance-tasks.integration.test.ts test/commands/maintenance-engine.integration.test.ts test/commands/maintenance-tools.integration.test.ts test/scripts/maintenance.integration.test.ts test/scripts/delivery-v2.integration.test.ts
pnpm --filter @mindfoldhq/trellis test test/scripts/task-identity-source.integration.test.ts test/scripts/task-archive.integration.test.ts test/scripts/delivery-location.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm build
git diff --check
```

During final Check, also execute Core package lint/typecheck and affected package-index checks. Use actual packed packages and the public bin for U-T8, recording package paths/build identity. Coordinate at most one representative installation sample with Guru #635; do not expand to the full release/platform matrix.

## Risks and recovery

- Historical attribution and readable references are real prerequisites. Status or fabricated current Completion cannot replace them.
- Shared projection extraction can regress old migration; retain its signature and run existing tests.
- Manual resume's result guard assumes preserved generation. Keep the new kind explicit through serialization/replay/result recovery.
- Receiptless successor inspection does not expand a frozen operation to the newest generation.
- If native readers already support the new Task v2, leave source unchanged but still execute U-T8.
- Do not migrate unrelated archives to make installation pass. Separate environment/dependency blocks from test failures.

After upstream delivery, pass exact source/build/capability/CI facts to the original Guru source owner. Guru resumes the existing #635 Task/D1 after provider adoption and original planning gates. This Task cannot close #635 or certify its private lifecycle.

## Shared-snapshot correction after PR #55

Guru #635 integration reproduced a normal R4/AC3 gap in the merged provider: registered siblings containing the same active Task snapshot caused `inspectFormalArchiveReactivation` to report `ambiguous_authority`, even when the selected root contained the valid successor. Continue the original Task and accepted requirements; the earlier validation below does not cover this correction.

1. In `packages/cli/src/commands/maintenance/tasks.ts`, resolve and validate the selected root successor before sibling checks. Reuse `successorAt` for sibling provenance, retained-source and intermediate-Completion checks. Permit verified snapshots of the same formal predecessor at an equal or earlier generation. Preserve absent-root, newer-sibling, mismatched-source and local-multiple-candidate conflicts. Keep public inputs/outputs, conversion writers and fixed-operation recovery unchanged.
2. Extend `packages/cli/test/commands/maintenance-formal-reactivation.integration.test.ts` with real registered Git checkouts. Cover the same shared snapshot, normal same-generation business progress, a later root generation with an earlier sibling snapshot, receiptless lookup without another conversion, and retained genuine conflict behavior. Observe root and sibling bytes around read-only inspection. Do not add a Guru C4 dependency, content-merging algorithm or extra failure matrix.
3. Run the affected formal/archive-resume/task/engine maintenance integration tests, repository lint/typecheck and matching Core/CLI build. Reuse unaffected prior evidence only for its original coverage. The independent Check owner reviews the complete correction and affected consumers. Report candidate-package behavior separately from merged source adoption and downstream Guru V1–V8.

These steps modify the two named CLI source/test files, this Task's design/implementation bodies and the existing `.trellis/spec/cli/backend/commands-maintain.md` contract. The code-spec records the shared-snapshot rule in its current inspection/error/test sections. Build output is ignored package `dist`. These steps do not publish, install, change Task/session state or update the downstream source lock.

### Correction validation outcome

The independent Check passed for the complete five-file correction and the affected inspect, prepare, recovery and Guru successor-location consumers. No findings remain. The review identified one spec wording error: predecessor mismatches retain `successor_mismatch` or their original specific diagnostic. The spec now states this correctly.

- All 65 targeted integration tests passed: 19 formal-reactivation tests and 46 existing resume, task and engine tests. Repository lint, typecheck, matching Core/CLI build and `git diff --check` passed.
- Two independent Guru fixture scenarios passed against the actual built `local_candidate` SDK: a main checkout sharing the successor snapshot, and an old root retaining only the archive while the linked checkout held the successor. After both Guru and public maintenance receipts were removed, the original owner located the canonical linked checkout with one real inspect call. Neither scenario prepared or acquired another checkout. Generation stayed at 1; Task data, binding, resource ledger and both roots' `.trellis` bytes/modes remained unchanged. The receipts were not recreated.

These results cover the current source correction and local candidate integration. They do not establish remote delivery, formal source-lock adoption, an actual Guru session/Bind run, downstream V1–V8 acceptance or the full installation/platform matrix. Unchanged native-reader and installation evidence below retains its original coverage only.

## Prior validation outcome at 86de668

Full-scope quality Check passed for R1–R7 and AC1–AC7, including all changed and new files, public contracts and affected native consumers. No residual product findings remain. Check required no source, test or spec fixes.

- Full Core suite: 493 passed, with one pre-existing no-Python placeholder skipped because Python/sqlite3 was available; the actual SQLite fixture tests ran.
- Full CLI suite: 2398 initially passed. Its single failure came from the uninitialized `marketplace` submodule. After checking out the existing pinned gitlink, the affected template suite passed all 29 tests. No product change was needed.
- Root lint/typecheck/build, Core typecheck and Python typecheck passed. Python typecheck reported zero errors and 48 existing warnings. Actual Python 3.9.6 compiled all 121 tracked Python files; all 36 shipped/dogfood script pairs were byte-identical. Whitespace checks passed.
- U-T8 passed using one installation of the actual matching CLI/Core tarballs. Public inspect/prepare/preview left the target unchanged; apply retained real historical delivery and created generation 1 once. Native selection/continuation and a real scope supplement succeeded without a current Delivery or manufactured Completion/Closure. Original recovery and successor inspection without the private receipt passed. A driver-only obsolete init flag was corrected in the same prefix before these assertions.

The installation sample covers one macOS Codex/native profile and a generated real-Git fixture. It does not establish original Guru archive acceptance, downstream source adoption, remote delivery or the full release/platform matrix.
