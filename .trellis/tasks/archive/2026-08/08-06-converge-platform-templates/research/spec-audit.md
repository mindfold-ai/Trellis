# Research: spec-audit — `.trellis/spec/` vs. 2026-08-05/06 changes

- **Query**: Audit all 40 spec files against commits `57ea914b..HEAD` plus the uncommitted configure/collectTemplates convergence. Find everything wrong, stale, or missing. Audit only — no spec edits.
- **Scope**: internal
- **Date**: 2026-08-06
- **Files scanned**: all 40 `.md` under `.trellis/spec/` (16 520 lines)
- **Ground truth read**: `packages/cli/src/configurators/{index,shared,claude,codex,cursor,zcode,antigravity,opencode,snow}.ts`, `packages/cli/src/templates/shared-hooks/index.ts`, `packages/cli/src/templates/codex/index.ts`, `.trellis/scripts/common/active_task.py`, `.trellis/scripts/common/session_context.py`, `packages/cli/src/templates/shared-hooks/{session-start,inject-shell-session-context}.py`, `packages/cli/test/{setup.ts,regression.test.ts,configurators/platforms.test.ts}`

---

## Severity key

- **W** = wrong-and-misleading — a reader following it writes broken code, or is actively pointed at a nonexistent symbol/mechanism.
- **S** = merely-stale — factually out of date, but not something you'd act on destructively.

"New today" = falsified by one of `57ea914b`, `c5465d04`, `8ab47a77`, `2e90b149`, or the uncommitted working tree. "Pre-existing" = already wrong before today; surfaced by this sweep.

---

## Findings

### A. Deleted symbols still named as live API

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/configurator-shared.md:67` | "`configurators/shared.ts:writeSkills` — writes single-file workflow skills as `<skillsRoot>/<name>/SKILL.md` … Idempotent." | `writeSkills` was deleted from `shared.ts` in the working tree. Zero hits in `packages/cli/src/configurators/`. Replacement is `collectSkillTemplates` (map) + `writeTemplateMap`. | W | new |
| `cli/backend/configurator-shared.md:69` | "`configurators/shared.ts:writeAgents` — writes agent definitions as `<agentsDir>/<name><ext>`. Default extension `.md`; pass `".toml"` for Codex, `".json"` for Kiro. **Used by every configurator that has an agents directory.**" | Deleted. No configurator has an agents-writing helper any more — every one sets `files.set(\`.x/agents/${name}.md\`, …)` inside its own `collect*Templates`. The `.toml`/`.json` ext argument no longer exists as a concept. | W | new |
| `cli/backend/configurator-shared.md:71` | "`configurators/shared.ts:writeSharedHooks` — copies … applying `replacePythonCommandLiterals` to each." | Deleted. Replaced by `collectSharedHooks(hooksPath, platform)` (`shared.ts:571`), which returns a map and does **not** call `replacePythonCommandLiterals` itself — the rewrite now happens once in `renderTemplateMap`. | W | new |
| `cli/backend/configurator-shared.md:73` | "`collectSkillTemplates` — returns the same `Map<path, content>` that **`writeSkills`** produces … Both `writeSkills` and `collectSkillTemplates` accept the same `(skillsRoot, skills, bundledSkills)`." | Half of the stated pair no longer exists. The whole "two paths that must be kept in sync" framing is obsolete: there is now exactly one description. | W | new |
| `cli/backend/configurator-shared.md:33` | "Every public write helper (`writeSkills`, `writeAgents`, `writeSharedHooks`) calls this before writing" | All three gone. The current invariant is: `writeTemplateMap` renders through `renderTemplateMap` (`shared.ts:555-564`), which is the *only* place the rewrite runs on the write path. | W | new |
| `cli/backend/configurator-shared.md:132` | "**`replacePythonCommandLiterals` runs at write time.** Helpers in this file already call it inside `writeSkills` / `writeAgents` / `writeSharedHooks`." | Same three dead names. The rule itself survives but its named enforcement points are all gone. | W | new |
| `cli/backend/configurator-shared.md:138` | "`writeSkills` and `collectSkillTemplates` accept bundled files separately for this reason." | `writeSkills` gone. | W | new |
| `cli/backend/configurator-shared.md:139` | "**Hooks dir writes go through `writeSharedHooks(dir, platform)`.**" | Function gone; the current rule is `collectSharedHooks(hooksPath, platform)`. The *substance* (SHARED_HOOKS_BY_PLATFORM drives the list; configurators must not hand-pick files) still holds and should be restated against the new name. | W | new |
| `cli/backend/configurator-shared.md:195` + `:200` | Pitfall example "Init writes through helper, update collect renders raw": `await writeAgents(dir, applyPullBasedPreludeMarkdown(agents));` … "pass the result to `writeAgents` and `collectTemplates` respectively." | The entire failure mode this pitfall describes is now structurally impossible — `configure` is derived from `collectTemplates` for 18 platforms and the other three call `writeTemplateMap(cwd, collect…())`. Keeping the example teaches a two-path pattern the codebase deliberately removed. | W | new |
| `cli/backend/configurator-shared.md:238` | Code comment `// Custom write that bypasses writeAgents / writeSkills` | Dead names. | S | new |
| `cli/backend/platform-integration.md:13` | "**Shared configurator utilities**: `src/configurators/shared.ts` — `resolvePlaceholders()`, `writeSkills()`, `writeAgents()`, `writeSharedHooks()`, …" | Three of the seven named exports don't exist. Missing from the list: `writeTemplateMap`, `renderTemplateMap`, `collectSharedHooks`, `collectBothTemplates`, `collectSkillTemplates`. | W | new |
| `cli/backend/platform-integration.md:68` | "> Note: These platforms use `writeSharedHooks()` from `shared.ts` to copy platform-independent hook scripts …" | Dead name. | W | new |
| `cli/backend/platform-integration.md:121` | "Skills are written via `writeSkills()`." | Dead name. | W | new |
| `cli/backend/platform-integration.md:224` | "Droid … Uses `writeAgents()` with the droids directory." | Dead name; droid.ts now sets map entries directly. | W | new |
| `cli/backend/platform-integration.md:232` | "Devin … Shared hooks are written via `writeSharedHooks()`." | Dead name. Also: **Devin does not receive shared hooks at all** — `devin` is not a key in `SHARED_HOOKS_BY_PLATFORM` (`shared-hooks/index.ts:34-44`) and `collectDevinTemplates` calls no hook collector. Two errors in one sentence. | W | pre-existing (hook claim) + new (symbol) |
| `cli/backend/platform-integration.md:262` | Signature table row: `writeSkills(skillRoot, skills, bundledSkills)` — "Writes both single-file workflow skills and bundled skill files" | Dead. | W | new |
| `cli/backend/platform-integration.md:311` | "Correct:" code block `await writeSkills(skillRoot, resolveSkills(ctx), resolveBundledSkills(ctx));` | The prescribed "correct" code no longer compiles. | W | new |
| `cli/backend/platform-integration.md:743` | "#### Wrong — `await writeSharedHooks(path.join(configRoot, "hooks"));`" | Dead name (and the one-arg form was already wrong — the surviving signature took `(dir, platform)`). | S | new |
| `cli/backend/platform-integration.md:1158` + `:1161` | "Calls `writeSharedHooks(dir, platform)` where `SHARED_HOOKS_BY_PLATFORM[platform]` excludes `inject-subagent-context.py`" / "Hook-inject platforms keep using `writeSharedHooks(dir, platform)`" | Dead name ×2; substance still correct with `collectSharedHooks`. | W | new |
| `cli/backend/platform-integration.md:1181` | "Extension-backed platforms must not call `writeSharedHooks()` for their config directory." | Dead name; rule survives as "must not call `collectSharedHooks`". | W | new |
| `cli/backend/platform-integration.md:1787` | Platform Support Matrix, Claude Code row: "Auto-distributes via `writeSharedHooks()`" | Dead name. | S | new |
| `cli/backend/platform-integration.md:2006-2010` | "### Forgot to use shared hooks" — symptom/cause/fix all name `writeSharedHooks()` / `writeSharedHooks(hooksDir)` | Dead name ×3, and the one-arg form was never the real signature. | W | new |
| `cli/backend/platform-integration.md:1914-1918` | "…and `copyDirFiltered` copies it." / "**Fix**: Ensure `EXCLUDE_PATTERNS` includes `.js` … **matching the Cursor configurator pattern**. … **Prevention**: copy the full `EXCLUDE_PATTERNS` from an existing one (e.g., `cursor.ts`)" | `copyDirFiltered` is gone from the whole repo (0 hits in `src/`). Worse, `cursor.ts` is now 30 lines with **no `EXCLUDE_PATTERNS` at all** — the spec sends you to a file that no longer contains the thing it tells you to copy. Only `claude.ts` and `opencode.ts` still hold an `EXCLUDE_PATTERNS`. | W | new |
| `cli/backend/directory-structure.md:148-156` | "### Configurator Pattern — Configurators use `cpSync` for direct directory copy (dogfooding)" with a `configureCursor(cwd)` / `getCursorSourcePath()` / `cpSync(...)` example | Every symbol is gone: `cpSync` 0 hits in `src/`, `getCursorSourcePath` 0 hits, `configureCursor` 0 hits. This is the *canonical example* of what a configurator looks like, and it now describes an architecture three rewrites old. Highest-leverage single wrong block in the tree for a newcomer. | W | new (final removal); the `cpSync` shape was already historical |
| `cli/backend/directory-structure.md:389` | "- Use `cpSync` for copying entire directories" (design-decision bullet) | Same. | S | new |
| `cli/backend/platform-integration.md:620` | Test checklist: "Verify `getAllCommands()`/`getAllSkills()`/`getAllWorkflows()` returns expected set" | None of the three exists anywhere in `src/`. Platform template modules expose `getAllAgents()`, `getAllHooks()`, `getHooksConfig()`, `getSettings()`. | W | pre-existing |
| `cli/backend/platform-integration.md:1080` + `:1111` | "`templates/pi/extensions/trellis/index.ts.txt:WORKFLOW_STATE_TAG_RE` MUST mirror `inject-workflow-state.py:_TAG_RE`" | The Pi constant is named `WF_RE` (`index.ts.txt:1072`). The Python side really is `_TAG_RE` (`inject-workflow-state.py:181`) and the regex bodies do match — only the TS name is wrong. Same wrong name repeated at `:736` in the tests-required list. | S | pre-existing |
| `cli/backend/platform-integration.md:1081-1082` | "`loadWorkflowBreadcrumbs()` in the Pi extension reads `.trellis/workflow.md` directly" / "`readActiveTaskStatus()` in `index.ts.txt`" | Neither function exists anywhere in the repo. The real ones are `workflowBreadcrumb(root, key)` (`index.ts.txt:1074`) and `workflowOverview(root, key)` (`:1127`). | S | pre-existing |
| `cli/backend/platform-integration.md:199` | "Antigravity has no physical template files — workflow content is **derived from Codex skills at runtime** via `adaptSkillContentToWorkflow()`. … When adding a new Codex skill, Antigravity automatically picks it up." | `adaptSkillContentToWorkflow` has 0 hits in the repo. `collectAntigravityTemplates` (`antigravity.ts:9-15`) calls `collectBothTemplates` against `common/` — no Codex coupling whatsoever. **This became dangerous today**: `57ea914b` deleted `src/templates/codex/skills/` entirely; a maintainer trusting this line would conclude Antigravity's workflows just got deleted, or would go looking for Codex skills to add one. | W | pre-existing text, newly dangerous |
| `cli/backend/platform-integration.md:2047` | Reference-PR table: "Antigravity — Workflows (derived from Codex) — No physical templates — runtime adaptation from Codex skills" | Same false coupling. | S | pre-existing |
| `cli/backend/platform-integration.md:14` | "**Shared template utilities**: `src/templates/template-utils.ts` — `createTemplateReader()` factory that eliminates boilerplate across platform template modules" | Still true (`template-utils.ts` exists, used by droid/cursor/zcode/gemini/kiro). ✔ no action | — | — |

### B. Session identity / env vars falsified by `8ab47a77`

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/platform-integration.md:383-386` | "Platform-native session environment variables only when the AI host exports them to shell commands, such as `CODEX_SESSION_ID`, `CODEX_THREAD_ID`, `CLAUDE_SESSION_ID`, `OPENCODE_RUN_ID`, `CURSOR_SESSION_ID`, or `PI_SESSION_ID`." | Of six names, **four were deleted as never having existed** (`CODEX_SESSION_ID`, `CLAUDE_SESSION_ID`, `CURSOR_SESSION_ID`, `PI_SESSION_ID`) and one (`OPENCODE_RUN_ID`) was removed from the Python resolver's tables entirely. Only `CODEX_THREAD_ID` survives in `_ENV_SESSION_KEYS` (`active_task.py:73`). This is the single most misleading paragraph in the tree: it is the canonical precedence list a new-platform author copies from, and it's exactly the pattern-guess table the audit exists to prevent recurring. Correct current set: claude→`CLAUDE_CODE_SESSION_ID`, codex→`CODEX_THREAD_ID`, gemini→`GEMINI_SESSION_ID` (hook-scope only), qoder→`QODER_SESSION_ID` (hook-scope only), kiro→`KIRO_SESSION_ID` (unverified), copilot→`COPILOT_SESSION_ID`/`COPILOT_SESSIONID` (unverified), zcode→`CLAUDE_CODE_SESSION_ID` then `CLAUDE_SESSION_ID`, snow→`SNOW_SESSION_ID`. | W | new |
| `cli/backend/script-conventions.md:443` | Context-filename example: "`CODEX_SESSION_ID=native-a` -> `codex_native-a.json`" | `CODEX_SESSION_ID` is not read by anything. This example can no longer be reproduced. | W | new |
| `cli/backend/script-conventions.md:447` | "`CURSOR_SESSION_ID=cursor-a` -> `cursor_cursor-a.json`" | `CURSOR_SESSION_ID` deleted. Cursor now resolves via `_ENV_CONVERSATION_KEYS` → `CURSOR_CONVERSATION_ID` (`active_task.py:110-118`), which yields a `cursor_conversation_*` shape, not `cursor_cursor-a`. | W | new |
| `cli/backend/script-conventions.md:445` | "`OPENCODE_RUN_ID=run-a` -> `opencode_run-a.json`" | The opencode entry was removed from `_ENV_SESSION_KEYS`. The Python resolver no longer produces this filename from that env var. It *is* still honored by the OpenCode JS plugin (`templates/opencode/lib/trellis-context.js:339`) — so the name is not dead, but this table describes the Python context-filename derivation, where it is. | W | new |
| `cli/backend/platform-integration.md:388-402` | "OpenCode uses `OPENCODE_RUN_ID` when available so plugin context and AI-run Bash commands share the same runtime file" | Still true **on the JS side only**. Since the Python table dropped opencode, "AI-run Bash commands" no longer resolve it — the shared runtime filename now depends entirely on the plugin's `export TRELLIS_CONTEXT_ID=` prefix. Needs a scope qualifier, not deletion. | W | new |
| `cli/backend/platform-integration.md:1039` | "Sub-agents on class-2 platforms … do not inherit the parent's `<PLATFORM>_SESSION_ID` env" | The generic `<PLATFORM>_SESSION_ID` shape is precisely the invented convention `8ab47a77` purged. The conclusion (class-2 sub-agents get no session key) is still correct; the stated reason perpetuates the myth. | S | new |
| `cli/backend/script-conventions.md:337-338` | Resolver step 1: "Derive a context key from platform input, `TRELLIS_CONTEXT_ID`, **a platform-native session environment variable when the host exports one**, or a Cursor shell ticket…" | Still technically true but now materially misleading about likelihood: the audit's finding is that **no researched platform exports a session id into a shell child** (`inject-shell-session-context.py:3-8`, `active_task.py:59-64`). The env branch is now the exception, not a peer alternative, and the ticket is the primary path. | S→W | new |
| `cli/unit-test/conventions.md:29-40` | "`test/setup.ts` … unconditionally `delete`s these env vars" listing only `TRELLIS_CONTEXT_ID` and `OPENCODE_RUN_ID` | `test/setup.ts` now scrubs 11 vars: those two plus `CLAUDE_ENV_FILE` (added `c5465d04`) and eight `*_PROJECT_DIR` vars. The spec's "When to extend" rule is right; its inventory is 9 entries short, and it omits the newest *reason* to extend (a var the hook **writes to**, not just reads — `CLAUDE_ENV_FILE` leaked fixture keys into the maintainer's real shell file). | W | new |

### C. Shell-ticket bridge described as Cursor-only (`2e90b149`)

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/platform-integration.md:408-412` | "**Cursor must use `beforeShellExecution` as the shell bridge.** The hook writes a short-lived `.trellis/.runtime/cursor-shell/*.json` ticket containing the `conversation_id`-derived context key…" | Three errors. (1) The bridge is no longer Cursor-only — `inject-shell-session-context.py` now ships to cursor, gemini, qoder, codebuddy, droid, trae, zcode (`shared-hooks/index.ts:106-152`). (2) The directory is `shell-tickets`, not `cursor-shell` (`active_task.py:26`); `cursor-shell` is read-only legacy, never written. (3) `beforeShellExecution` is only Cursor's event name — the same hook also serves Claude-shaped `PreToolUse` and Gemini's `BeforeTool` (`inject-shell-session-context.py:9-13`). | W | new |
| `cli/backend/platform-integration.md:434-436` | "**Cursor has no reliable command-env bridge**, so `beforeShellExecution` must create the short-lived shell ticket described above." | Frames the ticket as a Cursor workaround. It is now the general mechanism for every hook-capable platform that has a pre-shell event — the generalizing insight being that *no* platform has a reliable command-env bridge. | W | new |
| `cli/backend/script-conventions.md:374-381` | "**For Cursor**, `session-start.py` is not a reliable shell environment bridge. Instead, `inject-shell-session-context.py` must run on `beforeShellExecution` and write a short-lived `.trellis/.runtime/cursor-shell/*.json` ticket … This keeps **Cursor** task state per conversation" | Same three errors as above, plus it is the *normative* statement ("must") that a platform author would follow. | W | new |
| `cli/backend/script-conventions.md:339` | Resolver step 1 says "…or **a Cursor shell ticket** for a matching AI-run `task.py` command." | The lookup function was renamed `_lookup_shell_ticket_context_key` (`active_task.py:438`) and its docstring explicitly says the mechanism is not Cursor-specific. Also note the ordering constraint the spec never states: the ticket is checked **last**, after env, and is not gated on platform name (`active_task.py:504-508`). | W | new |
| `cli/backend/platform-integration.md:15` | Shared-hooks list includes `inject-shell-session-context` — correct, and correctly says "written … according to the capability table". ✔ | — | — | — |
| `cli/backend/platform-integration.md:1729` | "`session-start.py`, `inject-subagent-context.py`, and `inject-shell-session-context.py` must never gain keyword handling" (skip-keyword scope) | Still correct and unaffected. ✔ | — | — |

### D. "How to add a platform" checklist

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/platform-integration.md:52-53` | Step 3 table: "`src/configurators/{platform}.ts` — Create new configurator (copy from existing, **export `configure{Platform}`**)" / "`src/configurators/index.ts` — Add entry to `PLATFORM_FUNCTIONS` with **`configure` and optional `collectTemplates`**" | Inverted. The required export is now `collect{Platform}Templates(): Map<string, string>`; `configure` is **derived**. The registry entry for 18 of 21 platforms is a single `fromTemplates(collect…)` call (`index.ts:75-108`). Only claude-code, codex, zcode spell both fields, each for a named residual reason. Following this checklist literally reproduces the two-description bug the convergence removed. This is the highest-traffic wrong line in the file. | W | new |
| `cli/backend/platform-integration.md:12` | "**Function registry**: `src/configurators/index.ts` — `PLATFORM_FUNCTIONS` with configure/collectTemplates per platform" | Understates: it no longer holds per-platform logic at all (338 → 26 lines). The doc-comment at `index.ts:1-11` is now the authoritative 4-step add-a-platform list and disagrees with Step 3 above. | S | new |
| `cli/backend/platform-integration.md:94` | "OpenCode … has **no `collectTemplates`** — so `trellis update` does not track OpenCode template files." | False. `collectOpenCodeTemplates` exists (`opencode.ts:79-95`) and is registered via `fromTemplates` (`index.ts:90`). It walks the template dir, adds commands + skills + bundled skills. Update has tracked OpenCode for several releases. Flagged in the brief; **confirmed**. A reader could use this to justify skipping `collectTemplates` for a new JS-plugin platform. | W | pre-existing |
| `cli/backend/platform-integration.md:1888-1890` | "### Forgot to add entry to PLATFORM_FUNCTIONS — **Fix**: Add entry with `collectTemplates` function to `PLATFORM_FUNCTIONS`" | Still directionally right but names only half the shape. Should be `fromTemplates(collect…)`. | S | new |
| `cli/backend/platform-integration.md:1926-1932` | "### Template placeholder not resolved in collectTemplates — **Fix**: Apply `resolvePlaceholders()` … **in the `collectTemplates` lambda in `PLATFORM_FUNCTIONS`**" | There are no lambdas in `PLATFORM_FUNCTIONS` any more. Also the `python3`→`python` half of this is now handled centrally by `renderTemplateMap`, applied on **both** paths (`index.ts:224`, `shared.ts:559`), so this class of bug is structurally closed for the python rewrite (though `{{PYTHON_CMD}}` in a platform's own template still needs `resolvePlaceholders` at collect time). | W | new |
| `cli/backend/platform-integration.md:2048-2050` | Reference PRs: "feat/v0.5.0-beta — **All 13 platforms**" | 21 platforms. | S | pre-existing |
| `cli/unit-test/conventions.md:71` | "New command added to ANY platform → Add to ALL platform test files (**claude, cursor, iflow, codex**)" | `iflow` was removed as a platform in 0.5. There are now 18 platform test files under `test/templates/`. | S | pre-existing |
| `guides/cross-platform-thinking-guide.md:343` | Change-Propagation checklist: "New command/skill added to ALL platforms (claude, cursor, **iflow**, codex, and any new platform)" | Same dead platform. | S | pre-existing |
| `cli/backend/quality-guidelines.md:406-412`, `:505-512` | Bad/good code examples using `options.iflow`, `{ key: "iflow", name: "iFlow CLI" }` | Illustrative snippets only; the pattern being taught is fine. Cosmetic. | S | pre-existing |
| `cli/backend/configurator-shared.md:11` | Overview lists `configurators/iflow.ts` among the configurators shared.ts serves | File does not exist. | S | pre-existing |

### E. Platform inventory gaps (Snow, capability counts)

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/platform-integration.md` (whole file) | Snow CLI is mentioned **zero times** (verified: `grep -ci snow` → 0). | Snow is a registered, class-1, `agentCapable && hasHooks` platform (`configurators/snow.ts:1-20`, `AI_TOOLS.snow`). It is absent from the class-1 table, the capability grouping bullets, the Command Format table, the workflow-state Platform Support Matrix, and the shared-hooks discussion. Any of those tables read as authoritative will silently omit it. Snow also appears nowhere else in `.trellis/spec/`. | W | pre-existing (Snow merged 2026-07-23) |
| `cli/backend/platform-integration.md:950` | Capability table header: "`agentCapable && hasHooks` **(12)** … `agentCapable && !hasHooks` **(3)** … `!agentCapable` **(3)**" | Computed from `AI_TOOLS`: **13 / 5 / 3**. The `(3)` for the no-hooks column contradicts the very next bullet at `:959`, which correctly lists five. | W | pre-existing |
| `cli/backend/platform-integration.md:958` | "`agentCapable && hasHooks`: claude-code, cursor, kiro, gemini, qoder, codebuddy, copilot, droid, pi, trae, zcode, omp" | Missing `snow`. 12 listed, 13 actual. | W | pre-existing |
| `cli/backend/platform-integration.md:972` | Class-1 row: "Claude Code, Cursor, OpenCode, Kiro, CodeBuddy, Codex, Factory Droid, ZCode" and heading `### Class-1 — Hook-inject (8 platforms)` at `:976` | Missing Snow (`snow.ts:4-6` declares class-1 explicitly and writes no pull-based prelude). Should be 9. | W | pre-existing |
| `cli/backend/platform-integration.md:1785-1797` | Workflow-State "Platform Support Matrix" | Lists 11 platforms. Missing ZCode (ships `inject-workflow-state.py` via `.zcode/config.json`), OMP, Snow, and correctly-absent Grok/Kimi are not marked as deliberately absent either. | S | pre-existing |
| `cli/backend/platform-integration.md:3` | Header list of platforms this guide covers | Stops at Antigravity — omits Reasonix, ZCode, Trae, OMP, Grok, Kimi, Snow. | S | pre-existing |

### F. Two-script-tree parity — direct contradiction

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/filesystem-safety.md:106-112` | "## 4. Dogfood twin sync — When you change a shipped script, sync the twin **iff they were identical first** (`diff` before `cp`); **if the twin has drifted, apply the same edit surgically so unrelated local drift is preserved.**" | Directly contradicted by the new parity test (`regression.test.ts:9522-9585`), which fails the build on **any** byte difference in **any** `.py` under the two trees. "Preserve unrelated local drift" is now an instruction to break CI. The test's own message is "Edit both copies, never one." | W | new |
| `cli/backend/filesystem-safety.md:117-125` | "## 5. Tests required — Every guard here leaves a runnable regression test" then lists four; the dogfood twin has no entry. | The guard now *has* a test and it isn't listed. | S | new |
| `guides/code-reuse-thinking-guide.md:217-223` | "### Template Sync Convention — `.trellis/scripts/` and `…/templates/trellis/scripts/` must stay identical. After editing, always sync: `rsync -av --delete --exclude='__pycache__' …`" | This one is **correct** and is now the enforced rule. It contradicts `filesystem-safety.md:106-112` — two specs, opposite instructions, and until today neither was enforced. Note the rsync direction here (`.trellis/scripts/` → template) is one-way; the test is direction-agnostic. | ✔ correct, but conflicting | — |
| `guides/cross-platform-thinking-guide.md:527-532` | Common Mistake #3 "I updated the template": `src/templates/script.py ← Updated` / `.trellis/scripts/script.py ← Forgot to sync!` | Correct diagnosis of the failure mode; silent about the fact that it's now a build failure rather than a silent drift. Under-sells. | S | new |
| `cli/backend/platform-integration.md:463` | "> **CRITICAL**: Template copy (`src/templates/trellis/scripts/`) must be byte-identical to live copy (`.trellis/scripts/`)" | Substantively correct — but it is buried as the last bullet of a blockquote titled "**Codex-specific** CLIAdapter notes", which reads as a Codex-scoped rule. It is repo-global. Misplacement, not misstatement. | S | pre-existing |

### G. Codex skills / `.codex/skills` (`57ea914b`)

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/platform-integration.md:126-131` | Codex two-layer table: "Codex config/agents/hooks — `.codex/` — Template Source `src/templates/codex/{agents,hooks.json}` — Config, custom agents, UserPromptSubmit hook config, and compatibility hook files" | Accurate as far as it goes and correctly does **not** claim a `src/templates/codex/skills/` source. ✔ But it never states the now-load-bearing fact that `.codex/skills/` is created **empty on purpose** as a user extension point (`codex.ts:206-211`) and is the sole entry in the test's `CONFIGURE_ONLY_EMPTY_DIRS`. A reader could reasonably "clean up" the `ensureDir`. | missing (see §2) | new |
| `cli/backend/migrations.md:207` | Orphan-prune protection lists "User-added `.codex/skills/<name>/`" | Still correct and now more important — `.codex/skills/` holds only user content. ✔ | — | — |
| `cli/backend/configurator-shared.md:59` | "`resolveAllAsSkills` — … Used by skill-only platforms (Codex, Kiro, Qoder…)" | Codex now uses `resolveAllAsSkills**Neutral**` (`codex.ts:180`), not `resolveAllAsSkills`. Snow is the platform that uses plain `resolveAllAsSkills` (`snow.ts:74`) and isn't listed. | S | pre-existing (codex) / pre-existing (snow) |
| No spec file | `getAllCodexSkills`, `SkillTemplate`, `listDirectories` (codex) | Grepped all 40 files: **zero references**. Nothing to fix. ✔ | — | — |

### H. Bundled skills count

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/configurator-shared.md:63` | "`resolveBundledSkills` — resolves multi-file built-in skills (**currently `trellis-meta`**)" | Four bundled skills now ship: `trellis-channel`, `trellis-meta`, `trellis-session-insight`, `trellis-spec-bootstrap` (`ls src/templates/common/bundled-skills/`). | S | pre-existing |
| `cli/backend/platform-integration.md:16` | "multi-file bundled skills (**trellis-meta**)" | Same. | S | pre-existing |
| `cli/backend/platform-integration.md:248` + `:285` | "Bundled built-in skills" scenario, Good case "`trellis-meta` installs as …" | Example-only; fine as an example but the singular framing reinforces the count error. | S | pre-existing |
| `cli/backend/configurator-shared.md:55` | "`resolveSkills` — returns the **5** single-file workflow skills (`brainstorm`, `before-dev`, `check`, `break-loop`, `update-spec`)" | **Verified correct** — exactly those 5 files in `src/templates/common/skills/`. ✔ | — | — |

### I. Misc / adjacent

| File / line | What it says now | Why it is wrong | Sev | Origin |
|---|---|---|---|---|
| `cli/backend/commands-uninstall.md:170` | "`.trellis/runtime/` \| Removed (session state)." | The directory is `.trellis/.runtime/` (leading dot) everywhere in code and in `script-conventions.md:439`. A one-character typo in a table describing a destructive command. | S | pre-existing |
| `cli/backend/script-conventions.md:183-256` | "### Optional Advisory Checks in Session Scripts" — signatures `_fetch_tool_output` / `_marker_path` / `_mark_attempted`, and "Tests Required: Non-default modes (`--json`, record, packages, phase) do not call the advisory check." | The section is written as an abstract pattern with placeholder names, which is defensible. But it is now **incomplete**: `get_update_hint` is public (was `_get_update_hint`), takes an optional `context_key`, and has a **second caller** — the SessionStart hook (`session-start.py:322-342`) — which the "advisory check runs during `get_context.py` text mode only" framing excludes. The marker is now keyed on the resolved session context key rather than falling through to `TERM_SESSION_ID`. | W | new |
| `cli/backend/platform-integration.md:1543-1565` | "Adaptive First-Reply Notice — #### 3. Contracts" (10 bullets) | The `<first-reply-notice>` block now carries a second, conditional line: `Also relay this Trellis maintenance notice on its own line in that same reply: {update_hint}` (`session-start.py:98-102`). None of the 10 contract bullets, the 8-row validation matrix (`:1569-1578`), or the Wrong/Correct example (`:1608-1619`) mentions it. The byte-identity guarantee when there is no hint (`session-start.py:93-97`) is also unstated — and that is exactly the property the commit proved against pre-change code. | W | new |
| `cli/backend/platform-integration.md:1535-1541` | Per-implementation "Adaptive notice?" table (5 rows) | The update-hint rider exists only in `shared-hooks/session-start.py`. Codex's own `session-start.py`, OpenCode's plugin, and the Pi extension build their own payloads and do **not** get it. The table would be the natural place to say so; it doesn't. | missing (see §2) | new |
| `cli/backend/platform-integration.md:369` | Resolver table: "Existing Python callers — `common.paths.get_current_task()` / `get_current_task_abs()` / `get_current_task_source()`" | **Verified correct** — all three exist at `.trellis/scripts/common/paths.py:254/275/297`. ✔ | — | — |

---

## Section 2 — Missing contracts (nothing in `.trellis/spec/` covers these)

### M1. Two-script-tree byte parity is now build-enforced

- **Belongs in**: `cli/backend/script-conventions.md` (new top-level section, since that file owns `.trellis/scripts/` standards), cross-referenced from `cli/backend/filesystem-safety.md` §4 — which must be **rewritten**, not appended to, because it currently says the opposite.
- **Why**: `regression.test.ts:9522-9585` derives its file list from the filesystem and asserts (a) identical path sets and (b) byte-identical content for every `.py` in `.trellis/scripts/**` vs `packages/cli/src/templates/trellis/scripts/**`. New scripts are covered automatically. The motivating incident is worth recording: PR #390 changed the `trellis upgrade`→`update` hint in the template copy only and the drift survived a month. Today, three separate specs describe this pair with three different rules (`filesystem-safety.md:106` "preserve drift", `code-reuse-thinking-guide.md:217` "must stay identical", `platform-integration.md:463` "CRITICAL, byte-identical, Codex-specific note") and none names the test.

### M2. The shell-ticket protocol as a platform-neutral contract

- **Belongs in**: `cli/backend/script-conventions.md` (under `common/active_task.py`), replacing the Cursor-specific paragraph at `:374-381`; summarized in `cli/backend/platform-integration.md` "Active Task Resolution".
- **Why**: This is now the primary session-identity path for seven platforms and there is no single place that states it. The contract has five parts, none of which is currently written down as general: (1) the premise — no researched platform exports a session id into a shell child, but every hook-capable one puts it on hook stdin; (2) the writer is `inject-shell-session-context.py`, registered on whichever pre-shell event the host offers (`beforeShellExecution` / `PreToolUse` / `BeforeTool`), and it extracts the command from either `command` or `tool_input.command`; (3) the host platform is derived from the **install directory** (`.cursor/hooks/`, `.factory/hooks/`), not a platform table, so the ticket's context key equals the one that platform's other hooks compute — get this wrong and `task.py start` writes a session file no hook ever reads, which half-works behind the single-session fallback and breaks silently with two windows; (4) four acceptance conditions — fresh (30 s TTL), right repo, `task.py` subcommand matches, and **exactly one** matching context key, else degrade; (5) the ticket is checked **last**, after env, and is not gated on platform name (`active_task.py:504-508`). Also undocumented: `shell-tickets` is the current dir, `cursor-shell` is read-forever-never-written legacy, and why (a mid-upgrade command on the one platform this already worked for).

### M3. `SHARED_HOOKS_BY_PLATFORM` ↔ config-template binding rule

- **Belongs in**: `cli/backend/platform-integration.md`, in the Step-6/shared-hooks area, and referenced from `configurator-shared.md`'s `collectSharedHooks` entry.
- **Why**: New in `2e90b149` and build-enforced. Declaring a platform in `SHARED_HOOKS_BY_PLATFORM` (`shared-hooks/index.ts`) is only half the wiring — the platform's own hook config template (`settings.json` / `hooks.json` / `config.json`) must also register that hook, because per-platform config formats are the vendors' and cannot be derived. `shared-hooks.test.ts` binds both directions and refuses to pass vacuously: declared-but-not-registered and registered-but-not-declared both fail the build. Rationale worth preserving: "a script on disk that nothing invokes is indistinguishable from success." The Kiro exclusion belongs here too — deliberately unwired because neither of its two hook surfaces publishes a pre-tool trigger and an unknown key in its agent JSON risks the whole agent failing to load; the settling probe is recorded in the declaration comment.

### M4. One description per platform (`collectTemplates` as sole file-set source)

- **Belongs in**: `cli/backend/configurator-shared.md` (new "Template maps" section replacing the "Write helpers" section), and it should **replace** `platform-integration.md:52-53` Step 3.
- **Why**: This is the whole point of the uncommitted change and no spec states it. The contract: `collect<Platform>Templates(): Map<relPath, content>` is the single description of what a platform installs; `trellis update` diffs it and `configure` writes it via `writeTemplateMap`; nothing else may enumerate a platform's files. `fromTemplates(collect…)` derives `configure` for 18 platforms. Exactly three platforms spell both fields and each must justify its residual: claude-code (`--with-statusline`, a per-init flag `collectTemplates` has no parameter for), codex (`ensureDir('.codex/skills')` — an empty directory a `Map` cannot express — plus `preserveCodexAgentModelKeys`), zcode (a stderr notice about no hot-reload). The failure this prevents is on record: 0.5.5 shipped `.agents/skills/trellis-start/SKILL.md` from `configureCodex` with no matching `collectTemplates` entry (`manifests/0.5.7.json`).
- **Also missing, and needed alongside it**: the *reverse* parity oracle now in `platforms.test.ts` — configure must write no file `collectTemplates` doesn't describe, must create no empty dir not named in `CONFIGURE_ONLY_EMPTY_DIRS`, must be idempotent, and must agree byte-for-byte under `setResolvedPythonCommand("python")` (a write site that skips the rewrite is invisible on macOS/Linux). Plus the two named exemptions and the known, deliberately-unfixed consequence of the statusline one: init records `.claude/hooks/statusline.py` in `.template-hashes.json`, `pruneOrphanManifestKeys` then drops it as an orphan, so an opted-in user's statusline is frozen after their first `trellis update` and left behind by `trellis uninstall`.

### M5. Provenance-comment convention for session env var names

- **Belongs in**: `cli/backend/script-conventions.md` (under `common/active_task.py`), with a pointer from `platform-integration.md`'s Active Task Resolution section and from the Step-6 new-platform checklist.
- **Why**: `8ab47a77` deleted 12 of 21 declared names that had never existed on any platform — pattern-guessed as `<PLATFORM>_SESSION_ID`, with table uniformity as their only "evidence." The rule that came out of it is written **only** as a code comment (`active_task.py:59-64`) and will be lost the next time someone adds a platform from the spec. The convention: every name in `_ENV_SESSION_KEYS` / `_ENV_CONVERSATION_KEYS` / `_ENV_TRANSCRIPT_KEYS` carries its provenance in one of four grades — REAL-verified (with date, version, and where observed), REAL-but-hook-scope-only (set for hook processes, absent from the shell child — a distinction that decides whether `task.py` can ever see it), UNVERIFIED-with-the-exact-probe-that-would-settle-it (kept because absence of evidence is not evidence of absence, and deleting a live name breaks a platform silently), and unchecked (the transcript table, which the audit never covered — do not infer real *or* fake from that work). A platform with no verified name belongs in no table; it resolves through `TRELLIS_CONTEXT_ID` or its hook/plugin bridge. Do not add a name by analogy with a neighbour.

### M6. The SessionStart update reminder rides `<first-reply-notice>`

- **Belongs in**: `cli/backend/platform-integration.md` "Adaptive First-Reply Notice" contracts (`:1543`), plus the advisory-check section in `cli/backend/script-conventions.md:183`.
- **Why**: `c5465d04` added a channel that changes user-visible output and has a byte-identity guarantee. Contract: `get_update_hint(repo_root, context_key)` is public and called from the SessionStart hook; when it returns a hint, one line is inserted between the notice head and tail (`Also relay this Trellis maintenance notice on its own line in that same reply: …`); when it returns `None`, the notice is **byte-identical** to the plain constant — no empty block, no placeholder line. Rationale: `<first-reply-notice>` is the payload's only "becomes spoken output" channel; anywhere else the reminder stays model context nobody reads (this repo sat 10 versions behind). The `context_key` is passed in rather than re-resolved so the once-per-session marker keys on the session, not on `TERM_SESSION_ID` (a terminal window — which would mute the reminder for every later session in it). The whole path is best-effort: a missing scripts dir, import error, or version-probe failure leaves the payload untouched. Scope: shared hook only — Codex's own `session-start.py`, the OpenCode plugin, and the Pi extension build their own payloads and do not carry it.

### M7. `CLAUDE_ENV_FILE` append is deduped on the last matching export

- **Belongs in**: `cli/backend/script-conventions.md`, near the `TRELLIS_CONTEXT_ID` discussion at `:352-368` (which currently states the append rule with no bound).
- **Why**: The spec says "Trellis must append `export TRELLIS_CONTEXT_ID=<context-key>` there" with no dedup condition. Unbounded, that produced 3 933 lines for 27 distinct values on a maintainer machine, in a **user-owned** file the shell sources for every command. The dedup rule is specifically *last*-line, not "appears anywhere": shell applies later assignments over earlier ones, so an A→B→A switch must re-append or the shell stays on B. Non-UTF-8 bytes in a user env file must be read with `errors="replace"` — a `UnicodeDecodeError` is a `ValueError`, not an `OSError`, and would escape the caller's non-fatal guard (`session-start.py:302-319`). Test coverage exists (`regression.test.ts` `[env-file-dedup]` ×3).

### M8. `test/setup.ts` scrub list — extend rule needs a second trigger

- **Belongs in**: `cli/unit-test/conventions.md:29-40` (update the existing section).
- **Why**: The current "when to extend" trigger is "any env var that production resolvers **honor as a user override**." `CLAUDE_ENV_FILE` is not an override — the hook **writes to it**, and a dev running the suite inside a Claude Code session wrote fixture keys (`claude_session-a` and friends) into their own real shell setup file. The `*_PROJECT_DIR` family is a third category again: `session-start.py` prefers them over JSON cwd, so the hook reads the *real* repo instead of the test tmpdir. Three distinct reasons, one list, and the spec names only one.

---

## Section 3 — Checked and found still correct (where drift was plausible)

Recording these so the next audit doesn't re-verify them.

| Claim | Location | Verified against |
|---|---|---|
| `.agents/skills/` must use `resolvePlaceholdersNeutral()`; per-platform skill roots use `resolvePlaceholders()` | `platform-integration.md:142-173`, `configurator-shared.md:39/133` | `codex.ts:180` uses `resolveAllAsSkillsNeutral`; `shared.ts:194-232` intact. Survived the convergence untouched. |
| `start.md` filtered only on `agentCapable && hasHooks`; Pi is the one approved exception | `configurator-shared.md:51/136`, `platform-integration.md:952-956` | `shared.ts:391-399` `filterCommands` unchanged; two-flag condition intact. |
| Pull-based prelude helpers (`buildPullBasedPrelude`, `detectSubAgentType`, `applyPullBasedPreludeMarkdown/Toml`, research exempt) | `configurator-shared.md:77-91` | All present at `shared.ts:615-733, 808-819`. Untouched by the convergence. |
| Copilot frontmatter normalization (`normalizeCopilotMarkdownAgents`, `mapLegacyToolToCopilot`) | `configurator-shared.md:93-97` | `shared.ts:735-806` intact. |
| Placeholder substitution table (8 rows) and the "add a placeholder in 3 places" rule | `configurator-shared.md:105-119` | `shared.ts:106-128` regex constants and both renderers match the table exactly. |
| `resolveSkills` returns exactly 5 single-file workflow skills, named correctly | `configurator-shared.md:55` | `ls src/templates/common/skills/` → before-dev, brainstorm, break-loop, check, update-spec. |
| Cursor gets **no** `inject-workflow-state.py` (⚠️ Not supported row) | `platform-integration.md:1788` | `SHARED_HOOKS_BY_PLATFORM.cursor` = session-start + inject-shell-session-context + inject-subagent-context. Still correct after the shell-ticket generalization. |
| Codex ships no `session-start.py` from shared-hooks (bundles its own) | `platform-integration.md:1465-1467`, `shared-hooks/index.ts` comment | `SHARED_HOOKS_BY_PLATFORM.codex` = inject-workflow-state + inject-subagent-context only. ✔ |
| Skip-keyword scope excludes `inject-shell-session-context.py` | `platform-integration.md:1728-1729` | Unchanged by `2e90b149`; the hook gained no keyword handling. |
| `common.paths.get_current_task()` / `_abs()` / `_source()` | `platform-integration.md:369` | `.trellis/scripts/common/paths.py:254/275/297`. ✔ |
| `createTemplateReader()` / `listMdAgents()` / `listJsonAgents()` | `platform-integration.md:14/64/180` | `templates/template-utils.ts`, used by droid/cursor/zcode/gemini/kiro. ✔ |
| `getTrellisSourcePath` / `readTrellisFile` / `copyTrellisDir` | `directory-structure.md:162-172` | `templates/extract.ts:26/77`, `configurators/workflow.ts:5`. ✔ — the extract-layer half of `directory-structure.md` survived even though the configurator half (§A) did not. |
| Codex `preserveCodexAgentModelKeys` runs on both `configureCodex()` and the collect path | `platform-integration.md:511-524` | `codex.ts:198-201` (configure) — still true; update.ts runs it over its own rendered map. The `renderTemplateMap`-before-preserve ordering added today is new and worth a sentence, but the stated contract holds. |
| `.codex/skills/<custom>/` is user-owned and must survive orphan pruning | `migrations.md:207` | Now *more* true — the directory holds only user content after `57ea914b`. |
| `code-reuse-thinking-guide.md` template-sync convention ("must stay identical", rsync) | `code-reuse-thinking-guide.md:217-223` | Matches the new parity test. This is the spec that was right all along. |
| `cross-platform-thinking-guide.md` shell-dialect-aware env prefix rule (§4 Rule 2) | `:217-240` | Unchanged by today's work; still matches `opencode/lib/trellis-context.js`. |
| `cross-platform-thinking-guide.md` `toPosix` boundary rule | `:122-165` | Still enforced — `claude.ts:88` and `opencode.ts:65` both `toPosix` at the map-key boundary. Note the new `writeTemplateMap` splits on `/` (`shared.ts:560`), which *depends* on this rule; the guide's rule is now load-bearing for the write path too, which it doesn't say. |

**Also checked, zero spec hits, nothing to fix**: `getAllCodexSkills`, `SkillTemplate` (the codex one), `listDirectories` (the codex one), `_get_update_hint`, `DIR_CURSOR_SHELL`, `_lookup_cursor_shell_ticket_context_key`, `writeCommands`.

---

## Caveats / Not determinable from reading alone

- **`quality-guidelines.md` and `logging-guidelines.md`** were scanned for platform/configurator claims only. Their code-quality content was not audited against the diff — nothing in today's changes obviously touches it, but I did not read all 1 084 lines of `quality-guidelines.md` line by line.
- **`commands-channel.md` (1 283 lines) and `commands-mem.md` (1 131 lines)** were grepped for every symbol in the audit list and for `configurator`/`collectTemplates`/session-env terms; no hits beyond `commands-mem.md:33/543` (which correctly say mem does *not* depend on configurators). I did not read them end to end — they are orthogonal subsystems.
- **`docs-site/**` (7 files)** were grepped for platform counts, configurator symbols, and session env names. Only `style-guide.md:458-468/535` (platform-count sourcing) and `sync-on-change.md:114/203` came up; both are process rules about *how* to derive counts, and both remain valid. Whether the published docs site currently states a wrong count is out of scope for a `.trellis/spec/` audit.
- **Whether `OPENCODE_RUN_ID` still resolves end-to-end on a live OpenCode TUI** cannot be determined by reading: the Python table no longer lists it, the JS plugin still does. Confirming which path actually fires needs a running OpenCode.
- **Whether `KIRO_SESSION_ID` / `COPILOT_SESSION_ID` exist** is explicitly unresolved in the code itself (marked UNVERIFIED with the settling probe). Any spec text written about them must carry the same hedge — do not let a spec rewrite launder an unverified name into a stated fact.
- **`platform-integration.md:463`'s "byte-identical" rule vs. the new test**: the test covers `.py` files only. Whether non-`.py` files under the two trees (e.g. `workflow.md`, `config.yaml`, `gitignore.txt`) are also required to be identical is not asserted anywhere and I could not determine the intent from the code. Worth resolving before writing the M1 contract.

---

## Counts

| Severity | Count |
|---|---|
| **W** (wrong-and-misleading) | 34 |
| **S** (merely-stale) | 21 |
| **Total** | 55 |
| Missing contracts | 8 |
| Verified-still-correct | 16 + 7 zero-hit symbols |

By origin: **31 newly falsified** by today's commits/working tree, **24 pre-existing** and surfaced by this sweep.

By file:

| File | W | S |
|---|---:|---:|
| `cli/backend/platform-integration.md` | 20 | 12 |
| `cli/backend/configurator-shared.md` | 8 | 3 |
| `cli/backend/script-conventions.md` | 6 | 1 |
| `cli/backend/directory-structure.md` | 1 | 1 |
| `cli/backend/filesystem-safety.md` | 1 | 1 |
| `cli/unit-test/conventions.md` | 1 | 1 |
| `guides/cross-platform-thinking-guide.md` | 0 | 2 |
| `cli/backend/quality-guidelines.md` | 0 | 1 |
| `cli/backend/commands-uninstall.md` | 0 | 1 |
