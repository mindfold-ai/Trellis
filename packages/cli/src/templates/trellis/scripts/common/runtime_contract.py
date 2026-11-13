"""Read the active workflow's closed Delivery API owner declaration."""

from __future__ import annotations

import json
from pathlib import Path


OWNER_ROLES = (
    "task_scope", "creation", "planning", "implementation", "check",
    "full_review", "readiness", "publication", "delivery", "completion", "closure",
)
PROFILES = ("local_commit", "manual", "pull_request")
_JS_TRIM_CHARS = ("\t\n\v\f\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005"
                  "\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff")


def is_nonempty_string(value: object) -> bool:
    """Match the Core JSON boundary's ECMAScript trim, not Python-only NEL."""
    return isinstance(value, str) and bool(value.strip(_JS_TRIM_CHARS))


class RuntimeContractError(ValueError):
    """An active workflow cannot own Delivery API 1.0 operations."""

    def __init__(self, message: str):
        self.code = message.split(":", 1)[0]
        super().__init__(message)


def validate_runtime_contract(value: object) -> dict:
    """Validate one declaration; no default/native owner substitution."""
    if not isinstance(value, dict) or set(value) != {
        "delivery_api", "task_schema", "profiles", "owners",
    }:
        raise RuntimeContractError("invalid_record: workflow fields")
    if value["delivery_api"] != "1.0" or value["task_schema"] != "2.0":
        raise RuntimeContractError("unsupported_runtime_contract")
    profiles = value["profiles"]
    if not isinstance(profiles, list) or not profiles:
        raise RuntimeContractError("invalid_runtime_contract: profiles required")
    if any(not isinstance(p, str) or p not in PROFILES for p in profiles):
        raise RuntimeContractError("invalid_record: unsupported profile")
    if len(set(profiles)) != len(profiles):
        raise RuntimeContractError("invalid_runtime_contract: duplicate profiles")
    owners = value["owners"]
    if (not isinstance(owners, dict) or set(owners) != set(OWNER_ROLES)
            or any(not is_nonempty_string(owner)
                   for owner in owners.values())):
        raise RuntimeContractError("invalid_record: workflow owners")
    return value


def read_runtime_contract(workflow: Path) -> dict:
    """Extract exactly one JSON block from the actual workflow, never .new."""
    try:
        lines = workflow.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise RuntimeContractError(f"workflow_read_error: {workflow}: {exc}") from exc
    opened = [i for i, line in enumerate(lines)
              if line.strip() == "[trellis-runtime-contract]"]
    closed = [i for i, line in enumerate(lines)
              if line.strip() == "[/trellis-runtime-contract]"]
    if not opened and not closed:
        if any(line.strip().startswith(("[trellis-runtime-contract", "[/trellis-runtime-contract")) for line in lines):
            raise RuntimeContractError("invalid_runtime_contract_block")
        raise RuntimeContractError("missing_runtime_contract")
    if len(opened) != 1 or len(closed) != 1 or opened[0] >= closed[0]:
        raise RuntimeContractError("invalid_runtime_contract_block")
    body = "\n".join(lines[opened[0] + 1:closed[0]])
    try:
        value = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeContractError("invalid_runtime_contract_json") from exc
    return validate_runtime_contract(value)


def require_task_runtime(workspace: Path, task_data: dict) -> None:
    """Selected-record execution boundary; retained legacy inventory is unaffected."""
    from .path_boundary import require_project_path
    workflow = workspace / ".trellis" / "workflow.md"
    require_project_path(workflow, workspace)
    is_v2 = task_data.get("schema_version") == "2.0"
    if not workflow.exists():
        if is_v2:
            raise RuntimeContractError("missing_runtime_contract")
        return
    try:
        read_runtime_contract(workflow)
    except RuntimeContractError as exc:
        if exc.code == "missing_runtime_contract" and not is_v2:
            return
        raise
    if not is_v2:
        raise RuntimeContractError("unsupported_task_schema: maintenance_required: schema-2 workflow requires explicit migration before execution; use a complete matching new CLI/Core candidate: trellis maintain inspect-task --target <checkout> --task-id <id> --generation <generation> --task-ref <ref> --json; conversion or historical closeout does not require normal continuation")
