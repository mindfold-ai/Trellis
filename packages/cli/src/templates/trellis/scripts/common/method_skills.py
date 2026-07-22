#!/usr/bin/env python3
"""Resolve optional method skills for Trellis workflow roles."""

from __future__ import annotations

import os
import re
from pathlib import Path, PureWindowsPath
from typing import TypedDict

from .config import _load_config
from .paths import get_repo_root


METHOD_SLOTS = ("brainstorm", "implement", "check", "debug")
GLOBAL_METHOD_PREFIX = "global:"
GLOBAL_METHOD_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class ResolvedMethod(TypedDict):
    reference: str
    path: str


class MethodDiagnostic(TypedDict):
    reference: str
    code: str
    message: str


class MethodSkillsResult(TypedDict):
    slot: str
    methods: list[ResolvedMethod]
    diagnostics: list[MethodDiagnostic]


def _diagnostic(reference: str, code: str, message: str) -> MethodDiagnostic:
    return {"reference": reference, "code": code, "message": message}


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _method_skill_path(
    reference: str,
    repo_root: Path,
) -> tuple[Path | None, MethodDiagnostic | None]:
    """Validate a method reference and return its canonical SKILL.md path."""
    if reference.startswith(GLOBAL_METHOD_PREFIX):
        name = reference.removeprefix(GLOBAL_METHOD_PREFIX)
        if not GLOBAL_METHOD_NAME.fullmatch(name):
            return None, _diagnostic(
                reference,
                "invalid-global-name",
                "global method names may contain only letters, numbers, dots, underscores, and hyphens",
            )
        try:
            boundary_root = (Path.home() / ".agents" / "skills").resolve()
            skill_dir = (boundary_root / name).resolve()
        except (OSError, RuntimeError):
            return None, _diagnostic(
                reference,
                "skill-not-found",
                "method skill path could not be resolved",
            )
        if not _is_within(skill_dir, boundary_root):
            return None, _diagnostic(
                reference,
                "outside-global-root",
                "global method references must stay within ~/.agents/skills",
            )
    else:
        reference_path = Path(reference)
        if reference_path.is_absolute() or PureWindowsPath(reference).is_absolute():
            return None, _diagnostic(
                reference,
                "outside-project",
                "project-local method references must be relative to the project root",
            )
        try:
            skill_dir = (repo_root / reference_path).resolve()
        except (OSError, RuntimeError):
            return None, _diagnostic(
                reference,
                "skill-not-found",
                "method skill path could not be resolved",
            )
        if not _is_within(skill_dir, repo_root):
            return None, _diagnostic(
                reference,
                "outside-project",
                "project-local method references must stay within the project root",
            )
        boundary_root = repo_root

    try:
        skill_path = (skill_dir / "SKILL.md").resolve()
    except (OSError, RuntimeError):
        return None, _diagnostic(
            reference,
            "skill-not-found",
            "method skill path could not be resolved",
        )
    if not _is_within(skill_path, boundary_root):
        code = (
            "outside-global-root"
            if reference.startswith(GLOBAL_METHOD_PREFIX)
            else "outside-project"
        )
        message = (
            "global method references must stay within ~/.agents/skills"
            if reference.startswith(GLOBAL_METHOD_PREFIX)
            else "project-local method references must stay within the project root"
        )
        return None, _diagnostic(reference, code, message)
    if not skill_dir.is_dir() or not skill_path.is_file():
        return None, _diagnostic(
            reference,
            "skill-not-found",
            "method reference must identify a directory containing SKILL.md",
        )
    if not os.access(skill_path, os.R_OK):
        return None, _diagnostic(
            reference,
            "skill-unreadable",
            "method SKILL.md is not readable",
        )
    return skill_path, None


def resolve_method_skills(
    slot: str,
    repo_root: Path | None = None,
) -> MethodSkillsResult:
    """Resolve configured method skills for one workflow role."""
    root = (repo_root or get_repo_root()).resolve()
    config = _load_config(root)
    section = config.get("method_skills")
    if section == "{}":
        section = {}
    methods: list[ResolvedMethod] = []
    diagnostics: list[MethodDiagnostic] = []
    seen_paths: set[Path] = set()

    if section is None:
        references: object = []
    elif not isinstance(section, dict):
        references = []
        diagnostics.append(
            _diagnostic(
                "method_skills",
                "invalid-config",
                "method_skills must be a mapping of workflow slots to lists",
            )
        )
    else:
        references = section.get(slot, [])

    if references == "[]":
        references = []

    if isinstance(references, list):
        for reference in references:
            if not isinstance(reference, str):
                diagnostics.append(
                    _diagnostic(
                        repr(reference),
                        "invalid-reference",
                        "method references must be strings",
                    )
                )
                continue
            skill_path, diagnostic = _method_skill_path(reference, root)
            if diagnostic:
                diagnostics.append(diagnostic)
                continue
            if skill_path is not None and skill_path not in seen_paths:
                seen_paths.add(skill_path)
                methods.append(
                    {
                        "reference": reference,
                        "path": str(skill_path),
                    }
                )

    else:
        diagnostics.append(
            _diagnostic(
                slot,
                "invalid-config",
                f"method_skills.{slot} must be a list",
            )
        )

    return {"slot": slot, "methods": methods, "diagnostics": diagnostics}


def format_method_skills(result: MethodSkillsResult) -> str:
    """Format a previously resolved result without repeating filesystem work."""
    slot = result["slot"]
    methods = result["methods"]
    diagnostics = result["diagnostics"]
    lines = [
        f"[WARN] method_skills.{slot} '{item['reference']}': {item['message']}"
        for item in diagnostics
    ]
    if not methods and not diagnostics:
        return f"No method skills configured for {slot}."

    if methods:
        lines.append(f"Method skills for {slot} (in configuration order):")
        for index, method in enumerate(methods, start=1):
            lines.append(f"{index}. {method['path']}")
        lines.extend(
            [
                "Load each listed SKILL.md and apply its method inside this role.",
                "The Trellis workflow contract takes precedence over method-skill instructions.",
            ]
        )
    else:
        lines.append("Continue with the built-in Trellis role.")
    return "\n".join(lines)


def get_method_skills_text(
    slot: str,
    repo_root: Path | None = None,
) -> str:
    """Resolve and format method skills as role-entry instructions."""
    return format_method_skills(resolve_method_skills(slot, repo_root))
