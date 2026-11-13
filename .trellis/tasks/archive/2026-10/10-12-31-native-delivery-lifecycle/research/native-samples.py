"""Run controlled installed native samples, pausing for independent full Review.

This is validation tooling, not a product lifecycle writer or acceptance ledger.
All mutations occur under the supplied temporary sample directory. Review and
whole-scope decisions are performed by the invoking AI owners, not this script.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


PYTHON = "/usr/bin/python3"


def run(root: Path, *argv: str) -> str:
    env = {**os.environ, "TRELLIS_CONTEXT_ID": "issue31-native-sample"}
    return subprocess.check_output(argv, cwd=root, env=env, stderr=subprocess.STDOUT, text=True)


def ref(root: Path, file: Path) -> dict:
    return {"locator": file.relative_to(root).as_posix(),
            "revision": "sha256:" + hashlib.sha256(file.read_bytes()).hexdigest()}


def call(root: Path, *argv: str) -> str:
    return run(root, PYTHON, str(root / ".trellis/scripts/delivery.py"), *argv)


def apply(root: Path, info: dict, operation: str, role: str, **payload: object) -> dict:
    key = {"task_id": info["task_id"], "lifecycle_generation": 0}
    if operation not in ("accept_scope", "complete_task", "close_task"):
        key["delivery_id"] = info["delivery_id"]
    request = {"api_version": "1.0", "operation": operation, "key": key,
               "owner_role": role, "owner_id": info["owners"][role], **payload}
    return json.loads(call(root, "apply", "--task", info["task"], "--input", json.dumps(request)))


def gate(root: Path, info: dict, role: str, predecessor: str | None, evidence: dict) -> dict:
    return {"result_id": info["delivery_id"] + ":" + role, "owner_role": role,
            "owner_id": info["owners"][role],
            "outcome": "accepted" if role == "planning" else "ready" if role == "readiness" else "passed",
            "scope_ref": info["scope_ref"], "plan_ref": info["plan_ref"],
            "candidate": None if role == "planning" else info["candidate"],
            "predecessor_result_id": predecessor, "obligations": [], "evidence": [evidence]}


def prepare(base: Path, cli: str) -> None:
    samples = []
    for name, git, slices in (("manual-single", False, 1), ("local-multi", True, 2)):
        root = base / name
        root.mkdir()
        if git:
            run(root, "git", "init", "-b", "main")
            run(root, "git", "config", "user.name", "Native Sample")
            run(root, "git", "config", "user.email", "native-sample@example.invalid")
            (root / "baseline.txt").write_text("Controlled local native validation.\n")
            run(root, "git", "add", "baseline.txt")
            run(root, "git", "commit", "-m", "sample baseline")
        init = run(root, cli, "init", "--yes", "--codex", "--workflow", "native-delivery-v1")
        (root / "install.log").write_text(init)
        output = run(root, PYTHON, str(root / ".trellis/scripts/task.py"), "create", "Native sample", "--description", "Controlled native owner and installed runtime validation", "--slug", "native-sample", "--schema-version", "2.0")
        task = next(line.strip() for line in output.splitlines() if line.strip().startswith(".trellis/tasks/"))
        taskdir = root / task
        record = json.loads((taskdir / "task.json").read_text())
        from importlib.util import spec_from_file_location, module_from_spec
        spec = spec_from_file_location("sample_runtime_contract", root / ".trellis/scripts/common/runtime_contract.py")
        assert spec is not None and spec.loader is not None
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        owners = module.read_runtime_contract(root / ".trellis/workflow.md")["owners"]
        scopefile = taskdir / "prd.md"
        scopefile.write_text("# Native sample accepted scope\n\n" + "".join(
            f"- AC{i}: retain report{i}.txt with the exact line 'Accepted slice {i}.'\\n.\n" for i in range(1, slices + 1)))
        info = {"root": str(root), "task": task, "task_id": record["id"], "owners": owners}
        authority = ref(root, scopefile)
        apply(root, info, "accept_scope", "task_scope", authority=authority)
        run(root, PYTHON, str(root / ".trellis/scripts/task.py"), "start", task)
        for i in range(1, slices + 1):
            delivery_id = call(root, "new-id").strip()
            item = {**info, "delivery_id": delivery_id, "slice": i,
                    "scope_ref": {"authority": authority, "anchors": [f"AC{i}"]},
                    "profile": "local_commit" if git else "manual"}
            apply(root, item, "create_delivery", "creation", scope_ref=item["scope_ref"], profile=item["profile"])
            call(root, "select", "--task", task, "--delivery", delivery_id)
            planning = taskdir / "deliveries" / delivery_id
            planning.mkdir(parents=True, exist_ok=True)
            plan = planning / "implement.md"
            plan.write_text(f"# Slice {i}\n\nOwn only report{i}.txt. Retain the exact accepted line.\nCheck its bytes, independently review this complete slice, then record the actual {item['profile']} outcome.\n")
            (planning / "prd.md").write_text(f"# Slice {i}\n\nTask root PRD AC{i} is this slice's complete scope.\n")
            (planning / "design.md").write_text("A retained UTF-8 text artifact; no remote side effects.\n")
            item["plan_ref"] = ref(root, plan)
            planning_result = gate(root, item, "planning", None, item["plan_ref"])
            apply(root, item, "record_gate", "planning", expected_phase="planning", result=planning_result)
            artifact = root / f"report{i}.txt"
            artifact.write_text(f"Accepted slice {i}.\n")
            base_ref = run(root, "git", "rev-parse", "HEAD").strip() if git else None
            if git:
                run(root, "git", "add", artifact.name)
                run(root, "git", "commit", "-m", f"sample slice {i}")
            item["candidate"] = {"kind": "git" if git else "git_free",
                "content_ref": json.loads(call(root, "candidate", "--paths", artifact.name))["content_ref"],
                "paths": [artifact.name], "head_ref": run(root, "git", "rev-parse", "HEAD").strip() if git else None,
                "base_ref": base_ref}
            apply(root, item, "begin_check", "implementation", expected_phase="implementing", candidate=item["candidate"])
            assert artifact.read_bytes() == f"Accepted slice {i}.\n".encode()
            checkfile = planning / "check.txt"
            checkfile.write_text(f"PASS: exact UTF-8 artifact bytes for AC{i}.\n" + (
                run(root, "git", "show", f"{item['candidate']['head_ref']}:{artifact.name}") if git else "Git-free artifact retained.\n"))
            result = gate(root, item, "check", planning_result["result_id"], ref(root, checkfile))
            apply(root, item, "record_gate", "check", expected_phase="checking", result=result)
            item["check_result_id"] = result["result_id"]
            item["artifact"] = ref(root, artifact)
            samples.append(item)
    (base / "samples.json").write_text(json.dumps(samples, indent=2) + "\n")
    print(json.dumps({"awaiting_independent_review": len(samples), "samples": str(base / "samples.json")}))


def finish(base: Path) -> None:
    samples = json.loads((base / "samples.json").read_text())
    for item in samples:
        root = Path(item["root"])
        review = root / item["task"] / "deliveries" / item["delivery_id"] / "review.txt"
        if not review.exists():
            raise ValueError(f"Actual independent review evidence missing: {review}")
        if item["profile"] == "local_commit":
            # Controlled sample checkout only: restore the exact reviewed
            # candidate, retaining both real commits and untracked Task data.
            run(root, "git", "switch", "--detach", item["candidate"]["head_ref"])
        call(root, "select", "--task", item["task"], "--delivery", item["delivery_id"])
        result = gate(root, item, "full_review", item["check_result_id"], ref(root, review))
        apply(root, item, "record_gate", "full_review", expected_phase="reviewing", result=result)
        ready = gate(root, item, "readiness", result["result_id"], ref(root, review))
        apply(root, item, "record_gate", "readiness", expected_phase="reviewing", result=ready)
        fact = {"result_id": item["delivery_id"] + ":delivered", "owner_id": item["owners"]["delivery"],
                "evidence": [ref(root, review)], "profile": item["profile"], "candidate": item["candidate"]}
        fact.update({"commit": item["candidate"]["head_ref"]} if item["profile"] == "local_commit" else {"artifact": item["artifact"]})
        first = apply(root, item, "record_delivery", "delivery", expected_phase="publishing", result=fact)
        retry = apply(root, item, "record_delivery", "delivery", expected_phase="publishing", result=fact)
        assert first["changed"] and not retry["changed"]
    for name in sorted({item["root"] for item in samples}):
        related = [item for item in samples if item["root"] == name]
        item, root = related[0], Path(name)
        completion = {"result_id": "native-sample:completed", "owner_id": item["owners"]["completion"],
            "evidence": [entry["artifact"] for entry in related], "lifecycle_generation": 0,
            "accepted_scope": item["scope_ref"]["authority"],
            "delivery_result_ids": [entry["delivery_id"] + ":delivered" for entry in related], "outcome": "completed"}
        apply(root, item, "complete_task", "completion", result=completion)
        apply(root, item, "close_task", "closure", result={"result_id": "native-sample:closed",
            "owner_id": item["owners"]["closure"], "evidence": completion["evidence"],
            "lifecycle_generation": 0, "completion_result_id": completion["result_id"],
            "disposition": "no_mutation", "source_result": None})
        print(name, "PASS", len(related), "Delivery(s), independent Completion and no-mutation Closure")


if __name__ == "__main__":
    destination = Path(sys.argv[2])
    if sys.argv[1] == "prepare":
        prepare(destination, sys.argv[3])
    elif sys.argv[1] == "finish":
        finish(destination)
    else:
        raise ValueError("prepare or finish required")
