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

## Version state (live scan, 2026-08-19)

Scanned `<repo>/.trellis/.version` for every entry in
`platypeeps/sd-ai-command-pack/docs/fleet/consumers.json` (schemaVersion 5).

| Consumer | rolloutPriority | Version | Orphan session files |
|---|---:|---|---:|
| rwbp-coordinator | 10 | 0.6.7 | 0 |
| loadsmith | 20 | 0.6.7 | 1 |
| hoa-manager | 30 | 0.6.7 | 0 |
| rwbp-website | 40 | 0.6.7 | 1 |
| mezmo_benchmark | 50 | 0.6.7 | 1 |
| se-ai-command-pack | 60 | 0.6.7 | 0 |
| sd-github-review | 70 | 0.6.7 | 0 |
| anomaly-metric-creator | 90 | 0.6.7 | 0 |

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
- Clear the 3 orphaned session files (`loadsmith`, `rwbp-website`,
  `mezmo_benchmark`) **after** that repo's upgrade, never before — clearing
  first only masks the symptom while the buggy `finish` persists.
- Re-scan before acting. The inventory above is a point-in-time snapshot and
  orphan counts drift as sessions end.

## Acceptance Criteria

- [ ] All 8 consumers report `.trellis/.version` >= 0.6.10.
- [ ] For each of the 8, the vendored `active_task.py` contains
      `_context_path(repo_root, previous.context_key)`.
- [ ] The 3 orphaned session files are cleared, each after its repo's upgrade.
- [ ] Each consumer's `candidateChecks` pass post-upgrade.
- [ ] Cohort ordering from `rolloutPolicy` was followed and recorded.

## Out of Scope

- Writing any fix. The fix exists upstream; this task distributes it.
- Automatic GC of orphaned session files on session end. That is the upstream
  root cause — orphans are still being created post-0.6.14 — and needs its own
  task. This one clears only the existing 3.
- The `cmd_finish` unconditional-success-message hardening, carried over as a
  residual defect from `08-06-adopt-trellis-finish-clear-fix`.
