# Platform session identity matrix

All 21 platforms researched, 2026-08-05. Every row marked VERIFIED or ASSUMED.
Read `code-side-mechanics.md` first for why the bash child is the only context
that matters: `task.py start` is the sole writer of the session file, and it runs
there.

## Headline

Three findings, in order of consequence.

1. **No platform exports a session id to shell-tool children by default.** Not
   one of the 21. Where a session env var exists it is scoped to *hook*
   processes — the one place where stdin already carried the id. The mechanism
   `_ENV_SESSION_KEYS` is built on does not exist as a general platform feature.
2. **9 of 14 declared env var names are invented.** They were never read off any
   documentation; they follow a uniform `<PLATFORM>_SESSION_ID` shape that no
   vendor actually agreed to.
3. **7 platforms classified as hookless in fact all ship hooks.** OpenCode, Kilo,
   Grok, Kimi, Reasonix, Devin, Antigravity. Four of them accept Claude
   Code-shaped hook configs, so existing hook code largely ports.

## Verdicts on the 14 declared env var names

| Declared name | Verdict | Evidence |
|---|---|---|
| `CLAUDE_SESSION_ID` | **INVENTED** | Absent from [docs](https://code.claude.com/docs/en/env-vars) and confirmed absent in this very session — `env \| grep ^CLAUDE` in the Claude Code bash tool (2.1.221) lists 11 vars, not this one. |
| `CLAUDE_CODE_SESSION_ID` | **REAL, undocumented** | Confirmed here: value `cea3bbed-…`, matching what `task.py start` recorded as `session:claude_cea3bbed-…`. Not on the official env-var page. |
| `CODEX_SESSION_ID` | **INVENTED** | Absent from docs and from a live `codex exec` shell env (0.146.0). |
| `CODEX_THREAD_ID` | **REAL, undocumented** | Present in codex-cli 0.146.0 shell children, absent from the parent env → Codex injects it. Corroborated by [openai/codex#19937](https://github.com/openai/codex/issues/19937). |
| `CURSOR_SESSION_ID` | **INVENTED** | Empty in a live `cursor-agent` shell; absent from docs. |
| `CURSOR_CONVERSATION_ID` (conversation table) | **REAL in CLI, undocumented; IDE unverified** | Value matches `~/.cursor/chats/<ws>/<id>`. A [2026-05 forum request](https://forum.cursor.com/t/cursor-conversation-id-through-environment-variables/160346) for the IDE has no staff reply. |
| `OPENCODE_SESSION_ID` / `OPENCODE_SESSIONID` / `OPENCODE_RUN_ID` | **INVENTED (all three)** | Zero hits across OpenCode 1.18.13 source; `strings` on the installed 1.17.18 binary finds 59 `OPENCODE_*` literals, none session-scoped. [Issue #12158](https://github.com/anomalyco/opencode/issues/12158) requested exactly this and was closed "completed" — spuriously; it is not in the code. |
| `GEMINI_SESSION_ID` | **REAL, hooks-only** | Set by `hookRunner.ts`. The shell tool's env is built in `shellExecutionService.ts` and adds only `GEMINI_CLI=1`, `TERM`, `PAGER`, `GIT_PAGER` (+ non-interactive git/ssh vars). |
| `FACTORY_SESSION_ID` / `DROID_SESSION_ID` | **INVENTED** | Absent from docs *and* from the shipped binary. Confirmed here: `strings` on droid 0.100.0 yields 40+ `FACTORY_*` names, no session id; the only `SESSION_ID` hits are the OpenSSL constants `SSL_SESSION_ID_TOO_LONG` / `SERVER_ECHOED_INVALID_SESSION_ID`. |
| `QODER_SESSION_ID` | **REAL, wrong scope** | [Documented](https://docs.qoder.com/zh/extensions/hooks) as injected "Hook 脚本执行时" by the **IDE plugin only**. Absent from the Qoder CLI hooks page and from Lingma/Qoder CN. |
| `CODEBUDDY_SESSION_ID` | **INVENTED** | Absent from the [env-vars reference](https://www.codebuddy.ai/docs/cli/env-vars) and [hooks docs](https://www.codebuddy.ai/docs/zh/cli/hooks); hooks get only `CODEBUDDY_PROJECT_DIR`, `CODEBUDDY_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR`. |
| `KIRO_SESSION_ID` | **UNRESOLVED** | Not in [kiro.dev docs](https://kiro.dev/docs/hooks/) (only `USER_PROMPT` is documented). But Dynatrace `dtctl`, `oh-my-agent` and `gastown` all key agent detection on it, one commenting it is "set in both interactive and --no-interactive". Closed-source, not installed here. |
| `COPILOT_SESSION_ID` / `COPILOT_SESSIONID` | **probably invented** | Absent from the [hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference) and CLI programmatic reference. Could not run `copilot help environment` — small residual risk. |
| `PI_SESSION_ID` / `PI_SESSIONID` | **INVENTED** | Pi builds bash env as `{...process.env, PATH}` only (`dist/utils/shell.js:103-114`). No `PI_*` session var exists. |
| `TRAE_SESSION_ID` | **INVENTED** | Absent from the [hook reference](https://docs.trae.cn/ide_hook-configuration-reference); hooks get `TRAE_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, and `TRAE_ENV_FILE` on SessionStart. |
| ZCode's `CLAUDE_SESSION_ID` | **almost certainly broken** | The name is invented on Claude Code itself. ZCode's hook docs name only `ZCODE_PLUGIN_*` / `CLAUDE_PLUGIN_*`. Closed-source, unverifiable — and this entry has **no second candidate** to fall back on, unlike claude/codex/cursor. |
| `SNOW_SESSION_ID` | **REAL — and Snow built it for us** | `sessionIdentityEnv.ts:24-46` sets `SNOW_SESSION_ID` *and* `TRELLIS_CONTEXT_ID=snow-<sid>` into bash children (`mcp/bash.ts:346-362`), hooks and sub-agents. The source header names Trellis explicitly; `TRELLIS_CONTEXT_ID` is preserved when already set. |

Score: **9 invented, 3 real-but-hook-only, 3 real-and-usable (Claude, Codex,
Cursor-CLI — all undocumented), 1 unresolved, 1 correct by vendor design (Snow).**

## Why Claude / Codex / Cursor work anyway

Luck. Each is declared with **two** candidate names; the invented one is listed
first and the real one second, so the loop falls through to a working value. Any
platform declared with a single name has no such safety net — which is exactly
ZCode's situation.

## Extension-based platforms: Pi vs OMP

These two are siblings and behave **differently**, which the code did not know.

| | Pi | OMP |
|---|---|---|
| bash tool schema | `command`, `timeout?` only | `command`, `env?`, `timeout?`, `cwd?`, `pty?`, `async?` |
| `input.env` channel | **does not exist** — an extra `env` key is silently dropped | **first-class**, overlaid onto the child env |
| Trellis extension does | prefixes the command string with `export TRELLIS_CONTEXT_ID=…;` | sets `input.env.TRELLIS_CONTEXT_ID` in place |
| Correct? | **yes** — command rewriting is the only channel Pi has | **yes**, see below |

### The OMP in-place mutation question (resolved)

OMP's documented contract is that a `tool_call` handler must **return**
`{ input: … }`; `wrapper.ts:224-226` does `effectiveParams = callResult.input`.
Our extension instead mutates `event.input` in place and returns nothing, which
looks wrong.

Verified against OMP 17.2.9 source (downloaded and read, not inferred): for the
`bash` tool it still works, because nothing clones the object.
`toolEventArgs` (`wrapper.ts:114-123`), `resolveToolEventInput` and
`normalizeToolEventInput` (`tool-event-input.ts:10, :59`) all short-circuit and
return the **same reference** for any tool that is not `edit`/`computer`;
`emitToolCall` hands `event` straight to handlers with no copy
(`runner.ts:1099`); and `effectiveParams` starts as `params`, which is executed
at `wrapper.ts:340`. So mutating `event.input.env` mutates the object that runs.

**It works, but by implementation detail, not by contract.** One added clone or
normalization step in OMP and it breaks silently. There is also a behavioral
difference: `wrapper.ts:259` computes `xdevBypass` from `effectiveParams === params`,
which stays true under in-place mutation and would become false if we returned a
new input — so switching to the documented form is not a pure no-op.

## Consequence for #517

#517 states the OMP extension "never writes the key into `process.env`". That is
wrong on current `main`: the bridge landed in `4a20e4b5` (#424, 2026-07-16),
shipped in **v0.6.8**, and — per the source reading above — is mechanically
effective. #517 was filed 2026-08-03 when 0.6.11 was current.

Most likely explanation: the reporter was on a pre-0.6.8 install, or read the
extension source without the `tool_call` handler. The remaining possibility is a
`shell_environment_policy`-style filter stripping the var, which was not tested.
**Recommendation: ask the reporter for `trellis --version` before doing any OMP
work.** Note also that OMP is absent from `_KNOWN_PLATFORMS`, though that does not
affect this path — the `TRELLIS_CONTEXT_ID` override is checked before any
platform detection.

## The hookless classification is wrong for 7 platforms

| Platform | Reality |
|---|---|
| OpenCode | ~27 plugin events including **`shell.env`** — "inject environment variables into all shell execution", input carries `sessionID` and `callID`. This is the exact primitive needed. |
| Kilo CLI | Vendors OpenCode wholesale; byte-identical `shell.env`. |
| Grok Build | 14 hook events, `~/.grok/hooks/*.json`; also reads Claude Code and Cursor hook configs. `GROK_SESSION_ID` injected into hook processes only — confirmed empirically (bash tool env has `GROK_AGENT=1`, no session id). |
| Kimi Code | Hooks in `config.toml` (`PreToolUse`, `SessionStart`, `SessionHeartbeat`, …), stdin carries `session_id`. |
| Reasonix | 13 hook events in Go (`internal/hook/hook.go:43-65`), with a Claude-compatible payload mode. |
| Devin | 8 events, `.devin/hooks.v1.json`; also reads `.claude/settings.json`. stdin carries `session_id`. |
| Antigravity | 5 events, `hooks.json`; stdin carries `conversationId`, `transcriptPath`, `artifactDirectoryPath`. |

This is a separate finding from the session-identity question and probably the
more valuable one commercially — it means seven platforms could be upgraded from
inline to hook-backed.

## Traps worth recording

- **`KIMI_SESSION_ID` exists but is not an env var.** It is a template
  placeholder substituted into skill body text
  (`skillCatalog/registry.ts:177`). Easy to grep and misread as a real variable.
- **`CODEX_COMPANION_SESSION_ID` on this machine holds the *Claude Code*
  session id**, injected by a local companion plugin. Any prefix-based sniffing
  of `CODEX_*` must not treat it as Codex identity.
- **`ZCODE_PROJECT_DIR`**, already relied on by
  `packages/cli/src/templates/zcode/config.json`, does not appear in ZCode's
  published hook docs. Unverified Trellis-side assumption, same class of defect
  as the session names.
- **Grok's `~/.grok/active_sessions.json`** maps `session_id` → `pid` → `cwd`,
  so an ancestor-pid walk can recover identity. But entries vanish on exit and
  two session ids were observed sharing one pid. Undocumented; do not build on it.
- **`TRAE_ENV_FILE` / `CLAUDE_ENV_FILE`** are given to SessionStart hooks as a
  path to write env vars into for downstream processes. Claude Code sets
  `CLAUDE_ENV_FILE` too (observed in this session). Whether it reaches
  shell-tool children is unverified, but it is the only vendor-sanctioned
  "carry a value forward" mechanism found on any platform.

## Recommendation

Stop treating this as N platform bugs. The env-var table encodes an assumption
that is false almost everywhere, and patching names one at a time will keep
producing reports like #517 and the CodeBuddy one.

**Preferred direction: make the hook the writer.** Every platform researched
delivers a session id on hook stdin — that is the one universal channel. A
`SessionStart` hook that persists the session id (and a `UserPromptSubmit` hook
as backstop, since SessionStart can be missed on resume) removes the dependency
on the bash child discovering identity by itself. `task.py start` then resolves
through the existing single-session fallback.

Tradeoff, and it is real: the single-session fallback deliberately refuses to
guess when ≥2 session files exist — that is the multi-session isolation contract
0.6.12 was built to protect. Pre-creating a session file per session makes the
"exactly one file" condition rarer, so concurrent windows would degrade to
"no active task" rather than to the wrong one. Safe, but a usability regression
for people running parallel sessions. Sizing that is the follow-up design task.

**Second, cheap and immediate: fix the lies.** Delete the 9 invented names,
demote the 3 hook-only ones to hook-only lookup, and add a comment on each
survivor recording that it is undocumented and empirically verified on a given
date. This changes no behavior for the platforms that work today and stops the
table from misrepresenting what is supported.

**Third: document `TRELLIS_CONTEXT_ID` as the supported escape hatch.** It works
everywhere, it is checked before all platform detection, and it is what to tell
affected users right now.

**Fourth, cheapest of all: adopt Snow's contract.** Snow already exports
`TRELLIS_CONTEXT_ID` itself and names Trellis in its source. That is the model to
ask other vendors for — a documented request costs nothing and OpenCode's
`shell.env` plugin API could satisfy it in about five lines.

## Follow-up tasks this spawns

1. Purge the invented env var names; scope the hook-only ones correctly.
2. Design the SessionStart-writes-the-session-file change, including the
   multi-session tradeoff. Depends on 1.
3. Reclassify the 7 platforms wrongly marked hookless; decide which to upgrade.
4. Empirical probes for the three unresolved cells: `KIRO_SESSION_ID`, ZCode's
   shell env, Cursor IDE (vs CLI). Each needs the product installed.
5. Ship an OpenCode `shell.env` plugin — smallest real fix available, ~5 lines.
6. Ask #517's reporter for a version before touching OMP.
