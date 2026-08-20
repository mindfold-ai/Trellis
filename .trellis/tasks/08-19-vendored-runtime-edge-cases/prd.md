# Harden vendored runtime edge cases found by bot review

## Context

Automated reviewers (copilot-pull-request-reviewer) raised these against the
vendored runtime on `platypeeps/hoa-manager#275`, one of the 0.6.16-sd.1
consumer rollout PRs. Each was checked against the source and holds up.

They are **pre-existing** in the runtime, not introduced by the rollout. They
were deferred rather than fixed inline because six consumer repos had already
merged the roll by the time they surfaced; fixing them in the fork at that
point would have re-drifted all six for changes unrelated to the version bump.

Related findings from the same review pass **were** fixed inline, in
`fix(scripts): address the bot review findings on the vendored runtime`
(path containment, `--platform Codex` case folding, dead `if not <Path>`
guards, `--json` usage text, dead assignments, undocumented `except: pass`).
These three are what was left on the table.

## Findings

### 1. `children` assumed to be a list — `common/task_store.py:544`

`parent_data.get("children", [])` returns the default only when the key is
absent. A parent `task.json` carrying `"children": null` — older format, or
hand-edited — yields `None`, and the following `dir_name not in parent_children`
raises `TypeError`.

Worse than a crash: it aborts **after** the new task.json is written, leaving a
task on disk that its parent does not reference.

Normalize to a list before use, and write the normalized value back.

### 2. `stat()` unguarded in a non-blocking check — `common/task_context.py:349`

`full_path.stat()` can raise `OSError` on a permission change, or if the file
is removed between the earlier `is_file()` and this call. This sits inside a
hygiene warning that is explicitly advisory, so an exception here fails
`task.py validate` over a check that was never meant to block.

Guard the stat and skip the warning when the size cannot be read.

### 3. Fingerprint derived from `today` breaks retry across midnight — `add_session.py:1151`

The resume/idempotency marker folds in `today` (`YYYY-MM-DD`). If a run is
interrupted after the journal and index are written but before the commit, and
the user retries after midnight, the recomputed fingerprint differs,
`classify_record()` does not find the pending marker, and the retry appends a
**second** session instead of resuming the first.

This one is a semantics change, not a defensive tweak: it alters how existing
pending markers are matched. It needs its own design pass — in particular
whether already-written markers stay resolvable after the change.

## Acceptance criteria

- A parent `task.json` with `"children": null` links a child without raising,
  and the parent is left with a valid list.
- `task.py validate` still exits 0 when the stat target is unreadable, and
  emits no size warning for it.
- A session interrupted before commit and retried after a date rollover
  resumes the existing entry rather than appending a second one — with markers
  written before the change still matching.
- Each fix ships to the fork template and its in-repo vendored copy together,
  so the byte-identical regression guard stays green.

## Out of scope

Re-rolling the eight consumer repos. These ride along with the next roll rather
than justifying one.
