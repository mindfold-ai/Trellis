#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Snow CLI Trellis context writer + additionalContext emitter.

Used by onSessionStart / onUserMessage / beforeSubAgentStart hooks.

1. Writes a breadcrumb file agents/skills can Read:
     .snow/log/trellis-context.txt
2. Prints stdout JSON for snow-cli inject protocol (#194):
     { "additionalContext": "...", "display": "..." }

Non-JSON hosts ignore stdout; Snow class-1 injects it into model context.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

# Force UTF-8 on Windows consoles (cp936/cp1252 otherwise corrupt Chinese paths).
if sys.platform.startswith("win"):
    import io as _io

    for _stream_name in ("stdin", "stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is None:
            continue
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
            except Exception:
                pass
        elif hasattr(_stream, "detach"):
            try:
                setattr(
                    sys,
                    _stream_name,
                    _io.TextIOWrapper(_stream.detach(), encoding="utf-8", errors="replace"),
                )
            except Exception:
                pass


def _find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for candidate in [cur, *cur.parents]:
        if (candidate / ".trellis").is_dir():
            return candidate
    return cur


def _run(cmd: list[str], cwd: Path) -> str:
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001 — hooks must never crash the host
        return f"(command failed: {exc})"
    out = (completed.stdout or "").strip()
    if out:
        return out
    err = (completed.stderr or "").strip()
    return err or "(no output)"


def _read_text(path: Path, limit: int = 4000) -> str:
    try:
        data = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    data = data.strip()
    if len(data) > limit:
        return data[: limit - 20] + "\n... (truncated)"
    return data


def build_context(repo: Path) -> str:
    lines: list[str] = [
        "# Trellis context (Snow CLI)",
        "",
        "Injected by `.snow/hooks` (onSessionStart / onUserMessage / beforeSubAgentStart).",
        "Also mirrored at `.snow/log/trellis-context.txt` for pull-based reads.",
        "",
        f"Repo: {repo}",
        "",
    ]

    task_py = repo / ".trellis" / "scripts" / "task.py"
    if task_py.is_file():
        py = sys.executable or "python3"
        current = _run([py, "-X", "utf8", str(task_py), "current", "--source"], repo)
        lines.extend(["## task.py current --source", "```", current, "```", ""])
    else:
        lines.append("(no .trellis/scripts/task.py — run trellis init first)")
        lines.append("")

    session_md = repo / ".trellis" / "session" / "current.md"
    if session_md.is_file():
        body = _read_text(session_md, 2500)
        if body:
            lines.extend(["## .trellis/session/current.md", body, ""])

    identity = repo / ".trellis" / "identity.md"
    if identity.is_file():
        body = _read_text(identity, 1500)
        if body:
            lines.extend(["## .trellis/identity.md", body, ""])

    lines.extend(
        [
            "## Main-session checklist",
            "1. Session hooks auto-inject this block; manual `/trellis-start` is optional.",
            "2. When dispatching implement/check/research, start the prompt with:",
            "   `Active task: <path from task.py current>`",
            "3. Do not git commit/push/merge from Trellis implement/check agents.",
            "",
        ]
    )
    return "\n".join(lines).strip() + "\n"


def _drain_stdin(timeout_sec: float = 0.5) -> None:
    """Best-effort drain of host-piped hook context without hanging on TTY."""
    try:
        if sys.stdin is None or sys.stdin.closed:
            return
        # Interactive terminal: do not block waiting for EOF.
        if hasattr(sys.stdin, "isatty") and sys.stdin.isatty():
            return

        # Hosts (Snow) pipe JSON then close stdin. Manual CLI runs must not hang.
        if sys.platform.startswith("win"):
            import threading

            def _read() -> None:
                try:
                    sys.stdin.read()
                except Exception:
                    pass

            t = threading.Thread(target=_read, daemon=True)
            t.start()
            t.join(timeout_sec)
            return

        import select

        while True:
            ready, _, _ = select.select([sys.stdin], [], [], timeout_sec)
            if not ready:
                break
            chunk = sys.stdin.read(4096)
            if not chunk:
                break
    except Exception:
        pass


def main() -> int:
    _drain_stdin()

    cwd = Path(os.environ.get("SNOW_CWD") or os.getcwd())
    repo = _find_repo_root(cwd)
    context = build_context(repo)

    log_dir = repo / ".snow" / "log"
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / "trellis-context.txt").write_text(context, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"trellis-context write failed: {exc}\n")

    # snow-cli#194 inject protocol (default ~8KB cap).
    payload = {
        "additionalContext": context[:7500],
        "display": "Trellis context refreshed (.snow/log/trellis-context.txt)",
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
