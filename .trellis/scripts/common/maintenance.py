"""Non-authoritative diagnostics for positively known predecessor state.

This module never accepts a predecessor for current execution and never writes.
Use the public complete matching CLI/Core candidate for actual maintenance.
"""
from __future__ import annotations

import json
import shlex
from pathlib import Path


def is_known_legacy_task(value: object) -> bool:
    """Mirror Core isKnownLegacyTaskRecord solely for actionable diagnosis."""
    from .io import (TASK_RECORD_FIELDS, TASK_ID_PATTERN,
                     TASK_NULLABLE_STRING_FIELDS, TASK_STRING_ARRAY_FIELDS)
    if not isinstance(value, dict):
        return False
    allowed = (TASK_RECORD_FIELDS - {"source", "lifecycle_generation"}) | {
        "creator", "assignee", "subtasks",
    }
    if value.keys() - allowed:
        return False
    if any(not isinstance(value.get(field), str)
           for field in ("id", "name", "title", "status", "creator", "assignee")):
        return False
    if not TASK_ID_PATTERN.fullmatch(value["id"]):
        return False
    if any(field in value and not isinstance(value[field], str)
           for field in ("description", "priority", "createdAt", "notes")):
        return False
    if any(field in value and value[field] is not None
           and not isinstance(value[field], str) for field in TASK_NULLABLE_STRING_FIELDS):
        return False
    if any(field in value and (not isinstance(value[field], list)
           or any(not isinstance(item, str) for item in value[field]))
           for field in TASK_STRING_ARRAY_FIELDS | {"subtasks"}):
        return False
    return "meta" not in value or isinstance(value["meta"], dict)


def task_maintenance_diagnostic(task_path: Path) -> str | None:
    """Return an inspect entry only for supported raw predecessors, not authority."""
    from .io import read_json_checked
    try:
        value = json.loads((task_path / "task.json").read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        return None
    checked, _ = read_json_checked(task_path / "task.json")
    legacy = is_known_legacy_task(value)
    if not legacy and (checked is None or checked.get("schema_version") == "2.0"):
        return None
    workspace = task_path.parent.parent.parent
    try:
        ref = task_path.relative_to(workspace).as_posix()
    except ValueError:
        return None
    generation = 0 if legacy else value["lifecycle_generation"]
    command = ("trellis maintain inspect-task --target " + shlex.quote(str(workspace))
               + " --task-id " + shlex.quote(value["id"])
               + " --generation " + str(generation)
               + " --task-ref " + shlex.quote(ref) + " --json")
    return ("maintenance_required: selected predecessor cannot enter current Task/Delivery "
            "continuation; use a complete matching new CLI/Core candidate: " + command
            + "; conversion or historical closeout is independent of tools installation")


def is_unversioned_local_carrier(value: dict) -> bool:
    """The original 0.6 set_active_task output, not a current binding."""
    if set(value) == {"current_task"}:
        return True
    required = {"platform", "last_seen_at", "current_task", "current_run"}
    metadata = {"session_id", "sessionId", "sessionID", "conversation_id",
                "conversationId", "conversationID", "transcript_path",
                "transcriptPath", "transcript"}
    return (required <= value.keys() <= required | metadata
            and value["current_run"] is None
            and all(isinstance(value[key], str) and value[key]
                    for key in {"platform", "last_seen_at"} | (metadata & value.keys())))


def carrier_maintenance_diagnostic(value: object, carrier: Path, workspace: Path) -> str | None:
    """Positively identify old path carriers without selecting them for execution."""
    if not isinstance(value, dict):
        return None
    if is_unversioned_local_carrier(value):
        owner = workspace
    elif (set(value) == {"schema_version", "repository_common_dir", "task_workspace_root", "current_task"}
          and type(value.get("schema_version")) is int and value["schema_version"] == 1
          and isinstance(value.get("task_workspace_root"), str)
          and Path(value["task_workspace_root"]).is_absolute()
          and isinstance(value.get("repository_common_dir"), str)
          and Path(value["repository_common_dir"]).is_absolute()):
        owner = Path(value["task_workspace_root"])
    else:
        return None
    ref = value.get("current_task")
    if not isinstance(ref, str) or not ref.startswith(".trellis/tasks/") or len(ref.split("/")) != 3:
        return None
    from .path_boundary import require_project_path
    selected = owner / ref
    require_project_path(selected / "task.json", owner)
    return task_maintenance_diagnostic(selected)
