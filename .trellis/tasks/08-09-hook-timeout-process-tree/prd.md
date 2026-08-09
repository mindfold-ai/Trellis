# Kill hook child process tree on timeout

## Goal

Hook timeout currently kills only the direct child; grandchildren survive. Add portable process-group termination (POSIX setsid/killpg, Windows Job Object or taskkill /T). Raised by CodeRabbit on PR 534.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
