# Task Lifecycle

## Task Records

`task.py create`, `trellis init`, and task factories write the current task
schema. Task selection uses explicit task arguments or a validated session
binding. `task.py list` and the default context support status filtering and
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

Registered Git worktrees determine membership. Resolution requires one exact
TaskId and generation match. Missing, ambiguous, corrupt, or unsupported
bindings are stale and require an explicit `task.py start`; reads do not rewrite
them or infer a different session. Non-Git resolution is invocation-local.

Finish clears the selected session. Archive clears bindings matching the
archived TaskId and generation. Rename changes the directory, mutable name,
and TaskRef references while leaving session bytes, TaskId, and generation
unchanged. Lifecycle hooks run from the task worktree.

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
