"""Canonical Task schema 2.0 / Delivery API 1.0 JSON boundary.

Shape parity is checked against the Core-owned fixture corpus. Legacy metadata
validation remains in io.py; legacy lifecycle authority is never serialized here.
"""
from __future__ import annotations

import copy
import re
import math
from pathlib import Path
from typing import NoReturn

from .runtime_contract import PROFILES, is_nonempty_string

PHASES = ("planning", "implementing", "checking", "reviewing", "publishing", "delivered", "stopped")
GATES = ("planning", "check", "full_review", "readiness")
V2_FIELD_ORDER = ("schema_version", "artifact_origin", "id", "name", "lifecycle_generation", "source", "title", "description", "dev_type", "scope", "package", "priority", "createdAt", "base_branch", "branch", "worktree_path", "children", "parent", "relatedFiles", "notes", "meta", "accepted_scope", "deliveries", "completion_results", "closure_results")
V2_FIELDS = frozenset({
    "schema_version", "artifact_origin", "id", "name", "lifecycle_generation", "source", "title",
    "description", "dev_type", "scope", "package", "priority", "createdAt",
    "branch", "base_branch", "worktree_path", "children", "parent", "relatedFiles",
    "notes", "meta", "accepted_scope", "deliveries", "completion_results", "closure_results",
})


class DeliveryError(ValueError):
    """Stable public error code and a concrete diagnostic."""
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(f"{code}: {message}")


def fail(code: str, message: str) -> NoReturn:
    raise DeliveryError(code, message)


def object_fields(value: object, fields: tuple[str, ...] | list[str], optional: tuple[str, ...] = ()) -> dict:
    if not isinstance(value, dict):
        fail("invalid_record", "expected a JSON object")
    assert isinstance(value, dict)
    for field in fields:
        if field not in value:
            fail("invalid_record", f"missing {field}")
    for field in value:
        if field not in fields and field not in optional:
            fail("invalid_record", f"unsupported {field}")
    return value


def nonempty(value: object) -> None:
    if not is_nonempty_string(value):
        fail("invalid_record", "expected a nonempty string")


def integer(value: object) -> None:
    if (not isinstance(value, (int, float)) or isinstance(value, bool)
            or value < 0 or value > 9007199254740991 or not math.isfinite(value) or int(value) != value):
        fail("invalid_record", "expected a non-negative safe integer")


def strings(value: object) -> None:
    if not isinstance(value, list):
        fail("invalid_record", "expected an array")
    assert isinstance(value, list)
    for item in value:
        nonempty(item)


def member(value: object, values: tuple | list) -> None:
    if not isinstance(value, str) or value not in values:
        fail("invalid_record", f"expected one of {','.join(values)}")


def delivery_uuid(value: object) -> None:
    nonempty(value)
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", value):
        fail("invalid_record", "delivery_id must be a canonical UUID")


def relative_path(value: object) -> None:
    nonempty(value)
    assert isinstance(value, str)
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        fail("invalid_locator", value)
    if (value.startswith("/") or "\\" in value or "\0" in value or re.match(r"[A-Za-z]:", value)
            or any(part in ("", ".", "..") for part in value.split("/"))):
        fail("invalid_locator", value)


def task_artifact_root(value: object) -> None:
    relative_path(value)
    assert isinstance(value, str)
    if value == ".trellis/tasks/archive" or not re.fullmatch(r"\.trellis/tasks/(?:archive/[0-9]{4}-(?:0[1-9]|1[0-2])/)?[^/]+", value):
        fail("invalid_locator", "artifact_origin must be a Task root")


def authority(value: object) -> None:
    bag = object_fields(value, ("locator", "revision"))
    nonempty(bag["locator"])
    nonempty(bag["revision"])
    if not re.match(r"[a-z][a-z0-9+.-]*://", bag["locator"], re.I):
        relative_path(bag["locator"])


def slice_scope(value: object) -> None:
    bag = object_fields(value, ("authority", "anchors"))
    authority(bag["authority"])
    strings(bag["anchors"])
    if not bag["anchors"]:
        fail("invalid_record", "scope anchors required")


def candidate(value: object) -> None:
    bag = object_fields(value, ("kind", "content_ref", "paths", "head_ref", "base_ref"))
    member(bag["kind"], ("git", "git_free"))
    nonempty(bag["content_ref"])
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", bag["content_ref"]):
        fail("invalid_record", "candidate content_ref must be sha256")
    strings(bag["paths"])
    if not bag["paths"] or len(set(bag["paths"])) != len(bag["paths"]):
        fail("invalid_record", "candidate paths must be nonempty and unique")
    for item in bag["paths"]:
        relative_path(item)
    for field in ("head_ref", "base_ref"):
        if bag[field] is not None:
            nonempty(bag[field])
    if bag["kind"] == "git_free" and (bag["head_ref"] is not None or bag["base_ref"] is not None):
        fail("invalid_record", "git_free candidate cannot contain Git refs")


def result_identity(bag: dict) -> None:
    nonempty(bag["result_id"])
    nonempty(bag["owner_id"])
    if not isinstance(bag["evidence"], list) or not bag["evidence"]:
        fail("invalid_record", "result evidence required")
    for evidence in bag["evidence"]:
        authority(evidence)


def gate_result(value: object) -> None:
    bag = object_fields(value, ("result_id", "owner_role", "owner_id", "outcome", "scope_ref", "plan_ref", "candidate", "predecessor_result_id", "obligations", "evidence"))
    result_identity(bag)
    member(bag["owner_role"], GATES)
    slice_scope(bag["scope_ref"])
    authority(bag["plan_ref"])
    member(bag["outcome"], ("accepted" if bag["owner_role"] == "planning" else "ready" if bag["owner_role"] == "readiness" else "passed",))
    if bag["owner_role"] == "planning":
        if bag["candidate"] is not None or bag["predecessor_result_id"] is not None:
            fail("invalid_record", "planning has no candidate or predecessor")
    else:
        candidate(bag["candidate"])
        nonempty(bag["predecessor_result_id"])
    if not isinstance(bag["obligations"], list):
        fail("invalid_record", "obligations must be an array")
    for item in bag["obligations"]:
        authority(item)


def pr_fields(bag: dict) -> None:
    nonempty(bag["repo_ref"])
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", bag["repo_ref"]):
        fail("invalid_record", "invalid repo_ref")
    integer(bag["pr_number"])
    if not bag["pr_number"]:
        fail("invalid_record", "PR number must be positive")
    nonempty(bag["reviewed_head"])
    nonempty(bag["target_ref"])


def publication_fact(value: object) -> None:
    bag = object_fields(value, ("result_id", "owner_id", "evidence", "profile", "candidate", "repo_ref", "pr_number", "reviewed_head", "target_ref", "publication_ref"))
    result_identity(bag)
    member(bag["profile"], ("pull_request",))
    candidate(bag["candidate"])
    pr_fields(bag)
    authority(bag["publication_ref"])
    if bag["candidate"]["kind"] != "git" or bag["candidate"]["head_ref"] != bag["reviewed_head"]:
        fail("invalid_record", "publication reviewed head must match Git candidate")


def delivery_fact(value: object) -> None:
    if not isinstance(value, dict):
        fail("invalid_record", "delivery result must be an object")
    assert isinstance(value, dict)
    member(value.get("profile"), PROFILES)
    extra = ("artifact",) if value["profile"] == "manual" else ("commit",) if value["profile"] == "local_commit" else ("repo_ref", "pr_number", "reviewed_head", "merge_commit", "target_ref")
    bag = object_fields(value, ("result_id", "owner_id", "evidence", "profile", "candidate", *extra))
    result_identity(bag)
    candidate(bag["candidate"])
    if bag["profile"] == "manual":
        authority(bag["artifact"])
    elif bag["profile"] == "local_commit":
        nonempty(bag["commit"])
        if not re.fullmatch(r"[a-f0-9]{40}(?:[a-f0-9]{24})?", bag["commit"]):
            fail("invalid_record", "local commit must be a full immutable SHA")
        if bag["candidate"]["kind"] != "git" or bag["candidate"]["head_ref"] != bag["commit"]:
            fail("invalid_record", "local commit must match candidate head")
    else:
        pr_fields(bag)
        nonempty(bag["merge_commit"])
        if bag["candidate"]["kind"] != "git" or bag["candidate"]["head_ref"] != bag["reviewed_head"]:
            fail("invalid_record", "reviewed head must match candidate")


def stop_result(value: object) -> None:
    bag = object_fields(value, ("result_id", "owner_id", "evidence", "reason", "scope_decision"))
    result_identity(bag)
    authority(bag["reason"])
    authority(bag["scope_decision"])


def delivery_record(value: object) -> dict:
    bag = object_fields(value, ("id", "lifecycle_generation", "scope_ref", "planning_root", "profile", "phase", "plan_ref", "candidate", "results", "publication_result", "delivery_result", "stop_result"))
    delivery_uuid(bag["id"])
    integer(bag["lifecycle_generation"])
    slice_scope(bag["scope_ref"])
    member(bag["profile"], PROFILES)
    member(bag["phase"], PHASES)
    if bag["planning_root"] != f"deliveries/{bag['id']}":
        fail("invalid_locator", "planning_root must belong to Delivery UUID")
    if bag["plan_ref"] is not None:
        authority(bag["plan_ref"])
    if bag["candidate"] is not None:
        candidate(bag["candidate"])
    results = object_fields(bag["results"], GATES)
    for role, result in results.items():
        if result is not None:
            gate_result(result)
            if result["owner_role"] != role:
                fail("invalid_record", "gate slot role mismatch")
    if bag["publication_result"] is not None:
        publication_fact(bag["publication_result"])
        if bag["profile"] != "pull_request":
            fail("invalid_record", "publication requires PR profile")
    if bag["delivery_result"] is not None:
        delivery_fact(bag["delivery_result"])
        if bag["delivery_result"]["profile"] != bag["profile"]:
            fail("invalid_record", "delivery profile mismatch")
    if bag["stop_result"] is not None:
        stop_result(bag["stop_result"])
    if ((bag["phase"] == "delivered") != (bag["delivery_result"] is not None)
            or (bag["phase"] == "stopped") != (bag["stop_result"] is not None)):
        fail("invalid_record", "terminal phase must match actual result")
    if bag["phase"] in ("implementing", "checking", "reviewing", "publishing") and results["planning"] is None:
        fail("invalid_record", "execution requires recorded Planning")
    if bag["phase"] in ("checking", "reviewing", "publishing") and bag["candidate"] is None:
        fail("invalid_record", "formal execution requires a candidate")
    if bag["phase"] in ("reviewing", "publishing") and results["check"] is None:
        fail("invalid_record", "Review requires recorded Check")
    if bag["phase"] == "publishing" and (results["full_review"] is None or results["readiness"] is None):
        fail("invalid_record", "publishing requires full Review and readiness")
    return bag


def parse_task_v2(value: object) -> dict:
    if not isinstance(value, dict):
        fail("invalid_record", "task must be an object")
    assert isinstance(value, dict)
    if value.get("schema_version") != "2.0":
        fail("unsupported_task_schema", str(value.get("schema_version")))
    from .io import _has_invalid_task_schema, _has_unsupported_task_fields
    metadata = {k: v for k, v in value.items() if k not in ("schema_version", "artifact_origin", "accepted_scope", "deliveries", "completion_results", "closure_results")}
    for key in ("status", "commit", "pr_url", "completedAt"):
        if key in metadata:
            fail("invalid_record", f"Task v2 does not support {key}")
    metadata.update(status="planning", commit=None, pr_url=None, completedAt=None)
    if _has_unsupported_task_fields(Path("task.json"), metadata) or _has_invalid_task_schema(Path("task.json"), metadata):
        fail("invalid_record", "invalid Task metadata")
    object_fields(value, tuple(V2_FIELDS - {"branch", "artifact_origin"}), ("branch", "artifact_origin"))
    if "artifact_origin" in value:
        task_artifact_root(value["artifact_origin"])
    if value["accepted_scope"] is not None:
        authority(value["accepted_scope"])
    for field in ("deliveries", "completion_results", "closure_results"):
        if not isinstance(value[field], list):
            fail("invalid_record", "domain collections must be arrays")
    deliveries = [delivery_record(d) for d in value["deliveries"]]
    if len({d["id"] for d in deliveries}) != len(deliveries):
        fail("duplicate_delivery_id", "Delivery ids must be unique")
    if any(d["lifecycle_generation"] > value["lifecycle_generation"] for d in deliveries):
        fail("invalid_record", "future Delivery generation")
    seen: set[str] = set()
    def reserve(result_id: str) -> None:
        if result_id in seen:
            fail("result_identity_conflict", result_id)
        seen.add(result_id)
    for d in deliveries:
        for result in (*d["results"].values(), d["publication_result"], d["delivery_result"], d["stop_result"]):
            if result is not None:
                reserve(result["result_id"])
    for result in value["completion_results"]:
        bag = object_fields(result, ("result_id", "owner_id", "evidence", "lifecycle_generation", "accepted_scope", "delivery_result_ids", "outcome"))
        result_identity(bag)
        integer(bag["lifecycle_generation"])
        authority(bag["accepted_scope"])
        strings(bag["delivery_result_ids"])
        member(bag["outcome"], ("completed",))
        reserve(bag["result_id"])
        if bag["lifecycle_generation"] > value["lifecycle_generation"]:
            fail("invalid_record", "future completion generation")
        if any(not any(d["delivery_result"] and d["delivery_result"]["result_id"] == result_id for d in deliveries) for result_id in bag["delivery_result_ids"]):
            fail("invalid_record", "unknown delivery result in completion")
    for result in value["closure_results"]:
        bag = object_fields(result, ("result_id", "owner_id", "evidence", "lifecycle_generation", "completion_result_id", "disposition", "source_result"))
        result_identity(bag)
        integer(bag["lifecycle_generation"])
        nonempty(bag["completion_result_id"])
        member(bag["disposition"], ("no_mutation", "source_closed"))
        reserve(bag["result_id"])
        if not any(r["result_id"] == bag["completion_result_id"] and r["lifecycle_generation"] == bag["lifecycle_generation"] for r in value["completion_results"]):
            fail("invalid_record", "closure requires exact completion")
        if bag["disposition"] == "source_closed":
            authority(bag["source_result"])
        elif bag["source_result"] is not None:
            fail("invalid_record", "no_mutation has no source result")
    for key in ("artifact_origin", "status", "phase", "candidate", "results", "accepted_scope", "deliveries", "completion_results", "closure_results"):
        if key in value["meta"]:
            fail("invalid_record", f"meta cannot hold authoritative {key}")
    return {key: copy.deepcopy(value[key]) for key in V2_FIELD_ORDER if key in value}
