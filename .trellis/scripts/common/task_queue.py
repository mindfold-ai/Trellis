#!/usr/bin/env python3
"""
Task queue utility functions.

Provides:
    list_tasks_by_status   - List tasks by status
    list_pending_tasks     - List tasks with pending status
    get_task_stats         - Get P0/P1/P2/P3 counts
"""

from __future__ import annotations

from pathlib import Path

from .paths import (
    get_repo_root,
    get_tasks_dir,
)
from .tasks import iter_active_tasks, matches_task_inventory, task_inventory_summary, validate_inventory_filters
from .types import TaskInfo


# =============================================================================
# Internal helper
# =============================================================================

def _task_to_dict(t: TaskInfo) -> dict:
    """Convert TaskInfo to the dict format callers expect."""
    result = {
        "priority": t.priority,
        "id": t.raw.get("id", ""),
        "title": t.title,
        "status": t.status,
        "dir": t.dir_name,
        "children": list(t.children),
        "parent": t.parent,
    }
    if t.inventory is not None or t.history_only:
        result.pop("status")
        result.update(task_inventory_summary(t))
    return result


# =============================================================================
# Public Functions
# =============================================================================

def list_tasks_by_status(
    filter_status: str | None = None,
    repo_root: Path | None = None
) -> list[dict]:
    """List tasks by status.

    Args:
        filter_status: Optional status filter.
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        List of task info dicts with keys: priority, id, title, status.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    tasks_dir = get_tasks_dir(repo_root)
    results = []

    for t in iter_active_tasks(tasks_dir, repo_root):
        if not matches_task_inventory(t, status=filter_status):
            continue
        results.append(_task_to_dict(t))

    return results


def list_task_inventory(repo_root: Path | None = None, *,
                        completion: str | None = None, phase: str | None = None) -> list[dict]:
    """Read Task acceptance and slice inventory with explicit v2 filters."""
    validate_inventory_filters(completion, phase)
    root = repo_root if repo_root is not None else get_repo_root()
    return [_task_to_dict(task) for task in iter_active_tasks(get_tasks_dir(root), root)
            if matches_task_inventory(task, completion=completion, phase=phase)]


def list_pending_tasks(repo_root: Path | None = None) -> list[dict]:
    """List incomplete v2 Tasks and legacy planning Tasks.

    This is whole-Task inventory, not an implementation queue or a selector.
    Missing acceptance or Delivery selection does not authorize execution.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        List of task info dicts.
    """
    root = repo_root if repo_root is not None else get_repo_root()
    return [_task_to_dict(task) for task in iter_active_tasks(get_tasks_dir(root), root)
            if (task.inventory is not None and task.inventory.completion_result_id is None)
            or (not task.history_only and task.inventory is None and task.status == "planning")]


def get_task_stats(repo_root: Path | None = None) -> dict[str, int]:
    """Get task statistics.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Dict with keys: P0, P1, P2, P3, Total.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    tasks_dir = get_tasks_dir(repo_root)
    stats = {"P0": 0, "P1": 0, "P2": 0, "P3": 0, "Total": 0}

    for t in iter_active_tasks(tasks_dir, repo_root):
        if t.priority in stats:
            stats[t.priority] += 1
        stats["Total"] += 1

    return stats


def format_task_stats(stats: dict[str, int]) -> str:
    """Format task stats as string.

    Args:
        stats: Stats dict from get_task_stats.

    Returns:
        Formatted string like "P0:0 P1:1 P2:2 P3:0 Total:3".
    """
    return f"P0:{stats['P0']} P1:{stats['P1']} P2:{stats['P2']} P3:{stats['P3']} Total:{stats['Total']}"


# =============================================================================
# Main Entry (for testing)
# =============================================================================

if __name__ == "__main__":
    stats = get_task_stats()
    print(format_task_stats(stats))
    print()
    print("Pending tasks:")
    for task in list_pending_tasks():
        label = f"completion={task['completion_result_id'] or 'none'}" if task.get("schema_version") == "2.0" else task["status"]
        print(f"  {task['priority']}|{task['id']}|{task['title']}|{label}")
