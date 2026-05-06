#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Inject structured context
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import os
import re
import shlex
import subprocess
import sys
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


FIRST_REPLY_NOTICE = """<first-reply-notice>
On the first visible assistant reply in this session, begin with exactly one short Chinese sentence:
Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。
Then continue directly with the user's request. This notice is one-shot: do not repeat it after the first assistant reply in the same session.
</first-reply-notice>"""

# IMPORTANT: Force stdout to use UTF-8 on Windows
# This fixes UnicodeEncodeError when outputting non-ASCII characters
if sys.platform.startswith("win"):
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")  # type: ignore[union-attr]



def _has_curated_jsonl_entry(jsonl_path: Path) -> bool:
    """Return True iff jsonl has at least one row with a ``file`` field.

    A freshly seeded jsonl only contains a ``{"_example": ...}`` row (no
    ``file`` key) — that is NOT "ready". Readiness requires at least one
    curated entry. Matches the contract used by hook-inject and pull-based
    sub-agent context loaders.
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


def should_skip_injection() -> bool:
    """Check if any platform's non-interactive flag is set, or if Trellis
    hooks are explicitly disabled via TRELLIS_HOOKS=0 / TRELLIS_DISABLE_HOOKS=1.
    """
    if os.environ.get("TRELLIS_HOOKS") == "0":
        return True
    if os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return True
    non_interactive_vars = [
        "CLAUDE_NON_INTERACTIVE",
        "QODER_NON_INTERACTIVE",
        "CODEBUDDY_NON_INTERACTIVE",
        "FACTORY_NON_INTERACTIVE",
        "CURSOR_NON_INTERACTIVE",
        "GEMINI_NON_INTERACTIVE",
        "KIRO_NON_INTERACTIVE",
        "COPILOT_NON_INTERACTIVE",
    ]
    return any(os.environ.get(var) == "1" for var in non_interactive_vars)


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


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


def _resolve_context_key(trellis_dir: Path, input_data: dict) -> str | None:
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_context_key  # type: ignore[import-not-found]

    return resolve_context_key(input_data, platform=_detect_platform(input_data))


def _persist_context_key_for_bash(context_key: str | None) -> None:
    """Expose Trellis session identity to later Claude Code Bash commands.

    Claude Code SessionStart hooks can append exports to CLAUDE_ENV_FILE; those
    variables are then available to Bash tools in the same conversation. Without
    this bridge, `task.py start` has hook stdin during SessionStart but no
    session identity when the AI later runs it as a normal shell command.
    """
    if not context_key:
        return
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file:
        return
    try:
        with open(env_file, "a", encoding="utf-8") as handle:
            handle.write(f"export TRELLIS_CONTEXT_ID={shlex.quote(context_key)}\n")
    except OSError:
        pass


def _resolve_active_task(trellis_dir: Path, input_data: dict):
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_active_task  # type: ignore[import-not-found]

    return resolve_active_task(
        trellis_dir.parent,
        input_data,
        platform=_detect_platform(input_data),
    )


def run_script(script_path: Path, context_key: str | None = None) -> str:
    try:
        if script_path.suffix == ".py":
            # Add PYTHONIOENCODING to force UTF-8 in subprocess
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            if context_key:
                env["TRELLIS_CONTEXT_ID"] = context_key
            cmd = [sys.executable, "-W", "ignore", str(script_path)]
        else:
            env = os.environ.copy()
            if context_key:
                env["TRELLIS_CONTEXT_ID"] = context_key
            cmd = [str(script_path)]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=script_path.parent.parent.parent,
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


def _get_task_status(trellis_dir: Path, input_data: dict) -> str:
    """Check current task status and return structured status string with explicit next action.

    Returns a block with three fields:
    - Status: current state
    - Task: task identifier (when applicable)
    - Next-Action: explicit skill/command/tool call the AI should invoke
    """
    active = _resolve_active_task(trellis_dir, input_data)

    # Case 1: No active task — waiting for user to describe intent
    if not active.task_path:
        return (
            "Status: NO ACTIVE TASK\n"
            f"Source: {active.source}\n"
            "Next-Action: After the user describes their intent, load skill `trellis-brainstorm` "
            "to clarify requirements and create a task via `python3 ./.trellis/scripts/task.py create`.\n"
            "Research reminder: for research-heavy tasks (comparing tools, reading external docs, "
            "cross-platform surveys), spawn `trellis-research` sub-agents via the Task tool — "
            "they persist findings to `{TASK_DIR}/research/*.md` and keep main context clean. "
            "Do NOT do 10+ inline WebFetch/WebSearch in the main conversation.\n"
            "User override (per-turn escape hatch): if the user's first message explicitly opts "
            "out of the workflow (\"跳过 trellis\" / \"别走流程\" / \"小修一下\" / \"直接改\" / "
            "\"skip trellis\" / \"no task\" / \"just do it\"), honor it for this turn — "
            "acknowledge briefly and proceed without creating a task. Per-turn only."
        )

    # Case 2: Stale pointer — task dir was deleted
    task_ref = active.task_path
    task_dir = _resolve_task_dir(trellis_dir, task_ref)
    if active.stale or not task_dir.is_dir():
        return (
            f"Status: STALE POINTER\nTask: {task_ref}\n"
            f"Source: {active.source}\n"
            f"Next-Action: Run `python3 ./.trellis/scripts/task.py finish` to clear the stale pointer, "
            "then ask the user what to work on next."
        )

    # Read task.json
    task_json_path = task_dir / "task.json"
    task_data = {}
    if task_json_path.is_file():
        try:
            task_data = json.loads(task_json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, PermissionError):
            pass

    task_title = task_data.get("title", task_ref)
    task_status = task_data.get("status", "unknown")

    # Case 3: Task completed — time to archive
    if task_status == "completed":
        return (
            f"Status: COMPLETED\nTask: {task_title}\n"
            f"Source: {active.source}\n"
            f"Next-Action: Load skill `trellis-update-spec` to capture learnings, "
            f"then archive with `python3 ./.trellis/scripts/task.py archive {task_dir.name}`."
        )

    has_prd = (task_dir / "prd.md").is_file()

    # Case 4: No PRD — still in Plan phase
    if not has_prd:
        return (
            f"Status: PLANNING\nTask: {task_title}\n"
            f"Source: {active.source}\n"
            "Next-Action: Load skill `trellis-brainstorm` to clarify requirements with the user "
            "and produce prd.md in the task directory.\n"
            "Research reminder: when the task needs external research (tool comparison, docs, "
            "conventions survey), spawn `trellis-research` sub-agents — don't WebFetch/WebSearch "
            "inline in the main session. Findings go to `{task_dir}/research/*.md`; PRD only links to them."
        )

    # Case 4b: PRD exists but implement.jsonl has only seed (no curated entries) — Phase 1.3 gate
    implement_jsonl = task_dir / "implement.jsonl"
    if implement_jsonl.is_file() and not _has_curated_jsonl_entry(implement_jsonl):
        return (
            f"Status: PLANNING (Phase 1.3)\nTask: {task_title}\n"
            f"Source: {active.source}\n"
            "Next-Action: Curate `implement.jsonl` and `check.jsonl` with the spec + research files "
            "the Phase 2 sub-agents will need. Only spec paths (`.trellis/spec/**/*.md`) and research "
            "files (`{TASK_DIR}/research/*.md`) — no code paths. Run "
            "`python3 ./.trellis/scripts/get_context.py --mode packages` to list available specs, "
            "then edit the jsonl files or use `python3 ./.trellis/scripts/task.py add-context`. "
            "See `.trellis/workflow.md` Phase 1.3 for details."
        )

    # Case 5: PRD + curated jsonl (or agent-less platform with no jsonl) — enter Execute phase
    return (
        f"Status: READY\nTask: {task_title}\n"
        f"Source: {active.source}\n"
        "Next required action: dispatch `trellis-implement` per Phase 2.1. "
        "For agent-capable platforms, the default is to NOT edit code in the main session. "
        "After implementation, dispatch `trellis-check` per Phase 2.2 before reporting completion.\n"
        "Sub-agent roster: `trellis-implement` (writes code), `trellis-check` (verifies + self-fixes), "
        "`trellis-research` (persists findings to `research/*.md` — use when you'd otherwise do "
        "multiple WebFetch/WebSearch inline).\n"
        "User override (per-turn escape hatch): if the user's CURRENT message explicitly tells the "
        "main session to handle it directly (\"你直接改\" / \"别派 sub-agent\" / \"main session 写就行\" / "
        "\"do it inline\" / \"不用 sub-agent\"), honor it for this turn and edit code directly. "
        "Per-turn only; do NOT invent an override the user did not say."
    )


def _load_trellis_config(trellis_dir: Path, input_data: dict) -> tuple:
    """Load Trellis config for session-start decisions.

    Returns:
        (is_mono, packages_dict, spec_scope, task_pkg, default_pkg)
    """
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from common.config import get_default_package, get_packages, get_spec_scope, is_monorepo  # type: ignore[import-not-found]
        from common.paths import get_current_task  # type: ignore[import-not-found]

        repo_root = trellis_dir.parent
        is_mono = is_monorepo(repo_root)
        packages = get_packages(repo_root) or {}
        scope = get_spec_scope(repo_root)

        # Get active task's package
        task_pkg = None
        current = get_current_task(
            repo_root,
            input_data,
            platform=_detect_platform(input_data),
        )
        if current:
            task_json = repo_root / current / "task.json"
            if task_json.is_file():
                try:
                    data = json.loads(task_json.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        tp = data.get("package")
                        if isinstance(tp, str) and tp:
                            task_pkg = tp
                except (json.JSONDecodeError, OSError):
                    pass

        default_pkg = get_default_package(repo_root)
        return is_mono, packages, scope, task_pkg, default_pkg
    except Exception:
        return False, {}, None, None, None


def _check_legacy_spec(trellis_dir: Path, is_mono: bool, packages: dict) -> str | None:
    """Check for legacy spec directory structure in monorepo.

    Returns warning message if legacy structure detected, None otherwise.
    """
    if not is_mono or not packages:
        return None

    spec_dir = trellis_dir / "spec"
    if not spec_dir.is_dir():
        return None

    # Check for legacy flat spec dirs (spec/backend/, spec/frontend/ with index.md)
    has_legacy = False
    for legacy_name in ("backend", "frontend"):
        legacy_dir = spec_dir / legacy_name
        if legacy_dir.is_dir() and (legacy_dir / "index.md").is_file():
            has_legacy = True
            break

    if not has_legacy:
        return None

    # Check which packages are missing spec/<pkg>/ directory
    missing = [
        name for name in sorted(packages.keys())
        if not (spec_dir / name).is_dir()
    ]

    if not missing:
        return None  # All packages have spec dirs

    if len(missing) == len(packages):
        return (
            f"[!] Legacy spec structure detected: found `spec/backend/` or `spec/frontend/` "
            f"but no package-scoped `spec/<package>/` directories.\n"
            f"Monorepo packages: {', '.join(sorted(packages.keys()))}\n"
            f"Please reorganize: `spec/backend/` -> `spec/<package>/backend/`"
        )
    return (
        f"[!] Partial spec migration detected: packages {', '.join(missing)} "
        f"still missing `spec/<pkg>/` directory.\n"
        f"Please complete migration for all packages."
    )


def _resolve_spec_scope(
    is_mono: bool,
    packages: dict,
    scope,
    task_pkg: str | None,
    default_pkg: str | None,
) -> set | None:
    """Resolve which packages should have their specs injected.

    Returns:
        Set of package names to include, or None for full scan.
    """
    if not is_mono or not packages:
        return None  # Single-repo: full scan

    if scope is None:
        return None  # No scope configured: full scan

    if isinstance(scope, str) and scope == "active_task":
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None  # Fallback to full scan

    if isinstance(scope, list):
        valid = set()
        for entry in scope:
            if entry in packages:
                valid.add(entry)
            else:
                print(
                    f"Warning: spec_scope contains unknown package: {entry}, ignoring",
                    file=sys.stderr,
                )

        if valid:
            # Warn if active task is out of scope
            if task_pkg and task_pkg not in valid:
                print(
                    f"Warning: active task package '{task_pkg}' is out of configured spec_scope",
                    file=sys.stderr,
                )
            return valid

        # All entries invalid: fallback chain
        print(
            "Warning: all spec_scope entries invalid, falling back to task/default/full",
            file=sys.stderr,
        )
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None  # Full scan

    return None  # Unknown scope type: full scan


def _extract_range(content: str, start_header: str, end_header: str) -> str:
    """Extract lines starting at `## start_header` up to (but excluding) `## end_header`.

    Both parameters are full header lines WITHOUT the `## ` prefix (e.g. "Phase Index").
    Returns empty string if start header is not found.
    End header missing → extracts to end of file.
    """
    lines = content.splitlines()
    start: int | None = None
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
    """Remove `[workflow-state:STATUS]...[/workflow-state:STATUS]` blocks.

    The tag blocks live inside `## Phase Index` (since v0.5.0-rc.0, when
    they were colocated with their phase summaries) and are consumed by the
    UserPromptSubmit hook (`inject-workflow-state.py`). The session-start
    payload already covers the full step bodies, so re-inlining the
    breadcrumbs here would just duplicate context.
    """
    return _BREADCRUMB_TAG_RE.sub("", content)


def _build_workflow_overview(workflow_path: Path) -> str:
    """Inject the workflow guide for the session.

    Contents:
      1. Section index (all `## ` headings — navigation)
      2. Phase Index section (rules, skill routing table, anti-rationalization table)
      3. Phase 1/2/3 step-level details (the actual how-to for each step)

    The meta sections (Core Principles / Trellis System / Customizing
    Trellis) are NOT injected — Core Principles is short prose the AI can
    Read on demand; Trellis System lists reference commands duplicated in
    step bodies; Customizing Trellis is for forks. Workflow-state breadcrumb
    tag blocks (which now live inside Phase Index since v0.5.0-rc.0) are
    stripped from the extracted range — they're consumed by the
    UserPromptSubmit hook, not the session-start preamble.

    Total budget: Phase Index ~2 KB + Phase 1/2/3 ~7 KB = ~9 KB.
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

    # Extract Phase Index through the end of Phase 3 (before "Customizing
    # Trellis" — the docs-for-forks footer added in v0.5.0-rc.0). Since
    # sections appear in order Phase Index → Phase 1 → Phase 2 → Phase 3 →
    # Customizing Trellis, a single range grab captures all four. The
    # breadcrumb tag blocks now embedded inside Phase Index are stripped so
    # they don't duplicate the per-turn UserPromptSubmit injection.
    phases = _extract_range(
        content, "Phase Index", "Customizing Trellis (for forks)"
    )
    if phases:
        out_lines.append(_strip_breadcrumb_tag_blocks(phases).rstrip())

    return "\n".join(out_lines).rstrip()


def main():
    if should_skip_injection():
        sys.exit(0)

    try:
        hook_input = json.loads(sys.stdin.read())
        if not isinstance(hook_input, dict):
            hook_input = {}
    except (json.JSONDecodeError, ValueError):
        hook_input = {}

    # Try platform-specific env vars, hook cwd, fallback to cwd
    project_dir_env_vars = [
        "CLAUDE_PROJECT_DIR",
        "QODER_PROJECT_DIR",
        "CODEBUDDY_PROJECT_DIR",
        "FACTORY_PROJECT_DIR",
        "CURSOR_PROJECT_DIR",
        "GEMINI_PROJECT_DIR",
        "KIRO_PROJECT_DIR",
        "COPILOT_PROJECT_DIR",
    ]
    project_dir = None
    for var in project_dir_env_vars:
        val = os.environ.get(var)
        if val:
            project_dir = Path(_normalize_windows_shell_path(val)).resolve()
            break
    if project_dir is None:
        project_dir = Path(_normalize_windows_shell_path(hook_input.get("cwd", "."))).resolve()

    trellis_dir = project_dir / ".trellis"
    context_key = _resolve_context_key(trellis_dir, hook_input)
    _persist_context_key_for_bash(context_key)

    # Load config for scope filtering and legacy detection
    is_mono, packages, scope_config, task_pkg, default_pkg = _load_trellis_config(
        trellis_dir,
        hook_input,
    )
    allowed_pkgs = _resolve_spec_scope(is_mono, packages, scope_config, task_pkg, default_pkg)

    output = StringIO()

    output.write("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>

""")
    output.write(FIRST_REPLY_NOTICE)
    output.write("\n\n")

    # Legacy migration warning
    legacy_warning = _check_legacy_spec(trellis_dir, is_mono, packages)
    if legacy_warning:
        output.write(f"<migration-warning>\n{legacy_warning}\n</migration-warning>\n\n")

    output.write("<current-state>\n")
    context_script = trellis_dir / "scripts" / "get_context.py"
    output.write(run_script(context_script, context_key))
    output.write("\n</current-state>\n\n")

    output.write("<workflow>\n")
    output.write(_build_workflow_overview(trellis_dir / "workflow.md"))
    output.write("\n</workflow>\n\n")

    output.write("<guidelines>\n")
    output.write(
        "Project spec indexes are listed by path below. Each index contains a "
        "**Pre-Development Checklist** listing the specific guideline files to "
        "read before coding.\n\n"
        "- If you're spawning an implement/check sub-agent, context is injected "
        "or loaded by the sub-agent via `{task}/implement.jsonl` / `check.jsonl`. "
        "You do NOT need to read these indexes yourself.\n"
        "- For agent-capable platforms, the default is to dispatch "
        "`trellis-implement` and `trellis-check` (so JSONL context is loaded by "
        "the sub-agents) rather than editing code in the main session. "
        "Honor a per-turn user override only if the user's current message "
        "explicitly opts out (see <task-status> below for override phrases).\n\n"
    )

    # guides/ is cross-package thinking — always include inline (small, broadly useful)
    guides_index = trellis_dir / "spec" / "guides" / "index.md"
    if guides_index.is_file():
        output.write("## guides (inlined — cross-package thinking guides)\n")
        output.write(read_file(guides_index))
        output.write("\n\n")

    # Other spec indexes — paths only (main agent reads on demand;
    # sub-agents get their specific specs via jsonl injection)
    paths: list[str] = []
    spec_dir = trellis_dir / "spec"
    if spec_dir.is_dir():
        for sub in sorted(spec_dir.iterdir()):
            if not sub.is_dir() or sub.name.startswith("."):
                continue
            if sub.name == "guides":
                continue  # already inlined above

            index_file = sub / "index.md"
            if index_file.is_file():
                # Flat spec dir (single-repo layer like spec/backend/)
                paths.append(f".trellis/spec/{sub.name}/index.md")
            else:
                # Nested package dirs (monorepo: spec/<pkg>/<layer>/index.md)
                # Apply scope filter
                if allowed_pkgs is not None and sub.name not in allowed_pkgs:
                    continue
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

    # Check task status and inject structured tag
    task_status = _get_task_status(trellis_dir, hook_input)
    output.write(f"<task-status>\n{task_status}\n</task-status>\n\n")

    output.write("""<ready>
Context loaded. Workflow index, project state, and guidelines are already injected above — do NOT re-read them.
When the user sends the first message, follow <task-status> and the workflow guide.
If a task is READY, execute its Next required action without asking whether to continue.
</ready>""")

    result = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": output.getvalue(),
        }
    }

    # Output JSON - stdout is already configured for UTF-8
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
