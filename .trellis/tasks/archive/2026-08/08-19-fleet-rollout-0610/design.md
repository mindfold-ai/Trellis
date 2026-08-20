# Design — fleet rollout of Trellis >=0.6.10

## Mechanism

Each consumer vendors Trellis scripts under `<repo>/.trellis/scripts/`. The
upgrade is `trellis update` run from the consumer root. The local CLI is
**0.6.14**, so a successful update vendors 0.6.14 scripts — past the 0.6.10
threshold that carries `621435d1`.

`trellis update` supports `--dry-run`. Every consumer gets a dry run before a
real run; an unexpected dry-run diff is a stop condition, not something to force
through. `--force` is not used: it overwrites locally-changed files silently,
which is exactly the class of damage that is unacceptable in someone else's repo.

## Boundaries

- **In scope:** the 8 consumers in `docs/fleet/consumers.json`.
- **Not touched:** `ai/Trellis` (already 0.6.14) and `sd-ai-command-pack` (the
  pack itself, not a fleet consumer; already 0.6.14).
- **Git:** all 8 sit on their default branch `main`, all clean. Work lands on a
  per-repo branch `chore/trellis-0.6.14`, never on `main`. Commit only; **no
  push** — pushing 8 repos is a separate, explicit decision.

## Verification contract

A version bump alone proves nothing: `.trellis/.version` can advance while the
vendored script is untouched. The binding check is on file content:

```
grep -q '_context_path(repo_root, previous.context_key)' \
  <repo>/.trellis/scripts/common/active_task.py
```

Pre-upgrade every consumer fails this; post-upgrade every consumer must pass it.
That grep — not the version string — is the acceptance signal.

## Ordering and failure handling

Cohorts come from `rolloutPolicy`: canary (sequential: rwbp-coordinator,
loadsmith, hoa-manager), post-canary (rwbp-website, mezmo_benchmark,
se-ai-command-pack, sd-github-review), final (anomaly-metric-creator).

Execution is sequential throughout. The manifest permits `maxConcurrency` 2 for
post-canary, but parallelism here buys seconds while costing the ability to
attribute a failure to a repo; there is no wall-clock pressure.

Any consumer that fails its dry run, its `candidateChecks`, or the grep stops
the rollout at that repo. Earlier repos keep their committed branch — the work
is per-repo isolated and independently revertible via branch deletion.

## Orphan session files

3 exist: `loadsmith`, `rwbp-website`, `mezmo_benchmark` (1 each). Each is cleared
only *after* that repo's upgrade lands. Clearing first would delete the evidence
while leaving the buggy `finish` in place, so the same orphan would recur.

Counts are re-scanned at execution time; the snapshot is not trusted.
