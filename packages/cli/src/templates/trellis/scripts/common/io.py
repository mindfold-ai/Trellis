"""
File I/O utilities.

Provides read_json / write_json as the single source of truth for JSON file
operations, plus write_text_atomic for Markdown state files (task prose,
index.md) that carry durable session state.
"""

from __future__ import annotations

import json
import math
import os
import re
import tempfile
from pathlib import Path


JSON_READ_MISSING = "missing"
JSON_READ_INVALID = "invalid"
JSON_READ_UNREADABLE = "unreadable"
JSON_READ_NOT_OBJECT = "not-object"
JSON_READ_EMPTY = "empty"
JSON_READ_UNDECODABLE = "undecodable"
JSON_READ_UNSUPPORTED_FIELDS = "unsupported-fields"
JSON_READ_INVALID_TASK_SCHEMA = "invalid-task-schema"
JSON_READ_INVALID_TASK_ID = "invalid-task-id"

TASK_RECORD_FIELDS = frozenset({
    "id", "name", "lifecycle_generation", "source", "title", "description",
    "status", "dev_type", "scope", "package", "priority", "createdAt",
    "completedAt", "branch", "base_branch", "worktree_path", "commit",
    "pr_url", "children", "parent", "relatedFiles", "notes", "meta",
})
TASK_OPTIONAL_FIELDS = frozenset({"branch"})
TASK_REQUIRED_FIELDS = TASK_RECORD_FIELDS - TASK_OPTIONAL_FIELDS
TASK_STRING_FIELDS = frozenset({
    "id", "name", "title", "description", "status", "priority", "createdAt", "notes",
})
TASK_NULLABLE_STRING_FIELDS = frozenset({
    "dev_type", "scope", "package", "completedAt", "base_branch",
    "worktree_path", "commit", "pr_url", "parent", "branch",
})
TASK_STRING_ARRAY_FIELDS = frozenset({"children", "relatedFiles"})
TASK_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\Z")
TASK_REPO_REF_PATTERN = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
TASK_SOURCE_DISPOSITIONS = frozenset({
    "exact_source", "reference_only", "follow_up", "parent",
})


def read_task_id_reservation(path: Path) -> tuple[str | None, str | None]:
    """Read only the immutable identity needed to reserve a task locator.

    Non-identity fields are deliberately not lifecycle or migration authority.
    """
    data, reason = _read_json_object_checked(path)
    if data is None:
        return None, reason
    task_id = data.get("id")
    if not isinstance(task_id, str) or not TASK_ID_PATTERN.fullmatch(task_id):
        return None, JSON_READ_INVALID_TASK_ID
    return task_id, None


def _has_unsupported_task_fields(path: Path, data: object) -> bool:
    return path.name == "task.json" and isinstance(data, dict) and bool(data.keys() - TASK_RECORD_FIELDS)


def _has_invalid_task_schema(path: Path, data: object) -> bool:
    if path.name != "task.json" or not isinstance(data, dict):
        return False
    if not TASK_REQUIRED_FIELDS <= data.keys():
        return True
    if any(not isinstance(data[field], str) for field in TASK_STRING_FIELDS):
        return True
    if not TASK_ID_PATTERN.fullmatch(data["id"]):
        return True
    if any(data[field] is not None and not isinstance(data[field], str)
           for field in TASK_NULLABLE_STRING_FIELDS if field in data):
        return True
    if any(not isinstance(data[field], list)
           or any(not isinstance(item, str) for item in data[field])
           for field in TASK_STRING_ARRAY_FIELDS):
        return True
    generation = data["lifecycle_generation"]
    if not _is_integer_number(generation) or generation < 0:
        return True
    source = data["source"]
    if not isinstance(source, dict):
        return True
    if source == {"kind": "no_issue"}:
        pass
    elif not (
        source.keys() == {"kind", "repo_ref", "number", "disposition"}
        and source["kind"] == "issue"
        and isinstance(source["repo_ref"], str)
        and TASK_REPO_REF_PATTERN.fullmatch(source["repo_ref"])
        and _is_integer_number(source["number"])
        and source["number"] > 0
        and isinstance(source["disposition"], str)
        and source["disposition"] in TASK_SOURCE_DISPOSITIONS
    ):
        return True
    return not _is_json_object(data["meta"])


def _is_integer_number(value: object) -> bool:
    return type(value) is int or (
        type(value) is float and math.isfinite(value) and value.is_integer()
    )


def _is_json_object(value: object) -> bool:
    return isinstance(value, dict) and all(
        isinstance(key, str) and _is_json_value(item)
        for key, item in value.items()
    )


def _is_json_value(value: object) -> bool:
    if value is None or isinstance(value, (str, bool, int)):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(_is_json_value(item) for item in value)
    return _is_json_object(value)


def read_json(path: Path) -> dict | None:
    """Read and parse a JSON file.

    Returns None if the file doesn't exist, is invalid JSON, or can't be read.
    Use this for optional reads only — a caller that is about to overwrite the
    file, or that must tell a parse error from a permissions error, wants
    read_json_checked instead.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if path.name == "task.json" and not isinstance(data, dict):
            return None
        return None if _has_unsupported_task_fields(path, data) or _has_invalid_task_schema(path, data) else data
    except (FileNotFoundError, json.JSONDecodeError, OSError, UnicodeDecodeError):
        # UnicodeDecodeError is not an OSError. Without it here a non-UTF-8
        # session file raises out of a tolerant read, so the hook path fails
        # instead of degrading to "no active task".
        return None


def read_json_checked(path: Path) -> tuple[dict | None, str | None]:
    """Read a JSON object, keeping the ways it can fail distinguishable.

    Returns ``(data, None)`` on success, or ``(None, reason)`` where reason is
    one of the ``JSON_READ_*`` constants. An empty object counts as a failure:
    a state file that parses to ``{}`` carries none of the fields callers read,
    and treating it as success would silently rebuild it from defaults.
    """
    data, reason = _read_json_object_checked(path)
    if data is None:
        return None, reason
    if _has_unsupported_task_fields(path, data):
        return None, JSON_READ_UNSUPPORTED_FIELDS
    if _has_invalid_task_schema(path, data):
        return None, JSON_READ_INVALID_TASK_SCHEMA
    return data, None


def _read_json_object_checked(path: Path) -> tuple[dict | None, str | None]:
    """Decode an object without assigning a consumer's schema to it."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None, JSON_READ_MISSING
    except UnicodeDecodeError:
        # Not an OSError, so it escaped both handlers and surfaced as a
        # traceback. The point of this reader is that every failure mode stays
        # nameable, and "not valid UTF-8" is a different repair from
        # "not valid JSON".
        return None, JSON_READ_UNDECODABLE
    except OSError:
        return None, JSON_READ_UNREADABLE

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None, JSON_READ_INVALID

    if not isinstance(data, dict):
        return None, JSON_READ_NOT_OBJECT
    if not data:
        return None, JSON_READ_EMPTY
    return data, None


def describe_json_read_failure(path: Path, reason: str | None) -> tuple[str, str]:
    """Return ``(what happened, what to do)`` for a read_json_checked reason."""
    if reason == JSON_READ_MISSING:
        return (f"{path}: file not found", "Pass an existing task directory, or create the task first.")
    if reason == JSON_READ_UNREADABLE:
        return (
            f"{path}: could not be read (permission denied or I/O error)",
            "Check the file and directory permissions, then retry.",
        )
    if reason == JSON_READ_INVALID:
        return (
            f"{path}: not valid JSON",
            f"Fix the syntax (e.g. `python3 -m json.tool {path}`), then retry.",
        )
    if reason == JSON_READ_NOT_OBJECT:
        return (
            f"{path}: top level is not a JSON object",
            "Restore the file to a JSON object ({ ... }), then retry.",
        )
    if reason == JSON_READ_EMPTY:
        return (
            f"{path}: contains an empty JSON object",
            "Restore the task fields (or recreate the task), then retry.",
        )
    if reason == JSON_READ_UNDECODABLE:
        return (
            f"{path}: not valid UTF-8 text",
            "Re-save the file as UTF-8 (or restore it from git), then retry.",
        )
    if reason == JSON_READ_UNSUPPORTED_FIELDS:
        return (
            f"{path}: contains unsupported task fields",
            "Use a task record with the current schema.",
        )
    if reason == JSON_READ_INVALID_TASK_SCHEMA:
        return (
            f"{path}: is not a current task record",
            "Use a task record matching the current schema.",
        )
    return (f"{path}: could not be loaded", "Inspect the file, then retry.")


def write_json(path: Path, data: dict) -> bool:
    """Write dict to JSON file with pretty formatting.

    The write is atomic: content goes to a temp file in the same directory
    and is then renamed over the target. A crash or Ctrl-C mid-write leaves
    the existing file intact rather than truncated, so a corrupted task.json
    can never make a task silently vanish from `task.py list`.

    Returns True on success, False on error.
    """
    if _has_unsupported_task_fields(path, data) or _has_invalid_task_schema(path, data):
        return False
    if path.name == "task.json" and path.exists() and read_json_checked(path)[1] is not None:
        return False
    return write_text_atomic(path, json.dumps(data, indent=2, ensure_ascii=False))


def write_text_atomic(path: Path, text: str) -> bool:
    """Write text to a file atomically (temp in same dir, then replace).

    The same never-truncate-in-place guarantee as :func:`write_json`, for the
    Markdown state files that hold durable task state (task prose,
    index.md). A crash or Ctrl-C mid-write leaves the previous content intact
    instead of a half-written record that no retry can classify.

    Returns True on success, False on error.
    """
    try:
        fd, tmp = tempfile.mkstemp(
            dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp"
        )
    except OSError:
        return False

    try:
        try:
            f = os.fdopen(fd, "w", encoding="utf-8")
        except OSError:
            # fdopen never took ownership of fd; close it ourselves.
            os.close(fd)
            raise
        with f:
            f.write(text)
        os.replace(tmp, path)
        return True
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        return False
    except BaseException:
        # Ctrl-C mid-write: drop the temp file, then let the interrupt through.
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
