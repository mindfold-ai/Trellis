# Independent Maintenance

`trellis maintain` is an explicit maintenance boundary. It does not select the
current Task, call the old target dispatcher, create Git resources, or change
ordinary init/update, full Plan1/Plan2, current lifecycle writers or normal archive.
CLI owns installation/execution; Core `/task/maintenance` owns positive source,
projection and carrier validation. AI workflow owners supply scope/history
attribution and semantic decisions; neither API records authorization.

## Source and target

Every operation requires one existing exact project root. Supported installation
versions are stable 0.6.x and 0.7.0-castbox.N (N >= 1), no newer than the complete
executing matching CLI/Core candidate. Same-version cutover is supported. Missing,
unknown, beta/RC and newer source versions are explicit errors.

Selected Task operations take `{task_id,lifecycle_generation}` and a direct active
`.trellis/tasks/<directory>` locator. Explicit inspection and archived resume also
accept `.trellis/tasks/archive/YYYY-MM/<directory>`; the separate formal
predecessor operation also consumes an exact archive. Ordinary conversion and
history closeout remain active-only. Known preidentity legacy and strict schema1
are predecessors; schema1 has no literal schema_version field. Schema2 is preserved
by tools installation and rejected as a fresh conversion predecessor. Unknown
records are not an empty selection. Existing identity sessions (integer 2/3),
positively matched path1 and unversioned local carriers, and canonical branch
bindings are inspected without normal lifecycle bootstrap. Inherited peer copies
establish ownership only; their Task/tool bytes are not migration targets.

## CLI and SDK

```sh
trellis maintain contract --json
trellis maintain inspect-tools --target /existing/project --json
trellis maintain inspect-task --target /existing/project --task-id task-id --generation 0 --task-ref .trellis/tasks/task-directory --json
trellis maintain prepare --input /private/input.json --json
trellis maintain preview --plan /private/plan.json --json
trellis maintain apply --plan /private/plan.json --state-dir /private/recovery --json
trellis maintain recover --recovery /private/recovery/operation-id.json --json
trellis maintain resume --recovery /private/recovery/operation-id.json --json
trellis maintain rollback --recovery /private/recovery/operation-id.json --json
```

Inspect/prepare/preview are target-write-free. Prepare prints a frozen plan; the
caller saves stdout in an external/ignored file. Recovery takes the returned exact
file reference. JSON is also the default output. Startup update notices are disabled
for this family. Runtime errors return `{error:{code,message}}` with exit code 1.

```ts
import { maintenance } from "@mindfoldhq/trellis";
const capability = maintenance.getMaintenanceContract(); // maintenance_api: "1.0"
const observed = await maintenance.inspectToolsTarget({root});
const plan = await maintenance.prepareToolsInstallation({
  root, workflow: {action: "preserve"}, file_decisions: []
});
maintenance.previewMaintenance(plan);
const result = await maintenance.applyMaintenance(plan, {state_dir});
await maintenance.recoverMaintenance({recovery_ref: result.recovery_ref!});
```

The additive namespace preserves VERSION/init and existing CLI path resolution.
Core adds only `@mindfoldhq/trellis-core/task/maintenance`; it is not a current
writer and is not reexported through legacy `/task` or Core root.

## Closed inputs

CLI prepare takes `{kind,input}`; kind is `tools_install`, `task_conversion`,
`legacy_closeout`, `task_resume` or `formal_archive_reactivation`. SDK has separate typed preparation functions. Exact exported
TypeScript types and closed parsers live in
`packages/cli/src/commands/maintenance/{tools,tasks}.ts`; they are exported through
the public namespace. A raw snapshot is
`{content_base64:string,sha256:string,mode:number}` (permission bits, 0..511), or
null for absence. Hashes bind local bytes, not semantic authority.

Tools input is `{root,workflow,file_decisions}`. Workflow is `{action:"preserve"}`
or `{action:"install",template_id,provider,content,ownership:"bundled"|"custom"}`.
Each existing file decision is `{path,source,action:"replace"|"preserve"|"create-new"|"remove"}`.
For caller-composed project instructions, the additive decision is
`{path:"AGENTS.md",source,action:"custom",content:string}`. Only AGENTS.md accepts
this action. The caller supplies final content before prepare; preparation freezes
it without a later target patch. The private guard retains that content for
apply/recover/resume selection validation. Existing modes, preimage checks and
later-work conflicts apply. The template receipt still records the prospective
Core rendering, so custom caller bytes do not become a Core template baseline.
A later ordinary update continues to use its existing local-edit dispositions.
`maintain contract` exposes `tools_custom_instruction:{path:"AGENTS.md",action:"custom"}`
for callers that need to select this capability before preparation.
Configured platforms come from the target. Required runtime conflicts or skip rules
block coherent installation; sidecars are not activation. Explicit bundled identity
must match the real bundle; custom remains custom even with bundled-equal bytes.
Project specs and Task/session/binding data are outside this operation.

Conversion input is `{root,key,task_ref,source_kind,projection,artifacts,
legacy_facts,sessions,branch_binding}`. source_kind is legacy/schema1. Projection
is the complete owner-authored Task2 with fixed Delivery/result IDs. Artifacts are
`{path,action:"preserve",source}` or `{path,action:"write",source,target}`; all retained
files need a disposition and planning references must resolve. Legacy facts name
commit/pr_url/completedAt, owner_id, reason `{locator,revision}`, and disposition
source_snapshot or delivery_result with result_id (completedAt is snapshot-only).
Sessions each contain `{carrier,action:"preserve"|"replace",delivery_id:string|null}`;
a carrier is `{root,path,source,kind:"session"|"branch_binding"}`. Every selected
carrier requires an explicit disposition. Branch binding is
`{action:"preserve",source}` or `{action:"establish",source:null,record}` with a closed
schema1 binding matching Task/generation and actual target branch. Absence does not
grant implicit ownership. Current gates are not inferred from old status or PR.

Historical closeout input is `{root,key,task_ref,source_kind,archive_ref,history_note,
retirements}`. For example, a Git-free project with no selected carriers can use:

```json
{
  "kind": "legacy_closeout",
  "input": {
    "root": "/existing/project",
    "key": {"task_id": "task-id", "lifecycle_generation": 0},
    "task_ref": ".trellis/tasks/task-directory",
    "source_kind": "schema1",
    "archive_ref": ".trellis/tasks/archive/2026-10/task-id",
    "history_note": "Original owner: delivery retained; external acceptance remains pending.",
    "retirements": []
  }
}
```

A readable exact raw archive (including directory/file modes and empty directories)
and note precede exact carrier retirement, which precedes active-tree removal.
A supported individual Task-directory link remains intact on conversion. Historical
closeout unlinks its logical root after archiving/removing its contents, leaving the
empty backing root outside resource-cleanup scope. Rollback restores the raw link
and original contents/modes; archive directories themselves are plain directories.
No old completion date/status is rewritten; no hooks, child mutation, Git cleanup,
commit, Issue closure or new-model Completion/Closure/Finish is implied.

## Plans, results and recovery

Prepared plans have schema_version 1.0, one kind, fixed operation_id, target_root,
common_dir, actual candidate CLI/Core versions and package digests, closed
operation-specific guard, and exact file/directory source/target actions. Task guards
also freeze the actual target branch; every replay revalidates its unique registered
owner before writes, so an ordinary intervening branch switch requires returning
to the original owner or preparing a newly reviewed operation. Plans
are private executor/recovery inputs, not lifecycle handoff or approval artifacts.

Preview and executor results are
`{operation_id,kind,status,pending_paths,recovery_ref}`. Status is prepared, pending,
applied or rolled_back; recovery_ref is null before execution and the original
operation file thereafter. Applied means the bounded writes and relevant mechanical
postconditions succeeded. It does not claim semantic continuation, acceptance or
completion. Tools apply probes the actual installed contract/context. A supported
old Task may still report maintenance_required with no current execution authority.
Conversion acceptance additionally requires the target native entry and real next
owner; historical acceptance requires normal selection no longer choosing old state.
These proofs remain distinct from executor status and business completion.

For historical closeout, each execution and result recovery freshly enumerates
the positively attributable same-Task session/branch carriers. A carrier absent
from the prepared retirement set returns `stale_source` with its path before
any write; the caller must review a fresh plan instead of silently adding it to
the write set. Already-retired original carriers do not prevent same-operation
recovery. Existing checks still protect later edits to owned paths.

The fixed original plan is saved before writes. Reapply/resume and lost-output
recovery reuse that operation and original preimages. Ordinary partial writes
accept only source/target states. Later edits to owned paths stop with
later_work_conflict; unrelated business files survive. Rollback restores only the
original write set. Old-tool restoration over Task2/session3 data is blocked as
incompatible_restore; unknown source reader compatibility stops as well. A combined
restoration needs a separate reviewed operation, never expanded backups.

Typical diagnostics include unsupported_source/version/carrier, target_key_mismatch,
ambiguous_authority, conflict, stale_source, candidate_mismatch, later_work_conflict,
incompatible_restore and restore_compatibility_unknown. Same version labels alone
do not identify builds: candidate fingerprints bind the durable bytes/modes in
`package.json`, `bin`, `src` and `dist`. Python runtime `__pycache__` directories
and `.pyc`/`.pyo` files are excluded: a normal import may create them after
preparation without changing the candidate. Real source/build byte or permission
changes still return `candidate_mismatch` before writes. Cache exclusion does not
permit applying a plan prepared for an earlier package build.

## Verification boundary

Use real worktree snapshots, public bin/SDK and target-native consumers. Build Core
before CLI; install the exact packed pair in a throwaway to verify package exports
and dependency rewrite. Preserve full Plan1/Plan2 and ordinary update regressions,
minimum Python 3.9 support and shipped/dogfood parity. This is targeted maintenance
acceptance, not the full release/platform matrix or Guru overlay/business acceptance.

Candidate freshness regression must use an isolated public package: prepare with
cold caches, let a real Python import create bytecode, then execute the original
plan successfully. A real source/build edit must still fail before target writes.
Do not make CI disable bytecode or serialize tests to hide cache-sensitive hashes.

The supported unversioned local session includes both the historical singleton
`current_task` shape and the original 0.6 `set_active_task` metadata shape:
`platform`, `last_seen_at`, `current_task`, `current_run: null`, plus the
writer's optional session/conversation/transcript string aliases. Maintenance
classifies these as path carriers; native current execution still stops with
maintenance-required for a positively supported old selected Task.

### Native schema-1 session metadata

#### Scope and signatures

`classifySessionCarrier(value, selected)` on Core `/task/maintenance` also
recognizes schema-1 records emitted by the original native `set_active_task`
writer. CLI `maintenance.inspectTaskTarget` and both selected-Task preparation
APIs consume that classification; their signatures and current native execution
authority are unchanged. The original writer is traceable at
`43fffc170927c85d9f7fc106cc5a059e80d4530b`, shipped
`common/active_task.py`, `_context_metadata` and `set_active_task`.

#### Closed contract

Keep the existing exact four-field schema-1 form (`schema_version: 1`,
`repository_common_dir`, `task_workspace_root`, `current_task`). The writer form
adds required nonempty strings `platform` and `last_seen_at`, plus required
`current_run: null`. Only these optional nonempty string aliases are allowed:
`session_id`, `sessionId`, `sessionID`, `conversation_id`, `conversationId`,
`conversationID`, `transcript_path`, `transcriptPath`, `transcript`.
Metadata is predecessor context, never Task/Delivery execution authority.

Both forms retain existing absolute workspace/common-dir validation and resolve
the original workspace plus `current_task` against the selected Task path and
repository common directory. Do not infer ownership from platform/session IDs.

#### Validation and cases

| Input | Result |
| --- | --- |
| Complete writer form selecting the exact Task/workspace/common-dir | `path1`, `matches: true`; include in explicit selected dispositions. |
| Existing exact four-field form | Existing `path1` behavior. |
| Supported form naming another Task/workspace/common-dir | `matches: false`; exclude from selected writes and preserve bytes/modes. |
| Unknown field, partial metadata, empty/non-string metadata, non-null run slot | `unsupported_carrier`; do not silently skip it. |

Good: inspect shared storage containing both selected and unrelated complete
writer records. Base: inspect the original minimal schema-1 form. Bad: strip
metadata from real source records or accept arbitrary keys to bypass the error.

#### Required regression proof

Core tests use writer-derived metadata-bearing schema-1 inputs and cover the
finite aliases, minimal form, ownership mismatches and closed-format rejection.
CLI real-Git/shared-session tests cover inspect/prepare, conversion and historical
closeout, selected fixed-plan effects, unselected bytes/modes, same-operation
recovery and rollback through existing maintenance APIs. Keep metadata intact.

Wrong: catch classification errors before ownership filtering and ignore those
records. Correct: positively recognize supported predecessor formats in Core,
then apply the existing selected-ownership filter. This compatibility repair does
not change current writers, full migration semantics or downstream acceptance.

Regression coverage must include an original old `task.py start` creating a
second same-Task session after closeout preparation: applying the old plan must
leave the Task, archive, recovery state and both sessions unchanged. A newly
reviewed plan includes both carriers and completes with no native selection of
the archived Task. Partial retirement and completed-result recovery use the
same freshness rule. Do not merely retire the original list and report success
while a normally created, unreviewed session still selects the removed Task.


## Selected manually archived Task resume

### Scope and trigger

Use `task_resume` only for a positively recognized legacy or schema1 manually
archived Task whose original owner reviewed the history and confirmed no pending
private closeout transaction. Current schema2 formal archives retain formal
`reopen_task` semantics; this operation never supplies its missing Completion.
The source archive is read-only history; one ordinary active schema2 Task becomes
execution authority. Generation is preserved because no formal completed lifecycle
is being reopened. No alternative TaskId, empty Delivery or completion is created.

### Public signatures

```sh
trellis maintain inspect-task --target /project --task-id selected --generation 0 --task-ref .trellis/tasks/archive/2026-10/manual-history --original-task-ref .trellis/tasks/original-location --json
trellis maintain prepare --input /private/resume-input.json --json
```

```ts
import { maintenance } from "@mindfoldhq/trellis";
const plan = maintenance.prepareArchivedTaskResume(reviewedInput);
const result = await maintenance.applyMaintenance(plan, {state_dir});
// result.resumed_task = {key: {task_id, lifecycle_generation}, task_ref}
```

The prepare envelope is `{kind:"task_resume",input:ArchivedTaskResumeInput}`.
Core `/task/maintenance` exports `ArchivedTaskResumeIntent` and
`validateArchivedTaskResumeProjection(source,projection,facts,intent)`.
Capability remains `maintenance_api:"1.0"` with additive `task_resume` and
`archive_resume:{task_families:["known_legacy","schema1"],generation:"preserve",
original_archive:"read_only"}`. Check this capability plus actual source/build
identity; matching version labels do not establish matching implementations.

### Request, result and provenance

`ArchivedTaskResumeInput` extends conversion with:

- `task_ref`: exact archive root in the finite `archive/YYYY-MM/directory` layout.
- `original_task_ref`: explicitly reviewed direct active path before manual
  archival; never infer it from the archive basename. It may differ from destination.
- `active_ref`: absent direct active destination. Existing same TaskId at any
  generation in the target checkout blocks restoration.
- `resume_intent:{reason:AuthorityRef,archive_review:AuthorityRef,
  next_owner_id:string,next_action:string}`. Each string is nonempty; references
  are verified. The caller reviews real history, scope and private transactions.
  The executor records intent without interpreting or running the next action.
- Complete schema2 `projection` with accepted scope evidence, unchanged identity,
  generation/source/metadata/tree, no Completion/Closure, no imported gate results
  or active Deliveries. Real historical delivered outcomes may be attributed by
  original owners; unknown facts remain source snapshots.
- `artifacts`: complete archive-relative retained file dispositions. Preserve
  source files; only Delivery planning projections may use `write`. Paths map to
  the active destination; projection authority/plan refs must resolve there or in
  retained readable sources. All Delivery planning files remain required.
- `sessions`: exact inspected carriers with `preserve`, `replace` or `retire`, and
  `delivery_id:null`. Replacement produces schema3 Task selection with no Delivery.
  Retire removes selected obsolete carriers; preserve grants no new authority.
  `branch_binding` uses the existing preserve/explicit-establish contract.

The raw archive tree, bytes, modes and empty directories remain intact. Active
`migration/source-task.json` retains original record bytes;
`migration/archive-resume.json` retains archive/original path, key and reviewed
intent. The frozen operation contains destination/preimages and fixed candidate.
`resumed_task` is returned from that same plan on apply/recover/resume/rollback;
status determines whether it is currently applied. It is a routing identity, never
proof that the next semantic owner passed or business work completed.

### Validation and error matrix

| Condition | Diagnostic / behavior |
| --- | --- |
| Missing or malformed explicit intent | `resume_intent_required` before writes. |
| Invalid paths/input or absent destination constraint | `invalid_task_path`, `invalid_input` or `conflict`. |
| Unsupported predecessor/current schema archive | `unsupported_source`; formal current archive uses reopen. |
| Key/source mismatch or ambiguous live ownership | `target_key_mismatch`, `ambiguous_authority` or identity conflict. |
| No accepted scope / manufactured completion / inherited gates / live or empty Delivery | `accepted_scope_required`, `formal_lifecycle_conflict`, `inherited_gate_conflict`, `historical_outcome_required`. |
| Changed source/build/preimages or unreviewed carriers | `candidate_mismatch`, `stale_source` or `later_work_conflict`; no expanded write set. |
| Later task files, scope changes, same-ID active records or sessions before rollback | Refuse rollback and preserve later work. |
| Old reader incompatible with current data | Existing tools rollback compatibility diagnostics remain in force. |

Path carriers may name the selected archive or explicitly reviewed original
active path; identity carriers match the exact Task/generation. Platform metadata
never proves ownership. Other tasks/sessions/checkouts remain outside the write
set. Inherited copies can establish ownership but are never conversion targets.
A newly attributable carrier after preparation blocks apply/result recovery and
rollback; original source/target states remain valid for ordinary partial replay.

### Good, base and bad cases

Good: preserve a manually archived delivered slice and its real commit, restore
same Task/generation with no current Delivery, then let the target-native scope
owner review a supplement without changing historical outcomes.

Base: no attributable session exists; establish a reviewed Git branch binding and
use the legal explicit-task route. No fabricated session or Delivery is necessary.

Bad: move the archive manually, create a replacement Task, infer a pass from old
status, or call formal reopen with invented Completion to bypass its guard.

### Required tests and evidence

Core validates intent, finite predecessor/projection semantics and explicit path
carrier selection. Real-Git CLI tests cover retained bytes/modes/history, all
same-ID generations, original-path ambiguity, exact bindings/session dispositions,
new carrier/source-tree freshness, same-operation retry/lost output/partial apply,
rollback and later-work conflicts. Keep active conversion, history-only closeout,
formal reopen and complete Plan2 regressions.

Install actual packed matching CLI/Core into one isolated prefix; use the public
bin before tools cutover, then target checkout's installed native identity,
continuation and actual next public consumer. Record source SHA/package digests,
API, platform/template coverage and limits. Shipped/dogfood parity applies to any
changed native files. Guru private-owner/joint validation is separate evidence;
a mock, DTO parse or external tool execution cannot stand in for it.

### Wrong versus correct

Wrong: derive original active path from archive basename, advance generation or
copy old gates to make continuation appear successful.

Correct: caller explicitly reviews original path/history/next owner, public Core
validates a same-generation projection, fixed-plan maintenance creates one active
record, and target-native consumers establish actual continuation independently.

## Formal predecessor archive reactivation

### 1. Scope / trigger

Use `formal_archive_reactivation` for one explicitly selected formally completed
canonical schema1 archive or supported known-legacy Issue archive described below. The workflow owner reviews completion/history and
pending old transactions. Completed status is only a necessary state condition;
Core/CLI do not interpret Guru Finish summaries, Issue disposition or semantic
approval. No authorization is recorded. Legacy records outside the supported
canonical Issue-scope family remain outside this operation. Manual archive resume
preserves generation; current Task v2 archives
continue through ordinary reopen with matching current Completion.

### 2. Signatures

```sh
trellis maintain inspect-formal-archive --input /private/inspect.json --json
trellis maintain prepare --input /private/formal-input.json --json
```

```ts
import { maintenance } from "@mindfoldhq/trellis";
const observed = maintenance.inspectFormalArchiveReactivation(inspectInput);
const plan = maintenance.prepareFormalArchiveReactivation(input);
const result = await maintenance.applyMaintenance(plan, {state_dir});
```

Preparation uses `{kind:"formal_archive_reactivation",input}`. Core
`/task/maintenance` exposes
`validateFormalArchiveReactivationProjection(source,projection,facts)` as a pure
validator. Existing preview/apply/recover/resume/rollback consume the new plan
kind. Do not add another converter or alternate Python lifecycle writer.

The additive API-1.0 capability is
`formal_archive_reactivation:{task_families:["schema1","known_legacy"],generation:"increment_once",original_archive:"read_only"}`.
Require this capability and actual matching source/build identity. Keep all
existing operation kinds and `archive_resume` semantics.

### 3. Request, result and provenance

Use a separate closed input with `root`, predecessor `key`, archive `task_ref`,
explicit `original_task_ref`, absent destination `active_ref`, `archive`, complete
Task v2 `projection`, existing retained `artifacts` and `legacy_facts`.
`archive` contains exact `commit`, selected `target_ref`, observed `target_head`
and repository-file AuthorityRef `evidence`. Do not infer the original active
locator from the archive name. Use the existing exact Git OID contracts.

Projection preserves TaskId/source/metadata/tree and `artifact_origin`, advances
generation exactly once and has actual accepted-scope authority. Genuine
historical Deliveries remain at the predecessor generation. No old
Completion/Closure, inherited gate authority or current empty Delivery is
created. Verify all planning/scope/evidence references through existing public
authority/origin resolution against retained sources or actual planned files.

There are no session, branch-binding or resource-retirement actions in this
input. New-generation owners establish their environment responsibility later.
The archive and old-generation local records remain unchanged, whether those
records exist in the target environment or not.

The new active tree retains original bytes in `migration/source-task.json` and
minimal `migration/formal-archive-reactivation.json` provenance: predecessor key,
archive ref/commit and original active ref. Provenance is not a semantic pass,
resource ledger or authorization. It permits receiptless successor inspection.

The new kind's applied result exposes `reactivated_task:{key,task_ref}` alongside
existing operation/status/recovery fields. Other statuses do not claim an active
successor. Repeat apply/recover/resume preserves the original operation and
output generation. Later native lifecycle advancement does not rewrite that
result. Existing kinds, including manual `resumed_task`, retain their contract.

Inspection requires only root, predecessor key, exact archive/original locator
and archive facts. Its result is `{key,task_ref,successor}`. The successor is
`{kind:"absent"}`, `{kind:"verified",task:{key,task_ref}}` or
`{kind:"conflicting",task_refs:string[]}`. Verify provenance against actual source and public history;
same TaskId and a higher generation alone are insufficient. Later successors use
the real intermediate Completion history required by ordinary reopen. The
initial predecessor conversion never manufactures an old Completion. Inspection
does not claim that inaccessible unpublished state in another clone is absent.

The returned successor belongs to the explicitly selected root. Validate its
unique candidate before inspecting registered siblings. A sibling is a shared
or earlier snapshot only after the same public provenance, retained-source and
intermediate-Completion checks establish the same formal predecessor and its
generation is no greater than the root successor's. Normal business progress
does not require identical Task records. Return the root key/locator without
merging records or selecting environment ownership. No Guru-private C4 or
receipt is an inspection prerequisite.

If the root has no successor but a sibling owns one, stop instead of returning a
foreign locator or preparing another conversion. A newer sibling remains
ambiguous; a mismatching predecessor retains the original successor diagnostic.
Multiple local candidates retain
the existing conflicting result; a shared snapshot never permits fresh prepare
when the root already has a verified successor.

### 4. Validation and error matrix

| Condition | Required behavior |
| --- | --- |
| Unsupported source family/state, key mismatch or invalid closed input | `unsupported_source`, `target_key_mismatch` or `invalid_input` before target writes. |
| Missing accepted scope, invalid history attribution or imported current authority | Reject projection before plan construction. |
| Archive commit not reachable from selected target or archive tree mismatch | `invalid_git_fact` or `stale_source`; preserve target. |
| Original active path still present in the archive result | `original_active_present`; preserve target. |
| Destination occupied or successor relation ambiguous/mismatching | `conflict`, conflicting facts or `successor_mismatch`; never create a replacement Task or increment twice. |
| Verified root successor and registered sibling from the same formal predecessor at an equal or earlier generation | Return the root successor read-only; differing business progress is not a second incarnation. |
| Sibling successor without a root successor or newer sibling | `ambiguous_authority`; do not infer ownership or prepare another conversion. |
| Sibling provenance, retained source or intermediate history does not match | Preserve `successor_mismatch` or the original concrete read/validation diagnostic; do not prepare another conversion. |
| Selected target advances while archive commit and frozen target head remain reachable | Frozen operation remains eligible; no latest-SHA chase. |
| Source, candidate or owned preimage changes normally | Existing stale/candidate/later-work diagnostic and same-operation recovery rules. |
| New-generation Task/artifact, Delivery, session or binding work before rollback | `later_work_conflict`; preserve new work and all old resources. |
| Native/SDK relocation cannot match the converted Task's retained predecessor relation | `formal_archive_provenance_mismatch`; do not exclude an unrelated identity reservation. |

The fixed guard distinguishes predecessor and output generations. Ordinary
partial replay uses original preimages and accepts existing source/target states.
Rollback removes only the new tree when no later work exists. Read-only successor
inspection is separate from receipt recovery and never expands a frozen plan.

### 5. Good / base / bad cases

Good: reactivate a verified completed schema1 archive in another clone, bind the
new generation through native owners and accept a real supplement without a
dummy Delivery. Base: no old local sessions/bindings exist; conversion does not
need to create or retire them. Bad: use manual resume to simulate formal reopen,
manufacture old Completion, rewrite source generation before validation or claim
semantic completion from executor status.

### 6. Required tests and evidence

Core owns pure increment/identity/history validation and preserve-generation
regression. Real-Git CLI tests cover exact archive/target facts, complete retained
references, zero-write inspect/prepare/preview, bounded apply, old-resource
preservation, fixed-operation retry/partial recovery, receiptless successor
inspection, target advancement and rollback after genuine later native work.
Retain existing conversion/manual-resume/closeout/tools/current-reopen coverage.
Registered-checkout regressions also cover an identical shared active snapshot,
same-generation business progress and a later root generation with an earlier
sibling snapshot. Assert read-only root/sibling bytes, actual root identity,
receiptless lookup and refusal to create a second conversion. Retain genuine
conflict cases; do not replace them with whole-record equality gates.

One matching packed CLI/Core installation must use the public bin, target-native
Task selection/current/continuation and a real `accept_scope` with an actual
supplement file and declared owner. Preserve no-current-Delivery state. Change
native readers only for a demonstrated gap, with shipped/dogfood parity and
Python 3.9 support. This provider evidence does not certify Guru adoption,
source-lock update, whole-task completion or the full release/platform matrix.

### 7. Wrong vs correct

Wrong: import old gates to make a new Task appear ready, infer the original path,
or rewrite the original operation result to a later generation.

Correct: caller reviews formal history; public Core/CLI validates one exact
conversion to `g+1`; provenance enables read-only successor facts; original native
owners independently establish binding and continue current work.


## Compact legacy formal predecessor contract (Issue 64)

### 1. Scope / trigger

The formal operation additionally accepts positively recognized known legacy
records with `status: "completed"` and a canonical historical Issue scope.
The ten-field installation family retains `id`, `name`, `title`, `status`,
`branch`, `base_branch`, `creator`, `assignee`, `scope`, `completedAt`; it lacks
`schema_version`, `lifecycle_generation` and structured `source`. Personnel fields
are historical data only. Neither format recognition nor completed status proves
historical Finish qualification, delivered business extent or closure authority.

### 2. Signatures

Use existing public maintenance inspection, formal preparation and execution APIs.
`maintenance.inspectTaskTarget({root,task_ref,original_task_ref?,key?})` accepts an
omitted expected key for exact-locator discovery. Returned `classification` and
`key` come from the actual record. An explicit key remains an exact assertion.

```sh
trellis maintain inspect-task --target /existing/project --task-ref .trellis/tasks/archive/2026-10/historical --json
```

CLI `--task-id` and `--generation` must occur together or both be omitted.
All mutation inputs and formal archive inspection still require an explicit key;
locator discovery does not grant execution authority. API remains `1.0`.

Core `/task/maintenance` exports the pure shared interpretation:

```ts
classifyFormalArchivePredecessor(value: unknown): MaintenanceTaskIdentity & {kind: "legacy" | "schema1"};
validateFormalArchiveSuccessorSource(source: unknown, successorSource: TaskRecordV2["source"]): void;
```

The source validator consumes an already validated structured successor source;
normal Task2 parsing remains responsible for its closed structure.


### 3. Contracts

Positive legacy recognition owns generation `0`; never infer it for arbitrary
missing-field objects or derive TaskId from a basename. The supported scope is
exactly `GitHub issue: https://github.com/<owner>/<repo>/issues/<positive number>`.
The caller authors a valid successor Issue source with matching `repo_ref` and
`number`; its valid `disposition` is caller-owned. For example a delivered slice
may retain `reference_only`; the URL does not imply `exact_source` or closure.
Schema1 source continues to be preserved exactly. Scope and raw source are never
rewritten. Source matching rules are public Core-owned behavior, not a downstream
parser to copy into Guru.

The formal projection is generation `1` for this family and keeps original TaskId,
metadata and scope. Existing explicit `completedAt` source-snapshot attribution
still applies. No old gate, Completion/Closure or new current Delivery is inferred.
The existing active tree/provenance is the entire write set; archive, old sessions,
bindings and unrelated tasks remain untouched.

Projection validation, CLI archive verification, receiptless successor discovery
and TS relocation use one Core family/generation/source interpretation. Native
Python uses the same finite interpretation at its retained-predecessor relation
boundary, reusing positive legacy recognition. Shipped/dogfood copies match.
Ordinary current readers remain strict. Exact retained-source bytes and existing
provenance/key/history checks remain necessary before exempting a predecessor
from identity collision checks.

Pending is not applied and exposes no active successor claim. Lost output uses
the original operation's recover/resume; no second increment. Public receiptless
inspection additionally checks source consistency. A successor's archived
`task_ref` reports its actual current archive location; original operation recovery
continues to identify the original output, without claiming current activation.

### 4. Validation and error matrix

| Condition | Behavior |
| --- | --- |
| Positively recognized completed legacy + canonical scope + matching caller Issue source | Formal `0 -> 1`, original archive unchanged. |
| Unknown format or incomplete/noncompleted formal predecessor | `unsupported_source`, before writes. |
| Missing/noncanonical legacy scope | Explicit unsupported-source diagnostic; do not manufacture `no_issue`. |
| Projected/accessible successor source disagrees with predecessor Issue identity | `source_mismatch` (or retained-relation provenance diagnostic), original archive and successor preserved. |
| Explicit expected key disagrees with exact locator | `target_key_mismatch`; no fallback to basename. |
| Only one CLI identity flag provided | Explicit invalid-input diagnostic; do not partially discover identity. |
| Stale locator/Git/source bytes, mismatching provenance or copied source | Existing path/Git/stale/successor/provenance diagnostic; no expanded writes. |

### 5. Good / base / bad cases

Good: inspect the untouched ten-field archive, submit an owner-reviewed
`reference_only` source for its canonical Issue identity, then create exactly one
new generation and let native owners perform later work. Base: existing schema1
formal recovery and manual generation-preserving archive resume retain their
contracts. Bad: insert generation/source into the predecessor, discard personnel
fields before classification, or use a same-ID successor with a different source.

### 6. Required tests

Keep an untouched ten-field fixture. Cover locator-only public discovery,
source consistency, exact increment and snapshot attribution in Core/CLI. Use
real Git facts and actual public prepare/preview/apply/recover/resume, including
pending and lost output. Verify raw archive bytes/modes, no invented gates,
receiptless active/archived discovery, native Python archive/identity and TS
relocation with retained predecessor. Retain targeted schema1/schema2/manual
resume/pending regressions. Pack/install matching CLI/Core; record fixed source,
package SHA256, API/capability, actual public execution and downstream limits.

### 7. Wrong vs correct

Wrong: accept any object lacking generation as generation 0, infer source
semantics from the URL, or require Guru to rewrite archives into schema1.

Correct: positively identify the supported predecessor, validate caller source
structure/identity publicly, retain raw history and perform one existing formal
operation. Guru separately owns historical qualification and next-owner routing.


## Python operation boundary

Tools inspect/prepare/application and applied recovery/resume use the [shared Python selection contract](./configurator-shared.md#scenario-python-selection-across-process-boundaries-issue-53). Resolve automatic selection before tools mutation; postvalidation uses executable/argv, including the real Windows launcher. Preserve other maintenance kinds and existing operation identity/staleness contracts.


## Native tools deadlines and original-operation recovery

### 1. Scope / Trigger

Apply when tools postvalidation runs native contract/context probes, including
normal repositories with many registered worktrees, and when a caller loses
output or reaches its outer wait limit.

### 2. Signatures

Keep `validateToolsInstallation(plan, command?)` and public
`applyMaintenance`, `recoverMaintenance({recovery_ref})` and
`resumeMaintenance({recovery_ref})` contracts unchanged. Native probes use
the selected Python executable/argv, not an assumed shell alias.

### 3. Contracts

Both delivery-contract and native-context probes retain finite 10000 ms limits.
Declared workflows use `get_context.py --mode runtime-contract --json`;
undeclared workflows use its existing full `--json` path. Preserve actual
installed validation and supported maintenance-required handling. A failed probe
does not establish `applied`. Reduce repeated identity work before considering
any separately justified budget change.

An outer wait ending with a live process handle is not executor termination.
Continue observing that original executor before invoking recovery. After an
actual failure or lost output, use its exact original recovery reference and
frozen plan. Preserve operation ID, source/candidate checks, original preimages
and later-work refusals. The existing phase `applying` precedes writes;
`applied` follows successful postvalidation.

Changing CLI/Core builds remains `candidate_mismatch`, even at the same version.
This contract adds no cross-candidate recovery adapter. Never rewrite a receipt,
replace an operation or prepare again to make a failed first operation appear
successful. Keep the first failure when a later recovery succeeds.

Diagnostics identify the probe and necessary failure class without environment,
configuration, session payload or raw sensitive stderr dumps. Keep existing
public error/result structure and `incomplete_operation` meaning.

### 4. Validation & Error Matrix

| Observation | Required behavior |
| --- | --- |
| Outer caller returns a live handle | Wait on that original handle; do not run a second executor. |
| Native postvalidation fails after writes | Retain original operation and failure; do not claim terminal success. |
| Same fixed candidate and original ref | Recover/retry through original validation and pending-write rules. |
| Changed candidate or later owned edits | Preserve `candidate_mismatch` or `later_work_conflict`; no source substitution. |

### 5. Good / Base / Bad Cases

Good: recover the actual same-ref result after output loss. Base: normal tools
apply validates both actual installed probes. Bad: extend an outer wait or
replace the prepared operation and describe it as a native timeout repair.

### 6. Tests Required

Use one matching packed CLI/Core pair and the real public tools entry. Prepare
once and prove apply/recover/resume identity and target-native output, preserving
relevant Task/session/peer bytes and rollback anchors. Retain candidate and
later-work refusal tests. Record native elapsed time and Git call sources on a
normal representative topology. If no natural internal timeout occurs, report
non-reproduction and same-ref recovery separately; do not inject sleeps or edit
checkpoint state to claim the historical failure was recovered.

### 7. Wrong vs Correct

Wrong: start a new prepare while the original executor still runs, or change
the candidate fingerprint in its saved plan.

Correct: establish the original executor's outcome, preserve its first failure,
then inspect/recover/resume the original ref under its unchanged prerequisites.

## Native Windows tools file modes

When preparing tools-install target snapshots, preserve the actual existing file
mode on Windows and use Windows writable mode (0666) for new files. POSIX hosts
continue requesting 0755 for executable scripts and preserving other source
modes (0644 for new text files). Receipt defaults use the same host semantics.
Do not demand POSIX execute bits that Windows chmod/stat cannot round-trip.
Raw snapshots and equality still retain exact supported modes: do not strip
mode evidence globally or waive target comparison. Native apply followed by
fresh-process recover and resume must remain applied with no phantom pending
paths; Linux/macOS script modes must remain executable.
