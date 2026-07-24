# Implementation Plan: Layered workflow default

Baseline: init marketplace submodule + `LC_ALL=C LANG=C` for the full suite
(pre-commit runs it). Branch feat/workflow-config-default off 467.

## Stage A — Python core (templates)
- [x] A1. `common/config.py`: `get_default_workflow(repo_root)` mirroring
      `get_codex_dispatch_mode` (read `default_workflow`; None if unset/blank).
- [x] A2. `common/paths.py`: `get_developer_workflow(repo_root)` next to
      `get_developer` (scan `.developer` for `workflow=`; None if absent; never raises).
- [x] A3. `common/workflow_selection.py`: `_library_variant(repo_root, id)` helper +
      extend `workflow_md_for_task` fallback to per-task → personal → team → global.
      Per-task keeps its stderr warning; personal/team silent on miss.
- [x] A4. `templates/trellis/config.yaml`: commented `default_workflow:` beside
      `default_package`.

Validate: `pnpm lint:py`; direct python matrix (per-task/personal/team/global,
invalid id, missing file, `.developer` name-only backward-safety).

## Stage B — OpenCode JS mirror (template)
- [x] B1. `templates/opencode/plugins/inject-workflow-state.js` `resolveWorkflowMd`:
      same 4-layer chain (read `.developer` `workflow=`, `config.yaml`
      `default_workflow`; plain scans; fail-open).

## Stage C — Tests
- [x] C1. Extend `test/scripts/*` (or workflow.integration): precedence matrix,
      byte-identity when unset, backward-safe `.developer` reader.

## Stage D — Dogfood mirrors
- [x] D1. Live `.trellis/scripts/common/{config.py,paths.py,workflow_selection.py}`,
      `.opencode/plugins/inject-workflow-state.js`, `.trellis/config.yaml` comment.
      (Hooks unchanged — they import resolve_workflow_md.)

## Stage E — Spec doc
- [x] E1. `workflow-state-contract.md`: 4-layer resolution order + flagged assumptions.

## Stage F — Gate
- [x] F1. lint + typecheck + lint:py + `LC_ALL=C LANG=C` full suite green.
- [x] F2. trellis-check over the diff.
