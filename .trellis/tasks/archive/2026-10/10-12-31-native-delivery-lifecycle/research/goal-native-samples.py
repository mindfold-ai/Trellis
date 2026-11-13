"""Controlled installed invocation recorder; never an acceptance decision maker.

Import this helper from the invoking AI owner's explicit scenario steps. There
is deliberately no prepare/finish command, automatic gate builder, or pass
inference. The owner supplies each complete closed operation after inspecting
its actual inputs and writing its reasoning. Independent Review remains with
the parent reviewer. All writes are confined to a supplied temporary root.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any


def content_ref(root: Path, file: Path) -> dict[str, str]:
    """Identify actual retained bytes; this says nothing about acceptance."""
    return {"locator": file.relative_to(root).as_posix(),
            "revision": "sha256:" + hashlib.sha256(file.read_bytes()).hexdigest()}


def file_snapshot(root: Path) -> dict[str, dict[str, Any]]:
    """Read bytes/modes without treating file presence as an owner verdict."""
    snapshot = {}
    for file in sorted(root.rglob("*")):
        relative = file.relative_to(root)
        if ".git" in relative.parts or "__pycache__" in relative.parts:
            continue
        if file.is_file() and not file.is_symlink():
            snapshot[relative.as_posix()] = {
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                "mode": file.stat().st_mode & 0o777,
            }
    return snapshot


@dataclass(frozen=True)
class InstalledSample:
    root: Path
    evidence: Path
    context: str
    cli: Path

    def __post_init__(self) -> None:
        for directory in (self.root, self.evidence):
            if not directory.resolve().is_relative_to(Path("/tmp").resolve()):
                raise ValueError("Controlled sample/evidence root must be under /tmp")
        self.evidence.mkdir(parents=True, exist_ok=True)

    def run(self, label: str, *argv: str, expected: int = 0) -> str:
        """Retain exact argv, output and status, and reject an unexpected exit."""
        target = self.evidence / (label + ".json")
        if target.exists():
            raise FileExistsError("Invocation labels are unique: " + str(target))
        environment = {key: value for key, value in os.environ.items()
                       if not key.startswith("GIT_")}
        environment["TRELLIS_CONTEXT_ID"] = self.context
        result = subprocess.run(argv, cwd=self.root, env=environment,
                                capture_output=True, text=True, check=False)
        observation = {"argv": list(argv), "cwd": str(self.root),
                       "context": self.context, "status": result.returncode,
                       "stdout": result.stdout, "stderr": result.stderr}
        target.write_text(json.dumps(observation, indent=2) + "\n", encoding="utf-8")
        if result.returncode != expected:
            raise RuntimeError("Unexpected exit; inspect " + str(target))
        return result.stdout

    def task(self, label: str, *arguments: str, expected: int = 0) -> str:
        return self.run(label, sys.executable,
                        str(self.root / ".trellis/scripts/task.py"),
                        *arguments, expected=expected)

    def delivery(self, label: str, *arguments: str, expected: int = 0) -> str:
        return self.run(label, sys.executable,
                        str(self.root / ".trellis/scripts/delivery.py"),
                        *arguments, expected=expected)

    def owners(self) -> dict[str, str]:
        text = (self.root / ".trellis/workflow.md").read_text(encoding="utf-8")
        value = text.split("[trellis-runtime-contract]", 1)[1].split(
            "[/trellis-runtime-contract]", 1)[0]
        return json.loads(value)["owners"]

    def apply(self, label: str, task: str, request: dict[str, Any],
              reasoning: str, *, expected: int = 0) -> dict[str, Any]:
        """Submit owner-authored input; never synthesize a successful result."""
        if not reasoning.strip():
            raise ValueError("Actual invoking owner's reasoning is required")
        if any((self.evidence / (label + suffix)).exists()
               for suffix in (".json", ".input.json", ".owner.md", ".mutation.json")):
            raise FileExistsError("Owner invocation labels are unique: " + label)
        (self.evidence / (label + ".owner.md")).write_text(reasoning + "\n", encoding="utf-8")
        request_path = self.evidence / (label + ".input.json")
        request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
        before = file_snapshot(self.root)
        output = self.delivery(label, "apply", "--task", task,
                               "--input", str(request_path), expected=expected)
        after = file_snapshot(self.root)
        (self.evidence / (label + ".mutation.json")).write_text(
            json.dumps({"before": before, "after": after}, indent=2) + "\n", encoding="utf-8")
        return json.loads(output) if expected == 0 else {}
