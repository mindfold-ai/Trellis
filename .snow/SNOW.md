# Trellis on Snow CLI (snocli)

Snow is a **class-1** Trellis host: auto context inject + project agent discovery +
`beforeSubAgentStart` prompt enrichment.

| Capability                                        | Status                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Skills (`.snow/skills/trellis-*/SKILL.md`)        | Works                                                                        |
| Prompt commands (`.snow/commands/trellis-*.json`) | Works (`/trellis-continue`, `/trellis-finish-work`, …)                       |
| Context hooks (`.snow/hooks/`)                    | Inject model context via stdout JSON + write `.snow/log/trellis-context.txt` |
| Project agents (`.snow/agents/*.md`)              | Auto-discovered by Snow (`#trellis-implement`, …)                            |
| `beforeSubAgentStart`                             | Injects active-task breadcrumb into sub-agent prompts                        |
| `trellis-start`                                   | Optional — session hooks replace the old manual ritual                       |

## Quick start

```bash
trellis init --snow -u your-name
# or: trellis init --snocli -u your-name
snow
```

In Snow:

1. Open a session in the project root — `onSessionStart` injects Trellis context automatically.
2. Dispatch implement/check/research (project agents under `.snow/agents/`). Prefer prompt first line:

```text
Active task: .trellis/tasks/<id>
```

3. Optional: `/trellis-continue` / `/trellis-finish-work`, or `skill-execute` on `trellis-*` skills.
4. Debug injects: set `SNOW_DEBUG_HOOKS=1` and inspect `.snow/log/hooks-inject.txt`.

## Agents

Snow loads project agents from `.snow/agents/**/*.md` (priority over `~/.snow/sub-agents.json`).
Primary path: project agent discovery — no manual merge required. Do not use legacy sub-agent JSON merge files.

Context loading is class-1 hook inject (`beforeSubAgentStart` / session / user). Agents are **not** shipped with class-2 pull-based prelude text. Hooks already inject context; agents still re-read task artifacts for correctness.

## Tool names (Snow-native)

- `filesystem-read` / `filesystem-create` / `filesystem-replaceedit` / `filesystem-edit`
- `terminal-execute`
- `ace-search` / `codebase-search`
- `todo-manage` / `notebook-manage`
- `skill-execute`
- `websearch-search` / `websearch-fetch` (research)
- `ide-get_diagnostics`

## Hook protocol

Session / user / sub-agent hooks emit:

```json
{ "additionalContext": "...", "display": "..." }
```

- exit 0 + JSON → inject (prepend); UI bubble keeps user original text
- exit 1 on `onUserMessage` → replace (not used by Trellis)
- non-JSON stdout → ignored

Hook modes (same script, different depth):

| Hook                  | argv mode  | Payload                                                          |
| --------------------- | ---------- | ---------------------------------------------------------------- |
| `onSessionStart`      | `session`  | full (~7.5KB): task.py, artifacts, prd summary, workflow/session |
| `onUserMessage`       | `user`     | compact (~2.8KB): task.py + artifact presence only               |
| `beforeSubAgentStart` | `subagent` | full + agent-kind tailoring (implement/check/research)           |

## Session identity (multi-session)

Snow injects these env vars into hook commands, `terminal-execute`, bash mode, and sub-agent children:

| Variable             | Example             | Purpose                                   |
| -------------------- | ------------------- | ----------------------------------------- |
| `SNOW_SESSION_ID`    | `c2343752-...`      | Native Snow session uuid                  |
| `TRELLIS_CONTEXT_ID` | `snow-c2343752-...` | Preferred Trellis active-task context key |
| `SNOW_CWD`           | project root        | Working directory for hooks/tools         |
| `SNOW_PLATFORM`      | `snow`              | Platform tag                              |

Notes:

- `TRELLIS_CONTEXT_ID` wins when already set (explicit override).
- Otherwise Trellis resolves `SNOW_SESSION_ID` via `active_task.py` as platform `snow`.
- Hook stdin may also include dual keys: `sessionId` / `session_id`.
