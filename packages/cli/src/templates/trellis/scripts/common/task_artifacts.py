"""Stable Task-owned content references and explicit directory relocation.

The one immutable origin is a locator, not another result/history store.
Only SHA authorities map through it; Git object paths and candidates never do.
"""
from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .delivery_schema import fail, parse_task_v2, task_artifact_root
from .io import read_json_checked, write_text_atomic
from .path_boundary import require_project_path


@dataclass(frozen=True)
class TaskArtifactContext:
    task_id: str
    task_root: str
    artifact_origin: str | None


def artifact_context(task_dir: Path, root: Path, record: dict) -> TaskArtifactContext:
    task_root = task_dir.relative_to(root).as_posix()
    task_artifact_root(task_root)
    require_project_path(task_dir / "task.json", root)
    return TaskArtifactContext(record["id"], task_root, record.get("artifact_origin"))


def authority_locator(ref: dict, context: TaskArtifactContext | None) -> str:
    """Resolve exact origin descendants only, without candidate/path guessing."""
    locator = ref["locator"]
    if (context is not None and context.artifact_origin is not None
            and re.fullmatch(r"sha256:[a-f0-9]{64}", ref["revision"])
            and locator.startswith(context.artifact_origin + "/")):
        return context.task_root + locator[len(context.artifact_origin):]
    return locator


def canonical_operation(op: dict, context: TaskArtifactContext) -> dict:
    """Normalize only the operation's typed SHA AuthorityRef fields."""
    value = copy.deepcopy(op)
    def normalize(ref: dict | None) -> None:
        if (ref is not None and context.artifact_origin is not None
                and re.fullmatch(r"sha256:[a-f0-9]{64}", ref["revision"])
                and ref["locator"].startswith(context.task_root + "/")):
            ref["locator"] = context.artifact_origin + ref["locator"][len(context.task_root):]
    operation = value["operation"]
    if operation in ("accept_scope", "reopen_task"):
        normalize(value["authority"])
    elif operation == "create_delivery":
        normalize(value["scope_ref"]["authority"])
    elif operation == "rework":
        normalize(value["reason"])
        if "scope_ref" in value:
            normalize(value["scope_ref"]["authority"])
    if "result" in value:
        result = value["result"]
        for ref in result["evidence"]:
            normalize(ref)
        if operation == "record_gate":
            normalize(result["scope_ref"]["authority"])
            normalize(result["plan_ref"])
            for ref in result["obligations"]:
                normalize(ref)
        elif operation == "record_publication":
            normalize(result["publication_ref"])
        elif operation == "record_delivery" and result["profile"] == "manual":
            normalize(result["artifact"])
        elif operation == "stop":
            normalize(result["reason"])
            normalize(result["scope_decision"])
        elif operation == "complete_task":
            normalize(result["accepted_scope"])
        elif operation == "close_task":
            normalize(result["source_result"])
    return value


def manifest_relocations(task_dir: Path, root: Path, new_root: str) -> list[tuple[Path, list[int], str]]:
    """Move live context file locators, retaining reason prose and permissions."""
    from .delivery_store import _checked_path
    old_root = task_dir.relative_to(root).as_posix()
    paths = [task_dir / name for name in ("implement.jsonl", "check.jsonl")]
    data, reason = read_json_checked(task_dir / "task.json")
    if data is None:
        fail("invalid_record", str(reason))
    if data.get("schema_version") == "2.0":
        paths.extend(task_dir / d["planning_root"] / name for d in data["deliveries"] for name in ("implement.jsonl", "check.jsonl"))
    changes = []
    for file in paths:
        _checked_path(file, root)
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines(keepends=True)
        changed = []
        for index, line in enumerate(lines):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                fail("invalid_manifest", f"{file}:{index + 1}")
            if isinstance(entry, dict) and isinstance(entry.get("file"), str) and entry["file"].startswith(old_root + "/"):
                entry["file"] = new_root + entry["file"][len(old_root):]
                lines[index] = json.dumps(entry, ensure_ascii=False) + ("\n" if line.endswith("\n") else "")
                changed.append(index + 1)
        if changed:
            changes.append((file, changed, "".join(lines)))
    return changes


def relocate_task_directory(task_dir: Path, destination: Path, root: Path, *, record: dict | None = None) -> dict:
    """Explicit move preserving Task identity/history and the original artifact root.

    An optional record is a preverified closed-operation output (archived reopen).
    The caller owns lifecycle validation; this helper owns location and manifests.
    """
    from .delivery_store import _checked_path
    if destination.relative_to(root).parts[:3] == (".trellis", "tasks", "archive") and task_dir.is_symlink():
        fail("invalid_locator", "cannot archive a Task-leaf symlink")
    _checked_path(task_dir / "task.json", root)
    _checked_path(destination, root)
    task_artifact_root(destination.relative_to(root).as_posix())
    if destination.exists():
        fail("task_destination_occupied", str(destination))
    previous = (task_dir / "task.json").read_bytes()
    data, reason = read_json_checked(task_dir / "task.json")
    if data is None:
        fail("invalid_record", str(reason))
    output = copy.deepcopy(data if record is None else record)
    if output.get("schema_version") == "2.0":
        output["artifact_origin"] = data.get("artifact_origin", task_dir.relative_to(root).as_posix())
        output = parse_task_v2(output)
    changes = manifest_relocations(task_dir, root, destination.relative_to(root).as_posix())
    originals = [(file, file.read_text(encoding="utf-8"), file.stat().st_mode & 0o777) for file, _, _ in changes]
    mode = (task_dir / "task.json").stat().st_mode & 0o777
    if (task_dir / "task.json").read_bytes() != previous:
        fail("stale_preimage", "Task changed before relocation")
    try:
        for file, _, text in changes:
            if not write_text_atomic(file, text, mode=file.stat().st_mode & 0o777):
                fail("write_failed", str(file))
        if not write_text_atomic(task_dir / "task.json", json.dumps(output, ensure_ascii=False, indent=2) + "\n", mode=mode):
            fail("write_failed", str(task_dir / "task.json"))
        task_dir.rename(destination)
    except (OSError, ValueError):
        for file, text, original_mode in originals:
            if not write_text_atomic(file, text, mode=original_mode):
                fail("relocation_restore_failed", str(file))
        if not write_text_atomic(task_dir / "task.json", previous.decode("utf-8"), mode=mode):
            fail("relocation_restore_failed", str(task_dir / "task.json"))
        raise
    return output
