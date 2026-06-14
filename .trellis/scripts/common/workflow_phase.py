#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Workflow Phase Extraction.

Extracts step-level content from the structured ``.trellis/workflow.yaml``
manifest and optionally filters platform-specific blocks.

Platform marker syntax in workflow body files:

    [Claude Code, Cursor, ...]
    agent-capable content
    [/Claude Code, Cursor, ...]

Provides:
    get_phase_index   - Render the Phase Index section (no --step)
    get_step          - Render a single step body
    filter_platform   - Strip platform blocks that don't include the given name
"""

from __future__ import annotations

import re

from .workflow_model import render_phase_index, render_step

# Match a line that *is* a platform marker: "[A, B, C]" or "[/A, B, C]"
_MARKER_RE = re.compile(r"^\[(/?)([A-Za-z][^\[\]]*)\]\s*$")


def _parse_marker(line: str) -> tuple[bool, list[str]] | None:
    """Parse a platform marker line.

    Returns:
        (is_closing, [platform_names]) if line is a marker, else None.
    """
    m = _MARKER_RE.match(line)
    if not m:
        return None
    is_closing = m.group(1) == "/"
    names = [p.strip() for p in m.group(2).split(",") if p.strip()]
    return is_closing, names


def get_phase_index() -> str:
    """Return rendered Phase Index + Phase 1/2/3 step bodies."""
    return render_phase_index()


def get_step(step_id: str) -> str:
    """Return the body for a step id such as ``1.1``."""
    return render_step(step_id)


def _platform_matches(platform: str, block_names: list[str]) -> bool:
    """Case-insensitive fuzzy match: accept 'cursor', 'Cursor', 'claude-code', 'Claude Code'."""
    needle = platform.lower().replace("-", "").replace("_", "").replace(" ", "")
    for name in block_names:
        hay = name.lower().replace("-", "").replace("_", "").replace(" ", "")
        if needle == hay:
            return True
    return False


def resolve_effective_platform(platform: str, config: dict) -> str:
    """Map ``codex`` to a dispatch-mode-namespaced virtual platform name.

    When ``--platform codex`` is passed, return ``"codex-inline"`` (default)
    or ``"codex-sub-agent"`` based on ``.trellis/config.yaml`` ``codex.dispatch_mode``.
    ``filter_platform`` then surfaces blocks whose marker lists include the
    namespaced name (e.g. ``[codex-sub-agent, ...]`` or ``[codex-inline, Kilo,
    Antigravity, Windsurf]``).

    Default is ``inline`` because Codex sub-agents run with ``fork_turns="none"``
    isolation and can't inherit the parent session's task context — inline
    keeps the main agent in charge so context isn't lost. Invalid / missing
    values also fall back to inline.

    Other platforms are returned unchanged.
    """
    if platform == "codex":
        mode = "inline"
        codex_cfg = config.get("codex") if isinstance(config, dict) else None
        if isinstance(codex_cfg, dict):
            cfg_mode = codex_cfg.get("dispatch_mode")
            if cfg_mode in ("inline", "sub-agent"):
                mode = cfg_mode
        return f"codex-{mode}"
    return platform


def filter_platform(content: str, platform: str) -> str:
    """Keep lines outside any `[...]` block + lines inside blocks that include platform.

    Marker lines themselves are dropped from the output.
    """
    lines = content.splitlines()
    out: list[str] = []

    in_block = False
    keep_block = False

    for line in lines:
        marker = _parse_marker(line)
        if marker is not None:
            is_closing, names = marker
            if not is_closing:
                in_block = True
                keep_block = _platform_matches(platform, names)
            else:
                in_block = False
                keep_block = False
            continue  # drop the marker line itself

        if in_block:
            if keep_block:
                out.append(line)
            continue
        out.append(line)

    # Collapse runs of 3+ blank lines that may arise from dropped markers
    collapsed: list[str] = []
    blank_run = 0
    for line in out:
        if line.strip() == "":
            blank_run += 1
            if blank_run <= 2:
                collapsed.append(line)
        else:
            blank_run = 0
            collapsed.append(line)

    return "\n".join(collapsed).rstrip() + "\n"
