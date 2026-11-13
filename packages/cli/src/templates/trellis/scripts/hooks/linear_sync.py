#!/usr/bin/env python3
"""Linear sync hook for Trellis task lifecycle.

Syncs task events to Linear via the `linearis` CLI.

Usage (called automatically by task.py hooks):
    python3 .trellis/scripts/hooks/linear_sync.py create
    python3 .trellis/scripts/hooks/linear_sync.py start
    python3 .trellis/scripts/hooks/linear_sync.py archive

Manual usage:
    TASK_JSON_PATH=.trellis/tasks/<name>/task.json python3 .trellis/scripts/hooks/linear_sync.py sync

Environment:
    TASK_JSON_PATH  - Absolute path to task.json (set by task.py)

Configuration:
    .trellis/hooks.local.json  - Local config (gitignored), example:
    {
      "linear": {
        "team": "TEAM_KEY",
        "project": "Project Name"
      }
    }
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

# This nested CLI entry point uses the installed scripts package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.io import read_json_checked, write_json
from common.path_boundary import require_project_path
from common.paths import FILE_TASK_JSON, get_repo_root, get_tasks_dir
from common.runtime_contract import require_task_runtime
from common.tasks import task_lifecycle_inventory
from common.task_utils import find_task_by_name, resolve_task_dir

# ─── Configuration ────────────────────────────────────────────────────────────

# Trellis priority → Linear priority (1=Urgent, 2=High, 3=Medium, 4=Low)
PRIORITY_MAP = {"P0": 1, "P1": 2, "P2": 3, "P3": 4}

# Linear status names (must match your team's workflow)
STATUS_IN_PROGRESS = "In Progress"
STATUS_DONE = "Done"


def _load_config() -> dict:
    """Load local hook config from .trellis/hooks.local.json."""
    root = get_repo_root()
    config_path = root / ".trellis" / "hooks.local.json"
    require_project_path(config_path, root)
    try:
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _read_task() -> tuple[dict, Path]:
    path = os.environ.get("TASK_JSON_PATH", "")
    if not path:
        print("TASK_JSON_PATH not set", file=sys.stderr)
        sys.exit(1)
    root = get_repo_root()
    task_json = Path(path)
    if not task_json.is_absolute():
        task_json = root / task_json
    if task_json.name != FILE_TASK_JSON or task_json.is_symlink():
        raise ValueError(f"invalid_task_locator: {task_json}: expected non-symlink task.json")
    directory = resolve_task_dir(str(task_json.parent), root)
    if directory is None:
        raise ValueError(f"invalid_task_locator: {task_json}")
    task_json = directory / FILE_TASK_JSON
    require_project_path(task_json, root)
    data, reason = read_json_checked(task_json)
    if data is None:
        raise ValueError(f"task_metadata_{reason}: {task_json}")
    require_task_runtime(root, data)
    return data, task_json


def _write_task(data: dict, path: Path) -> None:
    require_project_path(path, get_repo_root())
    if not write_json(path, data):
        raise ValueError(f"task_metadata_write_failed: {path}: existing Task unchanged")


def _linearis(*args: str) -> dict | None:
    result = subprocess.run(
        ["linearis", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        print(f"linearis error: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    stdout = result.stdout.strip()
    if stdout:
        return json.loads(stdout)
    return None


def _get_linear_issue(task: dict) -> str | None:
    meta = task.get("meta")
    if isinstance(meta, dict):
        return meta.get("linear_issue")
    return None


# ─── Actions ──────────────────────────────────────────────────────────────────


def cmd_create() -> None:
    task, path = _read_task()
    config = _load_config().get("linear", {})
    team = config.get("team", "")
    project = config.get("project", "")
    if not team:
        print("No linear.team configured in hooks.local.json", file=sys.stderr)
        sys.exit(1)

    # Skip if already linked
    if _get_linear_issue(task):
        print(f"Already linked: {_get_linear_issue(task)}")
        return

    title = task.get("title") or task.get("name") or "Untitled"
    args = ["issues", "create", title, "--team", team]

    # Map priority
    priority = PRIORITY_MAP.get(task.get("priority", ""), 0)
    if priority:
        args.extend(["-p", str(priority)])

    # Set project
    if project:
        args.extend(["--project", project])

    # Link to parent's Linear issue if available
    parent_issue = _resolve_parent_linear_issue(task)
    if parent_issue:
        args.extend(["--parent-ticket", parent_issue])

    result = _linearis(*args)
    if result and "identifier" in result:
        if not isinstance(task.get("meta"), dict):
            task["meta"] = {}
        task["meta"]["linear_issue"] = result["identifier"]
        _write_task(task, path)
        print(f"Created Linear issue: {result['identifier']}")


def cmd_start() -> None:
    task, _ = _read_task()
    if task.get("schema_version") == "2.0":
        # Task start is binding, never Delivery implementation or description sync.
        return
    issue = _get_linear_issue(task)
    if not issue:
        return
    _linearis("issues", "update", issue, "-s", STATUS_IN_PROGRESS)
    print(f"Updated {issue} -> {STATUS_IN_PROGRESS}")
    cmd_sync()


def cmd_archive() -> None:
    task, _ = _read_task()
    if task.get("schema_version") == "2.0" and not task_lifecycle_inventory(task).completion_result_id:
        raise ValueError("current_completion_required: archive sync requires Completion matching current generation and accepted scope")
    issue = _get_linear_issue(task)
    if not issue:
        return
    _linearis("issues", "update", issue, "-s", STATUS_DONE)
    print(f"Updated {issue} -> {STATUS_DONE}")


def cmd_sync() -> None:
    """Sync prd.md content to Linear issue description."""
    task, task_json = _read_task()
    issue = _get_linear_issue(task)
    if not issue:
        print("No linear_issue in meta, run create first", file=sys.stderr)
        sys.exit(1)

    # Find prd.md next to task.json
    prd_path = task_json.parent / "prd.md"
    require_project_path(prd_path, get_repo_root())
    if not prd_path.is_file():
        print(f"No prd.md found at {prd_path}", file=sys.stderr)
        sys.exit(1)

    description = prd_path.read_text(encoding="utf-8").strip()
    _linearis("issues", "update", issue, "-d", description)
    print(f"Synced prd.md to {issue} description")


# ─── Parent Issue Resolution ─────────────────────────────────────────────────


def _resolve_parent_linear_issue(task: dict) -> str | None:
    """Find parent task's Linear issue identifier."""
    parent_name = task.get("parent")
    if not parent_name:
        return None

    root = get_repo_root()
    directory = find_task_by_name(parent_name, get_tasks_dir(root), root)
    if directory is None:
        raise ValueError(f"invalid_parent_task: {parent_name}")
    parent_json = directory / FILE_TASK_JSON
    require_project_path(parent_json, root)
    parent_task, reason = read_json_checked(parent_json)
    if parent_task is None:
        raise ValueError(f"parent_task_metadata_{reason}: {parent_json}")
    return _get_linear_issue(parent_task)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    actions = {
        "create": cmd_create,
        "start": cmd_start,
        "archive": cmd_archive,
        "sync": cmd_sync,
    }
    fn = actions.get(action)
    if fn:
        try:
            fn()
        except (ValueError, OSError) as exc:
            print(f"Linear sync error: {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        print(f"Unknown action: {action}", file=sys.stderr)
        print(f"Valid actions: {', '.join(actions)}", file=sys.stderr)
        sys.exit(1)
