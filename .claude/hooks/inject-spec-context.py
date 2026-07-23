#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Path-Scoped Spec Context Injection Hook

When the agent edits a file, the specs that govern that file are injected
right then — small, relevant, budgeted — instead of everything up front or
nothing at all. Spec .md files under .trellis/spec/ declare which code paths
they govern via YAML frontmatter (`paths:` glob list); the matching engine
lives in .trellis/scripts/common/spec_match.py.

Trigger: PostToolUse (matchers: Edit, Write, MultiEdit) — registered on
Claude Code only this iteration. The script keeps the shared-hooks
platform-neutral shape so later platform registrations are wiring-only.

Behavior:
- Session dedup: a spec is injected at most once per session (state file
  .trellis/.runtime/spec-injection/<session_id>.json maps spec rel path →
  mtime at injection). Touching the spec file re-arms injection. All state
  IO is fail-open: unreadable/unwritable state ⇒ inject rather than skip.
- Budget (config.yaml `spec_injection:`): per-spec cap `max_spec_bytes`
  (default 8192) with UTF-8-safe truncation + in-body notice; per-event cap
  `max_total_bytes` (default 9000 — Claude Code's documented
  additionalContext ceiling is 10,000 chars, stay under with margin).
  `0` = unlimited. Once the total budget is exhausted, remaining matches
  degrade to one <spec-index> block of `- <path> — <description>` lines —
  never silently dropped.
- Never blocks, never crashes: non-matching events, missing file_path, no
  matches, any internal error → exit 0 with no stdout (stderr warnings
  allowed).
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

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
STATE_DIR_REL = f"{DIR_WORKFLOW}/.runtime/spec-injection"

# Tools whose edits trigger spec matching (Claude Code tool names).
EDIT_TOOLS = ("Edit", "Write", "MultiEdit")

# Budget defaults sized against Claude Code's documented 10,000-character
# additionalContext ceiling — stay under with margin. `0` = unlimited.
DEFAULT_MAX_SPEC_BYTES = 8192
DEFAULT_MAX_TOTAL_BYTES = 9000

# Dedup state files for other sessions older than this are pruned.
STATE_MAX_AGE_SECONDS = 48 * 60 * 60


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


def get_spec_injection_settings(root: Path) -> tuple[bool, int, int]:
    """Return (enabled, max_spec_bytes, max_total_bytes).

    Reads the ``spec_injection:`` section of ``.trellis/config.yaml``:

        spec_injection:
          enabled: true
          max_spec_bytes: 8192
          max_total_bytes: 9000

    Missing keys use their defaults; ``0`` disables the corresponding limit.
    Invalid values fall back to the default for that key with a stderr
    warning.
    """
    enabled = True
    limits = {
        "max_spec_bytes": DEFAULT_MAX_SPEC_BYTES,
        "max_total_bytes": DEFAULT_MAX_TOTAL_BYTES,
    }

    config = _read_trellis_config(root)
    section = config.get("spec_injection") if isinstance(config, dict) else None
    if not isinstance(section, dict):
        return enabled, limits["max_spec_bytes"], limits["max_total_bytes"]

    raw_enabled = section.get("enabled", True)
    if isinstance(raw_enabled, bool):
        enabled = raw_enabled
    else:
        s = str(raw_enabled).strip().lower()
        if s in ("false", "no", "0", "off"):
            enabled = False
        elif s not in ("true", "yes", "1", "on"):
            print(
                f"[inject-spec-context] WARN: invalid spec_injection.enabled "
                f"value: {raw_enabled!r}; using true (default)",
                file=sys.stderr,
            )

    for key, default_value in list(limits.items()):
        if key not in section:
            continue
        raw = section[key]
        try:
            value = int(raw)
        except (TypeError, ValueError):
            value = -1
        if value < 0:
            print(
                f"[inject-spec-context] WARN: invalid spec_injection.{key} "
                f"value: {raw!r}; using default {default_value}",
                file=sys.stderr,
            )
            continue
        limits[key] = value

    return enabled, limits["max_spec_bytes"], limits["max_total_bytes"]


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
# Session dedup state (.trellis/.runtime/spec-injection/<session_id>.json)
# =============================================================================


def _sanitize_session_id(raw: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", raw.strip())
    safe = safe.strip("._-")
    return safe[:160] if safe else ""


def get_state_path(root: Path, session_id: str) -> Path | None:
    """Return the dedup state file for this session, or None (dedup off)."""
    safe = _sanitize_session_id(session_id)
    if not safe:
        return None
    return root / DIR_WORKFLOW / ".runtime" / "spec-injection" / f"{safe}.json"


def load_state(state_path: Path | None) -> dict[str, float]:
    """Load {spec rel path: mtime-at-injection}. Fail-open to {} (inject)."""
    if state_path is None:
        return {}
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    result: dict[str, float] = {}
    for key, value in data.items():
        if isinstance(key, str) and isinstance(value, (int, float)):
            result[key] = float(value)
    return result


def save_state(state_path: Path | None, state: dict[str, float]) -> None:
    """Persist dedup state. Best-effort — failure never blocks injection."""
    if state_path is None:
        return
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(
            json.dumps(state, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    except Exception:
        print(
            f"[inject-spec-context] WARN: could not write dedup state "
            f"{state_path} — specs may be re-injected",
            file=sys.stderr,
        )


def prune_stale_state(state_path: Path | None) -> None:
    """Remove sibling session state files older than 48 h. Best-effort."""
    if state_path is None:
        return
    try:
        now = time.time()
        for sibling in state_path.parent.glob("*.json"):
            if sibling == state_path:
                continue
            try:
                if now - sibling.stat().st_mtime > STATE_MAX_AGE_SECONDS:
                    sibling.unlink()
            except OSError:
                continue
    except Exception:
        pass


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


def _spec_mtime(spec_path: Path) -> float | None:
    try:
        return spec_path.stat().st_mtime
    except OSError:
        return None


def build_payload(
    root: Path,
    edited_rel: str,
    matches: list,
    state: dict[str, float],
    max_spec_bytes: int,
    max_total_bytes: int,
) -> tuple[str, dict[str, float]]:
    """Assemble the additionalContext payload from eligible spec matches.

    Returns (payload, injected) where ``injected`` maps spec rel path →
    mtime-at-injection for the specs whose bodies were inlined this event
    (budget-degraded index lines are not recorded — they stay eligible).
    """
    blocks: list[str] = []
    index_lines: list[str] = []
    injected: dict[str, float] = {}
    used = 0

    for match in matches:
        mtime = _spec_mtime(match.spec_path)
        recorded = state.get(match.rel_path)
        if recorded is not None and mtime is not None and recorded == mtime:
            continue  # already injected this session, spec unchanged

        try:
            data = match.spec_path.read_bytes()
        except OSError:
            print(
                f"[inject-spec-context] WARN: cannot read {match.rel_path} — skipped",
                file=sys.stderr,
            )
            continue

        truncated = truncate_utf8(data, max_spec_bytes)
        content = truncated.decode("utf-8", errors="replace")
        if len(truncated) < len(data):
            content += _truncate_notice(match.rel_path, max_spec_bytes)

        block = (
            f'<spec-context file="{edited_rel}" spec="{match.rel_path}">\n'
            f"{content}\n"
            f"</spec-context>"
        )
        block_size = len(block.encode("utf-8"))
        if max_total_bytes > 0 and used + block_size > max_total_bytes:
            # Budget exhausted — degrade to an index line, never drop silently.
            description = match.description or "no description"
            index_lines.append(f"- {match.rel_path} — {description}")
            continue

        used += block_size
        blocks.append(block)
        if mtime is not None:
            injected[match.rel_path] = mtime

    if index_lines:
        blocks.append("<spec-index>\n" + "\n".join(index_lines) + "\n</spec-index>")

    return "\n\n".join(blocks), injected


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

    enabled, max_spec_bytes, max_total_bytes = get_spec_injection_settings(root)
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

    session_id = input_data.get("session_id")
    state_path = (
        get_state_path(root, session_id) if isinstance(session_id, str) else None
    )
    prune_stale_state(state_path)
    state = load_state(state_path)

    edited_rel = _repo_rel(root, file_path)
    payload, injected = build_payload(
        root, edited_rel, matches, state, max_spec_bytes, max_total_bytes
    )

    if injected:
        state.update(injected)
        save_state(state_path, state)

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
