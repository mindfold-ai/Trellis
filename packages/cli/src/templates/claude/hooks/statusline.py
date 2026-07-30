#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trellis StatusLine — project-level status display for Claude Code.

Reads Claude Code session JSON from stdin + Trellis task data from filesystem.
Outputs 1-2 lines:
  With active task:  [P1] Task title (status)  +  info line
  Without task:      info line only
Info line: model · ctx% · branch · duration · developer · tasks · rate limits
When COLUMNS (injected by Claude Code v2.1.153+) is too narrow for the info
line, the rate-limit segments move to their own line via an explicit "\n".
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Hook hosts send UTF-8 JSON regardless of the process locale.
_stdin_reconfigure = getattr(sys.stdin, "reconfigure", None)
if callable(_stdin_reconfigure):
    try:
        _stdin_reconfigure(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        pass

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
    """Load current task info through Trellis' active task resolver."""
    return _get_current_task_for_input(trellis_dir, {})


def _get_current_task_for_input(trellis_dir: Path, cc_data: dict) -> dict | None:
    """Load current task info for the Claude Code session JSON."""
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.active_task import resolve_active_task  # type: ignore[import-not-found]
    except Exception:
        return None

    active = resolve_active_task(trellis_dir.parent, cc_data, platform="claude")
    if not active.task_path:
        return None

    task_path = _resolve_task_dir(trellis_dir, active.task_path)
    if active.stale:
        return {
            "title": task_path.name,
            "status": "stale",
            "priority": "P?",
            "source": active.source,
        }

    task_data = _read_json(task_path / "task.json")
    if not task_data:
        return None

    return {
        "title": task_data.get("title") or task_data.get("name") or "unknown",
        "status": task_data.get("status", "unknown"),
        "priority": task_data.get("priority", "P2"),
        "source": active.source,
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


def _format_remaining(secs: int) -> str:
    if secs <= 0:
        return ""
    days, remainder = divmod(secs, 86400)
    hours, remainder = divmod(remainder, 3600)
    mins = remainder // 60
    if days > 0:
        return f"{days}d{hours}h"
    if hours > 0:
        return f"{hours}h{mins}m"
    return f"{mins}m"


def _parse_resets_at(value: object) -> int:
    """`resets_at` is epoch seconds (int/float, possibly stringified) or an
    ISO-8601 timestamp depending on Claude Code version. Return epoch
    seconds, or 0 when absent/unparseable (countdown is then omitted)."""
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value:
        try:
            return int(float(value))
        except ValueError:
            pass
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return int(parsed.timestamp())
        except ValueError:
            pass
    return 0


def _rate_limit_part(label: str, window: dict, now: int) -> str:
    try:
        pct = int(float(window.get("used_percentage")))  # pyright: ignore[reportArgumentType]
    except (TypeError, ValueError):
        return ""
    part = f"{label} {pct}%"
    remaining = _format_remaining(_parse_resets_at(window.get("resets_at")) - now)
    if remaining:
        part += f" \033[90m(reset {remaining})\033[0m"
    return part


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def _visible_len(s: str) -> int:
    """Length of s with ANSI escape sequences stripped."""
    return len(_ANSI_RE.sub("", s))


def _terminal_width() -> int | None:
    """Terminal width from the COLUMNS env var, or None.

    The statusline stdin JSON has no width field and stdout is a pipe, so
    the COLUMNS env var (injected by Claude Code v2.1.153+) is the only
    width signal. Absent or malformed values return None."""
    try:
        width = int(os.environ.get("COLUMNS", ""))
    except ValueError:
        return None
    return width if width > 0 else None


def main() -> None:
    # Read Claude Code session JSON from stdin
    try:
        cc_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError):
        cc_data = {}

    trellis_dir = _find_trellis_dir()
    SEP = " \033[90m·\033[0m "

    # --- Trellis data ---
    task = _get_current_task_for_input(trellis_dir, cc_data) if trellis_dir else None
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

    now = int(time.time())
    rate_limits = cc_data.get("rate_limits", {})
    rate_parts: list[str] = []
    for label, key in (("5h", "five_hour"), ("7d", "seven_day")):
        part = _rate_limit_part(label, rate_limits.get(key) or {}, now)
        if part:
            rate_parts.append(part)

    info_line = SEP.join(parts + rate_parts)

    # Output: task line (only if active) + info line
    if task:
        source = str(task.get("source") or "")
        source_tag = "session" if source.startswith("session:") else source
        source_suffix = f" \033[90m[{source_tag}]\033[0m" if source_tag else ""
        print(f"\033[36m[{task['priority']}]\033[0m {task['title']} \033[33m({task['status']})\033[0m{source_suffix}")

    # Claude Code's status-bar height counts only "\n" characters, so a
    # visually wrapped long line misaligns rows. When the host provides a
    # terminal width and the info line would overflow, split the rate-limit
    # segments onto their own line with an explicit "\n" instead.
    width = _terminal_width()
    if width is not None and rate_parts and _visible_len(info_line) > width:
        print(SEP.join(parts))
        print(SEP.join(rate_parts))
    else:
        print(info_line)


if __name__ == "__main__":
    main()
