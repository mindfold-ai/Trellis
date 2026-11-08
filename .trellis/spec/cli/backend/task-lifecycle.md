# Task Lifecycle

This spec describes the retained legacy compatibility contract during
Issue #31's staged cutover. Fresh default native and other schema-2 Tasks use [Delivery Lifecycle](./delivery-lifecycle.md)
and the shipped public contract; they must not receive legacy status writes.

## Task Records

Under a retained undeclared legacy workflow, `task.py create` and explicit
legacy-compatible init/factories write the legacy task schema. Fresh no-flag
init uses schema 2; omitted create schema follows the installed validated
declaration as specified in Delivery Lifecycle. Task selection uses explicit
task arguments or a validated session binding. Legacy `task.py list` and context support status filtering and
project task inventory; the current session task is reported separately.

`task.py create --source-json` accepts `no_issue` (also the default) or an
Issue source with `exact_source` or `reference_only` disposition. The supplied
Issue source is preserved through create, read, session start, rename and
archive. `reference_only` records a relation to the Issue; it does not assert
complete delivery or authorize Issue closure. Creation performs no GitHub
closure action. Other dispositions remain readable in existing records but
are not accepted by this creator.

Creation preflight is read-only. Task-store initialization, including the
archive directory, occurs only after identity and target occupation checks
have passed. A rejected preflight must not leave new task-store/session data.

The outer Trellis workflow owns task creation, planning paths, context
manifests, artifact review, and activation. `trellis-brainstorm` can explore
requirements without a task. It writes to a caller-provided destination or
returns planning content in conversation.

## Session Binding

`resolve_active_task` returns the task path, source type, context key, stale
state, invocation root, repository common directory, task worktree root,
resolved task path, and error. Consumers use the validated absolute task path.
Git storage is `<git-common-dir>/trellis/sessions/<key>.json`, schema version 2,
with `schema_version`, stable `task_id`, and `lifecycle_generation`. Non-Git
projects use checkout-local storage with the same schema.

`task.json.id` is stable across rename and archive. The required
`lifecycle_generation` must be a non-negative integer and cannot be a boolean;
`children` must be a list and is the sole task-tree field. Records with
unsupported or missing fields, invalid field types, invalid source data, or
non-JSON metadata are rejected at every complete Python task-record read/write
boundary, as in Core. An existing invalid record cannot be overwritten with
new data. Identity occupation is a separate read projection: it consumes only
a safe locator and valid immutable TaskId, not source, generation, status or
other fields of an unrelated record. Create and lifecycle mutations reject
exact and Unicode case-fold TaskId collisions across active and archived tasks.
Valid historical ids remain reserved without exposing their metadata as current
lifecycle candidates. Session resolution identifies matching ids before strictly
validating selected records and generation; direct old/mixed/invalid-current
selection still rejects. Active bad JSON, unreadable metadata, non-object data
and missing/invalid ids block identity scanning with a concrete locator.
Unrelated directories without task.json retain evidence-only handling; archive
missing-data and conservative visible-name collision behavior remain unchanged.

Relocation of an actual Task v2 produced by
[formal predecessor conversion](./commands-maintain.md#formal-predecessor-archive-reactivation)
may exclude only its positively matched read-only schema1 predecessor from that
relocation's collision scan. Verify the current Task's public conversion
provenance and exact retained source snapshot against that archive. This is not
a general same-TaskId exception: create retains all historical reservations,
unrelated records still conflict, and the old archive remains immutable. Native
rename/archive/reopen regressions must use a real public conversion before
exercising this boundary.

Registered Git worktrees determine membership. Resolution requires one exact
TaskId and generation match. Missing, ambiguous, corrupt, or unsupported
bindings are stale and require an explicit `task.py start`; reads do not rewrite
them or infer a different session. Non-Git resolution is invocation-local.

Finish clears the selected session. Archive clears bindings matching the
archived TaskId and generation. Rename changes the directory, mutable name,
and TaskRef references while leaving session bytes, TaskId, and generation
unchanged. Lifecycle hooks run from the task worktree.

## Git Inventory with Prunable Registrations

### 1. Scope / Trigger

Apply when enumerating repository worktrees for Task/session resolution or
plan-2.0 migration preflight. Git
can retain an obsolete registration after its `.git` entry disappears while
the old directory still contains `.trellis`; that directory is not a live
registered execution workspace. Enumeration never prunes or repairs resources.

### 2. Signatures

`repository_facts(root)` reads `git worktree list --porcelain -z` and returns
the invocation root, common directory, Git root and eligible worktree roots.
Public `task.py current` and `get_context.py --mode continuation` retain their
existing output/error contracts. CLI `migration2.repository(cwd)` applies the
same live-root eligibility rule before exact workspace inventory validation.

### 3. Contracts

Parse complete NUL-separated porcelain records, including the record's
`prunable` field. Exclude only a non-invocation Git root whose record has that
explicit marker and whose `.git` entry is absent, using lexical existence so
dangling symlinks count as extant entries. Do not infer this from missing Task
data, a failed Git command or the presence/absence of `.trellis` alone.
Git-free fallback requires the actual Git diagnostic `not a git repository`
and no lexical `.git` entry in the invocation root or any ancestor; timeout,
other Git errors and dangling entries do not become Git-free installations.

### 4. Validation & Error Matrix

| Inventory/selection | Required behavior |
| --- | --- |
| Prunable sibling with absent `.git` | Exclude from live workspace discovery; retain all files and registration metadata. |
| Extant, corrupt, dangling or foreign `.git` | Keep ordinary membership/error validation; never skip it as a dead sibling. |
| Invocation Git root or failed Git query | Preserve strict validation/error; no best-effort inventory. |
| Selected Task/generation no longer resolves | Return the existing stale/error result; never infer another Task or normal `no_task`. |

### 5. Good / Base / Bad Cases

Good: a valid session still resolves across live sibling worktrees despite an
unrelated prunable residual directory. Base: ordinary one-worktree discovery is
unchanged. Bad: catching all Git errors and treating the session as task-free.

### 6. Tests Required

Use real Git worktrees and preserve an obsolete registration after removing
only its controlled fixture's Git entry. Assert exact Task/generation selection,
live sibling resolution, stale selected identity, corrupt/foreign entry errors,
Git-query failure, byte/mode preservation and unchanged registration inventory.
For migration, the same frozen caller plan must remain previewable after an
unrelated explicitly obsolete sibling appears, with zero preview writes.

### 7. Wrong vs Correct

Wrong: validate every raw path as live, or skip any path whose Git query fails.
Correct: filter the explicitly obsolete record under the closed conditions,
then strictly validate every remaining workspace and the exact selected Task.

## Archive and Paths

Archive stages only the selected task and its destination. User-owned task
content is retained. File operations validate project containment, symlinks,
and managed-file ownership before reads or mutations; a parent directory check
does not validate its children.

Use real Git worktrees and hook entry points to verify session resolution,
rename/archive, collisions, corruption, unregistration, and non-Git behavior.

## Current Record Boundary

### 1. Scope / Trigger

Apply this contract whenever Core or Python reads or writes a complete task
record, including the selected target of session resolution and lifecycle
mutation. An identity-only scan is not a complete record read and cannot confer
lifecycle or migration authority.

### 2. Signatures

- Core: `taskRecordSchema.parse(input)` and `writeTaskRecord(options)`.
- Python: `read_json_checked(path)` and `write_json(path, data)`.
- Python identity projection: `read_task_id_reservation(path)` returns
  `tuple[str | None, str | None]`, containing only a valid TaskId or a checked
  read reason. Invalid/missing id returns `invalid-task-id`; file, decoding,
  JSON and object failures retain their existing reasons. The caller validates
  path containment before reading. This projection does not accept a record
  for lifecycle use or migration disposition.

### 3. Contracts

Every field in `TASK_RECORD_FIELD_ORDER` is required. `branch` alone is
optional. `children` is the task-tree list; `source` is either `no_issue` or a
structured issue reference. `meta` is a JSON object. Both runtimes reject
unknown top-level fields and validate the same field types.

### 4. Validation & Error Matrix

| Input | Result |
| --- | --- |
| Current record | Read or write succeeds. |
| Missing, extra, or mistyped field | Read fails; an existing record is not overwritten. |
| Invalid source or non-JSON metadata | Read fails; an existing record is not overwritten. |
| Missing or mismatched session binding | Session-bound selection fails until an explicit start; an explicit task argument remains usable. |
| Unrelated record with valid id and invalid non-identity fields | Identity is reserved; it does not block a different current target. |
| Selected record with invalid non-identity fields | Strict selected-record read fails before lifecycle use. |
| Active missing/illegal id | Reservation returns `invalid-task-id`; consumer rejects with the record path. |

### 5. Good / Base / Bad Cases

- Good: a record from `task.py create` or `emptyTaskRecord` with current fields.
- Base: a valid record with no `branch`, no children, and `source.kind=no_issue`.
- Bad: a record missing `source` or carrying an unknown top-level field.
- Identity-only base: `{"id":"Old_Reserved","lifecycle_generation":1}`
  reserves `Old_Reserved` but cannot be selected as a current task.

### 6. Tests Required

Assert Core and Python acceptance of a complete record, rejection of missing
or extra fields, and byte-for-byte preservation when an invalid existing
record is passed to a writer. Exercise task selection and mutation with a
current record through the generated Python templates.
Use real registered sibling worktrees with mixed historical headers to verify
create/start/current, exact/casefold refusal and unchanged historical bytes/modes.
Changing only non-identity fields must preserve occupation results; selecting
that invalid record must fail. Bad-identity rejection must leave no new archive,
task or session directory. Retain independent migration regression coverage.

### 7. Wrong vs Correct

Wrong: fill absent fields while loading and continue with the modified record.
Correct: reject it at the read boundary and leave its bytes untouched.

Wrong: classify every historical header as a lifecycle candidate before comparing
its id with the requested identity.
Correct: use `read_task_id_reservation` for occupation; use `read_json_checked`
for the selected task before consuming generation or any other lifecycle field.

## Closed Legacy Guru Extensions

`isKnownLegacyTaskRecord` may recognize the historical Guru extension fields
`design_package`, `guru_chain`, `guru_gates`, `require_req_uc`,
`requirement_package`, `risk`, and `route` on legacy predecessor records.
Package paths `design_package` and `requirement_package` may be strings or null;
`guru_chain`, `risk` and `route` are strings, `require_req_uc` is boolean, and
`guru_gates` is a non-null object. This compatibility check only classifies
an old record for a reviewed migration disposition. It does not add these
fields to `taskRecordSchema`, current readers, session selection, or lifecycle
authority. Migration preserves the complete original bytes in its source
snapshot and makes a reviewed projection for current records.

During complete migration inventory, a recordless active evidence root may share
its visible basename with a record-bearing `history_only` archive in the same
workspace. Preserve both only when the archive TaskId matches the basename
after the existing date-prefix normalization. This admits no active authority
and does not permit malformed or record-bearing roots to claim the alias.

## Operation-local historical identity observations

Task creation scans live registered workspaces independently from immutable Git
history. Resolve the current local/remote heads anew for every create operation.
Historical identity reservation may reuse tree/object observations within that
operation only, using exact immutable object identities in the actual repository.
Read each unique metadata object once using bounded Git batches; do not launch
one content-reader process per historical path. Retain every head/path's identity
occupation check and useful collision locator, including case-fold collisions.

This is an identity-only projection, not acceptance of historical records for
lifecycle operations. Preserve the historical parser's permissive JSON/id behavior
and the strict current-workspace metadata boundary separately. Failed real reads
must not become an empty/missing history result. Bodies are streamed or spooled
and operation-local temporary resources are released on ordinary success/failure;
no persistent cache or background service is part of this contract.
