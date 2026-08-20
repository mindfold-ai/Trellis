# Adopt Trellis >=0.6.10 so task.py finish clears fallback-resolved pointers

## Goal

`task.py finish` prints `✓ Cleared current task` while clearing nothing whenever
the active task was resolved through the single-session fallback path. **This is
already fixed upstream.** No code needs to be written — the fork and the
consumers are running versions that predate the fix. Roll them forward.

## What the bug is

`clear_active_task` deleted `_context_path(repo_root, context_key)` — the file
for the *current* session key — without consulting which of the two resolution
paths produced the pointer. When resolution fell through to
`_resolve_single_session_fallback`, the pointer lived in a **different** (often
ended) session's file, so nothing was deleted. `clear_active_task` still returned
the resolved `previous`, and `cmd_finish` branches only on `active.task_path`
being truthy, so it reported success regardless.

Observed in `platypeeps/sd-github-review` on 2026-08-06: a pointer left by an
ended session, naming a task directory that no longer existed, survived repeated
`finish` calls, each reporting success. Only deleting the orphaned session file
cleared it. `SessionStart` advertises `task.py finish` as the fix for a stale
pointer, so the documented recovery step was the one that failed.

## The upstream fix

Commit `621435d1` — "fix: resolve post-0.6.9 task and Codex regressions (#477)",
2026-07-28 — in
`packages/cli/src/templates/trellis/scripts/common/active_task.py`:

```diff
-    context_path = _context_path(repo_root, context_key)
+    if not previous.task_path or not previous.context_key:
+        return previous
+    context_path = _context_path(repo_root, previous.context_key)
```

It clears the pointer that was actually *resolved*. `ActiveTask` already carries
the fallback key (`_active_from_ref(..., "session-fallback", fallback_key)`), so
the fallback file is targeted correctly.

**First release containing it: `v0.6.10`** (`git tag --contains 621435d1`).

## Version state (verified 2026-08-06)

| Where | Version | Has fix |
|---|---|---|
| upstream `origin/main` (`mindfold-ai/Trellis`) | 0.6.15 | yes |
| this fork's `main` (`sdelmas/Trellis`) | 0.6.14 | yes |
| this repo (`ai/Trellis` vendored `.trellis/.version`) | 0.6.14 | yes |
| all 8 fleet consumers | 0.6.7 | **no** |

Re-verified by live scan 2026-08-19 against every entry in
`sd-ai-command-pack/docs/fleet/consumers.json`. The fork is no longer affected;
all 8 consumers still are. Per-consumer detail moved to the rollout task below.

## Requirements

- Sync this fork's `main` with upstream `origin/main` so it carries `621435d1`.
  Note `origin` has push DISABLED here; `fork` (`sdelmas/Trellis`) is the push
  target, and local `main` tracks `fork/main`.
- The fork's `main` carries 5 commits not present upstream
  (`git rev-list origin/main..fork/main --count`). Preserve or explicitly retire
  them; do not silently drop them in the sync.
- Upgrade consumers off affected versions (<0.6.10). Drive the list from
  `sd-status fleet`, not from memory.
- After upgrade, verify the *vendored* copy in each consumer actually changed —
  `.trellis/scripts/common/active_task.py` is vendored per consumer, so a
  package bump that does not refresh vendored scripts fixes nothing.
- Clear any orphaned session files left behind by ended sessions as part of the
  rollout. The 2026-08-06 inventory in this PRD proved stale: a live scan on
  2026-08-19 found 3 orphans total — `loadsmith` (1), `rwbp-website` (1),
  `mezmo_benchmark` (1) — and zero in `sd-ai-command-pack`,
  `anomaly-metric-creator`, `hoa-manager`, `se-ai-command-pack`, `ai/Trellis`.
  Re-scan before acting rather than trusting any recorded count. With >=2 files
  the fallback refuses to guess, so these present as "no current task" rather
  than a wrong task — same root cause, different symptom.

## Acceptance Criteria

- [x] Fork `main` contains `621435d1`; its `packages/cli/package.json` version is
      >= 0.6.10. (Verified 2026-08-09: fork/main synced to origin/main, 0.6.14.)
- [x] The 5 fork-local commits are preserved or their retirement is recorded.
      (Retired 2026-08-09: 3 patch-equivalent on chore/task-backlog-2026-08, the
      JSONL fix superseded by upstream, task artifacts archived; recorded in the
      2026-08-09 session journal.)
- [~] Every consumer identified by `sd-status fleet` runs >= 0.6.10.
      (Split 2026-08-19 into `08-19-fleet-rollout-0610`. Live scan that day: all
      8 consumers still on 0.6.7. Not achievable in this repo — tracked there.)
- [x] In at least one upgraded consumer, the vendored
      `.trellis/scripts/common/active_task.py` contains
      `_context_path(repo_root, previous.context_key)`. (Verified 2026-08-09 in
      ai/Trellis itself at active_task.py:695 after trellis update 0.6.14.)
- [x] End-to-end proof in an upgraded consumer: with a single orphaned session
      file present, `task.py finish` clears it and a following `task.py current`
      reports no current task. (Proven 2026-08-09 in a temp repo with the 0.6.14
      scripts: finish from a different session id cleared the fallback file,
      source reported as session-fallback, sessions dir left empty.)
- [~] Orphaned session files across the listed repos are cleared. (ai/Trellis:
      clear, re-confirmed 2026-08-19. The 2026-08-09 remainder list was stale —
      those 4 repos now hold zero orphans. Actual remaining 3 are in loadsmith,
      rwbp-website, mezmo_benchmark. Split into `08-19-fleet-rollout-0610`.)

## Disposition (2026-08-19)

In-repo scope is complete: this repo carries `621435d1` at 0.6.14, the vendored
`active_task.py` is fixed, the fork sync and fork-local commit retirement are
done, and end-to-end proof is recorded above. The two remaining criteria are
cross-repo by nature and cannot be closed from `ai/Trellis`; both are delegated
to `08-19-fleet-rollout-0610`, which carries the live-scanned consumer table.
Marked `[~]` rather than `[x]` — delegated, not satisfied.

## Residual defect NOT fixed upstream

`cmd_finish` still prints `✓ Cleared current task` unconditionally whenever
`active.task_path` is truthy — it never confirms a file was removed. With
`clear_active_task` fixed the message is now truthful in practice, but the guard
is absent, so any future path that returns a resolved task without deleting its
file will silently reintroduce false success. `clear_active_task`'s own early
return (`if not previous.task_path or not previous.context_key`) is exactly such
a path, though it appears unreachable today because `_active_from_ref` always
sets `context_key`.

Small hardening, out of scope for this rollout. File separately if wanted.

## Out of Scope

- Writing a fix for the finish-clear bug. It exists upstream; this task adopts it.
- Redesigning session-context identity or the fallback resolution semantics.
- Garbage-collecting orphaned session files *automatically* on session end. That
  is the upstream cause and deserves its own task; this one only clears the
  existing ones.
