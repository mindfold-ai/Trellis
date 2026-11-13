# Research: Plan2 mixed-source contract feasibility and guard interactions

- Query: Check the proposed explicit per-record predecessor selector against current CLI/Core validation, identity grouping, recovery and tests; identify planning constraints for the minimal four-file change.
- Scope: internal
- Date: 2026-10-13
- Assigned base: `fdb88e8e220b42df0f0b78f8b939e072d36b9be1` (caller supplied; this research role did not run Git operations).
- Boundary: planning only. Only this research file is written; no product/spec edits, test/build/pack/install execution, sample writes or external messages.

## Findings

### Overall assessment

The proposed contract is technically feasible within the four stated product/spec paths. Existing Core public APIs already supply both strict predecessor validators and the schema-2 projection validator. The change need not alter Core, Python readers, Task schema, Delivery API, Plan version, command dispatch, raw snapshots, identity admission or writer/recovery behavior.

No blocking architectural defect was found in the temporary proposal. The planning checklist below makes the implementation hazards and required coverage explicit. Formal planning documents were not yet complete at inspection: `prd.md` still had TBD requirements/acceptance, and `design.md`/`implement.md` were absent. This is a technical research conclusion, not approval to activate the Task or a completed formal planning review.

### Files found

| Path | Responsibility / evidence |
| --- | --- |
| `packages/cli/src/commands/migration2-schema.ts` | Closed Plan2 input and inferred `MigrationPlan2` type. |
| `packages/cli/src/commands/migration2.ts` | Original raw decoding, validation/projection, complete inventories, duplicate identity admission, binding preflight and writer/replay. |
| `packages/cli/src/commands/migrate.ts` | Public command orchestration dispatches Plan2 before Plan1's strictly older-version restriction. |
| `packages/core/src/task/migration.ts` | Public known-legacy classifier; rejects schema1 provenance/generation fields. |
| `packages/core/src/task/schema.ts` | Strict predecessor schema1 parser; required fields and unknown-field rejection. |
| `packages/core/src/task/migration-v2.ts` | Existing immutable/business/tree-preserving schema2 projection and applicable gate validation. |
| `packages/cli/test/commands/migrate2.integration.test.ts` | Real filesystem and registered-Git fixtures, raw snapshots, partial write injection, Python reader probes, inherited-copy negatives and compatibility. |
| `.trellis/spec/cli/backend/commands-migrate.md` | Public migration contract, Plan2 inventory/recovery and inherited-copy admission. |
| `.trellis/tasks/archive/2026-10/10-13-plan2-worktree-copies/research/quality-review.md` | Prior installed synthetic proof method; historical evidence only. |
| `/tmp/plan2-worktree-copies-candidate-q9h3iZ/fault-on-fourth-write.mjs` | Readonly example of scoped installed-binary atomic rename failure injection. |

The current four product/spec SHA-256 values were read directly and match the temporary write set:

| Path suffix | SHA-256 |
| --- | --- |
| `migration2-schema.ts` | `baf5d7f62b4ff6e16a6f32f9e75dc18f41652539ba4da1f0e99244076d1664ee` |
| `migration2.ts` | `70ae76e4e504a0f60e5753b38a3a7cebb6afcb5b66ef5bfb319378b24165659a` |
| `migrate2.integration.test.ts` | `2ada5d51874741577c14244a2aa08e5c99b5197d42f5dbf5c05b031a086edf94` |
| `commands-migrate.md` | `0ee123a93712fb52016eade2ce9e1ce30823e78c932ad5e62bbf4a85df7fc50b` |

### Code patterns and technical anchors

1. **Input contract is local to CLI.** `migration2-schema.ts:44` declares the strict plan; global source currently allows only `legacy|1.0` at line 50, with strict Task rows at lines 81–133. `MigrationPlan2` is inferred at line 189. Add the optional row enum and a plan-level cross-field refinement so invalid declaration/disposition combinations are rejected by `migrationPlan2Schema.parse` (`migration2.ts:341`) before filesystem preflight or writes. A row-local refinement alone cannot see the global source mode. Keep `.strict()` behavior and all unrelated fields unchanged.
2. **Explicit validators already exist.** `migration2.ts:15` and line 16 import projection and predecessor validators through public Core subpaths. Strict schema1 rejects unknown fields and requires the canonical fields (`core/src/task/schema.ts:135` and line 140). Known legacy forbids schema1 `source`/`lifecycle_generation` through its allowed field set (`core/src/task/migration.ts:12`), requires personnel/identity string fields (line 23), and validates optional supported fields (line 43). Declared categories are therefore distinct; do not add parser fallback, normalizing inference or a new Core classification model.
3. **Raw originals remain authoritative.** `migration2.ts:69` verifies canonical base64 plus raw digest; the per-row `source` is decoded from that snapshot at line 507, irrespective of live source-or-target state. Conversion validators currently branch on the global source at lines 548–555; defer branches independently at lines 586–589. Both must use the same effective declaration in mixed mode. Merely adding `mixed` to the enum is unsafe: the current conversion conditionals would skip both validators, while defer's `else` would incorrectly treat every mixed row as legacy.
4. **Current/history bypass predecessor selection for a reason.** `current` parses original schema2 at line 558, rejects a target record at line 559, and prepares preserve at line 567. History-only retains location/null/JSON-tolerance behavior at lines 482–509; defer/history cannot project authority at line 582. A selector must be forbidden on current/history rows. Do not apply the mixed required-selector rule indiscriminately to all rows or validate history-only malformed raw through a predecessor parser.
5. **Projection stays downstream of acceptance.** `validateTaskV2Projection` (`core/src/task/migration-v2.ts:8`) preserves existing source/business fields (line 19), generation (line 42), exact relations (line 56), and applicable gates (line 67). Raw originals are saved separately at `migration2.ts:572`. Mixed does not grant arbitrary legacy field retirement, source invention, status-to-gate reconstruction, or weaker historical attribution. Existing `legacy_facts` verification remains at `migration2.ts:1042` and line 1129.
6. **Grouping already freezes original identity.** `migration2.ts:523` creates source identity members from the original header; known-legacy originals use generation zero at line 528, others retain their recorded generation; provenance is original `header.source` at line 531. Group admission at lines 604–631 requires case-exact ID, generation and semantic provenance, one active authority, distinct workspaces, active-only convert/current/defer members. Do not replace the map key with `(schema,id)` or add mixed-specific collision exemptions. A legacy member has no schema1 provenance; a same-ID legacy/schema1 pair normally fails existing provenance equality and must continue to fail. Independently validated same-category inherited groups remain legal within a mixed inventory. The existing known-legacy check in generation grouping is a generation rule, not fallback source acceptance.
7. **Binding remains a separate authority gate.** Reviewed common-dir binding handling follows at `migration2.ts:650`; it selects the single projected active identity. The final topology/checkout/marker/binding-absence recheck remains at lines 1253–1304. Row selectors cannot infer a binding, exempt an inherited peer or make the invocation checkout authoritative.
8. **Preserve and replay need no alteration.** `prepare` sets preserve after-state exactly equal to before (`migration2.ts:412`), and records third states at line 423. It permits a write row's exact original or exact target live state without changing the frozen original used for semantic validation. Final entire-set recheck occurs at line 1313; preserve and exact completed targets skip the writer at line 1322. Keep mixed selectors in the same caller-owned plan on retry: do not change convert to current or regenerate source snapshots from partially migrated schema2 files.
9. **Complete ownership remains independent of source type.** Task inventory comparison is `migration2.ts:594`; artifact ownership refuses added peer authority at line 857 and scans descendants at line 892; sessions still require dispositions at line 995. Mixed is no escape from a complete registered workspace/task/session/artifact plan.
10. **No command/version change is needed.** `migrate.ts:185` dispatches Plan2 first, while the Plan1 older-version restriction starts at line 193. Plan2 independently checks the source/target identity and allows source <= candidate (`migration2.ts:341`–349). An offline same-package-version candidate remains compatible with the existing Plan2 route; same version alone cannot establish which CLI contract/tar is installed.

### Planning checklist and validation coverage

These are implementation/planning constraints, not claims that new behavior currently passes:

- Define the complete declaration truth table: homogeneous plans forbid row selectors on every disposition; mixed requires `legacy|1.0` on each convert-active, convert-archive and defer row; mixed forbids it on current/history-only. Mixed plans containing only one predecessor category are valid. Current/history-only-only inventories also need no artificial predecessor-category requirement.
- Exercise missing selector and invalid enum for all three requiring dispositions, plus both wrong category directions for conversion and defer. Include valid mixed archive conversion and mixed current/schema2 plus history-only coexistence. Keep old homogeneous plans without selectors as successful regressions and reject overrides before any writer call.
- Add malformed/unknown-field predecessor negatives so relaxed classification cannot mask the problem. Preserve raw snapshot digest/base64 checks; negative assertions should compare all fixture bytes/modes, not just the selected task JSON.
- Use one synthetic 28 schema1 + 3 legacy inventory to represent the observed input shape: selected schema1 converts and all 30 peers remain raw, then reverse the selected category in a distinct fixture. Include UTF-8, whitespace, permissions and descendants/planning. Avoid duplicating 31 tests simply for cardinality.
- Extend a real inherited-copy fixture with independent mixed-category IDs. Test admitted same-category groups, order independence, mismatched source/generation/case, and a same-ID cross-category collision. Legacy `source`/generation absence cannot be silently filled to manufacture group equivalence.
- Inject a real ordinary partial write while mixed converters are in the plan, prove at least one selected Task reached its target, keep the unchanged plan, then preview/resume. This is needed to demonstrate the declared source validator reads the original snapshot even when live bytes are schema2. Follow with third-state byte/mode rejection and completed replay with no writer.
- In-process tests already have a fourth-write `writeFileAtomic` failure (`migrate2.integration.test.ts:2254`), and zero-writer replay (`:2160`). Their `snapshot` helper (`:57`) covers regular file hashes/modes but omits directories and symlinks. Packed proof must retain the stronger directory-inclusive manifest; do not use this helper alone to claim exact directory rollback.
- Prior installed proof uses the real packed `bin/trellis.js migrate` plus `--import` of a scoped `fs.renameSync` fault shim. The readonly prior shim fails the fourth target under `PLAN2_FAULT_DIRECTORY` containing `/.trellis/`. Reuse the method only in a newly authorized synthetic fixture, with new shim hash/exact path and original package bytes unchanged; no production fault flag or new product file is necessary. Old proof/output is not mixed-source evidence.
- Fresh installed proof needs the new CLI tar hash, exact Core tar pin and bytes/modes comparison, complete synthetic plan hash, public CLI preview/execution/replay/rollback, and existing installed Python reader routes from both roots. A public command failure must retain actual raw output rather than count a manually edited intermediate tree as partial-write proof.
- Run existing Plan1/Plan2 and root checks only after activation/implementation authorization. Preserve warnings, skips and failed runs. Bound suite concurrency if necessary without increasing the existing test timeout; old archive evidence records suite contention but cannot certify a new candidate.

### External references and versions

No external documentation lookup is necessary for this local additive contract. `packages/cli/package.json:61` declares Zod `^4.4.2`; the existing Zod object/refinement pattern is sufficient. Root `package.json:6` builds Core then CLI, root typecheck at line 13 builds Core declarations first, and test at line 9 covers both packages. Fresh source/build/installation evidence must supply actual tool versions; none was executed in this research pass.

Temporary inputs inspected readonly:

- `/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis-plan2-mixed-source-proposal-jztlgxcd/proposal.md`
- The same directory's `validation.md`.

### Related specs

- `.trellis/workflow.md`: research persistence and planning/activation authority separation.
- `.trellis/spec/cli/backend/index.md`: CLI package pre-development entrypoint.
- `.trellis/spec/cli/backend/commands-migrate.md:122`: Plan2 schema/API/version contract; later inherited-copy scenario gives original snapshot, unique binding and preserved peer requirements.
- `.trellis/spec/cli/backend/filesystem-safety.md`: contained ownership, raw preservation, atomic writes and caller backup/recovery.
- `.trellis/spec/cli/backend/quality-guidelines.md`: strict TS, return types, no `any`/non-null assertions and required checks.
- `.trellis/spec/cli/unit-test/conventions.md` and `integration-patterns.md`: actual filesystem behavior, positive/negative assertions, independent temp fixtures and shared-helper compatibility.
- `.trellis/spec/core/backend/index.md`: existing public Core boundaries and package checks.

## Caveats / Not Found

- Only source/spec/previous evidence reading and file hashes were performed. No new validators/probes, tests, public dry-run, candidate build/install or executor proof ran. No implementation or installed acceptance is claimed.
- The observed real 28/3/0 classification and raw-mode invariance are supplied proposal evidence, not newly reproduced here. The actual #406 root and existing samples were not touched or executed.
- Formal PRD/design/execution review is not complete until the main owner finishes those artifacts and includes the constraints above. This report can be used as their research context without replacing them.
- #31 remains completed/closed. Independent upstream mixed-source acceptance must not wait on #531, joint acceptance, a private Guru migration, or real #406 cutover. Missing business owner inputs are evidence pending for their own target, not a reason to fabricate upstream gates or block the synthetic upstream contract.
- If implementation requires Core/Python product edits, new persisted declarations, or identity/recovery changes, return to scope/design review rather than silently expand this four-file proposal.

## Final-artifact planning convergence review

Date: 2026-10-13. Reviewed the completed English `prd.md`, `design.md`, `implement.md`, source-analysis and provenance against the temporary proposal, current source anchors and the checklist above. This section supersedes the earlier observation that formal documents were incomplete.

| Reviewed artifact | SHA-256 |
| --- | --- |
| `prd.md` | `85da6f52d596385dbab87acb1bd41d83d210d756b8835e9cd4ccc9b5a75c3632` |
| `design.md` | `5d5e80fe248d08c7cf471483e5e032b91955a8f3c789b2cd98c98a3af604ce76` |
| `implement.md` | `78f21e62ed2be12de0e4e8c33f55ac46b28e8416a0b0541a91e0bdb40f9c4a8f` |
| `research/provenance.json` | `ca5a11df6824b2ee8025e1a9e2f0092fc31e8d7c7093aca13ac750f76cb4fbc2` |

### Result: planning ready

No unresolved technical planning finding. Requirements R1–R7 and AC1–AC7 have corresponding contract, implementation and observable validation coverage. All changes remain inside the exact four-file product/spec set; provenance retains actual predecessor identities, null new-candidate hashes, no new execution claims and the independent no-issue Task source.

The final contract table states every global-mode/disposition/selector combination. Design explicitly permits single-predecessor mixed plans and current/history-only-only mixed inventories without artificial category requirements. Implement AC2 tests all three requiring dispositions, both source-mismatch directions and forbidden/unknown/malformed inputs in otherwise-valid plans. Homogeneous behavior and unchanged current/history location/projection restrictions remain covered.

Grouping and recovery risks are addressed: the final AC5 matrix names plan-order permutations and same-ID cross-category collision; AC6 requires an actual atomic failure after at least one selected Task has reached schema2, then unchanged-plan preview/resume using original declarations. Preservation, zero-writer completed replay, byte/mode third states, directory/symlink-inclusive installed manifests and complete primary/sibling/common rollback are explicit. Existing in-process helpers and the separately scoped installed test-only fault harness can support this proof without shipped fault logic or a new product path.

Required command feasibility was checked from repository declarations, without executing commands: root build/typecheck/test scripts cover Core/CLI, `lint:py` is the existing basedpyright command, CI uses Node20 and Python3.9 and compiles tracked Python using a temporary pycache prefix. Installed reader modes named in the plan exist in `get_context.py`. The plan requires actual minimum-interpreter evidence rather than counting a newer host interpreter as Python3.9 validation.

Scope and authorization remain coherent. Current authority is creation/binding/planning only. Activation/product implementation/check approval does not grant candidate pack/install/rehearsal, branch/worktree creation, publication or business/sample writes. Normal local `pnpm build` is a quality-check dependency in the listed checks; the candidate build/pack/install and synthetic Git rehearsal output set remains gated at execution step 7 and must have its exact fresh root displayed/approved separately. The example public commands contain placeholders and are explicitly not runnable full plans or authorization. Main owner should retain that distinction in the activation prompt.

All existing and real samples stay readonly; genuine owner business inputs remain evidence_pending for their own target. No #31 reopening, #531 acceptance dependency or joint acceptance is introduced. Offline same-version content identity is distinguished from npm publication and from an old closed-schema executor.

### Review limits

- Role isolation prohibits this researcher from loading `implement.jsonl` or `check.jsonl`; those manifests were not read here despite the requested manifest review. Main-session context curation/`task.py validate` owns that separate check. This does not hide a failed validation result; none was executed by this role.
- This is independent planning convergence only. No implementation, test/build/install execution, candidate acceptance, real cutover or release readiness is claimed. Future scope drift or failed proof must return to the appropriate review gate.

Main-owner handoff after this review reports manifest validation passed with 11 entries in each manifest. It retains the explicit 35,487-byte quality-spec / 32,768-byte injection-cap warning and full-disk read requirement. Main also confirmed base/four preimages, planning/no-issue state and no TBD/TODO in the final docs. These are main-owner validation results, not researcher-executed checks. The final approval wording is confirmed to cover activation, four-file implementation and ordinary required quality build/tests only; exact offline pack/install/rehearsal stays separate. No planning finding remains.
