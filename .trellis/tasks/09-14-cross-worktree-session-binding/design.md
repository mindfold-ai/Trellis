# Cross-Worktree Session Binding Design

## Authority and Storage

Keep context-key derivation unchanged. Introduce common/session_storage.py for Git facts, versioned storage and legacy discovery; active_task.py owns task resolution and lifecycle. Reuse subprocess, atomic JSON and historical-data helpers.

Git storage: <absolute-git-common-dir>/trellis/sessions/<key>.json. Discover the common-dir from the caller with Git, canonicalize it and enumerate git worktree list --porcelain -z without whitespace splitting. Validate caller and selected task root against live registration and each root's own Git common-dir. Matching remotes are not membership evidence. Non-Git projects retain .trellis/.runtime/sessions/<key>.json; failed Git discovery in an apparent Git checkout must not silently downgrade to non-Git behavior.

Preserve nested Trellis project roots where existing discovery supports them: verify the containing registered Git root, then constrain the task to that Trellis project root. Stored root declarations never establish membership on their own.

```json
{
  "schema_version": 1,
  "repository_common_dir": "/repo/.git",
  "task_workspace_root": "/task-worktree",
  "current_task": ".trellis/tasks/task-name",
  "platform": "codex",
  "current_run": null
}
```

Retain minimal existing platform/timestamp metadata. current_task stays task-workspace-relative, never a caller-relative escape path. Validate every record before returning task authority.

## Resolution Contract

Extend ActiveTask with invocation_root, repository_common_dir, task_workspace_root, resolved_task_path and a typed error reason. Retain task_path as the relative compatibility field. A diagnostic ref on an error result is not permission to operate on a task.

1. Resolve key and live caller facts.
2. Read new record when present; malformed, unreadable or unknown-schema records fail explicitly without legacy fallback.
3. If absent, inspect only the same key in live registered worktrees' legacy stores. Zero candidates means no binding. One valid candidate can resolve; multiple or invalid candidates fail closed. Never use mtime or similar names to choose.
4. Validate common identity, registration, effective tasks-root containment and readable object-valued task.json. Reject archived active targets and retired paths.
5. Initially use read-only legacy compatibility, not lazy promotion. This keeps hooks read-only and avoids partial promotion/cleanup states. Explicit start writes the new record atomically.

Preserve legitimate nonhistorical .trellis/tasks symlink contracts. Containment is against the validated task workspace's effective tasks root, not its entire repository. A known key miss/error cannot select another session. Identity-less main sessions resolve none; any explicitly supported child compatibility remains checkout-local, never common-repository-wide. Align OpenCode's unconditional sole-session fallback with this isolation rule.

## Consumers

The existing get_current_task_abs API returns the validated absolute directory;
no get_current_task_dir alias was introduced. get_current_task and text CLI
output retain local relative references but return absolute paths across task
workspaces. ActiveTask.task_path remains the workspace-relative reference.
current --json adds invocation_root, repository_common_dir,
task_workspace_root and resolved_task_path; current --source also prints the
task workspace. Invalid results are nonzero. A validated diagnostic task ref
may survive a metadata error, but resolved_task_path is absent and consumers
must reject error/stale before using any diagnostic identity.

Metadata, context manifests, relative injected files, task-specific package selection and workflow instructions use task workspace. Caller Git facts may still appear but must be labeled separately from task Git facts. Do not weaken context trust to arbitrary outside paths.

Shared Python hooks, Codex/Copilot SessionStart, Claude statusline and Snow use
validated task-workspace state. Shared subagent injection preserves local
relative display labels while resolving files against the task workspace.
OpenCode keeps native JS resolution with equivalent schema/Git/error rules,
including rejection of empty metadata; it has no Python dependency.

Pi/OMP native extension templates invoke the shipped task.py current --json
instead of maintaining another storage implementation. They reject invalid
resolver results and missing/non-string/blank status, while preserving custom
statuses. Context and workflow reads use task_workspace_root. OMP's bounded
context prefix explicitly names the absolute task workspace for relative
required_read paths and includes that prefix in the byte budget. The
pull-based prelude also uses explicit workspace identity for relative JSONL
entries. Installation registration in templates/trellis/index.ts includes the
new session_storage.py module.

## Lifecycle

start accepts a local task or explicitly validated registered-worktree target and intentionally reassigns only the current session. current/finish use the validated binding. For archive/rename, a relative argument matching the active binding can target that binding's workspace; if a distinct local candidate also matches, reject ambiguity. Unrelated names retain local meaning. Explicit absolute targets require live membership. Do not search all worktrees by task name to guess ownership.

Identify tasks by common-dir + task workspace + normalized ref. Preflight affected storage before archive/rename status or directory mutations. Preserve archive collision, parent/child and retired-data guards. Run lifecycle hooks in task workspace. New cross-worktree tests use --no-commit; pre-existing auto-commit regression tests retain their explicitly authorized fixture-local commits. No source-repository commit is authorized by a test run.

finish removes the selected session record and matching legacy records so fallback cannot resurrect it. archive removes every session bound to that exact task. rename repoints new and legacy records after the move without touching another workspace's identical ref. Report cleanup/repoint write failures explicitly, including partial work; do not introduce a locking/transaction framework for this scope.

## Compatibility and Delivery

Every shipped Python change has a byte-identical .trellis/scripts twin. Update current storage documentation and workflow wording without changing versions or published manifests. Git runtime files remain untracked.

Old binaries cannot read new records. Mixed old/new writers are not a downgrade synchronization protocol: update installed consumers together. Reverting code requires explicit rebinding with the older runtime, not hidden deletion/migration of historical bytes.

No Nightly workflow or published artifact was verified. The source build and
built-CLI init/update route were exercised successfully; see
research/verification.md for exact commands and provenance limits. Do not claim
npm install github: works for this workspace monorepo. Downstream must pin the
eventual authorized upstream SHA plus lockfile/build identity, not unchanged
version 0.6.17 alone. Candidate commit, PR and final main SHA remain pending
separate commit/push/PR/merge authorization.
