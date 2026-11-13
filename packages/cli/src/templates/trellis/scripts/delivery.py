#!/usr/bin/env python3
"""Delivery API 1.0 for declared schema-2 workflows; legacy records stay unchanged.

Usage:
    python3 .trellis/scripts/delivery.py current --json
    python3 .trellis/scripts/delivery.py new-id
    python3 .trellis/scripts/delivery.py list --task <task> --json
    python3 .trellis/scripts/delivery.py select --task <task> --delivery <uuid>
    python3 .trellis/scripts/delivery.py apply --task <task> --input <JSON-or-file>
    python3 .trellis/scripts/delivery.py candidate --paths <file> [<file> ...]

Owner operations record actual facts and never perform Git/GitHub mutations.
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

from common.active_task import resolve_active_task
from common.delivery_operations import parse_operation
from common.delivery_schema import fail, parse_task_v2, task_artifact_root
from common.delivery_session import get_current_delivery, release_delivery, select_delivery
from common.delivery_store import _checked_path, apply_to_store, candidate_content_ref
from common.io import read_json_checked
from common.paths import get_repo_root
from common.session_storage import repository_facts, resolve_task_identity
from common.task_utils import resolve_lifecycle_target

ALIASES = {
    "create": "create_delivery", "begin-check": "begin_check", "record-result": "record_gate",
    "rework": "rework", "record-publication": "record_publication", "record-delivery": "record_delivery",
    "stop": "stop", "accept-scope": "accept_scope", "complete": "complete_task",
    "closeout": "close_task", "reopen": "reopen_task",
}


def _target(ref: str | None, root: Path, *, allow_archived: bool = False) -> tuple[Path, Path]:
    if ref:
        target = resolve_lifecycle_target(ref, root, allow_archived=allow_archived)
        if target is None:
            fail("invalid_task_path", ref)
        assert target is not None
        return target
    active = resolve_active_task(root)
    if active.error:
        fail("stale_binding", active.error)
    if active.task_workspace_root is None or active.resolved_task_path is None:
        fail("no_current_task", "select a Task or pass --task")
    return active.task_workspace_root, active.resolved_task_path


def _input(raw: str) -> dict:
    text = raw if raw.lstrip().startswith("{") else Path(raw).read_text(encoding="utf-8")
    value = json.loads(text)
    if not isinstance(value, dict):
        fail("invalid_operation", "input must be a JSON object")
    return value


def _reopen_target(ref: str | None, root: Path, request: dict) -> tuple[Path, Path]:
    """Recover a disappeared archive locator only from an explicit operation key."""
    if ref is None:
        return _target(ref, root, allow_archived=True)
    normalized = ref.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    if normalized.startswith("tasks/"):
        normalized = ".trellis/" + normalized
    supplied = Path(normalized)
    candidate = supplied if supplied.is_absolute() else root / supplied
    if candidate.exists():
        return _target(ref, root, allow_archived=True)
    operation = parse_operation(request)
    selected = resolve_task_identity(repository_facts(root), operation["key"]["task_id"], operation["key"]["lifecycle_generation"] + 1)
    try:
        locator = candidate.relative_to(selected.workspace).as_posix()
    except ValueError:
        fail("invalid_task_path", ref)
    task_artifact_root(locator)
    if not locator.startswith(".trellis/tasks/archive/"):
        fail("invalid_task_path", "reopen recovery requires an explicit missing archive locator")
    _checked_path(candidate, selected.workspace)
    return selected.workspace, selected.task_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Explicit Delivery API 1.0")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("new-id", help="Allocate a stable UUID before Planning")
    contract = commands.add_parser("contract", help="Installed executable API capabilities")
    contract.add_argument("--json", action="store_true")
    current = commands.add_parser("current", help="Exact read-only session projection")
    current.add_argument("--json", action="store_true")
    listing = commands.add_parser("list", help="List explicit Task Deliveries, including history")
    listing.add_argument("--task")
    listing.add_argument("--json", action="store_true")
    selecting = commands.add_parser("select", help="Bind exact current-generation Delivery")
    selecting.add_argument("--task", required=True)
    selecting.add_argument("--delivery", required=True)
    commands.add_parser("release", help="Release this session's execution selection; retain Task")
    fingerprint = commands.add_parser("candidate", help="Read-only content identity for explicit paths")
    fingerprint.add_argument("--paths", nargs="+", required=True)
    fingerprint.add_argument("--kind", choices=("git", "git_free"), help="Candidate mode semantics; defaults to repository discovery")
    for name in ("apply", *ALIASES):
        command = commands.add_parser(name, help="Record a closed owner operation")
        command.add_argument("--task")
        command.add_argument("--input", "--operation-json", required=True, help="Complete operation JSON or UTF-8 file")
        command.add_argument("--expected-sha256", help="Expected sha256:<digest> of exact prior task.json bytes")
    args = parser.parse_args()
    try:
        if args.command == "new-id":
            print(str(uuid.uuid4()))
            return 0
        if args.command == "contract":
            print(json.dumps({"delivery_api": "1.0", "task_schema": "2.0"}))
            return 0
        root = get_repo_root()
        if args.command == "current":
            result = get_current_delivery(root)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1 if result["kind"] == "error" else 0
        if args.command == "release":
            print(json.dumps({"released": release_delivery(root)}))
            return 0
        if args.command == "candidate":
            print(json.dumps({"content_ref": candidate_content_ref(root, args.paths, args.kind)}, ensure_ascii=False))
            return 0
        request = None if args.command in ("list", "select") else _input(args.input)
        history = args.command == "list" or (request is not None and request.get("operation") == "reopen_task")
        workspace, task_dir = (_reopen_target(args.task, root, request)
                               if request is not None and request.get("operation") == "reopen_task"
                               else _target(args.task, root, allow_archived=history))
        if args.command == "list":
            record, reason = read_json_checked(task_dir / "task.json")
            if record is None:
                fail("invalid_record", str(reason))
            print(json.dumps(parse_task_v2(record)["deliveries"], ensure_ascii=False, indent=2))
        elif args.command == "select":
            print(json.dumps(select_delivery(task_dir, workspace, root, args.delivery), ensure_ascii=False, indent=2))
        else:
            assert request is not None
            if args.command in ALIASES and request.get("operation") != ALIASES[args.command]:
                fail("invalid_operation", f"{args.command} requires operation {ALIASES[args.command]}")
            print(json.dumps(apply_to_store(task_dir, workspace, request, args.expected_sha256), ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, RuntimeError) as exc:
        code = getattr(exc, "code", "runtime_error")
        print(json.dumps({"kind": "error", "code": code, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
