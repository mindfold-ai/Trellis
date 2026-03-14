#!/usr/bin/env python3
"""
Trellis configuration reader.

Reads settings from .trellis/config.yaml with sensible defaults.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .paths import DIR_WORKFLOW, get_repo_root
from .worktree import parse_simple_yaml


# Defaults
DEFAULT_SESSION_COMMIT_MESSAGE = "chore: record journal"
DEFAULT_MAX_JOURNAL_LINES = 2000

CONFIG_FILE = "config.yaml"


def _get_config_path(repo_root: Path | None = None) -> Path:
    """Get path to config.yaml."""
    root = repo_root or get_repo_root()
    return root / DIR_WORKFLOW / CONFIG_FILE


def _load_config(repo_root: Path | None = None) -> dict:
    """Load and parse config.yaml. Returns empty dict on any error."""
    config_file = _get_config_path(repo_root)
    try:
        content = config_file.read_text(encoding="utf-8")
        return parse_simple_yaml(content)
    except (OSError, IOError):
        return {}


def get_session_commit_message(repo_root: Path | None = None) -> str:
    """Get the commit message for auto-committing session records."""
    config = _load_config(repo_root)
    return config.get("session_commit_message", DEFAULT_SESSION_COMMIT_MESSAGE)


def get_max_journal_lines(repo_root: Path | None = None) -> int:
    """Get the maximum lines per journal file."""
    config = _load_config(repo_root)
    value = config.get("max_journal_lines", DEFAULT_MAX_JOURNAL_LINES)
    try:
        return int(value)
    except (ValueError, TypeError):
        return DEFAULT_MAX_JOURNAL_LINES


def get_hooks(event: str, repo_root: Path | None = None) -> list[str]:
    """Get hook commands for a lifecycle event.

    Args:
        event: Event name (e.g. "after_create", "after_archive").
        repo_root: Repository root path.

    Returns:
        List of shell commands to execute, empty if none configured.
    """
    config = _load_config(repo_root)
    hooks = config.get("hooks")
    if not isinstance(hooks, dict):
        return []
    commands = hooks.get(event)
    if isinstance(commands, list):
        return [str(c) for c in commands]
    return []


# =============================================================================
# Monorepo / Packages
# =============================================================================


def get_packages(repo_root: Path | None = None) -> dict[str, dict] | None:
    """Get monorepo package declarations.

    Returns:
        Dict mapping package name to its config (path, type, etc.),
        or None if not configured (single-repo mode).

    Example return:
        {"cli": {"path": "packages/cli"}, "docs-site": {"path": "docs-site", "type": "submodule"}}
    """
    config = _load_config(repo_root)
    packages = config.get("packages")
    if not isinstance(packages, dict):
        return None
    # Ensure each value is a dict (filter out scalar entries)
    filtered = {k: v for k, v in packages.items() if isinstance(v, dict)}
    if not filtered:
        return None
    return filtered


def get_default_package(repo_root: Path | None = None) -> str | None:
    """Get the default package name from config.

    Returns:
        Package name string, or None if not configured.
    """
    config = _load_config(repo_root)
    value = config.get("default_package")
    return str(value) if value else None


def get_submodule_packages(repo_root: Path | None = None) -> dict[str, str]:
    """Get packages that are git submodules.

    Returns:
        Dict mapping package name to its path for submodule-type packages.
        Empty dict if none configured.

    Example return:
        {"docs-site": "docs-site"}
    """
    packages = get_packages(repo_root)
    if packages is None:
        return {}
    return {
        name: cfg.get("path", name)
        for name, cfg in packages.items()
        if cfg.get("type") == "submodule"
    }


def get_git_packages(repo_root: Path | None = None) -> dict[str, str]:
    """Get packages that have their own independent git repository.

    These are sub-directories with their own .git (not submodules),
    marked with ``git: true`` in config.yaml.

    Returns:
        Dict mapping package name to its path for git-repo packages.
        Empty dict if none configured.

    Example config::

        packages:
          backend:
            path: iqs
            git: true

    Example return::

        {"backend": "iqs"}
    """
    packages = get_packages(repo_root)
    if packages is None:
        return {}
    return {
        name: cfg.get("path", name)
        for name, cfg in packages.items()
        if cfg.get("git") in (True, "true")
    }


def is_monorepo(repo_root: Path | None = None) -> bool:
    """Check if the project is configured as a monorepo (has packages in config)."""
    return get_packages(repo_root) is not None


def get_spec_base(package: str | None = None, repo_root: Path | None = None) -> str:
    """Get the spec directory base path relative to .trellis/.

    Single-repo: returns "spec"
    Monorepo with package: returns "spec/<package>"
    Monorepo without package: returns "spec" (caller should specify package)
    """
    if package and is_monorepo(repo_root):
        return f"spec/{package}"
    return "spec"


def validate_package(package: str, repo_root: Path | None = None) -> bool:
    """Check if a package name is valid in this project.

    Single-repo (no packages configured): always returns True.
    Monorepo: returns True only if package exists in config.yaml packages.
    """
    packages = get_packages(repo_root)
    if packages is None:
        return True  # Single-repo, no validation needed
    return package in packages


def resolve_package(
    task_package: str | None = None,
    repo_root: Path | None = None,
) -> str | None:
    """Resolve package from inferred sources with validation.

    Checks in order: task_package → default_package.
    Invalid inferred values print a warning to stderr and are skipped.

    Returns:
        Resolved package name, or None if no valid package found.

    Note:
        CLI --package should be validated separately by the caller
        (fail-fast with available packages list on error).
    """
    packages = get_packages(repo_root)
    if packages is None:
        return None  # Single-repo, no package needed

    # Try task_package (guard against non-string values from malformed JSON)
    if task_package and isinstance(task_package, str):
        if task_package in packages:
            return task_package
        print(
            f"Warning: task.json package '{task_package}' not found in config, skipping",
            file=sys.stderr,
        )

    # Try default_package
    default = get_default_package(repo_root)
    if default:
        if default in packages:
            return default
        print(
            f"Warning: default_package '{default}' not found in config, skipping",
            file=sys.stderr,
        )

    return None


def get_spec_scope(repo_root: Path | None = None) -> list[str] | str | None:
    """Get session.spec_scope configuration.

    Returns:
        list[str]: Package names to include in spec scanning.
        str: "active_task" to use current task's package.
        None: No scope configured (scan all packages).
    """
    config = _load_config(repo_root)
    session = config.get("session")
    if not isinstance(session, dict):
        return None

    scope = session.get("spec_scope")
    if scope is None:
        return None
    if isinstance(scope, str):
        return scope  # e.g. "active_task"
    if isinstance(scope, list):
        return [str(s) for s in scope]
    return None
