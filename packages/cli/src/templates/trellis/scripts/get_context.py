#!/usr/bin/env python3
"""
Get Session Context for AI Agent.

Usage:
    python3 get_context.py           Output context in text format
    python3 get_context.py --json    Output context in JSON format
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from common.active_task import resolve_active_task
from common.git_context import main as _main
from common.paths import get_repo_root


def main() -> None:
    """Keep caller context, but load phase instructions from the task workspace."""
    probe = argparse.ArgumentParser(add_help=False)
    probe.add_argument("--mode", "-m", default="default")
    options, _ = probe.parse_known_args()
    original_cwd = Path.cwd()
    try:
        active = resolve_active_task(get_repo_root())
        if active.error and options.mode != "default":
            print(f"Error: {active.error}", file=sys.stderr)
            sys.exit(1)
        if options.mode == "phase" and active.task_workspace_root:
            os.chdir(active.task_workspace_root)
        _main()
        if active.error:
            sys.exit(1)
    except (ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        os.chdir(original_cwd)


if __name__ == "__main__":
    main()
