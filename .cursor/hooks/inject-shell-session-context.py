#!/usr/bin/env python3
"""Pre-shell hook: bridge the host's session identity into task.py.

No researched platform exports a session id into its shell tool's child
process, but every hook-capable one puts that id on hook stdin. So the hook
that fires just before a shell command writes a short-lived runtime ticket
whenever the pending command calls `task.py start/current/finish`, and the
task script consumes it when it has no native session environment.

Registered on whichever pre-shell event the host provides — Cursor's
`beforeShellExecution`, Claude-shaped `PreToolUse`, Gemini's `BeforeTool` —
which is why the only thing here that knows about payload variation is
`_pending_shell_command`.
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

# Hook hosts send UTF-8 JSON regardless of the process locale.
_stdin_reconfigure = getattr(sys.stdin, "reconfigure", None)
if callable(_stdin_reconfigure):
    try:
        _stdin_reconfigure(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        # Best-effort: a stream that refuses the encoding change still reads.
        # Failing here would kill the hook before it can fail open.
        pass


DIR_WORKFLOW = ".trellis"
DIR_RUNTIME = ".runtime"
DIR_SHELL_TICKETS = "shell-tickets"
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
# Tool-call payloads nest the command one level down; same casing spread as
# CONTEXT_IDENTITY_KEYS above.
TOOL_INPUT_KEYS = ("tool_input", "toolInput")
# Answering a shell-execution event with an explicit allow is what keeps
# Cursor from re-prompting for a command Trellis itself asked for. Tool-call
# hosts read a different response schema, so they get no answer at all rather
# than a key they would have to ignore.
SHELL_EVENT_RESPONSE = {"permission": "allow"}


def _string_value(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _resolve_trellis_root(hook_input: dict[str, Any]) -> Path | None:
    """Locate the project root, trying the payload cwd and then our own.

    Hosts disagree about what `cwd` means. CodeBuddy IDE 4.10.4 sends `"/"` for
    every PreToolUse event, so trusting the payload alone finds no `.trellis`
    and the bridge silently does nothing — the hook is invoked, writes no
    ticket, and `task.py start` degrades. Observed with a wildcard probe:

        {"cwd": "/", "tool_name": "Bash", "tool_input": {"command": "ls …"}}

    The hook's own cwd is reliable where the payload is not: hosts launch it
    from the project root, which is why a relative `command` in settings.json
    resolves at all. Try the payload first (it is right on hosts that set it,
    and survives a host that runs hooks from elsewhere), then fall back.
    """
    candidates: list[Path] = []
    payload_cwd = _string_value(hook_input.get("cwd"))
    if payload_cwd:
        candidates.append(Path(payload_cwd))
    try:
        candidates.append(Path(os.getcwd()))
    except OSError:
        # A deleted or unreadable cwd is just one fewer candidate; the payload
        # cwd appended above can still resolve.
        pass

    for candidate in candidates:
        root = _find_trellis_root(candidate)
        if root is not None:
            return root
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
    return root / DIR_WORKFLOW / DIR_RUNTIME / DIR_SHELL_TICKETS


def _pending_shell_command(hook_input: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    """Read the pending shell command out of either hook payload shape.

    Returns the command plus the response envelope that shape expects:

    - shell-execution event (Cursor `beforeShellExecution`) — the command sits
      at the top level and the host wants a permission decision back;
    - tool-call event (`PreToolUse`, `BeforeTool`) — the command sits under
      `tool_input`, and the host reads a schema this hook has no opinion on.

    An ordered fallback, not a platform switch: a third payload shape extends
    the same function. Anything else yields ("", None) so main() no-ops.
    """
    command = _string_value(hook_input.get("command"))
    if command:
        return command, SHELL_EVENT_RESPONSE

    for key in TOOL_INPUT_KEYS:
        tool_input = hook_input.get(key)
        if not isinstance(tool_input, dict):
            continue
        command = _string_value(tool_input.get("command"))
        if command:
            return command, None

    return "", None


def _host_platform_name() -> str | None:
    """Name the host from the config directory this hook was installed into.

    Every platform puts its hooks under its own dotted directory
    (`.cursor/hooks/`, `.factory/hooks/`, …), so the deepest dotted path
    segment identifies the host without a table of platform names here. It
    matters because the context key must agree with the one the platform's
    other hooks compute — a ticket keyed differently would write a session
    file no later hook ever reads.
    """
    for part in reversed(Path(sys.argv[0]).parts):
        if part.startswith(".") and part not in (".", "..") and len(part) > 1:
            return part[1:]
    return None


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
                # Opportunistic cleanup: a ticket that cannot be removed is
                # still expired and gets retried on the next pass.
                pass


def _has_context_identity(hook_input: dict[str, Any]) -> bool:
    return any(_string_value(hook_input.get(key)) for key in CONTEXT_IDENTITY_KEYS)


def _write_ticket(
    root: Path,
    hook_input: dict[str, Any],
    context_key: str,
    command: str,
    platform_name: str | None,
    subcommands: list[dict[str, str]],
) -> None:
    now = time.time()
    ticket_dir = _runtime_ticket_dir(root)
    ticket_dir.mkdir(parents=True, exist_ok=True)
    _cleanup_expired_tickets(ticket_dir, now)

    digest = hashlib.sha256(
        f"{context_key}\0{command}\0{now}".encode("utf-8"),
    ).hexdigest()[:16]
    ticket_path = ticket_dir / f"{int(now * 1000)}-{digest}.json"

    payload = {
        # Debugging metadata. The consumer accepts a ticket on freshness, repo
        # and subcommand — never on this field.
        "platform": platform_name,
        "context_key": context_key,
        "conversation_id": _string_value(hook_input.get("conversation_id")),
        "session_id": _string_value(hook_input.get("session_id")),
        "generation_id": _string_value(hook_input.get("generation_id")),
        # The resolved project root, not the payload's cwd. The consumer
        # rejects a ticket whose cwd is outside the repo, and CodeBuddy IDE
        # 4.10.4 reports "/" for every PreToolUse event — a ticket carrying
        # that is written correctly and then discarded on arrival. Recording
        # the root we actually resolved keeps the containment check meaningful
        # without trusting a field the host may not populate.
        "cwd": str(root),
        # Kept separately so a wrong host cwd stays visible when debugging.
        "host_cwd": _string_value(hook_input.get("cwd")),
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

    command, response = _pending_shell_command(hook_input)
    subcommands = _extract_task_subcommands(command)
    if not subcommands:
        return 0

    root = _resolve_trellis_root(hook_input)
    if root is None:
        return 0

    if not _has_context_identity(hook_input):
        return 0

    platform_name = _host_platform_name()
    resolve_context_key = _load_active_task_resolver(root)
    context_key = resolve_context_key(hook_input, platform=platform_name)
    if not context_key:
        return 0

    try:
        _write_ticket(root, hook_input, context_key, command, platform_name, subcommands)
    except OSError:
        return 0

    if response is not None:
        print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
