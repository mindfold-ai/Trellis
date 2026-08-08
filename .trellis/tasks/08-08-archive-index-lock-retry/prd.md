# Bounded retry on transient index.lock during archive auto-commit

## Problem

`task.py archive` performs a git auto-commit with no retry: when another
process briefly holds `.git/index.lock` (IDE integrations, status daemons,
concurrent sessions), the commit fails and the archive is interrupted
mid-move. There is no retry in `safe_commit.py` or `git.py` at HEAD.

Relocated from sd-ai-command-pack's upstream handoff register
(08-04-trellis-upstream-archive-commit-lock-retry; original PRD preserved in
that repo under
`.trellis/tasks/08-08-upstream-handoff-register/research/`).

## Requirements

1. A short bounded backoff-retry on transient `index.lock` failures during
   archive's auto-commit.
2. On exhausted retries, a clean abort that leaves the task move consistent
   (either fully moved with commit pending and clearly reported, or rolled
   back) — never a half-moved tree with a misleading success message.
3. Retry applies to the archive path; other commit paths may adopt it but
   are not required.

## Acceptance criteria

- [ ] Test simulating a held index.lock shows retry then success.
- [ ] Test with a persistently held lock shows the clean-abort behavior and
      a diagnostic naming the lock.
- [ ] Regression suite green.
