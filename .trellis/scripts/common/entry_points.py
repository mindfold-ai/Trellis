"""Declared entry-point lookup for wrapper packs.

An installed wrapper pack may declare preferred entry surfaces for the core
workflows in `.trellis/entry-points.json` so routing text points agents at the
pack's canonical commands instead of the Trellis literals:

    {
      "schemaVersion": 1,
      "entryPoints": {
        "start": "/sd:sd-start",
        "continue": "/sd:sd-continue",
        "finish-work": "/sd:sd-finish-work",
        "update-spec": "sd-update-spec"
      }
    }

Trellis never writes the file. Every key is optional, values are bounded
surface names rendered verbatim, and any invalid shape, key, or value
disables the whole declaration so callers fall back to the Trellis literal.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .paths import DIR_WORKFLOW, get_repo_root

ENTRY_POINT_KEYS = {"start", "continue", "finish-work", "update-spec"}
_ENTRY_POINT_VALUE_RE = re.compile(r"/?[A-Za-z0-9][A-Za-z0-9/:._-]{0,63}\Z")
_ENTRY_POINT_MAX_BYTES = 16 * 1024


def declared_entry_point(
    key: str, fallback: str, repo_root: Path | None = None
) -> str:
    """Return the declared entry point for `key`, or `fallback`."""
    try:
        root = repo_root if repo_root is not None else get_repo_root()
        path = root / DIR_WORKFLOW / "entry-points.json"
        if not path.is_file() or path.stat().st_size > _ENTRY_POINT_MAX_BYTES:
            return fallback
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("schemaVersion") != 1:
            return fallback
        if set(data) - {"schemaVersion", "entryPoints"}:
            return fallback
        points = data.get("entryPoints")
        if not isinstance(points, dict) or set(points) - ENTRY_POINT_KEYS:
            return fallback
        value = points.get(key)
        if not isinstance(value, str) or not _ENTRY_POINT_VALUE_RE.fullmatch(
            value
        ):
            return fallback
        return value
    except (OSError, ValueError):
        return fallback
