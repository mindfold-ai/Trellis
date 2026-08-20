# Add task.py rename that rewrites identity fields and back-references atomically

## Problem

`task.py` has no rename subcommand, so renaming a task is a hand-edited
multi-file operation: the directory name, `task.json` identity fields,
`parent`/`children` back-references in other tasks, jsonl context paths, and
journal citations. A partial hand-rename leaves dangling references that
downstream preflight gates then reject.

Relocated from sd-ai-command-pack's backlog (08-07-upstream-task-rename,
parked pack-side pending this upstream fix).

## Requirements

1. `task.py rename <old> <new-slug>` rewrites the directory, task.json
   identity fields, and every back-reference (`parent`, `children`, legacy
   `subtasks`) in one operation.
2. Context jsonl paths under the task directory are rewritten; references to
   the old path elsewhere in `.trellis/` are reported even when not
   rewritten.
3. `--dry-run` prints the full change set without touching anything.
4. Refuses to rename onto an existing directory or an archived name.

## Acceptance criteria

- [ ] Rename of a task with a parent and children leaves zero dangling
      references (scripted scan).
- [ ] Dry-run output matches the applied change set.
- [ ] Regression suite green.
