#!/usr/bin/env python3
"""Session-scoped active task resolution.

The pointer is keyed by session under the Git common directory. Non-Git
projects keep local storage; obsolete checkout-local records are only detected
so callers can require an explicit rebind.
"""

from __future__ import annotations

import hashlib
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .io import read_json as _io_read_json
from .path_boundary import ProjectPathError, require_project_path
from .session_storage import (
    SessionBindingError, SessionRecord, read_record, record_exists, records, remove_records,
    repository_facts, resolve_task_identity, session_path, sessions_directory,
    task_location, unsupported_checkout_session_paths, validate_workspace,
    write_record,
)
from .task_utils import TaskIdentityError, read_task_identity

DIR_WORKFLOW = ".trellis"
DIR_TASKS = "tasks"
DIR_RUNTIME = ".runtime"
DIR_SESSIONS = "sessions"
DIR_SHELL_TICKETS = "shell-tickets"
# Pre-0.6.13 name, when the bridge was Cursor-only. Still read so a session that
# was mid-command across an upgrade does not silently degrade; never written.
# Tickets are 30-second ephemera, so the old directory ages out by itself —
# there is nothing to migrate, only a glob on a directory that is normally
# absent. The alternative (ignore it) would land its one lost command on the
# platform that works today.
DIR_LEGACY_CURSOR_SHELL_TICKETS = "cursor-shell"
SHELL_TICKET_TTL_SECONDS = 30
TASK_SESSION_COMMANDS = {"start", "current", "finish"}

_SESSION_KEYS = ("session_id", "sessionId", "sessionID")
_CONVERSATION_KEYS = ("conversation_id", "conversationId", "conversationID")
_TRANSCRIPT_KEYS = ("transcript_path", "transcriptPath", "transcript")
_NESTED_KEYS = ("input", "properties", "event", "hook_input", "hookInput")
# Every name below records how it was checked. Do NOT add a name by analogy
# with a neighbour: a 2026-08-05 audit of all 21 platforms found 12 of the 21
# declared names had never existed anywhere — they were pattern-guessed from a
# `<PLATFORM>_SESSION_ID` shape no vendor agreed to, and the uniformity was the
# only "evidence" behind them. A platform with no verified name belongs in no
# table; it resolves through TRELLIS_CONTEXT_ID or its hook/plugin bridge.
_ENV_SESSION_KEYS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # REAL (reported 2026-08-13 against DSH 0.1.0-rc.6 by @SajoLuo, from a live
    # run: DSH exports DSH_SESSION_ID plus DSH_SHELL=1 into its managed shell).
    # MUST STAY FIRST. A DSH session can inherit an outer host's identity — a
    # DSH launched from Codex still carries CODEX_THREAD_ID — and the untargeted
    # lookup below walks this table in order, so any earlier entry would claim
    # the session and write a foreign `codex_<thread>` pointer for DSH work.
    # DSH_SESSION_ID is the only name here no other vendor sets, so first place
    # is safe: it cannot mis-claim a non-DSH session.
    ("dsh", ("DSH_SESSION_ID",)),
    # REAL, undocumented (verified 2026-08-05 in a live Claude Code 2.1.221 bash
    # child; absent from code.claude.com/docs/en/env-vars). CLAUDE_SESSION_ID
    # was removed here — verified absent from that same live environment.
    ("claude", ("CLAUDE_CODE_SESSION_ID",)),
    # REAL, undocumented (verified 2026-08-05: injected by codex-cli 0.146.0
    # into shell children, absent from the parent env; openai/codex#19937).
    # CODEX_SESSION_ID was removed — absent from a live `codex exec` env.
    ("codex", ("CODEX_THREAD_ID",)),
    # REAL but HOOK-SCOPE ONLY (verified 2026-08-05): set by Gemini's
    # hookRunner.ts. Its shell tool builds the child env in
    # shellExecutionService.ts and adds only GEMINI_CLI/TERM/PAGER/GIT_PAGER, so
    # this never reaches a bash child — it resolves only inside a hook process.
    ("gemini", ("GEMINI_SESSION_ID",)),
    # REAL but HOOK-SCOPE ONLY (verified 2026-08-05): docs.qoder.com/zh/
    # extensions/hooks documents it as injected during hook execution by the
    # Qoder *IDE plugin*. Absent from the Qoder CLI hook docs and from Lingma.
    ("qoder", ("QODER_SESSION_ID",)),
    # UNVERIFIED (2026-08-05): absent from kiro.dev/docs/hooks/, but Dynatrace
    # dtctl, oh-my-agent and gastown all key agent detection on it and one notes
    # it is "set in both interactive and --no-interactive". Kept because that is
    # absence of evidence, not evidence of absence. To settle: run
    # `env | grep KIRO` from a Kiro shell-tool call on a machine with Kiro.
    ("kiro", ("KIRO_SESSION_ID",)),
    # UNVERIFIED (2026-08-05): absent from docs.github.com/en/copilot/reference/
    # hooks-reference and from the CLI programmatic reference. To settle: run
    # `copilot help environment` (the authoritative list per those docs) — not
    # runnable here, the CLI is not installed and copilot-cli ships no source.
    ("copilot", ("COPILOT_SESSION_ID", "COPILOT_SESSIONID")),
    # REASONED, UNVERIFIED (2026-08-05): ZCode is closed-source and not
    # installable here. It mirrors Claude's naming elsewhere (CLAUDE_PLUGIN_ROOT
    # / CLAUDE_PLUGIN_DATA compat aliases are in its docs), and the previously
    # declared CLAUDE_SESSION_ID does not exist on Claude Code either — so the
    # name ZCode would actually reuse is CLAUDE_CODE_SESSION_ID. Try that first,
    # keep the historical name as a fallback: if neither exists nothing changes.
    # Platform-scoped lookup (_iter_env_keys filters by platform name), so the
    # entry only fires once the resolver detected "zcode" — no collision with
    # the claude entry above.
    ("zcode", ("CLAUDE_CODE_SESSION_ID", "CLAUDE_SESSION_ID")),
    # REAL by vendor design (verified 2026-08-05): Snow's sessionIdentityEnv.ts
    # exports SNOW_SESSION_ID into hook/terminal/sub-agent children and names
    # Trellis in its source header. TRELLIS_CONTEXT_ID stays the preferred
    # override — Snow sets that too.
    ("snow", ("SNOW_SESSION_ID",)),
)
_ENV_CONVERSATION_KEYS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # REAL in cursor-agent (CLI), undocumented (verified 2026-08-05: the value
    # matches ~/.cursor/chats/<ws>/<id>). The Cursor *IDE* is unverified — a
    # 2026-05 forum request for it drew no staff reply. The invented
    # CURSOR_SESSION_ID was removed from the session table: empty in a live
    # cursor-agent shell. Cursor's other path is the shell ticket below
    # (_lookup_shell_ticket_context_key), which is not Cursor-specific.
    ("cursor", ("CURSOR_CONVERSATION_ID", "CURSOR_CONVERSATIONID")),
)
_ENV_TRANSCRIPT_KEYS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # REAL but HOOK-SCOPE ONLY (verified 2026-08-05): documented for Cursor hook
    # scripts; empty in the agent's own shell env.
    ("cursor", ("CURSOR_TRANSCRIPT_PATH",)),
    # UNVERIFIED — never researched. The 2026-08-05 audit covered the session
    # table only, so do not infer these are real *or* fake from that work
    # (CLAUDE_/CODEX_TRANSCRIPT_PATH were removed because those two *were*
    # checked: absent from docs and from live envs). To settle each: run
    # `env | grep _TRANSCRIPT_PATH` inside a hook and inside a shell-tool call.
    ("gemini", ("GEMINI_TRANSCRIPT_PATH",)),
    ("droid", ("FACTORY_TRANSCRIPT_PATH", "DROID_TRANSCRIPT_PATH")),
    ("qoder", ("QODER_TRANSCRIPT_PATH",)),
    ("codebuddy", ("CODEBUDDY_TRANSCRIPT_PATH",)),
)
_ENV_PLATFORM_ALIASES = {
    "claude-code": "claude",
    "factory": "droid",
    "factory-ai": "droid",
    "github-copilot": "copilot",
}
# ZCode intentionally reuses Claude's session env var name. Hooks know the host
# is ZCode, while later shell commands see only the shared env name and resolve
# it through the claude entry. Canonicalize both paths to one runtime filename.
_CONTEXT_KEY_PLATFORM_ALIASES = {
    "zcode": "claude",
    # Factory Droid's config directory is `.factory/`, so a hook that names its
    # platform after the directory it was installed in reports "factory". Its
    # sibling hooks report "droid". One runtime filename either way.
    "factory": "droid",
}


@dataclass(frozen=True)
class ActiveTask:
    """Resolved active task state."""

    task_path: str | None
    source_type: str
    context_key: str | None = None
    stale: bool = False
    invocation_root: Path = field(default_factory=Path.cwd)
    repository_common_dir: Path | None = None
    task_workspace_root: Path | None = None
    resolved_task_path: Path | None = None
    error: str | None = None

    @property
    def source(self) -> str:
        """Human-readable source label."""
        if self.source_type == "session" and self.context_key:
            return f"session:{self.context_key}"
        if self.source_type == "session-fallback" and self.context_key:
            return f"session-fallback:{self.context_key}"
        return self.source_type


def normalize_task_ref(task_ref: str) -> str:
    """Normalize a task ref for stable storage and comparison."""
    normalized = task_ref.strip()
    if not normalized:
        return ""

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return str(path_obj)

    normalized = normalized.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]

    if normalized.startswith(f"{DIR_TASKS}/"):
        return f"{DIR_WORKFLOW}/{normalized}"

    return normalized


def resolve_task_ref(task_ref: str, repo_root: Path) -> Path | None:
    """Resolve a task ref to an absolute task directory inside the repo.

    Mirrors `paths.resolve_task_ref` (same containment check). Duplicated
    rather than imported because this module is loaded standalone — hooks add
    it to `sys.path` directly — so it stays zero-relative-import on purpose.
    """
    normalized = normalize_task_ref(task_ref)
    if not normalized:
        return None

    try:
        root = repo_root.resolve()
    except OSError:
        return None

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        candidate = path_obj
    elif normalized.startswith(f"{DIR_WORKFLOW}/"):
        candidate = root / path_obj
    else:
        candidate = root / DIR_WORKFLOW / DIR_TASKS / path_obj

    # Both sides are resolved because repo_root itself may sit behind a
    # symlink (/tmp on macOS does), and resolve() is what collapses `..`
    # instead of leaving it for a lexical relative_to() to wave through.
    try:
        require_project_path(candidate, repo_root)
        resolved = candidate.resolve()
        workflow_real = (root / DIR_WORKFLOW).resolve()
    except (OSError, ProjectPathError):
        return None

    try:
        resolved.relative_to(root)
        return resolved
    except ValueError:
        pass

    # `.trellis` may itself be a symlink into a store outside the repo (#567).
    # The workflow dir's own real location is then a second legitimate
    # containment base; a ref that escapes BOTH bases is still refused. Map
    # back to the in-repo (lexical) form so callers store a repo-relative ref.
    try:
        rel = resolved.relative_to(workflow_real)
    except ValueError:
        return None

    return root / DIR_WORKFLOW / rel


def _runtime_sessions_dir(repo_root: Path) -> Path:
    directory = repo_root / DIR_WORKFLOW / DIR_RUNTIME / DIR_SESSIONS
    require_project_path(directory, repo_root)
    return directory


def session_files(repo_root: Path) -> list[Path]:
    """Validate session storage before readers or lifecycle mutations proceed."""
    return [record.path for record in records(repository_facts(repo_root))]


def _sanitize_key(raw: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", raw.strip())
    safe = safe.strip("._-")
    return safe[:160] if safe else ""


def _hash_value(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _as_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _string_value(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _lookup_string(data: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = _string_value(data.get(key))
        if value:
            return value

    for nested_key in _NESTED_KEYS:
        nested = _as_dict(data.get(nested_key))
        if not nested:
            continue
        value = _lookup_string(nested, keys)
        if value:
            return value

    return None


def _detect_platform(platform_input: dict[str, Any] | None, platform: str | None) -> str:
    if platform:
        return _sanitize_key(platform) or "session"
    if platform_input:
        for key in ("_trellis_platform", "trellis_platform", "platform", "source"):
            value = _string_value(platform_input.get(key))
            if value:
                return _sanitize_key(value) or "session"
        if _string_value(platform_input.get("cursor_version")):
            return "cursor"
    return "session"


def _context_key(platform_name: str, kind: str, value: str) -> str:
    platform_name = _CONTEXT_KEY_PLATFORM_ALIASES.get(platform_name, platform_name)
    if kind == "transcript":
        return f"{platform_name}_transcript_{_hash_value(value)}"
    safe_value = _sanitize_key(value)
    if safe_value:
        return f"{platform_name}_{safe_value}"
    return f"{platform_name}_{_hash_value(value)}"


def _iter_env_keys(
    env_keys: tuple[tuple[str, tuple[str, ...]], ...],
    platform_name: str | None,
) -> tuple[tuple[str, tuple[str, ...]], ...]:
    """Narrow an env-key table to one platform, or return all of it.

    A platform with no entry yields an empty tuple, and the caller's `for` loop
    simply does not run. That is the normal case, not an error: platforms with
    no verified env var name are deliberately absent from these tables.
    """
    if not platform_name:
        return env_keys
    matched = tuple((name, keys) for name, keys in env_keys if name == platform_name)
    return matched


def _env_platform_name(platform_name: str | None) -> str | None:
    if not platform_name or platform_name == "session":
        return None
    return _ENV_PLATFORM_ALIASES.get(platform_name, platform_name)


def _lookup_env_context_key(platform_name: str | None) -> str | None:
    """Resolve a context key from platform-provided environment variables.

    Hooks pass `TRELLIS_CONTEXT_ID` to subprocesses they launch, but an AI-run
    shell command can only see session identity if the host platform exports it
    in the command environment. These names are best-effort adapters; if none
    are present, there is no session-scoped active task.
    """
    env_platform_name = _env_platform_name(platform_name)

    for name, keys in _iter_env_keys(_ENV_SESSION_KEYS, env_platform_name):
        for key in keys:
            value = _string_value(os.environ.get(key))
            if value:
                return _context_key(name, "session", value)

    for name, keys in _iter_env_keys(_ENV_CONVERSATION_KEYS, env_platform_name):
        for key in keys:
            value = _string_value(os.environ.get(key))
            if value:
                return _context_key(name, "conversation", value)

    for name, keys in _iter_env_keys(_ENV_TRANSCRIPT_KEYS, env_platform_name):
        for key in keys:
            value = _string_value(os.environ.get(key))
            if value:
                return _context_key(name, "transcript", value)

    return None


def _find_repo_root_from_cwd() -> Path | None:
    current = Path.cwd().resolve()
    while True:
        if (current / DIR_WORKFLOW).is_dir():
            return current
        if current == current.parent:
            return None
        current = current.parent


def _shell_ticket_dirs(repo_root: Path) -> tuple[Path, ...]:
    runtime_dir = repo_root / DIR_WORKFLOW / DIR_RUNTIME
    directories = (
        runtime_dir / DIR_SHELL_TICKETS,
        runtime_dir / DIR_LEGACY_CURSOR_SHELL_TICKETS,
    )
    for directory in directories:
        require_project_path(directory, repo_root)
    return directories


def _remove_file(path: Path) -> bool:
    try:
        path.unlink()
        return True
    except OSError:
        return False


def _task_refs_match(left: str | None, right: str | None, repo_root: Path) -> bool:
    if not left or not right:
        return False
    left_path = resolve_task_ref(left, repo_root)
    right_path = resolve_task_ref(right, repo_root)
    if left_path is not None and right_path is not None:
        return left_path == right_path
    return normalize_task_ref(left) == normalize_task_ref(right)


def _pending_ticket_matches_args(ticket: dict[str, Any], repo_root: Path) -> bool:
    if Path(sys.argv[0]).name != "task.py":
        return False
    args = tuple(sys.argv[1:])
    if not args:
        return False

    command_name = args[0]
    if command_name not in TASK_SESSION_COMMANDS:
        return False

    subcommands = ticket.get("subcommands")
    if not isinstance(subcommands, list):
        return False

    for subcommand in subcommands:
        if not isinstance(subcommand, dict):
            continue
        if _string_value(subcommand.get("name")) != command_name:
            continue
        if command_name != "start":
            return True
        task_ref = args[1] if len(args) > 1 else None
        if _task_refs_match(_string_value(subcommand.get("task_ref")), task_ref, repo_root):
            return True

    return False


def _ticket_is_fresh(ticket: dict[str, Any], ticket_path: Path, now: float) -> bool:
    expires_at = ticket.get("expires_at_epoch")
    if isinstance(expires_at, (int, float)) and expires_at < now:
        _remove_file(ticket_path)
        return False

    created_at = ticket.get("created_at_epoch")
    if isinstance(created_at, (int, float)):
        if now - created_at <= SHELL_TICKET_TTL_SECONDS:
            return True
        _remove_file(ticket_path)
        return False
    return True


def _ticket_cwd_matches_repo(ticket: dict[str, Any], repo_root: Path) -> bool:
    cwd = _string_value(ticket.get("cwd"))
    if not cwd:
        return True
    try:
        Path(cwd).resolve().relative_to(repo_root)
    except ValueError:
        return False
    return True


def _matching_ticket_context_key(
    ticket_path: Path,
    repo_root: Path,
    now: float,
) -> str | None:
    """Accept a ticket on its merits, never on which platform wrote it.

    The `platform` field a ticket carries is debugging metadata; gating on it
    was what kept this bridge invisible to every platform but Cursor.
    """
    ticket = _read_json(ticket_path, repo_root)
    if ticket is None:
        return None
    if not _ticket_is_fresh(ticket, ticket_path, now):
        return None
    if not _ticket_cwd_matches_repo(ticket, repo_root):
        return None
    if not _pending_ticket_matches_args(ticket, repo_root):
        return None
    return _string_value(ticket.get("context_key"))


def _lookup_shell_ticket_context_key() -> str | None:
    """Resolve session identity from a short-lived shell ticket.

    No researched platform exports its session id into a shell child, but every
    hook-capable one hands that id to a hook. So the hook that runs just before
    a shell command writes a ticket, and this reads it back. A ticket counts
    only when it is fresh, was written for this repo, and matches the `task.py`
    subcommand now running — and only when exactly one fresh context key
    matches. Two concurrent windows therefore both degrade rather than one
    inheriting the other's pointer.
    """
    repo_root = _find_repo_root_from_cwd()
    if repo_root is None:
        return None

    now = time.time()
    candidates: set[str] = set()
    for ticket_dir in _shell_ticket_dirs(repo_root):
        if not ticket_dir.is_dir():
            continue
        for ticket_path in ticket_dir.glob("*.json"):
            context_key = _matching_ticket_context_key(ticket_path, repo_root, now)
            if context_key:
                candidates.add(context_key)

    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def resolve_context_key(
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
    *,
    allow_environment_context: bool = True,
) -> str | None:
    """Resolve a stable session/window context key, if one is available.

    `TRELLIS_CONTEXT_ID` is an explicit context-key override used by CLI
    scripts and subprocesses. It does not store the task itself.
    """
    if allow_environment_context:
        override = _string_value(os.environ.get("TRELLIS_CONTEXT_ID"))
        if override:
            return _sanitize_key(override) or _hash_value(override)

    data = _as_dict(platform_input)
    platform_name = _detect_platform(data, platform) if data or platform else None

    if data:
        session_id = _lookup_string(data, _SESSION_KEYS)
        if session_id:
            return _context_key(platform_name or "session", "session", session_id)

        conversation_id = _lookup_string(data, _CONVERSATION_KEYS)
        if conversation_id:
            return _context_key(platform_name or "session", "conversation", conversation_id)

        transcript_path = _lookup_string(data, _TRANSCRIPT_KEYS)
        if transcript_path:
            return _context_key(platform_name or "session", "transcript", transcript_path)

    if allow_environment_context:
        env_context_key = _lookup_env_context_key(platform_name)
        if env_context_key:
            return env_context_key

    # Last in the chain on purpose: a platform that genuinely exports identity
    # into the shell outranks a ticket, and no platform name gates the lookup.
    if allow_environment_context:
        return _lookup_shell_ticket_context_key()
    return None


def _read_json(path: Path, repo_root: Path) -> dict[str, Any] | None:
    """Tolerant read of a session runtime file, non-objects included."""
    require_project_path(path, repo_root)
    data = _io_read_json(path)
    return data if isinstance(data, dict) else None


def resolve_active_task(
    repo_root: Path,
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
    *,
    allow_single_session_fallback: bool = False,
    allow_environment_context: bool = True,
) -> ActiveTask:
    """Resolve the active task from session runtime state only.

    Invalid bindings return an error and no usable task path. Missing or
    unmatched session identity does not infer ownership from the
    number of session files. Pull-based child-agent callers that cannot inherit
    a parent identity must opt into the compatibility fallback explicitly.
    """
    root = repo_root.resolve()
    context_key = None
    facts = None
    record = None
    try:
        context_key = resolve_context_key(
            platform_input, platform,
            allow_environment_context=allow_environment_context,
        )
        facts = repository_facts(root)
        if context_key:
            path = session_path(root, context_key, facts)
            if record_exists(path):
                record = read_record(path, root, facts)
            else:
                unsupported = unsupported_checkout_session_paths(
                    facts, context_key
                )
                if unsupported:
                    raise SessionBindingError(
                        "unsupported_binding_schema: "
                        f"{unsupported[0]}; run task.py start"
                    )
            if record is not None:
                resolved = resolve_task_identity(
                    facts, record.task_id, record.lifecycle_generation,
                    preferred_workspace=root,
                )
                return ActiveTask(resolved.task_ref, "session", context_key,
                                  invocation_root=root, repository_common_dir=facts.common_dir,
                                  task_workspace_root=resolved.workspace,
                                  resolved_task_path=resolved.task_path)
            # A known key never falls through to somebody else's session.
        elif allow_single_session_fallback:
            return _resolve_single_session_fallback(root) or ActiveTask(
                None, "none", invocation_root=root, repository_common_dir=facts.common_dir)
        return ActiveTask(None, "none", context_key, invocation_root=root,
                          repository_common_dir=facts.common_dir)
    except ProjectPathError:
        raise
    except (ValueError, OSError, RuntimeError) as exc:
        return ActiveTask(None, "session" if context_key else "none", context_key, True,
                          invocation_root=root,
                          repository_common_dir=facts.common_dir if facts else None,
                          error=str(exc) or type(exc).__name__)


def _resolve_single_session_fallback(repo_root: Path) -> ActiveTask | None:
    """Return the task pointed at by the sole session file, if exactly one exists.

    Used when context-key resolution fails (typical for class-2 platform
    sub-agents). Returns None if 0 or ≥2 session files are present — refuses
    to pick across windows so 04-21's multi-session isolation contract holds.
    """
    facts = repository_facts(repo_root)
    directory = sessions_directory(repo_root, facts)
    files = sorted(directory.glob("*.json")) if directory.is_dir() else []
    for file in files:
        require_project_path(file, repo_root)
    if len(files) != 1:
        return None

    session_file = files[0]
    record = read_record(session_file, repo_root, facts)
    resolved = resolve_task_identity(
        facts, record.task_id, record.lifecycle_generation,
        preferred_workspace=repo_root,
    )
    if resolved.workspace != repo_root.resolve():
        return None
    return ActiveTask(resolved.task_ref, "session-fallback", session_file.stem,
                      invocation_root=repo_root, repository_common_dir=facts.common_dir,
                      task_workspace_root=resolved.workspace,
                      resolved_task_path=resolved.task_path)


def set_active_task(
    task_path: str,
    repo_root: Path,
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
) -> ActiveTask | None:
    """Set the active task in session scope.

    Returns None when no context key is available; callers should surface a
    user-facing error that explains how to provide session identity.
    """
    context_key = resolve_context_key(platform_input, platform)
    if not context_key:
        return None
    facts = repository_facts(repo_root)
    try:
        workspace = task_workspace_for_path(Path(task_path), repo_root)
        canonical, resolved = task_location(task_path, workspace)
    except SessionBindingError:
        return None
    try:
        identity = read_task_identity(resolved / "task.json", workspace)
    except TaskIdentityError as exc:
        raise SessionBindingError(str(exc)) from exc
    selected = resolve_task_identity(
        facts, identity.task_id, identity.lifecycle_generation,
        preferred_workspace=repo_root,
    )
    if selected.task_path != resolved or selected.workspace != workspace:
        raise SessionBindingError(
            f"ambiguous_task_identity: explicit target cannot be selected: {resolved}"
        )
    context_path = session_path(repo_root, context_key, facts)
    context = {
        "schema_version": 2,
        "task_id": identity.task_id,
        "lifecycle_generation": identity.lifecycle_generation,
    }
    write_record(context_path, context, repo_root)
    return ActiveTask(canonical, "session", context_key, invocation_root=facts.invocation_root,
                      repository_common_dir=facts.common_dir, task_workspace_root=workspace,
                      resolved_task_path=resolved)


def task_workspace_for_path(path: Path, repo_root: Path) -> Path:
    """Find an explicit target's Trellis workspace, validated by live Git facts."""
    facts = repository_facts(repo_root)
    root = facts.invocation_root
    if not path.is_absolute():
        return validate_workspace(root, facts)
    # First preserve the caller's legitimate external tasks-root symlink.
    try:
        task_location(str(path), root, metadata=False)
        return validate_workspace(root, facts)
    except SessionBindingError:
        pass
    for parent in path.absolute().parents:
        if parent.name == ".trellis":
            return validate_workspace(parent.parent, facts)
    raise SessionBindingError(f"invalid_task_workspace: {path}")


def clear_active_task(
    repo_root: Path,
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
) -> ActiveTask:
    """Clear the active task by deleting its resolved session context file."""
    previous = resolve_active_task(repo_root, platform_input, platform)
    if previous.error:
        raise SessionBindingError(previous.error)
    if not previous.task_path or not previous.context_key:
        return previous
    remove_records(records(repository_facts(repo_root), key=previous.context_key))
    return previous


def task_session_records(
    task_id: str, lifecycle_generation: int, repo_root: Path
) -> list[SessionRecord]:
    """Preflight and select sessions for one exact lifecycle identity."""
    all_records = records(
        repository_facts(repo_root), ignore_unsupported=True
    )
    return [
        record for record in all_records
        if record.task_id == task_id
        and record.lifecycle_generation == lifecycle_generation
    ]


def clear_task_from_sessions(
    task_id: str,
    lifecycle_generation: int,
    repo_root: Path,
    *,
    selected: list[SessionRecord] | None = None,
) -> int:
    """Delete schema-2 sessions for one exact lifecycle identity."""
    if selected is None:
        selected = task_session_records(task_id, lifecycle_generation, repo_root)
    return remove_records(selected)


def get_current_task_source(
    repo_root: Path,
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
) -> tuple[str, str | None, str | None]:
    """Return (`source_type`, `context_key`, `task_path`) for compatibility."""
    active = resolve_active_task(repo_root, platform_input, platform)
    if active.error:
        raise SessionBindingError(active.error)
    return active.source_type, active.context_key, active.task_path
