"""Closed deterministic Delivery operations; no semantic judgment or remote writes."""
from __future__ import annotations

import copy
import re

from .delivery_schema import (
    DeliveryError, GATES, PHASES, authority, candidate, delivery_fact, delivery_uuid, fail,
    gate_result, integer, member, nonempty, object_fields, parse_task_v2,
    publication_fact, result_identity, slice_scope, stop_result, strings,
)
from .runtime_contract import OWNER_ROLES, PROFILES, validate_runtime_contract

OP_FIELDS: dict[str, tuple[str, ...]] = {
    "accept_scope": ("authority",), "create_delivery": ("scope_ref", "profile"),
    "begin_check": ("expected_phase", "candidate"), "record_gate": ("expected_phase", "result"),
    "rework": ("expected_phase", "target_role", "reason", "affected_results"),
    "record_publication": ("expected_phase", "result"), "record_delivery": ("expected_phase", "result"),
    "stop": ("expected_phase", "result"), "complete_task": ("result",),
    "close_task": ("result",), "reopen_task": ("authority",),
}
DELIVERY_OPS = ("create_delivery", "begin_check", "record_gate", "rework", "record_publication", "record_delivery", "stop")
STAGE_OWNERS = {
    "planning": ("planning",), "implementing": ("implementation",),
    "checking": ("check",), "reviewing": ("full_review", "readiness"),
    "publishing": ("publication", "delivery"), "delivered": (), "stopped": (),
}
PREDECESSOR = {"check": "planning", "full_review": "check", "readiness": "full_review"}


def parse_operation(value: object) -> dict:
    if not isinstance(value, dict):
        fail("invalid_operation", "operation must be an object")
    assert isinstance(value, dict)
    member(value.get("operation"), tuple(OP_FIELDS))
    operation = value["operation"]
    optional = ("scope_ref",) if operation == "rework" else ("historical_success",) if operation in ("record_publication", "record_delivery") else ()
    object_fields(value, ("api_version", "operation", "key", "owner_role", "owner_id", *OP_FIELDS[operation]), optional)
    if value["api_version"] != "1.0":
        fail("unsupported_delivery_api", str(value["api_version"]))
    member(value["owner_role"], OWNER_ROLES)
    nonempty(value["owner_id"])
    key = object_fields(value["key"], ("task_id", "lifecycle_generation", *(("delivery_id",) if operation in DELIVERY_OPS else ())))
    nonempty(key["task_id"])
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", key["task_id"]):
        fail("invalid_operation", "invalid TaskId")
    integer(key["lifecycle_generation"])
    if operation in DELIVERY_OPS:
        delivery_uuid(key["delivery_id"])
    if "expected_phase" in value:
        member(value["expected_phase"], PHASES)
    if "historical_success" in value and not isinstance(value["historical_success"], bool):
        fail("invalid_operation", "historical_success must be boolean")
    if operation in ("accept_scope", "reopen_task"):
        authority(value["authority"])
    elif operation == "create_delivery":
        slice_scope(value["scope_ref"])
        member(value["profile"], PROFILES)
    elif operation == "begin_check":
        candidate(value["candidate"])
    elif operation == "record_gate":
        gate_result(value["result"])
    elif operation == "record_publication":
        publication_fact(value["result"])
    elif operation == "record_delivery":
        delivery_fact(value["result"])
    elif operation == "rework":
        member(value["target_role"], ("planning", "implementation", "check", "full_review", "readiness"))
        authority(value["reason"])
        if not isinstance(value["affected_results"], list):
            fail("invalid_operation", "affected_results must be an array")
        for role in value["affected_results"]:
            member(role, GATES)
        if "scope_ref" in value:
            slice_scope(value["scope_ref"])
    elif operation == "stop":
        stop_result(value["result"])
    elif operation == "complete_task":
        r = object_fields(value["result"], ("result_id", "owner_id", "evidence", "lifecycle_generation", "accepted_scope", "delivery_result_ids", "outcome"))
        result_identity(r)
        integer(r["lifecycle_generation"])
        authority(r["accepted_scope"])
        member(r["outcome"], ("completed",))
        strings(r["delivery_result_ids"])
    elif operation == "close_task":
        r = object_fields(value["result"], ("result_id", "owner_id", "evidence", "lifecycle_generation", "completion_result_id", "disposition", "source_result"))
        result_identity(r)
        integer(r["lifecycle_generation"])
        nonempty(r["completion_result_id"])
        member(r["disposition"], ("no_mutation", "source_closed"))
        if r["disposition"] == "source_closed":
            authority(r["source_result"])
        elif r["source_result"] is not None:
            fail("invalid_operation", "no_mutation has no source result")
    return copy.deepcopy(value)


def _require_owner(op: dict, workflow: dict, role: str) -> None:
    if op["owner_role"] != role or workflow["owners"][role] != op["owner_id"]:
        fail("owner_mismatch", f"{role} is owned by {workflow['owners'][role]}")


def _active_authority(record: dict, d: dict) -> None:
    if record["accepted_scope"] is None or record["accepted_scope"] != d["scope_ref"]["authority"]:
        fail("stale_scope", "Delivery scope differs from current Task authority")


def _applicable(record: dict, d: dict, role: str) -> dict:
    _active_authority(record, d)
    result = d["results"][role]
    if (result is None or result["scope_ref"] != d["scope_ref"] or result["plan_ref"] != d["plan_ref"]
            or (role != "planning" and result["candidate"] != d["candidate"])):
        fail("gate_not_applicable", role)
    assert result is not None
    if role != "planning" and result["predecessor_result_id"] != _applicable(record, d, PREDECESSOR[role])["result_id"]:
        fail("gate_not_applicable", f"{role} predecessor")
    return result


def _all_results(record: dict) -> list[dict]:
    results = [*record["completion_results"], *record["closure_results"]]
    for d in record["deliveries"]:
        results.extend(r for r in (*d["results"].values(), d["publication_result"], d["delivery_result"], d["stop_result"]) if r is not None)
    return results


def apply_operation(input_record: object, request: object, declaration: object) -> dict:
    """Apply one owner operation, returning a validated copy and exact result ref."""
    record = parse_task_v2(input_record)
    op = parse_operation(request)
    workflow = validate_runtime_contract(declaration)
    if workflow["owners"][op["owner_role"]] != op["owner_id"]:
        fail("owner_mismatch", op["owner_role"])
    if op["key"]["task_id"] != record["id"]:
        fail("task_identity_mismatch", op["key"]["task_id"])
    delivery_id = op["key"].get("delivery_id")
    d = next((item for item in record["deliveries"] if item["id"] == delivery_id), None)
    if d is not None and d["lifecycle_generation"] != op["key"]["lifecycle_generation"]:
        fail("delivery_identity_mismatch", d["id"])
    historical = op["operation"] in ("record_delivery", "record_publication") and op.get("historical_success") is True
    if d is not None and op["operation"] != "stop" and not historical and d["profile"] not in workflow["profiles"]:
        fail("unsupported_delivery_profile", d["profile"])
    def output(changed: bool, result_id: str | None = None) -> dict:
        return {"record": parse_task_v2(record), "key": op["key"], "phase": d["phase"] if d else None, "result_id": result_id, "changed": changed}
    if "result" in op:
        result = op["result"]
        if result["owner_id"] != op["owner_id"]:
            fail("owner_mismatch", "result producer differs from invoking owner")
        prior = next((r for r in _all_results(record) if r["result_id"] == result["result_id"]), None)
        if prior is not None:
            owned = any(r is not None and r["result_id"] == result["result_id"] for r in (*d["results"].values(), d["publication_result"], d["delivery_result"], d["stop_result"])) if d else any(r["result_id"] == result["result_id"] and r["lifecycle_generation"] == op["key"]["lifecycle_generation"] for r in (*record["completion_results"], *record["closure_results"]))
            if not owned or prior != result:
                fail("result_identity_conflict", result["result_id"])
            role = result["owner_role"] if op["operation"] == "record_gate" else {"record_publication": "publication", "record_delivery": "delivery", "complete_task": "completion", "close_task": "closure"}.get(op["operation"], op["owner_role"])
            _require_owner(op, workflow, str(role))
            return output(False, result["result_id"])
    if op["operation"] == "reopen_task" and op["key"]["lifecycle_generation"] != record["lifecycle_generation"]:
        _require_owner(op, workflow, "task_scope")
        untouched = not any(row["lifecycle_generation"] == record["lifecycle_generation"] for row in (*record["deliveries"], *record["completion_results"], *record["closure_results"]))
        if (record["lifecycle_generation"] == op["key"]["lifecycle_generation"] + 1
                and record["accepted_scope"] == op["authority"] and untouched
                and any(row["lifecycle_generation"] == op["key"]["lifecycle_generation"] for row in record["completion_results"])):
            return {**output(False), "key": {"task_id": record["id"], "lifecycle_generation": record["lifecycle_generation"]}}
    if op["key"]["lifecycle_generation"] != record["lifecycle_generation"] and not historical:
        fail("stale_lifecycle_generation", str(op["key"]["lifecycle_generation"]))
    if delivery_id is not None and op["operation"] != "create_delivery":
        if d is None:
            fail("delivery_not_found", delivery_id)
        assert d is not None
        if d["lifecycle_generation"] != op["key"]["lifecycle_generation"]:
            fail("delivery_identity_mismatch", delivery_id)
        if d["phase"] != op["expected_phase"] and not historical:
            fail("stale_phase", f"expected {op['expected_phase']}, found {d['phase']}")
        if d["phase"] == "stopped" or (d["phase"] == "delivered" and not (op["operation"] == "record_publication" and historical)):
            fail("terminal_delivery", d["id"])
    operation = op["operation"]
    if operation == "accept_scope":
        _require_owner(op, workflow, "task_scope")
        if record["accepted_scope"] != op["authority"] and any(r["lifecycle_generation"] == record["lifecycle_generation"] and r["accepted_scope"] == record["accepted_scope"] for r in record["completion_results"]):
            fail("reopen_required", "completed generation requires formal reopen before scope revision")
        record["accepted_scope"] = op["authority"]
        return output(input_record != record)
    if operation == "create_delivery":
        _require_owner(op, workflow, "creation")
        if op["profile"] not in workflow["profiles"]:
            fail("unsupported_delivery_profile", op["profile"])
        if d:
            if d["lifecycle_generation"] != op["key"]["lifecycle_generation"] or d["scope_ref"] != op["scope_ref"] or d["profile"] != op["profile"]:
                fail("delivery_identity_conflict", d["id"])
            return output(False)
        if any(r["lifecycle_generation"] == record["lifecycle_generation"] and r["accepted_scope"] == record["accepted_scope"] for r in record["completion_results"]):
            fail("task_already_completed", record["id"])
        if op["scope_ref"]["authority"] != record["accepted_scope"]:
            fail("stale_scope", "creation requires accepted Task authority")
        created = {"id": delivery_id, "lifecycle_generation": op["key"]["lifecycle_generation"], "scope_ref": op["scope_ref"], "planning_root": f"deliveries/{delivery_id}", "profile": op["profile"], "phase": "planning", "plan_ref": None, "candidate": None, "results": {role: None for role in GATES}, "publication_result": None, "delivery_result": None, "stop_result": None}
        record["deliveries"].append(created)
        return {**output(True), "phase": "planning"}
    if operation == "complete_task":
        _require_owner(op, workflow, "completion")
        result = op["result"]
        if result["lifecycle_generation"] != record["lifecycle_generation"] or result["accepted_scope"] != record["accepted_scope"] or record["accepted_scope"] is None:
            fail("stale_scope", "completion must bind current generation and authority")
        if any(item["phase"] not in ("delivered", "stopped") for item in record["deliveries"]):
            fail("unfinished_delivery", "Completion cannot bypass active slices")
        if any(r["lifecycle_generation"] == record["lifecycle_generation"] and r["accepted_scope"] == record["accepted_scope"] for r in record["completion_results"]):
            fail("completion_already_recorded", record["id"])
        record["completion_results"].append(result)
        return output(True, result["result_id"])
    if operation == "close_task":
        _require_owner(op, workflow, "closure")
        result = op["result"]
        completion = next((r for r in record["completion_results"] if r["result_id"] == result["completion_result_id"] and r["lifecycle_generation"] == record["lifecycle_generation"] and r["accepted_scope"] == record["accepted_scope"]), None)
        if completion is None or result["lifecycle_generation"] != record["lifecycle_generation"]:
            fail("completion_required", "Closure requires current Completion")
        if result["disposition"] == "source_closed" and record["source"]["kind"] != "issue":
            fail("invalid_source_disposition", "no source Issue")
        record["closure_results"].append(result)
        return output(True, result["result_id"])
    if operation == "reopen_task":
        _require_owner(op, workflow, "task_scope")
        if not any(r["lifecycle_generation"] == record["lifecycle_generation"] and r["accepted_scope"] == record["accepted_scope"] for r in record["completion_results"]):
            fail("completion_required", "formal reopen requires completed Task")
        record["lifecycle_generation"] += 1
        record["accepted_scope"] = op["authority"]
        return {**output(True), "key": {"task_id": record["id"], "lifecycle_generation": record["lifecycle_generation"]}}
    if d is None:
        fail("delivery_not_found", str(delivery_id))
    assert d is not None
    if operation == "begin_check":
        _require_owner(op, workflow, "implementation")
        if d["phase"] != "implementing":
            fail("illegal_transition", d["phase"])
        _applicable(record, d, "planning")
        d["candidate"] = op["candidate"]
        d["phase"] = "checking"
    elif operation == "record_gate":
        r = op["result"]
        role = r["owner_role"]
        _require_owner(op, workflow, role)
        _active_authority(record, d)
        expected = "planning" if role == "planning" else "checking" if role == "check" else "reviewing"
        if d["phase"] != expected:
            fail("illegal_transition", f"{role} in {d['phase']}")
        if r["scope_ref"] != d["scope_ref"]:
            fail("stale_scope", "gate scope differs")
        if role == "planning":
            d["plan_ref"] = r["plan_ref"]
        elif r["plan_ref"] != d["plan_ref"] or r["candidate"] != d["candidate"] or r["predecessor_result_id"] != _applicable(record, d, PREDECESSOR[role])["result_id"]:
            fail("gate_not_applicable", role)
        d["results"][role] = r
        d["phase"] = "implementing" if role == "planning" else "publishing" if role == "readiness" else "reviewing"
    elif operation == "rework":
        if op["owner_role"] not in STAGE_OWNERS[d["phase"]]:
            fail("owner_mismatch", "rework must be invoked by current semantic owner")
        target = {"planning": "planning", "implementation": "implementing", "check": "checking", "full_review": "reviewing", "readiness": "reviewing"}[op["target_role"]]
        rank = {"planning": 0, "implementation": 1, "check": 2, "full_review": 3, "readiness": 4, "publication": 5, "delivery": 6}
        if PHASES.index(target) > PHASES.index(d["phase"]) or rank[op["target_role"]] > rank[op["owner_role"]]:
            fail("illegal_transition", "rework cannot advance phase or semantic owner")
        if "scope_ref" in op:
            if op["target_role"] != "planning" or op["scope_ref"]["authority"] != record["accepted_scope"]:
                fail("stale_scope", "scope revision requires current Planning")
            d["scope_ref"] = op["scope_ref"]
        for role in op["affected_results"]:
            d["results"][role] = None
        if op["target_role"] != "planning":
            _applicable(record, d, "planning")
        if op["target_role"] in ("full_review", "readiness"):
            _applicable(record, d, "check")
        if op["target_role"] == "readiness":
            _applicable(record, d, "full_review")
        d["phase"] = target
    elif operation == "record_publication":
        _require_owner(op, workflow, "publication")
        if d["profile"] != "pull_request":
            fail("unsupported_delivery_profile", d["profile"])
        if not historical:
            if d["phase"] != "publishing":
                fail("illegal_transition", d["phase"])
            _applicable(record, d, "readiness")
            if op["result"]["candidate"] != d["candidate"]:
                fail("candidate_mismatch", "publication candidate")
        if d["publication_result"]:
            if d["phase"] == "delivered":
                fail("publication_already_recorded", d["id"])
            previous = d["publication_result"]
            if any(previous[field] != op["result"][field] for field in ("repo_ref", "pr_number", "owner_id")):
                fail("publication_identity_mismatch", "publication refresh must retain PR and producer identity")
        if d["delivery_result"] and d["delivery_result"]["profile"] == "pull_request":
            delivered = d["delivery_result"]
            if any(delivered[field] != op["result"][field] for field in ("repo_ref", "pr_number", "reviewed_head", "target_ref", "candidate")):
                fail("publication_identity_mismatch", "historical publication must match terminal delivery")
        d["publication_result"] = op["result"]
    elif operation == "record_delivery":
        _require_owner(op, workflow, "delivery")
        result = op["result"]
        if result["profile"] != d["profile"]:
            fail("unsupported_delivery_profile", result["profile"])
        if not historical:
            if d["phase"] != "publishing":
                fail("illegal_transition", d["phase"])
            _applicable(record, d, "readiness")
            if result["candidate"] != d["candidate"]:
                fail("candidate_mismatch", "delivery candidate")
            if result["profile"] == "pull_request":
                publication = d["publication_result"]
                if publication is None or any(publication[field] != result[field] for field in ("repo_ref", "pr_number", "reviewed_head", "target_ref", "candidate")):
                    fail("publication_required", "exact PR publication required")
        d["delivery_result"] = result
        d["phase"] = "delivered"
    elif operation == "stop":
        if op["owner_role"] not in STAGE_OWNERS[d["phase"]]:
            fail("owner_mismatch", "stop requires current stage owner and explicit scope decision")
        d["stop_result"] = op["result"]
        d["phase"] = "stopped"
    return output(True, op["result"]["result_id"] if "result" in op else None)


def get_gate_applicability(input_record: object, key: dict) -> dict:
    """Read stored reference/predecessor applicability without executing owners."""
    record = parse_task_v2(input_record)
    object_fields(key, ("task_id", "lifecycle_generation", "delivery_id"))
    integer(key["lifecycle_generation"])
    delivery_uuid(key["delivery_id"])
    if key["task_id"] != record["id"]:
        fail("task_identity_mismatch", key["task_id"])
    d = next((row for row in record["deliveries"] if row["id"] == key["delivery_id"] and row["lifecycle_generation"] == key["lifecycle_generation"]), None)
    if d is None:
        fail("delivery_not_found", key["delivery_id"])
    statuses = {}
    for role in GATES:
        result = d["results"][role]
        if result is None:
            statuses[role] = {"kind": "missing", "result_id": None, "code": None}
            continue
        try:
            if d["lifecycle_generation"] != record["lifecycle_generation"]:
                fail("stale_lifecycle_generation", d["id"])
            _applicable(record, d, role)
            statuses[role] = {"kind": "applicable", "result_id": result["result_id"], "code": None}
        except DeliveryError as exc:
            statuses[role] = {"kind": "not_applicable", "result_id": result["result_id"], "code": exc.code}
    return statuses
