# Code-side mechanics: how session identity is supposed to flow

Established by reading the code on `main` @ `57ea914b` (2026-08-05). Every claim
here is VERIFIED against a file:line in this repo. Platform-side claims (what
each vendor actually exports) live in `platform-session-identity.md`.

## The chain

1. A hook fires (`session-start.py`, `inject-workflow-state.py`). It receives a
   JSON payload on stdin and calls `resolve_active_task(...)`, which calls
   `resolve_context_key(platform_input, platform)`.
2. `resolve_context_key` tries, in order
   (`.trellis/scripts/common/active_task.py:401-440`):
   - `TRELLIS_CONTEXT_ID` env override
   - `session_id` / `sessionId` / `sessionID` in the hook's stdin JSON
   - `conversation_id` in the stdin JSON
   - `transcript_path` in the stdin JSON
   - platform-scoped env vars from `_ENV_SESSION_KEYS` (`active_task.py:53-88`)
   - the Cursor shell-ticket special case
3. The agent runs `task.py start <task>` through its shell/bash tool.
   `set_active_task()` resolves a context key the same way and writes
   `.trellis/.runtime/sessions/<key>.json`.
4. Later hooks read that file and inject the real task instead of `no_task`.

## The single point of failure

**Only step 3 writes.** `set_active_task()` (`active_task.py:581-607`) returns
`None` when no context key is available, and the caller degrades. Neither
`session-start.py` nor `inject-workflow-state.py` ever writes a session file —
grepped both; they only call `resolve_active_task`, which is read-only.

So the session file's sole writer runs in the bash child — the one context where
stdin JSON is unavailable and only the environment can carry identity. A platform
can have perfectly good hooks and still fail completely, because hooks cannot
create the state they depend on.

This is the class-level defect. It is not per-platform.

## Why the single-session fallback does not rescue it

`_resolve_single_session_fallback()` (`active_task.py:530-552`) infers the task
when exactly one session file exists. It was built for pull-based sub-agents
(copilot, gemini, qoder) that don't inherit the parent session id.

It cannot help here: it reads session files, and in this failure mode no session
file was ever written. Zero files → returns `None`. The fallback covers "key
missing but state exists", not "state never created".

## The three ways identity can reach the bash child

1. **Platform natively exports a session env var.** What `_ENV_SESSION_KEYS`
   assumes. Correct only if the variable name is real — see the doc research.
2. **A Trellis extension/hook injects `TRELLIS_CONTEXT_ID` into the bash call.**
   Only some platforms do this. Grep for `TRELLIS_CONTEXT_ID` under
   `packages/cli/src/templates/<platform>/`:

   | Platform | Files mentioning it | Mechanism |
   |---|---|---|
   | pi | extension | rewrites the command: `export TRELLIS_CONTEXT_ID=…; <cmd>` (`templates/pi/extensions/trellis/index.ts.txt:1891`) |
   | omp | extension | sets `input.env.TRELLIS_CONTEXT_ID` on the bash tool call (`templates/omp/extensions/trellis/index.ts.txt:564-574`) |
   | codex | 1 | — |
   | copilot | 1 | — |
   | snow | 2 | — |
   | claude, cursor, gemini, qoder, codebuddy, droid, kiro, zcode, trae | 0 | none — relies entirely on mechanism 1 |

3. **The user sets `TRELLIS_CONTEXT_ID` by hand.** Always works; the documented
   escape hatch and the workaround to give affected users today.

## Registry coverage gaps (VERIFIED, repo-internal)

- `AI_TOOLS` defines **21** platforms.
- `_KNOWN_PLATFORMS` lists **16**. Missing: `kilo`, `antigravity`, `devin`,
  `reasonix`, **`omp`**. OMP being absent is notable — #517 is an OMP issue and
  the platform is not in the detection set at all.
- `_ENV_SESSION_KEYS` has **14** entries. Present in `_KNOWN_PLATFORMS` but with
  no env session key: `grok`, `kimi`.

## Provenance of the env var names (VERIFIED, repo-internal)

`git log -S` on each name in `active_task.py`:

- `CODEBUDDY_SESSION_ID`, `QODER_SESSION_ID`, `KIRO_SESSION_ID` — all introduced
  by `6625cdc6` (2026-04-25), commit message "chore: archive session-scoped task
  state work". No per-platform evidence in the commit.
- `TRAE_SESSION_ID` — introduced by `5c28b8ed` "feat(cli): add Grok Build
  platform support (#433)", i.e. as a side edit in an unrelated platform PR.

Every one follows the same `<PLATFORM>_SESSION_ID` shape. Uniform naming across
vendors that share no conventions is a signal these were pattern-guessed rather
than read off documentation. Two entries carry comments citing real evidence
(zcode reusing `CLAUDE_SESSION_ID`, snow exporting `SNOW_SESSION_ID`) — those
two look researched. The rest do not.

## #517's diagnosis is out of date (VERIFIED)

#517 (filed 2026-08-03) states the OMP extension "never writes the key into
`process.env`".

On current `main` it does. `templates/omp/extensions/trellis/index.ts.txt:564-574`
registers a `tool_call` handler that sets `input.env.TRELLIS_CONTEXT_ID` for the
`bash` tool. It landed in `4a20e4b5` "fix(omp): bridge session context into bash
env (#424)" on **2026-07-16**, first released in **v0.6.8** — 18 days before
#517 was filed, when 0.6.11 was current.

So one of these is true:
- the reporter ran a version older than 0.6.8, or read an older copy; or
- the bridge is present but ineffective because OMP does not honor `input.env`
  on a bash tool call.

The second would make the symptom real and the stated cause wrong. Note the
difference from Pi, which does not trust `input.env` at all — it rewrites the
command string with an `export` prefix. That asymmetry between two sibling
extensions is itself suspicious and is the specific question put to the doc
research.

## Open, pending doc research

- Which of the 14 declared env var names are real.
- Whether OMP honors `input.env` on bash tool calls.
- Whether the platforms with no bridge (claude, cursor, gemini, qoder, codebuddy,
  droid, kiro, zcode, trae) natively export anything usable.
