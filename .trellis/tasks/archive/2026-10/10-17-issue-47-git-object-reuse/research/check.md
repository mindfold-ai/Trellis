# Issue 47 quality verification

Scope: legacy Task quality verification against accepted PRD/design and the complete intended Issue changes from `b0d87f952043058e21001a002b661bf2db56b1fa` to the corrected working tree, including untracked Git-object helper/tests. This is not a formal schema-2 Delivery gate or lifecycle result. Review performed after final corrected benchmark source was frozen; no production source was edited by the reviewer.

## Findings and disposition

- No remaining confirmed implementation defect found in the reviewed scope.
- Main/implementer corrected the provisional seeded-content shortcut: matching filesystem bytes do not prove Git blob availability. The corrected immutable owner independently resolves seeded unique blobs through bounded `cat-file --batch-check`; offline partial-clone failure remains `invalid_git_fact` before any Task write. The public normal-operation regression passed.
- An obsolete `performance-gates.md` pointer was reported to main and corrected to the actual frozen evidence files.
- Historical identity parsing still materializes one JSON metadata body before reducing it to an identity; batching spools Git bodies and does not retain all batch bodies in Python memory. Do not interpret bounded batching as a constant-memory JSON parser.

Review covered independent structure/identity/generation/owner/scope/phase/preimage validation, immutable exact-commit/type validation, current candidate/ref freshness, path/mode/deletion contributions, original compact UTF-8 digest encoding, same-operation hash reuse, literal paths, ordinary read failures, temporary-file cleanup, historical permissive identities, unchanged retry recovery, template registration and Python twin parity. No persistent cache, caller-supplied trusted digest API or lifecycle bypass was introduced. Specification additions describe the implemented boundary.

## Executed checks

| Command | Actual result |
| --- | --- |
| `pnpm lint` | PASS, Core and CLI |
| `pnpm typecheck` | PASS, Core build then CLI `tsc --noEmit` |
| `pnpm --filter @mindfoldhq/trellis lint:py` | PASS, 0 errors; 48 existing unused-import warnings in unchanged `common/__init__.py` and `common/git_context.py` twins |
| `git diff --check` | PASS |
| `diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__` | PASS |
| `/usr/bin/python3 --version` | Python 3.9.6 |
| Python 3.9 `ast.parse(..., feature_version=(3,9))` for changed helper/owners | PASS |

Focused test command:

```sh
pnpm --filter @mindfoldhq/trellis test test/scripts/task-identity-source.integration.test.ts test/scripts/delivery-v2.integration.test.ts test/scripts/delivery-location.integration.test.ts test/scripts/git-objects.integration.test.ts test/commands/delivery-workflow.integration.test.ts test/commands/update-current-version.test.ts test/commands/cross-worktree-update.integration.test.ts test/regression.test.ts
```

Initial run: 538 passed, 1 failed across 8 files. The installed cross-worktree suite collided with main's separately authorized build cleaning Core `dist`; its subprocess failed with `ERR_MODULE_NOT_FOUND` for `trellis-core/dist/task/v2/index.js`. No assertion about business behavior failed. After main confirmed the build was complete, reran only:

```sh
pnpm --filter @mindfoldhq/trellis test test/commands/cross-worktree-update.integration.test.ts
```

Rerun: 1/1 passed. Final focused coverage: all 539 tests passed across their completed runs. Delivery tests execute `/usr/bin/python3` on this macOS host (3.9.6), including SHA1/SHA256 paths, digest reuse, offline partial clone, mode/type/deletion failures and public normal/historical/retry paths. Full script parity is included in the 462-test regression suite.

## Evidence boundaries

The full repository suite is assigned to main's final code-commit hook, avoiding a duplicate full run here. Main separately owns official build/paired package packing/isolated installed CLI verification and records that evidence. The installation verification script was reviewed for real installed CLI execution, exact local Core resolution, helper bytes/modes/inventory, public normal delivery/retry and reapply/drift/sidecar checks; this document does not claim its execution result. Performance/RSS acceptance is owned by the benchmark evidence and is not inferred from unit/integration passes. No cross-platform release matrix, live GitHub publication operation or downstream adoption was tested by this reviewer.
