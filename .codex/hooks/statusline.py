#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trellis StatusLine — project-level status display for Claude Code.

Reads Claude Code session JSON from stdin + Trellis task data from filesystem.
Outputs 1-2 lines:
  With active task:  [P1] Task title (status)  +  info line
  Without task:      info line only
Info line: model · ctx% · branch · duration · developer · tasks · rate limits
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

# Fix: Windows Python defaults to GBK encoding, which corrupts UTF-8
# characters like the middle dot (·). Wrap stdout/stderr with UTF-8.
if sys.platform == "win32":
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except (FileNotFoundError, PermissionError, OSError):
        return ""


def _read_json(path: Path) -> dict:
    text = _read_text(path)
    if not text:
        return {}
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return {}


def _normalize_task_ref(task_ref: str) -> str:
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
        return f".trellis/{normalized}"

    return normalized


def _resolve_task_dir(trellis_dir: Path, task_ref: str) -> Path:
    normalized = _normalize_task_ref(task_ref)
    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return path_obj
    if normalized.startswith(".trellis/"):
        return trellis_dir.parent / path_obj
    return trellis_dir / "tasks" / path_obj


def _find_trellis_dir() -> Path | None:
    """Walk up from cwd to find .trellis/ directory."""
    current = Path.cwd()
    for parent in [current, *current.parents]:
        candidate = parent / ".trellis"
        if candidate.is_dir():
            return candidate
    return None


def _get_current_task(trellis_dir: Path) -> dict | None:
    """Load current task info. Returns dict with title/status/priority or None."""
    task_ref = _normalize_task_ref(_read_text(trellis_dir / ".current-task"))
    if not task_ref:
        return None

    # Resolve task directory
    task_path = _resolve_task_dir(trellis_dir, task_ref)
    task_data = _read_json(task_path / "task.json")
    if not task_data:
        return None

    return {
        "title": task_data.get("title") or task_data.get("name") or "unknown",
        "status": task_data.get("status", "unknown"),
        "priority": task_data.get("priority", "P2"),
    }


def _count_active_tasks(trellis_dir: Path) -> int:
    """Count non-archived task directories with valid task.json."""
    tasks_dir = trellis_dir / "tasks"
    if not tasks_dir.is_dir():
        return 0
    count = 0
    for d in tasks_dir.iterdir():
        if d.is_dir() and d.name != "archive" and (d / "task.json").is_file():
            count += 1
    return count


def _get_developer(trellis_dir: Path) -> str:
    content = _read_text(trellis_dir / ".developer")
    if not content:
        return "unknown"
    for line in content.splitlines():
        if line.startswith("name="):
            return line[5:].strip()
    return content.splitlines()[0].strip() or "unknown"


def _get_git_branch() -> str:
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=3,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def _format_ctx_size(size: int) -> str:
    if size >= 1_000_000:
        return f"{size // 1_000_000}M"
    if size >= 1_000:
        return f"{size // 1_000}K"
    return str(size)


def _format_duration(ms: int) -> str:
    secs = ms // 1000
    hours, remainder = divmod(secs, 3600)
    mins = remainder // 60
    if hours > 0:
        return f"{hours}h{mins}m"
    return f"{mins}m"


def main() -> None:
    # Read Claude Code session JSON from stdin
    try:
        cc_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError):
        cc_data = {}

    trellis_dir = _find_trellis_dir()
    SEP = " \033[90m·\033[0m "

    # --- Trellis data ---
    task = _get_current_task(trellis_dir) if trellis_dir else None
    dev = _get_developer(trellis_dir) if trellis_dir else ""
    task_count = _count_active_tasks(trellis_dir) if trellis_dir else 0

    # --- CC session data ---
    model = cc_data.get("model", {}).get("display_name", "?")
    ctx_pct = int(cc_data.get("context_window", {}).get("used_percentage") or 0)
    ctx_size = _format_ctx_size(cc_data.get("context_window", {}).get("context_window_size") or 0)
    duration = _format_duration(cc_data.get("cost", {}).get("total_duration_ms") or 0)
    branch = _get_git_branch()

    # Avoid "Opus 4.6 (1M context) (1M)"
    if re.search(r"\d+[KMG]\b", model, re.IGNORECASE):
        model_label = model
    else:
        model_label = f"{model} ({ctx_size})"

    # Context % with color
    if ctx_pct >= 90:
        ctx_color = "\033[31m"
    elif ctx_pct >= 70:
        ctx_color = "\033[33m"
    else:
        ctx_color = "\033[32m"

    # Build info line: model · ctx · branch · duration · dev · tasks [· rate limits]
    parts = [
        model_label,
        f"ctx {ctx_color}{ctx_pct}%\033[0m",
    ]
    if branch:
        parts.append(f"\033[35m{branch}\033[0m")
    parts.append(duration)
    if dev:
        parts.append(f"\033[32m{dev}\033[0m")
    if task_count:
        parts.append(f"{task_count} task(s)")

    five_hr = cc_data.get("rate_limits", {}).get("five_hour", {}).get("used_percentage")
    if five_hr is not None:
        parts.append(f"5h {int(five_hr)}%")
    seven_day = cc_data.get("rate_limits", {}).get("seven_day", {}).get("used_percentage")
    if seven_day is not None:
        parts.append(f"7d {int(seven_day)}%")

    info_line = SEP.join(parts)

    # Output: task line (only if active) + info line
    if task:
        print(f"\033[36m[{task['priority']}]\033[0m {task['title']} \033[33m({task['status']})\033[0m")
    print(info_line)


if __name__ == "__main__":
    main()
