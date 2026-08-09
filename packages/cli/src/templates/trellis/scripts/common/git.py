"""
Git command execution utility.

Single source of truth for running git commands across all Trellis scripts.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path


# Bounded retry for transient `.git/index.lock` contention. Another process
# (IDE git integration, status daemon, a concurrent Trellis session) can hold
# the lock for a fraction of a second; three attempts spread over ~1.5s ride
# that out without making a genuinely stuck lock hang the command. One sleep
# per retry, so the attempt count follows the backoff tuple.
INDEX_LOCK_RETRY_BACKOFF = (0.5, 1.0)
INDEX_LOCK_RETRY_ATTEMPTS = len(INDEX_LOCK_RETRY_BACKOFF) + 1


def run_git(
    args: list[str],
    cwd: Path | None = None,
    timeout: float | None = None,
) -> tuple[int, str, str]:
    """Run a git command and return (returncode, stdout, stderr).

    Uses UTF-8 encoding with -c i18n.logOutputEncoding=UTF-8 to ensure
    consistent output across all platforms (Windows, macOS, Linux). Callers
    may provide a timeout for best-effort probes; normal Git operations remain
    unbounded by default.
    """
    try:
        git_args = ["git", "-c", "i18n.logOutputEncoding=UTF-8"] + args
        result = subprocess.run(
            git_args,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)


def stderr_indicates_index_lock(stderr: str) -> bool:
    """git failed because another process holds `.git/index.lock`."""
    if not stderr:
        return False
    return "index.lock" in stderr.lower()


def run_git_retry_index_lock(
    args: list[str],
    cwd: Path | None = None,
    timeout: float | None = None,
) -> tuple[int, str, str]:
    """Run a git command, retrying only while `.git/index.lock` is held.

    Any other non-zero exit returns immediately — a retry loop around real
    failures (bad path, nothing to commit, hook rejection) just delays the
    error. Returns the last (returncode, stdout, stderr).
    """
    rc, out, err = run_git(args, cwd=cwd, timeout=timeout)
    attempt = 1
    while (
        rc != 0
        and attempt < INDEX_LOCK_RETRY_ATTEMPTS
        and stderr_indicates_index_lock(err)
    ):
        time.sleep(INDEX_LOCK_RETRY_BACKOFF[attempt - 1])
        attempt += 1
        rc, out, err = run_git(args, cwd=cwd, timeout=timeout)
    return rc, out, err


def index_lock_path(repo_root: Path) -> str:
    """Path of the lock file git is contending on, for diagnostics.

    Asks git so worktrees and `GIT_DIR` setups name the real file rather
    than a `.git/` guess that does not exist there.
    """
    rc, out, _ = run_git(["rev-parse", "--git-path", "index.lock"], cwd=repo_root)
    if rc == 0 and out.strip():
        return out.strip()
    return ".git/index.lock"


def resolve_default_branch(repo_root: Path) -> str | None:
    """Resolve the repository's default branch (origin/HEAD target).

    Tries the local `refs/remotes/origin/HEAD` symbolic ref first (no
    network access), then falls back to `git remote show origin` (which
    may hit the network but also repairs a missing/stale symbolic-ref).
    Returns None when neither resolves, so callers can fall back to their
    own pre-existing behavior.
    """
    rc, out, _ = run_git(["symbolic-ref", "refs/remotes/origin/HEAD"], cwd=repo_root)
    if rc == 0 and out.strip():
        return out.strip().rsplit("/", 1)[-1]

    rc, out, _ = run_git(["remote", "show", "origin"], cwd=repo_root)
    if rc == 0:
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("HEAD branch:"):
                branch = line.split(":", 1)[1].strip()
                if branch and branch != "(unknown)":
                    return branch

    return None


def branch_exists_locally(branch: str, repo_root: Path) -> bool:
    """Check whether a local branch ref exists in the repository."""
    if not branch:
        return False
    rc, _, _ = run_git(
        ["rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=repo_root,
    )
    return rc == 0
