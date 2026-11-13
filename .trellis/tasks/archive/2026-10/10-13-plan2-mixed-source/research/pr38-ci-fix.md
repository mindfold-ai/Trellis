# PR38 CI fixture maintenance correction

Date: 2026-10-13. Base: `98075f3af510c250508fc5ca62df172610048083`.
This report records local implementation/check evidence, not publication or a
new green remote CI run. Issue #31 stays closed; downstream acceptance is not a
prerequisite.

## Observed failure and cause

CI run `38407261720` completed Core with 475 passes and one existing placeholder
skip. CLI had 2284 passes and one failure, in `isolates live registry Git
discovery from redirected ambient Git configuration`. Its complete unrelated
repository file/hash/mode snapshot differed solely because the empty
`.git/objects/maintenance.lock` disappeared between snapshots. No changed Task,
session, tracked content or migration output was reported in that diff.
Raw log: `/tmp/plan2-mixed-source-pr38-ci-failed.log`.

The fixture commits were permitted to launch detached automatic Git
maintenance. A fresh isolated Trace2 probe using host Git 2.54.0 (Apple Git-157)
and Node v26.9.0 confirmed that the original empty commit starts
`git maintenance run --auto --no-quiet --detach`. The maintenance child's final
exit event follows the parent commit exit event. With the proposed command-local
configuration, no maintenance child is started. The host probe did **not**
observe a transient lock at the sampled times; it confirms the detached-child
mechanism, while the actual lock disappearance is supplied by the retained CI
failure. No local lock-race reproduction or Ubuntu rerun is claimed.
Probe log: `/tmp/plan2-mixed-source-pr38-ci-maintenance-probe.log`; raw Trace2
files remain in the fresh synthetic directory named in that log.

## Focused change

Only `packages/cli/test/commands/migrate2.integration.test.ts` changes product
repository test bytes: six added lines in the failing test's two fixture commit
commands, including a comment and command-local `maintenance.auto=false` plus
`gc.auto=0`. The first prevents the detached maintenance child; the second also
disables the automatic-GC fallback used by older Git versions. Neither writes
repository/global Git configuration nor changes the migration's environment.

The real Git initialization/commits, redirected `GIT_DIR`, `GIT_WORK_TREE` and
`GIT_CONFIG_*`, migration execution, complete unrelated-repository snapshot,
and resulting schema-2 assertion remain intact. There are no snapshot
exclusions, mocks of the intended guard, timeout increases, product/Core/spec/
workflow/CI changes or package-content changes.

| Identity | SHA-256 |
| --- | --- |
| Committed test preimage | `29499492eae77ad93b3be114adfff94cd888d9bb1a27f1a606968561e4af24f0` |
| Final test file | `80b1fe237dadf2cf791cf0f3416be2c9e65d04a36a099459d8faa6044d3ba7e6` |
| Exact one-file binary diff | `d9f00fcb843b4dbc9bc7eeaf2bc55566b8815a021283384a3e6d74de9abc7edb` |

## Checks and retained failures

- Targeted failing test: 1 pass, 162 explicit name-filter skips; exit0.
  `/tmp/plan2-mixed-source-pr38-ci-targeted.log`.
- Root `pnpm lint`: exit0.
  `/tmp/plan2-mixed-source-pr38-ci-lint.log`.
- Root `pnpm typecheck`: Core build and CLI typecheck both pass, exit0.
  `/tmp/plan2-mixed-source-pr38-ci-typecheck.log`.
- Final affected file, after typecheck completed:
  `pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts --maxWorkers 1`:
  163 passes, no skips, exit0, 51.00 seconds.
  `/tmp/plan2-mixed-source-pr38-ci-affected-final.log`.
- `git diff --check`: exit0.

The first affected-file attempt was mistakenly started concurrently with root
typecheck, whose Core build cleans `packages/core/dist`. It failed during module
import (`migration-v2.js` missing), before any tests ran. Its actual exit1/no-test
result is retained at `/tmp/plan2-mixed-source-pr38-ci-affected.log`; it is a
check-scheduling failure, not a migration failure or a passing test attempt.
This repeats the previously documented build/test scheduling hazard; the final
rerun was sequential. No combined/full-suite pass is fabricated from the
targeted and affected-file results.

## Remaining boundary

Independent review belongs to the main session. New commit/push/PR update and
remote CI verification require the exact subsequent authorization. This
implementer executed no repository Git mutations, publication, real-sample
writes or outbound task messages. The raw failed CI run remains failed; only a
fresh authorized remote run can establish the correction on Ubuntu.
