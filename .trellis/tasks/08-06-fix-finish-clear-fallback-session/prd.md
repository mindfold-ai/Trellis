# Fix task.py finish silently failing to clear a fallback-resolved active task

## Goal

`task.py finish` reports `✓ Cleared current task` while clearing nothing whenever
the active task was resolved through the single-session fallback path. The stale
pointer survives, and the user is told it was removed.

## Problem

`resolve_active_task` has two resolution paths
(`packages/cli/src/templates/trellis/scripts/common/active_task.py:493-527`):

1. **context-key path** — reads `sessions/<context_key>.json` for the *current*
   session and returns `source="session"`.
2. **single-session fallback** — when context-key resolution yields nothing, and
   exactly one session file exists in the runtime, returns that file's task with
   `source="session-fallback"` and the fallback key
   (`_resolve_single_session_fallback`, `:530-552`).

`clear_active_task` (`:610-624`) only ever deletes
`_context_path(repo_root, context_key)` — the file for the **current** session
key. It never consults which path actually produced the pointer:

```python
context_key = resolve_context_key(platform_input, platform)
if not context_key:
    return ActiveTask(None, "none")

previous = resolve_active_task(repo_root, platform_input, platform)
context_path = _context_path(repo_root, context_key)   # <-- current session only
if context_path.is_file():
    _remove_file(context_path)
return previous
```

So when the pointer came from the fallback (a *different* session's file),
nothing is deleted. `clear_active_task` still returns the resolved `previous`,
and `cmd_finish` (`task.py:146-164`) branches only on `active.task_path` being
truthy — which it is — and prints success:

```python
print(colored(f"✓ Cleared current task (was: {current})", Colors.GREEN))
print(f"Source: {active.source}")
```

The printed `Source: session-fallback:<key>` is the only hint anything is wrong,
and it reads as provenance, not as failure.

## Reproduction

Observed in `platypeeps/sd-github-review` on 2026-08-06:

1. Runtime holds exactly one session file, `claude_ad50577a-….json`, written by
   a session that has since ended. It points at
   `.trellis/tasks/08-05-guard-v2-fingerprint-identity-completeness`, a directory
   that no longer exists.
2. A new session (`claude_982b9be6-…`) starts. Its own context file does not
   exist, so resolution falls through to the single-session fallback and returns
   the dead session's task.
3. `python3 ./.trellis/scripts/task.py finish` prints:
   ```
   ✓ Cleared current task (was: .trellis/tasks/08-05-guard-v2-fingerprint-identity-completeness)
   Source: session-fallback:claude_ad50577a-5569-41e0-a66f-6a3c03a35039
   ```
4. `task.py current` still prints the same task path. The session file is
   untouched on disk. Repeating `finish` repeats the false success indefinitely.
5. Only manually deleting the orphaned session file clears it.

Severity is user-trust rather than data loss: nothing is corrupted, but the
documented recovery step for a stale pointer does not work and actively reports
that it did. `SessionStart` surfaces the stale pointer with
`Next-Action: Run task.py finish`, so the advertised fix is the one that fails.

## Requirements

- `clear_active_task` must clear the pointer it actually resolved, including when
  that pointer came from `_resolve_single_session_fallback`. The returned
  `ActiveTask` already carries the fallback key, so the target is available
  without re-scanning.
- `cmd_finish` must not report success when nothing was cleared. Report the
  outcome that occurred, and make a no-op distinguishable from a real clear.
- Preserve the multi-session isolation contract from task `04-21`: with two or
  more session files present, resolution still refuses to guess, and `finish`
  must not delete another window's session file on that basis.
- Behavior when the pointer resolves normally through the context-key path is
  unchanged.
- A pointer that names a task directory that no longer exists must still be
  clearable — the stale case is exactly when users reach for `finish`.
- Consider whether the existing `clear_task_from_sessions` helper (`:627-649`),
  which already scans every session file for a given task ref, is the right
  mechanism to reuse rather than adding a second deletion path.

## Acceptance Criteria

- [ ] `finish` clears a pointer resolved via the single-session fallback; a
      following `current` reports no current task.
- [ ] `finish` never prints `✓ Cleared current task` when the underlying file was
      not removed; the no-op path is visibly distinct.
- [ ] With ≥2 session files present, `finish` does not delete a session file
      belonging to a different window (isolation contract preserved).
- [ ] `finish` clears a pointer whose task directory no longer exists.
- [ ] Context-key-path `finish` behavior is unchanged.
- [ ] Regression tests cover the fallback-clear, the no-op report, the
      multi-session refusal, and the missing-task-directory case.
- [ ] Change lands in `packages/cli/src/templates/trellis/scripts/` (the
      distributed template), not only in this repo's own vendored `.trellis/`.

## Affected Files

- `packages/cli/src/templates/trellis/scripts/common/active_task.py`
  (`clear_active_task` `:610-624`; `_resolve_single_session_fallback` `:530-552`;
  `clear_task_from_sessions` `:627-649`)
- `packages/cli/src/templates/trellis/scripts/task.py` (`cmd_finish` `:146-164`)

Verified byte-identical between the template and a consumer's vendored copy, so
every installed consumer carries this bug.

## Out of Scope

- Redesigning session-context identity or the context-key resolution scheme.
- Changing the single-session fallback's *resolution* semantics; only clearing
  and reporting are in scope.
- Garbage-collecting orphaned session files from ended sessions generally. Worth
  a separate task — it is the upstream cause of the stale pointer, but fixing
  `finish` is independently correct.
