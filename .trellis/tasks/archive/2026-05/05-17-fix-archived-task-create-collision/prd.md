# Fix Archived Task Create Collision

## Problem

After a task is archived, a stale session or hook can trigger `task.py create` with the same date-prefixed slug. The old implementation only checked the active task path, so it could seed a new active task directory that duplicates an archived task.

## Requirements

- `task.py create` must refuse to create a task when `.trellis/tasks/archive/*/<dir_name>` already exists.
- The failure must happen before writing `task.json`, JSONL seed files, parent links, hooks, or session active-task pointers.
- The error must show the archived task name and archive path.
- Existing active-directory duplicate behavior is unchanged.
- Add a regression test for `create -> archive -> create same slug`.

## Verification

- Targeted regression test passes.
- Lint and typecheck pass for the touched TypeScript files.
- Changed Python files pass syntax/type checks.
