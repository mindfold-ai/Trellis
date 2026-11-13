# Execution plan: Plan2 registered worktree copies

## Status

Implementation approved and task activated on 2026-10-13. Implementation, independent review, local commit and PR publication/merge are complete. The exact merged candidate passed main CI. Task archived on 2026-10-13; archive bookkeeping is pending its own commit/publication. Original business workspaces remain read-only. Verification results are recorded below.

## Ordered implementation

1. **Regression (AC1–AC4):** extend `packages/cli/test/commands/migrate2.integration.test.ts` with real tracked inherited Tasks committed before sibling creation, two bound branches, common sessions, differing branch planning and modes. Demonstrate pre-fix collision with legal convert/defer choices. No private business data.
2. **Schema/preflight (AC1, AC2, AC4):** modify `migration2-schema.ts` and `migration2.ts` for optional strict binding snapshots, fixed preserve paths, canonical-root/Task-directory uniqueness, complete validated groups and unique checkout authority. Keep Core projection and single-entry projected map.
3. **Sessions/recovery (AC3–AC5):** enforce binding alignment, preserve peer artifacts, recheck authority before writes; verify completed/ordinary-failure partial replay, third states and exact rollback.
4. **Public spec (AC6):** update `.trellis/spec/cli/backend/commands-migrate.md`; only directly inconsistent cross-references in task/delivery specs need changes.
5. **Installed proof (AC1–AC6):** build/pack CLI with matching Core, install temporary candidate, invoke shipped migration CLI and installed Python current-task/runtime-contract/continuation in controlled synthetic predecessor workspaces. Record source revision or dirty digest, tar/plan hashes, zero-write snapshots, modes and exact identities.
6. **Quality/review:** run required checks and full-diff review against every requirement/AC; fix findings, rerun affected/required checks and record actual evidence. No business cutover claim.

## Behavioral matrix

| Case | Assertion |
| --- | --- |
| Two inherited Tasks; mutable branch variants; plan order permutations | Zero-write preview; only bound copies convert; peer bytes/modes intact. |
| Matching schema-1 defer plus current authority; known legacy default0 | Unique installed selection and strict source/generation validation. |
| Missing/malformed/extra/duplicate/unknown binding; wrong identity/revision | Closed validation fails without writes. |
| Detached/absent/wrong-peer branch; topology/checkout drift | Authority failure including final pre-write recheck. |
| Binding bytes/mode/deletion/symlink drift | Preview error/conflict; execution/retry zero writes. |
| Case/generation/source mismatch; root/directory alias; archive/history occupation | Copy exception denied. |
| Two authorities/all-defer; omitted inventories; peer future artifacts | Collision/completeness/ownership protection retained. |
| Common sessions from both checkouts; direct deferred selection | Bound current identity/continuation; deferred direct selection blocked. |
| Preserved sessions and later stale binding | Raw preservation; no inference; existing runtime errors. |
| Complete/partial replay, third state, exact rollback | Idempotency without preserve rewrites; original snapshot restored. |
| Unique-ID plan without binding; selected Task with live binding | Compatibility for former; reviewed aligned snapshot for latter. |
| Unique-ID without binding, marker absent everywhere versus marker present in invocation/sibling root | Native compatibility positive; existing public binding-required boundary rejects with zero writes. Recheck marker predicate changes before mutation. |
| Git-free unique identity, marker present and no binding rows | Existing marker bypass remains compatible; supplied binding rows reject. |

Use table-driven mutations where setup is shared; assert public behavior, not helper structure. Include preserve-null absence and overlapping storage aliases.

## Validation after implementation approval

```bash
pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts test/commands/migrate.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm build
pnpm test
python3 .trellis/scripts/task.py validate .trellis/tasks/10-13-plan2-worktree-copies
```

Inspect current CI interpreter requirements before minimum-Python claims; environment skips are not passes. Then pack/install/rehearse exact candidate. Implementation approval excludes commit, push, PR, merge, release and business installation switching.

The public installed entry is registered at `packages/cli/src/cli/index.ts:157`, dispatching schema 2 through `commands/migrate.ts:180`. From each controlled workspace, use the exact temporary installed binary (replace the example absolute paths with recorded fixture paths):

```bash
node /tmp/plan2-candidate/node_modules/@mindfoldhq/trellis/bin/trellis.js migrate --from 0.7.0-castbox.3 --plan /tmp/plan2-reviewed.json --dry-run
node /tmp/plan2-candidate/node_modules/@mindfoldhq/trellis/bin/trellis.js migrate --from 0.7.0-castbox.3 --plan /tmp/plan2-reviewed.json
python3 .trellis/scripts/task.py current --source
python3 .trellis/scripts/get_context.py --mode runtime-contract
python3 .trellis/scripts/get_context.py --mode continuation
```

Set the controlled session identity using the existing public context mechanism and record it; do not depend on the host chat's session or private wrapper. The incoming failure used an installed module call, so it is defect evidence rather than proof that the public CLI rehearsal passed.

Context validation warns that `quality-guidelines.md` exceeds the injection byte cap. Implement/check owners must read that file in full from disk instead of relying on truncated injected context.

## Risks/checkpoints

Frozen sources must drive grouping during partial replay. Raw binding equality cannot prove current checkout: test change between initial preflight and mutation. No original-tree writes. If Core/Python changes become necessary, revise planning before expanding scope.

## Execution outcome

All six acceptance criteria have local source/installed evidence in [final-verification.md](research/final-verification.md). The implementation and independent check owners completed the CLI schema/executor/tests and reviewed the complete candidate. The checker corrected one negative fixture to exercise its intended collision guard; no product defect remains. The public migration spec contains the complete binding/copy/preflight/replay contract. No Core/Python product changes or scope expansion were needed.

Required checks: lint, TypeScript types, Python types (0 errors, 48 existing warnings), Python 3.9.6 syntax for all 89 tracked files, build and context validation passed. Three targeted files passed 142 tests. Complete Core passed 475 tests with one existing optional skip. Complete CLI passed all 2,225 tests in 99 files with one worker and the unchanged 10-second timeout; earlier default/four-worker timeout runs remain recorded as failures. Packed installed rehearsal and independent evidence audit passed, including zero-write preview/rejection, four runtime routes, actual partial-write recovery, completed replay and exact rollback.

Source/pack/plan hashes and all AC evidence are recorded in the final verification report. The source manifest before build, after packing and after checks is identical. Original business trees, Issue #31 and downstream tasks were not mutated. The reviewed local commit `1e40014023de53ddfd9368b3fb4d0a7a31e92293` was published in PR #36 and squash-merged as `a5eb8b2dfd32b41e30d9bbf1c3ba8f98bcaf1258`; both PR and exact main CI passed. See [closeout.md](research/closeout.md) for live delivery facts and archive disposition. Release validation is not claimed.
