#!/usr/bin/env python3
"""
Per-task workflow selection.

Resolves which workflow markdown file consumers should read. A task may pin
a workflow variant by storing `"workflow": "<id>"` in its task.json; the
variant body lives at `.trellis/workflows/<id>.md` (user-managed library).

Resolution rule (single source of truth for all consumers):
    - Active task's task.json has a non-empty string `workflow` field whose
      id matches `[A-Za-z0-9_-]+` AND `.trellis/workflows/<id>.md` is a
      file -> that variant path.
    - Selection present but id invalid or file missing -> one warning line
      on stderr (stdout is hook JSON), fall back to `.trellis/workflow.md`.
    - No task / no field / anything unreadable -> `.trellis/workflow.md`.
    - Never raises.

Provides:
    workflow_md_for_task - Resolution rule for an already-resolved task dir
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


def workflow_md_for_task(repo_root: Path, task_dir: Path | None) -> Path:
    """Return the workflow.md path for an already-resolved task dir (or None).

    Applies the per-task resolution rule documented in the module docstring.
    Never raises; any failure falls back to the global workflow path.
    """
    fallback = _global_workflow_md(repo_root)
    if task_dir is None:
        return fallback

    try:
        raw = json.loads((task_dir / FILE_TASK_JSON).read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return fallback

        workflow_id = raw.get("workflow")
        if not isinstance(workflow_id, str) or not workflow_id:
            return fallback

        if not WORKFLOW_ID_RE.match(workflow_id):
            print(
                f"Warning: task '{task_dir.name}' has invalid workflow id "
                f"{workflow_id!r}; using {DIR_WORKFLOW}/workflow.md",
                file=sys.stderr,
            )
            return fallback

        variant = repo_root / DIR_WORKFLOW / DIR_WORKFLOWS / f"{workflow_id}.md"
        if variant.is_file():
            return variant

        print(
            f"Warning: task '{task_dir.name}' selects workflow '{workflow_id}' but "
            f"{DIR_WORKFLOW}/{DIR_WORKFLOWS}/{workflow_id}.md is missing; "
            f"using {DIR_WORKFLOW}/workflow.md",
            file=sys.stderr,
        )
        return fallback
    except Exception:
        return fallback


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
