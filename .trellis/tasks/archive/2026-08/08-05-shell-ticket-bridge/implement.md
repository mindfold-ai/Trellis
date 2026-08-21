# Implementation plan

Ordered so each step is verifiable before the next depends on it. Steps 1-3
change no behavior for any platform; step 4 is where platforms start working.

## 1. Reader: strip the platform gate

`common/active_task.py` (both copies — the parity test enforces it).

- Drop `ticket.get("platform") != "cursor"` from the matcher.
- Drop `platform_name in (None, "session", "cursor")` from the call site in
  `resolve_context_key`; keep the lookup last in the fallback chain.
- Rename both functions and the directory constant to neutral names.
- Implement the migration decision from `design.md` and comment the reason.

**Verify:** existing Cursor ticket tests pass unchanged. If one needs editing,
stop and report — that means behavior changed.

## 2. Writer: one extraction, two payload shapes

`templates/shared-hooks/inject-shell-session-context.py`.

- Extract the command from either `command` or `tool_input.command`, one
  function, no platform argument.
- Everything else stays.

**Verify:** unit-level coverage of both shapes plus a payload with neither
(must be a silent no-op, never an exception — a throwing PreToolUse hook can
block the tool call on some platforms).

## 3. Tighten matching if it is cheap

The ticket already stores the full command string. If matching on it rather
than only the subcommand set is a small change, do it — broadening the writer
set raises collision odds, and a collision costs a degraded command.

If it is not small, skip it and say so. Do not weaken the failure direction.

**Verify:** two concurrent tickets for different sessions still yield degraded,
never a guess.

## 4. Wiring + the test that binds it

- Add `inject-shell-session-context.py` to the seven target platforms in
  `SHARED_HOOKS_BY_PLATFORM`.
- Add the invoking entry to each platform's own hook config template, using that
  platform's real event name — check the parent task's research per platform,
  do not assume `PreToolUse`.
- Write the binding test: derive both sides from the registry, fail when a
  declared platform lacks its config entry. No hard-coded platform list.

**Verify:** flip one platform's config entry out; the test fails. Restore.

## 5. End-to-end per platform

Drive the real hook and real `task.py` for each of the seven, as the existing
Cursor tests do. A test that only asserts a ticket file was written proves
nothing about whether identity resolves.

Locally runnable: none of the seven are installed here, so end-to-end means
simulated hook payloads through the real scripts, not live CLIs. Say so plainly
in the report rather than implying live verification.

## 6. Full gate

`pnpm build`, `lint`, `typecheck`, `test`, `lint:py`, and
`diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__`
must be silent.

Report the before/after test counts (baseline 1636 / 72 files).

## Rollback

Steps 1-3 are independently revertible and change no platform's behavior on
their own. Step 4 is the behavior change; reverting the
`SHARED_HOOKS_BY_PLATFORM` lines plus the config entries restores today's
behavior exactly.
