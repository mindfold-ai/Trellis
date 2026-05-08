# Research: GitHub Copilot CLI hook output injection + alternative context-injection paths

- **Query**: Does Copilot's `userPromptSubmitted` hook actually inject stdout/`additionalContext` into model context? If not, what other injection vectors exist? Recommend a fix for Trellis issues #248 and #249.
- **Scope**: external (Copilot docs + GitHub issues) + internal (Trellis Copilot templates)
- **Date**: 2026-05-08
- **Issues**: [#248](https://github.com/mindfold-ai/Trellis/issues/248), [#249](https://github.com/mindfold-ai/Trellis/issues/249)

---

## Q1 — Does `userPromptSubmitted` (and `sessionStart`) hook output get injected?

### Definitive answer

**No, both `sessionStart` and `userPromptSubmitted` JSON command hook output (the kind Trellis uses via `.github/copilot/hooks.json` / `.github/hooks/trellis.json`) is IGNORED by the Copilot CLI.** Same fate as `sessionStart` shown in #248's screenshot.

This is not an undocumented bug — it's stated explicitly in the official docs:

| Hook | Output processed (per official docs) |
|---|---|
| `sessionStart` / `SessionStart` | **No** |
| `userPromptSubmitted` / `UserPromptSubmit` | **No** |
| `sessionEnd` | No |
| `errorOccurred` | No |
| `preToolUse` | Yes (allow/deny/modify) |
| `postToolUse` | Yes (modifiedResult only — see caveat below) |
| `postToolUseFailure` | Yes (`additionalContext` works) |
| `notification` | Optional `additionalContext` (works) |
| `subagentStart` | Yes — `additionalContext` prepended to subagent prompt (works) |
| `subagentStop` | Yes — can block + force continuation |
| `agentStop` | Yes — can block + force continuation |

### Citations

1. **GitHub Copilot CLI hooks reference — events table** (https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference): the table column "Output processed" is "No" for `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `errorOccurred`.

2. **Hooks configuration reference** (https://github.com/github/docs/blob/main/content/copilot/reference/hooks-configuration.md):
   - `sessionStart`: "**Output:** Ignored (no return value processed)"
   - `userPromptSubmitted`: "**Output:** Ignored (prompt modification not currently supported in customer hooks)"

3. **CLI tutorial — using hooks** (https://docs.github.com/copilot/tutorials/copilot-cli-hooks): "The `sessionStart` hook receives contextual information... **Any output from this hook is ignored by Copilot CLI**, which makes it suitable for informational messages." And for `userPromptSubmitted`: "**The output of this hook is ignored.**"

4. **Issue #1352 — `sessionStart` hook stdout is not displayed in terminal UI** (https://github.com/github/copilot-cli/issues/1352, opened 2026-02-08, still open as of 2026-04-06): confirms even the *user-visible* terminal print is silently swallowed; `[hook stdout]` only shows up at DEBUG level in process log. Filed against CLI 0.0.406.

5. **Issue #1139 — Support injecting hook command output into LLM context (like Claude Code)** (https://github.com/github/copilot-cli/issues/1139): tester confirmed via grep test that distinctive `COPILOT_HOOK_OUTPUT_TEST` echoed from a `sessionStart` hook never reaches the LLM. **Marked resolved** on the basis that v1.0.11 added a JSON `additionalContext` mechanism — but read carefully:

6. **CLI changelog 1.0.11 — 2026-03-23** (https://github.com/github/copilot-cli/blob/HEAD/changelog.md): "**sessionStart** hook additionalContext is now injected into the conversation". Changelog 1.0.24 — 2026-04-10: "**preToolUse** hooks now respect modifiedArgs/updatedInput, and additionalContext fields". Note: neither changelog entry includes `userPromptSubmitted`.

7. **Critical caveat — even where `additionalContext` works at the SDK type level, it's broken at runtime for `userPromptSubmitted`.** Issue #2652 — "additionalContext silently dropped for userPromptSubmitted and postToolUse extension hooks" (https://github.com/github/copilot-cli/issues/2652, filed against CLI v1.0.24, 2026-04-12):

   | Hook | additionalContext in TS types? | Actually works at runtime? |
   |---|---|---|
   | sessionStart | Yes | **Yes (since v1.0.11)** |
   | userPromptSubmitted | Yes | **No — dropped** |
   | preToolUse | Yes | **No — dropped** (also #2585) |
   | postToolUse | Yes | **No — dropped** |
   | postToolUseFailure | Yes | Yes |
   | notification | Yes | Yes |
   | subagentStart | Yes | Yes |

   That table is for the **SDK extension hooks** (not command hooks). For `hooks.json` command hooks the docs are even stricter: output is ignored entirely.

8. **#249 confirms parity for Pi**: Trellis docs (https://docs.trytrellis.app/advanced/multi-platform) describe the Pi extension as the one that handles before_agent_start + sub-agent injection. The reporter's diff shows the current `index.ts` registers `pi.on("input", ...)` and `pi.on("before_agent_start", ...)` but neither hook injects the `[workflow-state:STATUS]` breadcrumb. Pi's `before_agent_start` *does* support injection (`return { message: ..., systemPrompt: ... }`) per https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md, so the fix on Pi is purely a Trellis-side bug — Pi's host is willing.

### Implication for Trellis 0.5.6 wiring

Looking at `packages/cli/src/templates/copilot/hooks.json` (current state):

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "{{PYTHON_CMD}} .github/copilot/hooks/session-start.py", "timeout": 10 }
    ],
    "userPromptSubmitted": [
      { "type": "command",
        "bash": "{{PYTHON_CMD}} .github/copilot/hooks/inject-workflow-state.py",
        "powershell": "{{PYTHON_CMD}} .github/copilot/hooks/inject-workflow-state.py",
        "timeoutSec": 5 }
    ]
  }
}
```

Both events are in the "Output processed: No" column. The `inject-workflow-state.py` script's stdout JSON `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}` is silently discarded by Copilot CLI. This is exactly the same fate as `SessionStart` reported in #248. So Trellis 0.5.6's per-turn workflow-state injection on Copilot is a no-op today.

Side note on the format mix: the file uses `SessionStart` (PascalCase, VS Code form) + `userPromptSubmitted` (camelCase, native form). Copilot CLI accepts both naming conventions but the field names in the hook input differ between them (camelCase keys vs snake_case keys). Either way, output is ignored — this isn't the cause of the bug, but it's an inconsistency worth flagging.

---

## Q2 — Catalog of injection paths Copilot offers

Multiple paths exist; they trade off freshness, automation, and visibility.

### Path A — `.github/copilot-instructions.md` (repository-wide custom instructions)

- **Mechanism**: VS Code Copilot Chat (and Copilot CLI per the customization stack) auto-detects this file at the repo root's `.github/` folder and prepends it to every chat request.
- **Where**: `.github/copilot-instructions.md` (single file, fixed name).
- **Limitations**:
  - **Static at write time** — no per-session interpolation. To freshen, you must rewrite the file on disk before the session starts.
  - **Code-review reads only first 4,000 characters** (Copilot Chat / cloud agent are not capped, but the limit exists for code-review).
  - Covered by Copilot Chat (VS Code, Visual Studio, JetBrains), Copilot cloud agent, Copilot code review, and Copilot CLI's customization stack.
- **Frequency**: per-turn / always-on (gets injected into every Copilot Chat request automatically, by Copilot itself).
- **Citations**: https://docs.github.com/en/copilot/concepts/prompting/response-customization?tool=vscode ; https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide ; https://code.visualstudio.com/docs/copilot/customization/custom-instructions

### Path B — `.github/instructions/*.instructions.md` (path-specific custom instructions)

- **Mechanism**: One or more `NAME.instructions.md` files inside `.github/instructions/`, each with a YAML frontmatter `applyTo` glob. Copilot auto-applies a file when the agent is operating on a file matching the glob.
- **Where**: `.github/instructions/<name>.instructions.md` (extensible — subdirectories supported).
- **Limitations**:
  - `applyTo` is a path glob; doesn't fire on "every prompt" unless you write `applyTo: "**"`.
  - When `applyTo` is omitted, the file is *not* automatically applied; user/agent has to manually attach it.
  - Frontmatter supports `applyTo`, `name`, `description`, `excludeAgent` (`"code-review"` / `"cloud-agent"`).
- **Frequency**: per-turn whenever the matched file enters context. Closest thing to a per-prompt mid-session refresher Copilot offers.
- **Citations**: https://code.visualstudio.com/docs/copilot/customization/custom-instructions ; https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide ; https://docs.github.com/en/copilot/reference/custom-instructions-support

### Path C — `*.prompt.md` files (slash-command prompt files)

- **Mechanism**: Markdown files with YAML frontmatter (`description`, `agent`, `model`, `tools`, `argument-hint`) at `.github/prompts/<name>.prompt.md`. The user invokes `/foo` in Copilot Chat to expand the file's body as the prompt.
- **Where**: `.github/prompts/<name>.prompt.md` (workspace) or in user data dir (user-level).
- **Limitations**:
  - **Manual / pull-based** — user has to type `/<name>`.
  - Available only in VS Code, Visual Studio, JetBrains IDEs (per the docs.github.com matrix). Copilot CLI's quickstart implies prompt-file equivalents but the surface is not the same auto-trigger.
  - Trellis already ships these for command discovery (start/finish-work/etc); they aren't a context-injection vector for breadcrumbs.
- **Frequency**: only when invoked.
- **Citations**: https://code.visualstudio.com/docs/copilot/customization/prompt-files ; https://docs.github.com/en/copilot/concepts/prompting/response-customization?tool=vscode

### Path D — `AGENTS.md`

- **Mechanism**: Standard agent-instructions file at repo root. Auto-loaded by Copilot Chat (VS Code), Copilot cloud agent, and Copilot CLI when present.
- **Where**: `AGENTS.md` (repo root, single file). Also accepts `CLAUDE.md` / `GEMINI.md` for cloud agent compatibility.
- **Limitations**: Static at write time, same as `.github/copilot-instructions.md`. Conflict-prone with multi-tool projects (other agents read it too).
- **Frequency**: always-on / once-per-session.
- **Citations**: https://docs.github.com/en/copilot/reference/custom-instructions-support

### Path E — Prompt hooks (`type: "prompt"` in `hooks.json`)

- **Mechanism**: A `sessionStart` hook of type `"prompt"` auto-submits text as if the user typed it. Body can be natural-language or a slash command.
- **Where**: same `hooks.json` Trellis already writes.
- **Limitations**:
  - **Only `sessionStart`** is supported as a prompt hook target.
  - **Only fires for new interactive sessions** — does NOT fire on resume, does NOT fire in non-interactive `-p` mode.
  - Auto-submitted text is visible to the user (looks like a typed message), so it's noisy if used for housekeeping context.
  - Cannot be used per-turn.
- **Frequency**: once per fresh interactive session.
- **Citations**: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference (Prompt hooks section).

### Path F — `subagentStart` hook (sub-agent context injection)

- **Mechanism**: `hooks.json` event `subagentStart`. Returns JSON `{ "additionalContext": "..." }`. Per the docs table: "Returns `additionalContext` prepended to the subagent's prompt. Supports `matcher` to filter by agent name." Cannot block creation.
- **Where**: in `.github/hooks/*.json` / `.github/copilot/hooks.json`, alongside other events.
- **Limitations**:
  - Only fires for **sub-agents**, not the main session — so it doesn't help #248's session-start problem, and doesn't help the main-session per-turn breadcrumb.
  - Useful for getting `implement.jsonl` / `check.jsonl` context into `trellis-implement` etc. on Copilot, where today Trellis uses the pull-based prelude (`applyPullBasedPreludeMarkdown`).
  - Added in v1.0.11 (2026-03-23).
- **Frequency**: per sub-agent dispatch.
- **Citations**: changelog 1.0.11; https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference

### Path G — `notification` hook with `additionalContext`

- **Mechanism**: Fires asynchronously on system notifications (shell completion, agent completion or idle, permission prompts, elicitation dialogs). Confirmed working — `additionalContext` is injected.
- **Limitations**: Trigger conditions are not "per user prompt"; matches arbitrary internal notifications. Not a reliable per-turn vector.

### Path H — Copilot SDK extension (TypeScript / .NET)

- **Mechanism**: Build a `@github/copilot-sdk` extension that registers `onUserPromptSubmitted` / `onSessionStart` runtime hooks programmatically.
- **Where**: `~/.copilot/extensions/<name>/` or registered via the SDK.
- **Limitations**:
  - Massive complexity bump compared to JSON hooks (need a Node/.NET package, lifecycle, distribution).
  - **Even there, `userPromptSubmitted` `additionalContext` is broken at runtime as of v1.0.24** (issue #2652). `modifiedPrompt` works but is intrusive — pollutes the visible user prompt.
  - `sessionStart` `additionalContext` does work since v1.0.11 (issue #2142 fixed in that release).
- **Frequency**: per event; subject to the runtime bugs above.
- **Citations**: https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-hooks/user-prompt-submitted ; https://docs.github.com/copilot/how-tos/copilot-sdk/use-hooks/session-lifecycle ; https://github.com/github/copilot-cli/issues/2652 ; https://github.com/github/copilot-cli/issues/2142

### Path I — MCP server registration

- **Mechanism**: Copilot supports MCP servers (project-local or global). An MCP server can expose tools the agent calls, but doesn't *push* context into the conversation — it pulls when the agent decides to use a tool.
- **Limitations**: Pull-based; agent has to know to call. Not an "always-on" injection vector.

### Summary table

| Path | Auto per-session? | Auto per-turn? | Fresh per call? | Available on Copilot CLI today? | Useful for `[workflow-state:STATUS]`? |
|---|---|---|---|---|---|
| A. `.github/copilot-instructions.md` | Yes | Yes | No (static file) | Yes | Partial (must rewrite file each turn) |
| B. `.github/instructions/*.instructions.md` (`applyTo:"**"`) | Yes | Yes (when files in scope) | No (static file) | Yes (Chat); CLI parity less clear | Partial |
| C. `*.prompt.md` | No | No | N/A | Manual | No (slash-trigger) |
| D. `AGENTS.md` | Yes | Yes | No (static file) | Yes | Partial |
| E. `sessionStart` prompt hook | Yes (new only) | No | Yes (script computes) | Yes | Once-only — misses per-turn |
| F. `subagentStart` hook `additionalContext` | N/A | N/A | Yes | Yes (v1.0.11+) | No (sub-agent only) |
| G. `notification` hook | No | No | Yes | Yes | No (wrong triggers) |
| H. SDK extension `onUserPromptSubmitted` | Yes | Yes (intended) | Yes | **Broken — issue #2652** | No until upstream fix |
| H. SDK extension `onSessionStart` | Yes | No | Yes | Yes (v1.0.11+) | Partial — once only |

---

## Recommendation for Trellis

Two-layer fix that matches what Copilot will actually consume today:

### Layer 1 — Replace `userPromptSubmitted` command hook with file-based per-turn injection

Since `userPromptSubmitted` command-hook output is **ignored**, drop the hook (or keep it for parity / audit logging) and shift the breadcrumb mechanism to a file Copilot auto-reads:

- **Option 1a (preferred): write a path-specific instructions file** at `.github/instructions/trellis-workflow-state.instructions.md` with `applyTo: "**"`. Re-emit the file's body whenever the breadcrumb changes. The natural place to do this is at task lifecycle boundaries (`task.py start` / `add-context` / `finish` / `archive`) plus `inject-workflow-state.py` repurposed to write-to-file instead of stdout-JSON. Copilot will pick it up on the next prompt automatically because path-specific instructions with `applyTo:"**"` are re-fetched per turn.
- **Option 1b**: append-or-overwrite a managed block inside `.github/copilot-instructions.md`. Same idea, less granular file. Risks colliding with user-authored content unless we delimit a Trellis-managed region.

Either option gives Copilot the breadcrumb on every turn, via a path Copilot already injects natively. No SDK extension required, no v1.0.x runtime bug exposure.

Trade-off: file-based injection writes to disk on every state change. That's still cheap (rare events), and atomic-replace is straightforward.

### Layer 2 — Replace `SessionStart` command hook with `sessionStart` prompt hook OR rely on Layer 1

The current 20 KB session-start payload via `sessionStart` command-hook stdout is wasted bandwidth (silently discarded). Two viable replacements:

- **Option 2a**: Change the `hooks.json` entry from `type: "command"` to `type: "prompt"` and have the body invoke the existing `/trellis:start` slash prompt the project already ships in `.github/prompts/start.prompt.md`. That auto-types the slash command on session start (interactive only, not on resume). User sees what got auto-submitted, which is actually useful.
- **Option 2b**: Skip `sessionStart` entirely. Layer 1's path-specific-instructions file already covers the "what should I do this turn" question. Session-start context (project state, dev profile, git status) can either:
  - live in `.github/copilot-instructions.md` (the main always-on file), regenerated on `init` / `update` / task transitions; or
  - be read on demand by the `/trellis:start` slash command the user runs once at session start.

Option 2b is simpler and removes one Python hook entirely. It matches what #249's reporter expects on Pi — neither platform actually needs SessionStart for context delivery if the file-based path-specific instruction injects per-turn.

### Layer 3 (optional, complementary) — Wire `subagentStart` hook for sub-agent context

The Copilot configurator (`packages/cli/src/configurators/copilot.ts`) currently uses pull-based preludes (`applyPullBasedPreludeMarkdown`) for `trellis-{implement,check,research}` because sub-agent context injection wasn't possible on Copilot. With v1.0.11+'s `subagentStart` hook, Trellis can switch to push-based injection (matching Claude/Cursor behavior) by adding:

```json
"subagentStart": [
  { "type": "command",
    "bash": "{{PYTHON_CMD}} .github/copilot/hooks/inject-subagent-context.py",
    "powershell": "{{PYTHON_CMD}} .github/copilot/hooks/inject-subagent-context.py",
    "timeoutSec": 30,
    "matcher": "trellis-.*"
  }
]
```

The shared `inject-subagent-context.py` would need to emit `{"additionalContext": "..."}` (the documented `subagentStart` output schema), not the Claude-style `hookSpecificOutput.additionalContext`. Out of scope for the immediate #248 fix; flag for a follow-up.

### Why not the SDK extension route

`onUserPromptSubmitted` `additionalContext` is broken at runtime as of CLI v1.0.24 (issue #2652, still open). Building a TS extension and shipping it as a Trellis dependency is heavyweight, and the upstream bug means we'd ship broken code. Wait until #2652 is closed and revisit.

---

## Code paths where changes would land

Local repo (absolute paths):

- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/copilot/hooks.json` — drop `userPromptSubmitted` command hook (or keep as audit-only); decide on `SessionStart` → `prompt` type or drop.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/copilot/hooks/session-start.py` — repurpose or delete. If repurposed: write to a path-specific instructions file instead of emitting to stdout.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/configurators/copilot.ts` — add a step that writes `.github/instructions/trellis-workflow-state.instructions.md` with `applyTo: "**"` containing initial breadcrumb content. This is the analogue to the codex `inject-workflow-state.py` UserPromptSubmit hook (changelog v0.5.7).
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/shared-hooks/inject-workflow-state.py` — already platform-aware (`_detect_platform` checks `COPILOT_PROJECT_DIR`). Either:
  - Add a "copilot" branch that, instead of printing JSON, atomic-writes the breadcrumb body into `.github/instructions/trellis-workflow-state.instructions.md`; or
  - Move the file-write side-effect to `task.py` lifecycle methods so Copilot doesn't need a per-turn hook at all.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/configurators/shared.ts` — if a new `writeCopilotPathInstructions` helper is needed, add it here for symmetry with `writeSharedHooks`.
- For #249's Pi parity: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/pi/extensions/trellis/index.ts` (or wherever the Pi extension currently lives — confirm path) needs the `before_agent_start` handler to actually compute the breadcrumb (read workflow.md `[workflow-state:STATUS]` block + active task) and return `{ message: ..., systemPrompt: ... }`. Pi's host *does* respect that return shape; Trellis just isn't filling it in.

### Reference for "after" state pattern

The codex precedent (changelog v0.5.7, file `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/codex/hooks.json`) shows the analogous shape for a host that *does* honor `UserPromptSubmit` output:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [
        { "type": "command",
          "command": "{{PYTHON_CMD}} .codex/hooks/inject-workflow-state.py",
          "timeout": 5 }
      ]}
    ]
  }
}
```

Codex ≠ Copilot here: Codex (with `codex_hooks = true`) does inject hook stdout JSON. Copilot does not (for these two events). So the Copilot fix can't mirror Codex 1:1; it needs the file-based injection vector instead.

---

## Caveats / Not Found

- The exact CLI version cutoff where `userPromptSubmitted` JSON command-hook output got "Output: Ignored" documentation was added isn't pinned to a single changelog entry — the docs say so as of HEAD, and issue #1139 / #2142 / #2652 corroborate that nothing has flipped this for `userPromptSubmitted` by v1.0.24 (April 2026). User reported on Trellis 0.5.6 so they're on a Copilot CLI ≥ v1.0.x; the behavior is current.
- The user's Copilot version isn't stated explicitly in #248. Based on Trellis 0.5.6 + Windows + Node 24.14 (late 2025 / early 2026), they're almost certainly on Copilot CLI ≥ v1.0.11. The "Copilot currently ignores sessionStart hook output" message in the screenshot matches the documented behavior.
- No primary-source confirmation for whether `.github/instructions/*.instructions.md` files are honored by **Copilot CLI specifically** (the docs are clear about VS Code Chat / cloud agent / code-review, but the CLI customization stack page mentions hooks + skills + prompt files + agents and is less explicit about path-specific instructions). The VS Code customize-AI guide treats them as part of the unified customization surface; CLI parity should be confirmed empirically when implementing Layer 1 — fall back to `.github/copilot-instructions.md` if path-specific files don't fire under CLI.
- Copilot's "skills" surface (`~/.agents/skills/` and `.github/skills/`) was added to CLI v1.0.11 but I didn't find primary-source docs confirming whether skill content auto-injects every turn or is pull-based. If pull-based (most likely), it's not a viable Layer-1 substitute.
