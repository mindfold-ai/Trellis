"""Metadata-only access boundary for retired Trellis data."""

from __future__ import annotations

import os
from pathlib import Path

from .paths import DIR_WORKFLOW


class RetiredDataPathError(ValueError):
    """An active operation must not access this historical path."""


def is_active_path(path: Path, repo_root: Path) -> bool:
    """Whether discovery may probe a path; allowed paths need not exist yet."""
    try:
        require_active_path(path, repo_root)
    except RetiredDataPathError:
        return False
    return True


def require_active_path(path: Path, repo_root: Path) -> None:
    """Reject lexical and resolved history paths before target IO.

    The caller supplies the checkout root: an external .trellis store cannot
    be inferred from a manifest's parents. Resolution only inspects metadata.
    """
    def protected(name: str) -> bool:
        return name in {"workspace", "agent-traces", ".developer"} or name.startswith(".backup-")

    def lexical_history(candidate: Path) -> bool:
        return any(
            part == DIR_WORKFLOW and protected(candidate.parts[index + 1])
            for index, part in enumerate(candidate.parts[:-1])
        )

    absolute = Path(os.path.abspath(repo_root / path))
    if lexical_history(absolute):
        raise RetiredDataPathError(f"refusing historical Trellis path: {path}")
    try:
        # realpath resolves only directory-entry metadata and avoids Python
        # 3.9 Path.resolve() probing the historical target with Path.stat().
        workflow_root = Path(os.path.realpath(repo_root / DIR_WORKFLOW))
        resolved = Path(os.path.realpath(absolute))
        relative = resolved.relative_to(workflow_root) if resolved.is_relative_to(workflow_root) else None
    except (OSError, RuntimeError) as exc:
        raise RetiredDataPathError(f"cannot classify active path: {path}") from exc
    if lexical_history(resolved) or (relative and relative.parts and protected(relative.parts[0])):
        raise RetiredDataPathError(f"refusing historical Trellis path: {path}")
