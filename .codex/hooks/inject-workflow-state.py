#!/usr/bin/env python3
"""Trellis per-turn breadcrumb hook (UserPromptSubmit / BeforeAgent equivalent).

Runs on every user prompt. Resolves the active task through Trellis'
session-aware active task resolver and emits a short <workflow-state>
block reminding the main AI what task is active and its expected flow.

The emitted ``hookEventName`` field is platform-aware: most hosts expect
``UserPromptSubmit`` (Claude Code naming, also accepted by Cursor / Qoder /
CodeBuddy / Droid / Codex / Copilot wiring), but Gemini CLI 0.40.x renamed
its per-turn event to ``BeforeAgent`` and its schema validator rejects the
legacy name. ``_detect_platform`` picks the right value at runtime.
Breadcrumb text is pulled exclusively from ``.trellis/workflow.yaml`` and
the ``workflow_states`` body files it references. There are no fallback dicts
in this script: when workflow.yaml is missing or a state body is absent, the
breadcrumb degrades to a generic "Refer to workflow.yaml for current step."
line so users see (and fix) the broken state instead of the hook silently
masking it.

Shared across all hook-capable platforms (Claude, Cursor, Codex, Qoder,
CodeBuddy, Droid, Gemini, Copilot). Kiro is not wired (no per-turn
hook entry point). Written to each platform's hooks directory via
writeSharedHooks() at init time.

Silent exit 0 cases (no output):
  - No .trellis/ directory found (not a Trellis project)
  - task.json malformed or missing status
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional


CODEX_SUB_AGENT_NOTICE = """<sub-agent-notice>
SUB-AGENT NOTICE - READ FIRST IF SPAWNED VIA spawn_agent

If your parent session spawned you via spawn_agent with an explicit task
message above this hook output, that message is your only job.
- Execute the parent message exactly as written, then return.
- Ignore all Trellis workflow guidance below this notice.
- Do NOT call task.py start, task.py add-context, or task.py archive.
- Do NOT call wait_agent or spawn_agent.
- Do NOT modify .trellis/tasks/* or any other file unless the parent message
  explicitly asks for that.

If you are the main interactive Codex session and the user is typing at the
terminal with no parent agent, use the workflow guidance below normally.
</sub-agent-notice>"""


# Bootstrap notice for Codex while the session has no active task. Replaces the
# heavyweight SessionStart context injection — instead of pushing 9.5 KB of
# workflow text up front, we just nudge the AI to read the `trellis-start` skill once.
# The nudge keeps showing up while status == "no_task" (cheap text, AI won't
# re-read after the first time). Once a task is created the breadcrumb status
# flips and this notice stops appearing automatically. Sub-agents are warded
# off by the <sub-agent-notice> above plus the explicit exemption below.
CODEX_NO_TASK_BOOTSTRAP_NOTICE = """<trellis-bootstrap>
You are running in a Trellis-managed Codex session and there is no active task yet.
If you have not already loaded Trellis context this session, read the `trellis-start` skill once:

  $trellis-start

(equivalent to reading `.agents/skills/trellis-start/SKILL.md` and following its Steps 1-3)

The skill walks you through workflow.yaml, dev profile, git status, active tasks, and spec
indexes. Then route the user's request per the <workflow-state> A/B/C rules below.

Sub-agent exemption: if you are a sub-agent (spawned via spawn_agent with a parent task
message), DO NOT read `$trellis-start`. Execute the parent message directly as instructed by the
<sub-agent-notice> above.
</trellis-bootstrap>"""


# ---------------------------------------------------------------------------
# CWD-robust Trellis root discovery (fixes hook-path-robustness for this hook)
# ---------------------------------------------------------------------------

def find_trellis_root(start: Path) -> Optional[Path]:
    """Walk up from start to find directory containing .trellis/.

    Handles CWD drift: subdirectory launches, monorepo packages, etc.
    Returns None if no .trellis/ found (silent no-op).
    """
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / ".trellis").is_dir():
            return cur
        cur = cur.parent
    return None


# ---------------------------------------------------------------------------
# Active task discovery
# ---------------------------------------------------------------------------

def _detect_platform(input_data: dict) -> str | None:
    if isinstance(input_data.get("cursor_version"), str):
        return "cursor"
    env_map = {
        "CLAUDE_PROJECT_DIR": "claude",
        "CURSOR_PROJECT_DIR": "cursor",
        "CODEBUDDY_PROJECT_DIR": "codebuddy",
        "FACTORY_PROJECT_DIR": "droid",
        "GEMINI_PROJECT_DIR": "gemini",
        "QODER_PROJECT_DIR": "qoder",
        "KIRO_PROJECT_DIR": "kiro",
        "COPILOT_PROJECT_DIR": "copilot",
    }
    for env_name, platform in env_map.items():
        if os.environ.get(env_name):
            return platform
    script_parts = set(Path(sys.argv[0]).parts)
    if ".claude" in script_parts:
        return "claude"
    if ".cursor" in script_parts:
        return "cursor"
    if ".codex" in script_parts:
        return "codex"
    if ".gemini" in script_parts:
        return "gemini"
    if ".qoder" in script_parts:
        return "qoder"
    if ".codebuddy" in script_parts:
        return "codebuddy"
    if ".factory" in script_parts:
        return "droid"
    if ".kiro" in script_parts:
        return "kiro"
    return None


def _resolve_active_task(root: Path, input_data: dict):
    scripts_dir = root / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_active_task  # type: ignore[import-not-found]

    return resolve_active_task(root, input_data, platform=_detect_platform(input_data))


def get_active_task(root: Path, input_data: dict) -> Optional[tuple[str, str, str]]:
    """Return (task_id, status, source) from the current active task."""
    active = _resolve_active_task(root, input_data)
    if not active.task_path:
        return None

    task_dir = Path(active.task_path)
    if not task_dir.is_absolute():
        task_dir = root / task_dir
    if active.stale:
        return task_dir.name, f"stale_{active.source_type}", active.source

    task_json = task_dir / "task.json"
    if not task_json.is_file():
        return None
    try:
        data = json.loads(task_json.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    task_id = data.get("id") or task_dir.name
    status = data.get("status", "")
    if not isinstance(status, str) or not status:
        return None
    return task_id, status, active.source


# ---------------------------------------------------------------------------
# Breadcrumb loading: read workflow.yaml, fall back to a broken-state notice
# ---------------------------------------------------------------------------

def load_breadcrumbs(root: Path) -> dict[str, str]:
    """Return {status: body_text} from workflow.yaml workflow_states."""
    scripts_dir = root / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.workflow_model import get_workflow_state_bodies  # type: ignore[import-not-found]
    except Exception:
        return {}
    try:
        return get_workflow_state_bodies(root)
    except Exception:
        return {}


def _read_trellis_config(root: Path) -> dict:
    """Load .trellis/config.yaml via the bundled trellis_config helper.

    The helper lives in .trellis/scripts/common; the hook lives outside the
    scripts tree, so we extend sys.path before importing.
    """
    scripts_dir = root / ".trellis" / "scripts"
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


def _codex_mode_banner(config: dict) -> str:
    """Emit a `<codex-mode>` banner for the additionalContext payload.

    Reads `codex.dispatch_mode` from .trellis/config.yaml; defaults to
    `inline` when missing or invalid because Codex sub-agents run with
    `fork_turns="none"` isolation and can't inherit the parent session's
    task context. The banner makes the active mode explicit to Codex AI
    per turn, complementing the workflow-state body which is per-status.
    Mode tells AI which dispatch protocol to follow; workflow-state tells
    AI what step it's at.
    """
    mode = "inline"
    if isinstance(config, dict):
        codex_cfg = config.get("codex")
        if isinstance(codex_cfg, dict):
            cfg_mode = codex_cfg.get("dispatch_mode")
            if cfg_mode in ("inline", "sub-agent"):
                mode = cfg_mode
    return f"<codex-mode>{mode}</codex-mode>"


def resolve_breadcrumb_key(
    status: str, platform: str | None, config: dict
) -> str:
    """Pick the breadcrumb tag key based on Codex dispatch_mode.

    Codex defaults to ``inline`` because sub-agents run with ``fork_turns="none"``
    isolation and can't inherit the parent session's task context. Users can
    opt into ``codex.dispatch_mode: sub-agent`` in ``.trellis/config.yaml``
    to use the parallel ``<status>-inline`` tag → ``<status>`` flip. Invalid
    or missing values fall back to inline.

    Non-codex platforms return the plain status unchanged.
    """
    if platform == "codex":
        mode = "inline"
        if isinstance(config, dict):
            codex_cfg = config.get("codex")
            if isinstance(codex_cfg, dict):
                cfg_mode = codex_cfg.get("dispatch_mode")
                if cfg_mode in ("inline", "sub-agent"):
                    mode = cfg_mode
        return f"{status}-inline" if mode == "inline" else status
    return status


def build_breadcrumb(
    task_id: Optional[str],
    status: str,
    templates: dict[str, str],
    source: str | None = None,
    breadcrumb_key: str | None = None,
) -> str:
    """Build the <workflow-state>...</workflow-state> block.

    - Known status (body_file present in workflow.yaml) -> detailed body
    - Unknown status (or workflow.yaml missing) -> generic broken-state line
    - `no_task` pseudo-status (task_id is None) → header omits task info
    """
    lookup_key = breadcrumb_key or status
    body = templates.get(lookup_key)
    if body is None and lookup_key != status:
        body = templates.get(status)
    if body is None:
        body = "Refer to workflow.yaml for current step."
    header = f"Status: {status}" if task_id is None else f"Task: {task_id} ({status})"
    if source:
        header = f"{header}\nSource: {source}"
    return f"<workflow-state>\n{header}\n{body}\n</workflow-state>"


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

def main() -> int:
    if os.environ.get("TRELLIS_HOOKS") == "0" or os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return 0

    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        data = {}

    cwd_str = data.get("cwd") or os.getcwd()
    cwd = Path(cwd_str)

    root = find_trellis_root(cwd)
    if root is None:
        return 0  # not a Trellis project

    templates = load_breadcrumbs(root)
    platform = _detect_platform(data)
    config = _read_trellis_config(root)
    task = get_active_task(root, data)
    if task is None:
        # No active task — still emit a breadcrumb nudging AI toward
        # trellis-brainstorm + task.py create when user describes real work.
        no_task_key = resolve_breadcrumb_key("no_task", platform, config)
        breadcrumb = build_breadcrumb(
            None, "no_task", templates, breadcrumb_key=no_task_key
        )
    else:
        task_id, status, source = task
        status_key = resolve_breadcrumb_key(status, platform, config)
        breadcrumb = build_breadcrumb(
            task_id, status, templates, source, breadcrumb_key=status_key
        )
    if platform == "codex":
        parts: list[str] = [CODEX_SUB_AGENT_NOTICE]
        if task is None:
            parts.append(CODEX_NO_TASK_BOOTSTRAP_NOTICE)
        parts.append(_codex_mode_banner(config))
        parts.append(breadcrumb)
        breadcrumb = "\n\n".join(parts)

    # Gemini CLI 0.40.x rejects "UserPromptSubmit" — its per-turn event is
    # named "BeforeAgent". Other platforms (Claude/Cursor/Qoder/CodeBuddy/
    # Droid/Codex/Copilot) accept the original Claude-style name.
    hook_event_name = (
        "BeforeAgent" if platform == "gemini" else "UserPromptSubmit"
    )

    output = {
        "hookSpecificOutput": {
            "hookEventName": hook_event_name,
            "additionalContext": breadcrumb,
        }
    }
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
