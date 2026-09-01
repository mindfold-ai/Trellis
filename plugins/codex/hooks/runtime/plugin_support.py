"""Data-only helpers used by the reviewed Codex plugin runtime.

This module intentionally has no imports from the active repository.  The
plugin may read repository state, but a project must not be able to replace
Python modules that execute inside the reviewed hook process.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ActiveTask:
    """A task pointer read from the repository's JSON session state."""

    task_path: str | None
    source_type: str
    context_key: str | None = None
    stale: bool = False

    @property
    def source(self) -> str:
        """Return the same diagnostic source label as Trellis' resolver."""
        if self.source_type == "session" and self.context_key:
            return f"session:{self.context_key}"
        if self.source_type == "session-fallback" and self.context_key:
            return f"session-fallback:{self.context_key}"
        return self.source_type


def _string(value: Any) -> str | None:
    """Return a trimmed non-empty string, or ``None`` for other values."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _lookup(data: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    """Find the first requested string key in a payload or its known nests."""
    for key in keys:
        value = _string(data.get(key))
        if value:
            return value
    for nested_key in ("input", "properties", "event", "hook_input", "hookInput"):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            value = _lookup(nested, keys)
            if value:
                return value
    return None


def _sanitize(value: str) -> str:
    """Convert an external identifier into a safe, bounded filename fragment."""
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip()).strip("._-")
    return safe[:160]


def _context_key(platform: str, kind: str, value: str) -> str:
    """Build the stable session filename key used by Trellis runtime state."""
    safe_platform = {"zcode": "claude", "factory": "droid"}.get(platform, platform)
    if kind == "transcript":
        value = hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
        return f"{safe_platform}_transcript_{value}"
    safe_value = _sanitize(value)
    if not safe_value:
        safe_value = hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
    return f"{safe_platform}_{safe_value}"


def _platform(data: dict[str, Any], explicit: str | None) -> str:
    """Resolve and sanitize the platform label associated with a hook payload."""
    if explicit:
        return _sanitize(explicit) or "session"
    for key in ("_trellis_platform", "trellis_platform", "platform", "source"):
        value = _string(data.get(key))
        if value:
            return _sanitize(value) or "session"
    return "session"


def _resolve_context_key(
    data: dict[str, Any],
    platform: str | None,
    *,
    allow_environment_context: bool = True,
) -> str | None:
    """Derive a session key from payload fields or, when allowed, environment."""
    if allow_environment_context:
        override = _string(os.environ.get("TRELLIS_CONTEXT_ID"))
        if override:
            return _sanitize(override) or hashlib.sha256(override.encode("utf-8")).hexdigest()[:24]

    platform_name = _platform(data, platform)
    session_id = _lookup(data, ("session_id", "sessionId", "sessionID", "thread_id", "threadId"))
    if session_id:
        return _context_key(platform_name, "session", session_id)
    conversation_id = _lookup(data, ("conversation_id", "conversationId", "conversationID"))
    if conversation_id:
        return _context_key(platform_name, "conversation", conversation_id)
    transcript = _lookup(data, ("transcript_path", "transcriptPath", "transcript"))
    if transcript:
        return _context_key(platform_name, "transcript", transcript)

    env_keys = {
        "codex": ("CODEX_THREAD_ID",),
        "claude": ("CLAUDE_CODE_SESSION_ID",),
        "gemini": ("GEMINI_SESSION_ID",),
        "qoder": ("QODER_SESSION_ID",),
        "kiro": ("KIRO_SESSION_ID",),
        "copilot": ("COPILOT_SESSION_ID", "COPILOT_SESSIONID"),
        "snow": ("SNOW_SESSION_ID",),
    }
    if allow_environment_context:
        for env_key in env_keys.get(platform_name, ()):
            value = _string(os.environ.get(env_key))
            if value:
                return _context_key(platform_name, "session", value)
    return None


def resolve_context_key(data: dict[str, Any], platform: str | None = None) -> str | None:
    """Resolve a session context key for plugin runtimes."""
    return _resolve_context_key(data, platform)


def _safe_task_path(root: Path, task_ref: str) -> Path | None:
    """Resolve a task reference only when it remains inside the repository."""
    candidate = Path(task_ref)
    try:
        resolved = (candidate if candidate.is_absolute() else root / candidate).resolve()
        root_real = root.resolve()
        workflow_real = (root / ".trellis").resolve()
        try:
            resolved.relative_to(root_real)
        except ValueError:
            resolved.relative_to(workflow_real)
        return resolved
    except (OSError, ValueError):
        return None


def _active_from_ref(root: Path, task_ref: str | None, source: str, key: str | None) -> ActiveTask | None:
    """Convert a persisted task reference into an ``ActiveTask`` value."""
    if not task_ref:
        return None
    resolved = _safe_task_path(root, task_ref)
    return ActiveTask(task_ref, source, key, resolved is None or not resolved.is_dir())


def resolve_active_task(
    root: Path,
    data: dict[str, Any],
    platform: str | None = None,
    *,
    allow_single_session_fallback: bool = True,
    allow_environment_context: bool = True,
) -> ActiveTask:
    """Resolve the active task from JSON session files without code imports.

    Native sub-agent starts disable environment and sole-session inference
    because an unknown parent identity must never borrow another window's task.
    """
    sessions = root / ".trellis" / ".runtime" / "sessions"
    key = _resolve_context_key(
        data, platform, allow_environment_context=allow_environment_context,
    )
    if key:
        context = _read_json(sessions / f"{key}.json")
        active = _active_from_ref(root, _string((context or {}).get("current_task")), "session", key)
        if active:
            return active

    try:
        files = sorted(sessions.glob("*.json"))
    except OSError:
        files = []
    if allow_single_session_fallback and len(files) == 1:
        context = _read_json(files[0]) or {}
        active = _active_from_ref(
            root, _string(context.get("current_task")), "session-fallback", files[0].stem,
        )
        if active:
            return active
    return ActiveTask(None, "none", key)


def _read_json(path: Path) -> dict[str, Any] | None:
    """Read a JSON object, returning ``None`` for invalid or inaccessible data."""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _strip_comment(value: str) -> str:
    """Remove a simple YAML-style trailing comment from a scalar value."""
    match = re.search(r"\s+#", value)
    return value[: match.start()].rstrip() if match else value.strip()


def read_config(root: Path) -> dict[str, Any]:
    """Parse the small mapping subset used by hook configuration."""
    path = root / ".trellis" / "config.yaml"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    result: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, result)]
    for raw in lines:
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        text = raw.strip()
        if ":" not in text or text.startswith("-"):
            continue
        key, raw_value = text.split(":", 1)
        key = key.strip()
        if not key or not re.match(r"^[A-Za-z0-9_-]+$", key):
            continue
        while stack[-1][0] >= indent:
            stack.pop()
        parent = stack[-1][1]
        value = _strip_comment(raw_value).strip()
        if not value:
            child: dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child))
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        parent[key] = value
    return result


def is_codex_plugin_mode(root: Path) -> bool:
    """Return whether the repository opted into plugin-owned Codex hooks."""
    codex = read_config(root).get("codex")
    return isinstance(codex, dict) and str(codex.get("hook_mode", "")).strip().lower() == "plugin"


def context_injection_limits(config: dict[str, Any]) -> dict[str, int]:
    """Return configured context byte limits, falling back to safe defaults."""
    defaults = {"max_file_bytes": 32768, "max_artifact_bytes": 65536, "max_total_bytes": 131072}
    section = config.get("context_injection")
    if not isinstance(section, dict):
        return defaults
    result = dict(defaults)
    for key, default in defaults.items():
        try:
            value = int(section.get(key, default))
        except (TypeError, ValueError):
            continue
        if value >= 0:
            result[key] = value
    return result
