#!/usr/bin/env python3
"""
Package discovery and context output.

Provides:
    get_packages_info           - Get structured package info
    get_packages_section        - Build PACKAGES text section
    get_context_packages_text   - Full packages text output (--mode packages)
    get_context_packages_json   - Full packages JSON output (--mode packages --json)
"""

from __future__ import annotations

from pathlib import Path

from .config import _is_true_config_value, get_default_package, get_packages, get_spec_scope
from .paths import (
    DIR_SPEC,
    DIR_WORKFLOW,
    get_repo_root,
)
from .history_paths import is_active_path
from .tasks import load_task
from .active_task import resolve_active_task
from .session_storage import SessionBindingError


# =============================================================================
# Internal Helpers
# =============================================================================

def _scan_spec_layers(spec_dir: Path, repo_root: Path, package: str | None = None) -> list[str]:
    """Scan spec directory for available layers (subdirectories).

    For monorepo: scans spec/<package>/
    For single-repo: scans spec/
    """
    target = spec_dir / package if package else spec_dir
    if not is_active_path(target, repo_root) or not target.is_dir():
        return []
    return sorted(
        d.name for d in target.iterdir()
        if d.name != "guides" and is_active_path(d, repo_root) and d.is_dir()
        and is_active_path(d / "index.md", repo_root)
    )


def _get_active_task_package(repo_root: Path) -> str | None:
    """Get the package field from the active task's task.json."""
    active = resolve_active_task(repo_root)
    if active.error:
        raise SessionBindingError(active.error)
    if not active.resolved_task_path:
        return None
    ct = load_task(active.resolved_task_path, active.task_workspace_root)
    return ct.package if ct and ct.package else None


def _context_workspace(repo_root: Path) -> Path:
    active = resolve_active_task(repo_root)
    if active.error:
        raise SessionBindingError(active.error)
    return active.task_workspace_root or repo_root


def _resolve_scope_set(
    packages: dict,
    spec_scope,
    task_pkg: str | None,
    default_pkg: str | None,
) -> set | None:
    """Resolve spec_scope to a set of allowed package names, or None for full scan."""
    if not packages:
        return None

    if spec_scope is None:
        return None

    if isinstance(spec_scope, str) and spec_scope == "active_task":
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None

    if isinstance(spec_scope, list):
        valid = {e for e in spec_scope if e in packages}
        if valid:
            return valid
        # All invalid: fallback
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None

    return None


# =============================================================================
# Public Functions
# =============================================================================

def get_packages_info(repo_root: Path) -> list[dict]:
    """Get structured package info for monorepo projects.

    Returns list of dicts with keys: name, path, type, default, specLayers,
    isSubmodule, isGitRepo.
    Returns empty list for single-repo projects.
    """
    packages = get_packages(repo_root)
    if not packages:
        return []

    default_pkg = get_default_package(repo_root)
    spec_dir = repo_root / DIR_WORKFLOW / DIR_SPEC
    result = []

    for pkg_name, pkg_config in packages.items():
        pkg_path = pkg_config.get("path", pkg_name) if isinstance(pkg_config, dict) else str(pkg_config)
        pkg_type = pkg_config.get("type", "local") if isinstance(pkg_config, dict) else "local"
        pkg_git = pkg_config.get("git", False) if isinstance(pkg_config, dict) else False
        layers = _scan_spec_layers(spec_dir, repo_root, pkg_name)

        result.append({
            "name": pkg_name,
            "path": pkg_path,
            "type": pkg_type,
            "default": pkg_name == default_pkg,
            "specLayers": layers,
            "isSubmodule": pkg_type == "submodule",
            "isGitRepo": _is_true_config_value(pkg_git),
        })

    return result


def get_packages_section(repo_root: Path) -> str:
    """Build the PACKAGES section for text output."""
    spec_dir = repo_root / DIR_WORKFLOW / DIR_SPEC
    pkg_info = get_packages_info(repo_root)

    lines: list[str] = []
    lines.append("## PACKAGES")

    if not pkg_info:
        lines.append("(single-repo mode)")
        layers = _scan_spec_layers(spec_dir, repo_root)
        if layers:
            lines.append(f"Spec layers: {', '.join(layers)}")
        return "\n".join(lines)

    default_pkg = get_default_package(repo_root)

    for pkg in pkg_info:
        layers_str = f"  [{', '.join(pkg['specLayers'])}]" if pkg["specLayers"] else ""
        submodule_tag = "  (submodule)" if pkg["isSubmodule"] else ""
        git_repo_tag = "  (git repo)" if pkg["isGitRepo"] else ""
        default_tag = "  *" if pkg["default"] else ""
        lines.append(
            f"- {pkg['name']:<16} {pkg['path']:<20}{layers_str}{submodule_tag}{git_repo_tag}{default_tag}"
        )

    if default_pkg:
        lines.append(f"Default package: {default_pkg}")

    return "\n".join(lines)


def get_context_packages_text(repo_root: Path | None = None) -> str:
    """Get packages context as formatted text (for --mode packages)."""
    if repo_root is None:
        repo_root = get_repo_root()
    repo_root = _context_workspace(repo_root)

    pkg_info = get_packages_info(repo_root)
    lines: list[str] = []

    if not pkg_info:
        spec_dir = repo_root / DIR_WORKFLOW / DIR_SPEC
        lines.append("Single-repo project (no packages configured)")
        lines.append("")
        layers = _scan_spec_layers(spec_dir, repo_root)
        if layers:
            lines.append(f"Spec layers: {', '.join(layers)}")
        return "\n".join(lines)

    # Resolve scope for annotations
    packages_dict = get_packages(repo_root) or {}
    default_pkg = get_default_package(repo_root)
    spec_scope = get_spec_scope(repo_root)
    task_pkg = _get_active_task_package(repo_root)
    scope_set = _resolve_scope_set(packages_dict, spec_scope, task_pkg, default_pkg)

    lines.append("## PACKAGES")
    lines.append("")
    for pkg in pkg_info:
        default_tag = " (default)" if pkg["default"] else ""
        type_tag = f" [{pkg['type']}]" if pkg["type"] != "local" else ""
        git_tag = " [git repo]" if pkg["isGitRepo"] else ""

        # Scope annotation
        scope_tag = ""
        if scope_set is not None and pkg["name"] not in scope_set:
            scope_tag = " (out of scope)"

        lines.append(f"### {pkg['name']}{default_tag}{type_tag}{git_tag}{scope_tag}")
        lines.append(f"Path: {pkg['path']}")
        if pkg["specLayers"]:
            lines.append(f"Spec layers: {', '.join(pkg['specLayers'])}")
            for layer in pkg["specLayers"]:
                lines.append(f"  - .trellis/spec/{pkg['name']}/{layer}/index.md")
        else:
            lines.append("Spec: not configured")
        lines.append("")

    # Also show shared guides
    guides_dir = repo_root / DIR_WORKFLOW / DIR_SPEC / "guides"
    if is_active_path(guides_dir / "index.md", repo_root) and guides_dir.is_dir():
        lines.append("### Shared Guides (always included)")
        lines.append("Path: .trellis/spec/guides/index.md")
        lines.append("")

    return "\n".join(lines)


def get_context_packages_json(repo_root: Path | None = None) -> dict:
    """Get packages context as a dictionary (for --mode packages --json)."""
    if repo_root is None:
        repo_root = get_repo_root()
    repo_root = _context_workspace(repo_root)

    pkg_info = get_packages_info(repo_root)

    if not pkg_info:
        spec_dir = repo_root / DIR_WORKFLOW / DIR_SPEC
        layers = _scan_spec_layers(spec_dir, repo_root)
        return {
            "mode": "single-repo",
            "specLayers": layers,
        }

    default_pkg = get_default_package(repo_root)
    spec_scope = get_spec_scope(repo_root)
    task_pkg = _get_active_task_package(repo_root)

    return {
        "mode": "monorepo",
        "packages": pkg_info,
        "defaultPackage": default_pkg,
        "specScope": spec_scope,
        "activeTaskPackage": task_pkg,
    }
