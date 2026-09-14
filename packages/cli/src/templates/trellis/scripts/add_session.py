#!/usr/bin/env python3
"""Retirement diagnostic; does not access project data."""

import sys


def main() -> int:
    print(
        "Error: add_session.py is retired. Developer identity and workspace recording "
        "are no longer supported. Use task.py create --creator <name> "
        "--assignee <name> and task.py finish/archive for task lifecycle.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
