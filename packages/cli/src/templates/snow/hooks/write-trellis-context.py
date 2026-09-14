#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Snow CLI Trellis context writer + additionalContext emitter.

Used by onSessionStart / onUserMessage / beforeSubAgentStart hooks.

1. Writes a breadcrumb file agents/skills can Read:
     .snow/log/trellis-context.txt
2. Prints stdout JSON for the Snow inject protocol:
     { "additionalContext": "...", "display": "..." }

Modes (compact vs full):
- argv: session | user | subagent  (preferred)
- env:  TRELLIS_SNOW_HOOK_MODE
- stdin JSON from Snow may include agentId/agentName/prompt/cwd/sessionId

Non-JSON hosts ignore stdout; Snow injects it into model context.
Fail-open: never raise out of main().
"""

from __future__ import annotations

from collections.abc import Mapping
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

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


DEFAULT_MAX_BYTES = 7500
COMPACT_MAX_BYTES = 2800


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
            # Keep below Snow user/subagent hook timeout (15s) so fail-open JSON
            # can still emit if task.py stalls.
            timeout=5,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001 — hooks must never crash the host
        return f"(command failed: {exc})"
    out = (completed.stdout or "").strip()
    if out:
        return out
    err = (completed.stderr or "").strip()
    return err or "(no output)"


def _is_active_path(repo: Path, path: Path) -> bool:
    scripts = repo / ".trellis" / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    try:
        from common.history_paths import is_active_path  # type: ignore[import-not-found]
        return is_active_path(path, repo)
    except Exception:
        return False


def _read_text(path: Path, repo: Path, limit: int = 4000) -> str:
    if not _is_active_path(repo, path):
        return ""
    try:
        data = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    data = data.strip()
    if len(data) > limit:
        return data[: limit - 20] + "\n... (truncated)"
    return data


def _count_jsonl_lines(path: Path, repo: Path) -> int | None:
    if not _is_active_path(repo, path) or not path.is_file():
        return None
    try:
        count = 0
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if line.strip():
                    count += 1
        return count
    except Exception:
        return None


def _jsonl_summaries(path: Path, repo: Path, max_items: int = 8, line_limit: int = 120) -> list[str]:
    if max_items <= 0 or not _is_active_path(repo, path) or not path.is_file():
        return []
    items: list[str] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                line = raw.strip()
                if not line:
                    continue
                summary = line
                try:
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        reference = obj.get("file") or obj.get("path")
                        if isinstance(reference, str) and not _is_active_path(repo, repo / reference):
                            continue
                        for key in ("summary", "title", "id", "path", "message", "status"):
                            val = obj.get(key)
                            if isinstance(val, str) and val.strip():
                                summary = val.strip()
                                break
                        else:
                            summary = json.dumps(obj, ensure_ascii=False)
                except Exception:
                    pass
                if len(summary) > line_limit:
                    summary = summary[: line_limit - 3] + "..."
                items.append(f"- {summary}")
                if len(items) > max_items:
                    items.pop(0)
    except Exception:
        return []
    return items


def _parse_active_task_path(current_out: str, repo: Path) -> Path | None:
    # Prefer "Current task: .trellis/tasks/..." line from task.py --source.
    for line in current_out.splitlines():
        m = re.search(r"Current task:\s*(.+)\s*$", line.strip(), re.I)
        if not m:
            continue
        raw = m.group(1).strip().strip('"').strip("'")
        if not raw or raw.lower() in {"none", "(none)", "n/a"}:
            return None
        p = Path(raw)
        if not p.is_absolute():
            p = repo / p
        return p if _is_active_path(repo, p) else None
    # Fallback: first path-like token containing tasks/
    m = re.search(r"(\.trellis[/\\]tasks[/\\][^\s]+)", current_out)
    if m:
        candidate = repo / m.group(1).replace("\\", "/")
        return candidate if _is_active_path(repo, candidate) else None
    return None


def _drain_stdin(timeout_sec: float = 0.5) -> str:
    """Best-effort drain of host-piped hook context without hanging on TTY."""
    chunks: list[str] = []
    try:
        if sys.stdin is None or sys.stdin.closed:
            return ""
        # Interactive terminal: do not block waiting for EOF.
        if hasattr(sys.stdin, "isatty") and sys.stdin.isatty():
            return ""

        # Hosts (Snow) pipe JSON then close stdin. Manual CLI runs must not hang.
        if sys.platform.startswith("win"):
            import threading

            box: list[str] = []

            def _read() -> None:
                try:
                    box.append(sys.stdin.read())
                except Exception:
                    pass

            t = threading.Thread(target=_read, daemon=True)
            t.start()
            t.join(timeout_sec)
            return box[0] if box else ""

        import select

        while True:
            ready, _, _ = select.select([sys.stdin], [], [], timeout_sec)
            if not ready:
                break
            chunk = sys.stdin.read(4096)
            if not chunk:
                break
            chunks.append(chunk)
    except Exception:
        pass
    return "".join(chunks)


def _parse_stdin_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except Exception:
        # Some hosts may wrap payload; try first JSON object substring.
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start : end + 1])
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}
        return {}


def _resolve_mode(
    argv: list[str], env: Mapping[str, str], stdin_ctx: dict[str, Any]
) -> str:
    for arg in argv[1:]:
        a = arg.strip().lower()
        if a in {"session", "user", "subagent", "full", "compact"}:
            if a == "full":
                return "session"
            if a == "compact":
                return "user"
            return a
    env_mode = (env.get("TRELLIS_SNOW_HOOK_MODE") or "").strip().lower()
    if env_mode in {"session", "user", "subagent"}:
        return env_mode
    # Infer from Snow stdin context shape.
    if stdin_ctx.get("agentId") or stdin_ctx.get("agentName") or stdin_ctx.get("prompt"):
        return "subagent"
    if stdin_ctx.get("message") is not None or stdin_ctx.get("source") in {"normal", "pending"}:
        return "user"
    if stdin_ctx.get("isResume") is not None or stdin_ctx.get("messages") is not None:
        return "session"
    return "session"


def _agent_kind(stdin_ctx: dict[str, Any]) -> str:
    blob = " ".join(
        str(stdin_ctx.get(k) or "")
        for k in ("agentId", "agentName", "prompt")
    ).lower()
    if "implement" in blob:
        return "implement"
    if "check" in blob:
        return "check"
    if "research" in blob:
        return "research"
    return "generic"


def _task_artifact_summary(task_dir: Path, repo: Path, *, detailed: bool, kind: str) -> list[str]:
    if not _is_active_path(repo, task_dir):
        return []
    lines: list[str] = [f"## Active task artifacts ({task_dir.as_posix()})"]
    for name in ("prd.md", "design.md", "implement.md", "task.json"):
        p = task_dir / name
        if _is_active_path(repo, p) and p.is_file():
            try:
                size = p.stat().st_size
            except Exception:
                size = -1
            lines.append(f"- {name}: present ({size} bytes)")
        else:
            lines.append(f"- {name}: missing")

    for jl in ("implement.jsonl", "check.jsonl"):
        n = _count_jsonl_lines(task_dir / jl, repo)
        if n is None:
            lines.append(f"- {jl}: missing")
        else:
            lines.append(f"- {jl}: {n} entries")

    research_dir = task_dir / "research"
    if _is_active_path(repo, research_dir) and research_dir.is_dir():
        try:
            research_files = [p.name for p in research_dir.iterdir() if _is_active_path(repo, p) and p.is_file()]
        except Exception:
            research_files = []
        lines.append(f"- research/: {len(research_files)} file(s)")
    else:
        lines.append("- research/: missing")

    lines.append("")

    if not detailed:
        return lines

    prd = task_dir / "prd.md"
    if _is_active_path(repo, prd) and prd.is_file():
        # Prefer first ~40 lines / ~1800 chars for full mode.
        body = _read_text(prd, repo, 1800)
        if body:
            lines.extend(["## prd.md summary", body, ""])

    if kind in {"implement", "generic"}:
        impl = task_dir / "implement.jsonl"
        items = _jsonl_summaries(impl, repo, max_items=10)
        if items:
            lines.append("## implement.jsonl (recent)")
            lines.extend(items)
            lines.append("")
        design = task_dir / "design.md"
        if _is_active_path(repo, design) and design.is_file():
            dbody = _read_text(design, repo, 900)
            if dbody:
                lines.extend(["## design.md excerpt", dbody, ""])
        implement_md = task_dir / "implement.md"
        if _is_active_path(repo, implement_md) and implement_md.is_file():
            ibody = _read_text(implement_md, repo, 900)
            if ibody:
                lines.extend(["## implement.md excerpt", ibody, ""])

    if kind in {"check", "generic"}:
        lines.extend(
            [
                "## Check focus",
                "- Run `git diff` / diagnostics for uncommitted changes.",
                "- Compare against prd/design/implement and project specs.",
                "- Self-fix issues; do not only report.",
                "",
            ]
        )
        check_items = _jsonl_summaries(task_dir / "check.jsonl", repo, max_items=8)
        if check_items:
            lines.append("## check.jsonl (recent)")
            lines.extend(check_items)
            lines.append("")

    if kind == "research":
        lines.extend(
            [
                "## Research focus",
                f"- Persist findings ONLY under `{task_dir.as_posix()}/research/`.",
                "- Chat reply should list file paths + one-line summaries, not full dumps.",
                "- Do not modify code outside the research directory.",
                "",
            ]
        )

    return lines


def _sanitize_session_key(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", (value or "").strip())
    return cleaned.strip("._-")


def _current_session_ids(stdin_ctx: dict[str, Any] | None = None) -> list[str]:
    # Prefer explicit Trellis context, then Snow session identity.
    ids: list[str] = []
    candidates = [
        os.environ.get("TRELLIS_CONTEXT_ID"),
        os.environ.get("SNOW_SESSION_ID"),
    ]
    if stdin_ctx:
        candidates.extend(
            [
                stdin_ctx.get("sessionId"),
                stdin_ctx.get("session_id"),
            ]
        )
    for raw in candidates:
        if not isinstance(raw, str):
            continue
        key = _sanitize_session_key(raw)
        if key and key not in ids:
            ids.append(key)
        # Snow injects TRELLIS_CONTEXT_ID=snow-<sessionId>
        if key.startswith("snow_"):
            bare = key[5:]
            if bare and bare not in ids:
                ids.append(bare)
        if key.startswith("snow-"):
            bare = key[5:]
            if bare and bare not in ids:
                ids.append(bare)
    return ids


def _resolve_active_task(
    repo: Path,
    stdin_ctx: dict[str, Any] | None = None,
):
    scripts_dir = repo / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_active_task  # type: ignore[import-not-found]

    return resolve_active_task(repo, stdin_ctx or {}, platform="snow")


def _workflow_phase_summary(
    repo: Path,
    stdin_ctx: dict[str, Any] | None = None,
) -> list[str]:
    lines: list[str] = []
    workflow = repo / ".trellis" / "workflow.md"
    if _is_active_path(repo, workflow) and workflow.is_file():
        body = _read_text(workflow, repo, 900)
        if body:
            lines.extend(["## workflow.md excerpt", body, ""])

    # Prefer classic path; fall back only to the *current* runtime session file.
    session_md = repo / ".trellis" / "session" / "current.md"
    if _is_active_path(repo, session_md) and session_md.is_file():
        body = _read_text(session_md, repo, 1200)
        if body:
            lines.extend(["## .trellis/session/current.md", body, ""])
    else:
        active = _resolve_active_task(repo, stdin_ctx)
        if active.error or active.stale:
            lines.append(f"Task binding error: {active.error or 'stale binding'}")
        elif active.task_path:
            lines.extend([
                f"## runtime session ({active.context_key})",
                f"Current task: {active.task_path}",
                f"Task workspace: {active.task_workspace_root}",
                "",
            ])
    return lines


def build_context(
    repo: Path,
    *,
    mode: str,
    stdin_ctx: dict[str, Any],
) -> str:
    compact = mode == "user"
    kind = _agent_kind(stdin_ctx) if mode == "subagent" else "generic"

    lines: list[str] = [
        "# Trellis context (Snow CLI)",
        "",
        f"Mode: {mode}" + (f" | agentKind: {kind}" if mode == "subagent" else ""),
        f"Repo: {repo}",
        "",
    ]

    if stdin_ctx.get("sessionId"):
        lines.append(f"Snow sessionId: {stdin_ctx.get('sessionId')}")
    if stdin_ctx.get("cwd"):
        lines.append(f"Hook cwd: {stdin_ctx.get('cwd')}")
    if mode == "subagent":
        if stdin_ctx.get("agentId") or stdin_ctx.get("agentName"):
            lines.append(
                f"Sub-agent: {stdin_ctx.get('agentId') or stdin_ctx.get('agentName')}"
            )
        prompt = stdin_ctx.get("prompt")
        if isinstance(prompt, str) and prompt.strip():
            p = prompt.strip()
            if len(p) > 240:
                p = p[:237] + "..."
            lines.append(f"Dispatch prompt (truncated): {p}")
        lines.append("")

    active = _resolve_active_task(repo, stdin_ctx)
    if active.error or active.stale:
        lines.append(f"Task binding error: {active.error or 'stale binding'}")
        return "\n".join(lines)
    task_dir = active.resolved_task_path
    current = active.task_path or ""
    lines.extend(["## Current session task", current or "(none)", f"Source: {active.source}", ""])
    if active.task_workspace_root:
        lines.append(f"Caller workspace: {repo}; task workspace: {active.task_workspace_root}")
        repo = active.task_workspace_root

    if task_dir and _is_active_path(repo, task_dir) and task_dir.exists():
        lines.extend(
            _task_artifact_summary(
                task_dir,
                repo,
                detailed=not compact,
                kind=kind if mode == "subagent" else "generic",
            )
        )
    elif current:
        lines.append("(could not resolve active task directory from task.py output)")
        lines.append("")

    if not compact:
        lines.extend(_workflow_phase_summary(repo, stdin_ctx))

        identity = repo / ".trellis" / "identity.md"
        if _is_active_path(repo, identity) and identity.is_file():
            body = _read_text(identity, repo, 900 if mode == "subagent" else 1200)
            if body:
                lines.extend(["## .trellis/identity.md", body, ""])
    else:
        # Compact: short identity one-liner if file exists.
        identity = repo / ".trellis" / "identity.md"
        if _is_active_path(repo, identity) and identity.is_file():
            body = _read_text(identity, repo, 280)
            if body:
                first = body.splitlines()[0].strip()
                lines.append(f"Identity: {first}")
                lines.append("")

    # Mode-specific checklist (keep short).
    if mode == "subagent" and kind == "research":
        task_hint = (
            task_dir.as_posix()
            if task_dir
            else "<path from task.py current>"
        )
        lines.extend(
            [
                "## Sub-agent checklist (research)",
                f"1. Active task: {task_hint}",
                f"2. Write ONLY under `{task_hint}/research/`.",
                "3. Return paths + one-line summaries to main session.",
                "",
            ]
        )
    elif mode == "subagent" and kind == "check":
        lines.extend(
            [
                "## Sub-agent checklist (check)",
                "1. `git diff` + diagnostics first.",
                "2. Compare against prd/design/implement + specs.",
                "3. Self-fix; no git commit/push/merge.",
                "",
            ]
        )
    elif mode == "subagent" and kind == "implement":
        lines.extend(
            [
                "## Sub-agent checklist (implement)",
                "1. Read prd + design/implement artifacts before coding.",
                "2. Prefer Active task path from task.py / inject above.",
                "3. No git commit/push/merge from implement agent.",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## Main-session checklist",
                "1. Session/user hooks auto-inject Trellis context; `/trellis-start` is optional."
                if not compact
                else "1. Compact inject — full context also at `.snow/log/trellis-context.txt`.",
                "2. When dispatching implement/check/research, start the prompt with:",
                "   `Active task: <path from task.py current>`",
                "3. Do not git commit/push/merge from Trellis implement/check agents.",
                "",
            ]
        )

    return "\n".join(lines).strip() + "\n"


def _truncate(text: str, max_bytes: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    suffix = "\n... (truncated)\n"
    budget = max(0, max_bytes - len(suffix.encode("utf-8")))
    return encoded[:budget].decode("utf-8", errors="ignore") + suffix


def main() -> int:
    try:
        raw_stdin = _drain_stdin()
        stdin_ctx = _parse_stdin_json(raw_stdin)
        mode = _resolve_mode(sys.argv, os.environ, stdin_ctx)

        cwd_hint = stdin_ctx.get("cwd") if isinstance(stdin_ctx.get("cwd"), str) else None
        cwd = Path(cwd_hint or os.environ.get("SNOW_CWD") or os.getcwd())
        repo = _find_repo_root(cwd)
        context = build_context(repo, mode=mode, stdin_ctx=stdin_ctx)

        log_dir = repo / ".snow" / "log"
        try:
            if not _is_active_path(repo, log_dir / "trellis-context.txt"):
                raise ValueError("Historical or unavailable context log destination")
            log_dir.mkdir(parents=True, exist_ok=True)
            # Keep trellis-context.txt as the richest practical breadcrumb for
            # pull-based reads. User-mode inject stays compact, but must not
            # clobber a prior full snapshot.
            log_path = log_dir / "trellis-context.txt"
            if mode == "user":
                full_context = build_context(repo, mode="session", stdin_ctx=stdin_ctx)
                log_path.write_text(full_context, encoding="utf-8")
            else:
                log_path.write_text(context, encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"trellis-context write failed: {exc}\n")

        max_bytes = COMPACT_MAX_BYTES if mode == "user" else DEFAULT_MAX_BYTES
        inject = _truncate(context, max_bytes)
        display = {
            "session": "Trellis session context injected",
            "user": "Trellis compact breadcrumb",
            "subagent": f"Trellis sub-agent context ({_agent_kind(stdin_ctx)})",
        }.get(mode, "Trellis context refreshed")
        display = f"{display} (.snow/log/trellis-context.txt)"

        payload = {
            "additionalContext": inject,
            "display": display,
        }
        sys.stdout.write(json.dumps(payload, ensure_ascii=False))
        sys.stdout.write("\n")
        return 0
    except Exception as exc:  # noqa: BLE001 — absolute fail-open
        try:
            sys.stderr.write(f"write-trellis-context failed: {exc}\n")
            # Still emit empty-safe JSON so host can continue.
            sys.stdout.write(
                json.dumps(
                    {
                        "additionalContext": "# Trellis context unavailable (hook error)\n",
                        "display": "Trellis context hook error (fail-open)",
                    },
                    ensure_ascii=False,
                )
            )
            sys.stdout.write("\n")
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
