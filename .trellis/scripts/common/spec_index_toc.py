#!/usr/bin/env python3
"""
Condensed spec index.md text for SessionStart additionalContext.

Extracts the primary ``Guide`` markdown table, a short Pre-Development Checklist
excerpt, and all ``##`` headings so models can lazy-load full files via Read.
"""

from __future__ import annotations

from pathlib import Path


def spec_index_display_path(project_dir: Path, spec_index_path: Path) -> str:
    """Path to show in injected context (relative to repo root when possible)."""
    try:
        rel = spec_index_path.resolve().relative_to(project_dir.resolve())
        return str(rel).replace("\\", "/")
    except ValueError:
        return str(spec_index_path).replace("\\", "/")


def _md_row_first_cell(line: str) -> str | None:
    """First logical cell of a markdown pipe table row (handles padded columns)."""
    stripped = line.strip()
    if not stripped.startswith("|"):
        return None
    parts = [p.strip() for p in stripped.split("|")]
    while parts and parts[0] == "":
        parts.pop(0)
    while parts and parts[-1] == "":
        parts.pop(-1)
    if not parts:
        return None
    return parts[0]


def build_spec_index_toc(spec_index_path: Path, project_dir: Path) -> str:
    """Build condensed text for one spec ``index.md`` (full file via Read)."""
    try:
        content = spec_index_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return ""

    lines = content.splitlines()
    display = spec_index_display_path(project_dir, spec_index_path)
    toc_lines: list[str] = [
        f"Full index: {display}  (read on demand with the Read tool)",
        "",
    ]

    in_guide_table = False
    for line in lines:
        first = _md_row_first_cell(line)
        if not in_guide_table and first == "Guide":
            in_guide_table = True
        if in_guide_table:
            stripped = line.strip()
            # Markdown horizontal rule (---) ends the table; do not treat pipe-table
            # alignment rows like "| ----------------------------------------------- |" as HR.
            if stripped.startswith("---") and not stripped.startswith("|"):
                break
            if line.startswith("## "):
                break
            toc_lines.append(line)

    for i, line in enumerate(lines):
        if line.strip() == "## Pre-Development Checklist":
            toc_lines.append("")
            for j in range(i + 1, min(i + 10, len(lines))):
                sj = lines[j].strip()
                if (sj.startswith("---") and not sj.startswith("|")) or lines[j].startswith(
                    "## "
                ):
                    break
                if lines[j].strip():
                    toc_lines.append(lines[j])
            break

    headings = [ln for ln in lines if ln.startswith("## ")]
    if headings:
        toc_lines.append("")
        toc_lines.append("Section headings in this index:")
        toc_lines.extend(headings)

    return "\n".join(toc_lines)
