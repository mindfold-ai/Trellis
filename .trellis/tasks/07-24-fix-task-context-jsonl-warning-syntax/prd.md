# Fix task context JSONL warning SyntaxError

## Goal

Fix the Python SyntaxError in task_context.py JSONL warning messages so task.py validate and task lifecycle commands can import and run.

## Requirements

- Fix the invalid nested multi-line f-string in `task_context.py` warning
  output so Python 3.9 can import the module.
- Apply the same fix to the dogfood runtime copy and the packaged Trellis
  template copy.
- Preserve the existing warning text and non-blocking validation behavior for
  code-looking JSONL entries and oversized context files.
- Avoid broad task-context behavior changes; this is a syntax repair only.
- Verify `task.py validate` runs again on local task directories.

## Acceptance Criteria

- [x] Both `task_context.py` copies compile under Python 3.9-compatible syntax.
- [x] `task.py validate` imports successfully instead of failing with
  `SyntaxError: EOL while scanning string literal`.
- [x] JSONL hygiene warnings still print the same user-facing message.
- [x] Focused task-context and task-lifecycle tests that previously hit this
  import path pass.

## Notes

- Fix changed only:
  `.trellis/scripts/common/task_context.py` and
  `packages/cli/src/templates/trellis/scripts/common/task_context.py`.
- Verification already run locally:
  `py_compile` with `PYTHONPYCACHEPREFIX=/private/tmp/trellis-pycache`,
  `task.py validate` for the two local task directories, focused Vitest task
  suites, and `git diff --check`.
- Remaining unrelated blocker: `platforms.integration.test.ts` still fails
  because the built CLI reports `unknown command 'platforms'`; CLI build is
  separately blocked by existing `src/commands/mem.ts` TypeScript errors.
