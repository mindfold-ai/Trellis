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

import os
import subprocess
import sys
from pathlib import Path


def should_skip_injection() -> bool:
    """
    Determine if context injection should be skipped.

    Multi-agent scripts (start.sh, plan.sh) set CLAUDE_NON_INTERACTIVE=1
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
        result = subprocess.run(
            [str(script_path)],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=script_path.parent.parent.parent,  # repo root
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def main():
    # Skip injection in non-interactive mode (multi-agent scripts set CLAUDE_NON_INTERACTIVE=1)
    if should_skip_injection():
        sys.exit(0)

    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
    trellis_dir = project_dir / ".trellis"
    claude_dir = project_dir / ".claude"

    # 1. Header
    print("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>
""")

    # 2. Current Context (dynamic)
    print("<current-state>")
    context_script = trellis_dir / "scripts" / "get-context.sh"
    print(run_script(context_script))
    print("</current-state>")
    print()

    # 3. Workflow Guide
    print("<workflow>")
    workflow_content = read_file(trellis_dir / "workflow.md", "No workflow.md found")
    print(workflow_content)
    print("</workflow>")
    print()

    # 4. Guidelines Index
    print("<guidelines>")

    print("## Frontend")
    frontend_index = read_file(
        trellis_dir / "spec" / "frontend" / "index.md", "Not configured"
    )
    print(frontend_index)
    print()

    print("## Backend")
    backend_index = read_file(
        trellis_dir / "spec" / "backend" / "index.md", "Not configured"
    )
    print(backend_index)
    print()

    print("## Guides")
    guides_index = read_file(
        trellis_dir / "spec" / "guides" / "index.md", "Not configured"
    )
    print(guides_index)

    print("</guidelines>")
    print()

    # 5. Session Instructions
    print("<instructions>")
    start_md = read_file(
        claude_dir / "commands" / "trellis" / "start.md", "No start.md found"
    )
    print(start_md)
    print("</instructions>")
    print()

    # 6. Final directive
    print("""<ready>
Context loaded. Wait for user's first message, then follow <instructions> to handle their request.
</ready>""")


if __name__ == "__main__":
    main()
