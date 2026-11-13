# Research: Independent task maintenance and historical archival

- Query: Which existing APIs and algorithms can support exact old-checkout/TaskId/generation conversion and historical archival without starting the old workflow, changing peers, weakening current readers, or replacing full Plan2?
- Scope: mixed; live issue and repository source/specs, static inspection only.
- Date: 2026-10-15
- Workspace: `/Users/wumengye/Documents/GoProjects/Trellis-worktrees/40-independent-install-maintenance`.
- Authority: live `gh issue view 40 --repo castbox/Trellis --json title,body,comments`; no comments at read time. Explicit parent dispatch supersedes unrelated inherited Guru #566 hook context. No other task selected.

## Findings

### 1. Current facts and package boundaries

The current CLI/Core packages both declare `0.7.0-castbox.3`; CLI depends on Core with `workspace:*` in source. This is a development dependency declaration, not proof of a matching packed/installable candidate. Core's public exports include `/task`, `/task/v2`, `/task/legacy-migration`, `/task/migration-v2` (`packages/core/package.json`). Core and CLI must publish in exact version lock; release packaging rewrites the dependency, and Core build must precede CLI declaration resolution (`.trellis/spec/cli/backend/trellis-core-sdk.md`). Issue #40 additionally requires actual source/build/API identities and native-entry evidence; a version string does not satisfy it.

Existing CLI migration can run from a complete new CLI without invoking the target's old dispatcher: `trellis migrate --from <version> --plan <file> [--dry-run]` (`packages/cli/src/cli/index.ts:156`). However `migrate2(options: MigrateOptions, input: unknown): Promise<MigrationResult>` selects `process.cwd()` as the invocation workspace and then insists on complete repository inventory (`packages/cli/src/commands/migration2.ts:364`). There is no existing public exact-checkout/task-only maintenance API in the inspected exports/CLI surface. Adding explicit target arguments is new work, not an existing signature to advertise.

The public current task key is `TaskKey { task_id: string; lifecycle_generation: number }`; `DeliveryKey` adds `delivery_id` (`packages/core/src/task/v2/types.ts:9`). Selection and maintenance operation identity must remain separate: a caller may explicitly name old data even when current execution resolution rejects it.

### 2. Supported predecessor formats are distinct

| Existing format | Actual acceptance boundary | Consequence for maintenance |
| --- | --- | --- |
| Positively identified pre-identity legacy | `isKnownLegacyTaskRecord(value: unknown): boolean`, `packages/core/src/task/migration.ts:8` | Closed allowed field set; requires string `id,name,title,status,creator,assignee`; does not allow `source` or `lifecycle_generation`; optional older metadata/children/subtasks have type checks. Missing generation maps to zero only for this supported legacy format. |
| Strict schema-1 record | `taskRecordSchema.parse(input)`, `packages/core/src/task/schema.ts:111` | This is not an on-disk `schema_version: "1.0"` field. Every canonical field is required except optional `branch`; identity, generation, source and business metadata are present. Unknown top-level fields reject. |
| Current schema-2 record | `parseTaskRecordV2(input: unknown): TaskRecordV2`, `packages/core/src/task/v2/schema.ts:86` | Requires literal `schema_version: "2.0"`, accepted scope and lifecycle arrays; rejects old writable status/commit/PR/completion date. Must stay a current-record reader, not an upgrader. |
| Unknown/malformed history | Full Plan2 `history_only` disposition, `migration2.ts:530` | Raw archival history may be preserved without admitting execution authority. Current Plan2 does not let record-bearing active roots use `history_only` (`migration2.ts:515`). This is not an independent move-to-history operation. |

`validateLegacyTaskProjection(legacy: unknown, projection: unknown, retiredFields: readonly string[] = []): TrellisTaskRecord` is the older one-time legacy-to-schema1 projection validator (`migration.ts:70`). It preserves identity and present business facts, requires generation zero when absent, and maps old children/subtasks losslessly. Do not insert this intermediate stored schema1 record merely to reach v2: existing Plan2 validates a recognized legacy predecessor and then projects directly to v2.

`validateTaskV2Projection(source: unknown, projection: unknown): TaskRecordV2` (`packages/core/src/task/migration-v2.ts:8`) validates a caller-authored full v2 record and preserves present identity/source/business metadata, generation and the exact child tree. It does **not** positively classify the source: callers must retain the explicit predecessor classification step (`migration2.ts:80`). It also does not independently audit removed legacy `commit`, `pr_url`, `completedAt`; full Plan2 performs their producer attribution separately (`migration2.ts:1146`). Reusing only this validator would drop important migration obligations.

No evidence supports accepting arbitrary Guru private fields as a public legacy schema. Unsupported records need a concrete maintenance diagnostic or original-owner projection; do not silently default them into the known legacy classifier.

### 3. Reusable conversion rules, and strict write barriers

Useful existing exported primitives:

- `/task/legacy-migration`: predecessor schema/classifier/projection APIs (exports in `packages/core/src/task/legacy-migration.ts`).
- `/task/migration-v2`: `validateTaskV2Projection`; preserve its validation algorithm.
- `/task/v2`: `emptyTaskRecordV2`, `parseTaskRecordV2`, `serializeTaskRecordV2`, `getGateApplicability`, `validateWorkflowContract`, `verifyAuthority`, `verifyHistoricalCommit`, origin-aware locator resolver (`packages/core/src/task/v2/index.ts:1`).
- `verifyHistoricalCommit(root: string, value: unknown): void` checks immutable actual local-commit facts; it does not verify PR/manual delivery on behalf of their original producers (`packages/core/src/task/v2/store.ts:152`).

Ordinary current store writers cannot perform legacy conversion:

- `TaskStoreOptions { root: string; taskDir: string }`, `WriteTaskV2Options` adds `record` and optional `expected_preimage` (`store.ts:10`).
- `loadTaskRecordV2(options)` strictly parses existing v2 bytes (`store.ts:49`).
- `writeTaskRecordV2(options)` reads an existing record with that strict reader; lifecycle changes require a closed operation, and a newly created Task must have generation zero and empty lifecycle (`store.ts:69`). It therefore cannot replace a legacy file or import already-delivered history.
- The existing explicit migration executor owns the overwrite after predecessor/projection/fact validation, saves exact original bytes and mode to `<task_ref>/migration/source-task.json`, and writes deterministic serialization (`migration2.ts:573`). Expose a bounded migration writer rather than weakening current store APIs.

Planning/content origin constraints:

- Every Delivery has `planning_root === deliveries/<Delivery UUID>` (`v2/schema.ts:68`). A root plan is not automatically a selected Delivery plan.
- Task `accepted_scope` owns whole requirements, while each Delivery owns its scope and planning history (`packages/cli/src/templates/trellis/delivery-contract.md:34`). Existing root plans must remain retained; mapped slice copies need explicit reviewed attribution.
- Existing Plan2 requires a prospective `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl` for each projected Delivery (`migration2.ts:1065`), and explicit disposition for every existing task artifact (`migration2.ts:907`). Do not describe those files as universally optional if reusing this exact profile.
- `artifact_origin` is a separate immutable relocation locator. Migration cannot initialize/change it (`migration-v2.ts:15`); explicit relocation owns initialization and origin-aware resolution (`store.ts:257`, `store.ts:283`). There is no discovered `planning_origin` field.
- Nonterminal projected phases must have applicable gates (`migration-v2.ts:67`); raw old status or gate files do not satisfy this. Minimal continuation can retain a planning-phase Delivery with empty gates and let its actual owner reaccept Planning. Whether a real old delivery may be normalized as a delivered fact remains original-producer judgment/evidence, not inference from `status=completed` or a merged PR.

### 4. Preserve Plan2 as a full installation cutover; extract below it

Full Plan2 has intentional completeness rules:

- All eligible registered workspace roots are required (`migration2.ts:378`, `:413`).
- All active/archive roots require explicit disposition (`:610`).
- Each workspace requires a prospective workflow contract and frozen template candidate (`:720`, `:744`), all templates/workflow decisions (`:918`), installation preimages/receipts/version writes (`:1187`, `:1261`).
- Every common-dir session and every registered workspace's local session file requires an explicit disposition (`:938`, `:996`).
- `migrationPlan2Schema` explicitly owns these arrays and the mixed-predecessor selector (`packages/cli/src/commands/migration2-schema.ts:44`).

Candidate extraction seams (new design options, not current APIs):

1. Extract the existing predecessor classification helper `validatePredecessor` and per-task projected-record/fact/planning/reference validation from `migration2.ts:80`, `:573`, `:1015`, `:1057`, `:1146`. Core should own reusable domain validation; CLI owns template/platform collection and rendering.
2. Extract exact raw snapshot decode/digest/mode handling plus prepared source/target state validation and application from `migration2.ts:58`, `:67`, `:73`, `:215`, `:427`, `:1320`. Both Plan2 and narrow maintenance can consume a frozen write set; do not copy their algorithms into a Guru wrapper.
3. Separate read-only repository/identity/copy observation from the caller-specific requirement for a complete conversion plan. Keep Plan2's complete inventory checks in its existing caller. A new maintenance caller may observe relevant peer copies to establish ownership without converting or rewriting them.
4. Extract session/branch JSON validation from `migration2.ts:323`, `:667` into a reusable maintenance boundary, then use it in both callers. No public TS/Core session or branch-retirement API was found. Python currently owns normal binding behavior; if TS receives new maintenance primitives, parity/fixture evidence is needed rather than pretending Python functions are existing Core exports.

Plan2's schema, required arrays, closed disposition meanings, version compatibility and same-plan retry must not be silently reduced to implement the narrow operation.

### 5. Inherited copies and exact authority

Current Plan2 admits inherited active copies using **original frozen snapshots**, not partially converted live records (`migration2.ts:622`): exact same id, generation, provenance/source; one active `convert_active`/`current` authority; other copies active `defer`; distinct workspaces/directories. Mutable branch metadata and planning can differ. Existing common-dir binding must select the authority through exactly one live checkout of its branch (`:651`, `:667`). It is preserve-only in Plan2 (`:704`).

Binding path is `<git-common-dir>/trellis/task-branches/<TaskId>/<generation>.json`, with exact fields `schema_version: "1.0", task_id, lifecycle_generation, binding_revision, branch_name` (`packages/cli/src/templates/trellis/scripts/common/session_storage.py:156`). Guru marker can require this binding; Git-free has no common binding.

Normal Python `resolve_task_identity(facts, task_id, generation, *, preferred_workspace=None)` uses branch ownership, an identity-only reservation scan and then strict selected record parsing (`session_storage.py:356`). It cannot bootstrap incompatible selected data. The new maintenance selector must validate explicit checkout plus original source identity/generation and, where copies exist, objective binding/peer facts. It must not route through current Identity/Continuation first or infer authority from a directory/branch name alone. Reusing a reader that validates the whole selected current schema would recreate the bootstrap cycle.

### 6. Historical archival is currently missing as a public maintenance operation

Existing archive entry is unsuitable:

- Python `cmd_archive` resolves lifecycle authority, reads strict current task shape and requires installed runtime compatibility (`packages/cli/src/templates/trellis/scripts/common/task_store.py:1239`, `:1266`, `:1301`). For v2, it requires current matching Completion/Closure and terminal Deliveries (`:1314`). For legacy it writes `status=completed` and today's `completedAt` (`:1374`).
- It may mutate child-task parent links (`:1393`), clears sessions **before** the move (`:1452`), auto-commits unless disabled (`:1471`), and runs `after_archive` hooks (`:1487`). These are not a safe implementation of historical-only retention.
- Core `relocateTaskRecordV2(options: RelocateTaskV2Options): TaskRecordV2` also strictly loads v2 and requires Completion/Closure for archive destinations (`store.ts:248`, `:257`). Do not weaken it or manufacture lifecycle results to pass it.
- Python `archive_task_dir` reads strict task metadata, then routes v2 through relocation and legacy through move (`common/task_utils.py:245`). `archive_task_complete` is only a wrapper around that helper, not a bypass for unsupported data (`:302`).

Candidate historical operation: externally supplied complete matching runtime reads an explicitly selected supported legacy record/raw task tree, freezes original bytes/modes, destination and exact binding retirements, then makes a readable history archive without changing old status/outcomes or adding v2 results. Historical external obligations and original-owner explanations can be retained as minimal archival content, not Completion/Closure. Keep child/peer data, branch/worktree and installed target tools unchanged. Existing root-manifest archive self-reference resolution is a useful read pattern (`common/task_context.py:266`); preserve raw plans rather than rewriting history merely for readability. Unsupported archival record formats need an explicit bounded reader/diagnostic contract, not permissive current readers.

### 7. Session retirement must cover old carriers, not just current selection

Existing normal APIs:

- `sessions_directory(root, facts)` uses shared Git common-dir storage, or local `.trellis/.runtime/sessions` for Git-free (`session_storage.py:186`).
- `read_record(path, root, facts)` accepts integer schema 2 `{schema_version,task_id,lifecycle_generation}` and schema 3 adding `delivery_id` (`:288`).
- `records(facts, *, key=None, ignore_unsupported=False)` enumerates that current storage; `ignore_unsupported=True` skips only unsupported-schema errors (`:320`). It does not enumerate obsolete checkout-local Git bindings.
- `task_session_records(task_id, lifecycle_generation, repo_root)` filters these records by exact identity/generation; `clear_task_from_sessions(..., selected=None)` deletes them (`common/active_task.py:756`). Its schema-2-only docstring is stale: the underlying reader also accepts schema 3.
- `clear_active_task` first resolves current task and refuses errors (`active_task.py:741`). Not suitable for blocked old tasks.
- `release_delivery` clears Delivery selection but keeps Task selection; it is not Task retirement (`common/delivery_session.py:86`).

Old carriers are real compatibility evidence: `cross-worktree-session.integration.test.ts:232` exercises unversioned checkout-local records and schema-1 path-based bindings `{schema_version:1,repository_common_dir,task_workspace_root,current_task}`. Normal readers intentionally reject these. After a new common binding is removed, an obsolete local binding can resurface as `unsupported_binding_schema` (`:253`). `unsupported_checkout_session_paths` only detects their presence and never reads payload (`session_storage.py:206`).

Therefore a maintenance retirement operation needs a separate positive classifier for supported old session shapes and exact locator-to-selected-task attribution, or an explicit unsupported diagnostic. Current `clear_task_from_sessions` alone cannot meet #40 historical closeout. Freeze/remove only positively matched TaskId/generation bindings, including the exact selected common branch binding; unknown data must never cause wildcard deletion. Removing a branch binding is not currently implemented by archive. Preserve unrelated sessions, same-id other generations, peer task trees and branch/worktree resources. Only after the archive is readable should retirement complete; ordinary interrupted ordering needs same-operation recovery. Do not copy existing archive's clear-before-move sequence into the new operation.

### 8. Native maintenance diagnostics without relaxing execution readers

Current `read_json_checked(path)` rejects unsupported Task fields/invalid shapes (`common/io.py:161`). Identity-only reservation is already separate from lifecycle acceptance; the analogous maintenance diagnostic should be a non-authoritative read projection.

`resolve_active_task` resolves exact session identity then calls strict `_require_selected_runtime`; errors become stale `ActiveTask` with no usable task path (`common/active_task.py:569`, `:578`). `require_task_runtime` rejects old Task execution under a declared schema-2 workflow (`common/runtime_contract.py:78`). `get_context.py:29` refuses continuation/phase/runtime modes early on resolver error; default output also exits nonzero after reporting (`:36`). `common/git_context.py:105` extracts the actual selected workflow's continuation only after that gate.

Inventory already distinguishes a strict schema1 record retained under a schema2 declaration as `history_only`, with null development status (`common/tasks.py:65`, `:105`). Unsupported pre-identity formats are warned/skipped before that label. This inventory projection does not grant current authority.

Candidate: augment structured native error/context output with minimal pending-maintenance identity/locator, supported/unsupported reason and the actual available external maintenance entry. Keep `task_path` unusable for normal continuation and keep current parser failures intact. Do not make `get_context.py --mode continuation` fall back to root plans or legacy workflow status. After history archival and exact retirement, use actual normal context/current queries to prove no session reselects it, including obsolete local carriers. An old target runtime cannot be expected to know a new command; historical closeout must run through the external matching candidate and verify the old target's ordinary selection behavior without forcing a target tool upgrade.

### 9. Same-operation retry, output loss and bounded rollback

Existing Plan2's prepared-write machinery accepts exact original or exact target bytes **and mode**, reports a third state before mutation, and skips already-written targets (`migration2.ts:427`, `:1328`). Original snapshots remain predecessor authority on partial retry. `MigrationResult` exposes status/source_version/target_version/actions/conflicts; each action contains path/action/before/after SHA and modes (`commands/migrate.ts:72`). There is no public operation-id receipt, recovery query or rollback command here.

The existing contract explicitly leaves backup/recovery/rollback to the caller (`commands/migrate.ts:176`). Tests restore exact preview paths in reverse; this is fixture/caller rollback, not a production rollback API (`test/commands/migrate2.integration.test.ts:417`). The test at `:462` covers ordinary partial write failure plus fixed-plan replay.

Candidate: a narrow operation freezes its explicit target/source snapshot, projected record, already allocated Delivery/result IDs, full selected task artifacts and exact matched binding actions once. Reentry reuses this candidate and its original identities; do not regenerate IDs or import legacy history twice. Archival additionally freezes one destination so a later month or lost output cannot create a second archive. Recovery must distinguish original/target/ordinary partial states from later user edits, and return the existing result when complete. Rollback restores only original write-set preimages/modes and refuses conflicting later business edits. Tool rollback compatibility must consider task formats introduced after installation; restoring tools alone must block if it would leave unsupported data, or return the explicit combination boundary for caller review. Plan2's caller-owned rollback remains separate and unchanged.

### 10. Existing regression anchors and missing proof

Relevant existing tests to reuse/extend, not claims of tests executed here:

- `packages/core/test/task/migration-v2.test.ts:22`: old completed status does not synthesize lifecycle results; metadata/tree/origin preservation.
- `packages/core/test/task/migration.test.ts`: legacy-to-schema1 validation.
- `packages/cli/test/commands/migrate2.integration.test.ts:393`: zero-write preview, raw history/modes, same-plan replay and caller rollback; `:462` ordinary failure.
- Same file `:2097`: real inherited registered copies, branch-bound authority, raw peer preservation; `:2260` partial recovery; `:2873` explicit mixed 28/3 inventory; `:3109` schema1/known-legacy active/archive conversion.
- `packages/cli/test/scripts/cross-worktree-session.integration.test.ts:232`: schema1/unversioned binding refusal and obsolete local carrier resurfacing.
- `packages/cli/test/scripts/delivery-context-boundary.integration.test.ts:81`: valid legacy record under declared schema2 rejects execution; `:94` explicit undeclared compatibility remains.
- `packages/cli/test/scripts/delivery-location.integration.test.ts`, `delivery-v2.integration.test.ts`, `delivery-inventory.integration.test.ts`: ordinary v2 archive/origin/session/inventory behavior.

New proof must exercise the real built/installed new CLI/Core, explicit old target checkout without its dispatcher, target-native continuation and next actual consumer after continuation conversion; and a separate historical-only case without target upgrade, invented passes, hooks/commit or peer writes. Validate byte/mode preservation and exact session/binding retirement; cover fixed-candidate output loss/partial replay/rollback and install-then-migrate-then-tool-rollback incompatibility. Keep security/adversarial, lock/TOCTOU and broad crash-hardening scenarios outside this issue.

## Files found

| File / area | Description |
| --- | --- |
| `packages/cli/src/commands/migration2.ts`, `migration2-schema.ts` | Full Plan2 candidate, source validation, identity/copy inventory, prepared write set and retry logic. |
| `packages/cli/src/commands/migrate.ts`, `src/cli/index.ts` | Versioned CLI dispatch, actual arguments and migration result types. |
| `packages/core/src/task/migration.ts`, `migration-v2.ts`, `schema.ts` | Known predecessor formats and lossless projections; strict schema1 parser. |
| `packages/core/src/task/v2/{types,schema,operations,store,artifacts,index}.ts` | Current aggregate, closed operations, authority/candidate verification, relocation and public exports. |
| `packages/cli/src/templates/trellis/scripts/common/{active_task,session_storage,delivery_session,runtime_contract,io}.py` | Exact current selection, session JSON, branch ownership and strict runtime boundaries. |
| `packages/cli/src/templates/trellis/scripts/common/{task_store,task_utils,task_artifacts,task_context,tasks}.py` | Existing archive side effects, relocation, archive reference resolution and inventory views. |
| `packages/cli/src/templates/trellis/scripts/get_context.py`, `common/git_context.py` | Native context/continuation entry and early failure boundary. |
| Tests listed above | Real-worktree/current-reader and migration parity evidence anchors. |

## Related specs and external references

Read `.trellis/workflow.md`, `.trellis/spec/core/backend/index.md`, and CLI backend `task-lifecycle.md`, `delivery-lifecycle.md`, `trellis-core-sdk.md`, relevant Plan2/mixed/inherited-copy sections of `commands-migrate.md`. Shipped public lifecycle contract: `packages/cli/src/templates/trellis/delivery-contract.md`.

Live requirement: https://github.com/castbox/Trellis/issues/40. Paired Guru owner boundary: https://github.com/castbox/guru-trellis/issues/566 (linked by the live Issue; not treated as independently fetched requirement authority). Package identity observed is `0.7.0-castbox.3`; no build, pack, install or remote release verification was performed.

## Caveats / Not Found

- Static research only; no tests/build/install or business writes ran. No git/lifecycle mutations occurred. Only this research file was authored.
- No existing independent task maintenance/history-archive API, production rollback API, public Core session/branch-retirement API, or native pending-maintenance DTO was found. Names/signatures for new APIs remain design work.
- Legacy session support must be designed explicitly; current normal APIs intentionally cannot retire all supported historical carriers. An old malformed/unattributable pointer must produce an explicit diagnosis, never broad deletion or presumed success.
- Full Plan2 `history_only` preserves already-historical raw data; it is not permission to archive a record-bearing active Task. Current v2 relocate/archive cannot satisfy history-only archival without new separate behavior.
- Real target legacy sample compatibility is not established by synthetic known-format tests. Public schema1, positively known older legacy, Guru private fields and unknown data must stay distinct; original workflow owners retain attribution of scope, outcomes and remaining external responsibilities.
