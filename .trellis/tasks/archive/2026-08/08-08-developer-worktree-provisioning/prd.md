# Provision .trellis/.developer for linked worktrees

## Problem

`gitignore.txt` ships `.trellis/.developer` as gitignored, so a linked git
worktree starts with no developer identity: every `task.py` command fails
with `Error: No developer set. Run init_developer.py first` until
`init_developer.py` is re-run per worktree. Hit live 2026-08-08 in this very
checkout while filing tasks.

This blocks worktree-based parallel workflows — sd-ai-command-pack's planned
`sd-work-backlog --workers N` runs each worker in an isolated worktree and
needs identity present without per-worktree manual setup.

## Requirements

1. A linked worktree resolves developer identity without re-running
   `init_developer.py`: inherit from the main checkout, honor an environment
   fallback, or store identity in a location shared across worktrees.
2. The resolution order is documented and deterministic; `--assignee` still
   overrides.
3. No tracked file carries a personal identity (the gitignore decision
   stands; the fix is resolution, not tracking).

## Acceptance criteria

- [ ] `task.py create/list/start` work in a fresh linked worktree with no
      manual identity step.
- [ ] Identity source order covered by tests.
- [ ] Regression suite green.

## Evidence

Observed 2026-08-08 in this checkout; sd-ai-command-pack parallel
work-backlog prerequisite (08-08-parallel-work-backlog there).
