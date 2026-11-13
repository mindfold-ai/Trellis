"""Project path validation without special handling for previous data layouts."""

from __future__ import annotations

import os
from pathlib import Path


class ProjectPathError(ValueError):
    """A project-relative path resolves outside its project."""


def require_project_path(path: Path, repo_root: Path) -> None:
    """Validate project paths using metadata only; external absolute paths stay explicit."""
    root = Path(os.path.abspath(repo_root))
    candidate = Path(path)
    absolute = Path(os.path.abspath(root / candidate))
    project_relative = not candidate.is_absolute() or absolute.is_relative_to(root)
    if project_relative and not absolute.is_relative_to(root):
        raise ProjectPathError(f"path is outside the project: {path}")
    try:
        resolved_root = Path(os.path.realpath(root))
        resolved = Path(os.path.realpath(absolute))
    except (OSError, RuntimeError) as exc:
        raise ProjectPathError(f"cannot resolve project path: {path}") from exc
    if project_relative and not resolved.is_relative_to(resolved_root):
        workflow = root / ".trellis"
        if absolute.is_relative_to(workflow) and resolved.is_relative_to(Path(os.path.realpath(workflow))):
            return
        tasks = workflow / "tasks"
        if absolute.is_relative_to(tasks):
            if tasks.is_symlink() and resolved.is_relative_to(Path(os.path.realpath(tasks))):
                return
            relative = absolute.relative_to(tasks).parts
            if relative:
                task = tasks / relative[0]
                if task.is_symlink() and resolved.is_relative_to(Path(os.path.realpath(task))):
                    return
        raise ProjectPathError(f"path resolves outside the project: {path}")


def is_project_path(path: Path, repo_root: Path) -> bool:
    try:
        require_project_path(path, repo_root)
    except ProjectPathError:
        return False
    return True
