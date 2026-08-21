# Design — generalize the shell-ticket session bridge

## Shape of the change

Three layers, each with one job. The whole point is that no layer knows a
platform's name except the one that has to.

```
hook (writer)          task.py (reader)              wiring
──────────────         ────────────────              ──────
extract command   →    accept any fresh,        ←    SHARED_HOOKS_BY_PLATFORM
from either            repo-matching,                 declares who gets the hook
payload shape          subcommand-matching           + per-platform config entry
                       ticket                        + a test binding the two
```

## Layer 1 — the writer

`templates/shared-hooks/inject-shell-session-context.py`.

Today it reads `hook_input["command"]`. It needs to read either shape:

- Cursor `beforeShellExecution`: `{"command": "...", "cwd": ...}`
- Claude-family `PreToolUse` / Gemini `BeforeTool`:
  `{"tool_name": "Bash", "tool_input": {"command": "..."}}`

One function, ordered fallback, no platform argument. Field-name casing variants
should follow the file's existing `CONTEXT_IDENTITY_KEYS` precedent rather than
inventing a new convention.

Everything else in the writer is already general: identity extraction, the
`SESSION_SUBCOMMANDS` gate, TTL, ticket serialization.

The ticket's `platform` field stays — it is useful for debugging — but stops
being a gate.

## Layer 2 — the reader

`common/active_task.py`.

- `_matching_cursor_ticket_context_key` → drop the `!= "cursor"` rejection,
  rename to something platform-neutral.
- `_lookup_cursor_shell_ticket_context_key` → rename; drop the
  `platform_name in (None, "session", "cursor")` gate at the call site in
  `resolve_context_key`.

That gate is the reason the bridge is invisible to every other platform. Note
the ordering consequence: the ticket lookup currently runs last, after
`_ENV_SESSION_KEYS`. Keep it last. A platform that really does export identity
should win over a ticket, and after the env purge the surviving names are the
ones we verified.

Directory: `.trellis/.runtime/cursor-shell/` → a neutral name.

**Migration decision required.** Two candidates:
(a) write new, read both, leave the old directory to age out — costs one extra
`glob` on a directory that is usually absent;
(b) rename and ignore the old — a Cursor session that starts mid-upgrade loses
one ticket and falls to degraded for one command.

Recommend (a): tickets are 30-second ephemera, but the failure in (b) lands on
the one platform that works today, and the cost of (a) is a stat on a missing
directory. Whichever is chosen, say so in a comment with the reason.

## Layer 3 — wiring, and the part that must not rot

`SHARED_HOOKS_BY_PLATFORM` in `templates/shared-hooks/index.ts` already drives
both `writeSharedHooks` and `collectSharedHooks`. Add
`inject-shell-session-context.py` to the seven target platforms there.

That declaration alone is not enough: the script being *written to disk* does
nothing unless the platform's own hook config registers it, and those configs
are static per-platform files with different event names and shapes:

| Platform | Config file | Event |
|---|---|---|
| cursor | `.cursor/hooks.json` | `beforeShellExecution` (already wired) |
| codebuddy | `.codebuddy/settings.json` | `PreToolUse` (file already has one) |
| droid, kiro, qoder, trae, zcode | their settings/hooks file | `PreToolUse` |
| gemini | `.gemini/settings.json` | `BeforeTool` |

This is the shotgun seam and it cannot be fully removed — the formats are the
vendors', not ours. What removes the *silent* failure is a test:

> for every platform whose `SHARED_HOOKS_BY_PLATFORM` entry includes
> `inject-shell-session-context.py`, that platform's hook config template must
> contain a command entry invoking it.

Derive both sides from the registry; never hard-code the seven names in the
test. A platform added to the declaration without config wiring then fails the
build instead of silently doing nothing — which is exactly how the current mess
went unnoticed.

Verify each target platform's event name against the parent task's research
before writing it; do not assume `PreToolUse` everywhere.

## What good looks like when done

`grep -o '"cursor"' ` over the writer and reader returns nothing but the
payload-shape helper and comments. Adding platform #8 means: one line in
`SHARED_HOOKS_BY_PLATFORM`, one entry in that platform's config template, and
the test tells you if you forgot the second.

## Risks

- **Cursor regression.** It works today and is the only in-production user of
  this code. Its existing tests must pass untouched; if any needs editing, that
  is a behavior change and must be surfaced, not absorbed.
- **Wrong event name per platform.** A hook registered on an event that never
  fires looks identical to success at build time. The end-to-end test per
  platform is what catches it.
- **Ticket accepted across sessions.** The "exactly one fresh match" rule is the
  only thing preventing it. Do not relax it while broadening who can write
  tickets — broadening the writers increases the chance of two fresh tickets,
  which correctly yields degraded rather than a guess.
