# Generalize the shell-ticket session bridge

## Goal

Make `task.py start` work on the hook-capable platforms where it currently
fails, by reusing the ticket bridge already built for Cursor instead of adding
another per-platform mechanism.

Target platforms: **gemini, qoder, codebuddy, droid, kiro, trae, zcode** — the
seven that already receive Trellis shared hooks but have no way to carry session
identity into a shell child.

## Why these platforms fail today

`task.py start` is the only writer of `.trellis/.runtime/sessions/<key>.json`,
and it runs in the agent's shell/bash tool. Every platform puts `session_id` in
its **hook stdin**; not one exports it into a shell child (verified across 21
platforms — see the parent task's `research/platform-session-identity.md`).

So a platform can have perfectly working hooks and still fail completely: hooks
read the session file, but only the shell child can create it, and the shell
child has no identity. Reproduced live on Grok:
`Status: planning → in_progress (degraded)`, sessions directory never created.

## Why the ticket, and why this is not a sixth mechanism

Cursor already solved this. `inject-shell-session-context.py` runs on
`beforeShellExecution`, sees both the session id and the command about to run,
and when that command contains `task.py start|current|finish` it writes a
short-lived ticket to `.trellis/.runtime/cursor-shell/`. `task.py` then picks
the ticket up when it has no native identity.

**The mechanism is already platform-neutral.** Reading
`_matching_cursor_ticket_context_key`, only two things are Cursor-specific:

- a literal `ticket.get("platform") != "cursor"` rejection, and
- the call-site gate `if platform_name in (None, "session", "cursor")`.

The three real decisions — `_ticket_is_fresh`, `_ticket_cwd_matches_repo`,
`_pending_ticket_matches_args` — contain nothing about Cursor. Likewise the
writer's `CONTEXT_IDENTITY_KEYS` already accepts `session_id`, `conversation_id`
and `transcript_path` in every casing.

So this task is mostly **deleting a platform name from a general thing**, not
building a new thing. That distinction is the whole point: the defect this task
tree exists to fix is five unrelated bridges nobody could enumerate. Adding a
sixth would make it worse.

## The one genuinely new piece

The writer reads the command from `hook_input["command"]`, which is Cursor's
`beforeShellExecution` shape. The Claude-family `PreToolUse` shape carries it at
`tool_input.command`. Gemini names the event `BeforeTool` rather than
`PreToolUse`.

That is one extraction function handling both payload shapes — not one branch
per platform. If a third shape ever appears it extends the same function.

## Requirements

- One command-extraction path handling both payload shapes. No per-platform
  branching anywhere in the hook body.
- The ticket becomes platform-neutral: any platform may write one, and the
  consumer accepts it on its merits (fresh, right repo, matching subcommand),
  not on its platform name.
- **The set of platforms that get the hook is declared exactly once.**
  `SHARED_HOOKS_BY_PLATFORM` already exists and is already the single source for
  `writeSharedHooks` / `collectSharedHooks`. Extend that declaration; do not
  introduce a second list. A hand-maintained platform list is what produced the
  12 invented env var names and what made this audit reach the wrong answer
  twice.
- **A test must enforce that declaration against each platform's hook config.**
  Per-platform config formats genuinely differ (`.cursor/hooks.json` camelCase,
  `.codebuddy/settings.json` PascalCase, Gemini's `BeforeTool`), so the wiring
  itself cannot be fully derived — but a platform listed as receiving the hook
  and missing its config entry must fail the build. That test is what keeps this
  from decaying into the next hand-maintained list.
- Existing Cursor behavior must not change. It is one of the few platforms that
  works today.
- Migration: existing `.trellis/.runtime/cursor-shell/` directories must not
  break a running install. Decide read-both-write-new vs. leave-as-is and say
  which, with the reason.

## Non-goals, stated so they are not smuggled in

- Do not refactor the four working bridges (Claude's env file, OpenCode's and
  Pi's command prefix, OMP's `input.env`). Converging all five is a real design
  question and a separate task; touching working platforms here buys nothing and
  risks a lot.
- Do not add hooks to platforms Trellis does not already hook (grok, kimi,
  reasonix, devin, antigravity, kilo). That is a platform-capability upgrade,
  separately valuable, separately scoped.
- Do not fix `_KNOWN_PLATFORMS`' missing entries.

## Known weaknesses to carry forward deliberately

The ticket has two limits, inherited from the Cursor implementation:

1. **30-second TTL.** A command that queues behind a slow tool call can outlive
   its ticket and silently fall back to degraded mode.
2. **"Exactly one fresh match" or nothing.** Two windows running the same
   subcommand in the same repo concurrently both give up.

Both are conservative — they fail to degraded mode, never to the *wrong*
session, which is the property the multi-session isolation contract needs. Keep
that bias. If the matching can be tightened cheaply (the ticket already stores
the full command string, so matching on it rather than only the subcommand would
cut collisions), do it and say so; do not weaken the failure direction to buy
convenience.

## Acceptance Criteria

- [ ] Ticket writing and reading contain no platform-specific branching; a
      per-platform grep for platform names in both files returns only the
      payload-shape extraction, if anything.
- [ ] The seven target platforms write tickets and resolve identity end to end,
      exercised through the real hook and the real `task.py`, not mocks.
- [ ] Cursor's existing path still passes its current tests unchanged.
- [ ] A test fails when a platform declared to receive the hook lacks the
      corresponding entry in its own hook config template.
- [ ] Degraded mode is still the failure result when no ticket matches, and no
      test asserts a ticket from one session resolving for another.
- [ ] Both script trees byte-identical; `pnpm build`, `lint`, `typecheck`,
      `test`, `lint:py` all clean.
