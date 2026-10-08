"""Structural extraction for workflow-owned continuation contracts."""

from __future__ import annotations

import re
from pathlib import Path


_OPEN_MARKER = "[trellis-continuation]"
_CLOSE_MARKER = "[/trellis-continuation]"
_CONTINUATION_MARKER_RE = re.compile(
    r"^\[/?trellis-continuation[^\]]*\]$"
)
_TRELLIS_MARKER_RE = re.compile(r"^\[/?trellis-[A-Za-z0-9_-]+\]$")


class ContinuationContractError(ValueError):
    """The workflow continuation block has an invalid structure."""

    def __init__(self, error_type: str, workflow_path: Path) -> None:
        self.error_type = error_type
        self.workflow_path = workflow_path
        super().__init__(f"{error_type}: {workflow_path}")


def extract_continuation_contract(workflow_path: Path) -> str:
    """Return the single continuation body verbatim.

    Marker lines are recognized after trimming surrounding line whitespace.
    The body keeps its original line order and line endings. This function is
    structural only: it does not inspect task state or interpret workflow
    semantics.
    """
    try:
        with workflow_path.open("r", encoding="utf-8", newline="") as stream:
            text = stream.read()
    except FileNotFoundError as exc:
        raise ContinuationContractError(
            "workflow_not_found", workflow_path
        ) from exc
    except (OSError, UnicodeDecodeError) as exc:
        raise ContinuationContractError(
            "workflow_read_error", workflow_path
        ) from exc

    body_lines: list[str] = []
    extracted: str | None = None
    in_block = False

    for line in text.splitlines(keepends=True):
        marker = line.strip()
        if marker == _OPEN_MARKER:
            if in_block:
                raise ContinuationContractError("nested_block", workflow_path)
            if extracted is not None:
                raise ContinuationContractError("duplicate_block", workflow_path)
            in_block = True
            body_lines = []
            continue

        if marker == _CLOSE_MARKER:
            if not in_block:
                raise ContinuationContractError("missing_open", workflow_path)
            body = "".join(body_lines)
            if not body.strip():
                raise ContinuationContractError("empty_body", workflow_path)
            extracted = body
            in_block = False
            continue

        if _CONTINUATION_MARKER_RE.fullmatch(
            marker
        ) or _TRELLIS_MARKER_RE.fullmatch(marker):
            raise ContinuationContractError("mismatched_marker", workflow_path)

        if in_block:
            body_lines.append(line)

    if in_block:
        raise ContinuationContractError("missing_close", workflow_path)
    if extracted is None:
        raise ContinuationContractError("missing_block", workflow_path)
    return extracted
