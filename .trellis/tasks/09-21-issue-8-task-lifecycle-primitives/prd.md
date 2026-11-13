# Stable Task Identity and Path-Free Session Primitives

## Goal

Give every Trellis task a stable lifecycle identity that survives TaskRef
renames, and make session bindings carry only that identity plus its lifecycle
generation. Callers must derive the current task path from live registered
worktrees instead of trusting a persisted workspace path or mutable TaskRef.

This unblocks the Guru lifecycle state model while keeping the Trellis task CLI,
shipped templates, standalone platform resolvers, and regression tests on one
contract.

## Authority and Confirmed Facts

- Source authority is `castbox/Trellis#8`, created on 2026-09-21 against
  `main@43fffc170927c85d9f7fc106cc5a059e80d4530b`.
- New task creation currently writes the slug into both `task.json.id` and
  `task.json.name` and does not write a generation
  (`.trellis/scripts/common/task_store.py:529-554`).
- Rename currently treats both `id` and `name` as mutable identity fields and
  repoints sessions after the directory move
  (`.trellis/scripts/common/task_store.py:719-725,1050-1061`).
- Session schema version 1 stores and trusts `repository_common_dir`,
  `task_workspace_root`, and `current_task`
  (`.trellis/scripts/common/session_storage.py:190-215`).
- `set_active_task` also persists platform metadata and `current_run` with the
  path-bearing schema (`.trellis/scripts/common/active_task.py:697-724`).
- OpenCode independently reads and validates the same schema in
  `packages/cli/src/templates/opencode/lib/trellis-context.js:480-553`.
- The historical task set contains legacy and damaged records. A current scan
  found 237 readable task records, all without `lifecycle_generation`; 10
  unreadable archived records; two readable records with no usable `id`; and
  one exact duplicate archived ID, `opencode-support`. These unrelated legacy
  defects cannot make all new task creation or session resolution unusable.

## Definitions

- **TaskId**: immutable lifecycle identity stored in `task.json.id`. For a new
  task, its initial value is the creation slug.
- **TaskRef**: mutable human-facing reference represented by `task.json.name`
  and the task directory name.
- **Lifecycle generation**: non-negative integer stored in
  `task.json.lifecycle_generation`. Generation `0` is the initial lifecycle.
- **Session identity**: the pair `(task_id, lifecycle_generation)` stored for a
  context key.

## Requirements

### R1. Stable task metadata

- New tasks MUST write an immutable `id`, a mutable `name`, and
  `lifecycle_generation: 0` before reporting creation success.
- Missing `lifecycle_generation` on a readable legacy task MUST be interpreted
  in memory as `0` without rewriting tracked files.
- A present generation MUST be an integer with `type(value) is int` and
  `value >= 0`. Booleans, strings, floats, negative integers, and null MUST fail
  closed for lifecycle and session operations.

### R2. Identity collision rules

- Creation and lifecycle preflight MUST check the target TaskId across active
  and archived task records for both exact and Unicode case-fold collisions.
- A collision with the requested TaskId MUST fail before task or session
  mutation and identify the conflicting records.
- Unrelated malformed or historically duplicated records MUST NOT globally
  block a different TaskId. An unreadable record whose visible TaskRef is an
  exact or case-fold candidate for the requested identity MUST fail closed.

### R3. Rename and archive semantics

- Rename MUST change the TaskRef, display name, directory, JSONL references,
  and task back-references that currently follow the TaskRef.
- Rename MUST NOT modify `task.json.id` or `lifecycle_generation` and MUST NOT
  repoint session files. A subsequent session read must resolve the new TaskRef
  from the stable TaskId.
- Archive MUST preserve TaskId, source metadata, and lifecycle generation while
  applying the existing completion and relationship behavior.
- Archive MUST clear session records matching the exact TaskId and lifecycle
  generation before moving the task.

### R4. Path-free session schema

- Session schema version 2 MUST contain only the schema envelope plus
  `task_id` and `lifecycle_generation` as domain payload.
- A session record MUST NOT persist absolute paths, TaskRef, branch, HEAD,
  creator, assignee, authorization state, transcript path, conversation
  metadata, platform metadata, timestamps, or `current_run`.
- If no context key is available, task activation MUST NOT write a session
  record. Existing degraded task-status behavior remains outside this storage
  contract.
- Schema version 1 records and unversioned path-bearing records MUST be reported
  as stale or unsupported. This task MUST NOT add dual-read, dual-write, alias,
  or implicit migration behavior.

### R5. Fresh task resolution

- For Git repositories, readers MUST use current Git common-dir and registered
  worktree facts to locate live Trellis workspaces, then resolve exactly one
  active task matching the session TaskId and generation.
- For non-Git repositories, readers MUST apply the same identity contract in
  the invocation-local Trellis workspace.
- Zero matches, multiple exact matches, case-fold conflicts, invalid metadata,
  and generation mismatches MUST return an explicit stale/error result without
  selecting a task.
- Derived `ActiveTask` paths remain available to downstream callers, but those
  paths are runtime facts and are never copied back into the session record.

### R6. Distribution and platform parity

- Every modified Python script MUST remain byte-identical between the dogfood
  tree and `packages/cli/src/templates/trellis/scripts/`.
- OpenCode's standalone JavaScript resolver MUST implement the same schema-2,
  collision, generation, and live-worktree behavior as the Python resolver.
- Template extraction/build outputs and platform fixtures that encode the old
  session schema MUST be updated through their canonical sources, not by
  hand-editing generated `dist` files.

### R7. Verification

- Regression coverage MUST include create, legacy generation reads, invalid
  generations, exact/case-fold collisions, rename identity stability, archive
  cleanup, missing context keys, stale schema v1 records, cross-worktree fresh
  resolution, ambiguity, and OpenCode parity.
- Existing task/archive/session/history boundaries MUST continue to pass.
- Installation, build, targeted task/session tests, full CLI tests, generated
  template/golden checks, Python static checks, dogfood parity, and the 3000-line
  limit for every modified non-generated file MUST pass before delivery.

## Acceptance Criteria

- [ ] AC1: Creating a task writes `id=<creation slug>`, `name=<creation slug>`,
  and `lifecycle_generation=0`; an unavailable context key writes no session
  file.
- [ ] AC2: Missing legacy generation reads as `0` without a tracked rewrite;
  every invalid present generation fails closed.
- [ ] AC3: Exact and Unicode case-fold TaskId collisions are rejected across
  active and archive records without unrelated malformed history globally
  blocking a different identity.
- [ ] AC4: Rename changes TaskRef/back-references while preserving the exact
  serialized `task.json.id` value and generation; no session repoint occurs.
- [ ] AC5: Archive preserves TaskId/source/generation and clears only sessions
  matching the archived TaskId plus generation.
- [ ] AC6: A written schema-2 session record contains exactly
  `schema_version`, `task_id`, and `lifecycle_generation`, with no path or
  mutable task/workflow metadata.
- [ ] AC7: Python and OpenCode resolve the renamed task through live registered
  worktrees; zero/multiple/case-fold/generation mismatches are explicit stale
  failures.
- [ ] AC8: Schema v1 and unversioned path-bearing session records are not read
  as compatibility bindings and require explicit `task.py start` rebinding.
- [ ] AC9: Dogfood/template Python copies, template extraction, platform
  fixtures, and generated golden tests agree with the new contract.
- [ ] AC10: The Issue #8 validation commands and per-file line-limit checks pass
  with no unreported verification gap.

## Out of Scope

- Guru branch association, checkout acquisition, resource ownership ledgers,
  semantic Skill gates, workflow activation, publication, or release logic.
- Lifecycle generation increments for reopen/reactivation. Issue #8 establishes
  generation storage and matching only; the increment transition is owned by a
  later lifecycle feature.
- Compatibility aliases, schema-v1 migration, dual-read, dual-write, a durable
  identity index, a workspace map, or a second task/session store.
- Repairing unrelated malformed or duplicated historical task records.
- Persisting authorization, ownership, branch, checkout, HEAD, or conversation
  evidence in session state.

## Blocking Open Questions

None. The live Issue, repository contracts, and current implementation evidence
resolve the planning decisions required for this delivery.
