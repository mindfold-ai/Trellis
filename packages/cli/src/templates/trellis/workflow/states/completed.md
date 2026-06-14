Code committed via Phase 3.4; run `/trellis:finish-work` to wrap up (archive the task + record session).
If you reach this state with uncommitted code, return to Phase 3.4 first — `/finish-work` refuses to run on a dirty working tree.
`task.py archive` deletes any runtime session files that still point at the archived task.
