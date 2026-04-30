#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stop Hook - Native desktop notification on Claude response complete.

Fires a bottom-right toast on Windows / macOS / Linux when Claude finishes
responding. Zero third-party deps — only stdlib + OS-native tooling
(PowerShell WinRT on Windows, osascript on macOS, notify-send on Linux).

To disable:
  1. Env var:           set CLAUDE_NOTIFY=0 in your shell / OS env
  2. settings.local.json: override "Stop" with an empty array (behavior depends
     on Claude Code's merge semantics — env var is more reliable)
  3. Edit this project's .claude/settings.json and remove the Stop block
"""

import warnings
warnings.filterwarnings("ignore")

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

if sys.platform == "win32":
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")

THROTTLE_SECONDS = 5.0
SUMMARY_MAX_CHARS = 100
NOTIFY_TITLE = "Claude Code · Done"


def _parse_iso_timestamp(ts: str) -> datetime | None:
    if not ts or not isinstance(ts, str):
        return None
    try:
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def _extract_from_transcript(transcript_path: str) -> tuple[str | None, str | None, str | None]:
    """Return (last_assistant_text, last_user_ts_iso, last_assistant_ts_iso)."""
    last_text: str | None = None
    last_user_ts: str | None = None
    last_assistant_ts: str | None = None

    if not transcript_path:
        return last_text, last_user_ts, last_assistant_ts
    path = Path(transcript_path)
    if not path.is_file():
        return last_text, last_user_ts, last_assistant_ts

    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict):
                    continue

                msg = entry.get("message") if isinstance(entry.get("message"), dict) else {}
                role = (msg.get("role") if isinstance(msg, dict) else None) or entry.get("type")
                ts = entry.get("timestamp") or (msg.get("timestamp") if isinstance(msg, dict) else None)

                if role == "user":
                    if ts:
                        last_user_ts = ts
                elif role == "assistant":
                    if ts:
                        last_assistant_ts = ts
                    content = msg.get("content") if isinstance(msg, dict) else None
                    text_bits: list[str] = []
                    if isinstance(content, str):
                        text_bits.append(content)
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text_bits.append(str(block.get("text", "")))
                    combined = "".join(text_bits).strip()
                    if combined:
                        last_text = combined
    except (OSError, PermissionError):
        pass

    return last_text, last_user_ts, last_assistant_ts


def _elapsed_seconds(user_ts: str | None, assistant_ts: str | None) -> float | None:
    u = _parse_iso_timestamp(user_ts) if user_ts else None
    a = _parse_iso_timestamp(assistant_ts) if assistant_ts else None
    if not u or not a:
        return None
    try:
        return (a - u).total_seconds()
    except (TypeError, ValueError):
        return None


def _build_summary(last_text: str | None) -> str:
    text = (last_text or "Response complete").strip()
    first_line = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            first_line = stripped
            break
    if not first_line:
        first_line = "Response complete"
    if len(first_line) > SUMMARY_MAX_CHARS:
        first_line = first_line[: SUMMARY_MAX_CHARS - 3] + "..."
    return first_line


def _dispatch_windows(title: str, body: str) -> None:
    ps1 = Path(__file__).with_name("notify_windows.ps1")
    if not ps1.is_file():
        return
    CREATE_NO_WINDOW = 0x08000000
    DETACHED_PROCESS = 0x00000008
    subprocess.Popen(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", str(ps1),
            "-Title", title,
            "-Body", body,
        ],
        creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
    )


def _applescript_quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _dispatch_macos(title: str, body: str) -> None:
    script = (
        f'display notification {_applescript_quote(body)} '
        f'with title {_applescript_quote(title)} sound name "Glass"'
    )
    subprocess.Popen(
        ["osascript", "-e", script],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def _dispatch_linux(title: str, body: str) -> None:
    try:
        subprocess.Popen(
            ["notify-send", "--app-name=Claude Code", title, body],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except FileNotFoundError:
        pass


def _dispatch(title: str, body: str) -> None:
    try:
        if sys.platform == "win32":
            _dispatch_windows(title, body)
        elif sys.platform == "darwin":
            _dispatch_macos(title, body)
        elif sys.platform.startswith("linux"):
            _dispatch_linux(title, body)
    except (OSError, ValueError):
        pass


def main() -> None:
    if os.environ.get("CLAUDE_NOTIFY", "").strip() == "0":
        return

    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}

    if data.get("stop_hook_active"):
        return

    transcript_path = data.get("transcript_path") or ""
    last_text, user_ts, assistant_ts = _extract_from_transcript(transcript_path)

    elapsed = _elapsed_seconds(user_ts, assistant_ts)
    if elapsed is not None and elapsed < THROTTLE_SECONDS:
        return

    summary = _build_summary(last_text)
    time_str = datetime.now().strftime("%H:%M:%S")
    body = f"{summary}\n{time_str}"

    _dispatch(NOTIFY_TITLE, body)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
