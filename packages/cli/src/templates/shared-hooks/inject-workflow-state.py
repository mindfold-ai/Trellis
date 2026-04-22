#!/usr/bin/env python3
"""Trellis UserPromptSubmit hook: inject per-turn workflow breadcrumb.

Runs on every user prompt. Reads the active task (.trellis/.current-task)
and emits a short <workflow-state> block reminding the main AI what task
is active and its expected flow. Breadcrumb text is pulled from
workflow.md [workflow-state:STATUS] tag blocks (single source of truth
for users who fork the Trellis workflow), with hardcoded fallbacks so
the hook never breaks when workflow.md is missing or malformed.

Shared across all hook-capable platforms (Claude, Cursor, Codex, Qoder,
CodeBuddy, Droid, Gemini, Copilot). Kiro is not wired (no per-turn
hook entry point). Written to each platform's hooks directory via
writeSharedHooks() at init time.

Silent exit 0 cases (no output):
  - No .trellis/ directory found (not a Trellis project)
  - No .current-task file, or it's empty
  - task.json malformed or missing status

Unknown status (no tag + no hardcoded fallback) emits a generic
breadcrumb rather than silent-exiting, so custom statuses surface in
the UI instead of appearing as "randomly broken".
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional, Tuple


# ---------------------------------------------------------------------------
# CWD-robust Trellis root discovery (fixes hook-path-robustness for this hook)
# ---------------------------------------------------------------------------

def find_trellis_root(start: Path) -> Optional[Path]:
    """Walk up from start to find directory containing .trellis/.

    Handles CWD drift: subdirectory launches, monorepo packages, etc.
    Returns None if no .trellis/ found (silent no-op).
    """
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / ".trellis").is_dir():
            return cur
        cur = cur.parent
    return None


# ---------------------------------------------------------------------------
# Active task discovery
# ---------------------------------------------------------------------------

def _normalize_task_ref(task_ref: str) -> str:
    """Normalize .current-task path ref.

    Accepts:
    - Absolute paths (left as-is)
    - Windows-style backslashes (converted to forward slash)
    - Legacy relative refs like "tasks/foo" (prefixed with .trellis/)
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
    if normalized.startswith("tasks/"):
        normalized = f".trellis/{normalized}"
    return normalized


def get_active_task(root: Path) -> Optional[Tuple[str, str]]:
    """Return (task_id, status) from the current active task, else None.

    Reads .trellis/.current-task (a path relative to root, e.g.
    ".trellis/tasks/04-17-foo") then that task's task.json.
    Normalizes backslashes so Windows paths work on Unix and vice versa.
    """
    ref_file = root / ".trellis" / ".current-task"
    if not ref_file.is_file():
        return None
    try:
        raw = ref_file.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    task_ref = _normalize_task_ref(raw)
    if not task_ref:
        return None

    path_obj = Path(task_ref)
    task_dir = path_obj if path_obj.is_absolute() else root / path_obj
    task_json = task_dir / "task.json"
    if not task_json.is_file():
        return None
    try:
        data = json.loads(task_json.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    task_id = data.get("id") or task_dir.name
    status = data.get("status", "")
    if not isinstance(status, str) or not status:
        return None
    return task_id, status


# ---------------------------------------------------------------------------
# Breadcrumb loading: parse workflow.md, fall back to hardcoded defaults
# ---------------------------------------------------------------------------

# Supports STATUS values with letters, digits, underscores, hyphens
# (so "in-review" / "blocked-by-team" work alongside "in_progress").
_TAG_RE = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)

# Hardcoded defaults for built-in Trellis statuses. Used when workflow.md is
# missing, malformed, or lacks the tag for this status.
#
# `no_task` is a pseudo-status emitted when .current-task is missing — it keeps
# the Next-Action reminder flowing per-turn even without an active task.
_FALLBACK_BREADCRUMBS = {
    "no_task": (
        "No active task.\n"
        "Trigger words in the user message that REQUIRE creating a task "
        "(non-negotiable, do NOT self-exempt): 重构 / 抽成 / 独立 / 分发 / "
        "拆出来 / 搞一个 / 做成 / 接入 / 集成 / refactor / rewrite / extract / "
        "productize / publish / build X / design Y.\n"
        "Task is NOT required ONLY if ALL three hold: (a) zero file writes "
        "this turn, (b) answer fits in one reply with no multi-round plan, "
        "(c) no research beyond reading 1-2 repo files.\n"
        "When in doubt: create task. Over-tasking is cheap; under-tasking "
        "leaks plans and research into main context.\n"
        "Flow: load `trellis-brainstorm` skill → it creates the task via "
        "`python3 ./.trellis/scripts/task.py create` and drives requirements Q&A. "
        "For research-heavy work (tool comparison, docs, cross-platform survey), "
        "spawn `trellis-research` sub-agents via Task tool — NEVER do 3+ inline "
        "WebFetch/WebSearch/`gh api` calls in the main conversation."
    ),
    "planning": (
        "Complete prd.md via trellis-brainstorm skill; then run task.py start.\n"
        "Research belongs in `{task_dir}/research/*.md`, written by "
        "`trellis-research` sub-agents. Do NOT inline WebFetch/WebSearch in "
        "main session — PRD only links to research files."
    ),
    "in_progress": (
        "Flow: trellis-implement → trellis-check → trellis-update-spec → finish\n"
        "Check conversation history + git status to determine current step; "
        "do NOT skip trellis-check."
    ),
    "completed": (
        "User commits changes; then run task.py archive."
    ),
}


def load_breadcrumbs(root: Path) -> dict[str, str]:
    """Parse workflow.md for [workflow-state:STATUS] blocks.

    Returns {status: body_text}. Missing tags fall back to hardcoded
    defaults so the hook always has something to say for built-in
    statuses. Custom statuses without tags fall to generic breadcrumb
    downstream (see build_breadcrumb).
    """
    result = dict(_FALLBACK_BREADCRUMBS)

    workflow = root / ".trellis" / "workflow.md"
    if not workflow.is_file():
        return result
    try:
        content = workflow.read_text(encoding="utf-8")
    except OSError:
        return result

    for match in _TAG_RE.finditer(content):
        status = match.group(1)
        body = match.group(2).strip()
        if body:
            result[status] = body
    return result


def build_breadcrumb(
    task_id: Optional[str], status: str, templates: dict[str, str]
) -> str:
    """Build the <workflow-state>...</workflow-state> block.

    - Known status (in templates or fallback) → detailed template body
    - Unknown status (no tag + no fallback) → generic "refer to workflow.md"
    - `no_task` pseudo-status (task_id is None) → header omits task info
    """
    body = templates.get(status)
    if body is None:
        body = "Refer to workflow.md for current step."
    header = f"Status: {status}" if task_id is None else f"Task: {task_id} ({status})"
    return f"<workflow-state>\n{header}\n{body}\n</workflow-state>"


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        data = {}

    cwd_str = data.get("cwd") or os.getcwd()
    cwd = Path(cwd_str)

    root = find_trellis_root(cwd)
    if root is None:
        return 0  # not a Trellis project

    templates = load_breadcrumbs(root)
    task = get_active_task(root)
    if task is None:
        # No active task — still emit a breadcrumb nudging AI toward
        # trellis-brainstorm + task.py create when user describes real work.
        breadcrumb = build_breadcrumb(None, "no_task", templates)
    else:
        breadcrumb = build_breadcrumb(*task, templates=templates)

    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": breadcrumb,
        }
    }
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
