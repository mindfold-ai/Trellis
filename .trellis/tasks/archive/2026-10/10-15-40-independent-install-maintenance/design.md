# Design: Independent installation and selected-task maintenance

## 1. Status, authority and decision

This is the implementation design for [Trellis #40](https://github.com/castbox/Trellis/issues/40), based on `main@dde5f90903e9299236e3574d4dfab6441daec09d`. Public contracts below are implemented and validated in this Task; implement.md records verification status. [prd.md](./prd.md) owns requirements and acceptance. Research evidence is in [tools-installation.md](./research/tools-installation.md) and [task-maintenance.md](./research/task-maintenance.md).

Add one explicit maintenance command family and a matching public CLI SDK. It has three independent, closed operation plans: tools installation, selected-Task conversion, and historical closeout. Shared code is limited to actual source classification, exact snapshots, prepared actions and same-operation recovery. Do not create a second lifecycle, policy engine, generic plugin system, permanent mapping store or a reduced-inventory Plan2.

The source contains no extra normative task solution document. The Issue's public ownership/compatibility requirements and existing repository specs constrain this design. The changed cross-version behavior is explicit in the new operation; ordinary update/init, full Plan1/Plan2, current Task writers and normal archive keep their existing contracts.

## 2. Responsibility and affected boundaries

| Owner | Owns | Does not own |
| --- | --- | --- |
| Core `/task/maintenance` (new explicit subpath) | Positive predecessor classification; lossless selected projection and legacy-fact validation; closed session/binding classification and exact identity attribution | CLI argv/output, template/provider fetching, workflow choice, semantic completion or remote PR verification |
| Existing Core `/task/v2`, `/task/migration-v2`, `/task/legacy-migration` | Current schema/operations, existing projection and predecessor validators, candidate/authority checks | Automatic old-status promotion or tools installation |
| CLI `commands/maintenance/` | Explicit target discovery, prospective public templates, operation preparation, bounded writes/backups/recovery, public CLI/SDK results | Guru private state, source/accepted-scope selection, semantic gate approval, resource creation or Git integration |
| Shipped Python common/runtime layer | Normal strict selection, actionable pending-maintenance diagnostics, matching deterministic binding classification needed by native consumers | Deciding conversion/closeout intent or silently repairing state |
| Calling workflow / Guru #566 | Exact target/intention, reviewed projection, history attribution by original owners, required dialogue interaction, private artifacts, Reconcile business judgment and next-owner semantic validation | Reimplementing public updater/model conversion |

Reuse `validateTaskV2Projection` rather than weakening `writeTaskRecordV2`. Extract the existing per-task predecessor/fact/planning validation below Plan2's completeness checks, keeping one implementation where both callers need the same rule. Keep whole-repository inventory checks in the Plan2 caller. Template collection, ownership/receipt handling and write mechanics remain CLI code; no updater moves into Core's Task domain.

## 3. Supported sources and target identity

### 3.1 Source support

| Dimension | Supported contract |
| --- | --- |
| Installed version | Existing stable `0.6.x` and `0.7.0-castbox.N` (`N >= 1`), no newer than the executing candidate; same-version tool/schema cutover is supported. Missing, unknown, beta/RC or newer versions are diagnosed before unsupported writes. |
| Old Task | Positively known pre-identity legacy accepted by `isKnownLegacyTaskRecord`, or canonical schema1 accepted by `taskRecordSchema`. Missing generation means zero only for the positively known legacy format. Schema1 has no literal `schema_version: "1.0"` field. |
| Current Task | Schema2 is preserved by tools installation. The converter does not reinterpret an already-current Task as a predecessor; same-operation completed recovery is separate. |
| History closeout | Supported legacy/schema1 selected active Task, or its exact already-created archive on recovery. Unknown/malformed active formats return a precise unsupported-source diagnostic, not current authority or wildcard archival permission. |
| Sessions | Existing integer schema2/schema3 identity bindings; positively identified unversioned local and schema1 path-based predecessor carriers evidenced by current session tests. Map old paths to the exact selected original Task before proposing conversion/retirement. Unattributable data is not deleted. |
| Branch binding | Existing closed schema1 common-dir TaskId/generation/branch binding. Conversion preserves it by default; a missing binding may be established only from an explicit original-owner binding decision with an expected-absence precondition and the actual target branch. Closeout may retire the exact matching binding. Maintenance does not infer or silently replace ownership. |

Source versions and Task formats are separate checks. Neither a version string nor a file named `delivery.py` proves capability or package equality. Package identity binds actual executing CLI/Core content, and native success still requires actual target consumers.

### 3.2 Selection without execution bootstrap

The public entry requires an explicit existing project root. A Task operation additionally requires `TaskKey {task_id,lifecycle_generation}` and an explicit Task locator from inspection. These are maintenance selection inputs, not a normal session binding or authorization.

Resolve Git registration/common-dir facts without selecting the current Task. Validate the explicitly selected raw predecessor and its identity before any conversion. Observe only relevant inherited copies and identity reservations needed to establish a unique authority; mutable planning is not merged. Where copies exist, a common branch binding must select the target's unique live branch checkout; preserve inherited peers byte-for-byte. Use the original binding when present. If it is absent, the original workflow owner may supply an explicit reviewed establishment decision to the conversion plan, bound to absence and the actual branch; preparation does not establish it or require normal Identity first. A conflicting/ambiguous binding or an unresolved ownership decision stops with a concrete diagnostic. A Git-free project is target-local. Preserve existing contained aliases and prunable-worktree rules; do not add resource repair or prune actions.

Do not call target `get_context.py`, its dispatcher, current Task parser, Identity or Reconcile to prepare maintenance. Target-native calls are postconditions after supported tools/data have been installed.

## 4. Public invocation and minimal contracts

### 4.1 CLI and matching runtime

The proposed CLI family is `trellis maintain`. It must work from a complete matching candidate package regardless of the invoking shell's current project:

```text
trellis maintain contract --json
trellis maintain inspect-tools --target <project> --json
trellis maintain inspect-task --target <project> --task-id <id> --generation <n> --task-ref <ref> --json
trellis maintain prepare --input <reviewed-operation-input.json> --json
trellis maintain preview --plan <private-plan.json> --json
trellis maintain apply --plan <private-plan.json> --state-dir <private-directory> --json
trellis maintain recover --recovery <private-operation-directory> --json
trellis maintain resume --recovery <private-operation-directory> --json
trellis maintain rollback --recovery <private-operation-directory> --json
```

`prepare` prints a private plan; the caller chooses an external/ignored file for subsequent invocations. Inspect/prepare/preview do not write to the target or create resources. `apply` is the explicitly invoked write operation; runtime does not persist user authorization. A conflict does not prompt from inside a Node SDK call. The caller supplies a revised reviewed input when a real choice is necessary. JSON mode emits one result/error document on stdout; suppress unrelated startup update notices for this command, as migration already does. Diagnostic prose belongs on stderr.

The candidate `contract` result declares `maintenance_api: "1.0"`, supported operation-plan kinds, source version/record/session families, CLI version and Core version. Missing/mismatched capability rejects before writes. It does not claim release status, semantic approval or source provenance. Exact source/build/tar identities are supplied by package verification evidence; execution additionally freezes the actual CLI/Core package bytes/modes used by that operation.

Package fingerprints cover durable `package.json`, `bin`, `src` and `dist`
content/modes. Exclude interpreter-generated `__pycache__` directories and
`.pyc`/`.pyo` files so an ordinary Python import between prepare and execute
does not change candidate identity. Actual source/build edits and permission
changes remain stale-candidate errors; a new package still needs a fresh plan.

### 4.2 Public SDK surface

Expose the command implementation through a documented named `maintenance` namespace from the existing CLI package root (`import { maintenance } from "@mindfoldhq/trellis"`), not an undocumented deep import from `dist/commands`. Preserve existing `VERSION`/`init` exports and current package path resolution; do not add a restrictive CLI exports map that breaks existing imports. Add only the Core `./task/maintenance` explicit subpath without widening legacy `/task` or Core root exports.

Proposed CLI SDK functions, all with explicit roots and structured results:

- `getMaintenanceContract()`.
- `inspectToolsTarget({root})` and `inspectTaskTarget({root,key,task_ref})`.
- `prepareToolsInstallation(input)`, `prepareTaskConversion(input)`, `prepareLegacyCloseout(input)`; each takes its own closed input and returns its own closed plan or a preparation error.
- `previewMaintenance(plan)` and `applyMaintenance(plan,{state_dir})`; plan is the discriminated union of the three independent plans.
- `recoverMaintenance({recovery_ref})`, `resumeMaintenance({recovery_ref})`, `rollbackMaintenance({recovery_ref})`; these read the original operation, never regenerate it.

Core exposes the small source/projection/binding classification validators consumed by those functions and by native parity tests. New detailed type names may be local, but operation kinds and published input/result semantics above are the API commitment. APIs throw typed maintenance errors; Core never prints, exits or parses CLI argv. Full exact TypeScript interfaces and JSON schema examples are implemented and documented together, before Guru starts consuming them.

### 4.3 Independent input/plan/result contracts

The closed preparation inputs use these exact conceptual fields (raw snapshots are the existing bytes/SHA/mode type):

- `ToolsInstallationInput`: `root`, `workflow` and `file_decisions`. `workflow` is either `{action:"preserve"}` or `{action:"install",template_id,provider,content,ownership:"bundled"|"custom"}`. A bundled identity must resolve to the actual bundle; custom content/provider stays custom. Configured platforms are read/frozen from the target, not guessed or added. File decisions identify exact observed paths and choose replace/preserve/create-new/remove within managed ownership.
- `TaskConversionInput`: `root`, `key`, `task_ref`, `source_kind` (`legacy|schema1`), `projection`, `artifacts`, `legacy_facts`, `sessions`, `branch_binding`. Each artifact has an explicit preserve/write disposition and original raw preimage. Session decisions reference exact inspected carriers and preserve or replace them with the explicit Task/nullable-Delivery selection. `branch_binding` is preserve with its raw preimage, or establish with expected absence and an original-owner-supplied closed schema1 binding; no arbitrary control-file path or implicit rebind.
- `LegacyCloseoutInput`: `root`, `key`, `task_ref`, `source_kind`, `archive_ref`, `history_note`, `retirements`. Every retirement names one positively matched inspected carrier and raw preimage; the branch binding is an optional exact member, never a wildcard. Archive destination and note content are fixed before apply.

No input includes a user-authorization flag or a universal pass. `projection` and original-owner fact dispositions are reviewed business inputs, not scripts that generate that review. Action preparation turns these inputs into fixed deterministic writes, and validates scope/preimages again before execution.


| Kind | Closed input payload | Private frozen plan content | Direct successful result |
| --- | --- | --- | --- |
| `tools_install` | Explicit root, selected workflow/provider decision or explicit preserve, concrete local-edit dispositions; configured platforms come from the target installation | Original installation/runtime/receipt preimages; actual new package/template candidate; exact managed tool and sidecar actions; expected final workflow/receipt ownership; restore-compatibility baseline | `tools_installed`, target, installed candidate identity and recovery reference; Task maintenance needs remain separate |
| `task_conversion` | Explicit root/TaskKey/ref, declared predecessor kind, original-owner full Task2 projection, explicit planning/artifact mappings, legacy-fact attribution, matched session decisions and explicit preserve/establish branch-binding disposition | Frozen selected source/task artifacts, fixed Delivery/result IDs from that projection, necessary exact binding/session preimages and exact actions; target data/runtime requirements | `task_converted`, same TaskKey, target ref and recovery reference; continuation is a separate observed postcondition |
| `legacy_closeout` | Explicit root/TaskKey/ref, fixed managed archive destination, owner-authored history note with pending external responsibilities and exact matched binding dispositions | Frozen selected raw task tree, destination absence/preimages, note bytes and exact attributable session/branch actions; no target tools writes | `history_archived`, same TaskKey, archive locator and recovery reference; no new-model completion result |

Each plan uses `schema_version: "1.0"` plus its single `kind`, exact target identity and package candidate binding. Preparation allocates one `operation_id`, retained in the plan and used as the recovery directory name under the explicit state root. Apply never reallocates it; repeating the same plan addresses that same operation and cannot overwrite its original backup anchors. Do not add a new generation, Task status or Delivery phase for maintenance. A private plan carries original bytes/modes because its immediate executor/recovery consumer needs them; it is not a public handoff or an audit database. Its output does not repeat full inventories or reviews. Paths/hashes are local content/freshness facts, not workflow authority.

Preparation reports `conflict` with exact paths/reasons for unchosen modified required assets or ambiguous attribution. Errors include unsupported source/runtime, target/key mismatch, ambiguous authority, stale source/target, candidate mismatch, later-work conflict, incompatible restore and incomplete operation. Unknown or unsupported data never becomes `no_current_task` success. No optional catch-all metadata/extensions bag is introduced.

## 5. Tool installation algorithm

1. Inspect only the explicit installation, supported source version, public managed ownership and configured platforms. No old Task conversion/session rewrite or complete-workspace migration inventory is required.
2. Extract prospective template collection from current migration/update code without calling installed-runtime preflight. Preserve Codex model keys, configured Claude status line, registry config, skip paths, AGENTS managed blocks and custom-workflow ownership under their existing rules. Do not fetch/rewrite project-owned specs as a side effect of tools-only update.
3. Build exact actions from raw current bytes/modes and the real package candidate. Use normalized template hashes only for ownership; use raw digests/modes for backups/replay. Old flat/missing receipts mean unknown ownership and require explicit conflict dispositions where applicable.
4. A bundled workflow switch uses its explicit template identity; a custom workflow/provider candidate remains custom even if its bytes equal a bundle. A preserve decision retains bytes/mode and original receipt ownership. A `.new` workflow preview is not activation. An explicit custom cutover must be supplied as reviewed complete workflow content/provider identity, without a target preflight that first requires migrated Tasks.
5. Required tool/script conflicts cannot be reported as a successful coherent installation merely because sidecars were written. A sidecar-only decision returns preparation/preview, or blocks installation completion until resolved. Nonrequired/user-owned content may be preserved only if the actual resulting runtime is supported. The version/declaration/receipt become genuine installation results, never temporary preflight exceptions.
6. Back up the exact writes before applying them. Install scripts and assets, apply the reviewed workflow decision and genuine receipts/version, then verify the actual target tool contract and native entry. Do not create an onboarding Task, select a Delivery, rebind sessions or run business hooks.
7. Read-only postvalidation reports whether selected old state needs maintenance. Installation can succeed with a classified supported pending-maintenance state; it must not claim that old Task execution was restored.

Ordinary `update` keeps its exact-version gate and current contracts. Share collector, ownership, managed-block and write preparation primitives below both commands instead of copying the updater. `workflow --create-new` and explicit apply retain their current semantics outside this dedicated install operation.

## 6. Selected-task conversion algorithm

1. Inspect supported raw source and relevant original binding/copy facts through the maintenance selector in section 3. Normal current-Task selection remains strict.
2. Validate the complete caller projection with the existing positive predecessor validator and `validateTaskV2Projection`. Preserve original source/generation/business fields and exact child relations. Core/CLI validate every old commit/PR/completion-date disposition using the existing per-task Plan2 attribution rule; the original semantic producer owns its truth. Use existing immutable local-commit verification for that fact type; do not claim to verify GitHub/manual outcomes through it.
3. Retain original root plans and raw source at the established task-local migration source location. Explicitly map the selected Delivery plans/manifests under `deliveries/<DeliveryId>` and retain their history. Reuse the existing per-Delivery five-artifact requirement where the same migration profile is applied. No artifact_origin initialization or history rewrite is smuggled into conversion.
4. Project only owner-supplied phases/facts. A planning Delivery can have empty gates and reenter its real owner; a verified historical delivered Delivery can retain facts with old gates unapproved. A Task with no current Delivery remains legal. Do not allocate Delivery IDs during apply/retry or select a sole Delivery implicitly.
5. Enumerate only associated current/predecessor session carriers and exact binding actions required for this Task. Convert a selected session to schema3 only with an explicit Task/nullable Delivery selection belonging to the projection. Preserve unrelated sessions and other generations. Preserve an existing common branch binding. When none exists and native resolution needs one, accept only the original workflow owner's explicit establish disposition with exact expected absence, TaskKey and actual target branch; validate/write that public binding as part of the reviewed Task-maintenance scope. Do not run a current-parser-dependent binding owner first or infer the establishment decision from the directory/branch name.
6. Apply only selected Task/planning/session actions, without changing target tools or integrating Git. If tools installation is necessary, the caller reviews both write sets and invokes the independent operation with a coherent candidate. Data conversion preparation can run before those target tools are available.
7. After the combined operations, invoke the target's own normal current/context/continuation entry and the actual next workflow owner. The upstream native fixture must execute a genuine next step, not just parse a DTO. For a delivered-but-unaccepted fixture, its native completion owner observes pending evidence rather than inventing a new Delivery. Guru-specific owner verification remains paired #566 evidence.

A mismatching target runtime yields `task_converted` plus an explicit pending native-validation result, never a restored-continuation claim. The complete operation is accepted only when PRD A3/A4 demonstrate the actual consumer chain. `contract` and data schemas do not grant semantic approval.

## 7. Historical closeout and exact retirement

Do not call ordinary `task.py archive`, `cmd_archive`, `archive_task_dir` or `relocateTaskRecordV2` to perform old history retention. Those operations intentionally require new-model completion or write legacy completion/date, may touch children, clear early, commit or run hooks.

The dedicated closeout operation preserves the selected old task record and planning bytes/modes. It copies the frozen tree to one fixed managed archive destination, adds only the owner-authored history note, and verifies readability/equality before any binding retirement. Then retire the exact pre-reviewed matching carriers, and remove the original active tree only after its archive and retirement postconditions are satisfied. The final result requires one readable archive and no active selection of that exact old Task.

Inspect shared common-dir schema2/schema3 sessions; target-local predecessor carriers; and peer-local carriers only where they are positively attributed to this Task. Attribution uses the supported carrier shape, canonical original task locator and raw task identity/generation; it never follows a guessed path or deletes by name substring. Every associated carrier, including an attributable peer-local carrier when present, must be individually shown in the maintenance write set and reviewed by the caller; it is not permission to update peer tools, peer Task copies or unrelated sessions. If the caller explicitly limits maintenance to target-local/common paths, a required peer-local retirement is a concrete scope conflict before mutation, not an implicit extension. Common-dir references to this same TaskKey are explicit shared actions; unrelated Tasks/sessions and same-id other generations stay unchanged.

The old unversioned/schema1 local carriers must not resurface when a common session is removed. Unknown/unattributable or scope-excluded live references prevent a completed closeout claim. Already-missing matching carriers on same-operation recovery are completed actions, not reason to regenerate the archive.

Re-enumerate positively attributable same-Task session and branch carriers before
historical closeout writes and on result recovery, including after active-tree
removal. A newly created carrier outside the frozen retirement set is ordinary
stale input: return `stale_source` with its path before writing, and require a
fresh reviewed plan rather than expanding the original write set. An original
carrier already retired by the same operation remains a completed action; later
edits to owned paths retain the existing conflict behavior.

Keep TaskId/generation and external obligations. The operation creates no Completion/Closure/Finish pass, changes no child Task, runs no hook, stages no file, commits nothing, closes no source Issue and removes no branch/worktree. A normal old target can verify its own selection postcondition without upgrading target tools. The archive stays legacy history; it is not newly eligible for schema2 Reactivate. Future conversion/reactivation uses its own explicit owner.

## 8. Same-operation recovery and compatible restoration

### 8.1 State and replay

`apply` consumes the fixed plan operation identity and stores only the private plan, necessary preimages/postimages and bounded progress/result under the explicit ignored/external `state-dir`. Reject a tracked/public task artifact path for this state. It is not a repository registry, semantic gate or authorization record. No new locks, process ownership or crash protocol is introduced.

Before the first write, validate all original inputs and backups. For ordinary partial reentry, each bounded path must equal its frozen source or target bytes/mode; then skip completed actions and apply remaining ones. Reject a changed third state before further writes. Archive source/destination actions use the original fixed destination and frozen tree; month changes cannot create another archive. For output loss, `recover` inspects the original operation and live postconditions, returning its same terminal result or explicit pending actions; it does not execute fresh writes. `resume` executes only those original actions.

Do not reuse full ablation storage, its broad ownership or its lock protocol. Share only existing low-level raw snapshots/atomic-file primitives where appropriate. Existing Plan2 replay remains same-plan and its backup remains caller-owned; this Task does not silently replace that contract with the new recovery store.

### 8.2 Restore compatibility

Rollback first checks later changes and the proposed complete tool/data combination, then restores only that operation's preimages. It never resets Git or rewinds commits, and never enrolls a later migration's files into an earlier tool backup.

Compatibility means the restored runtime can serve its declared current data/selection or its explicitly supported pending-maintenance state. It does not mean every historical record becomes executable. Determine support from the original frozen workflow/runtime capabilities and actual data/session shapes, not equal version labels alone. Use the existing supported predecessor/current schema classifiers, source declaration/profile rules and a positively established source-reader capability; if source tools were locally changed and support cannot be established, return `restore_compatibility_unknown` before restoration. Do not run the target's broken old dispatcher as a maintenance entry prerequisite.

Required cases:

- Tools rollback after Task2/session3 conversion cannot restore an undeclared legacy-only execution runtime over that new current selection; return `incompatible_restore` and describe the needed combination boundary, with zero data writes.
- Data rollback under newer tools may restore a supported old Task in pending-maintenance state; report that limitation and never claim continuation restored.
- A prior compatible combination with unchanged owned paths restores exact bytes/modes. Unrelated later business files are outside the write set and survive.
- A changed owned Task/session/tool path blocks restoration unless a separate reviewed combination operation is supplied. Recovery never overwrites later business work.
- For historical-closeout rollback, recreate and verify the original active tree before restoring matching bindings; retain/remove only this operation's archive/note according to its frozen state. Refuse restoring stale bindings over a newer selection.

The implementation must encode positive source-runtime/data compatibility rules and demonstrate them in focused fixtures. Unverifiable custom-runtime cases remain explicit blocked restoration, not an unsupported success claim.

## 9. Native diagnostics, package handoff and documentation

Keep complete current Task readers/writers strict. Extend the native resolution error projection for a positively recognized old selected Task with `maintenance_required`, the exact TaskKey/locator when known, supported-source reason and an external matching `trellis maintain inspect-task` invocation hint. Do not set a usable current Task/Delivery path, default to another Task or make continuation silently task-free. Bad JSON/current malformed data retains its existing concrete error rather than being relabeled as valid legacy.

Shipped Python and `.trellis/scripts` twins change together. Any structured diagnostic addition is additive to the existing error/stale contract and exercised through actual SessionStart/current/context/continuation consumers applicable to the changed reader. Workflow semantics remain Markdown; hooks only carry the facts and current workflow instruction.

Document `maintain`, the CLI root maintenance namespace and the Core maintenance subpath, source-format table, local-edit/sidecar outcomes, private recovery lifecycle and specific error meanings. Update installed-version/update/migration/delivery specs to distinguish ordinary operations from explicit maintenance. No docs-site submodule mutation is necessary for this first contribution; repository README/specs and published package API documentation are the immediate consumers.

Provide a matched source/build/CLI-tar/Core-tar manifest plus actual installed bin and target-native evidence. Do not publish or bump a same-version npm replacement as part of this Task. Candidate packaging and public API invocation are tested locally; release/version choice is a separate release action. Guru #566 consumes the exact candidate and records its own joint owner/overlay evidence before claiming business workflow recovery. Neither Issue needs to be CLOSED first.

## Supported selected Task directory aliases

Existing individual Task-directory aliases retain their native logical Task-root
meaning. Conversion preserves the original raw link and backing directory. History
closeout archives the readable logical tree first, retires exact carriers, removes
its files/child directories, then unlinks the selected logical root. The now-empty
backing root remains; deleting external storage resources is outside maintenance.
Rollback restores the exact link before the original contents and directory modes.
Directory snapshots retain the original link target solely for this direct recovery
consumer. Archive directories are ordinary directories, never copied links. A later
link-target change is a stale preimage. Nested arbitrary aliases do not gain scope.
