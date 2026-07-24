#!/usr/bin/env python3
"""
Path-scoped spec matching for on-demand spec injection.

Spec files under `.trellis/spec/**/*.md` MAY start with a YAML-like
frontmatter block declaring which repo paths they govern:

    ---
    name: commands-workflow
    description: workflow command conventions
    paths:
      - packages/cli/src/commands/workflow.ts
      - packages/cli/src/utils/workflow-resolver.ts
    ---

The parser is hand-rolled (house pattern, modeled on
``trellis_config.parse_simple_yaml`` — no YAML dependency) and reads only a
bounded head of each file (8 KiB / 100 lines, whichever ends first). Only
files whose first line is exactly ``---`` are considered. ``name:`` /
``description:`` single-line strings are recognized (description is reused in
index lines); unknown keys are ignored.

Glob grammar (repo-relative, POSIX separators):

- ``*``  matches within a single path segment (never crosses ``/``)
- ``?``  matches exactly one character within a segment
- ``**`` as a whole segment matches zero or more segments
- a trailing ``/`` is sugar for ``/**``
- ``**`` embedded in a segment with other characters degrades to ``*``

Validation: globs must be repo-relative (no leading ``/``), contain no ``..``
segments, and use only characters in ``[A-Za-z0-9_./*?-]``. An invalid glob
is skipped with a stderr warning; the rest of the file's globs still apply.

Translation examples (glob → matches / non-matches):

    packages/cli/src/commands/update.ts
        matches only that exact file
    packages/cli/src/commands/*.ts
        matches packages/cli/src/commands/update.ts
        not     packages/cli/src/commands/channel/spawn.ts
    packages/cli/src/templates/**
        matches packages/cli/src/templates/trellis/index.ts (any depth)
        not     packages/cli/src/templates (the directory itself)
    packages/**/index.ts
        matches packages/index.ts and packages/cli/src/index.ts
    src/util?.py
        matches src/utils.py, not src/util.py or src/utilXY.py
    packages/cli/
        same as packages/cli/**

Provides:
    SpecMatch              - frozen match record (spec_path, rel_path, description)
    match_specs_for_file   - map an edited file to the specs that govern it
    parse_spec_frontmatter - parse the optional frontmatter head block
    glob_to_regex          - deterministic glob → compiled regex translation
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

from .paths import DIR_SPEC, DIR_WORKFLOW

# Bounded head-read limits for frontmatter scanning (design contract).
HEAD_MAX_BYTES = 8192
HEAD_MAX_LINES = 100

_GLOB_CHARSET_RE = re.compile(r"^[A-Za-z0-9_./*?-]+$")
_KEY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(.*)$")


@dataclass(frozen=True)
class SpecFrontmatter:
    """Parsed frontmatter head. ``paths`` is None when the key is absent."""

    paths: tuple[str, ...] | None
    name: str | None
    description: str | None


@dataclass(frozen=True)
class SpecMatch:
    spec_path: Path
    """Absolute path to the spec file."""
    rel_path: str
    """Repo-relative POSIX path, for display."""
    description: str | None
    """Frontmatter ``description:`` value, if declared."""


def _warn(message: str) -> None:
    print(f"[WARN] spec_match: {message}", file=sys.stderr)


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        return value[1:-1]
    return value


def _strip_inline_comment(value: str) -> str:
    """Strip ` # …` comments while preserving `#` inside quoted strings."""
    in_quote: str | None = None
    for idx, ch in enumerate(value):
        if in_quote:
            if ch == in_quote:
                in_quote = None
            continue
        if ch in ('"', "'"):
            in_quote = ch
            continue
        if ch == "#" and (idx == 0 or value[idx - 1].isspace()):
            return value[:idx]
    return value


def _read_head(path: Path) -> str:
    """Read at most HEAD_MAX_BYTES from the file, decoded as UTF-8."""
    with open(path, "rb") as f:
        data = f.read(HEAD_MAX_BYTES)
    return data.decode("utf-8", errors="replace")


def parse_spec_frontmatter(head_text: str) -> SpecFrontmatter | None:
    """Parse the optional frontmatter block from a spec file's head.

    Returns None when the file has no frontmatter (first line is not ``---``).
    Raises ValueError on malformed frontmatter (e.g. non-list ``paths:``,
    unrecognized line shapes). The scan ends at the closing ``---`` or at the
    head-read bound (HEAD_MAX_LINES), whichever comes first.
    """
    lines = head_text.splitlines()[:HEAD_MAX_LINES]
    if not lines:
        return None
    first = lines[0].lstrip("\ufeff")  # tolerate a UTF-8 BOM
    if first != "---":
        return None

    paths: list[str] | None = None
    name: str | None = None
    description: str | None = None
    pending_key: str | None = None

    for line_no, line in enumerate(lines[1:], start=2):
        stripped = line.strip()
        if stripped == "---":
            break
        if not stripped or stripped.startswith("#"):
            continue

        if stripped == "-" or stripped.startswith("- "):
            if pending_key is None:
                raise ValueError(f"list item outside a key (line {line_no})")
            if pending_key == "paths" and paths is not None:
                item = _unquote(_strip_inline_comment(stripped[1:].strip()).strip())
                paths.append(item)
            # List items under unknown keys are tolerated and ignored.
            continue

        key_match = _KEY_RE.match(stripped)
        if key_match is None:
            raise ValueError(f"unrecognized line {line_no}: {stripped[:60]!r}")

        key = key_match.group(1)
        value = _unquote(_strip_inline_comment(key_match.group(2)).strip())
        if value:
            pending_key = None
            if key == "paths":
                raise ValueError("'paths' must be a list of globs")
            if key == "name":
                name = value
            elif key == "description":
                description = value
            # Unknown scalar keys are tolerated and ignored.
        else:
            pending_key = key
            if key == "paths":
                paths = []

    return SpecFrontmatter(
        paths=tuple(paths) if paths is not None else None,
        name=name,
        description=description,
    )


def validate_glob(glob: str) -> str | None:
    """Return an error message for an invalid glob, or None when valid."""
    if not glob:
        return "empty glob"
    if not _GLOB_CHARSET_RE.match(glob):
        return "contains characters outside [A-Za-z0-9_./*?-]"
    if glob.startswith("/"):
        return "absolute paths are not allowed (globs are repo-relative)"
    if ".." in glob.split("/"):
        return "'..' segments are not allowed"
    return None


def glob_to_regex(glob: str) -> re.Pattern[str]:
    """Translate a validated glob to a compiled full-match regex.

    Deterministic, segment-based translation (see module docstring for the
    grammar and examples): ``**`` as a whole segment spans zero or more
    segments; ``*`` becomes ``[^/]*``; ``?`` becomes ``[^/]``; everything
    else is escaped literally. A trailing ``/`` is expanded to ``/**`` first.
    """
    if glob.endswith("/"):
        glob += "**"
    segments = glob.split("/")
    parts: list[str] = []
    for i, seg in enumerate(segments):
        is_last = i == len(segments) - 1
        if seg == "**":
            # Last: consume the rest of the path (at least the separator
            # boundary is already emitted by the previous segment). Not last:
            # zero or more whole segments including their separators.
            parts.append(".*" if is_last else r"(?:[^/]+/)*")
            continue
        piece = "".join(
            "[^/]*" if ch == "*" else "[^/]" if ch == "?" else re.escape(ch)
            for ch in seg
        )
        parts.append(piece if is_last else piece + "/")
    return re.compile("^" + "".join(parts) + "$")


def _normalize_repo_relative(repo_root: Path, file_path: str | Path) -> str | None:
    """Normalize file_path to a repo-relative POSIX string.

    ``repo_root`` must already be resolved. Absolute paths outside the repo
    return None. Relative paths are assumed repo-relative.
    """
    candidate = Path(file_path)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(repo_root).as_posix()
        except (OSError, ValueError):
            return None
    text = str(file_path).replace("\\", "/")
    while text.startswith("./"):
        text = text[2:]
    if not text or text.startswith("../"):
        return None
    return text


def match_specs_for_file(repo_root: Path, file_path: str | Path) -> list[SpecMatch]:
    """Return specs whose frontmatter ``paths:`` globs match file_path.

    ``file_path`` may be absolute or repo-relative. Matches are returned in
    stable ``rel_path``-sorted order. Scans ``.trellis/spec/**/*.md`` with
    bounded head-reads only. Never raises; unreadable or malformed spec files
    are skipped with a stderr warning.
    """
    try:
        repo_root = Path(repo_root).resolve()
        spec_dir = repo_root / DIR_WORKFLOW / DIR_SPEC
        if not spec_dir.is_dir():
            return []
        rel = _normalize_repo_relative(repo_root, file_path)
        if rel is None:
            return []

        matches: list[SpecMatch] = []
        for spec_file in spec_dir.rglob("*.md"):
            spec_rel = spec_file.relative_to(repo_root).as_posix()
            try:
                head = _read_head(spec_file)
            except OSError as exc:
                _warn(f"cannot read {spec_rel}: {exc}")
                continue
            try:
                frontmatter = parse_spec_frontmatter(head)
            except ValueError as exc:
                _warn(f"malformed frontmatter in {spec_rel}: {exc}")
                continue
            if frontmatter is None or not frontmatter.paths:
                continue
            for glob in frontmatter.paths:
                error = validate_glob(glob)
                if error is not None:
                    _warn(f"invalid glob {glob!r} in {spec_rel}: {error}")
                    continue
                if glob_to_regex(glob).match(rel):
                    matches.append(
                        SpecMatch(
                            spec_path=spec_file,
                            rel_path=spec_rel,
                            description=frontmatter.description,
                        )
                    )
                    break

        matches.sort(key=lambda m: m.rel_path)
        return matches
    except Exception as exc:  # Never raise — callers are hooks/context tools.
        _warn(f"spec scan failed: {exc}")
        return []
