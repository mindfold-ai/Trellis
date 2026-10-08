# Current-State Research

Date: 2026-09-21

## Authority

- GitHub Issue: `castbox/Trellis#8`, "完善任务生命周期的稳定 TaskId 与无路径 session 原语"
- Issue baseline: `main@43fffc170927c85d9f7fc106cc5a059e80d4530b`
- Issue state at review: open, assigned to `wesleywu`, no comments.
- Local branch: `codex/issue-8-task-lifecycle-primitives`
- Local task: `.trellis/tasks/09-21-issue-8-task-lifecycle-primitives`
- Task state at review: `planning`

## Relevant Specifications

- `.trellis/spec/cli/backend/identity-free-task-lifecycle.md`
- `.trellis/spec/cli/backend/filesystem-safety.md`
- `.trellis/spec/cli/backend/script-conventions.md`
- `.trellis/spec/cli/backend/error-handling.md`
- `.trellis/spec/cli/backend/quality-guidelines.md`
- `.trellis/spec/cli/unit-test/conventions.md`
- `.trellis/spec/cli/unit-test/integration-patterns.md`
- `.trellis/spec/cli/unit-test/mock-strategies.md`

The current lifecycle specification still describes common-dir session schema
version 1 with stored `repository_common_dir`, `task_workspace_root`, and
`current_task`. Issue #8 intentionally supersedes that storage shape while
preserving the retired-data boundary and live Git membership checks.

## Current Code Map

### Task create and metadata

- `.trellis/scripts/common/task_store.py:529-554` writes the normalized slug to
  both `id` and `name` and has no lifecycle generation field.
- `.trellis/scripts/common/task_store.py:556-570` already treats failure to
  write `task.json` as a failed create.
- `.trellis/scripts/common/task_store.py:627-682` best-effort activates a new
  task only when a context key exists.

### Rename

- `.trellis/scripts/common/task_store.py:719-725` declares both `id` and `name`
  as rename identity fields.
- `.trellis/scripts/common/task_store.py:1014-1048` writes renamed metadata,
  JSONL references, and back-references before moving the directory.
- `.trellis/scripts/common/task_store.py:1050-1061` repoints sessions after the
  move.
- `.trellis/scripts/common/active_task.py:772-792` implements repointing by
  rewriting `current_task` in matching session records.

### Archive

- `.trellis/scripts/common/task_store.py:1363-1468` applies completion metadata
  and child relationship handling.
- `.trellis/scripts/common/task_store.py:1469-1475` clears path-matching sessions
  before the archive move.
- `.trellis/scripts/common/task_utils.py:121-175` owns the archive destination
  and refuses an existing destination rather than merging directories.

### Session storage and active resolution

- `.trellis/scripts/common/session_storage.py:28-34` represents a session as a
  stored workspace and TaskRef.
- `.trellis/scripts/common/session_storage.py:63-104` derives common-dir and
  validates live registered worktrees.
- `.trellis/scripts/common/session_storage.py:107-122` discovers nested Trellis
  workspace suffixes across registered worktrees.
- `.trellis/scripts/common/session_storage.py:190-215` accepts schema version 1,
  validates stored common/workspace paths, and resolves `current_task`.
- `.trellis/scripts/common/active_task.py:585-637` resolves a session record and
  derives `ActiveTask` runtime paths.
- `.trellis/scripts/common/active_task.py:697-724` writes schema version 1 plus
  path, platform, time, conversation/transcript, and `current_run` metadata.
- `.trellis/scripts/common/active_task.py:761-769` clears sessions by workspace
  plus TaskRef.

### Standalone platform readers

- `packages/cli/src/templates/opencode/lib/trellis-context.js:480-553`
  independently reads and validates the path-bearing schema.
- Pi and OMP primarily consume the structured output of `task.py current`, but
  their tests and templates include direct session fixtures that must move to
  schema 2 where they model supported current behavior.

## Historical Data Scan

A read-only scan of `.trellis/tasks/**/task.json` found:

| Observation | Count / value |
| --- | --- |
| Readable object records | 237 |
| Unreadable JSON records | 10 |
| Readable records missing `lifecycle_generation` | 237 |
| Present but invalid generations | 0 |
| Readable records with missing/empty `id` | 2 |
| Exact duplicate ID | `opencode-support` in two archived records |

Implications:

- Legacy generation defaulting is mandatory for normal repository operation.
- A global "all history must be valid and unique" precondition would make the
  feature unusable on the current repository.
- Collision checks must be scoped to the requested TaskId while still failing
  closed when a matching/case-fold candidate cannot be proven safe.
- This task must not repair the historical records as a side effect.

## Existing Test Owners

- `packages/cli/test/scripts/cross-worktree-session.integration.test.ts`
  exercises real Git worktrees and schema-v1 bindings.
- `packages/cli/test/regression.test.ts` covers create/start/current/archive,
  session cleanup, task rename, and script-template parity.
- `packages/cli/test/templates/opencode.test.ts` covers the standalone OpenCode
  resolver.
- `packages/cli/test/templates/pi.test.ts` and
  `packages/cli/test/templates/omp.test.ts` contain direct session fixtures.
- `packages/cli/test/commands/cross-worktree-update.integration.test.ts`
  validates installed cross-worktree behavior and legacy runtime cleanup.
- `packages/cli/test/templates/session-runtime-history.test.ts` and
  `packages/cli/test/scripts/session-history.integration.test.ts` protect the
  retired-data boundary around session storage.

## Distribution and Size Facts

The five target Python dogfood files are currently byte-identical to their
shipped template twins.

Current line counts:

| File | Lines |
| --- | ---: |
| `.trellis/scripts/common/task_store.py` | 1976 |
| `.trellis/scripts/common/task_utils.py` | 568 |
| `.trellis/scripts/common/session_storage.py` | 262 |
| `.trellis/scripts/common/active_task.py` | 804 |
| `.trellis/scripts/task.py` | 832 |
| `packages/cli/src/templates/opencode/lib/trellis-context.js` | 812 |

All are below the Issue #8 3000-line limit before implementation.

## Planning Conclusions

1. TaskId must remain `task.json.id`; introducing a second durable ID store is
   unnecessary and outside scope.
2. TaskRef remains the CLI/display/directory reference and may change.
3. Generation 0 is compatible with every readable legacy task without tracked
   migration.
4. Session schema 2 can be minimal because live Git/worktree and task metadata
   already provide the derivable path facts.
5. Rename session repointing becomes both unnecessary and contrary to the new
   identity contract.
6. Archive cleanup must match TaskId plus generation, not a mutable path.
7. OpenCode is the only identified direct JavaScript session resolver that must
   independently mirror Python semantics.
8. Existing schema-v1 records should become stale and be replaced only by an
   explicit `task.py start` in the selected workspace.
