# Guard non-list `children` and unguarded `stat()` in the vendored runtime

Child of `08-19-vendored-runtime-edge-cases`. Independent of its sibling
`08-19-session-fingerprint-rollover` — no ordering between them; they touch
different files and can land in either order.

## Problem

Two defensive gaps in the vendored Trellis runtime, both raised by
copilot-pull-request-reviewer on `platypeeps/hoa-manager#275` and both verified
against the source. Neither was introduced by the 0.6.16-sd.1 roll.

### 1. Non-list `children` aborts task creation after the write

`common/task_store.py:544`

    parent_data.get("children", [])

`.get(key, default)` returns the default only when the key is **absent**. A
parent `task.json` carrying `"children": null` — older format, or hand-edited —
yields `None`, and the following `dir_name not in parent_children` raises
`TypeError`.

The severity is in the ordering: this raises **after** the new task.json has
already been written. The result is a task on disk that its parent does not
reference, which is worse than either succeeding or failing cleanly.

### 2. `stat()` unguarded inside an advisory check

`common/task_context.py:349`

`full_path.stat()` can raise `OSError` — a permission change, or the file
removed between the earlier `is_file()` and this call. It sits inside a hygiene
warning that is explicitly non-blocking, so an exception there fails
`task.py validate` over a check that was never meant to be able to fail it.

## Acceptance Criteria

- [ ] Linking a child to a parent whose `task.json` has `"children": null`
      succeeds, and leaves the parent holding a valid list containing the child.
- [ ] The same holds for any other non-list value in that field (string,
      number, object) — it is normalized rather than crashing.
- [ ] No task.json is left written-but-unreferenced by a failure in this path:
      either the link completes, or the run fails before writing.
- [ ] `task.py validate` exits 0 when the stat target is unreadable, and emits
      no size warning for it, while still warning normally for readable files.
- [ ] Each fix lands in the fork template **and** its in-repo vendored copy in
      the same change, so the byte-identical regression guard stays green.
- [ ] Full CLI suite green (baseline 1829/1829).

## Out of scope

- The idempotency fingerprint rollover — that is the sibling task, and it is a
  semantics change rather than a defensive guard.
- Re-rolling the eight consumer repos. These ride along with the next roll.
