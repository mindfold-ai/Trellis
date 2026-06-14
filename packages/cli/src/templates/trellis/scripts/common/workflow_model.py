#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Structured Trellis workflow loader.

Runtime code reads ``.trellis/workflow.yaml`` as the machine-readable workflow
manifest. Long prompt bodies live under ``.trellis/workflow/*.md`` and are
loaded through ``body_file`` references.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .paths import DIR_WORKFLOW, get_repo_root
from .trellis_config import parse_simple_yaml


WORKFLOW_YAML = "workflow.yaml"


def workflow_yaml_path(repo_root: Path | None = None) -> Path:
    root = repo_root or get_repo_root()
    return root / DIR_WORKFLOW / WORKFLOW_YAML


def workflow_reference_path(repo_root: Path | None = None) -> str:
    return f"{DIR_WORKFLOW}/{WORKFLOW_YAML}"


def load_workflow_manifest(repo_root: Path | None = None) -> dict[str, Any]:
    path = workflow_yaml_path(repo_root)
    try:
        content = path.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return {}
    try:
        parsed = parse_simple_yaml(content)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _read_body(repo_root: Path, rel_path: Any) -> str:
    if not isinstance(rel_path, str) or not rel_path:
        return ""
    path = repo_root / rel_path
    try:
        return path.read_text(encoding="utf-8").strip()
    except (FileNotFoundError, OSError):
        return ""


def _phase_items(manifest: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    phases = _as_dict(manifest.get("phases"))
    return [(str(key), _as_dict(value)) for key, value in phases.items()]


def _step_items(phase: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    steps = _as_dict(phase.get("steps"))
    return [(str(key), _as_dict(value)) for key, value in steps.items()]


def _badge(step: dict[str, Any]) -> str:
    requirement = str(step.get("requirement") or "").replace("_", " ")
    cardinality = str(step.get("cardinality") or "").replace("_", " ")
    if requirement and cardinality:
        return f"[{requirement} · {cardinality}]"
    if requirement:
        return f"[{requirement}]"
    return ""


def get_workflow_state_bodies(repo_root: Path | None = None) -> dict[str, str]:
    root = repo_root or get_repo_root()
    manifest = load_workflow_manifest(root)
    states = _as_dict(manifest.get("workflow_states"))
    result: dict[str, str] = {}
    for status, state in states.items():
        body = _read_body(root, _as_dict(state).get("body_file"))
        if body:
            result[str(status)] = body
    return result


def render_step(step_id: str, repo_root: Path | None = None) -> str:
    root = repo_root or get_repo_root()
    manifest = load_workflow_manifest(root)
    for _, phase in _phase_items(manifest):
        for current_id, step in _step_items(phase):
            if current_id == step_id:
                body = _read_body(root, step.get("body_file"))
                return body.rstrip() + "\n" if body else ""
    return ""


def render_phase_index(repo_root: Path | None = None) -> str:
    root = repo_root or get_repo_root()
    manifest = load_workflow_manifest(root)
    if not manifest:
        return ""

    lines: list[str] = ["## Phase Index", ""]

    diagram = _as_list(_as_dict(manifest.get("phase_index")).get("diagram"))
    if diagram:
        lines.append("```")
        lines.extend(str(item) for item in diagram)
        lines.append("```")
        lines.append("")

    for phase_id, phase in _phase_items(manifest):
        label = phase.get("label") or f"Phase {phase_id}"
        title = phase.get("title") or ""
        lines.append(f"### {label}: {title}".rstrip())
        for step_id, step in _step_items(phase):
            title = step.get("title") or ""
            badge = _badge(step)
            summary = step.get("summary") or ""
            suffix = f" ({summary})" if summary else ""
            lines.append(f"- {step_id} {title} `{badge}`{suffix}".rstrip())
        lines.append("")

    extra_body = _read_body(
        root, _as_dict(manifest.get("phase_index")).get("extra_body_file")
    )
    if extra_body:
        lines.append(extra_body)
        lines.append("")

    lines.append("---")
    lines.append("")

    for phase_id, phase in _phase_items(manifest):
        label = phase.get("label") or f"Phase {phase_id}"
        title = phase.get("title") or ""
        lines.append(f"## {label}: {title}".rstrip())
        lines.append("")
        summary = phase.get("summary")
        if summary:
            lines.append(f"Goal: {summary}")
            lines.append("")
        for step_id, _step in _step_items(phase):
            body = render_step(step_id, root).rstrip()
            if body:
                lines.append(body)
                lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def render_workflow_toc(repo_root: Path | None = None) -> str:
    root = repo_root or get_repo_root()
    manifest = load_workflow_manifest(root)
    if not manifest:
        return "No workflow.yaml found"

    reference = workflow_reference_path(root)
    lines = [
        "# Development Workflow: Section Index",
        f"Full guide: {reference} (structured source; body files in .trellis/workflow/)",
        "",
        "## Contents",
        f"- {reference}",
        "- .trellis/workflow/",
    ]
    for phase_id, phase in _phase_items(manifest):
        label = phase.get("label") or f"Phase {phase_id}"
        title = phase.get("title") or ""
        lines.append(f"- {label}: {title}".rstrip())
    lines += ["", "---", "", render_phase_index(root).rstrip()]
    return "\n".join(lines).rstrip()
