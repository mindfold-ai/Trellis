# Design: Layered workflow default

Extends 467's `common/workflow_selection.py`. One resolution function grows a
4-layer fallback; two small readers are added by copying existing patterns. No
new files except tests. No consumer changes (they call `resolve_workflow_md`).

## Reuse map (不造轮子)

| Need | Reuse |
|---|---|
| Read `config.yaml` key | `common/config.py` `_load_config` + a `get_default_workflow()` that mirrors `get_codex_dispatch_mode()` |
| Config key precedent | `default_package` in `config.yaml` template (add `default_workflow` beside it) |
| Read personal `.developer` | `common/paths.py` `get_developer` line-scan pattern → add `get_developer_workflow()` |
| Library file lookup + id regex | `workflow_selection.py` `WORKFLOW_ID_RE`, `DIR_WORKFLOWS`, existing `<root>/.trellis/workflows/<id>.md` check |
| Consumers | all already call `resolve_workflow_md` — untouched |

## Contracts

### 1. `common/config.py` (new function)
```python
def get_default_workflow(repo_root: Path | None = None) -> str | None:
    """Team-shared default workflow id from config.yaml `default_workflow`.
    Returns None when unset/blank. Mirrors get_codex_dispatch_mode()."""
```

### 2. `common/paths.py` (new function, next to get_developer)
```python
def get_developer_workflow(repo_root: Path | None = None) -> str | None:
    """Personal workflow id from `.developer` `workflow=` line (gitignored).
    Same line-scan as get_developer; returns None if absent. Never raises."""
```

### 3. `common/workflow_selection.py` (extend)

Add a private helper that maps an id → library path if valid+present:
```python
def _library_variant(repo_root: Path, workflow_id: str | None) -> Path | None:
    if not isinstance(workflow_id, str) or not workflow_id:
        return None
    if not WORKFLOW_ID_RE.match(workflow_id):
        return None                      # silent skip (invalid id → next layer)
    variant = repo_root / DIR_WORKFLOW / DIR_WORKFLOWS / f"{workflow_id}.md"
    return variant if variant.is_file() else None
```

`workflow_md_for_task` fallback (when task pin absent/invalid/missing) changes from
"return global" to a chain:
```python
# per-task pin already tried above (467 logic, unchanged — keeps its warnings)
for get_id in (_developer_workflow_id, _config_default_id):   # personal, then team
    variant = _library_variant(repo_root, get_id(repo_root))
    if variant is not None:
        return variant
return _global_workflow_md(repo_root)
```
Where `_developer_workflow_id`/`_config_default_id` wrap the paths/config readers in
try/except → None (fail-open; these live in scripts/common so import is direct).

**Precedence: per-task (467) → personal (.developer) → team (config.yaml) → global.**
Per-task keeps its existing "selected but file missing" stderr warning (467 behavior
unchanged). Personal/team layers are silent on miss (they are defaults, not explicit
per-task intent — a warning every turn would be noise).

### 4. OpenCode `opencode/plugins/inject-workflow-state.js`

Its `resolveWorkflowMd` currently: task pin → global. Extend with the same two
fallback layers in JS: read `.developer` `workflow=` and `config.yaml`
`default_workflow` (plain line scans, no new deps), same precedence, same fail-open.

### 5. `config.yaml` template
Add beside `default_package` (commented, opt-in), matching its comment style:
```yaml
# Default workflow for tasks that don't pin one (team-shared; see .trellis/workflows/).
# A personal override lives in the gitignored .developer file: `workflow=<id>`.
# default_workflow: native
```

## Data flow (task with no pin; personal=native, team=tdd)
1. Consumer calls `resolve_workflow_md` → active task has no `workflow` field.
2. `workflow_md_for_task` fallback: personal reader → `native` → `workflows/native.md`
   exists → return it. (Team `tdd` never consulted — personal wins.)
3. Remove personal `workflow=` → team `tdd` → `workflows/tdd.md`.
4. Remove both → global `.trellis/workflow.md`. Byte-identical to 467.

## Compatibility / rollback
- Both keys optional & absent by default → identical to 467.
- `.developer` reader unchanged for `name=`; new `workflow=` is additive, ignored by
  the old reader.
- Revert = single PR revert; leftover config/`.developer` keys become inert.

## Dogfood mirrors
- `.trellis/scripts/common/{config.py,paths.py,workflow_selection.py}` (live twins).
- `.opencode/plugins/inject-workflow-state.js`.
- `.trellis/config.yaml` comment block (live).
- Hooks (`.claude`/`.codex`/`.cursor` session-start + inject-workflow-state) need **no
  change** — they import `resolve_workflow_md`, inheriting the chain.
