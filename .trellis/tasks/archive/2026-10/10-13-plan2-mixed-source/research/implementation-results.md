# Implementation results: Plan2 mixed-source

## Scope and implementation

Implemented on the dispatched base `fdb88e8e220b42df0f0b78f8b939e072d36b9be1`
under the activated independent `plan2-mixed-source` Task on 2026-10-13.
This implementer changed only the three owned product/test files below.
Main owns `commands-migrate.md`, Task metadata, manifests and independent Check.
Task-owned raw check logs were retained/adopted by main after an explicit handoff.

The closed Plan2 schema now accepts global `mixed`, requires per-row
`source_task_schema: legacy|1.0` for convert_active/convert_archive/defer, and
forbids it for homogeneous modes and current/history_only. Unknown fields
remain rejected. A single CLI-local predecessor validation helper handles
convert/defer against frozen decoded original bytes through existing public
validators, with no parser fallback. Homogeneous errors are rethrown unchanged;
mixed diagnostics identify workspace, TaskRef, disposition and declaration.
Projection, prepare/preserve, identity grouping, bindings, inventory and
pre-write/replay algorithms are retained. A mechanical optional-chain change
at legacy result-owner checking was required by final lint after schema
inference changed; absence and mismatched-owner rejection remain equivalent.
No Core, Python/runtime template, package version or production model change.

## Regression proof and failures retained

The first AC1 test was run before the schema/executor change. The old executor
rejected global mixed and all row selectors at its initial closed plan parser:
1 selected test failed, 103 filter-excluded. This pre-fix result remains in the
session tool output; it is not claimed as a passing baseline.

The final Plan2 file has 161 tests: 103 original cases, 51 new source/compatibility
cases and seven added mixed variants of the existing final-drift matrix.
Existing cases remain exercised rather than replaced. The matrix covers:

- A generated 28 schema1/3 legacy complete inventory; schema1 selection and 30
  byte/mode-exact deferred neighbors, all planning/JSONL/nested binary descendants,
  UTF-8/whitespace, source history, preserve writer spies and completed no-op.
- Both-source active and archive conversion; strict schema1 nonzero generation,
  Issue source, children/parent and business metadata; legacy personnel/status
  retained only in exact original history.
- All selector truth-table dispositions, undefined/null/bad strings/numbers/
  object/array values, both source mismatch directions for convert/defer/archive,
  unknown/malformed source records, strict unknown row fields and homogeneous
  override/error compatibility. Every rejection asserts intended error, zero
  atomic writer calls and full-tree equality including directories/symlinks.
- Mixed inventories with only one predecessor kind, only current, only history,
  or only current/history (including unknown and missing-record history).
  Current target records, active nonempty history and wrong locations reject.
- Real generated registered Git siblings with schema1 and legacy identities,
  opposite unique binding authorities, plan-order permutations and branch-local
  planning variants. Peers receive no migration/Delivery paths or writer calls.
  Same-ID cross-category, generation/provenance/case, two/all-defer authorities,
  missing/wrong/malformed bindings, aliases, missing inventories, invented peer
  artifacts and marker predicates reject. The reused final-drift matrix covers
  checkout/topology/common-dir/marker/binding byte/mode/path changes in mixed mode.
- Actual atomic `renameSync` failure on source-history output *after the selected
  main Task has reached schema2*. The test asserts schema2 live Task, unchanged
  original predecessor declaration, temporary-file cleanup, read-only same-plan
  partial preview, successful resume and zero-writer completed replay. Source,
  target and binding byte/mode third states reject without extra writes.
- Caller rollback restores every changed approved file, byte/mode/prior absence
  across primary/sibling/common storage, then removes only newly added empty
  directories and proves exact full-tree equality.
- Generated installed Python readers from both invocation roots resolve exact
  bound Task workspace, runtime/continuation and Delivery contract. Delivery
  current reports the exact Task key with no_current_delivery (no fabricated
  Delivery). Deferred direct selection rejects and leaves the full tree exact.

Preserved intermediate diagnostics:

- `mixed-tests.log`: 45 passing / four failing / 103 filter-excluded. Three
  expected error patterns differed from the existing messages; one two-authority
  fixture reached title-preservation first. Corrected the expectations and
  source-consistent peer projection to reach the intended identity guard.
- `mixed-tests-recheck.log`: 63 passing / 96 filter-excluded (159 then-current
  tests, before two archive executions and extra reader assertions). The filter
  also exercised all 14 old/mixed final-drift variants; these exclusions are
  selection exclusions, not missing environment evidence.
- `implementation-lint.log`: one optional-chain lint failure; repaired narrowly.
- `implementation-regressions-python39.log`: mistakenly ran alongside root
  typecheck, which cleans Core dist; both migration suites failed module imports.
  The two Python suites passed all 45 tests. Reran sequentially after typecheck,
  rather than calling this partial run a pass. The failed output remains intact.

## Final checks

| Check | Result | Raw log |
| --- | --- | --- |
| Ordinary root `pnpm build` | pass, Core then CLI/template copy | implementation-build.log |
| Root `pnpm lint` | pass, no lint warnings/errors | implementation-lint-final.log |
| Root `pnpm typecheck` | pass, Core build then CLI TypeScript | implementation-typecheck-final.log |
| Four-file related regression under actual Python 3.9.6 | 4 files, 221 tests pass, no skips | implementation-regressions-python39-final.log |
| `git diff --check` | pass | session output |

Final regressions: migrate2 161, original migrate 15, cross-worktree-session 24,
delivery-v2 21. Duration 59.45 seconds, no timeout override. Node is v26.9.0;
this is not Node20 CI evidence. Minimum Python is verified `/usr/bin/python3`
3.9.6, selected by a temporary test-only python3 PATH shim for subprocess calls.
The two shim directories recorded in implementation-python39-version.log were
removed after their owned tests; no global executable/configuration changed.
Generated Python readers ran with bytecode writes disabled.

Main separately reported 89 tracked Python files passing 3.9.6 syntax validation
and owns the Python typecheck; those are not implementer-executed checks.
Root complete CLI/Core suites and formal independent Check remain main/checker
responsibilities. No installed tar candidate evidence is claimed.

## Exact handoff bytes

| Owned path | SHA256 |
| --- | --- |
| `packages/cli/src/commands/migration2-schema.ts` | `64b4be715920c020a7adb27fa03ee49e1c8bea5f04699b195b1b4f45a9728767` |
| `packages/cli/src/commands/migration2.ts` | `6302b38b813832b019df843b8645a6e0e4e97ad745a783d7a766094f3675a80b` |
| `packages/cli/test/commands/migrate2.integration.test.ts` | `ffdd656cf2e954219a5a49c4be4a8bcff168c2adb989c1c127ded742d137f3cc` |

The ordinary build matches these final product source bytes; the subsequent
changes were regression assertions only. All tests/quality checks ran on the
final owned files listed above. No additional source edit followed final checks.

## Remaining boundaries

R1-R6/AC1-AC6 in-process proof is ready for independent Check. AC7 is still pending
full-root independent quality review and separately authorized exact offline
CLI/Core pack/install/public-bin rehearsal, artifact pins, installed byte/mode/
directory/symlink inventory, candidate/template/plan hashes and packed reader
proof. New candidate/tar identities remain pending; ordinary local build does
not replace this proof. No branch/worktree was added in this repository, no
commit/push/PR/merge or outbound task message occurred, and no existing/real
sample was written. Synthetic worktrees exist only inside regression fixtures
and were cleaned by the existing test harness. #31 stays closed, #531 business
acceptance is independently owned, and no real #406 cutover/completion is claimed.
