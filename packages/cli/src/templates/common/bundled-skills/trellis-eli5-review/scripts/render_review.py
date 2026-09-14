"""Render a task's human review without changing authoritative evidence."""

from __future__ import annotations

import argparse
import html
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import unquote, urlsplit


_LANGUAGE_SUBTAG = re.compile(r"^[A-Za-z0-9]{1,8}$")
_LANGUAGE = re.compile(r"^[A-Za-z]{2,8}$")


def text(value: object, field: str) -> str:
    """Require non-empty plain text and escape it for HTML."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be non-empty text")
    return html.escape(value)


def language_tag(value: object) -> str:
    """Require a safe BCP 47 language tag for the document's HTML language."""
    if not isinstance(value, str):
        raise ValueError("locale must be a valid language tag")
    subtags = value.split("-")
    if not subtags or not _LANGUAGE.fullmatch(subtags[0]):
        raise ValueError("locale must be a valid language tag")
    index = 1
    while index < len(subtags):
        subtag = subtags[index]
        if not _LANGUAGE_SUBTAG.fullmatch(subtag):
            raise ValueError("locale must be a valid language tag")
        if len(subtag) != 1:
            if len(subtag) < 2:
                raise ValueError("locale must be a valid language tag")
            index += 1
            continue
        if index + 1 >= len(subtags):
            raise ValueError("locale must be a valid language tag")
        if subtag.lower() == "x":
            index += 1
            while index < len(subtags):
                if not _LANGUAGE_SUBTAG.fullmatch(subtags[index]):
                    raise ValueError("locale must be a valid language tag")
                index += 1
            break
        if len(subtags[index + 1]) < 2:
            raise ValueError("locale must be a valid language tag")
        index += 2
    return html.escape(value, quote=True)


def items(data: dict, field: str) -> str:
    """Render a required list of summary statements."""
    values = data.get(field)
    if not isinstance(values, list) or not values:
        raise ValueError(f"{field} must be a non-empty list")
    return "<ul>" + "".join(f"<li>{text(v, field)}</li>" for v in values) + "</ul>"


def evidence_link(value: object, task: Path) -> str:
    """Allow HTTPS or existing task-contained evidence files only."""
    if not isinstance(value, str) or not value or any(ord(c) < 33 for c in value):
        raise ValueError("evidence href must be a URL without whitespace")
    decoded = unquote(value)
    if "\\" in decoded or any(ord(c) < 32 for c in decoded):
        raise ValueError("invalid evidence href")
    url = urlsplit(value)
    if url.scheme:
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError("external evidence must use HTTPS without credentials")
    else:
        local = Path(unquote(url.path))
        if url.netloc or not url.path or local.is_absolute() or ".." in local.parts:
            raise ValueError("local evidence must stay inside the task")
        resolved = (task / local).resolve()
        if task not in resolved.parents or not resolved.is_file():
            raise ValueError(f"evidence file missing or outside task: {value}")
    return html.escape(value, quote=True)


def render(data: dict, mode: str, task: Path) -> str:
    """Validate the mode contract and assemble the human-facing sections."""
    title = text(data.get("title"), "title")
    summary = text(data.get("summary"), "summary")
    language = language_tag(data.get("locale"))
    sections = []
    if mode == "plan":
        fields = [("why", "Why it matters"), ("approach", "How it works"),
                  ("in_scope", "What changes"), ("out_of_scope", "Outside this change"),
                  ("acceptance", "How we know it works"), ("decisions", "Your attention")]
    else:
        basis = data.get("plan_basis")
        if basis not in ("reviewed", "unavailable"):
            raise ValueError("plan_basis must be reviewed or unavailable")
        if basis == "unavailable" or not all((task / f"plan-review.{ext}").is_file() for ext in ("html", "json")):
            sections.append('<aside>Reviewed plan unavailable: comparison is limited to the evidence listed below.</aside>')
        sections.append('<section class="before"><h2>Before</h2><p>' + text(data.get("before"), "before") + '</p></section>')
        sections.append('<section class="after"><h2>After</h2><p>' + text(data.get("after"), "after") + '</p></section>')
        checks = data.get("checks")
        if not isinstance(checks, list) or not checks:
            raise ValueError("checks must be a non-empty list")
        rows = []
        for check in checks:
            if not isinstance(check, dict) or check.get("status") not in ("passed", "failed", "not_run", "partial"):
                raise ValueError("check status must be passed, failed, not_run or partial")
            status = check["status"]
            rows.append(f'<li><span class="status {status}">{status.replace("_", " ")}</span> <strong>{text(check.get("name"), "check name")}</strong><p>{text(check.get("detail"), "check detail")}</p></li>')
        sections.append('<section class="wide"><h2>What proves it</h2><ul class="checks">' + ''.join(rows) + '</ul></section>')
        fields = [("delivered", "What shipped"), ("deviations", "Plan vs. result"), ("remaining", "What remains")]
    for field, heading in fields:
        sections.append(f'<section class="{field}"><h2>{heading}</h2>{items(data, field)}</section>')
    evidence = data.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        raise ValueError("evidence must be a non-empty list")
    links = []
    for entry in evidence:
        if not isinstance(entry, dict):
            raise ValueError("evidence entries must be objects")
        links.append(f'<a href="{evidence_link(entry.get("href"), task)}">{text(entry.get("label"), "evidence label")}</a>')
    shell = (Path(__file__).resolve().parent.parent / "assets" / "review.html").read_text(encoding="utf-8")
    # Substitute once: source text containing a marker must remain literal.
    values = {"TITLE": title, "SUMMARY": summary, "MODE": mode,
              "CONTENT": ''.join(sections), "EVIDENCE": ''.join(links),
              "LANG": language}
    return re.sub(r"@@(TITLE|SUMMARY|MODE|CONTENT|EVIDENCE|LANG)@@", lambda m: values[m.group(1)], shell)


def main() -> None:
    """Render validated input and atomically publish the fixed mode output."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task-dir", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=("plan", "finish"))
    args = parser.parse_args()
    task = args.task_dir.resolve()
    try:
        source = task / f"{args.mode}-review.json"
        target = task / f"{args.mode}-review.html"
        if source.is_symlink() or target.is_symlink():
            raise ValueError("review input/output must not be symlinks")
        data = json.loads(source.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("review input must be an object")
        output = render(data, args.mode, task)
        fd, temporary = tempfile.mkstemp(prefix=".review-", suffix=".tmp", dir=task)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(output)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        print(target)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Review not generated: {error}\n")


if __name__ == "__main__":
    main()
