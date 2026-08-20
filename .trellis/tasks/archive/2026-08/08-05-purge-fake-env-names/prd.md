# Purge invented session env var names

## Goal

Make `_ENV_SESSION_KEYS` and its sibling tables in `common/active_task.py` say
only things that are true. Today they declare 21 session env var names of which
12 were never real, and they give a hook-only variable the same standing as one
that actually reaches a shell child.

This is a truth-in-code change, not a feature. For every platform that works
today, behavior must be unchanged.

## Why the names got there

`git log -S` on each name: `CODEBUDDY_SESSION_ID`, `QODER_SESSION_ID` and
`KIRO_SESSION_ID` all entered in one bulk commit (`6625cdc6`, 2026-04-25,
message "chore: archive session-scoped task state work") with no per-platform
evidence; `TRAE_SESSION_ID` came in as a side edit inside the Grok PR (#433).
Every one follows the same `<PLATFORM>_SESSION_ID` shape. Vendors share no
naming convention, so that uniformity is the fingerprint of pattern-guessing.

Full evidence, per name, with sources and how each was checked, is in the parent
task's `research/platform-session-identity.md`. Do not re-derive it; do read it.

## The decisions, and they are not uniform

Delete only what was verified absent. Where the risk is asymmetric — keeping a
dead name costs a failed lookup, deleting a live one silently breaks a platform
— keep it and label it. Three groups:

### Group A — delete, verified absent

| Platform | Remove | Leaves behind |
|---|---|---|
| claude | `CLAUDE_SESSION_ID` | `CLAUDE_CODE_SESSION_ID` (real, undocumented) |
| codex | `CODEX_SESSION_ID` | `CODEX_THREAD_ID` (real, undocumented) |
| cursor | `CURSOR_SESSION_ID` | entry becomes empty — see below |
| opencode | all three `OPENCODE_*` | entry becomes empty |
| droid | `FACTORY_SESSION_ID`, `DROID_SESSION_ID` | entry becomes empty |
| codebuddy | `CODEBUDDY_SESSION_ID` | entry becomes empty |
| trae | `TRAE_SESSION_ID` | entry becomes empty |
| pi | `PI_SESSION_ID`, `PI_SESSIONID` | entry becomes empty |

Also in `_ENV_TRANSCRIPT_KEYS`: `CLAUDE_TRANSCRIPT_PATH` and
`CODEX_TRANSCRIPT_PATH` — both verified absent from docs and from live envs.

An entry left with no names should be removed outright rather than left as an
empty tuple. Removing them is safe because those platforms never depended on
this table: cursor resolves through `_ENV_CONVERSATION_KEYS` plus the
`beforeShellExecution` ticket; opencode and pi through the command prefix their
plugin/extension adds; codebuddy, droid and trae never worked through it at all.
**Verify that claim in code before deleting**, and confirm `_iter_env_keys`
handles an absent platform without raising.

### Group B — keep, but scope the lie out of it

These names are real; the falsehood is the implied scope. Keep them, add a
comment stating what was verified and when.

- `GEMINI_SESSION_ID` — set only by Gemini's hook runner. Its shell tool builds
  env in `shellExecutionService.ts` and adds only `GEMINI_CLI=1`, `TERM`,
  `PAGER`, `GIT_PAGER`. Never reaches a bash child.
- `QODER_SESSION_ID` — injected by the Qoder **IDE plugin** during hook
  execution only. Absent from the Qoder CLI docs and from Lingma entirely.
- `CURSOR_TRANSCRIPT_PATH` — documented, hook scripts only; empty in the agent's
  own shell env.

### Group C — keep, explicitly unverified

Deleting these would be acting on absence of evidence rather than evidence of
absence. Mark each with what would settle it.

- `COPILOT_SESSION_ID`, `COPILOT_SESSIONID` — absent from every official page,
  but `copilot help environment` (the authoritative list per the docs) could not
  be run: the CLI is not installed and `github/copilot-cli` ships no source.
- `KIRO_SESSION_ID` — absent from kiro.dev docs, but Dynatrace `dtctl`,
  `oh-my-agent` and `gastown` all key agent detection on it, one commenting that
  it is "set in both interactive and --no-interactive". Needs a probe on a
  machine with Kiro.
- `GEMINI_/FACTORY_/DROID_/QODER_/CODEBUDDY_TRANSCRIPT_PATH` — **never
  researched**. The audit covered the session table, not these. Do not delete
  them on the strength of the session-table findings; label them as unchecked.

### One genuine fix, not a deletion

ZCode's entry is `("zcode", ("CLAUDE_SESSION_ID",))`, justified by a comment
saying ZCode reuses Claude's variable. But `CLAUDE_SESSION_ID` does not exist on
Claude Code either — verified live. ZCode mirrors Claude's naming elsewhere
(`CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` compat aliases are in its docs), so
the name it would actually reuse is `CLAUDE_CODE_SESSION_ID`.

Change the tuple to try `CLAUDE_CODE_SESSION_ID` first and keep
`CLAUDE_SESSION_ID` as a fallback. If neither exists nothing changes; if the
first does, ZCode starts working. ZCode is closed-source and not installable
here, so this stays a reasoned change, not a verified one — say so in the
comment.

## Requirements

- Every surviving name carries a comment recording its status: verified real and
  undocumented / hook-scope only / unverified with the check that would settle
  it. A bare name with no provenance is what created this mess.
- Both copies of `active_task.py` move together (the parity guard added in
  `c5465d04` enforces this).
- `AMBIENT_SESSION_ENV_KEYS` in `regression.test.ts` is a **scrub** list that
  keeps the host environment from leaking into tests — it is not an assertion
  that the names are real. Deleted names should stay in it, since a developer's
  shell could still carry them. Confirm that reading before changing it.
- No change to `_KNOWN_PLATFORMS`. It is separately wrong — 21 platforms in
  `AI_TOOLS`, 16 there, missing `omp`, `kilo`, `antigravity`, `devin`,
  `reasonix` — but that affects platform detection, not this table. Record it;
  do not fix it here.

## Acceptance Criteria

- [ ] All 12 Group A names, plus the two invented transcript names, are gone.
- [ ] Platforms whose entry empties out are removed from the table, and
      `_iter_env_keys` is proven to tolerate a platform that is absent.
- [ ] Group B and C names remain, each with a provenance comment.
- [ ] ZCode tries `CLAUDE_CODE_SESSION_ID` before `CLAUDE_SESSION_ID`.
- [ ] A test pins the intent: for each removed name, setting it in the
      environment must **not** resolve a context key for that platform. This is
      what stops the names being reintroduced by pattern-matching later.
- [ ] Existing session-resolution tests still pass unchanged — if any needed
      editing, that is a behavior change and must be called out, not quietly
      absorbed.
- [ ] `pnpm build`, `lint`, `typecheck`, `test` pass; `lint:py` 0 errors; both
      script trees byte-identical.

## Out of Scope

- `_KNOWN_PLATFORMS` gaps.
- Unifying the five identity-bridging mechanisms.
- Researching the five unchecked transcript names — label, do not investigate.
