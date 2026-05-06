#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Codex Session Start Hook - Inject Trellis context into Codex sessions.

Output format follows Codex hook protocol:
  stdout JSON → { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import warnings
from io import StringIO
from pathlib import Path


def _normalize_windows_shell_path(path_str: str) -> str:
    """Normalize Unix-style shell paths to real Windows paths.

    On Windows, shells like Git Bash / MSYS2 / Cygwin may report paths like
    `/d/Users/...` or `/cygdrive/d/Users/...`. `Path.resolve()` will misinterpret
    these as `D:/d/Users...` on drive D: (or similar), breaking repo root
    detection.

    This function is intentionally conservative: it only rewrites patterns that
    unambiguously represent a drive letter mount.
    """
    if not isinstance(path_str, str) or not path_str:
        return path_str

    # Only relevant on Windows; keep other platforms untouched.
    if not sys.platform.startswith("win"):
        return path_str

    p = path_str.strip()

    # Already a Windows drive path (C:\... or C:/...)
    if re.match(r"^[A-Za-z]:[\/]", p):
        return p

    # MSYS/Git-Bash style: /c/Users/... or /d/Work/...
    m = re.match(r"^/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        return f"{drive}:\\{rest.replace('/', '\\')}"

    # Cygwin style: /cygdrive/c/Users/...
    m = re.match(r"^/cygdrive/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        return f"{drive}:\\{rest.replace('/', '\\')}"

    # WSL mounted drive (sometimes leaked into env): /mnt/c/Users/...
    m = re.match(r"^/mnt/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        return f"{drive}:\\{rest.replace('/', '\\')}"

    return path_str


warnings.filterwarnings("ignore")

FIRST_REPLY_NOTICE = """<first-reply-notice>
On the first visible assistant reply in this session, begin with exactly one short Chinese sentence:
Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。
Then continue directly with the user's request. This notice is one-shot: do not repeat it after the first assistant reply in the same session.
</first-reply-notice>"""


def should_skip_injection() -> bool:
    if os.environ.get("TRELLIS_HOOKS") == "0":
        return True
    if os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return True
    return os.environ.get("CODEX_NON_INTERACTIVE") == "1"


def configure_project_encoding(project_dir: Path) -> None:
    """Reuse Trellis' shared Windows stdio encoding helper before JSON output."""
    scripts_dir = project_dir / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from common import configure_encoding  # type: ignore[import-not-found]

        configure_encoding()
    except Exception:
        pass


def _has_curated_jsonl_entry(jsonl_path: Path) -> bool:
    """Return True iff jsonl has at least one row with a ``file`` field.

    A freshly seeded jsonl only contains a ``{"_example": ...}`` row (no
    ``file`` key) — that is NOT "ready". Readiness requires at least one
    curated entry. Matches the contract used by ``inject-subagent-context.py``.
    """
    try:
        for line in jsonl_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("file"):
                return True
    except (OSError, UnicodeDecodeError):
        return False
    return False


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def _resolve_context_key(project_dir: Path, hook_input: dict) -> str | None:
    scripts_dir = project_dir / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.active_task import resolve_context_key  # type: ignore[import-not-found]
    except Exception:
        return None
    return resolve_context_key(hook_input, platform="codex")


def _resolve_active_task(trellis_dir: Path, hook_input: dict):
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_active_task  # type: ignore[import-not-found]

    return resolve_active_task(trellis_dir.parent, hook_input, platform="codex")


def run_script(script_path: Path, context_key: str | None = None) -> str:
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        if context_key:
            env["TRELLIS_CONTEXT_ID"] = context_key
        cmd = [sys.executable, "-W", "ignore", str(script_path)]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=str(script_path.parent.parent.parent),
            env=env,
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def _normalize_task_ref(task_ref: str) -> str:
    normalized = task_ref.strip()
    if not normalized:
        return ""

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return str(path_obj)

    normalized = normalized.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]

    if normalized.startswith("tasks/"):
        return f".trellis/{normalized}"

    return normalized


def _resolve_task_dir(trellis_dir: Path, task_ref: str) -> Path:
    normalized = _normalize_task_ref(task_ref)
    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return path_obj
    if normalized.startswith(".trellis/"):
        return trellis_dir.parent / path_obj
    return trellis_dir / "tasks" / path_obj


def _get_task_status(trellis_dir: Path, hook_input: dict) -> str:
    active = _resolve_active_task(trellis_dir, hook_input)
    if not active.task_path:
        return f"Status: NO ACTIVE TASK\nSource: {active.source}\nNext: Describe what you want to work on"

    task_ref = active.task_path
    task_dir = _resolve_task_dir(trellis_dir, task_ref)
    if active.stale or not task_dir.is_dir():
        return f"Status: STALE POINTER\nTask: {task_ref}\nSource: {active.source}\nNext: Task directory not found. Run: python3 ./.trellis/scripts/task.py finish"

    task_json_path = task_dir / "task.json"
    task_data: dict = {}
    if task_json_path.is_file():
        try:
            task_data = json.loads(task_json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, PermissionError):
            pass

    task_title = task_data.get("title", task_ref)
    task_status = task_data.get("status", "unknown")

    if task_status == "completed":
        return f"Status: COMPLETED\nTask: {task_title}\nSource: {active.source}\nNext: Archive with `python3 ./.trellis/scripts/task.py archive {task_dir.name}` or start a new task"

    has_context = False
    for jsonl_name in ("implement.jsonl", "check.jsonl", "spec.jsonl"):
        jsonl_path = task_dir / jsonl_name
        if jsonl_path.is_file() and _has_curated_jsonl_entry(jsonl_path):
            has_context = True
            break

    has_prd = (task_dir / "prd.md").is_file()

    if not has_prd:
        return f"Status: NOT READY\nTask: {task_title}\nSource: {active.source}\nMissing: prd.md not created\nNext: Write PRD (see workflow.md Phase 1.1) then curate implement.jsonl per Phase 1.3"

    if not has_context:
        return f"Status: NOT READY\nTask: {task_title}\nSource: {active.source}\nMissing: implement.jsonl / check.jsonl missing or empty\nNext: Curate entries per workflow.md Phase 1.3 (spec + research files only), then `task.py start`"

    return (
        f"Status: READY\nTask: {task_title}\n"
        f"Source: {active.source}\n"
        "Next required action: dispatch `trellis-implement` per Phase 2.1. "
        "For agent-capable platforms, the default is to NOT edit code in the main session. "
        "After implementation, dispatch `trellis-check` per Phase 2.2 before reporting completion.\n"
        "User override (per-turn escape hatch): if the user's CURRENT message explicitly tells the "
        "main session to handle it directly (\"你直接改\" / \"别派 sub-agent\" / \"main session 写就行\" / "
        "\"do it inline\" / \"不用 sub-agent\"), honor it for this turn and edit code directly. "
        "Per-turn only; do NOT invent an override the user did not say."
    )


def _extract_range(content: str, start_header: str, end_header: str) -> str:
    """Extract lines starting at `## start_header` up to (but excluding) `## end_header`."""
    lines = content.splitlines()
    start: "int | None" = None
    end: int = len(lines)
    start_match = f"## {start_header}"
    end_match = f"## {end_header}"
    for i, line in enumerate(lines):
        stripped = line.strip()
        if start is None and stripped == start_match:
            start = i
            continue
        if start is not None and stripped == end_match:
            end = i
            break
    if start is None:
        return ""
    return "\n".join(lines[start:end]).rstrip()


_BREADCRUMB_TAG_RE = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n.*?\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)


def _strip_breadcrumb_tag_blocks(content: str) -> str:
    return _BREADCRUMB_TAG_RE.sub("", content)


def _build_workflow_toc(workflow_path: Path) -> str:
    """Inject workflow guide: TOC + Phase Index + Phase 1/2/3 step details.

    Since v0.5.0-rc.0 the [workflow-state:STATUS] breadcrumb tag blocks
    live inside ## Phase Index. They're consumed by inject-workflow-state.py
    on each UserPromptSubmit, so strip them from the session-start payload
    to avoid duplicating context.
    """
    content = read_file(workflow_path)
    if not content:
        return "No workflow.md found"

    out_lines = [
        "# Development Workflow — Section Index",
        "Full guide: .trellis/workflow.md  (read on demand)",
        "",
        "## Table of Contents",
    ]
    for line in content.splitlines():
        if line.startswith("## "):
            out_lines.append(line)
    out_lines += ["", "---", ""]

    phases = _extract_range(content, "Phase Index", "Customizing Trellis (for forks)")
    if phases:
        out_lines.append(_strip_breadcrumb_tag_blocks(phases).rstrip())

    return "\n".join(out_lines).rstrip()


def main() -> None:
    if should_skip_injection():
        sys.exit(0)

    # Read hook input from stdin
    try:
        hook_input = json.loads(sys.stdin.read())
        if not isinstance(hook_input, dict):
            hook_input = {}
        project_dir = Path(_normalize_windows_shell_path(hook_input.get("cwd", "."))).resolve()
    except (json.JSONDecodeError, KeyError):
        hook_input = {}
        project_dir = Path(".").resolve()

    configure_project_encoding(project_dir)

    trellis_dir = project_dir / ".trellis"
    context_key = _resolve_context_key(project_dir, hook_input)

    output = StringIO()

    output.write("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>

""")
    output.write(FIRST_REPLY_NOTICE)
    output.write("\n\n")

    output.write("<current-state>\n")
    context_script = trellis_dir / "scripts" / "get_context.py"
    output.write(run_script(context_script, context_key))
    output.write("\n</current-state>\n\n")

    output.write("<workflow>\n")
    output.write(_build_workflow_toc(trellis_dir / "workflow.md"))
    output.write("\n</workflow>\n\n")

    output.write("<guidelines>\n")
    output.write(
        "Project spec indexes are listed by path below. Each index contains a "
        "**Pre-Development Checklist** listing the specific guideline files to "
        "read before coding.\n\n"
        "- If you're spawning an implement/check sub-agent, context is injected "
        "automatically via `{task}/implement.jsonl` / `check.jsonl`. You do NOT "
        "need to read these indexes yourself.\n"
        "- For agent-capable platforms, the default is to dispatch "
        "`trellis-implement` and `trellis-check` (so JSONL context is loaded by "
        "the sub-agents) rather than editing code in the main session. "
        "Honor a per-turn user override only if the user's current message "
        "explicitly opts out (see <task-status> below for override phrases).\n\n"
    )

    # guides/ inlined (cross-package thinking, broadly useful)
    guides_index = trellis_dir / "spec" / "guides" / "index.md"
    if guides_index.is_file():
        output.write("## guides (inlined — cross-package thinking guides)\n")
        output.write(read_file(guides_index))
        output.write("\n\n")

    # Other indexes — paths only
    paths: list[str] = []
    spec_dir = trellis_dir / "spec"
    if spec_dir.is_dir():
        for sub in sorted(spec_dir.iterdir()):
            if not sub.is_dir() or sub.name.startswith("."):
                continue
            if sub.name == "guides":
                continue
            index_file = sub / "index.md"
            if index_file.is_file():
                paths.append(f".trellis/spec/{sub.name}/index.md")
            else:
                for nested in sorted(sub.iterdir()):
                    if not nested.is_dir():
                        continue
                    nested_index = nested / "index.md"
                    if nested_index.is_file():
                        paths.append(
                            f".trellis/spec/{sub.name}/{nested.name}/index.md"
                        )

    if paths:
        output.write("## Available spec indexes (read on demand)\n")
        for p in paths:
            output.write(f"- {p}\n")
        output.write("\n")

    output.write(
        "Discover more via: "
        "`python3 ./.trellis/scripts/get_context.py --mode packages`\n"
    )
    output.write("</guidelines>\n\n")

    task_status = _get_task_status(trellis_dir, hook_input)
    output.write(f"<task-status>\n{task_status}\n</task-status>\n\n")

    output.write("""<ready>
Context loaded. Workflow index, project state, and guidelines are already injected above — do NOT re-read them.
When the user sends the first message, follow <task-status> and the workflow guide.
If a task is READY, execute its Next required action without asking whether to continue.
</ready>""")

    context = output.getvalue()
    result = {
        "suppressOutput": True,
        "systemMessage": f"Trellis context injected ({len(context)} chars)",
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        },
    }

    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
