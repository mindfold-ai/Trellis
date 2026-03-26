#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Inject structured context
"""

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import os
import subprocess
import sys
from io import StringIO
from pathlib import Path

# IMPORTANT: Force stdout to use UTF-8 on Windows
# This fixes UnicodeEncodeError when outputting non-ASCII characters
if sys.platform == "win32":
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")  # type: ignore[union-attr]


def should_skip_injection() -> bool:
    return (
        os.environ.get("CLAUDE_NON_INTERACTIVE") == "1"
        or os.environ.get("OPENCODE_NON_INTERACTIVE") == "1"
    )


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def run_script(script_path: Path) -> str:
    try:
        if script_path.suffix == ".py":
            # Add PYTHONIOENCODING to force UTF-8 in subprocess
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            cmd = [sys.executable, "-W", "ignore", str(script_path)]
        else:
            env = os.environ
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


def _get_task_status(trellis_dir: Path) -> str:
    """Check current task status and return structured status string."""
    current_task_file = trellis_dir / ".current-task"
    if not current_task_file.is_file():
        return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"

    task_ref = _normalize_task_ref(current_task_file.read_text(encoding="utf-8").strip())
    if not task_ref:
        return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"

    # Resolve task directory
    task_dir = _resolve_task_dir(trellis_dir, task_ref)
    if not task_dir.is_dir():
        return f"Status: STALE POINTER\nTask: {task_ref}\nNext: Task directory not found. Run: python3 ./.trellis/scripts/task.py finish"

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

    if task_status == "completed":
        return f"Status: COMPLETED\nTask: {task_title}\nNext: Archive with `python3 ./.trellis/scripts/task.py archive {task_dir.name}` or start a new task"

    # Check if context is configured (jsonl files exist and non-empty)
    has_context = False
    for jsonl_name in ("implement.jsonl", "check.jsonl", "spec.jsonl"):
        jsonl_path = task_dir / jsonl_name
        if jsonl_path.is_file() and jsonl_path.stat().st_size > 0:
            has_context = True
            break

    has_prd = (task_dir / "prd.md").is_file()

    if not has_prd:
        return f"Status: NOT READY\nTask: {task_title}\nMissing: prd.md not created\nNext: Write PRD, then research → init-context → start"

    if not has_context:
        return f"Status: NOT READY\nTask: {task_title}\nMissing: Context not configured (no jsonl files)\nNext: Complete Phase 2 (research → init-context → start) before implementing"

    return f"Status: READY\nTask: {task_title}\nNext: Continue with implement or check"


def _load_trellis_config(trellis_dir: Path) -> tuple:
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
        current = get_current_task(repo_root)
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


def main():
    if should_skip_injection():
        sys.exit(0)

    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
    trellis_dir = project_dir / ".trellis"
    claude_dir = project_dir / ".claude"

    # Load config for scope filtering and legacy detection
    is_mono, packages, scope_config, task_pkg, default_pkg = _load_trellis_config(trellis_dir)
    allowed_pkgs = _resolve_spec_scope(is_mono, packages, scope_config, task_pkg, default_pkg)

    output = StringIO()

    output.write("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>

""")

    # Legacy migration warning
    legacy_warning = _check_legacy_spec(trellis_dir, is_mono, packages)
    if legacy_warning:
        output.write(f"<migration-warning>\n{legacy_warning}\n</migration-warning>\n\n")

    output.write("<current-state>\n")
    context_script = trellis_dir / "scripts" / "get_context.py"
    output.write(run_script(context_script))
    output.write("\n</current-state>\n\n")

    output.write("<workflow>\n")
    workflow_content = read_file(trellis_dir / "workflow.md", "No workflow.md found")
    output.write(workflow_content)
    output.write("\n</workflow>\n\n")

    output.write("<guidelines>\n")
    output.write("**Note**: The guidelines below are index files — they list available guideline documents and their locations.\n")
    output.write("During actual development, you MUST read the specific guideline files listed in each index's Pre-Development Checklist.\n\n")

    spec_dir = trellis_dir / "spec"
    if spec_dir.is_dir():
        for sub in sorted(spec_dir.iterdir()):
            if not sub.is_dir() or sub.name.startswith("."):
                continue

            # Always include guides/ regardless of scope
            if sub.name == "guides":
                index_file = sub / "index.md"
                if index_file.is_file():
                    output.write(f"## {sub.name}\n")
                    output.write(read_file(index_file))
                    output.write("\n\n")
                continue

            index_file = sub / "index.md"
            if index_file.is_file():
                # Flat spec dir (single-repo layer like spec/backend/)
                output.write(f"## {sub.name}\n")
                output.write(read_file(index_file))
                output.write("\n\n")
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
                        output.write(f"## {sub.name}/{nested.name}\n")
                        output.write(read_file(nested_index))
                        output.write("\n\n")

    output.write("</guidelines>\n\n")

    output.write("<instructions>\n")
    start_md = read_file(
        claude_dir / "commands" / "trellis" / "start.md", "No start.md found"
    )
    output.write(start_md)
    output.write("\n</instructions>\n\n")

    # Check task status and inject structured tag
    task_status = _get_task_status(trellis_dir)
    output.write(f"<task-status>\n{task_status}\n</task-status>\n\n")

    output.write("""<ready>
Context loaded. Steps 1-3 (workflow, context, guidelines) are already injected above — do NOT re-read them.
Start from Step 4. Wait for user's first message, then follow <instructions> to handle their request.
If there is an active task, ask whether to continue it.
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
