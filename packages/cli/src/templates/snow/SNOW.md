# Trellis on Snow CLI (snocli)

Snow is a **class-1** Trellis host when running snow-cli with #194 capabilities
(`additionalContext` inject + project agents + `beforeSubAgentStart`).

| Capability | Status |
| --- | --- |
| Skills (`.snow/skills/trellis-*/SKILL.md`) | Works |
| Prompt commands (`.snow/commands/trellis-*.json`) | Works (`/trellis-continue`, `/trellis-finish-work`, …) |
| Context hooks (`.snow/hooks/`) | Inject model context via stdout JSON + write `.snow/log/trellis-context.txt` |
| Project agents (`.snow/agents/*.md`) | Auto-discovered by Snow (`#trellis-implement`, …) |
| `beforeSubAgentStart` | Injects active-task breadcrumb into sub-agent prompts |
| `trellis-start` | Optional — session hooks replace the old manual ritual |

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

Trellis still writes an optional import fragment at `.snow/sub-agents.trellis.json` for older Snow builds that lack project-agent discovery — merge only if needed.

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
