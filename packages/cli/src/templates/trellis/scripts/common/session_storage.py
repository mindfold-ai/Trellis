"""Validated repository-scoped schema-2 session storage."""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .path_boundary import ProjectPathError, require_project_path
from .io import (
    JSON_READ_MISSING,
    read_json_checked, read_task_id_reservation, write_json,
)
from .task_utils import TASK_ID_PATTERN, TaskIdentityError, lifecycle_generation


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
    root: Path
    task_id: str
    lifecycle_generation: int
    data: dict[str, Any]


@dataclass(frozen=True)
class ResolvedTask:
    workspace: Path
    task_ref: str
    task_path: Path


def _git(root: Path, *args: str) -> str:
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
        raise SessionBindingError(
            f"git_discovery_failed: {root}: {result.stderr.strip()}"
        )
    return result.stdout


def _common_dir(root: Path) -> Path:
    value = _git(root, "rev-parse", "--git-common-dir").rstrip("\r\n")
    if not value:
        raise SessionBindingError(
            f"git_discovery_failed: empty common directory: {root}"
        )
    return (root / value).resolve()


def repository_facts(root: Path) -> RepositoryFacts:
    root = root.resolve()
    apparent_git = any(os.path.lexists(p / ".git") for p in (root, *root.parents))
    try:
        common = _common_dir(root)
    except SessionBindingError as exc:
        if apparent_git or "not a git repository" not in str(exc):
            raise
        facts = RepositoryFacts(root, None, (), root)
        validate_workspace(root, facts)
        return facts
    git_root = Path(
        _git(root, "rev-parse", "--show-toplevel").rstrip("\r\n")
    ).resolve()
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
    require_project_path(root / ".trellis", root)
    if facts.common_dir is None:
        if root != facts.invocation_root:
            raise SessionBindingError(f"foreign_workspace: {root}")
    else:
        top = Path(
            _git(root, "rev-parse", "--show-toplevel").rstrip("\r\n")
        ).resolve()
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


def workspace_roots(facts: RepositoryFacts) -> tuple[Path, ...]:
    """Return live Trellis roots at the caller's repository-relative suffix."""
    if facts.common_dir is None or facts.git_root is None:
        return (validate_workspace(facts.invocation_root, facts),)
    suffix = facts.invocation_root.relative_to(facts.git_root)
    roots: set[Path] = set()
    for worktree in facts.worktrees:
        candidate = worktree / suffix
        require_project_path(candidate / ".trellis", candidate)
        if (candidate / ".trellis").is_dir():
            roots.add(validate_workspace(candidate, facts))
    return tuple(sorted(roots))


def _bound_task_workspace(
    facts: RepositoryFacts, task_id: str, generation: int,
    workspaces: tuple[Path, ...],
) -> Path | None:
    if facts.common_dir is None:
        return None
    path = facts.common_dir / "trellis" / "task-branches" / task_id / f"{generation}.json"
    require_project_path(path, facts.invocation_root)
    binding, reason = read_json_checked(path)
    if reason == JSON_READ_MISSING:
        if (facts.invocation_root / ".trellis" / "guru-team" / "extension.json").is_file():
            raise SessionBindingError(f"binding_required: {task_id!r}")
        return None
    if binding is None or set(binding) != {
        "schema_version", "task_id", "lifecycle_generation", "binding_revision", "branch_name",
    } or (binding["schema_version"] != "1.0" or binding["task_id"] != task_id
          or type(binding["lifecycle_generation"]) is not int
          or binding["lifecycle_generation"] != generation
          or type(binding["binding_revision"]) is not int or binding["binding_revision"] < 0
          or not isinstance(binding["branch_name"], str) or not binding["branch_name"]):
        raise SessionBindingError(f"invalid_task_branch_binding: {path}")
    matches = [
        workspace for workspace in workspaces
        if _git(workspace, "branch", "--show-current").strip() == binding["branch_name"]
    ]
    if len(matches) != 1:
        raise SessionBindingError(f"current_task_checkout_unresolved: {path}")
    return matches[0]


def sessions_directory(root: Path, facts: RepositoryFacts) -> Path:
    directory = (
        facts.common_dir / "trellis" / "sessions"
        if facts.common_dir is not None
        else root / ".trellis" / ".runtime" / "sessions"
    )
    require_project_path(directory, root)
    require_project_path(directory, facts.invocation_root)
    return directory


def session_path(root: Path, key: str, facts: RepositoryFacts) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", key):
        raise SessionBindingError("invalid_context_key")
    path = sessions_directory(root, facts) / f"{key}.json"
    require_project_path(path, root)
    require_project_path(path, facts.invocation_root)
    return path


def unsupported_checkout_session_paths(
    facts: RepositoryFacts, key: str
) -> tuple[Path, ...]:
    """Locate obsolete checkout-local bindings without reading their payload."""
    if facts.common_dir is None:
        return ()
    paths: list[Path] = []
    for workspace in workspace_roots(facts):
        path = workspace / ".trellis" / ".runtime" / "sessions" / f"{key}.json"
        require_project_path(path, workspace)
        require_project_path(path, facts.invocation_root)
        if record_exists(path):
            paths.append(path)
    return tuple(sorted(paths))


def record_exists(path: Path) -> bool:
    try:
        path.lstat()
        return True
    except FileNotFoundError:
        return False


def task_location(
    ref: str, workspace: Path, *, metadata: bool = True
) -> tuple[str, Path]:
    """Validate an explicit CLI TaskRef inside one live workspace."""
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
        candidate = (
            workspace / normalized
            if normalized.startswith(".trellis/")
            else get_tasks_dir(workspace) / normalized
        )
    try:
        require_project_path(candidate, workspace)
        require_project_path(candidate / "task.json", workspace)
        tasks = get_tasks_dir(workspace)
    except ProjectPathError as exc:
        raise SessionBindingError(f"invalid_task_path: {exc}") from exc
    try:
        relative = candidate.resolve().relative_to(tasks.resolve())
    except ValueError as exc:
        raise SessionBindingError(f"invalid_task_path: {ref}") from exc
    if len(relative.parts) != 1 or relative.parts[0] == "archive":
        raise SessionBindingError(
            f"invalid_task_path: not an active task: {ref}"
        )
    lexical = tasks / relative
    if metadata:
        data, reason = read_json_checked(lexical / "task.json")
        if data is None:
            raise SessionBindingError(
                f"task_metadata_{reason}: {lexical / 'task.json'}"
            )
    return lexical.relative_to(workspace).as_posix(), lexical


def read_record(path: Path, root: Path, facts: RepositoryFacts) -> SessionRecord:
    require_project_path(path, root)
    require_project_path(path, facts.invocation_root)
    data, reason = read_json_checked(path)
    if data is None:
        raise SessionBindingError(f"binding_{reason}: {path}")
    if type(data.get("schema_version")) is not int or data["schema_version"] != 2:
        raise SessionBindingError(
            f"unsupported_binding_schema: {path}; run task.py start"
        )
    expected = {"schema_version", "task_id", "lifecycle_generation"}
    if set(data) != expected:
        raise SessionBindingError(f"invalid_binding_fields: {path}")
    task_id = data.get("task_id")
    if not isinstance(task_id, str) or not TASK_ID_PATTERN.fullmatch(task_id):
        raise SessionBindingError(f"invalid_task_id: {path}")
    try:
        generation = lifecycle_generation(data, path)
    except TaskIdentityError as exc:
        raise SessionBindingError(str(exc)) from exc
    return SessionRecord(path, root.resolve(), task_id, generation, data)


def records(
    facts: RepositoryFacts,
    *,
    key: str | None = None,
    ignore_unsupported: bool = False,
) -> list[SessionRecord]:
    directory = sessions_directory(facts.invocation_root, facts)
    if key is not None:
        path = session_path(facts.invocation_root, key, facts)
        paths = [path] if record_exists(path) else []
    else:
        try:
            paths = sorted(p for p in directory.iterdir() if p.suffix == ".json")
        except FileNotFoundError:
            paths = []
    result: list[SessionRecord] = []
    for path in paths:
        try:
            result.append(read_record(path, facts.invocation_root, facts))
        except SessionBindingError as exc:
            if ignore_unsupported and str(exc).startswith(
                "unsupported_binding_schema:"
            ):
                continue
            raise
    return result


def _visible_identity_candidates(task_ref: str) -> set[str]:
    candidates = {task_ref}
    parts = task_ref.split("-", 2)
    if len(parts) == 3 and all(part.isdigit() for part in parts[:2]):
        candidates.add(parts[2])
    return candidates


def resolve_task_identity(
    facts: RepositoryFacts, task_id: str, generation: int,
    *, preferred_workspace: Path | None = None,
) -> ResolvedTask:
    """Resolve one session identity from current registered-worktree facts."""
    folded = task_id.casefold()
    exact: list[ResolvedTask] = []
    generation_mismatches: list[tuple[Path, int]] = []
    casefold_conflicts: list[tuple[Path, str]] = []
    workspaces = workspace_roots(facts)
    bound_workspace = _bound_task_workspace(facts, task_id, generation, workspaces)
    for workspace in (bound_workspace,) if bound_workspace is not None else workspaces:
        tasks = workspace / ".trellis" / "tasks"
        require_project_path(tasks, workspace)
        if not tasks.is_dir():
            continue
        for directory in sorted(tasks.iterdir()):
            if directory.name == "archive":
                continue
            require_project_path(directory, workspace)
            if not directory.is_dir():
                continue
            task_json = directory / "task.json"
            visible_match = any(
                value.casefold() == folded
                for value in _visible_identity_candidates(directory.name)
            )
            try:
                require_project_path(task_json, workspace)
            except ProjectPathError:
                if visible_match:
                    raise SessionBindingError(
                        f"invalid_task_metadata_path: {task_json}"
                    )
                continue
            candidate_id, reason = read_task_id_reservation(task_json)
            if candidate_id is None:
                if visible_match or reason != JSON_READ_MISSING:
                    raise SessionBindingError(
                        f"task_metadata_{reason}: {task_json}"
                    )
                continue
            if candidate_id.casefold() != folded:
                continue
            if candidate_id != task_id:
                casefold_conflicts.append((directory, candidate_id))
                continue
            data, reason = read_json_checked(task_json)
            if data is None:
                raise SessionBindingError(f"task_metadata_{reason}: {task_json}")
            try:
                candidate_generation = lifecycle_generation(data, task_json)
            except TaskIdentityError as exc:
                raise SessionBindingError(str(exc)) from exc
            task_ref = directory.relative_to(workspace).as_posix()
            resolved = ResolvedTask(workspace, task_ref, directory)
            if candidate_generation == generation:
                exact.append(resolved)
            else:
                generation_mismatches.append((directory, candidate_generation))
    if casefold_conflicts:
        detail = ", ".join(
            f"{path}={value!r}" for path, value in casefold_conflicts
        )
        raise SessionBindingError(
            f"task_id_casefold_collision: {task_id!r}: {detail}"
        )
    if len(exact) > 1 or (exact and generation_mismatches):
        if preferred_workspace is not None:
            local = [row for row in exact if row.workspace == preferred_workspace.resolve()]
            if len(local) == 1:
                return local[0]
        raise SessionBindingError(f"ambiguous_task_identity: {task_id!r}")
    if exact:
        return exact[0]
    if generation_mismatches:
        detail = ", ".join(
            f"{path} has generation {value}"
            for path, value in generation_mismatches
        )
        raise SessionBindingError(
            f"stale_lifecycle_generation: {task_id!r} expected {generation}: "
            f"{detail}"
        )
    raise SessionBindingError(f"stale_task_identity: {task_id!r}")


def write_record(path: Path, data: dict[str, Any], root: Path) -> None:
    require_project_path(path, root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not write_json(path, data):
            raise SessionBindingError(
                f"binding_write_failed: {path}; earlier changes may remain"
            )
    except OSError as exc:
        raise SessionBindingError(
            f"binding_write_failed: {path}: {exc}; earlier changes may remain"
        ) from exc


def remove_records(selected: list[SessionRecord]) -> int:
    removed = 0
    for record in selected:
        require_project_path(record.path, record.root)
        try:
            record.path.unlink()
        except OSError as exc:
            raise SessionBindingError(
                f"binding_clear_failed: {record.path}: {exc}; "
                f"{removed} records already cleared"
            ) from exc
        removed += 1
    return removed
