# Kill hook child process tree on timeout

## Goal

`run_task_hooks` (`common/task_utils.py`) runs lifecycle hooks via
`subprocess.run(cmd, shell=True, capture_output=True, timeout=HOOK_TIMEOUT_SECONDS)`.
On `TimeoutExpired`, Python kills only the direct child — the shell. Any
grandchildren the hook spawned survive the timeout. Worse: a surviving
grandchild that inherited the stdout/stderr pipes keeps them open, so the
post-kill `communicate()` inside `subprocess.run` blocks until the orphan
exits — the exact "command that never returns" the timeout exists to prevent.

Raised by CodeRabbit on PR 534; deferred there as a follow-up because the fix
is platform-specific.

## Requirements

- R1: On hook timeout, terminate the hook's entire process tree, not just the
  shell. POSIX: run the hook in its own session (`start_new_session=True`) and
  kill the process group (`os.killpg` with SIGKILL). Windows: `taskkill /F /T
  /PID <pid>` (best effort), then `proc.kill()` as fallback.
- R2: After killing the tree, collecting captured output must not block
  indefinitely. Bound the post-kill `communicate()` with a short grace timeout;
  if it still blocks (pipe held by an unkillable orphan), give up on the
  output and report what was collected.
- R3: Behavior on the happy path is unchanged: same warning format for
  non-zero exits, same fail-open contract, same `HOOK_TIMEOUT_SECONDS` bound,
  same output capture and truncation.
- R4: Both script trees (`.trellis/scripts/` and
  `packages/cli/src/templates/trellis/scripts/`) stay in byte parity.
- R5: A hook that escapes its process group (calls `setsid` itself) is out of
  scope; document the limitation in the spec's hook trust-boundary note.

## Acceptance Criteria

- [ ] A hook that spawns a long-lived grandchild inheriting the pipes (e.g.
  `sleep 300 &` from the shell) times out at `HOOK_TIMEOUT_SECONDS`, the
  lifecycle command returns promptly, and the grandchild process is no longer
  alive afterwards (POSIX assertion; Windows path is best-effort and
  code-review only).
- [ ] The timeout warning still names the event, command, and timeout, and
  still prints whatever partial output was captured.
- [ ] Existing hook tests (`run_task_hooks` fail-open, output capture,
  truncation) pass unchanged.
- [ ] Regression test covers: grandchild dead after timeout, and the command
  finishing within a bounded wall-clock (no post-kill hang).
- [ ] `diff -rq` of the two script trees is clean.
- [ ] Spec `script-conventions.md` hook section documents tree-kill semantics
  and the setsid-escape limitation.
