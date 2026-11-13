"""
Task data access layer.

Single source of truth for loading and iterating task directories.
Replaces scattered task.json parsing across 9+ files.

Provides:
    load_task          — Load a single task by directory path
    iter_active_tasks  — Iterate all non-archived tasks (sorted)
    get_all_statuses   — Get {dir_name: status} map for children progress
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

from .io import describe_json_read_failure, read_json_checked
from .path_boundary import ProjectPathError, require_project_path
from .paths import FILE_TASK_JSON, get_repo_root
from .types import DeliveryInventory, TaskInfo, TaskLifecycleInventory


def task_lifecycle_inventory(data: dict) -> TaskLifecycleInventory:
    """Inventory-only Task acceptance projection; never a Delivery selector."""
    completion = next((r for r in data["completion_results"] if r["lifecycle_generation"] == data["lifecycle_generation"] and r["accepted_scope"] == data["accepted_scope"]), None)
    return TaskLifecycleInventory(
        lifecycle_generation=data["lifecycle_generation"], accepted_scope=data["accepted_scope"],
        completion_result_id=completion["result_id"] if completion else None,
        deliveries=tuple(DeliveryInventory(
            id=d["id"], lifecycle_generation=d["lifecycle_generation"], profile=d["profile"], phase=d["phase"],
            delivery_result_id=d["delivery_result"]["result_id"] if d["delivery_result"] else None,
            stop_result_id=d["stop_result"]["result_id"] if d["stop_result"] else None,
        ) for d in data["deliveries"]),
    )


def task_lifecycle_summary(data: dict) -> dict:
    """Serializable schema-2 inventory, separate from exact session selection."""
    return task_lifecycle_inventory(data).summary()


def validate_inventory_filters(completion: str | None, phase: str | None) -> None:
    """Reject unknown filters even when the inventory is empty."""
    from .delivery_schema import PHASES
    if completion not in (None, "complete", "incomplete") or (phase is not None and phase not in PHASES):
        raise ValueError("invalid inventory filter")


def matches_task_inventory(task: TaskInfo, *, status: str | None = None,
                           completion: str | None = None, phase: str | None = None) -> bool:
    """Apply closed, independent legacy-status and schema-2 inventory filters."""
    validate_inventory_filters(completion, phase)
    if status is not None and (task.inventory is not None or task.status != status):
        return False
    if completion is not None:
        if task.inventory is None or bool(task.inventory.completion_result_id) != (completion == "complete"):
            return False
    if phase is not None and (task.inventory is None or not any(d.phase == phase for d in task.inventory.current_deliveries)):
        return False
    return True


def task_inventory_label(task: TaskInfo) -> str:
    """Render acceptance/slices for v2 or the explicit legacy status."""
    if task.history_only:
        return "legacy history only; unsupported_task_schema for execution"
    return task.inventory.label() if task.inventory is not None else task.status or "unknown"


def task_inventory_summary(task: TaskInfo) -> dict:
    """Serialize the explicitly separated v2, deferred-history and legacy views."""
    if task.inventory is not None:
        return task.inventory.summary()
    if task.history_only:
        return {"record_schema": "legacy", "history_only": True}
    return {"status": task.status}


def load_task(task_dir: Path, repo_root: Path | None = None) -> TaskInfo | None:
    """Load task from a directory containing task.json.

    Args:
        task_dir: Absolute path to the task directory.

    Returns:
        TaskInfo if task.json exists and is valid, None otherwise.

    A directory without task.json is not a task, so it is skipped silently.
    A task.json that exists but cannot be loaded is different: the task
    disappears from `task.py list` and from every context the iterator feeds.
    Callers stay tolerant, but the skip is announced on stderr so a task
    cannot vanish from the workflow with no diagnostic anywhere.
    """
    task_json = task_dir / FILE_TASK_JSON
    try:
        require_project_path(task_json, repo_root if repo_root is not None else get_repo_root())
    except ProjectPathError as exc:
        print(f"[WARN] Skipping task '{task_dir.name}': {exc}", file=sys.stderr)
        return None
    if not task_json.is_file():
        return None

    data, reason = read_json_checked(task_json)
    if data is None:
        problem, hint = describe_json_read_failure(task_json, reason)
        print(f"[WARN] Skipping task '{task_dir.name}': {problem}", file=sys.stderr)
        print(f"       {hint}", file=sys.stderr)
        return None

    history_only = False
    from .runtime_contract import RuntimeContractError, require_task_runtime
    workspace = repo_root if repo_root is not None else get_repo_root()
    try:
        require_task_runtime(workspace, data)
    except RuntimeContractError as exc:
        if data.get("schema_version") != "2.0" and exc.code == "unsupported_task_schema":
            history_only = True
        else:
            print(f"[WARN] Skipping task '{task_dir.name}': {exc}", file=sys.stderr)
            return None

    return TaskInfo(
        dir_name=task_dir.name,
        directory=task_dir,
        title=data.get("title") or data.get("name") or "unknown",
        status=None if data.get("schema_version") == "2.0" or history_only else data.get("status", "unknown"),
        priority=data.get("priority", "P2"),
        children=tuple(data.get("children", [])),
        parent=data.get("parent"),
        package=data.get("package"),
        raw=data,
        inventory=task_lifecycle_inventory(data) if data.get("schema_version") == "2.0" else None,
        history_only=history_only,
    )


def iter_active_tasks(tasks_dir: Path, repo_root: Path | None = None) -> Iterator[TaskInfo]:
    """Iterate all active (non-archived) tasks, sorted by directory name.

    Skips the "archive" directory and directories without valid task.json.

    Args:
        tasks_dir: Path to the tasks directory.

    Yields:
        TaskInfo for each valid task.
    """
    root = repo_root if repo_root is not None else get_repo_root()
    require_project_path(tasks_dir, root)
    if not tasks_dir.is_dir():
        return

    for d in sorted(tasks_dir.iterdir()):
        if d.name == "archive":
            continue
        try:
            require_project_path(d, root)
        except ProjectPathError as exc:
            print(f"[WARN] Skipping task '{d.name}': {exc}", file=sys.stderr)
            continue
        if not d.is_dir():
            continue
        info = load_task(d, root)
        if info is not None:
            yield info


def get_all_statuses(tasks_dir: Path, repo_root: Path | None = None) -> dict[str, str | TaskLifecycleInventory]:
    """Get legacy statuses or typed schema-2 acceptance inventory by name.

    Useful for computing children progress without loading full TaskInfo.

    Args:
        tasks_dir: Path to the tasks directory.

    Returns:
        Legacy status strings or schema-2 acceptance projections. Archive
        location alone never supplies schema-2 Completion.
    """
    root = repo_root if repo_root is not None else get_repo_root()
    statuses = {t.dir_name: t.inventory if t.inventory is not None else t.status or "unknown"
                for t in iter_active_tasks(tasks_dir, root) if not t.history_only}
    archive = tasks_dir / "archive"
    require_project_path(archive, root)
    if archive.is_dir():
        for month in sorted(archive.iterdir()):
            require_project_path(month, root)
            if not month.is_dir():
                continue
            for directory in sorted(month.iterdir()):
                info = load_task(directory, root)
                if info is not None and info.raw.get("schema_version") == "2.0":
                    assert info.inventory is not None
                    statuses.setdefault(info.dir_name, info.inventory)
    return statuses


def children_progress(
    children: tuple[str, ...] | list[str],
    all_statuses: dict[str, str | TaskLifecycleInventory],
    *, allow_missing_legacy: bool = True,
) -> str:
    """Format children progress string like " [2/3 done]".

    Args:
        children: List of child directory names.
        all_statuses: Status map from get_all_statuses().

    Returns:
        Formatted string, or "" if no children.
    """
    if not children:
        return ""
    # A child missing from active statuses has been archived (cmd_archive
    # sets status=completed before moving the dir). Count it as done so
    # parent progress doesn't regress when children are archived.
    def completed(child: str) -> bool:
        value = all_statuses.get(child)
        if isinstance(value, TaskLifecycleInventory):
            return value.completion_result_id is not None
        return allow_missing_legacy and (child not in all_statuses or value in ("completed", "done"))

    done = sum(1 for child in children if completed(child))
    return f" [{done}/{len(children)} done]"
