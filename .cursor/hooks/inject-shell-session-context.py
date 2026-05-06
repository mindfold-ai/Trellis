#!/usr/bin/env python3
"""Cursor beforeShellExecution hook: bridge conversation identity to task.py.

Cursor's shell command environment does not inherit SessionStart data. This
hook writes a short-lived runtime ticket before Cursor runs a shell command
that calls `task.py start/current/finish`. The task script then consumes the
ticket only when it has no native session environment.
"""
from __future__ import annotations

import hashlib
import json
import os
import shlex
import sys
import time
from pathlib import Path
from typing import Any


DIR_WORKFLOW = ".trellis"
DIR_RUNTIME = ".runtime"
DIR_CURSOR_SHELL = "cursor-shell"
SESSION_SUBCOMMANDS = {"start", "current", "finish"}
TICKET_TTL_SECONDS = 30
CONTEXT_IDENTITY_KEYS = (
    "session_id",
    "sessionId",
    "sessionID",
    "conversation_id",
    "conversationId",
    "conversationID",
    "transcript_path",
    "transcriptPath",
    "transcript",
)


def _string_value(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _find_trellis_root(start: Path) -> Path | None:
    current = start.resolve()
    while True:
        if (current / DIR_WORKFLOW).is_dir():
            return current
        if current == current.parent:
            return None
        current = current.parent


def _runtime_ticket_dir(root: Path) -> Path:
    return root / DIR_WORKFLOW / DIR_RUNTIME / DIR_CURSOR_SHELL


def _load_active_task_resolver(root: Path):
    scripts_dir = root / DIR_WORKFLOW / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_context_key  # type: ignore[import-not-found]

    return resolve_context_key


def _extract_task_subcommands(command: str) -> list[dict[str, str]]:
    try:
        tokens = shlex.split(command, posix=os.name != "nt")
    except ValueError:
        return []

    subcommands: list[dict[str, str]] = []
    for index, token in enumerate(tokens[:-1]):
        if Path(token.strip("\"'")).name != "task.py":
            continue
        name = tokens[index + 1]
        if name not in SESSION_SUBCOMMANDS:
            continue
        item = {"name": name}
        if name == "start" and index + 2 < len(tokens):
            item["task_ref"] = tokens[index + 2]
        subcommands.append(item)
    return subcommands


def _cleanup_expired_tickets(ticket_dir: Path, now: float) -> None:
    if not ticket_dir.is_dir():
        return
    for ticket_path in ticket_dir.glob("*.json"):
        try:
            data = json.loads(ticket_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        expires_at = data.get("expires_at_epoch")
        if isinstance(expires_at, (int, float)) and expires_at < now:
            try:
                ticket_path.unlink()
            except OSError:
                pass


def _has_context_identity(hook_input: dict[str, Any]) -> bool:
    return any(_string_value(hook_input.get(key)) for key in CONTEXT_IDENTITY_KEYS)


def _write_ticket(
    root: Path,
    hook_input: dict[str, Any],
    context_key: str,
    subcommands: list[dict[str, str]],
) -> None:
    now = time.time()
    ticket_dir = _runtime_ticket_dir(root)
    ticket_dir.mkdir(parents=True, exist_ok=True)
    _cleanup_expired_tickets(ticket_dir, now)

    command = _string_value(hook_input.get("command")) or ""
    digest = hashlib.sha256(
        f"{context_key}\0{command}\0{now}".encode("utf-8"),
    ).hexdigest()[:16]
    ticket_path = ticket_dir / f"{int(now * 1000)}-{digest}.json"

    payload = {
        "platform": "cursor",
        "context_key": context_key,
        "conversation_id": _string_value(hook_input.get("conversation_id")),
        "session_id": _string_value(hook_input.get("session_id")),
        "generation_id": _string_value(hook_input.get("generation_id")),
        "cwd": _string_value(hook_input.get("cwd")),
        "command": command,
        "subcommands": subcommands,
        "created_at_epoch": now,
        "expires_at_epoch": now + TICKET_TTL_SECONDS,
    }
    ticket_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    if os.environ.get("TRELLIS_HOOKS") == "0" or os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return 0

    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError):
        hook_input = {}
    if not isinstance(hook_input, dict):
        hook_input = {}

    command = _string_value(hook_input.get("command")) or ""
    subcommands = _extract_task_subcommands(command)
    if not subcommands:
        return 0

    cwd = Path(_string_value(hook_input.get("cwd")) or os.getcwd())
    root = _find_trellis_root(cwd)
    if root is None:
        return 0

    if not _has_context_identity(hook_input):
        return 0

    resolve_context_key = _load_active_task_resolver(root)
    context_key = resolve_context_key(hook_input, platform="cursor")
    if not context_key:
        return 0

    try:
        _write_ticket(root, hook_input, context_key, subcommands)
    except OSError:
        return 0

    print(json.dumps({"permission": "allow"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
