"""Validated repository-scoped session storage; reads never migrate bindings."""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .history_paths import RetiredDataPathError, require_active_path
from .io import read_json_checked, write_json


class SessionBindingError(ValueError):
    """A binding cannot safely supply task authority."""


@dataclass(frozen=True)
class RepositoryFacts:
    invocation_root: Path
    common_dir: Path | None
    worktrees: tuple[Path, ...]
    git_root: Path | None = None


@dataclass(frozen=True)
class SessionRecord:
    path: Path
    workspace: Path
    task_ref: str
    data: dict[str, Any]
    legacy: bool


def _git(root: Path, *args: str) -> str:
    # Process-local Git overrides must not substitute another checkout's facts.
    env = {k: v for k, v in os.environ.items() if k not in {
        "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
    }}
    env["LC_ALL"] = "C"
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args], capture_output=True,
            text=True, encoding="utf-8", errors="surrogateescape",
            timeout=10, env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SessionBindingError(f"git_discovery_failed: {root}: {exc}") from exc
    if result.returncode:
        raise SessionBindingError(f"git_discovery_failed: {root}: {result.stderr.strip()}")
    return result.stdout


def _common_dir(root: Path) -> Path:
    value = _git(root, "rev-parse", "--git-common-dir").rstrip("\r\n")
    if not value:
        raise SessionBindingError(f"git_discovery_failed: empty common directory: {root}")
    return (root / value).resolve()


def repository_facts(root: Path) -> RepositoryFacts:
    root = root.resolve()
    apparent_git = any(os.path.lexists(p / ".git") for p in (root, *root.parents))
    try:
        common = _common_dir(root)
    except SessionBindingError as exc:
        if apparent_git or "not a git repository" not in str(exc):
            raise
        return RepositoryFacts(root, None, ())
    git_root = Path(_git(root, "rev-parse", "--show-toplevel").rstrip("\r\n")).resolve()
    output = _git(root, "worktree", "list", "--porcelain", "-z")
    worktrees = tuple(dict.fromkeys(
        Path(field[len("worktree "):]).resolve()
        for field in output.split("\0") if field.startswith("worktree ")
    ))
    if git_root not in worktrees:
        raise SessionBindingError(f"unregistered_workspace: {root}")
    facts = RepositoryFacts(root, common, worktrees, git_root)
    validate_workspace(root, facts)
    return facts


def validate_workspace(root: Path, facts: RepositoryFacts) -> Path:
    root = root.resolve()
    require_active_path(root / ".trellis", root)
    if facts.common_dir is None:
        if root != facts.invocation_root:
            raise SessionBindingError(f"foreign_workspace: {root}")
    else:
        top = Path(_git(root, "rev-parse", "--show-toplevel").rstrip("\r\n")).resolve()
        if top not in facts.worktrees:
            raise SessionBindingError(f"unregistered_workspace: {root}")
        containing = [p for p in facts.worktrees if p == root or p in root.parents]
        if not containing or max(containing, key=lambda p: len(p.parts)) != top:
            raise SessionBindingError(f"unregistered_workspace: {root}")
        if _common_dir(root) != facts.common_dir:
            raise SessionBindingError(f"common_dir_mismatch: {root}")
        if root != top and top not in root.parents:
            raise SessionBindingError(f"invalid_workspace: {root}")
    if not (root / ".trellis").is_dir():
        raise SessionBindingError(f"missing_workspace: {root}")
    return root


def legacy_roots(facts: RepositoryFacts, known_roots: tuple[Path, ...] = ()) -> tuple[Path, ...]:
    """Discover only registered roots and the caller's nested project suffix."""
    if facts.git_root is None:
        return (facts.invocation_root,)
    suffixes = {facts.invocation_root.relative_to(facts.git_root)}
    for root in known_roots:
        validate_workspace(root, facts)
        containing = [p for p in facts.worktrees if p == root or p in root.parents]
        suffixes.add(root.relative_to(max(containing, key=lambda p: len(p.parts))))
    roots = {facts.invocation_root}
    for worktree in facts.worktrees:
        for candidate in (worktree, *(worktree / suffix for suffix in suffixes)):
            require_active_path(candidate / ".trellis", candidate)
            if (candidate / ".trellis").is_dir():
                roots.add(validate_workspace(candidate, facts))
    return tuple(sorted(roots))


def sessions_directory(root: Path, facts: RepositoryFacts, *, legacy: bool = False) -> Path:
    directory = (
        facts.common_dir / "trellis" / "sessions"
        if facts.common_dir is not None and not legacy
        else root / ".trellis" / ".runtime" / "sessions"
    )
    require_active_path(directory, root)
    require_active_path(directory, facts.invocation_root)
    return directory


def session_path(root: Path, key: str, facts: RepositoryFacts, *, legacy: bool = False) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", key):
        raise SessionBindingError("invalid_context_key")
    path = sessions_directory(root, facts, legacy=legacy) / f"{key}.json"
    require_active_path(path, root)
    require_active_path(path, facts.invocation_root)
    return path


def record_exists(path: Path) -> bool:
    """Only ENOENT means absent; permissions and dangling links are errors."""
    try:
        path.lstat()
        return True
    except FileNotFoundError:
        return False


def task_location(ref: str, workspace: Path, *, metadata: bool = True) -> tuple[str, Path]:
    """Validate against the effective tasks root, retaining lexical project paths."""
    from .paths import get_tasks_dir

    if not isinstance(ref, str) or not ref.strip():
        raise SessionBindingError("invalid_task_ref: expected nonempty string")
    normalized = ref.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    if normalized.startswith("tasks/"):
        normalized = ".trellis/" + normalized
    candidate = Path(normalized)
    if not candidate.is_absolute():
        candidate = workspace / normalized if normalized.startswith(".trellis/") else get_tasks_dir(workspace) / normalized
    try:
        require_active_path(candidate, workspace)
        require_active_path(candidate / "task.json", workspace)
        tasks = get_tasks_dir(workspace)
    except RetiredDataPathError as exc:
        # A retired target is stale, unlike forbidden session storage, which
        # must propagate the retirement exception before any content access.
        raise SessionBindingError(f"invalid_task_path: {exc}") from exc
    try:
        relative = candidate.resolve().relative_to(tasks.resolve())
    except ValueError as exc:
        raise SessionBindingError(f"invalid_task_path: {ref}") from exc
    if len(relative.parts) != 1 or relative.parts[0] == "archive":
        raise SessionBindingError(f"invalid_task_path: not an active task: {ref}")
    lexical = tasks / relative
    if metadata:
        data, reason = read_json_checked(lexical / "task.json")
        if data is None:
            raise SessionBindingError(f"task_metadata_{reason}: {lexical / 'task.json'}")
    return lexical.relative_to(workspace).as_posix(), lexical


def read_record(path: Path, root: Path, facts: RepositoryFacts, *, legacy: bool = False, metadata: bool = True) -> SessionRecord:
    require_active_path(path, root)
    require_active_path(path, facts.invocation_root)
    data, reason = read_json_checked(path)
    if data is None:
        raise SessionBindingError(f"binding_{reason}: {path}")
    versioned = "schema_version" in data
    if not legacy or versioned:
        if type(data.get("schema_version")) is not int or data["schema_version"] != 1:
            raise SessionBindingError(f"unsupported_binding_schema: {path}")
        common = data.get("repository_common_dir")
        if common != (str(facts.common_dir) if facts.common_dir else None):
            raise SessionBindingError(f"common_dir_mismatch: {path}")
        declared = data.get("task_workspace_root")
        if not isinstance(declared, str) or not Path(declared).is_absolute():
            raise SessionBindingError(f"invalid_workspace: {path}")
        workspace = validate_workspace(Path(declared), facts)
        if legacy and workspace != root:
            raise SessionBindingError(f"foreign_legacy_workspace: {path}")
    else:
        workspace = validate_workspace(root, facts)
    ref = data.get("current_task")
    if not isinstance(ref, str) or Path(ref).is_absolute():
        raise SessionBindingError(f"invalid_task_ref: {path}")
    canonical, _ = task_location(ref, workspace, metadata=metadata)
    return SessionRecord(path, workspace, canonical, data, legacy)


def records(facts: RepositoryFacts, *, key: str | None = None, metadata: bool = False) -> list[SessionRecord]:
    """Preflight all selected stores before any lifecycle mutation."""
    stores = [(facts.invocation_root, False)]
    result = []
    for root, legacy in stores:
        directory = sessions_directory(root, facts, legacy=legacy)
        if key is not None:
            path = session_path(root, key, facts, legacy=legacy)
            paths = [path] if record_exists(path) else []
        else:
            try:
                paths = sorted(p for p in directory.iterdir() if p.suffix == ".json")
            except FileNotFoundError:
                paths = []
        for path in paths:
            result.append(read_record(path, root, facts, legacy=legacy or facts.common_dir is None, metadata=metadata))
        if not legacy and facts.common_dir is not None:
            # Versioned bindings also identify nested Trellis projects. Carry
            # their suffixes into legacy cleanup when invoked from the top level.
            roots = legacy_roots(facts, tuple(record.workspace for record in result))
            stores.extend((workspace, True) for workspace in roots)
    return result


def write_record(path: Path, data: dict[str, Any], root: Path) -> None:
    require_active_path(path, root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not write_json(path, data):
            raise SessionBindingError(f"binding_write_failed: {path}; earlier changes may remain")
    except OSError as exc:
        raise SessionBindingError(f"binding_write_failed: {path}: {exc}; earlier changes may remain") from exc


def remove_records(selected: list[SessionRecord]) -> int:
    removed = 0
    for record in sorted(selected, key=lambda r: not r.legacy):
        # Clear fallback first, so a failed deletion cannot expose older ownership.
        require_active_path(record.path, record.workspace)
        try:
            record.path.unlink()
        except OSError as exc:
            raise SessionBindingError(f"binding_clear_failed: {record.path}: {exc}; {removed} records already cleared") from exc
        removed += 1
    return removed
