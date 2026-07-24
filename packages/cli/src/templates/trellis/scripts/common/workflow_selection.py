#!/usr/bin/env python3
"""
Per-task workflow selection.

Resolves which workflow markdown file consumers should read. A task may pin
a workflow variant by storing `"workflow": "<id>"` in its task.json; the
variant body lives at `.trellis/workflows/<id>.md` (user-managed library).

Resolution precedence (single source of truth for all consumers), highest
to lowest — each layer resolves an id to `.trellis/workflows/<id>.md` and
falls through when unset, invalid, or pointing at a missing file:
    1. Per-task pin  - active task's task.json `workflow` (session-bound,
       explicit; a bad id or missing file warns once on stderr, then falls
       through rather than aborting).
    2. Personal      - `.developer` `workflow=<id>` (gitignored, per-developer;
       outranks the team default). Silent on miss.
    3. Team default  - config.yaml `default_workflow` (git-tracked, shared).
       Silent on miss.
    4. Global        - `.trellis/workflow.md`.
With neither a per-task pin nor the personal/team keys set, this is identical
to reading the global `.trellis/workflow.md`. Never raises.

Provides:
    workflow_md_for_task - Full precedence for an already-resolved task dir
    resolve_workflow_md  - Session-aware wrapper via the active task resolver
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from .paths import DIR_WORKFLOW, FILE_TASK_JSON

# Workflow variant library directory under .trellis/ (plural on purpose:
# `.trellis/workflow/` is reserved by the YAML-manifest migration).
DIR_WORKFLOWS = "workflows"

# Workflow ids must be plain slugs; anything else (path separators, dots)
# is rejected so a task.json value can never escape .trellis/workflows/.
WORKFLOW_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _global_workflow_md(repo_root: Path) -> Path:
    return repo_root / DIR_WORKFLOW / "workflow.md"


def _library_variant(repo_root: Path, workflow_id: str | None) -> Path | None:
    """Map a workflow id to its library file if valid and present, else None.

    Shared by every layer (per-task pin, personal, team). An id with path
    separators/dots/blanks, or one whose `.trellis/workflows/<id>.md` file does
    not exist, returns None so the caller falls through. Never raises.
    """
    if not isinstance(workflow_id, str) or not workflow_id:
        return None
    if not WORKFLOW_ID_RE.match(workflow_id):
        return None
    variant = repo_root / DIR_WORKFLOW / DIR_WORKFLOWS / f"{workflow_id}.md"
    return variant if variant.is_file() else None


def _developer_workflow_id(repo_root: Path) -> str | None:
    """Personal override id from the gitignored .developer file (fail-open)."""
    try:
        from .paths import get_developer_workflow

        return get_developer_workflow(repo_root)
    except Exception:
        return None


def _config_default_id(repo_root: Path) -> str | None:
    """Team-shared default id from config.yaml `default_workflow` (fail-open)."""
    try:
        from .config import get_default_workflow

        return get_default_workflow(repo_root)
    except Exception:
        return None


def _default_workflow_md(repo_root: Path) -> Path:
    """Resolve the non-per-task default: personal -> team -> global.

    Personal (`.developer` `workflow=`) outranks the team-shared
    (config.yaml `default_workflow`) layer; both fall through to the global
    `.trellis/workflow.md` when unset, invalid, or naming a missing file. These
    layers are silent on miss (they are defaults, not an explicit per-task
    choice — a per-turn warning would be noise).
    """
    for get_id in (_developer_workflow_id, _config_default_id):
        variant = _library_variant(repo_root, get_id(repo_root))
        if variant is not None:
            return variant
    return _global_workflow_md(repo_root)


def _task_pin_variant(repo_root: Path, task_dir: Path | None) -> Path | None:
    """Return the per-task pinned variant path, or None to fall through.

    Emits a stderr warning on an invalid id or a missing variant file (an
    explicit per-task choice that cannot be honored), then returns None so
    resolution continues with the personal/team defaults. Never raises.
    """
    if task_dir is None:
        return None

    try:
        raw = json.loads((task_dir / FILE_TASK_JSON).read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None

        workflow_id = raw.get("workflow")
        if not isinstance(workflow_id, str) or not workflow_id:
            return None

        if not WORKFLOW_ID_RE.match(workflow_id):
            print(
                f"Warning: task '{task_dir.name}' has invalid workflow id "
                f"{workflow_id!r}; using default workflow resolution",
                file=sys.stderr,
            )
            return None

        variant = _library_variant(repo_root, workflow_id)
        if variant is not None:
            return variant

        print(
            f"Warning: task '{task_dir.name}' selects workflow '{workflow_id}' but "
            f"{DIR_WORKFLOW}/{DIR_WORKFLOWS}/{workflow_id}.md is missing; "
            f"using default workflow resolution",
            file=sys.stderr,
        )
        return None
    except Exception:
        return None


def workflow_md_for_task(repo_root: Path, task_dir: Path | None) -> Path:
    """Return the workflow.md path for an already-resolved task dir (or None).

    Applies the full precedence documented in the module docstring:
    per-task pin -> personal (.developer) -> team (config.yaml) -> global.
    Never raises; any failure falls through toward the global workflow path.
    """
    pin = _task_pin_variant(repo_root, task_dir)
    if pin is not None:
        return pin
    return _default_workflow_md(repo_root)


def resolve_workflow_md(
    repo_root: Path,
    input_data: dict | None = None,
    platform: str | None = None,
) -> Path:
    """Resolve the session-aware active task, then apply the resolution rule.

    ``input_data`` is the raw hook payload (session/conversation identity);
    CLI callers may omit it — the active-task resolver then falls back to
    environment context. Never raises; any failure resolves to the global
    `.trellis/workflow.md`.
    """
    try:
        from .active_task import resolve_active_task, resolve_task_ref

        active = resolve_active_task(repo_root, input_data, platform)
        task_dir: Path | None = None
        if active.task_path:
            task_dir = resolve_task_ref(active.task_path, repo_root)
        return workflow_md_for_task(repo_root, task_dir)
    except Exception:
        return _global_workflow_md(repo_root)
