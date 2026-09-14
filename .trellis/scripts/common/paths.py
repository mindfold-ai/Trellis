#!/usr/bin/env python3
"""
Common path utilities for Trellis workflow.

Provides:
    get_repo_root          - Get repository root directory
    get_tasks_dir          - Get tasks directory
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path



# =============================================================================
# Path Constants (change here to rename directories)
# =============================================================================

# Directory names
DIR_WORKFLOW = ".trellis"
DIR_TASKS = "tasks"
DIR_ARCHIVE = "archive"
DIR_SPEC = "spec"
DIR_SCRIPTS = "scripts"

# File names
FILE_CURRENT_TASK = ".current-task"
FILE_TASK_JSON = "task.json"

# =============================================================================
# Repository Root
# =============================================================================

def get_repo_root(start_path: Path | None = None) -> Path:
    """Find the nearest directory containing .trellis/ folder.

    This handles nested git repos correctly (e.g., test project inside another repo).

    Args:
        start_path: Starting directory to search from. Defaults to current directory.

    Returns:
        Path to repository root, or current directory if no .trellis/ found.
    """
    current = (start_path or Path.cwd()).resolve()

    while current != current.parent:
        if (current / DIR_WORKFLOW).is_dir():
            return current
        current = current.parent

    # Fallback to current directory if no .trellis/ found
    return Path.cwd().resolve()


# =============================================================================
# Tasks Directory
# =============================================================================

def get_tasks_dir(repo_root: Path | None = None) -> Path:
    """Get tasks directory path.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Path to tasks directory.
    """
    if repo_root is None:
        repo_root = get_repo_root()
    # Local import: the shared guard uses this module's path constants.
    from .history_paths import require_active_path

    tasks_dir = repo_root / DIR_WORKFLOW / DIR_TASKS
    require_active_path(tasks_dir, repo_root)
    return tasks_dir


# =============================================================================
# Current Task Management
# =============================================================================

def normalize_task_ref(task_ref: str) -> str:
    """Normalize a task ref for stable runtime storage.

    Stored refs should prefer repo-relative POSIX paths like
    `.trellis/tasks/03-27-my-task`, even on Windows. Absolute paths are preserved
    unless they can later be converted back to repo-relative form by callers.
    """
    normalized = task_ref.strip()
    if not normalized:
        return ""

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return str(path_obj)

    normalized = normalized.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]

    if normalized.startswith(f"{DIR_TASKS}/"):
        return f"{DIR_WORKFLOW}/{normalized}"

    return normalized


def resolve_task_ref(task_ref: str, repo_root: Path | None = None) -> Path | None:
    """Resolve a task ref to an absolute task directory path inside the repo.

    Returns None when the ref resolves outside `repo_root`. Every reader of the
    active task — `task.py`, the shared hooks, the platform extensions — comes
    through here, so containment is enforced at this one point rather than at
    each call site.

    It matters because a ref is not always something the user typed. It round
    trips through the session pointer under `.trellis/.runtime/sessions/`, and
    `..` segments used to survive that trip intact: `_canonical_task_ref`
    compares lexically, and a lexical `relative_to` accepts
    `<root>/.trellis/tasks/../../../elsewhere` because the string does start
    with the root. The ref was then stored verbatim and replayed on every later
    turn, so `task.py start .trellis/tasks/../../../elsewhere` both rewrote that
    directory's `task.json` and fed its files to the model.

    Resolving here also normalises the path, so callers get a ref without `..`
    to store.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    normalized = normalize_task_ref(task_ref)
    if not normalized:
        return None

    try:
        root = repo_root.resolve()
    except OSError:
        return None

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        candidate = path_obj
    elif normalized.startswith(f"{DIR_WORKFLOW}/"):
        candidate = root / path_obj
    else:
        candidate = root / DIR_WORKFLOW / DIR_TASKS / path_obj

    # resolve() collapses `..` and follows symlinks, so a task directory that
    # links outside the repo is refused too. Both sides are resolved because
    # repo_root itself may sit behind a symlink (/tmp on macOS does).
    from .history_paths import RetiredDataPathError, require_active_path

    try:
        require_active_path(candidate, repo_root)
        resolved = candidate.resolve()
        workflow_real = (root / DIR_WORKFLOW).resolve()
    except (OSError, RetiredDataPathError):
        return None

    try:
        resolved.relative_to(root)
        return resolved
    except ValueError:
        pass

    # `.trellis` may itself be a symlink into a store outside the repo (#567).
    # The workflow dir's own real location is then a second legitimate
    # containment base: a ref through that link never left the workflow tree.
    # A ref that escapes BOTH bases (traversal, absolute path elsewhere, a
    # task dir symlinked out of the tree) is still refused.
    try:
        rel = resolved.relative_to(workflow_real)
    except ValueError:
        return None

    # Map back to the in-repo (lexical) form so callers store the same
    # repo-relative ref as in the non-symlinked layout.
    return root / DIR_WORKFLOW / rel


def get_current_task(
    repo_root: Path | None = None,
    platform_input: dict | None = None,
    platform: str | None = None,
) -> str | None:
    """Get a join-safe task path, absolute when owned by another workspace.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Local relative path, validated cross-workspace absolute path, or None.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    from .active_task import resolve_active_task
    from .session_storage import SessionBindingError

    active = resolve_active_task(repo_root, platform_input, platform)
    if active.error:
        raise SessionBindingError(active.error)
    # Compatibility callers join this string to their own root. Return an
    # absolute path across workspaces so that join cannot select a namesake.
    if active.task_workspace_root and active.task_workspace_root != repo_root.resolve():
        return str(active.resolved_task_path) if active.resolved_task_path else None
    return active.task_path


def get_current_task_abs(
    repo_root: Path | None = None,
    platform_input: dict | None = None,
    platform: str | None = None,
) -> Path | None:
    """Get current task directory absolute path.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        Absolute path to current task directory or None.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    from .active_task import resolve_active_task
    from .session_storage import SessionBindingError

    active = resolve_active_task(repo_root, platform_input, platform)
    if active.error:
        raise SessionBindingError(active.error)
    return active.resolved_task_path


def get_current_task_source(
    repo_root: Path | None = None,
    platform_input: dict | None = None,
    platform: str | None = None,
) -> tuple[str, str | None, str | None]:
    """Get active task source as (`source`, `context_key`, `task_path`)."""
    if repo_root is None:
        repo_root = get_repo_root()

    from .active_task import get_current_task_source as _get_source

    return _get_source(repo_root, platform_input, platform)


def set_current_task(
    task_path: str,
    repo_root: Path | None = None,
    platform_input: dict | None = None,
    platform: str | None = None,
) -> bool:
    """Set current task in session scope.

    Args:
        task_path: Task directory path (relative to repo_root).
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        True on success, False on error.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    from .active_task import set_active_task

    return set_active_task(
        task_path,
        repo_root,
        platform_input=platform_input,
        platform=platform,
    ) is not None


def clear_current_task(
    repo_root: Path | None = None,
    platform_input: dict | None = None,
    platform: str | None = None,
) -> bool:
    """Clear current task in session scope.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        True on success.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    from .active_task import clear_active_task

    clear_active_task(
        repo_root,
        platform_input=platform_input,
        platform=platform,
    )
    return True


def has_current_task(repo_root: Path | None = None) -> bool:
    """Check if has current task.

    Args:
        repo_root: Repository root path. Defaults to auto-detected.

    Returns:
        True if current task is set.
    """
    return get_current_task(repo_root) is not None


# =============================================================================
# Task ID Generation
# =============================================================================

def generate_task_date_prefix() -> str:
    """Generate task ID based on date (MM-DD format).

    Returns:
        Date prefix string (e.g., "01-21").
    """
    return datetime.now().strftime("%m-%d")


# =============================================================================
# Monorepo / Package Paths
# =============================================================================


def get_spec_dir(package: str | None = None, repo_root: Path | None = None) -> Path:
    """Get the spec directory path.

    Single-repo: .trellis/spec
    Monorepo with package: .trellis/spec/<package>

    Uses lazy import to avoid circular dependency with config.py.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    from .config import get_spec_base

    base = get_spec_base(package, repo_root)
    return repo_root / DIR_WORKFLOW / base


def get_package_path(package: str, repo_root: Path | None = None) -> Path | None:
    """Get a package's source directory absolute path from config.

    Returns:
        Absolute path to the package directory, or None if not found.
    """
    if repo_root is None:
        repo_root = get_repo_root()

    from .config import get_packages

    packages = get_packages(repo_root)
    if not packages or package not in packages:
        return None

    info = packages[package]
    if isinstance(info, dict):
        rel_path = info.get("path", package)
    else:
        rel_path = str(info)

    return repo_root / rel_path


# =============================================================================
# Main Entry (for testing)
# =============================================================================

if __name__ == "__main__":
    repo = get_repo_root()
    print(f"Repository root: {repo}")
    print(f"Tasks dir: {get_tasks_dir(repo)}")
    print(f"Current task: {get_current_task(repo)}")
