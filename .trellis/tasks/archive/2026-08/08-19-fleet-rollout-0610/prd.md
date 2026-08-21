# Roll Trellis >=0.6.10 to the 8 fleet consumers

## Goal

Every consumer repo vendors Trellis scripts. All 8 currently run **0.6.7**, which
predates the `clear_active_task` fix (`621435d1`, first released in `v0.6.10`).
Until each consumer's *vendored* `.trellis/scripts/common/active_task.py` is
refreshed, `task.py finish` keeps reporting `✓ Cleared current task` while
clearing nothing on fallback-resolved pointers.

Split out of `08-06-adopt-trellis-finish-clear-fix`, which adopted the fix in
`ai/Trellis` itself (now 0.6.14) and closed its in-repo criteria. This task owns
only the cross-repo rollout.

## Progress

Canary cohort complete 2026-08-19 — rwbp-coordinator, loadsmith, hoa-manager
all on 0.6.16-sd.0, each verified by grep for the fix (not just the version
string), each `candidateChecks` green, each committed on
`chore/trellis-0.6.16-sd.0` and **not pushed**.

Installed from a local fork build, not a published release: 0.6.16-sd.0 is
upstream 0.6.15 plus unmerged PR 534 work. Rebuild with `pnpm build` in
ai/Trellis and invoke `node packages/cli/bin/trellis.js update` from the
consumer. The version bump in ai/Trellis is intentionally uncommitted.

Post-canary and final cohorts remain.

## Version state (live scan, 2026-08-19)

Scanned `<repo>/.trellis/.version` for every entry in
`platypeeps/sd-ai-command-pack/docs/fleet/consumers.json` (schemaVersion 5).

| Consumer | rolloutPriority | Version | Session files | Orphaned |
|---|---:|---|---:|---:|
| rwbp-coordinator | 10 | ~~0.6.7~~ **0.6.16-sd.0** | 0 | 0 |
| loadsmith | 20 | ~~0.6.7~~ **0.6.16-sd.0** | 1 | **0 (live)** |
| hoa-manager | 30 | ~~0.6.7~~ **0.6.16-sd.0** | 0 | 0 |
| rwbp-website | 40 | 0.6.7 | 1 | **0 (live)** |
| mezmo_benchmark | 50 | 0.6.7 | 1 | **0 (live)** |
| se-ai-command-pack | 60 | 0.6.7 | 0 | 0 |
| sd-github-review | 70 | 0.6.7 | 0 | 0 |
| anomaly-metric-creator | 90 | 0.6.7 | 0 | 0 |

All 8 are affected. None have been upgraded.

`ai/Trellis` is at 0.6.14 with 0 orphans and is **not** part of this rollout.

## Requirements

- Drive the rollout from `docs/fleet/consumers.json`, not a hand-written list.
  Respect its `rolloutPolicy`: canary cohort first, then post-canary at
  `maxConcurrency` 2, then the final cohort.
- For each consumer, verify the **vendored** file actually changed after upgrade.
  A package bump that does not refresh vendored scripts fixes nothing. Assert
  `_context_path(repo_root, previous.context_key)` is present in
  `<repo>/.trellis/scripts/common/active_task.py`.
- Run each consumer's declared `candidatePrepare` / `candidateChecks` from the
  manifest before treating that consumer as done.
- **Do not delete session files.** The "3 orphans" claimed by the 2026-08-19
  scan were counted by file existence alone. Verified on 2026-08-19 by
  resolving each file's `current_task`: all three point at task directories
  that exist and were last seen 2026-08-15..17. They are LIVE pointers, not
  orphans. The fleet currently has **zero** orphaned session files.
- A session file is orphaned only when its `current_task` names a directory
  that does not exist. Counting files in `.runtime/sessions/` does not
  establish that, and deleting on a file count destroys live task pointers
  for whoever owns that session.

## Acceptance Criteria

- [ ] All 8 consumers report `.trellis/.version` >= 0.6.10.
- [ ] For each of the 8, the vendored `active_task.py` contains
      `_context_path(repo_root, previous.context_key)`.
- [x] ~~The 3 orphaned session files are cleared~~ **VOID — there are no
      orphans.** All three resolve to existing task directories. Deleting them
      would have destroyed live pointers. No session file is to be removed.
- [ ] Each consumer's `candidateChecks` pass post-upgrade.
- [ ] Cohort ordering from `rolloutPolicy` was followed and recorded.

## Out of Scope

- Writing any fix. The fix exists upstream; this task distributes it.
- Automatic GC of orphaned session files on session end. That is the upstream
  root cause — orphans are still being created post-0.6.14 — and needs its own
  task. This one clears only the existing 3.
- The `cmd_finish` unconditional-success-message hardening, carried over as a
  residual defect from `08-06-adopt-trellis-finish-clear-fix`.
