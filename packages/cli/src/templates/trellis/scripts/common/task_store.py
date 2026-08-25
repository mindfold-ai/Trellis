#!/usr/bin/env python3
"""
Task CRUD operations.

Provides:
    ensure_tasks_dir   - Ensure tasks directory exists
    cmd_create         - Create a new task
    cmd_archive        - Archive completed task
    cmd_set_branch     - Set git branch for task
    cmd_set_base_branch - Set PR target branch
    cmd_set_scope      - Set scope for PR title
    cmd_set_meta       - Set/overwrite a task metadata key
    cmd_add_subtask    - Link child task to parent
    cmd_remove_subtask - Unlink child task from parent
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from .config import (
    get_codex_dispatch_mode,
    get_packages,
    get_session_auto_commit,
    is_monorepo,
    resolve_package,
    validate_package,
)
from .git import (
    INDEX_LOCK_RETRY_ATTEMPTS,
    branch_exists_locally,
    index_lock_path,
    resolve_default_branch,
    run_git,
    run_git_retry_index_lock,
    stderr_indicates_index_lock,
)
from .io import describe_json_read_failure, read_json_checked, write_json
from .log import Colors, colored
from .paths import (
    DIR_ARCHIVE,
    DIR_TASKS,
    DIR_WORKFLOW,
    FILE_TASK_JSON,
    generate_task_date_prefix,
    get_developer,
    get_repo_root,
    get_tasks_dir,
)
from .safe_commit import (
    print_gitignore_warning,
    safe_archive_paths_to_add,
    safe_git_add,
)
from .task_utils import (
    archive_destination_for,
    archive_task_complete,
    find_task_by_name,
    is_within_tasks_dir,
    resolve_task_dir,
    run_task_hooks,
)


# =============================================================================
# Helper Functions
# =============================================================================

# Characters stripped before deciding whether a title / description is empty.
# This is deliberately the *union* of Python's str.strip() default set and
# ECMAScript's String.trim() set, because the two disagree: Python strips
# U+0085 (NEL) and U+001C-U+001F, which JS keeps; JS strips U+FEFF (BOM),
# which Python keeps. Stripping the union means anything create accepts is
# still non-empty after either side trims it, so a record cannot pass here and
# then be refused as empty by a JS pre-archive validator.
BLANK_CHARS = (
    "\t\n\v\f\r"                              # U+0009-U+000D
    "\x1c\x1d\x1e\x1f"                        # U+001C-U+001F separators (Python only)
    " "                                       # U+0020 space
    "\x85"                                    # U+0085 next line (Python only)
    "\xa0"                                    # U+00A0 no-break space
    "\u1680"                                  # ogham space mark
    "\u2000\u2001\u2002\u2003\u2004\u2005"    # en/em quad, en/em/three/four-per-em
    "\u2006\u2007\u2008\u2009\u200a"          # six-per-em .. hair space
    "\u2028\u2029"                            # line / paragraph separator
    "\u202f\u205f\u3000"                      # narrow nbsp, math space, ideographic space
    "\ufeff"                                  # zero-width no-break space / BOM (JS only)
)


def strip_blank(value: str | None) -> str:
    """Return ``value`` with :data:`BLANK_CHARS` trimmed from both ends."""
    return (value or "").strip(BLANK_CHARS)


def _slugify(title: str) -> str:
    """Convert title to slug (only works with ASCII)."""
    result = title.lower()
    result = re.sub(r"[^a-z0-9]", "-", result)
    result = re.sub(r"-+", "-", result)
    result = result.strip("-")
    return result


def ensure_tasks_dir(repo_root: Path) -> Path:
    """Ensure tasks directory exists."""
    tasks_dir = get_tasks_dir(repo_root)
    archive_dir = tasks_dir / "archive"

    if not tasks_dir.exists():
        tasks_dir.mkdir(parents=True)
        print(colored(f"Created tasks directory: {tasks_dir}", Colors.GREEN), file=sys.stderr)

    if not archive_dir.exists():
        archive_dir.mkdir(parents=True)

    return tasks_dir


def _find_archived_task_by_dir_name(tasks_dir: Path, dir_name: str) -> Path | None:
    """Find an archived task directory with the exact active-task dir name."""
    archive_dir = tasks_dir / DIR_ARCHIVE
    if not archive_dir.is_dir():
        return None

    for month_dir in sorted(archive_dir.iterdir()):
        if not month_dir.is_dir():
            continue
        candidate = month_dir / dir_name
        if candidate.is_dir():
            return candidate

    return None


def _repo_relative_path(path: Path, repo_root: Path) -> str:
    """Format a path relative to the repo root when possible."""
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return str(path)


def _report_read_failure(path: Path, reason: str | None) -> None:
    """Print why a JSON file could not be loaded, and what to do about it.

    These commands are about to rewrite the file they just failed to read, so
    this message is the last warning the user gets. Exiting non-zero with no
    output at all leaves a parse error, a permissions error and an empty file
    indistinguishable.
    """
    problem, hint = describe_json_read_failure(path, reason)
    print(colored(f"Error: {problem}", Colors.RED), file=sys.stderr)
    print(hint, file=sys.stderr)


def _ensure_children_list(data: dict) -> list:
    """The task's `children` as a list, repaired in place if it is not one.

    `.get(key, default)` returns the default only when the key is *absent*. A
    task.json carrying `"children": null` — older format, or hand-edited —
    yields None, and every caller below goes on to use the result as a list.
    In `cmd_create` that raise lands *after* the new task.json is written,
    leaving a task on disk its parent does not reference.

    The repair is written into `data` rather than only returned, because the
    unlink path removes a name it may not find and would otherwise persist the
    malformed value untouched — no crash, but the next caller inherits it.

    Anything that is not a list is discarded rather than coerced: a string
    would iterate per character and a dict per key, each producing a plausible
    child set that is not one.
    """
    children = data.get("children")
    if not isinstance(children, list):
        children = []
        data["children"] = children
    return children


def _report_write_failure(path: Path) -> None:
    """Print that a JSON write failed. Writes are atomic, so nothing changed."""
    print(colored(f"Error: Failed to write {path}", Colors.RED), file=sys.stderr)
    print(
        "The existing file is unchanged (writes are atomic). "
        "Check permissions and free disk space, then retry.",
        file=sys.stderr,
    )


# =============================================================================
# Sub-agent platform detection + JSONL seeding
# =============================================================================

# Config directories of platforms that consume implement.jsonl / check.jsonl.
# Keep in sync with src/types/ai-tools.ts AI_TOOLS entries — these are the
# platforms listed in workflow.md's "agent-capable" Skill Routing block.
# Codex is checked separately because explicit inline mode does not consume
# JSONL. Kilo / Antigravity / Devin are NOT in this list either: they load
# specs through skills instead of JSONL.
_SUBAGENT_CONFIG_DIRS: tuple[str, ...] = (
    ".claude",
    ".cursor",
    ".kiro",
    ".gemini",
    ".opencode",
    ".qoder",
    ".codebuddy",
    ".factory",   # Factory Droid
    ".github/copilot",
    ".pi",        # Pi Agent
    ".trae",      # Trae IDE
    ".omp",       # Oh My Pi
    ".zcode",     # ZCode
    ".grok",      # Grok Build
    ".kimi-code", # Kimi Code
)
_CODEX_CONFIG_DIR = ".codex"

_SEED_EXAMPLE = (
    "Fill with {\"file\": \"<path>\", \"reason\": \"<why>\"}. "
    "Put spec/research files only — no code paths. "
    "Run `python3 .trellis/scripts/get_context.py --mode packages` to list available specs. "
    "Delete this line once real entries are added."
)


def _has_subagent_platform(repo_root: Path) -> bool:
    """Return True if any sub-agent-capable platform is configured.

    Detected by probing well-known config directories at the repo root. Codex
    counts by default through ``codex.dispatch_mode: auto`` (including the
    legacy ``sub-agent`` alias); explicit inline mode loads context through
    skills, not JSONL.
    """
    for config_dir in _SUBAGENT_CONFIG_DIRS:
        if (repo_root / config_dir).is_dir():
            return True
    if (repo_root / _CODEX_CONFIG_DIR).is_dir():
        return get_codex_dispatch_mode(repo_root) == "auto"
    return False


def _write_seed_jsonl(path: Path) -> None:
    """Write a one-line seed JSONL file with a self-describing ``_example``.

    The seed row has no ``file`` field, so downstream consumers (hooks +
    preludes) that iterate entries via ``item.get("file")`` naturally skip
    it. The row exists purely as an in-file prompt for the AI curator.
    """
    seed = {"_example": _SEED_EXAMPLE}
    path.write_text(json.dumps(seed, ensure_ascii=False) + "\n", encoding="utf-8")


def _parse_meta_pairs(pairs: list[str] | None) -> dict[str, str] | None:
    """Parse repeatable ``--meta key=value`` pairs into a dict.

    Returns ``None`` (after printing an error naming the bad value) on the
    first malformed pair: missing ``=`` or an empty key. Values are stored
    as-is (strings, no nesting, no type coercion).
    """
    meta: dict[str, str] = {}
    for pair in pairs or []:
        key, sep, value = pair.partition("=")
        if not sep or not key:
            print(
                colored(f"Error: malformed --meta value '{pair}' (expected key=value)", Colors.RED),
                file=sys.stderr,
            )
            return None
        meta[key] = value
    return meta


def _default_prd_content(title: str, description: str | None = None) -> str:
    """Return the default PRD skeleton created with every task."""
    goal = (description or "").strip() or "TBD."
    heading = title.strip() or "Untitled task"
    return f"""# {heading}

## Goal

{goal}

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
"""


# =============================================================================
# Command: create
# =============================================================================

def cmd_create(args: argparse.Namespace) -> int:
    """Create a new task."""
    repo_root = get_repo_root()

    # Title and description are checked first, before ensure_tasks_dir and any
    # other write, so a rejected create leaves the tree untouched. Both are
    # required non-empty by pre-archive validation; catching that here costs
    # one retyped command instead of blocking a PR hours later.
    if not strip_blank(args.title):
        print(colored("Error: title is required", Colors.RED), file=sys.stderr)
        print(
            'Pass a non-empty <title> (whitespace only does not count): a task '
            "with an empty title is refused at archive.",
            file=sys.stderr,
        )
        return 1

    description = strip_blank(getattr(args, "description", None))
    if not description:
        print(colored("Error: --description is required", Colors.RED), file=sys.stderr)
        print(
            'Pass --description "<what this task delivers>" (whitespace only does '
            "not count): a task with an empty description is refused at archive.",
            file=sys.stderr,
        )
        return 1

    # Validate --meta (CLI source: fail-fast, before any directory is created)
    meta = _parse_meta_pairs(getattr(args, "meta", None))
    if meta is None:
        return 1

    # Validate --package (CLI source: fail-fast)
    package: str | None = getattr(args, "package", None)
    if not is_monorepo(repo_root):
        # Single-repo: ignore --package, no package prefix
        if package:
            print(colored(f"Warning: --package ignored in single-repo project", Colors.YELLOW), file=sys.stderr)
        package = None
    elif package:
        if not validate_package(package, repo_root):
            packages = get_packages(repo_root)
            available = ", ".join(sorted(packages.keys())) if packages else "(none)"
            print(colored(f"Error: unknown package '{package}'. Available: {available}", Colors.RED), file=sys.stderr)
            return 1
    else:
        # Inferred: default_package → None (no task.json yet for create)
        package = resolve_package(repo_root=repo_root)

    # Default assignee to current developer
    assignee = args.assignee
    if not assignee:
        assignee = get_developer(repo_root)
        if not assignee:
            print(colored("Error: No developer set. Run init_developer.py first or use --assignee", Colors.RED), file=sys.stderr)
            return 1

    ensure_tasks_dir(repo_root)

    # Get current developer as creator
    creator = get_developer(repo_root) or assignee

    # Generate slug if not provided. A title-derived slug is sanitized by
    # _slugify; an explicit --slug is not, so reject the characters that would
    # let it escape the tasks directory once joined into the dir name.
    slug = args.slug or _slugify(args.title)
    if not slug:
        print(colored("Error: could not generate slug from title", Colors.RED), file=sys.stderr)
        return 1

    if args.slug and ("/" in slug or "\\" in slug or ".." in slug):
        print(
            colored(
                f"Error: --slug must be a plain name without path separators or '..': {slug}",
                Colors.RED,
            ),
            file=sys.stderr,
        )
        return 1

    # Create task directory with MM-DD-slug format
    tasks_dir = get_tasks_dir(repo_root)
    date_prefix = generate_task_date_prefix()

    # Guard against date-prefixed --slug (e.g. a full task dir name pasted in),
    # which would otherwise produce MM-DD-MM-DD-slug (issue #377). Only an
    # explicit --slug is guarded; title-derived slugs are left untouched.
    if args.slug:
        m = re.match(r"^(\d{2})-(\d{2})-(.+)$", slug)
        if m and 1 <= int(m.group(1)) <= 12 and 1 <= int(m.group(2)) <= 31:
            slug_prefix = f"{m.group(1)}-{m.group(2)}"
            if slug_prefix == date_prefix:
                slug = m.group(3)
                print(
                    colored(
                        f'warning: --slug should not include the MM-DD prefix; normalized to "{slug}"',
                        Colors.YELLOW,
                    ),
                    file=sys.stderr,
                )
            else:
                print(
                    colored(
                        f"Error: --slug starts with a date prefix ({slug_prefix}-), but task.py create always uses today's date ({date_prefix}).",
                        Colors.RED,
                    ),
                    file=sys.stderr,
                )
                print(f"Pass only the slug body, e.g. --slug {m.group(3)}", file=sys.stderr)
                return 1

    # Resolve --parent before anything is created. An explicit --parent that
    # cannot be linked is a failed request, not a warning: creating the task
    # anyway leaves a half-specified relationship that reads as success.
    parent_dir: Path | None = None
    parent_data: dict | None = None
    if args.parent:
        parent_dir = resolve_task_dir(args.parent, repo_root)
        if parent_dir is None:
            print(colored(f"Error: Parent task not resolved: {args.parent}", Colors.RED), file=sys.stderr)
            print("No task was created. Pass an existing task directory to --parent.", file=sys.stderr)
            return 1
        parent_json_path = parent_dir / FILE_TASK_JSON
        if not parent_json_path.is_file():
            print(colored(f"Error: Parent task.json not found: {args.parent}", Colors.RED), file=sys.stderr)
            print("No task was created. Pass an existing task directory to --parent.", file=sys.stderr)
            return 1
        parent_data, parent_reason = read_json_checked(parent_json_path)
        if parent_data is None:
            _report_read_failure(parent_json_path, parent_reason)
            print("No task was created. Fix the parent task.json, then retry.", file=sys.stderr)
            return 1

    dir_name = f"{date_prefix}-{slug}"
    task_dir = tasks_dir / dir_name
    task_json_path = task_dir / FILE_TASK_JSON

    archived_task_dir = _find_archived_task_by_dir_name(tasks_dir, dir_name)
    if archived_task_dir:
        print(colored(f"Error: Task already archived: {dir_name}", Colors.RED), file=sys.stderr)
        print(f"Archived at: {_repo_relative_path(archived_task_dir, repo_root)}", file=sys.stderr)
        print("Use a new slug if you intend to create a new task.", file=sys.stderr)
        return 1

    # Reusing a slug on the same day is an ordinary accident, and continuing
    # would rewrite the existing task.json below — resetting status, children,
    # parent, branch and meta, which nothing else can reconstruct. Fail like
    # the archived-name collision above unless the caller asks for it.
    if task_dir.exists():
        if not getattr(args, "force", False):
            print(colored(f"Error: Task already exists: {dir_name}", Colors.RED), file=sys.stderr)
            print(f"Existing task at: {_repo_relative_path(task_dir, repo_root)}", file=sys.stderr)
            print(
                "Use a different --slug, or pass --force to overwrite its task.json.",
                file=sys.stderr,
            )
            return 1
        print(
            colored(
                f"Warning: --force: overwriting task.json in existing task: {dir_name}",
                Colors.YELLOW,
            ),
            file=sys.stderr,
        )
        created_dir = False
    else:
        task_dir.mkdir(parents=True)
        created_dir = True

    today = datetime.now().strftime("%Y-%m-%d")

    # Record the PR target branch. Prefer the repo's actual default branch
    # (origin/HEAD) so creating a task from a feature branch doesn't
    # mis-stamp that feature branch as the PR target (#399 item 1). Falls
    # back to the checked-out branch when the default can't be resolved
    # (no remote configured, offline, etc.) — the pre-existing behavior.
    # --base-branch lets the caller override both when neither is correct.
    _, branch_out, _ = run_git(["branch", "--show-current"], cwd=repo_root)
    current_branch = branch_out.strip() or "main"
    explicit_base_branch: str | None = getattr(args, "base_branch", None)
    if explicit_base_branch:
        base_branch = explicit_base_branch
    else:
        resolved_base_branch = resolve_default_branch(repo_root)
        if resolved_base_branch:
            base_branch = resolved_base_branch
        else:
            base_branch = current_branch
            print(
                colored(
                    f"warning: could not resolve the repository's default branch "
                    f"(no remote configured, offline, etc.); stamping base_branch as "
                    f"the checked-out branch '{base_branch}'. Pass --base-branch to override.",
                    Colors.YELLOW,
                ),
                file=sys.stderr,
            )

    task_data = {
        "id": slug,
        "name": slug,
        "title": args.title,
        "description": description,
        "status": "planning",
        "dev_type": None,
        "scope": None,
        "package": package,
        "priority": args.priority,
        "creator": creator,
        "assignee": assignee,
        "createdAt": today,
        "completedAt": None,
        "branch": None,
        "base_branch": base_branch,
        "worktree_path": None,
        "commit": None,
        "pr_url": None,
        "subtasks": [],
        "children": [],
        "parent": None,
        "relatedFiles": [],
        "notes": "",
        "meta": meta,
    }

    # A directory without task.json is not a task: `list` hides it and every
    # lifecycle command refuses it. Fail here rather than printing "Created
    # task" and emitting the path for script chaining.
    if not write_json(task_json_path, task_data):
        _report_write_failure(task_json_path)
        print(colored(f"No task was created: {dir_name}", Colors.RED), file=sys.stderr)
        if created_dir:
            try:
                task_dir.rmdir()
            except OSError:
                print(
                    f"Leftover empty directory: {_repo_relative_path(task_dir, repo_root)}",
                    file=sys.stderr,
                )
        return 1

    prd_path = task_dir / "prd.md"
    if not prd_path.exists():
        prd_path.write_text(
            _default_prd_content(args.title, description),
            encoding="utf-8",
        )

    # Seed implement.jsonl / check.jsonl for sub-agent-capable platforms.
    # Agent curates real entries during planning when the task needs them.
    # Agent-less platforms (Kilo / Antigravity / Devin) skip this — they
    # load specs via the trellis-before-dev skill instead of JSONL.
    seeded_jsonl = False
    if _has_subagent_platform(repo_root):
        for jsonl_name in ("implement.jsonl", "check.jsonl"):
            jsonl_path = task_dir / jsonl_name
            if not jsonl_path.exists():
                _write_seed_jsonl(jsonl_path)
        seeded_jsonl = True

    # Establish the bidirectional link. Both sides were validated above, so a
    # failure here is a write failure, not a bad argument.
    if parent_dir is not None and parent_data is not None:
        parent_json_path = parent_dir / FILE_TASK_JSON

        # Add child to parent's children list
        parent_children = _ensure_children_list(parent_data)
        if dir_name not in parent_children:
            parent_children.append(dir_name)
            parent_data["children"] = parent_children
            if not write_json(parent_json_path, parent_data):
                _report_write_failure(parent_json_path)
                print(
                    f"The task exists at {_repo_relative_path(task_dir, repo_root)} but is NOT "
                    f"linked to {parent_dir.name}. Re-link with: task.py add-subtask "
                    f"{parent_dir.name} {dir_name}",
                    file=sys.stderr,
                )
                return 1

        # Set parent in child's task.json
        task_data["parent"] = parent_dir.name
        if not write_json(task_json_path, task_data):
            _report_write_failure(task_json_path)
            print(
                f"Link is half-written: {parent_dir.name} now lists '{dir_name}' as a child, "
                f"but the new task does not record its parent.",
                file=sys.stderr,
            )
            return 1

        print(colored(f"Linked as child of: {parent_dir.name}", Colors.GREEN), file=sys.stderr)

    # Auto-activate the new task so the per-turn breadcrumb fires planning
    # state. Best-effort: gracefully degrade if no session identity (CLI run
    # outside an AI session) — the task is still created, the user can run
    # task.py start later. Pointer is session-scoped so this never affects
    # other AI sessions.
    if getattr(args, "no_start", False):
        print(
            colored(
                "Skipped session activation (--no-start); run task.py start when ready.",
                Colors.YELLOW,
            ),
            file=sys.stderr,
        )
    else:
        try:
            from .active_task import resolve_context_key, set_active_task
        except Exception as exc:
            print(
                colored(f"Warning: session activation unavailable (import failed: {exc})", Colors.YELLOW),
                file=sys.stderr,
            )
        else:
            try:
                context_key = resolve_context_key()
            except Exception as exc:
                print(
                    colored(f"Warning: session activation failed (context resolution: {exc})", Colors.YELLOW),
                    file=sys.stderr,
                )
            else:
                # No session identity is the normal CLI-outside-an-AI-session
                # case (see comment above) — stay silent, not a failure.
                if context_key:
                    try:
                        rel_dir = task_dir.relative_to(repo_root).as_posix()
                    except ValueError:
                        rel_dir = str(task_dir)
                    try:
                        active = set_active_task(rel_dir, repo_root)
                    except Exception as exc:
                        print(
                            colored(f"Warning: session activation failed (pointer persistence: {exc})", Colors.YELLOW),
                            file=sys.stderr,
                        )
                    else:
                        if active:
                            print(
                                colored(f"Activated task for this session: {active.task_path}", Colors.GREEN),
                                file=sys.stderr,
                            )
                            print(f"Source: {active.source}", file=sys.stderr)
                        else:
                            print(
                                colored("Warning: session activation failed (no pointer returned)", Colors.YELLOW),
                                file=sys.stderr,
                            )

    print(colored(f"Created task: {dir_name}", Colors.GREEN), file=sys.stderr)
    print("", file=sys.stderr)
    print(colored("Next steps:", Colors.BLUE), file=sys.stderr)
    print("  - Fill prd.md with requirements and acceptance criteria", file=sys.stderr)
    print("  - Lightweight task: PRD-only is valid", file=sys.stderr)
    print("  - Complex task: add design.md and implement.md before task.py start", file=sys.stderr)
    if seeded_jsonl:
        print(
            "  - Curate implement.jsonl / check.jsonl as spec/research manifests when sub-agents need context",
            file=sys.stderr,
        )
    print("  - Use /trellis:continue or phase context to decide the next step", file=sys.stderr)
    print("", file=sys.stderr)

    # Output relative path for script chaining
    print(f"{DIR_WORKFLOW}/{DIR_TASKS}/{dir_name}")

    run_task_hooks("after_create", task_json_path, repo_root)
    return 0


# =============================================================================
# Command: archive
# =============================================================================

def cmd_archive(args: argparse.Namespace) -> int:
    """Archive completed task."""
    repo_root = get_repo_root()
    task_name = args.name

    if not task_name:
        print(colored("Error: Task name is required", Colors.RED), file=sys.stderr)
        return 1

    tasks_dir = get_tasks_dir(repo_root)

    # Resolve task directory (supports task name, relative path, or absolute path)
    task_dir = resolve_task_dir(task_name, repo_root)

    if task_dir is None or not task_dir.is_dir():
        if task_dir is None:
            # resolve_task_dir already reported why; keep the archive-specific
            # refusal so it reads the same as the is_within_tasks_dir guard.
            print(colored(
                f"Error: refusing to archive '{task_name}': "
                f"it does not resolve to a task under {tasks_dir}",
                Colors.RED), file=sys.stderr)
        else:
            print(colored(f"Error: Task not found: {task_name}", Colors.RED), file=sys.stderr)
        print("Active tasks:", file=sys.stderr)
        # Import lazily to avoid circular dependency
        from .tasks import iter_active_tasks
        for t in iter_active_tasks(tasks_dir):
            print(f"  - {t.dir_name}/", file=sys.stderr)
        return 1

    # Refuse to archive anything that isn't a real task directly under
    # .trellis/tasks/. resolve_task_dir keeps the target inside the tasks dir;
    # this narrows it further to a direct child, so an already-archived task
    # (.trellis/tasks/archive/<month>/<task>) is not archived a second time.
    if not is_within_tasks_dir(task_dir, repo_root):
        print(colored(
            f"Error: refusing to archive '{task_name}': "
            f"{task_dir} is not a task under {tasks_dir}",
            Colors.RED), file=sys.stderr)
        return 1

    # Check the destination before anything below mutates task state. The
    # mover refuses a collision too, but by then this command has already
    # marked the task completed, re-parented its children and cleared the
    # sessions pointing at it — all of which would have to be undone by hand.
    archive_dest_check = archive_destination_for(task_dir)
    if archive_dest_check.exists():
        print(colored(
            f"Error: refusing to archive '{task_name}': "
            f"archive destination already exists: "
            f"{_repo_relative_path(archive_dest_check, repo_root)}",
            Colors.RED), file=sys.stderr)
        print(f"Task remains at: {_repo_relative_path(task_dir, repo_root)}", file=sys.stderr)
        print("Move or rename the existing archived task, then retry.", file=sys.stderr)
        return 1

    dir_name = task_dir.name
    task_json_path = task_dir / FILE_TASK_JSON

    # Update status before archiving
    today = datetime.now().strftime("%Y-%m-%d")
    # Names of child task dirs whose task.json gets modified below; passed
    # into safe_archive_paths_to_add so they're staged in this commit.
    modified_children: list[str] = []
    if task_json_path.is_file():
        data, read_reason = read_json_checked(task_json_path)
        if data is None:
            # Archiving is still the right outcome for a task whose task.json
            # is broken — but say so, or the missing "completed" status looks
            # like the archive silently did half its job.
            problem, _ = describe_json_read_failure(task_json_path, read_reason)
            print(
                colored(
                    f"Warning: {problem}; archiving without updating status/children.",
                    Colors.YELLOW,
                ),
                file=sys.stderr,
            )
        else:
            # Warn (don't block) when the recorded branch is stale — it was
            # likely already merged and deleted (#399 item 2).
            stored_branch = data.get("branch")
            if stored_branch and not branch_exists_locally(stored_branch, repo_root):
                print(
                    colored(
                        f"Warning: recorded branch '{stored_branch}' no longer exists locally "
                        "(likely merged and deleted).",
                        Colors.YELLOW,
                    ),
                    file=sys.stderr,
                )

            data["status"] = "completed"
            data["completedAt"] = today
            if not write_json(task_json_path, data):
                _report_write_failure(task_json_path)
                print(
                    f"Not archived: {_repo_relative_path(task_dir, repo_root)} is unchanged. "
                    "Archiving a task still marked in progress would hide it from `list` "
                    "with the wrong status.",
                    file=sys.stderr,
                )
                return 1

            # Handle subtask relationships on archive.
            # Keep this task in its parent's children list so progress
            # counters (children_progress) stay consistent — children
            # missing from the active set are treated as completed.
            task_children = data.get("children", [])

            # If this is a parent, clear parent field in all children
            if task_children:
                for child_name in task_children:
                    child_dir_path = find_task_by_name(child_name, tasks_dir)
                    if child_dir_path:
                        child_json = child_dir_path / FILE_TASK_JSON
                        if child_json.is_file():
                            child_data, child_reason = read_json_checked(child_json)
                            if child_data is None:
                                problem, _ = describe_json_read_failure(child_json, child_reason)
                                print(
                                    colored(
                                        f"Warning: {problem}; child '{child_dir_path.name}' "
                                        "keeps its parent reference.",
                                        Colors.YELLOW,
                                    ),
                                    file=sys.stderr,
                                )
                                continue
                            child_data["parent"] = None
                            if not write_json(child_json, child_data):
                                # Stop before the move: a child pointing at a
                                # parent that has left .trellis/tasks/ is a
                                # dangling reference nothing repairs later.
                                # Retrying is safe — every step so far is
                                # idempotent.
                                _report_write_failure(child_json)
                                print(
                                    f"Not archived: {_repo_relative_path(task_dir, repo_root)} is "
                                    f"marked completed but stays in place because child "
                                    f"'{child_dir_path.name}' could not be unlinked. "
                                    "Fix the child, then run archive again.",
                                    file=sys.stderr,
                                )
                                return 1
                            modified_children.append(child_dir_path.name)

    # Clear any session that still points at this task before the path moves.
    from .active_task import clear_task_from_sessions
    clear_task_from_sessions(str(task_dir), repo_root)

    # Archive
    result = archive_task_complete(task_dir, repo_root)
    if "archived_to" in result:
        archive_dest = Path(result["archived_to"])
        year_month = archive_dest.parent.name
        print(colored(f"Archived: {dir_name} -> archive/{year_month}/", Colors.GREEN), file=sys.stderr)

        # Auto-commit unless --no-commit
        if not getattr(args, "no_commit", False):
            if not _auto_commit_archive(dir_name, repo_root, modified_children):
                print(
                    colored(
                        "Archive moved on disk, but git auto-commit did not complete. "
                        "Resolve `git status` before continuing.",
                        Colors.RED,
                    ),
                    file=sys.stderr,
                )
                return 1

        # Return the archive path
        print(f"{DIR_WORKFLOW}/{DIR_TASKS}/{DIR_ARCHIVE}/{year_month}/{dir_name}")

        # Run hooks with the archived path
        archived_json = archive_dest / FILE_TASK_JSON
        run_task_hooks("after_archive", archived_json, repo_root)
        return 0

    return 1


def _auto_commit_archive(
    task_name: str,
    repo_root: Path,
    modified_children: list[str] | None = None,
) -> bool:
    """Stage Trellis-owned task paths and commit after archive.

    Scoped narrowly to the archived task's source + destination paths
    plus any child task dirs whose ``task.json`` was edited (parent →
    children relationship update). Dirty changes in OTHER active task
    dirs are NOT bundled into the archive commit.

    If ``.gitignore`` blocks the paths, we warn + skip — we do NOT
    retry with ``git add -f``. The warning explicitly forbids
    ``git add -f .trellis/`` (which would fan out to caches/backups)
    and points users at ``session_auto_commit: false``.

    Honors ``session_auto_commit`` in ``.trellis/config.yaml``: when
    set to ``false``, this function returns immediately without
    touching git (the archive directory move on disk is unaffected).
    """
    if not get_session_auto_commit(repo_root):
        print(
            "[OK] session_auto_commit: false — skipping git stage/commit.",
            file=sys.stderr,
        )
        return True

    source_rel = f"{DIR_WORKFLOW}/{DIR_TASKS}/{task_name}"
    rc, tracked_out, _ = run_git(
        ["ls-files", "--", source_rel],
        cwd=repo_root,
    )
    source_was_tracked = rc == 0 and bool(tracked_out.strip())

    paths = safe_archive_paths_to_add(
        repo_root, task_name=task_name, modified_children=modified_children
    )
    if not paths:
        print("[OK] No task changes to commit.", file=sys.stderr)
        return True

    success, _, err = safe_git_add(paths, repo_root, retry_on_index_lock=True)
    if not success:
        if err and "ignored by" in err.lower():
            print_gitignore_warning(paths)
        elif stderr_indicates_index_lock(err):
            _print_index_lock_warning(
                "git add", task_name, repo_root, [*paths, source_rel]
            )
        else:
            print(
                f"[WARN] git add failed: {err.strip() if err else 'unknown error'}",
                file=sys.stderr,
            )
        return not source_was_tracked

    # Belt-and-suspenders for the phantom-delete bug: `safe_git_add` uses
    # `git add` (no -A) which only stages additions/modifications. The
    # source task directory was moved away by `shutil.move`, so its files
    # need an explicit `git rm --cached` to stage the deletions in this
    # same commit — otherwise they sit as uncommitted "phantom deletes"
    # against HEAD until something later picks them up.
    #
    # `--ignore-unmatch` makes this a no-op when the task was never tracked
    # (e.g. archiving a task that lived only in working tree).
    rc, _, err = run_git_retry_index_lock(
        ["rm", "-r", "--cached", "--ignore-unmatch", "--", source_rel],
        cwd=repo_root,
    )
    if rc != 0 and stderr_indicates_index_lock(err):
        # Committing now would record the archived copy without the
        # source-side deletes — a half-archived tree in history.
        _print_index_lock_warning(
            "git rm --cached", task_name, repo_root, [*paths, source_rel]
        )
        return not source_was_tracked

    rc, _, _ = run_git(
        ["diff", "--cached", "--quiet", "--", *paths, source_rel],
        cwd=repo_root,
    )
    if rc == 0:
        print("[OK] No task changes to commit.", file=sys.stderr)
        return True

    commit_msg = f"chore(task): archive {task_name}"
    rc, _, err = run_git_retry_index_lock(["commit", "-m", commit_msg], cwd=repo_root)
    if rc == 0:
        print(f"[OK] Auto-committed: {commit_msg}", file=sys.stderr)
        return True
    elif stderr_indicates_index_lock(err):
        _print_index_lock_warning(
            "git commit", task_name, repo_root, [*paths, source_rel]
        )
        return not source_was_tracked
    else:
        print(f"[WARN] Auto-commit failed: {err.strip()}", file=sys.stderr)
        return not source_was_tracked


def _print_index_lock_warning(
    action: str, task_name: str, repo_root: Path, paths: list[str]
) -> None:
    """Report an archive auto-commit that gave up on a held index.lock.

    The move itself already succeeded, so the state is consistent — the task
    lives in archive/ and its changes are staged-or-not but never half of
    both in a commit. Only the commit is outstanding, which the user (or an
    agent reading the log) has to finish by hand.

    ``paths`` are the paths the auto-commit would have staged, so the manual
    command keeps the same narrow scope — a blanket ``git add -A -- .trellis/``
    would sweep dirty changes from other active tasks into the archive commit.
    """
    lock = index_lock_path(repo_root)
    print(
        f"[WARN] {action} gave up after {INDEX_LOCK_RETRY_ATTEMPTS} attempts: "
        f"another process is holding {lock}",
        file=sys.stderr,
    )
    print(
        "[WARN] The task was moved into archive/ on disk; only the commit is pending.",
        file=sys.stderr,
    )
    print(
        "[WARN] Close whatever holds the lock (an IDE git integration, a status",
        file=sys.stderr,
    )
    print(
        f"[WARN] daemon, another session), or delete {lock} if it is stale, then",
        file=sys.stderr,
    )
    print(
        f'[WARN] commit manually: git add -A -- {" ".join(paths)} && '
        f'git commit -m "chore(task): archive {task_name}"',
        file=sys.stderr,
    )


# =============================================================================
# Command: add-subtask
# =============================================================================

def cmd_add_subtask(args: argparse.Namespace) -> int:
    """Link a child task to a parent task."""
    repo_root = get_repo_root()

    parent_dir = resolve_task_dir(args.parent_dir, repo_root)
    child_dir = resolve_task_dir(args.child_dir, repo_root)
    if parent_dir is None or child_dir is None:
        return 1

    if not parent_dir:
        print(colored(f"Error: Parent task.json not found: {args.parent_dir}", Colors.RED), file=sys.stderr)
        return 1

    if not child_dir:
        print(colored(f"Error: Child task.json not found: {args.child_dir}", Colors.RED), file=sys.stderr)
        return 1

    parent_json_path = parent_dir / FILE_TASK_JSON
    child_json_path = child_dir / FILE_TASK_JSON

    if not parent_json_path.is_file():
        print(colored(f"Error: Parent task.json not found: {args.parent_dir}", Colors.RED), file=sys.stderr)
        return 1

    if not child_json_path.is_file():
        print(colored(f"Error: Child task.json not found: {args.child_dir}", Colors.RED), file=sys.stderr)
        return 1

    parent_data, parent_reason = read_json_checked(parent_json_path)
    if parent_data is None:
        _report_read_failure(parent_json_path, parent_reason)
        return 1
    child_data, child_reason = read_json_checked(child_json_path)
    if child_data is None:
        _report_read_failure(child_json_path, child_reason)
        return 1

    # Check if child already has a parent
    existing_parent = child_data.get("parent")
    if existing_parent:
        print(colored(f"Error: Child task already has a parent: {existing_parent}", Colors.RED), file=sys.stderr)
        return 1

    # Add child to parent's children list
    parent_children = _ensure_children_list(parent_data)
    child_dir_name = child_dir.name
    if child_dir_name not in parent_children:
        parent_children.append(child_dir_name)
        parent_data["children"] = parent_children

    # Set parent in child's task.json
    child_data["parent"] = parent_dir.name

    # Write both. A link is two files; if the second write fails silently the
    # two sides disagree with no error, so check each and name the side that
    # did land so the user knows what to undo.
    if not write_json(parent_json_path, parent_data):
        print(colored(f"Error: Failed to write parent task.json: {parent_json_path}", Colors.RED), file=sys.stderr)
        print("No link was written.", file=sys.stderr)
        return 1
    if not write_json(child_json_path, child_data):
        print(colored(f"Error: Failed to write child task.json: {child_json_path}", Colors.RED), file=sys.stderr)
        print(
            f"Link is half-written: {parent_json_path} now lists "
            f"'{child_dir.name}' as a child, but the child does not record the parent.",
            file=sys.stderr,
        )
        return 1

    print(colored(f"Linked: {child_dir.name} -> {parent_dir.name}", Colors.GREEN), file=sys.stderr)
    return 0


# =============================================================================
# Command: remove-subtask
# =============================================================================

def cmd_remove_subtask(args: argparse.Namespace) -> int:
    """Unlink a child task from a parent task."""
    repo_root = get_repo_root()

    parent_dir = resolve_task_dir(args.parent_dir, repo_root)
    child_dir = resolve_task_dir(args.child_dir, repo_root)
    if parent_dir is None or child_dir is None:
        return 1

    if not parent_dir:
        print(colored(f"Error: Parent task.json not found: {args.parent_dir}", Colors.RED), file=sys.stderr)
        return 1

    if not child_dir:
        print(colored(f"Error: Child task.json not found: {args.child_dir}", Colors.RED), file=sys.stderr)
        return 1

    parent_json_path = parent_dir / FILE_TASK_JSON
    child_json_path = child_dir / FILE_TASK_JSON

    if not parent_json_path.is_file():
        print(colored(f"Error: Parent task.json not found: {args.parent_dir}", Colors.RED), file=sys.stderr)
        return 1

    if not child_json_path.is_file():
        print(colored(f"Error: Child task.json not found: {args.child_dir}", Colors.RED), file=sys.stderr)
        return 1

    parent_data, parent_reason = read_json_checked(parent_json_path)
    if parent_data is None:
        _report_read_failure(parent_json_path, parent_reason)
        return 1
    child_data, child_reason = read_json_checked(child_json_path)
    if child_data is None:
        _report_read_failure(child_json_path, child_reason)
        return 1

    # Remove child from parent's children list
    parent_children = _ensure_children_list(parent_data)
    child_dir_name = child_dir.name
    if child_dir_name in parent_children:
        parent_children.remove(child_dir_name)
        parent_data["children"] = parent_children

    # Clear parent in child's task.json
    child_data["parent"] = None

    # Write both — see cmd_add_subtask: an unchecked second write leaves the
    # two sides disagreeing with no error.
    if not write_json(parent_json_path, parent_data):
        print(colored(f"Error: Failed to write parent task.json: {parent_json_path}", Colors.RED), file=sys.stderr)
        print("Nothing was unlinked.", file=sys.stderr)
        return 1
    if not write_json(child_json_path, child_data):
        print(colored(f"Error: Failed to write child task.json: {child_json_path}", Colors.RED), file=sys.stderr)
        print(
            f"Unlink is half-written: {parent_json_path} no longer lists "
            f"'{child_dir.name}', but the child still records the parent.",
            file=sys.stderr,
        )
        return 1

    print(colored(f"Unlinked: {child_dir.name} from {parent_dir.name}", Colors.GREEN), file=sys.stderr)
    return 0


# =============================================================================
# Command: set-branch
# =============================================================================

def cmd_set_branch(args: argparse.Namespace) -> int:
    """Set git branch for task."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)
    if target_dir is None:
        return 1
    branch = args.branch

    if not branch:
        print(colored("Error: Missing arguments", Colors.RED))
        print("Usage: python3 task.py set-branch <task-dir> <branch-name>")
        return 1

    if not target_dir:
        # target_dir is None here, so it must not appear in the message. This
        # is also the branch a ref pointing outside the repo lands in.
        print(colored(f"Error: Task not found: {args.dir}", Colors.RED))
        return 1

    task_json = target_dir / FILE_TASK_JSON
    if not task_json.is_file():
        print(colored(f"Error: task.json not found at {target_dir}", Colors.RED))
        return 1

    data, reason = read_json_checked(task_json)
    if data is None:
        _report_read_failure(task_json, reason)
        return 1

    data["branch"] = branch
    if not write_json(task_json, data):
        _report_write_failure(task_json)
        return 1

    print(colored(f"✓ Branch set to: {branch}", Colors.GREEN))
    return 0


# =============================================================================
# Command: set-base-branch
# =============================================================================

def cmd_set_base_branch(args: argparse.Namespace) -> int:
    """Set the base branch (PR target) for task."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)
    if target_dir is None:
        return 1
    base_branch = args.base_branch

    if not base_branch:
        print(colored("Error: Missing arguments", Colors.RED))
        print("Usage: python3 task.py set-base-branch <task-dir> <base-branch>")
        print("Example: python3 task.py set-base-branch <dir> develop")
        print()
        print("This sets the target branch for PR (the branch your feature will merge into).")
        return 1

    if not target_dir:
        # target_dir is None here, so it must not appear in the message. This
        # is also the branch a ref pointing outside the repo lands in.
        print(colored(f"Error: Task not found: {args.dir}", Colors.RED))
        return 1

    task_json = target_dir / FILE_TASK_JSON
    if not task_json.is_file():
        print(colored(f"Error: task.json not found at {target_dir}", Colors.RED))
        return 1

    data, reason = read_json_checked(task_json)
    if data is None:
        _report_read_failure(task_json, reason)
        return 1

    data["base_branch"] = base_branch
    if not write_json(task_json, data):
        _report_write_failure(task_json)
        return 1

    print(colored(f"✓ Base branch set to: {base_branch}", Colors.GREEN))
    print(f"  PR will target: {base_branch}")
    return 0


# =============================================================================
# Command: set-scope
# =============================================================================

def cmd_set_scope(args: argparse.Namespace) -> int:
    """Set scope for PR title."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)
    if target_dir is None:
        return 1
    scope = args.scope

    if not scope:
        print(colored("Error: Missing arguments", Colors.RED))
        print("Usage: python3 task.py set-scope <task-dir> <scope>")
        return 1

    if not target_dir:
        # target_dir is None here, so it must not appear in the message. This
        # is also the branch a ref pointing outside the repo lands in.
        print(colored(f"Error: Task not found: {args.dir}", Colors.RED))
        return 1

    task_json = target_dir / FILE_TASK_JSON
    if not task_json.is_file():
        print(colored(f"Error: task.json not found at {target_dir}", Colors.RED))
        return 1

    data, reason = read_json_checked(task_json)
    if data is None:
        _report_read_failure(task_json, reason)
        return 1

    data["scope"] = scope
    if not write_json(task_json, data):
        _report_write_failure(task_json)
        return 1

    print(colored(f"✓ Scope set to: {scope}", Colors.GREEN))
    return 0


# =============================================================================
# Command: set-meta
# =============================================================================

def cmd_set_meta(args: argparse.Namespace) -> int:
    """Set/overwrite one metadata key on an existing task."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)
    if target_dir is None:
        return 1
    key = args.key
    value = args.value

    if not key:
        print(colored("Error: Missing arguments", Colors.RED))
        print("Usage: python3 task.py set-meta <task-dir> <key> <value>")
        return 1

    if not target_dir:
        # target_dir is None here, so it must not appear in the message. This
        # is also the branch a ref pointing outside the repo lands in.
        print(colored(f"Error: Task not found: {args.dir}", Colors.RED))
        return 1

    task_json = target_dir / FILE_TASK_JSON
    if not task_json.is_file():
        print(colored(f"Error: task.json not found at {target_dir}", Colors.RED))
        return 1

    data, reason = read_json_checked(task_json)
    if data is None:
        _report_read_failure(task_json, reason)
        return 1

    meta = data.get("meta")
    if not isinstance(meta, dict):
        meta = {}
    meta[key] = value
    data["meta"] = meta
    if not write_json(task_json, data):
        _report_write_failure(task_json)
        return 1

    print(colored(f"✓ Meta set: {key} = {value}", Colors.GREEN))
    return 0
