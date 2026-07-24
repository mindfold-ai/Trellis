#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Path-Scoped Spec Context Injection Hook (ticket-refresh model, v2)

When the agent touches a file, the specs that govern that file are surfaced
right then — small, relevant, budgeted — instead of everything up front or
nothing at all. Spec .md files under .trellis/spec/ declare which code paths
they govern via YAML frontmatter (`paths:` glob list); the matching engine
lives in .trellis/scripts/common/spec_match.py.

Trigger: PostToolUse (matchers: Read, Edit, Write, MultiEdit) — registered on
Claude Code only this iteration. The script keeps the shared-hooks
platform-neutral shape so later platform registrations are wiring-only.

Behavior — per matched spec, per event (recency-decay aware):

    h    = sha256(spec bytes)
    last = newest emission recorded for (identity, spec)   # stateless → None
    if stateless:              emit TICKET   # bounded cost, always
    elif last is None:         emit FULL     # first time this session
    elif last.sha256 != h:     emit FULL     # spec changed → re-teach
    elif within window:        silent        # fixed window; no state append
    else:                      emit TICKET   # refresh attention cheaply

A FULL block inlines the (budgeted) spec body with a sha256 attr; a TICKET is
a few-hundred-byte reminder pointing back at the spec. Both append a state
record; silent hits do not (fixed window, not sliding — continuous editing is
exactly when drift is worst).

Identity ladder (misfire asymmetry: a collision that MISSES an injection is
unacceptable; drift that OVER-injects is fine):
  T1  session_id | conversation_id | sessionID (+ agent_id when present, so a
      subagent never shares state with its parent).
  T2  transcript_path (hashed).
  T4  none of the above → stateless: no state IO at all, every hit is a TICKET.

State: user-global, out of the repo, append-only JSONL sharded per pid under
${TRELLIS_SPEC_STATE_DIR:-~/.trellis/spec-inject}/<project16>/<identity>.<pid>.jsonl.
Shards merge on read (newest record per spec wins); all state IO is best-effort
and degrades toward emitting. A once-per-hour GC prunes shards older than 48 h.

Budget (config.yaml `spec_injection:`): per-spec cap `max_spec_bytes`
(default 8192) with UTF-8-safe truncation + in-body notice; per-event cap
`max_total_bytes` (default 9000 — Claude Code's documented additionalContext
ceiling is 10,000 chars, stay under with margin). Once the total budget is
exhausted, remaining FULL bodies degrade to one <spec-index> block; tickets are
counted last and dropped (with a stderr warning) only if even they do not fit.

Refresh windows (config.yaml `spec_injection:`): `refresh_window_lines`
(default 300; transcript-line clock) and `refresh_window_seconds` (default
2700; wall-clock fallback). Either `0` = never refresh in that clock mode
(both `0` reproduces the legacy inject-once behavior).

Never blocks, never crashes: non-matching events, missing file_path, no
matches, any internal error → exit 0 with no stdout (stderr warnings allowed).
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

# IMPORTANT: Force stdout to use UTF-8 on Windows
# This fixes UnicodeEncodeError when outputting non-ASCII characters
if sys.platform.startswith("win"):
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")  # type: ignore[union-attr]


# =============================================================================
# Constants
# =============================================================================

DIR_WORKFLOW = ".trellis"
DIR_SPEC = "spec"

# Tools whose events trigger spec matching (Claude Code tool names). Touching a
# file — even a Read — counts; the miss path stays a fast exit.
EDIT_TOOLS = ("Read", "Edit", "Write", "MultiEdit")

# Budget defaults sized against Claude Code's documented 10,000-character
# additionalContext ceiling — stay under with margin. `0` = unlimited.
DEFAULT_MAX_SPEC_BYTES = 8192
DEFAULT_MAX_TOTAL_BYTES = 9000

# Refresh-window defaults. `0` (either key) = never refresh in that clock mode.
DEFAULT_REFRESH_WINDOW_LINES = 300
DEFAULT_REFRESH_WINDOW_SECONDS = 2700

# State-file base dir (overridable for tests / hermeticity) and GC policy.
STATE_ENV_DIR = "TRELLIS_SPEC_STATE_DIR"
STATE_DEFAULT_DIR = "~/.trellis/spec-inject"
GC_MARKER = ".last-gc"
GC_INTERVAL_SECONDS = 60 * 60          # GC runs at most once per hour
STATE_MAX_AGE_SECONDS = 48 * 60 * 60   # shards older than this are pruned

# Bound on how much of a transcript we scan for the line clock. Beyond this we
# fall back to the wall clock rather than pay an unbounded read every event.
TRANSCRIPT_MAX_BYTES = 64 * 1024 * 1024

STATE_VERSION = 1


def _warn(message: str) -> None:
    print(f"[inject-spec-context] WARN: {message}", file=sys.stderr)


def find_trellis_root(start: Path) -> Path | None:
    """Walk up from start to find the directory containing .trellis/.

    Handles CWD drift: subdirectory launches, monorepo packages, etc.
    Returns None if no .trellis/ found (silent no-op).
    """
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / DIR_WORKFLOW).is_dir():
            return cur
        cur = cur.parent
    return None


# =============================================================================
# Config (.trellis/config.yaml `spec_injection:` section)
# =============================================================================


def _read_trellis_config(root: Path) -> dict:
    """Load .trellis/config.yaml via the bundled trellis_config helper.

    The helper lives in .trellis/scripts/common; the hook lives outside the
    scripts tree, so we extend sys.path before importing.
    """
    scripts_dir = root / DIR_WORKFLOW / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.trellis_config import read_trellis_config  # type: ignore[import-not-found]
    except Exception:
        return {}
    try:
        return read_trellis_config(root)
    except Exception:
        return {}


def get_spec_injection_settings(
    root: Path,
) -> tuple[bool, int, int, int, int]:
    """Return (enabled, max_spec_bytes, max_total_bytes,
    refresh_window_lines, refresh_window_seconds).

    Reads the ``spec_injection:`` section of ``.trellis/config.yaml``:

        spec_injection:
          enabled: true
          max_spec_bytes: 8192
          max_total_bytes: 9000
          refresh_window_lines: 300
          refresh_window_seconds: 2700

    Missing keys use their defaults; ``0`` disables the corresponding limit
    (byte caps) or refresh (window keys). Invalid values fall back to the
    default for that key with a stderr warning.
    """
    enabled = True
    numbers = {
        "max_spec_bytes": DEFAULT_MAX_SPEC_BYTES,
        "max_total_bytes": DEFAULT_MAX_TOTAL_BYTES,
        "refresh_window_lines": DEFAULT_REFRESH_WINDOW_LINES,
        "refresh_window_seconds": DEFAULT_REFRESH_WINDOW_SECONDS,
    }

    config = _read_trellis_config(root)
    section = config.get("spec_injection") if isinstance(config, dict) else None
    if isinstance(section, dict):
        raw_enabled = section.get("enabled", True)
        if isinstance(raw_enabled, bool):
            enabled = raw_enabled
        else:
            s = str(raw_enabled).strip().lower()
            if s in ("false", "no", "0", "off"):
                enabled = False
            elif s not in ("true", "yes", "1", "on"):
                _warn(
                    f"invalid spec_injection.enabled value: {raw_enabled!r}; "
                    f"using true (default)"
                )

        for key, default_value in list(numbers.items()):
            if key not in section:
                continue
            raw = section[key]
            try:
                value = int(raw)
            except (TypeError, ValueError):
                value = -1
            if value < 0:
                _warn(
                    f"invalid spec_injection.{key} value: {raw!r}; "
                    f"using default {default_value}"
                )
                continue
            numbers[key] = value

    return (
        enabled,
        numbers["max_spec_bytes"],
        numbers["max_total_bytes"],
        numbers["refresh_window_lines"],
        numbers["refresh_window_seconds"],
    )


# =============================================================================
# UTF-8-safe truncation (issue #441 conventions; self-contained copy —
# shared-hooks scripts are standalone by design)
# =============================================================================


def truncate_utf8(data: bytes, cap: int) -> bytes:
    """Truncate ``data`` to at most ``cap`` bytes without splitting a UTF-8
    multi-byte sequence.

    ``cap <= 0`` means "no limit" — returns ``data`` unchanged.
    """
    if cap <= 0 or len(data) <= cap:
        return data

    truncated = data[:cap]
    i = len(truncated)
    # Back off over continuation bytes (10xxxxxx) to find the lead byte.
    while i > 0 and (truncated[i - 1] & 0xC0) == 0x80:
        i -= 1
    if i == 0:
        return b""

    lead = truncated[i - 1]
    if lead & 0x80:
        if (lead & 0xE0) == 0xC0:
            seq_len = 2
        elif (lead & 0xF0) == 0xE0:
            seq_len = 3
        elif (lead & 0xF8) == 0xF0:
            seq_len = 4
        else:
            seq_len = 1
        # Cut before the lead byte when its full sequence didn't fit;
        # otherwise the trailing sequence is complete — keep it whole.
        if (i - 1) + seq_len > len(truncated):
            return truncated[: i - 1]

    return truncated


def _truncate_notice(path: str, cap: int) -> str:
    return f"\n[Trellis: truncated at {cap} bytes — read {path} for the full content]"


# =============================================================================
# Identity ladder + clock
# =============================================================================


def _sanitize(raw: str) -> str:
    """Collapse a session/agent id into a filename-safe token.

    Restricts to ``[A-Za-z0-9_-]`` (no ``.`` — the shard glob merges on
    ``<identity>.*.jsonl`` and a dot would blur the pid boundary). Degenerate
    inputs (all-special) fall back to a hash so distinct sessions never share
    an identity (collision → missed injection is the unacceptable failure).
    """
    raw = raw.strip()
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_-")
    if not safe:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return safe[:120]


def _shared_context_key(root: Path, payload: dict) -> str | None:
    """Session/window key from the shared resolver every other hook uses.

    ``common.active_task.resolve_context_key`` is the single source of truth
    for session identity: payload keys in all casings (``session_id`` /
    ``sessionId`` / ``sessionID``, conversation and transcript variants),
    nested payload shapes, the explicit ``TRELLIS_CONTEXT_ID`` override,
    per-platform env fallbacks, and Cursor shell tickets — plus the platform
    fixes accumulated behind them. Payload identity is preferred over
    environment context so two live sessions can never collapse onto one
    exported env value (collision → missed injection is the unacceptable
    direction); the environment pass still runs when the payload carries
    nothing.
    """
    try:
        scripts_dir = root / DIR_WORKFLOW / "scripts"
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
        from common.active_task import resolve_context_key  # type: ignore[import-not-found]

        key = resolve_context_key(payload, allow_environment_context=False)
        if key:
            return key
        return resolve_context_key(payload)
    except Exception:
        return None


def resolve_identity(root: Path, payload: dict) -> tuple[str, bool]:
    """Return (identity, stateless) for the refresh-state store.

    The session/window key is delegated to the shared resolver (see
    ``_shared_context_key``); a subagent suffix keeps parent and subagent
    state separate (their contexts are not shared — a spec shown to one was
    never seen by the other). When the shared resolver is unavailable (older
    installed scripts tree), a minimal payload-only ladder keeps the hook
    working. stateless=True means no state IO at all (every hit is a TICKET).
    """
    key = _shared_context_key(root, payload)

    if not key:
        # Minimal payload-only fallback for scripts trees that predate
        # resolve_context_key. Mirrors its payload lookup order.
        for k in ("session_id", "sessionId", "sessionID"):
            value = payload.get(k)
            if isinstance(value, str) and value.strip():
                key = "s-" + value.strip()
                break
        if not key:
            transcript = payload.get("transcript_path")
            if isinstance(transcript, str) and transcript.strip():
                digest = hashlib.sha256(
                    transcript.strip().encode("utf-8")
                ).hexdigest()
                key = "t-" + digest[:16]

    if not key:
        return "", True

    identity = _sanitize(key)
    agent = payload.get("agent_id")
    if isinstance(agent, str) and agent.strip():
        # Parent and subagent do NOT share context — keep state separate.
        # _sanitize strips "+", so this suffix cannot be forged by an id value.
        identity += "+a-" + _sanitize(agent)
    return identity, False


def _transcript_line_count(transcript_path: str | None) -> int | None:
    """Count newlines in the transcript (buffered, bounded). None if the file
    is unreadable, absent, or larger than TRANSCRIPT_MAX_BYTES."""
    if not isinstance(transcript_path, str) or not transcript_path.strip():
        return None
    try:
        count = 0
        read = 0
        with open(transcript_path, "rb") as f:
            while True:
                chunk = f.read(1 << 20)
                if not chunk:
                    break
                read += len(chunk)
                if read > TRANSCRIPT_MAX_BYTES:
                    return None
                count += chunk.count(b"\n")
        return count
    except OSError:
        return None


# =============================================================================
# State (append-only JSONL, sharded per pid, user-global)
# =============================================================================


def _state_base_dir() -> Path:
    override = os.environ.get(STATE_ENV_DIR)
    if override and override.strip():
        return Path(override.strip())
    return Path(os.path.expanduser(STATE_DEFAULT_DIR))


def _project_id(root: Path) -> str:
    return hashlib.sha256(os.path.realpath(str(root)).encode("utf-8")).hexdigest()[:16]


def _maybe_gc(base_dir: Path) -> None:
    """Prune shards older than 48 h, at most once per hour. Best-effort,
    event-independent, errors ignored."""
    try:
        marker = base_dir / GC_MARKER
        now = time.time()
        try:
            age = now - marker.stat().st_mtime
        except OSError:
            age = None
        if age is not None and age < GC_INTERVAL_SECONDS:
            return
        try:
            base_dir.mkdir(parents=True, exist_ok=True)
            marker.touch()
        except OSError:
            return
        for shard in base_dir.rglob("*.jsonl"):
            try:
                if now - shard.stat().st_mtime > STATE_MAX_AGE_SECONDS:
                    shard.unlink()
            except OSError:
                continue
    except Exception:
        pass


def load_state(base_dir: Path, project_id: str, identity: str) -> dict[str, dict]:
    """Merge every ``<identity>.*.jsonl`` shard; newest record per spec wins
    (``ts`` tiebreaker). Malformed lines are skipped silently. Fail-open to {}
    (which drives injection rather than silence)."""
    result: dict[str, dict] = {}
    proj_dir = base_dir / project_id
    try:
        shards = list(proj_dir.glob(f"{identity}.*.jsonl"))
    except OSError:
        return result
    for shard in shards:
        try:
            text = shard.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue
            if not isinstance(record, dict):
                continue
            spec = record.get("spec")
            ts = record.get("ts")
            if not isinstance(spec, str) or not isinstance(ts, (int, float)):
                continue
            previous = result.get(spec)
            if previous is None or ts > previous.get("ts", float("-inf")):
                result[spec] = record
    return result


def make_record(rel_path: str, sha256_hex: str, mode: str, clock: dict, pid: int) -> dict:
    return {
        "v": STATE_VERSION,
        "spec": rel_path,
        "sha256": sha256_hex,
        "mode": mode,
        "ts": clock["ts"],
        "lines": clock["lines"],
        "pid": pid,
    }


def append_records(shard_path: Path, records: list[dict]) -> None:
    """Append records as JSONL to the own-pid shard (O_APPEND). Best-effort —
    a failure warns and proceeds (the emission already went out)."""
    if not records:
        return
    try:
        shard_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        _warn(f"could not create state dir {shard_path.parent} — state not recorded")
        return
    try:
        fd = os.open(
            str(shard_path),
            os.O_WRONLY | os.O_CREAT | os.O_APPEND,
            0o644,
        )
    except OSError:
        _warn(f"could not open state shard {shard_path} — state not recorded")
        return
    try:
        blob = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records)
        os.write(fd, blob.encode("utf-8"))
    except OSError:
        _warn(f"could not write state shard {shard_path} — state may be incomplete")
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


# =============================================================================
# Decision engine
# =============================================================================


def _within_window(clock: dict, last: dict, win_lines: int, win_seconds: int) -> bool:
    """True when the last emission is still inside the refresh window (→ stay
    silent). Compare lines-to-lines when both present, else seconds-to-seconds;
    truly incomparable → past-window (False → refresh, the over-inject side).
    A window of ``0`` means never refresh (infinite window → always True).
    A NEGATIVE delta means the clock went backwards — for the line clock that
    is a transcript rewritten shorter (e.g. /compact), i.e. the earlier
    injection was likely compacted away; for the wall clock, skew. Both are
    treated as past-window per the over-inject asymmetry principle."""
    cur_lines = clock.get("lines")
    last_lines = last.get("lines")
    if cur_lines is not None and isinstance(last_lines, (int, float)):
        if win_lines == 0:
            return True
        delta = cur_lines - last_lines
        return 0 <= delta < win_lines

    cur_ts = clock.get("ts")
    last_ts = last.get("ts")
    if isinstance(cur_ts, (int, float)) and isinstance(last_ts, (int, float)):
        if win_seconds == 0:
            return True
        delta = cur_ts - last_ts
        return 0 <= delta < win_seconds

    return False


def decide(
    stateless: bool,
    last: dict | None,
    sha256_hex: str,
    clock: dict,
    win_lines: int,
    win_seconds: int,
) -> str:
    """Return one of "full" | "ticket" | "silent" for a single spec."""
    if stateless:
        return "ticket"
    if last is None:
        return "full"
    if last.get("sha256") != sha256_hex:
        return "full"
    if _within_window(clock, last, win_lines, win_seconds):
        return "silent"
    return "ticket"


# =============================================================================
# Payload assembly
# =============================================================================


def _repo_rel(root: Path, file_path: str) -> str:
    """Repo-relative POSIX display path; falls back to the raw path."""
    try:
        p = Path(file_path)
        if not p.is_absolute():
            p = root / p
        return p.resolve().relative_to(root.resolve()).as_posix()
    except Exception:
        return str(file_path).replace("\\", "/")


def _full_block(edited_rel: str, spec_rel: str, sha12: str, content: str) -> str:
    return (
        f'<spec-context file="{edited_rel}" spec="{spec_rel}" sha256="{sha12}">\n'
        f"{content}\n"
        f"</spec-context>"
    )


def _ticket_block(edited_rel: str, spec_rel: str, sha12: str) -> str:
    return (
        f'<spec-ticket file="{edited_rel}" spec="{spec_rel}" sha256="{sha12}">\n'
        f"You were shown this spec earlier in this session and its content is unchanged.\n"
        f"It still governs edits to matching files. If you no longer remember it, Read\n"
        f"{spec_rel} before continuing.\n"
        f"</spec-ticket>"
    )


def build_payload(
    edited_rel: str,
    matches: list,
    stateless: bool,
    state_records: dict[str, dict],
    clock: dict,
    pid: int,
    max_spec_bytes: int,
    max_total_bytes: int,
    win_lines: int,
    win_seconds: int,
) -> tuple[str, list[dict]]:
    """Assemble the additionalContext payload from the matched specs.

    Returns (payload, records) where ``records`` are the state lines to append
    for the emissions that actually made it into the payload (silent hits and
    budget-dropped emissions record nothing — they stay eligible).
    """
    full_blocks: list[str] = []
    index_lines: list[str] = []
    ticket_pending: list[tuple[str, str]] = []  # (spec_rel, sha256_hex)
    records: list[dict] = []
    used = 0

    for match in matches:
        try:
            data = match.spec_path.read_bytes()
        except OSError:
            _warn(f"cannot read {match.rel_path} — skipped")
            continue

        sha256_hex = hashlib.sha256(data).hexdigest()
        sha12 = sha256_hex[:12]
        last = None if stateless else state_records.get(match.rel_path)
        decision = decide(stateless, last, sha256_hex, clock, win_lines, win_seconds)

        if decision == "silent":
            continue

        if decision == "full":
            truncated = truncate_utf8(data, max_spec_bytes)
            content = truncated.decode("utf-8", errors="replace")
            if len(truncated) < len(data):
                content += _truncate_notice(match.rel_path, max_spec_bytes)
            block = _full_block(edited_rel, match.rel_path, sha12, content)
            block_size = len(block.encode("utf-8"))
            if max_total_bytes > 0 and used + block_size > max_total_bytes:
                # Budget exhausted — degrade to an index line, never drop
                # silently. Not recorded: stays eligible for a later event.
                description = match.description or "no description"
                index_lines.append(f"- {match.rel_path} — {description}")
                continue
            used += block_size
            full_blocks.append(block)
            records.append(
                make_record(match.rel_path, sha256_hex, "full", clock, pid)
            )
        else:  # "ticket" — deferred; counted against the budget last
            ticket_pending.append((match.rel_path, sha256_hex))

    blocks: list[str] = list(full_blocks)

    if index_lines:
        # The index block is budget-bounded too: lines that do not fit are
        # collapsed into one summary line (count + how to list them via pull
        # mode) so the additionalContext ceiling is honored without silently
        # dropping any governing spec.
        chosen: list[str] = []
        dropped = 0
        if max_total_bytes > 0:
            for line in index_lines:
                candidate = (
                    "<spec-index>\n" + "\n".join([*chosen, line]) + "\n</spec-index>"
                )
                if used + len(candidate.encode("utf-8")) > max_total_bytes:
                    dropped += 1
                    continue
                chosen.append(line)
            if dropped:
                chosen.append(
                    f"- (+{dropped} more governing specs over budget — run "
                    f"get_context.py --mode spec --file {edited_rel} to list them)"
                )
        else:
            chosen = index_lines
        index_block = "<spec-index>\n" + "\n".join(chosen) + "\n</spec-index>"
        blocks.append(index_block)
        used += len(index_block.encode("utf-8"))

    for spec_rel, sha256_hex in ticket_pending:
        ticket = _ticket_block(edited_rel, spec_rel, sha256_hex[:12])
        ticket_size = len(ticket.encode("utf-8"))
        if max_total_bytes > 0 and used + ticket_size > max_total_bytes:
            _warn(f"ticket for {spec_rel} dropped — per-event budget exhausted")
            continue
        used += ticket_size
        blocks.append(ticket)
        records.append(make_record(spec_rel, sha256_hex, "ticket", clock, pid))

    return "\n\n".join(blocks), records


# =============================================================================
# Entry
# =============================================================================


def main() -> int:
    if os.environ.get("TRELLIS_HOOKS") == "0" or os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return 0

    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    if not isinstance(input_data, dict):
        return 0

    tool_name = input_data.get("tool_name", "") or input_data.get("toolName", "")
    if tool_name not in EDIT_TOOLS:
        return 0

    tool_input = input_data.get("tool_input", {})
    if not isinstance(tool_input, dict):
        return 0
    file_path = tool_input.get("file_path")
    if not isinstance(file_path, str) or not file_path.strip():
        return 0
    file_path = file_path.strip()

    cwd = input_data.get("cwd") or os.getcwd()
    root = find_trellis_root(Path(cwd))
    if root is None:
        return 0
    # Bail out before any spec scan when the project has no spec directory.
    if not (root / DIR_WORKFLOW / DIR_SPEC).is_dir():
        return 0

    (
        enabled,
        max_spec_bytes,
        max_total_bytes,
        win_lines,
        win_seconds,
    ) = get_spec_injection_settings(root)
    if not enabled:
        return 0

    scripts_dir = root / DIR_WORKFLOW / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.spec_match import match_specs_for_file  # type: ignore[import-not-found]
    except Exception:
        return 0  # matching engine unavailable — degrade to nothing

    matches = match_specs_for_file(root, file_path)
    if not matches:
        return 0

    identity, stateless = resolve_identity(root, input_data)

    state_records: dict[str, dict] = {}
    shard_path: Path | None = None
    clock = {"lines": None, "ts": time.time()}

    if not stateless:
        base_dir = _state_base_dir()
        _maybe_gc(base_dir)
        project_id = _project_id(root)
        state_records = load_state(base_dir, project_id, identity)
        pid = os.getpid()
        shard_path = base_dir / project_id / f"{identity}.{pid}.jsonl"
        transcript = input_data.get("transcript_path")
        lines = _transcript_line_count(transcript if isinstance(transcript, str) else None)
        clock = {"lines": lines or None, "ts": time.time()}
    else:
        pid = os.getpid()

    edited_rel = _repo_rel(root, file_path)
    payload, records = build_payload(
        edited_rel,
        matches,
        stateless,
        state_records,
        clock,
        pid,
        max_spec_bytes,
        max_total_bytes,
        win_lines,
        win_seconds,
    )

    if not stateless and shard_path is not None and records:
        append_records(shard_path, records)

    if not payload:
        return 0

    output = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": payload,
        }
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # A context hook must never break the tool result or the session.
        sys.exit(0)
