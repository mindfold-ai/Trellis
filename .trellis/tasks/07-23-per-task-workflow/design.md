# Design: Per-task dynamic workflow selection

## Architecture summary

One new shared Python module owns the resolution rule; every consumer swaps its
hardcoded `.trellis/workflow.md` path for a call into it. A new `--save` mode on the
existing `trellis workflow` command populates the variant library. Selection state is a
single optional `task.json` field.

```
task.json { "workflow": "tdd" }          .trellis/workflows/tdd.md   (library, user-managed)
        │                                        │
        └──> common/workflow_selection.py ───────┘
                resolve_workflow_md()  →  Path(.trellis/workflows/tdd.md)
                                          └ fallback: .trellis/workflow.md
        consumers:
          shared-hooks/session-start.py        (SessionStart Phase Index)
          shared-hooks/inject-workflow-state.py (per-turn breadcrumbs)
          scripts/common/workflow_phase.py      (get_context.py --mode phase)
          opencode/plugins/inject-workflow-state.js (JS port)
```

## Contracts

### 1. `common/workflow_selection.py` (new, in `templates/trellis/scripts/common/`)

```python
def workflow_md_for_task(repo_root: Path, task_dir: Path | None) -> Path:
    """Resolution rule, given an already-resolved task dir (or None)."""

def resolve_workflow_md(repo_root: Path, input_data: dict | None = None,
                        platform: str | None = None) -> Path:
    """Convenience: resolve the session-aware active task via
    common.active_task.resolve_active_task, then apply workflow_md_for_task."""
```

Rule (both functions):
- task.json readable AND has non-empty string field `workflow` (id validated
  `[A-Za-z0-9_-]+` to prevent path traversal) AND
  `repo_root/.trellis/workflows/<id>.md` is a file → return that path.
- Selection present but file missing/invalid → one-line warning to **stderr**
  (never stdout — stdout is hook JSON), return global path.
- No task / no field / anything unreadable → `repo_root/.trellis/workflow.md`.
- Never raises.

Why a scripts/common module and not hook-local code: both hooks already
`sys.path.insert(.trellis/scripts)` and import `common.active_task` /
`common.config` (inject-workflow-state.py:139-145, session-start.py:269-271), and
`workflow_phase.py` lives in the same package — one module keeps the rule single-source.

### 2. Consumer patches (minimal, identical shape)

- `session-start.py` `main()`: `_build_workflow_overview(trellis_dir / "workflow.md")`
  → `_build_workflow_overview(_resolve_workflow_md(...))` using the same sys.path
  import pattern; falls back to the global path if the import itself fails
  (hooks must never die on a missing scripts tree).
- `inject-workflow-state.py` `load_breadcrumbs(root)`: path built at line 195 →
  resolver call. Signature gains the already-available `input_data` so active-task
  resolution matches the status lookup (same session key).
- `workflow_phase.py` `_workflow_md_path()`: `get_repo_root()/DIR_WORKFLOW/"workflow.md"`
  → `workflow_selection.resolve_workflow_md(get_repo_root())` (CLI path: active task
  comes from env/runtime pointer via resolve_active_task's existing fallbacks).
- `opencode/plugins/inject-workflow-state.js`: JS port of the same rule (read active
  task's task.json, check `workflows/<id>.md` existence, fallback). Mirrors the
  Python behavior for the same inputs.

### 3. `task.py` selection surface

- `task.py create --workflow <id>`: stores `"workflow": "<id>"` in task.json.
  Unknown-id warning (no `.trellis/workflows/<id>.md` yet) — warn, don't block.
- `task.py workflow <id>` / `task.py workflow --clear`: set/remove on the current
  session's active task; prints resolved effective workflow path after change.
- Field is optional; absent = global workflow. Archive carries it away naturally.

### 4. `trellis workflow --save <id>` (TS CLI)

- Reuses `resolveWorkflowTemplate(id, source)` + `replacePythonCommandLiterals`
  (same pipeline as `--template`, commands/workflow.ts:170).
- Writes `.trellis/workflows/<id>.md`; creates the dir on demand.
- **Never** touches `.trellis/workflow.md` or `.template-hashes.json` — the library
  is user-managed by definition (same ownership stance as non-native global:
  hash absence = user content; here we simply never add hashes).
- Existing file: overwrite requires `--force`, else error (no interactive prompt in
  MVP — the library is low-risk, `--force` is enough).
- Marker validation (warn, never block): `## Phase Index` present, ≥1 `#### X.Y`
  step heading, all six `[workflow-state:*]` statuses used by the native template.
  Shared with nothing (new small helper in workflow.ts; the contract source is
  `.trellis/spec/cli/backend/workflow-state-contract.md`).
- `--list` additionally prints a `Library (.trellis/workflows/)` section with ids
  found on disk.
- `--save` composes with `-m/--marketplace <source>` exactly like `--template`.

### 5. `trellis update` interaction

`update` builds its desired-file map from template sources; `.trellis/workflows/` is
never in that map, so update leaves it alone (same as `tasks/`). No code change; a
regression test asserts update does not delete/modify a library file.

## Data flow (session start, task with `workflow: tdd`)

1. Hook resolves active task (existing) → task_dir.
2. `workflow_md_for_task` reads task.json once, validates id, stats
   `workflows/tdd.md` → path.
3. `_build_workflow_overview(path)` extracts that file's Phase Index.
4. Per-turn hook does the same for `[workflow-state:*]` blocks; `--mode phase`
   serves step bodies from the same file. All three re-read per invocation —
   switching tasks switches workflow next turn with no cache invalidation
   (property inherited from the existing design).

## Compatibility / rollout

- No `workflow` field anywhere ⇒ every consumer takes the fallback branch
  immediately ⇒ byte-identical outputs (AC-verified).
- Old task.json files: field absent — safe. New field ignored by older Trellis
  versions (task.json readers ignore unknown keys) — forward-safe.
- Variant files must satisfy the same parser contract as workflow.md
  (## Phase Index, #### X.Y, [workflow-state:*], platform markers) — enforced
  softly at `--save` time, and marketplace workflow templates already comply.
- Dogfood mirrors: identical patches applied to live `.claude/hooks/*.py`,
  `.trellis/scripts/common/*.py`, `.trellis/scripts/task.py`,
  `.opencode/plugins/inject-workflow-state.js` (surgical patch, not wholesale
  resync — live session-start.py has unrelated local drift we must not clobber).

## Known collisions / degradations (documented, accepted)

- PR #337 (workflow YAML manifest) would relocate workflow bodies; our resolver is
  one function, trivially re-pointable during that migration. Dir name `workflows/`
  (plural) avoids its `workflow/` namespace.
- Pi / OMP extensions keep injecting the global workflow this iteration (their
  reads sit inside monolithic TS extensions); follow-up noted in PR description.
- 05-15 non-goal "no long-lived workflow.variant config": respected — selection is
  task-scoped, not config; global file + hash contract untouched.

## Rollback

Single revert of the PR restores prior behavior; tasks carrying a `workflow` field
degrade to the global workflow (field simply unread), no data migration either way.
