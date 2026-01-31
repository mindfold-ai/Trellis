#!/usr/bin/env python3
"""
Session Start Hook - Inject structured context

Matcher: "startup" - only runs on normal startup (not resume/clear/compact)

This hook injects:
1. Current state (git status, current task, task queue)
2. Workflow guide
3. Guidelines index (frontend/backend/guides)
4. Session instructions (start.md)
5. Action directive
"""

import json
import os
import subprocess
import sys
from io import StringIO
from pathlib import Path


def should_skip_injection() -> bool:
    """
    Determine if context injection should be skipped.

    Multi-agent scripts (start.py, plan.py) set CLAUDE_NON_INTERACTIVE=1
    to prevent duplicate context injection.
    """
    return os.environ.get("CLAUDE_NON_INTERACTIVE") == "1"


def read_file(path: Path, fallback: str = "") -> str:
    """Read file content, return fallback if not found."""
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def run_script(script_path: Path) -> str:
    """Run a script and return its output."""
    try:
        # Use python3 for .py scripts, direct execution for others
        if script_path.suffix == ".py":
            cmd = [sys.executable, str(script_path)]
        else:
            cmd = [str(script_path)]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=script_path.parent.parent.parent,  # repo root
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def main():
    # Skip injection in non-interactive mode (multi-agent scripts set CLAUDE_NON_INTERACTIVE=1)
    if should_skip_injection():
        # No output needed when skipping
        sys.exit(0)

    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
    trellis_dir = project_dir / ".trellis"
    claude_dir = project_dir / ".claude"

    # Collect all output into a buffer
    output = StringIO()

    # 1. Header
    output.write("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>

""")

    # 2. Current Context (dynamic)
    output.write("<current-state>\n")
    context_script = trellis_dir / "scripts" / "get_context.py"
    output.write(run_script(context_script))
    output.write("\n</current-state>\n\n")

    # 3. Workflow Guide
    output.write("<workflow>\n")
    workflow_content = read_file(trellis_dir / "workflow.md", "No workflow.md found")
    output.write(workflow_content)
    output.write("\n</workflow>\n\n")

    # 4. Guidelines Index
    output.write("<guidelines>\n")

    output.write("## Frontend\n")
    frontend_index = read_file(
        trellis_dir / "spec" / "frontend" / "index.md", "Not configured"
    )
    output.write(frontend_index)
    output.write("\n\n")

    output.write("## Backend\n")
    backend_index = read_file(
        trellis_dir / "spec" / "backend" / "index.md", "Not configured"
    )
    output.write(backend_index)
    output.write("\n\n")

    output.write("## Guides\n")
    guides_index = read_file(
        trellis_dir / "spec" / "guides" / "index.md", "Not configured"
    )
    output.write(guides_index)

    output.write("\n</guidelines>\n\n")

    # 5. Session Instructions
    output.write("<instructions>\n")
    start_md = read_file(
        claude_dir / "commands" / "trellis" / "start.md", "No start.md found"
    )
    output.write(start_md)
    output.write("\n</instructions>\n\n")

    # 6. Final directive
    output.write("""<ready>
Context loaded. Wait for user's first message, then follow <instructions> to handle their request.
</ready>""")

    # Output in Claude Code SessionStart hook format
    result = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": output.getvalue(),
        }
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
