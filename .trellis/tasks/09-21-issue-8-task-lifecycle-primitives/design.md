# Technical Design: Stable Task Identity and Path-Free Sessions

## 1. Design Summary

Replace path-bearing session authority with a small identity record:

```json
{
  "schema_version": 2,
  "task_id": "issue-8-task-lifecycle-primitives",
  "lifecycle_generation": 0
}
```

`task.json.id` becomes immutable TaskId. `task.json.name` and the directory name
remain mutable TaskRef. A reader obtains current Git repository facts, scans live
registered Trellis worktrees for active tasks, validates task metadata, and
selects exactly one task whose TaskId and generation match the session record.

The design deliberately avoids a new identity index. The existing task store is
the authority, and the live worktree inventory is small enough to resolve at
session/context boundaries.

## 2. Ownership Boundaries

### Task metadata layer

The shared Python task helpers own:

- strict TaskId extraction;
- legacy generation defaulting and strict generation validation;
- exact and Unicode case-fold identity comparison;
- active/archive collision preflight for a requested TaskId;
- active-task candidate enumeration within a validated workspace.

The helper API must return structured success or a specific error. Callers must
not reinterpret invalid metadata as an empty object or silently fall back to
TaskRef.

### Lifecycle command layer

`task_store.py` owns create, rename, and archive mutations:

- create writes TaskId, TaskRef, and generation 0 after collision preflight;
- rename mutates only TaskRef-related state and removes session repointing;
- archive preserves identity fields and clears sessions by TaskId/generation.

`task_utils.py` continues to own path containment and explicit CLI target
resolution. TaskRef remains a valid user-facing command input; it is not session
authority.

### Session storage layer

`session_storage.py` owns schema-2 parsing/writing and repository discovery. A
`SessionRecord` carries validated identity fields and its storage path, not a
stored workspace or TaskRef.

For Git repositories, the lookup domain is the current live list returned by
`git worktree list --porcelain -z` for the current common directory. For non-Git
repositories, the invocation root is the only lookup domain.

### Active-task layer

`active_task.py` converts a valid session identity into the existing derived
`ActiveTask` runtime shape. Downstream Python hooks and CLI consumers may keep
using `task_workspace_root` and `resolved_task_path`, because those fields are
computed from live facts for the current read and are not persisted.

`set_active_task` validates the explicit target task, extracts TaskId and
generation, and writes the schema-2 record only when a context key exists.

### Standalone platform layer

OpenCode cannot rely on the Python resolver at every entrypoint, so
`trellis-context.js` must mirror the same schema, strict metadata validation,
registered-worktree scan, collision handling, and stale outcomes. It must not
retain a path-bearing fallback.

Pi, OMP, shared hooks, and most other platform adapters consume `task.py current`
or the Python resolver. Their fixtures and assertions still need updating where
they construct session records directly.

## 3. Data Contracts

### 3.1 Task metadata

New records add:

```json
{
  "id": "stable-task-id",
  "name": "mutable-task-ref",
  "lifecycle_generation": 0
}
```

Validation rules:

1. `id` is a non-empty string.
2. `name` remains subject to current TaskRef/path rules.
3. Missing `lifecycle_generation` means legacy generation 0 in memory.
4. Present generation is valid only when `type(value) is int && value >= 0`.
5. Reading a legacy record never writes generation back.

The create path still uses the normalized creation slug for both `id` and
`name`. Subsequent rename writes only `name` and TaskRef-bearing references.

### 3.2 Session record

The full supported record has three keys:

```text
schema_version = 2
task_id = non-empty string
lifecycle_generation = non-negative strict integer
```

Extra path, TaskRef, Git, owner, authorization, platform, timestamp, transcript,
conversation, or run fields are not written. Readers validate required fields
and treat unsupported schemas as stale/error. They do not promote or rewrite
schema v1 records.

The storage location remains:

- Git: `<git-common-dir>/trellis/sessions/<context-key>.json`
- non-Git: `<invocation-root>/.trellis/.runtime/sessions/<context-key>.json`

The location is repository/session routing infrastructure, not task identity.

## 4. Resolution Algorithm

Given `(task_id, lifecycle_generation)`:

1. Validate the session record and context-key storage path using the existing
   retired-data boundary.
2. Resolve current repository facts from the invocation root.
3. Build the lookup domain from live registered worktrees. Preserve the nested
   Trellis project suffix behavior already required by cross-worktree sessions.
4. For each live Trellis workspace, enumerate direct active task directories;
   do not search archived tasks for an active session.
5. Read `task.json` through the checked JSON helper and validate TaskId and
   generation.
6. Collect exact TaskId matches. Separately detect valid IDs whose Unicode
   case-fold equals the requested TaskId but whose bytes differ.
7. Return one derived workspace, TaskRef, and task path only when there is one
   exact identity and generation match and no case-fold conflict.
8. Return explicit stale/error for zero matches, multiple exact matches,
   case-fold conflicts, invalid matching metadata, or generation mismatch.

Unrelated unreadable task metadata is skipped with bounded diagnostics rather
than turning every session read into a repository-wide failure. If no valid
matching record remains, the requested session still fails closed as stale. For
create/lifecycle collision preflight, an unreadable directory whose visible
TaskRef is an exact or case-fold candidate for the requested TaskId is an
explicit conflict because uniqueness cannot be established.

## 5. Lifecycle Flows

### Create

1. Normalize and validate the requested slug using existing path rules.
2. Preflight exact and case-fold TaskId collisions across active and archived
   records without mutating either tree.
3. Write task metadata with stable ID and generation 0.
4. Create planning artifacts as today.
5. If a context key exists, bind the new task by TaskId/generation. Otherwise,
   leave session storage untouched.

### Start or explicit rebind

1. Resolve the explicit TaskRef/path with current containment rules.
2. Read and validate TaskId/generation from the selected task.
3. Write or replace the current context key's schema-2 session record.
4. Derive and return the runtime `ActiveTask` fields from the selected live
   workspace.

This is the only migration route for an old path-bearing session: the user runs
`task.py start <task-ref>` in the intended workspace.

### Rename

1. Preflight the current rename plan and all TaskRef/back-reference writes.
2. Preserve TaskId and generation byte values in task metadata.
3. Rewrite mutable TaskRef fields and move the directory.
4. Do not scan or rewrite session files.
5. On the next read, the same session identity resolves the task under its new
   TaskRef.

### Archive

1. Resolve the selected active task and validate TaskId/generation.
2. Preflight session storage and select records by exact TaskId/generation.
3. Apply existing completion metadata and relationship handling without
   changing identity/source/generation.
4. Clear selected sessions before moving the task into archive.
5. Keep current scoped staging/auto-commit behavior unchanged.

## 6. Collision and Legacy Policy

- Identity comparisons use both exact bytes and Unicode `casefold()`.
- Exact duplicate valid TaskIds or case-fold collisions are errors only when
  they intersect the requested identity or active-session lookup.
- The known historical duplicate `opencode-support`, missing IDs, and damaged
  archived JSON do not block a new unrelated TaskId.
- Active-session lookup never selects an archived task.
- Archive history participates in creation collision checks so a stable TaskId
  is not silently reused in a later lifecycle.
- Generation increment on reopen/reactivation is intentionally deferred. This
  change only establishes storage, validation, and exact matching.

## 7. Compatibility and Migration

This is an intentional compatibility break for session record content:

- no schema-v1 read path;
- no unversioned path-bearing fallback;
- no read promotion or background rewrite;
- no alias from TaskRef to TaskId;
- no durable mapping from TaskId to workspace.

After the implementation switches the current Fork checkout to schema 2, its
existing schema-v1 binding will be stale. Rebind from the Fork worktree with:

```bash
python3 .trellis/scripts/task.py start \
  09-21-issue-8-task-lifecycle-primitives
```

That command is an explicit new binding, not a compatibility migration.

## 8. Failure Behavior

| Condition | Result |
| --- | --- |
| Missing context key during activation | No session write; preserve current degraded status behavior |
| Session schema is not exactly 2 | Explicit unsupported/stale result |
| Missing/empty TaskId | Explicit invalid task metadata or binding error |
| Invalid generation | Explicit invalid task metadata or binding error |
| No live active match | Stale; no TaskRef/path inference |
| Multiple exact matches | Ambiguous identity error; no selection |
| Case-fold conflict | Collision error; no selection |
| Generation mismatch | Stale generation error; no selection |
| Worktree no longer registered | Excluded from live lookup |
| Matching task renamed | Resolves successfully through unchanged TaskId |
| Matching task archived | Session is cleared; later reads find no active match |

## 9. Distribution and Generated Artifacts

- Apply every Python edit to both physical script trees and verify byte parity.
- Update OpenCode's canonical standalone resolver source.
- Let the normal CLI build/copy process regenerate distributable template
  outputs; never hand-edit `packages/cli/dist/**`.
- Update direct session fixtures in regression, cross-worktree, OpenCode, Pi,
  OMP, Snow, update, and historical-boundary tests only where they represent a
  supported live session. Keep deliberate schema-v1 fixtures as stale cases.

## 10. Rollback Shape

The implementation is a coordinated contract change. A partial rollback is not
safe because schema writers and readers must agree. Roll back the complete set:

- task metadata helpers and lifecycle mutations;
- Python session writer/resolver;
- OpenCode resolver;
- template copies/extractor outputs;
- tests and fixtures.

No persistent migration is performed, so rollback does not need to restore task
records. Schema-2 session records would become unsupported by the old code and
can be replaced by rerunning `task.py start` after rollback.
