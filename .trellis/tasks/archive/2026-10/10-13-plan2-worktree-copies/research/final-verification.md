# Final verification: Plan2 registered worktree copies

Date: 2026-10-13. Base: `780819aa98057038a7d6e21b5d66c11d61c23518`, branch `main`. This is implementation/quality evidence for the activated legacy Task, not a formal Delivery lifecycle result. Commit and publication remain unauthorized. Issue #31 stays closed; no downstream or joint acceptance is required.

## Candidate identity

The four tracked changes are the migration specification, Plan2 schema/executor and migration2 integration tests. No Core/Python product files changed. The final test fixture includes the independent checker's same-workspace collision correction.

| Input | SHA-256 |
| --- | --- |
| Migration specification | `0ee123a93712fb52016eade2ce9e1ce30823e78c932ad5e62bbf4a85df7fc50b` |
| Plan2 schema | `baf5d7f62b4ff6e16a6f32f9e75dc18f41652539ba4da1f0e99244076d1664ee` |
| Plan2 executor | `70ae76e4e504a0f60e5753b38a3a7cebb6afcb5b66ef5bfb319378b24165659a` |
| Migration2 integration tests | `2ada5d51874741577c14244a2aa08e5c99b5197d42f5dbf5c05b031a086edf94` |
| Complete four-file tracked diff | `da2d84d1431d7278bb1776e48785e6f86fffe758985850b61532a83876a2db1d` |
| Source manifest, excluding Task documents | `17ea37fbfcfe81a7e2c43f223cacdeee6ebd4c90cd28fff74c143a75bebd1a50` |
| Packed CLI | `185ed1db6865b72138bb10b6d799225721bf50fddfb370f84d8ec330558f472d` |
| Packed Core | `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967` |
| Installed reviewed plan | `5c14bec56c837c88355ed8219c7e9d62549d8a1e1e58db522a6052035e580f83` |

The 1,257-entry manifests before build, after packing and after quality checks agree exactly. Both packages are `0.7.0-castbox.3`; the packed CLI pins that exact Core version. The independent checker compared all 713 CLI and 270 Core regular packaged files against installed bytes and modes.

## Acceptance evidence

| AC | Actual evidence |
| --- | --- |
| AC1 | Installed-only fixture commits two synthetic predecessor Tasks before sibling worktree creation. Opposite checkout bindings and complete reviewed inventories preview 120 actions without changing any of the 132 initial snapshot entries. The old installed binary independently reproduces the identity collision without writes. |
| AC2 | Only each bound authority converts. Opposite deferred records, branch-local planning, raw permissions and the two binding preserve actions remain exact, with no peer migration/Delivery artifacts. |
| AC3 | Installed Python 3.9.6 readers from both roots resolve both sessions: four exact Task workspace/Task/Delivery routes, with current context, runtime contract and continuation checks. Readers write nothing. Direct deferred selection rejects with `unsupported_task_schema` and zero writes. |
| AC4 | Integration negatives exercise identity/generation/provenance collisions, canonical aliases, missing inventories, malformed/missing/unrelated bindings, peer artifacts and final topology/checkout/marker/absence/path drift. Installed stale binding bytes and modes produce preview conflicts and execution rejection, both without writes. |
| AC5 | Installed fourth-write fault leaves a genuine partial state. Same-plan preview/resume succeeds from frozen originals; completed replay from the opposite checkout is unchanged. Third states reject. Caller rollback restores exact original bytes, modes and directory inventory, removing only additions. |
| AC6 | Targeted Plan1/Plan2/cross-worktree suites: 142/142 passed. Lint, TypeScript/Python type checks, minimum-interpreter syntax and build passed. Installed proof and independent code/evidence reviews passed. Full-suite final disposition follows below. |

## Required checks

| Check | Actual result |
| --- | --- |
| Root `pnpm lint` | Passed; independently repeated after fixture correction. |
| Root `pnpm typecheck` | Passed; independently repeated after fixture correction. |
| CLI Python typecheck | 0 errors, 48 existing warnings. |
| Actual minimum Python syntax | `/usr/bin/python3` 3.9.6 compiled all 89 tracked Python files. |
| Root `pnpm build` | Passed before exact pack/install. |
| Three targeted integration files | 142 tests passed, including all 103 migration2 cases and 47 new cases. |
| Complete Core suite | 475 passed; one existing optional SQLite skip, retained as a skip. |
| Isolated OMP file, one worker | 44/44 passed in 42.22 seconds; previous timeout case passed in 4.088 seconds. Timeout unchanged at 10 seconds. |
| Complete CLI suite, one worker | 99/99 files, 2,225/2,225 tests passed; exit 0, 500.20 seconds. Timeout/source unchanged. |
| Task context validation | Passed for both 10-entry manifests. The oversized quality guidelines were explicitly read in full by implement/check owners. |
| `git diff --check` | Passed. |

The original root full run failed CLI with seven 10-second timeouts (2,218 passed); it overlapped packing/installed work. The subsequent complete four-worker CLI run failed only the existing OMP selected-v2 cross-worktree case (2,224 passed). These are retained as failed runs, not converted to passes. The isolated OMP result and complete one-worker CLI pass support local resource contention as the explanation. The same source passes the complete CLI suite without source or timeout changes; the original root command still records a failed run, while the complete package suites establish the final passing test set. No remote default-concurrency CI result is claimed.

## Evidence locations and reproduction

Raw local artifacts are under `/tmp/plan2-worktree-copies-candidate-q9h3iZ` (canonical `/private/tmp/...`): source manifests, package metadata/tars, old-candidate red proof, installed byte/mode manifest, public-command outputs, `installed-result.json`, installed proof runner/fault preload and the original/bounded/serial full-test logs. Targeted independent checks are `/tmp/plan2-check-targeted.log`, `/tmp/plan2-check-lint.log` and `/tmp/plan2-check-typecheck.log`; Python types are `/tmp/plan2-worktree-copies-python-types.log`.

Installed fixture generator: `/tmp/plan2-installed-fixture.mjs`, SHA-256 `95b0aacdc77b5e0ed6b49067752c6613bfd601279206fc82570e6637c96d429b`. It imports installed JavaScript only. Proof runner SHA-256: `051138152eab3e579ca47dd5e4c2487573e3a8355486b7deb5bfcc2601b8ef52`; fault preload: `fcdb2ed8c185298fa805c68393c33552166c7ffcabd956259d3f2a8a7c3e0e52`. Exact installed fixtures were rolled back after proof. The durable acceptance observations and identities are recorded here and in `quality-review.md`; temporary artifact retention is not a release publication.

Reproduction commands for the source checks:

```sh
pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts test/commands/migrate.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm build
pnpm --filter @mindfoldhq/trellis-core test
pnpm --filter @mindfoldhq/trellis test --maxWorkers=1
python3 .trellis/scripts/task.py validate .trellis/tasks/10-13-plan2-worktree-copies
git diff --check
```

## Specification and review disposition

The Phase 3.3 `trellis-update-spec` assessment is satisfied by the seven-section inherited-copy scenario in `.trellis/spec/cli/backend/commands-migrate.md`: signatures, fixed binding contract, failure matrix, good/base/bad examples, test assertions and wrong/correct guidance. It documents original-snapshot replay, raw preservation and pre-write rechecks without inventing locking/transactions. No index status change or additional product specification is needed.

Independent full-diff review found no product defect. It fixed one test that previously rejected at an earlier inventory guard, then verified the corrected collision assertion and repeated lint/typecheck/targeted suites. Independent installed-candidate audit found no defect. Final same-candidate AC/evidence review found no new issue, with final whole-suite log audit recorded in `quality-review.md`. No remote Ubuntu CI, release matrix, original business cutover or downstream recovery is claimed.

## Subsequent publication and merged-candidate verification

The sections above retain the original pre-publication quality snapshot, including failed timeout runs and then-pending remote evidence. Subsequent observed results now cover remote CI: normal local pre-commit hooks also passed the complete default-concurrency suites; [PR #36 CI](https://github.com/castbox/Trellis/actions/runs/38339653228) and [exact main CI](https://github.com/castbox/Trellis/actions/runs/38340163972) both completed successfully with Ubuntu, Node 20 and Python 3.9.25. CLI passed 2,225 tests in 99 files; Core passed 475 tests with one retained optional skip. Syntax, types, lint, build and build-output verification passed.

The approved source `1e40014023de53ddfd9368b3fb4d0a7a31e92293` and merge `a5eb8b2dfd32b41e30d9bbf1c3ba8f98bcaf1258` have identical Git trees, `cc0080e9b4d60d32b4f74b0f18d43ba0c6e4da6d`. The merge parent is the approved main base `780819aa98057038a7d6e21b5d66c11d61c23518`. These are delivery/validation facts, not a new semantic gate or a rewrite of earlier failed evidence. See `closeout.md`. No release, original business cutover or downstream recovery is claimed.
