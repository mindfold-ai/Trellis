"""
Safe git-add helpers for Trellis-owned paths.

Why this module exists
----------------------
A real user incident: a project's `.gitignore` listed `.trellis/` (company-wide
template / personal habit). When `add_session.py` and `task.py archive` ran
their auto-commit and `git add` failed with `ignored by .gitignore`, the AI
agent driving the workflow "fixed" it by retrying with
`git add -f .trellis/` — which fan-out-included every ignored subtree
(`.trellis/.backup-*/`, `.trellis/worktrees/`, `.trellis/.template-hashes.json`,
`.trellis/.runtime/`), committing 548 files / 83474 lines of caches/backups.

Design
------
- Scripts only stage SPECIFIC product paths (the current task dir, the archive dir). Never the whole `.trellis/` tree.
- If plain `git add <specific>` fails with "ignored by", DO NOT retry with
  ``-f``. The presence of `.trellis/` in `.gitignore` is treated as user
  intent ("keep .trellis/ local-only"). The script warns and skips the
  auto-commit; users who want auto-staging can either fix their `.gitignore`
  or set ``task_auto_commit: false`` and manage git themselves.
- The warning includes a negative example: ``Do NOT use `git add -f .trellis/` ...``
  so any AI rereading the log doesn't reinvent the bug.

History note: 0.5.10 introduced an automatic ``git add -f`` retry on the
specific paths. That was reverted in 0.5.11 — auto-forcing into a tree the
user had gitignored violates user intent even when the path list is narrow.
The wider-grain forbidden command stays forbidden, and the narrow-grain auto
``-f`` is gone too.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .git import run_git, run_git_retry_index_lock
from .paths import (
    DIR_TASKS,
    DIR_WORKFLOW,
)


# Paths under .trellis/ that must NEVER be auto-staged. Listed here so the
# warning to the user can show concrete subpaths to ignore individually
# instead of ignoring the whole `.trellis/` tree.
TRELLIS_IGNORED_SUBPATHS = (
    ".trellis/.backup-*",
    ".trellis/worktrees/",
    ".trellis/.template-hashes.json",
    ".trellis/.runtime/",
    ".trellis/.cache/",
)


def safe_archive_paths_to_add(
    repo_root: Path,
    archive_dest: Path,
    modified_children: list[str] | None = None,
) -> list[str]:
    """Stage only this archive destination and changed child metadata.

    The caller supplies the move's actual destination, avoiding an archive
    scan or accidentally staging another task's historical files.
    Source-side deletions are staged separately by the archive operation.
    """
    paths: list[str] = []
    if archive_dest.is_dir():
        paths.append(archive_dest.relative_to(repo_root).as_posix())
    for child_name in modified_children or []:
        paths.append(f"{DIR_WORKFLOW}/{DIR_TASKS}/{child_name}/task.json")
    return paths


def _stderr_indicates_ignored(stderr: str) -> bool:
    """git add error indicates the path is excluded by .gitignore."""
    if not stderr:
        return False
    lowered = stderr.lower()
    return "ignored by" in lowered


def safe_git_add(
    paths: list[str], repo_root: Path, retry_on_index_lock: bool = False
) -> tuple[bool, bool, str]:
    """Run `git add` on specific paths; never retry with -f.

    Returns ``(success, used_force, stderr)``. The ``used_force`` field is
    kept for signature compatibility with the 0.5.10 implementation but is
    always ``False`` — we never auto-force.

    Behavior:
      - No paths passed → success, no force, empty stderr.
      - Plain ``git add -- <paths>`` succeeds → return success.
      - Plain fails (any reason — ignored or otherwise) → return failure with
        the stderr. Callers should inspect the stderr (see
        :func:`print_gitignore_warning`) and skip the auto-commit.

    ``retry_on_index_lock`` opts into the bounded backoff-retry for a held
    ``.git/index.lock`` (see :func:`~.git.run_git_retry_index_lock`). It is
    off by default: only the archive path, which has already moved the task
    directory on disk by the time it stages, needs to wait out a transient
    lock rather than fail.
    """
    if not paths:
        return True, False, ""

    runner = run_git_retry_index_lock if retry_on_index_lock else run_git
    rc, _, err = runner(["add", "--", *paths], cwd=repo_root)
    if rc == 0:
        return True, False, ""
    return False, False, err


def print_gitignore_warning(paths: list[str]) -> None:
    """Explain to the user (and any AI reading the log) what to do.

    CRITICAL: includes the negative example
    ``Do NOT use `git add -f .trellis/``` — agents reading the warning are
    known to invent that command, which fans out to ignored caches/backups.
    """
    print(
        "[WARN] git add failed because .trellis/ paths are ignored by your .gitignore.",
        file=sys.stderr,
    )
    print(
        "[WARN] Skipping auto-commit. The task files were still written to disk;",
        file=sys.stderr,
    )
    print(
        "[WARN] git was not touched.",
        file=sys.stderr,
    )
    print("[WARN]", file=sys.stderr)
    print(
        "[WARN] Trellis manages these specific paths and they should be tracked:",
        file=sys.stderr,
    )
    if paths:
        for p in paths:
            print(f"[WARN]   {p}", file=sys.stderr)
    else:
        print(
            "[WARN]   .trellis/tasks/<task-dir>/",
            file=sys.stderr,
        )
        print(
            "[WARN]   .trellis/tasks/archive/",
            file=sys.stderr,
        )
    print("[WARN]", file=sys.stderr)
    print(
        "[WARN] Recommended: change your .gitignore from `.trellis/` to specific",
        file=sys.stderr,
    )
    print(
        "[WARN] subpaths that should remain ignored, e.g.:",
        file=sys.stderr,
    )
    for sub in TRELLIS_IGNORED_SUBPATHS:
        print(f"[WARN]   {sub}", file=sys.stderr)
    print("[WARN]", file=sys.stderr)
    print(
        "[WARN] Or, if you intentionally keep .trellis/ local-only, set in",
        file=sys.stderr,
    )
    print(
        "[WARN] .trellis/config.yaml:",
        file=sys.stderr,
    )
    print(
        "[WARN]   task_auto_commit: false",
        file=sys.stderr,
    )
    print(
        "[WARN] so the scripts skip git entirely and you can review / commit",
        file=sys.stderr,
    )
    print(
        "[WARN] manually with `git status` / `git add` / `git commit`.",
        file=sys.stderr,
    )
    print("[WARN]", file=sys.stderr)
    print(
        "[WARN] Do NOT use `git add -f .trellis/` — it pulls in backups, worktrees,",
        file=sys.stderr,
    )
    print(
        "[WARN] and runtime caches that should never be committed.",
        file=sys.stderr,
    )
