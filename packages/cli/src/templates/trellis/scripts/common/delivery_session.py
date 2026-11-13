"""Explicit schema-3 Delivery selection on the existing session resolver."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .active_task import resolve_active_task, resolve_context_key, set_active_task
from .delivery_operations import get_gate_applicability
from .delivery_schema import DeliveryError, delivery_uuid, fail, parse_task_v2
from .io import read_json_checked
from .path_boundary import require_project_path
from .runtime_contract import RuntimeContractError, read_runtime_contract
from .session_storage import (
    SessionRecord, read_record, records, repository_facts,
    session_path, write_record,
)


def get_current_delivery(
    repo_root: Path, platform_input: dict[str, Any] | None = None,
    platform: str | None = None, *, allow_environment_context: bool = True,
) -> dict:
    """Read exact current selection; no task/Delivery inference or repair."""
    try:
        active = resolve_active_task(
            repo_root, platform_input, platform,
            allow_environment_context=allow_environment_context,
        )
        if active.error:
            pending = (active.error.startswith("maintenance_required:")
                       or "; maintenance_required:" in active.error)
            return {"kind": "error", "code": "maintenance_required" if pending else "stale_binding",
                    "message": active.error}
        if active.resolved_task_path is None or active.task_workspace_root is None:
            return {"kind": "no_current_task"}
        data, reason = read_json_checked(active.resolved_task_path / "task.json")
        if data is None:
            fail("invalid_record", str(reason))
        record = parse_task_v2(data)
        declaration = read_runtime_contract(active.task_workspace_root / ".trellis" / "workflow.md")
        facts = repository_facts(repo_root)
        if not active.context_key:
            fail("stale_binding", "missing exact context key")
        binding = read_record(session_path(repo_root, active.context_key, facts), repo_root, facts)
        if binding.data["schema_version"] != 3:
            fail("unsupported_binding_schema", "Task v2 requires explicit schema-3 task binding")
        key = {"task_id": record["id"], "lifecycle_generation": record["lifecycle_generation"]}
        delivery_id = binding.data["delivery_id"]
        if delivery_id is None:
            return {"kind": "no_current_delivery", "key": key}
        d = next((row for row in record["deliveries"] if row["id"] == delivery_id and row["lifecycle_generation"] == record["lifecycle_generation"]), None)
        if d is None:
            fail("stale_binding", "selected Delivery does not belong to current generation")
        if d["profile"] not in declaration["profiles"]:
            fail("unsupported_delivery_profile", d["profile"])
        selected_key = {**key, "delivery_id": delivery_id}
        return {"kind": "terminal_delivery" if d["phase"] in ("delivered", "stopped") else "current", "key": selected_key, "delivery": d, "gate_applicability": get_gate_applicability(record, selected_key)}
    except (DeliveryError, RuntimeContractError) as exc:
        return {"kind": "error", "code": exc.code, "message": str(exc)}
    except (ValueError, OSError, RuntimeError) as exc:
        return {"kind": "error", "code": "stale_binding", "message": str(exc)}


def select_delivery(task_dir: Path, workspace: Path, invocation_root: Path, delivery_id: str) -> dict:
    """Bind one explicit eligible identity without changing lifecycle phase."""
    delivery_uuid(delivery_id)
    data, reason = read_json_checked(task_dir / "task.json")
    if data is None:
        fail("invalid_record", str(reason))
    record = parse_task_v2(data)
    declaration = read_runtime_contract(workspace / ".trellis" / "workflow.md")
    d = next((row for row in record["deliveries"] if row["id"] == delivery_id and row["lifecycle_generation"] == record["lifecycle_generation"]), None)
    if d is None:
        fail("delivery_not_found", delivery_id)
    assert d is not None
    if d["phase"] in ("delivered", "stopped"):
        fail("terminal_delivery", delivery_id)
    if d["profile"] not in declaration["profiles"]:
        fail("unsupported_delivery_profile", d["profile"])
    active = set_active_task(str(task_dir), invocation_root)
    if active is None or active.context_key is None:
        fail("context_required", "set TRELLIS_CONTEXT_ID or use a verified session bridge")
    facts = repository_facts(invocation_root)
    payload = {"schema_version": 3, "task_id": record["id"], "lifecycle_generation": record["lifecycle_generation"], "delivery_id": delivery_id}
    write_record(session_path(invocation_root, active.context_key, facts), payload, invocation_root)
    return get_current_delivery(invocation_root)


def plan_release_delivery(repo_root: Path, *, task_id: str | None = None, generation: int | None = None, delivery_id: str | None = None, new_generation: int | None = None) -> list[tuple[SessionRecord, dict]]:
    """Read and validate the exact release set before any aggregate write.

    Explicit owner terminal operations can release all matching sessions. A
    manual release affects only the current exact context and never another
    session inferred from inventory.
    """
    facts = repository_facts(repo_root)
    key = None if task_id is not None else resolve_context_key()
    if task_id is None and key is None:
        fail("context_required", "no exact session for release")
    selected = records(facts, key=key, ignore_unsupported=True)
    plan = []
    for binding in selected:
        if binding.data["schema_version"] != 3:
            continue
        if task_id is not None and (binding.task_id != task_id or binding.lifecycle_generation != generation):
            continue
        if delivery_id is not None and binding.data["delivery_id"] != delivery_id:
            continue
        payload = {**binding.data, "delivery_id": None}
        if new_generation is not None:
            payload["lifecycle_generation"] = new_generation
        if payload != binding.data:
            plan.append((binding, payload))
    return plan


def apply_release_plan(plan: list[tuple[SessionRecord, dict]]) -> int:
    """Apply validated releases; exact retries recover ordinary write failures."""
    count = 0
    for binding, payload in plan:
        current = read_record(binding.path, binding.root, repository_facts(binding.root))
        if current.data == payload:
            continue
        if current.data != binding.data:
            fail("stale_binding", f"session changed after release preflight: {binding.path}")
        write_record(binding.path, payload, binding.root)
        count += 1
    return count


def release_delivery(repo_root: Path, *, task_id: str | None = None, generation: int | None = None, delivery_id: str | None = None, new_generation: int | None = None) -> int:
    """Release matching selections without inferring another execution owner."""
    return apply_release_plan(plan_release_delivery(repo_root, task_id=task_id, generation=generation, delivery_id=delivery_id, new_generation=new_generation))


def planning_directory(task_dir: Path, repo_root: Path, delivery_id: str | None = None) -> Path:
    """Resolve per-Delivery artifacts; only legacy Tasks use root artifacts."""
    data, reason = read_json_checked(task_dir / "task.json")
    if data is None:
        fail("invalid_record", str(reason))
    assert data is not None
    if data.get("schema_version") != "2.0":
        return task_dir
    record = parse_task_v2(data)
    if delivery_id is None:
        current = get_current_delivery(repo_root)
        if current["kind"] == "error":
            fail(current["code"], current["message"])
        if current["kind"] not in ("current", "terminal_delivery") or current["key"]["task_id"] != record["id"] or current["key"]["lifecycle_generation"] != record["lifecycle_generation"]:
            fail("delivery_selection_required", "pass an exact Delivery id or select this Task's Delivery")
        delivery_id = current["key"]["delivery_id"]
    delivery_uuid(delivery_id)
    d = next((row for row in record["deliveries"] if row["id"] == delivery_id and row["lifecycle_generation"] == record["lifecycle_generation"]), None)
    if d is None:
        fail("delivery_not_found", str(delivery_id))
    directory = task_dir / d["planning_root"]
    require_project_path(directory, repo_root)
    return directory
