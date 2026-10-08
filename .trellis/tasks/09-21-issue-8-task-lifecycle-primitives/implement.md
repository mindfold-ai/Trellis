# Implementation Plan: Stable Task Identity and Path-Free Sessions

## Preconditions

- Work only in branch `codex/issue-8-task-lifecycle-primitives` at the approved
  Fork worktree.
- Keep `castbox/Trellis#8` and the task planning artifacts as scope authority.
- Do not edit generated `packages/cli/dist/**` by hand.
- Keep each modified non-generated file below 3000 lines.
- After the schema writer changes, explicitly rebind this task before relying on
  session-driven commands.

## Ordered Implementation Checklist

### 1. Add shared task identity primitives

- [ ] Add one strict metadata reader/helper for TaskId and lifecycle generation.
- [ ] Default an absent generation to 0 in memory without writing the task.
- [ ] Reject bool, string, float, null, and negative generation values.
- [ ] Add exact plus Unicode case-fold identity comparison and targeted
  active/archive collision scanning.
- [ ] Keep malformed unrelated history from becoming a global repository gate;
  report matching or visible candidate conflicts explicitly.
- [ ] Mirror the Python edits into the shipped template tree immediately.

Primary files:

- `.trellis/scripts/common/task_utils.py`
- `.trellis/scripts/common/task_store.py`
- `packages/cli/src/templates/trellis/scripts/common/task_utils.py`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py`

### 2. Change create, rename, and archive semantics

- [ ] Make create write `lifecycle_generation: 0` and preflight TaskId
  collisions before creating the directory or session binding.
- [ ] Change rename so only `name`, directory, JSONL TaskRefs, and back-references
  move; preserve `id` and generation.
- [ ] Remove rename session repoint behavior and update dry-run/help text.
- [ ] Change archive session cleanup to use exact TaskId plus generation while
  preserving identity/source fields in archived metadata.
- [ ] Preserve current path safety, child normalization, hooks, and scoped
  auto-commit behavior.

Primary files:

- `.trellis/scripts/common/task_store.py`
- `.trellis/scripts/common/task_utils.py`
- `.trellis/scripts/task.py`
- matching files under `packages/cli/src/templates/trellis/scripts/`

### 3. Replace session schema and resolver

- [ ] Replace `SessionRecord.workspace/task_ref` authority with strict
  `task_id/lifecycle_generation` identity.
- [ ] Write schema version 2 with exactly three keys.
- [ ] Remove persisted platform, timestamp, conversation, transcript, TaskRef,
  path, Git, owner, authorization, and run fields.
- [ ] Make schema v1 and unversioned path-bearing records unsupported/stale.
- [ ] Resolve active tasks by scanning live registered Trellis worktrees and
  requiring one exact identity/generation match with no case-fold conflict.
- [ ] Preserve the non-Git invocation-local lookup mode.
- [ ] Keep the derived `ActiveTask` runtime fields expected by downstream
  consumers.
- [ ] Make clear/archive selection use identity plus generation; delete the
  rename repoint API if no caller remains.

Primary files:

- `.trellis/scripts/common/session_storage.py`
- `.trellis/scripts/common/active_task.py`
- `.trellis/scripts/common/paths.py` if the derived runtime contract requires a
  narrow adaptation
- matching files under `packages/cli/src/templates/trellis/scripts/`

### 4. Rebind the active Fork task after schema cutover

- [ ] From the Fork worktree, run:

```bash
python3 .trellis/scripts/task.py start \
  09-21-issue-8-task-lifecycle-primitives
```

- [ ] Verify `task.py current --source` resolves the same task from a schema-2
  record.
- [ ] Treat this as an explicit rebind only; do not add migration code to make
  the old record pass.

### 5. Align OpenCode and platform fixtures

- [ ] Implement the schema-2 and live-worktree identity resolver in
  `packages/cli/src/templates/opencode/lib/trellis-context.js`.
- [ ] Match Python outcomes for exact success, zero/multiple matches,
  case-fold collisions, invalid generation, generation mismatch, and stale
  schema v1.
- [ ] Update direct session fixtures in OpenCode, Pi, OMP, Snow, update, and
  hook tests where they represent supported current behavior.
- [ ] Preserve deliberate historical/schema-v1 fixtures as negative cases.
- [ ] Update extractor/template registrations only if the canonical file set or
  generated golden expectations require it.

### 6. Add focused regression coverage

- [ ] Create: stable ID, mutable name, generation 0, no context-key write.
- [ ] Metadata: legacy default 0 and every invalid generation type/value.
- [ ] Collision: active/archive exact, Unicode case-fold, malformed candidate,
  and unrelated malformed history.
- [ ] Rename: ID bytes and generation unchanged; TaskRef/backrefs updated;
  session file unchanged; next read resolves the new TaskRef.
- [ ] Archive: identity/source/generation preserved; only exact
  TaskId/generation sessions cleared.
- [ ] Session: exact schema-2 keys, v1 stale, no path authority, registered
  worktree resolution, unregistered worktree exclusion, zero/multiple/case-fold
  conflict, and generation mismatch.
- [ ] OpenCode: parity for the same success and failure matrix.
- [ ] Generated/template: dogfood Python parity and build/golden assertions.

Likely test owners:

- `packages/cli/test/scripts/cross-worktree-session.integration.test.ts`
- `packages/cli/test/scripts/task-archive.integration.test.ts`
- `packages/cli/test/regression.test.ts`
- `packages/cli/test/templates/opencode.test.ts`
- `packages/cli/test/templates/pi.test.ts`
- `packages/cli/test/templates/omp.test.ts`
- `packages/cli/test/templates/session-runtime-history.test.ts`
- `packages/cli/test/commands/cross-worktree-update.integration.test.ts`

### 7. Update durable specification if implementation reveals contract detail

- [ ] Update `.trellis/spec/cli/backend/identity-free-task-lifecycle.md` with
  stable TaskId, generation, schema-2 storage, and fresh resolution.
- [ ] Keep `filesystem-safety.md` and `script-conventions.md` consistent if a
  shared helper or parity rule changes.
- [ ] Do not add reopen/reactivation generation transitions to this task.

## Validation Sequence

Run targeted checks first, then the full package gate:

```bash
pnpm install --frozen-lockfile

pnpm --dir packages/cli test -- \
  test/scripts/cross-worktree-session.integration.test.ts \
  test/scripts/task-archive.integration.test.ts \
  test/templates/opencode.test.ts \
  test/regression.test.ts

pnpm --dir packages/cli run lint:all
pnpm --dir packages/cli run build
pnpm --dir packages/cli test

diff -rq .trellis/scripts \
  packages/cli/src/templates/trellis/scripts \
  -x __pycache__

python3 .trellis/scripts/task.py validate \
  09-21-issue-8-task-lifecycle-primitives

git diff --check
```

For every modified non-generated file, run and record:

```bash
wc -l <file>
```

The full test gate must include task CLI, task/session Python integration,
platform template tests, and generated golden assertions. Any omitted command or
environmental failure must be reported as an explicit verification gap, not a
pass.

## Review Gates

- [ ] Review the complete diff against each PRD requirement and acceptance
  criterion.
- [ ] Inspect written session JSON to prove forbidden fields are absent.
- [ ] Inspect rename before/after metadata and session bytes.
- [ ] Inspect archived metadata and session cleanup selection.
- [ ] Confirm Python/OpenCode failure classifications agree.
- [ ] Confirm no compatibility alias, dual-read, dual-write, identity index,
  workspace map, or second store was introduced.
- [ ] Confirm no unrelated malformed archive repair was included.

## Risk and Rollback Points

- **Schema split risk**: writer and every direct reader must change together.
  Roll back the coordinated contract, not one file.
- **Current task loses binding after writer cutover**: execute the explicit
  rebind step before continuing session-dependent validation.
- **Historical data risk**: collision scans must be targeted so known malformed
  records do not block unrelated IDs.
- **Platform drift risk**: OpenCode has an independent resolver; template tests
  must compare its semantics with Python, not only source strings.
- **Generated artifact risk**: regenerate through the package build and never
  hand-edit `dist`.
- **File-size risk**: current target files are below 3000 lines, but
  `task_store.py` is the closest limit and must be rechecked after edits.
