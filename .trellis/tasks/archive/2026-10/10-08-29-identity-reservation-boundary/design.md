# Identity reads by consumer responsibility

## Ownership and root cause

| Consumer | Facts it consumes |
| --- | --- |
| `task_utils.task_id_collisions` | safe locator, valid id, exact/casefold match |
| `session_storage.resolve_task_identity` | identity location, matching current record, generation |
| rename/archive | strict selected record plus identity uniqueness |
| ordinary readers/writers | complete current schema |
| `migrate.ts` / Core `isKnownLegacyTaskRecord` | reviewed migration classification and raw-byte preservation |

Only the first two currently depend on Python's full inventory classification
before identifying a requested match. Fix that dependency rather than widening
the known-legacy whitelist.

## Proposed read contracts

1. Extract checked file/decode/JSON-object reading inside `common/io.py` into an
   internal helper. Preserve `read_json_checked` and `write_json` complete-schema
   contracts. Reuse decoding instead of reparsing the same record through fallback.
2. Add a purpose-specific reservation reader returning only valid TaskId and a
   checked-read reason. Use the existing portable id pattern. Do not return raw
   task metadata, generation, lifecycle state or legacy classification.
3. Move `task_id_collisions` to this projection. Retain project containment,
   exact/casefold diagnostics, active identity failure and existing missing-file
   /archive visible-name fallback. Valid ids reserve occupation regardless of
   non-identity fields. Do not derive identity from a directory name.
4. Session resolution uses the same projection to locate matches, then the
   unchanged strict reader for exact matching records before generation checks.
   Preserve casefold conflict reporting, `_bound_task_workspace`, preferred
   workspace and ambiguity semantics. Session storage and binding authority do
   not change.
5. After a complete consumer search, remove Python's unused inventory reader,
   reservation-only legacy classifier and constants. Core's independent migration
   classifier/API remains unchanged; it still owns deferred-task classification.

## Failure matrix

| Record | Reservation | Selected lifecycle |
| --- | --- | --- |
| complete current | valid id available | full schema/generation validation |
| valid id, mixed/old fields | valid id available | strict rejection |
| valid id, invalid source/generation | valid id available | strict rejection |
| active malformed JSON/non-object/missing or invalid id | precise failure | rejection |
| unrelated directory without task.json | existing evidence-only behavior | selected missing-task rejection |
| unreadable archive | existing visible-name fallback | existing selected behavior |

No arbitrary exception swallowing or new repair action is introduced. Strict
selected rejection does not require assigning a new legacy class to a record.
Diagnostics identify the file and failed read/id condition.

## Mutation and compatibility

The official writer still checks uniqueness before mkdir and creates complete
current metadata/context. No migration, lifecycle activation or session write is
added to reservation. Rename/archive validate their selected target strictly
before checking uniqueness. Retain creation's existing identity-only Git-ref
scan scope and target-directory checks.

Implementation discovery: `ensure_tasks_dir` currently creates `archive` before
identity validation. Defer that existing initialization until all creation
preflight/occupation checks pass, immediately before actual task creation.
This satisfies R29-06 without adding rollback or cleanup machinery; normal
creation with no tasks root must still work.

Revise `task-lifecycle.md` to distinguish identity projection from current-record
reading. Update only the native scanner paragraph in `commands-migrate.md`;
conversion/deferral requirements do not change. Historical evidence is untouched.
Canonical and dogfood Python twins remain byte-identical; dist comes from build.
No CLI option, task/session schema, dependency or platform branch is added.

## Verification and rollback

Use real create/start/session entry points in temporary registered worktrees,
including the mixed header and field-independence matrix. Assert conflicts,
selected rejection, identity failures, historical bytes/modes and no partial
resources. Retain strict schema/migration tests and verify built clean install.
Helper-only tests are insufficient proof of official creation success.

No history is transformed. Rollback concerns candidate code/docs only. Guru
integration, release and business installation remain separately owned.
