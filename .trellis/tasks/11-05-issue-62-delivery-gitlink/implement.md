# Execution plan

- [x] Implement matching Python/SDK parent-index gitlink observation and tree tuple handling; preserve ordinary paths and #47 reuse.
- [x] Add representative real-Git cross-language/CLI/commit/history regressions; adjust gitlink rejection expectation while keeping directory/symlink rejection.
- [x] Sync applicable .trellis/scripts dogfood and delivery-contract copies; update durable Delivery content contract.
- [x] Run affected core task-v2 tests, CLI Delivery runtime/history/CLI tests, pnpm lint and pnpm typecheck. Use existing recovery/object-format regressions.
- [x] Independent trellis-check of complete main-relative diff; resolve concrete findings.
- [ ] Commit focused change, push PR targeting main; observe required CI and merge under user authorization. Record precise adoption commit/API notes and close #62 only on completion.

Planning reviewed against Issue requirements; no unresolved product/scope decisions. User authorizes preferred implementation and repository/Issue operations. No release, downstream adoption or unrelated task migration.


## Implementation and independent verification

Python/SDK use [path,57344,OID] for parent gitlinks, selected stage-0 candidate index entries, and parent-tree commit/history entries. Templates and dogfood scripts/contracts match. No submodule state/object access or release changes.

Independent trellis-check found and fixed one new regression: full index reads exceeded the SDK subprocess buffer on a 12,000-entry parent (1,680,890 output bytes), blocking even an ordinary selected file. Selected literal index/tree queries now use bounded 64-KiB argument batches; the real large-parent regression passes in both runtimes.

Final verification: 183 distinct focused tests passed: 73 Core tests (v2.test.ts, v2-location.test.ts, v2-historical-commit.test.ts), 110 CLI Delivery/runtime/history/recovery tests across nine suites. Final touched-suite rerun passed delivery-v2 33/33 and git-candidate-content 11/11. Existing ordinary workspace/index drift, Git-free, non-Git explicit Git mode, immutable blob reuse and historical recovery regressions are preserved. SHA1/SHA256 real fixtures compare Python/SDK/CLI identity, normal Delivery and incorrect-pointer rejection, exact tree OIDs, staged changes/conflicts and missing child objects.

Commands: pnpm lint; pnpm typecheck; pnpm --filter @mindfoldhq/trellis lint:py; package Vitest runs for the suites above; git diff --check; cmp of delivery_store.py, git_objects.py and delivery-contract.md canonical/dogfood pairs. All passed; Python has zero errors and 48 existing warnings. Independent complete main-relative review reports no remaining actionable findings.

Scope remains upstream #62 only. No downstream Guru adoption, package/tag publication or additional platform matrix is required.
