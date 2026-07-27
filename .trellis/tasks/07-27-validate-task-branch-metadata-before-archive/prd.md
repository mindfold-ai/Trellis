# Validate task branch metadata before archive

## Goal

Ensure Trellis task branch and base_branch metadata are populated, validated, and recoverable before archive/preflight flows so downstream lifecycle gates do not fail late on missing or self-referential branch fields.

## Background

The active `sd-ai-command-pack` rollout/review task exposed a Trellis lifecycle
metadata failure while recovering an already-finished task:

- `.trellis/tasks/07-27-clarify-github-review-standing-permission/task.json`
  had `branch: null` even though the work belonged to
  `codex/rollout-sd-ai-command-pack-0-55-1`.
- The same task had `base_branch` stamped to the feature branch instead of the
  real PR target, `main`.
- Pre-archive validation correctly rejected the companion metadata defect, but
  the issue was discovered late enough to require a bookkeeping recovery commit.
- A later fleet rollout also had to preserve an older open refresh PR whose
  Trellis task was already archived, reinforcing that task branch metadata must
  remain trustworthy after finish/archive workflows.

This is distinct from the generated `_example` JSONL issue, which is already
tracked by `07-23-align-task-validation-preflight`.

## Requirements

- Define the canonical meaning of `task.json.branch` and
  `task.json.base_branch` across create, start, set-branch, set-base-branch,
  finish, archive, validation, and preflight-like consumers.
- Prevent `base_branch` from being silently set to the same branch as
  `branch` for ordinary PR-backed tasks, unless an explicit documented
  exception applies.
- Detect branch metadata that is missing, contradictory, stale, or likely
  derived from the wrong checkout branch before archive/preflight gates need to
  repair it.
- Preserve the existing non-fatal warning for a recorded feature branch that no
  longer exists locally after a successful merge and cleanup.
- Provide a clear recovery path for existing task records with missing
  `branch`, self-referential `base_branch`, deleted branches, or archived tasks
  still associated with open PR work.
- Keep dogfood `.trellis/scripts/**` and packaged
  `packages/cli/src/templates/trellis/scripts/**` behavior aligned for any
  runtime changes.
- Add regression coverage for create/set/validate/archive behavior, including
  the late-failure shape observed in the active `sd-ai-command-pack` session.
- Treat this as planning only until implementation is explicitly authorized.

## Acceptance Criteria

- [ ] The task metadata contract documents when `branch` may be null, when it
  must be set, and how `base_branch` is resolved.
- [ ] `task.py validate` or the appropriate lifecycle gate reports an actionable
  error before archive/preflight when a task has `branch` missing for a
  PR-backed workflow or `base_branch == branch` without an allowed exception.
- [ ] Stale local branch warnings after merge/cleanup remain warnings and do
  not block validation solely because the feature branch was deleted.
- [ ] Existing records can be repaired through documented commands without
  hand-editing JSON as the primary path.
- [ ] Packaged runtime templates and the dogfood runtime copy stay behaviorally
  aligned.
- [ ] Tests cover normal task creation, explicit branch/base-branch setting,
  self-referential base branch, missing branch on PR-backed work, and stale
  post-merge branch metadata.
- [ ] Relevant task/preflight help text or docs explain the metadata failure and
  the supported remediation.

## Notes

- Active-session source: Codex task
  `019f864c-a5bc-7492-b508-2f2a7a356d7b`
  (`/Users/sven/repos/platypeeps/sd-ai-command-pack`), latest active rollout
  and the immediately preceding standing-permission review task.
- Related existing Trellis task:
  `07-23-align-task-validation-preflight` owns generated `_example` context
  rows and PR-preflight alignment; do not duplicate that scope here.
- Before editing runtime symbols, run the repository-required GitNexus impact
  analysis for each touched function.
