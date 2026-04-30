# Research: Hook Topology Across Trellis Platforms

- **Query**: enumerate every hook script across every supported platform and its event wiring
- **Scope**: internal
- **Date**: 2026-04-30
- **Repo**: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis`

Read this if you are about to edit any hook file. Tells you which platforms ship a given hook, what event fires it, and what the LLM actually sees on stdout.

---

## 1. Source layout

There are FOUR places a hook script can live in the repo:

| Source dir | Lang | Owner | Notes |
|---|---|---|---|
| `packages/cli/src/templates/shared-hooks/` | Python 3 | shared, no placeholders | written verbatim into each platform's hooks dir at init |
| `packages/cli/src/templates/<platform>/hooks/` | Python 3 | platform-specific | currently only `codex/hooks/session-start.py` and `copilot/hooks/session-start.py` |
| `packages/cli/src/templates/opencode/plugins/` | JavaScript (ESM) | opencode-only | `@opencode-ai/plugin` factory; replaces Python hooks for opencode |
| `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt` | TypeScript | pi-only | Pi "extension" — not file-per-event, single TS module that calls `pi.on(...)` |

Single source of truth for which shared hooks each platform installs:

```ts
// packages/cli/src/templates/shared-hooks/index.ts:66-96
export const SHARED_HOOKS_BY_PLATFORM: Record<SharedHookPlatform, readonly SharedHookName[]> = {
  claude:    ["session-start.py", "inject-workflow-state.py", "inject-subagent-context.py"],
  cursor:    ["session-start.py", "inject-shell-session-context.py", "inject-workflow-state.py", "inject-subagent-context.py"],
  codex:     ["inject-workflow-state.py"],
  gemini:    ["session-start.py", "inject-workflow-state.py"],
  qoder:     ["session-start.py", "inject-workflow-state.py"],
  copilot:   ["inject-workflow-state.py"],
  codebuddy: ["session-start.py", "inject-workflow-state.py", "inject-subagent-context.py"],
  droid:     ["session-start.py", "inject-workflow-state.py", "inject-subagent-context.py"],
  kiro:      ["inject-subagent-context.py"],
};
```

Distribution is centralised here; both `writeSharedHooks()` (init-time write) and `collectSharedHooks()` (update-time hash diff) read this table.

---

## 2. Shared hook scripts — what each does

| File | Event class | Stdin | Stdout | Effect |
|---|---|---|---|---|
| `session-start.py` | SessionStart (startup/clear/compact) | JSON: `{cwd, transcript_path, ...}` | `{"hookSpecificOutput": {"hookEventName":"SessionStart","additionalContext": "<session-context>...workflow...task-status..."}}` | Injects the full workflow guide + spec index + task status block into the model's pre-prompt context. ~9 KB of preamble. |
| `inject-workflow-state.py` | UserPromptSubmit (per-turn) | JSON: `{cwd, prompt, ...}` | `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"<workflow-state>Task: ID (status)\n...</workflow-state>"}}` | Adds a short breadcrumb for every user turn. Body comes from `[workflow-state:STATUS]` tag in `.trellis/workflow.md`, falling back to hardcoded `_FALLBACK_BREADCRUMBS` (`no_task`, `planning`, `in_progress`, `completed`). See `inject-workflow-state.py:144-201`. |
| `inject-subagent-context.py` | PreToolUse (Task / Agent / Subagent) | JSON: `{tool_name, tool_input:{subagent_type, prompt, ...}}` | Modified `tool_input.prompt` rewritten with prepended Trellis context | Pulls `implement.jsonl` / `check.jsonl` + prd.md + info.md and prepends to the sub-agent prompt. Only reacts to `trellis-implement`, `trellis-check`, `trellis-research` (see `AGENTS_ALL` at line 63). |
| `inject-shell-session-context.py` | beforeShellExecution (Cursor only) | JSON: hook payload incl. session id | writes a short-lived runtime ticket file under `.trellis/.runtime/cursor-shell/` | Bridges Cursor's conversation identity into `task.py` shell calls (Cursor shell env doesn't inherit SessionStart data). See file header comment at line 1-8. |

`inject-workflow-state.py` is the breadcrumb script the rest of this doc keeps referring to.

---

## 3. Per-platform hook inventory

Columns: configurator file, hooks dir on disk, hook config file shape, events wired.

### Class-1 (push-based: hook can mutate sub-agent prompts)

| Platform | Configurator | Hooks dir | Config file | SessionStart | UserPromptSubmit | PreToolUse Task | Other |
|---|---|---|---|---|---|---|---|
| **Claude Code** | `claude.ts:71` | `.claude/hooks/` | `.claude/settings.json` | session-start.py (matchers: startup, clear, compact) | inject-workflow-state.py | inject-subagent-context.py (matchers: Task, Agent) | — |
| **Cursor** | `cursor.ts:23` | `.cursor/hooks/` | `.cursor/hooks.json` (separate, NOT settings.json) | sessionStart → session-start.py | beforeSubmitPrompt → inject-workflow-state.py | preToolUse matcher `Task\|Subagent` → inject-subagent-context.py | beforeShellExecution → inject-shell-session-context.py |
| **CodeBuddy** | `codebuddy.ts:26` | `.codebuddy/hooks/` | `.codebuddy/settings.json` | session-start.py (startup/clear/compact) | inject-workflow-state.py | inject-subagent-context.py (matcher: Task) | — |
| **Droid (Factory)** | `droid.ts:23` | `.factory/hooks/` | `.factory/settings.json` | session-start.py (startup/clear/compact) | inject-workflow-state.py | inject-subagent-context.py (matcher: Task) | — |
| **Kiro** | `kiro.ts:19` | `.kiro/hooks/` | embedded inside `.kiro/agents/<name>.json` | — | — | only via `agentSpawn` event in agent JSON | per `shared-hooks/index.ts:60-62` Kiro has no SessionStart / UserPromptSubmit equivalents |

### Class-2 (pull-based: hooks fire only in main session, sub-agents must self-load context)

| Platform | Configurator | Hooks dir | Config file | SessionStart | UserPromptSubmit | PreToolUse | Reason for class-2 |
|---|---|---|---|---|---|---|---|
| **Codex** | `codex.ts:26` | `.codex/hooks/` | `.codex/hooks.json` (+ user must enable `features.codex_hooks=true` in `~/.codex/config.toml`) | codex-specific session-start.py (NOT shared) | inject-workflow-state.py (shared) | not wired — Codex `PreToolUse` only fires for Bash, no `CollabAgentSpawn` (issue #15486). See comment at `codex.ts:51-54`. | Sub-agents get `developer_instructions` prelude via `applyPullBasedPreludeToml` |
| **Gemini** | `gemini.ts:29` | `.gemini/hooks/` | `.gemini/settings.json` | session-start.py | inject-workflow-state.py | not wired — Gemini BeforeTool can fire but #18128 limits chain-of-thought (`gemini.ts:24`) | Sub-agents get markdown prelude via `applyPullBasedPreludeMarkdown` |
| **Qoder** | `qoder.ts:26` | `.qoder/hooks/` | `.qoder/settings.json` | session-start.py (startup/clear/compact) | inject-workflow-state.py | not wired (`qoder.ts:23-24`) | Sub-agents get markdown prelude |
| **Copilot** | `copilot.ts:23` | `.github/copilot/hooks/` (+ duplicated `.github/hooks/trellis.json`) | `.github/copilot/hooks.json` | copilot-specific session-start.py (NOT shared); see warning in file header — Copilot ignores SessionStart output today | inject-workflow-state.py (event name `userPromptSubmitted`, with `bash`/`powershell` keys) | not wired — issues #2392/#2540 (`copilot.ts:45-47`) | Sub-agents get markdown prelude |
| **OpenCode** | `opencode.ts:102` | `.opencode/plugins/` (JS, not Python) | `.opencode/package.json` declares `@opencode-ai/plugin` dep; plugins auto-loaded | session-start.js → handles `chat.message` first message | inject-workflow-state.js → `chat.message` every message | inject-subagent-context.js → `tool.execute.before` | Plugin model is independent — actually class-1 by capability but uses JS, not shared Python |

### Hookless (commands/skills only)

| Platform | Configurator | Hook support | Notes |
|---|---|---|---|
| **Kilo** | `kilo.ts:16` | none | `.kilocode/workflows/` + `.kilocode/skills/` only |
| **Antigravity** | `antigravity.ts:16` | none | `.agent/workflows/` + `.agent/skills/` |
| **Windsurf** | `windsurf.ts:16` | none | `.windsurf/workflows/` + `.windsurf/skills/` |

`hasHooks` flag in `types/ai-tools.ts` confirms: claude/cursor/kiro/gemini/qoder/codebuddy/copilot/droid/pi = `true`; opencode/codex = `false` (they have hooks but the flag drives template `{{HAS_HOOKS}}` conditionals about Python availability, not actual capability); kilo/antigravity/windsurf = `false`.

### Pi (extension model — neither pure shared nor pure plugin)

| Platform | Source | Target | Events listened |
|---|---|---|---|
| **Pi** | `pi.ts:55`, template at `templates/pi/extensions/trellis/index.ts.txt` | `.pi/extensions/trellis/index.ts` | `session_start`, `before_agent_start` (mutates `systemPrompt`), `context`, `input`, `tool_call` (injects `TRELLIS_CONTEXT_ID` env into bash). See `index.ts.txt:962-996`. |

Pi does NOT install any Python script under `.pi/hooks/` — it ships TS code that the Pi runtime evaluates in-process. Sub-agent context is push-injected via `before_agent_start` hook (`index.ts.txt:969-982`).

---

## 4. Platform-specific hooks vs shared hooks

| Hook file | Belongs to | Reason it isn't shared |
|---|---|---|
| `templates/codex/hooks/session-start.py` | codex | Codex hook protocol expects a slightly different startup envelope; codex-specific code path is documented in file header. |
| `templates/copilot/hooks/session-start.py` | copilot | Copilot ignores SessionStart output today (file header line 5-10). Kept for parity / future support; logs only. |
| `templates/opencode/plugins/*.js` | opencode | OpenCode plugin model uses JS factories invoked by the runtime, not stdin-JSON Python. |
| `templates/pi/extensions/trellis/index.ts.txt` | pi | Pi runs a TS extension in-process. |
| `templates/shared-hooks/inject-shell-session-context.py` | shipped only to cursor | Other platforms either don't expose `beforeShellExecution` or inherit env naturally. |
| `templates/shared-hooks/inject-subagent-context.py` | shipped only to claude / cursor / codebuddy / droid / kiro | Class-2 platforms can't mutate sub-agent prompts via hook. |

Everything else under `shared-hooks/` is platform-independent Python that reads only from `.trellis/`.

---

## 5. The breadcrumb pipeline (UserPromptSubmit → LLM context)

End-to-end for `inject-workflow-state.py`:

1. **Trigger.** Each platform's hook config registers a UserPromptSubmit-equivalent event that runs `python3 .<platform>/hooks/inject-workflow-state.py`. Per-platform event name varies:

   | Platform | Event key in config | Source line |
   |---|---|---|
   | Claude / Codebuddy / Droid / Codex / Gemini / Qoder | `UserPromptSubmit` | each platform's `settings.json` / `hooks.json` |
   | Cursor | `beforeSubmitPrompt` | `cursor/hooks.json:17` |
   | Copilot | `userPromptSubmitted` | `copilot/hooks.json:10` |
   | OpenCode | `chat.message` (plugin handler) | `opencode/plugins/inject-workflow-state.js:164` |

2. **Stdin.** Hook receives JSON on stdin from the platform host. At minimum: `{"cwd": "<path>", "prompt": "<user text>"}`. The script only uses `cwd` (line 261) plus session identity fields propagated through `common/active_task.py`.

3. **Resolution.** Walks up from cwd to find `.trellis/`, then calls `common.active_task.resolve_active_task()` to find current task, reads `task.json` for status. See `inject-workflow-state.py:255-285`.

4. **Body.** Looks up status in `_FALLBACK_BREADCRUMBS` (line 144) merged with parsed `[workflow-state:<status>]` blocks from `.trellis/workflow.md` (`load_breadcrumbs` at line 204).

5. **Stdout.** Single JSON object, single line:

   ```python
   # inject-workflow-state.py:278-284
   output = {
       "hookSpecificOutput": {
           "hookEventName": "UserPromptSubmit",
           "additionalContext": breadcrumb,
       }
   }
   print(json.dumps(output))
   ```

   `breadcrumb` literal shape (`build_breadcrumb` at line 230):

   ```
   <workflow-state>
   Task: <task_id> (<status>)
   Source: <source>
   <body from FALLBACK or workflow.md tag>
   </workflow-state>
   ```

6. **LLM ingestion.** Each platform host treats `additionalContext` as system-level preamble prepended to the user prompt for that turn. The block stays inline in conversation history (so a compact won't lose it for past turns, but new turns generate a fresh breadcrumb).

---

## 6. Class-1 vs Class-2 — what reaches sub-agents

Direct quote from `codex.ts:51-54` defining the term:

```ts
// Codex is a class-2 (pull-based) platform: PreToolUse only fires for Bash
// and CollabAgentSpawn hook is not implemented (#15486). Sub-agents must
// load Trellis context themselves via the prelude injected here.
```

Same comment is echoed in `copilot.ts:45-47`, `gemini.ts:24-25`, `qoder.ts:23-24`.

| Class | Push? | Platforms | Sub-agent context source |
|---|---|---|---|
| **Class-1** | yes — hook rewrites `tool_input.prompt` before sub-agent runs | Claude Code, Cursor, CodeBuddy, Droid | `inject-subagent-context.py` injects prd + jsonl + info into the prompt sent to the sub-agent |
| **Class-1 (alt)** | yes — JS plugin mutates tool input | OpenCode | `opencode/plugins/inject-subagent-context.js` via `tool.execute.before` |
| **Class-1 (alt)** | yes — TS extension mutates `systemPrompt` | Pi | `pi.on("before_agent_start")` (`index.ts.txt:969-982`) |
| **Class-2** | no — hook can't see sub-agent spawn | Codex, Gemini, Qoder, Copilot | sub-agent definition file is augmented at init via `applyPullBasedPreludeMarkdown` (markdown agents) or `applyPullBasedPreludeToml` (codex agents). Sub-agent reads `prd.md` / `implement.jsonl` itself. |
| **Hook-only-on-spawn** | yes via Kiro `agentSpawn` event embedded inside `.kiro/agents/<name>.json` | Kiro | `inject-subagent-context.py` invoked by Kiro when it spawns the agent |

---

## 7. The breadcrumb is invisible to sub-agents (confirmed)

The UserPromptSubmit hook fires only in the user-visible main session. When the main session spawns a sub-agent (Task tool), the sub-agent gets its own private context built by either:

- **Class-1**: `inject-subagent-context.py` (prepends prd / jsonl / info to the sub-agent's prompt)
- **Class-2**: the static prelude from `buildPullBasedPrelude(agentType)` baked into the agent definition at init time

Look at `buildPullBasedPrelude` (`shared.ts:356-378`):

```ts
return `## Required: Load Trellis Context First

This platform does NOT auto-inject task context via hook. Before doing anything else, you MUST load context yourself:

1. Run \`python3 ./.trellis/scripts/task.py current --source\` to find the active task path and source ...
2. Read the task's \`prd.md\` (requirements) and \`info.md\` if it exists ...
3. Read \`<task-path>/${jsonl}\` — JSONL list of dev spec files relevant to this agent.
4. For each entry in the JSONL, Read its \`file\` path ...
```

It instructs the sub-agent to read prd / info / jsonl. It does NOT mention `<workflow-state>`, `task.status`, the `[workflow-state:STATUS]` tags, or any state from the breadcrumb. The only "status-ish" data the sub-agent sees is the implicit fact that `task.py current --source` returned a task — but the breadcrumb body (e.g. the "trellis-implement → trellis-check → trellis-update-spec → finish" guidance for `in_progress`) is omitted entirely.

Same on the class-1 side: `inject-subagent-context.py` only injects per-task files (prd, info, jsonl), no `<workflow-state>` block. Confirmed by reading lines 696-723 — the `tool_input.prompt` is rewritten with task files, not with the workflow-state breadcrumb.

So:

> The `<workflow-state>` breadcrumb is exclusively a main-session signal. Sub-agents (any class) never see it. If sub-agent behaviour needs to depend on workflow status, it must read `task.json.status` itself or the spawning main session must inline the relevant guidance into the sub-agent prompt.

---

## 8. Quick reference: "if I edit hook X..."

| Edit | Affects |
|---|---|
| `shared-hooks/session-start.py` | claude, cursor, gemini, qoder, codebuddy, droid (NOT codex/copilot — they ship their own; NOT kiro/opencode/pi) |
| `shared-hooks/inject-workflow-state.py` | claude, cursor, codex, gemini, qoder, copilot, codebuddy, droid (every hook-capable Python platform; NOT kiro/opencode/pi) |
| `shared-hooks/inject-subagent-context.py` | claude, cursor, codebuddy, droid, kiro (class-1 + kiro). |
| `shared-hooks/inject-shell-session-context.py` | cursor only |
| `templates/codex/hooks/session-start.py` | codex only |
| `templates/copilot/hooks/session-start.py` | copilot only (mostly diagnostic — Copilot ignores SessionStart output) |
| `templates/opencode/plugins/*.js` | opencode only |
| `templates/pi/extensions/trellis/index.ts.txt` | pi only |
| Per-platform `settings.json` / `hooks.json` | event wiring only — no behaviour change unless hook script changes |

---

## Caveats / Not Found

- The `_detect_platform` env var map in `inject-workflow-state.py:59-68` covers 8 platforms but Pi, OpenCode, Kilo, Antigravity, Windsurf are absent — these either don't run the Python hook or run it under a different platform's env. (Pi doesn't run it at all; opencode runs the JS twin; the rest are hookless.)
- Codex hooks require `features.codex_hooks = true` in user-level `~/.codex/config.toml` (warning at `codex.ts:80-90` and `codex/config.toml:7-15`). If unset, hooks.json is silently ignored — no breadcrumb fires. This is the most common reason a Codex user reports "Trellis context missing".
- Copilot SessionStart is currently no-op visible-context-wise (file header comment). Only `userPromptSubmitted` actually reaches the model.
- OpenCode plugin breadcrumb mutates `output.parts[0].text` directly (`inject-workflow-state.js:178-188`), so the breadcrumb appears INSIDE the assistant message stream rather than as host-injected preamble. Different shape from Python hooks but same intent.
- Kiro embeds hook references in agent JSON files; this research did not enumerate the exact field path inside those JSON files — see `templates/kiro/agents/*.json` if needed.
