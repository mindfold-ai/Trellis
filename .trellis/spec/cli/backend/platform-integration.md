# Platform Integration Guide

How to add support for a new AI CLI platform (like Claude Code, Cursor, Gemini CLI, OpenCode, Codex, Kilo, Kiro, Qoder, CodeBuddy, Copilot, Droid, Pi, Devin, Antigravity).

---

## Architecture

Platform support uses a **centralized registry pattern** (similar to Turborepo's package manager support):

- **Data registry**: `src/types/ai-tools.ts` — `AI_TOOLS` record with all platform metadata
- **Function registry**: `src/configurators/index.ts` — `PLATFORM_FUNCTIONS` with configure/collectTemplates per platform
- **Shared configurator utilities**: `src/configurators/shared.ts` — `resolvePlaceholders()`, `writeSkills()`, `writeAgents()`, `writeSharedHooks()`, `resolveAllAsSkills()`, `resolveCommands()`, `resolveSkills()`, `wrapWithSkillFrontmatter()`
- **Shared template utilities**: `src/templates/template-utils.ts` — `createTemplateReader()` factory that eliminates boilerplate across platform template modules
- **Shared hooks**: `src/templates/shared-hooks/` — platform-independent Python hook scripts (session-start, inject-workflow-state, inject-subagent-context, inject-shell-session-context) written as-is to platform hook directories according to the capability table. Claude Code `statusLine` is not installed by default.
- **Common templates**: `src/templates/common/` — single source of truth for commands (start, finish-work), single-file workflow skills (before-dev, brainstorm, check, break-loop, update-spec), and multi-file bundled skills (trellis-meta) with `{{placeholder}}` resolution per platform
- **Shared utilities**: `src/utils/compare-versions.ts` — `compareVersions()` with full prerelease support (used by cli, update, migrations)
- **Derived helpers**: `ALL_MANAGED_DIRS`, `getConfiguredPlatforms()`, etc. — consumed by update, init, hash tracking

All lists (backup dirs, template dirs, platform detection, cleanup whitelist) are **derived from the registry automatically**. No scattered hardcoded lists.

---

## Checklist: Adding a New Platform

When adding a new platform `{platform}`, update the following:

### Step 1: Type Definitions (data registry)

| File                    | Change                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/types/ai-tools.ts` | Add to `AITool` union type                                                                              |
| `src/types/ai-tools.ts` | Add to `CliFlag` union type                                                                             |
| `src/types/ai-tools.ts` | Add to `TemplateDir` union type                                                                         |
| `src/types/ai-tools.ts` | Add entry to `AI_TOOLS` record (name, configDir, cliFlag, defaultChecked, hasPythonHooks, templateDirs) |

**This single entry automatically propagates to**: `BACKUP_DIRS`, `TEMPLATE_DIRS`, `getConfiguredPlatforms()`, `cleanupEmptyDirs()`, `initializeHashes()`, init `TOOLS[]` prompt, Windows detection.

### Step 2: CLI Flag

| File                   | Change                                                |
| ---------------------- | ----------------------------------------------------- |
| `src/cli/index.ts`     | Add `--{platform}` option                             |
| `src/commands/init.ts` | Add `{platform}?: boolean` to `InitOptions` interface |

> Note: Commander.js options and TypeScript interfaces require static declarations — cannot be derived from registry. A compile-time assertion `_AssertCliFlagsInOptions` in `init.ts` will catch missing `InitOptions` fields — you'll get a build error if `CliFlag` has a value not present in `InitOptions`.

### Step 3: Configurator (function registry)

| File                              | Change                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `src/configurators/{platform}.ts` | Create new configurator (copy from existing, export `configure{Platform}`)         |
| `src/configurators/index.ts`      | Add entry to `PLATFORM_FUNCTIONS` with `configure` and optional `collectTemplates` |

### Step 4: Templates

> **Key concept**: Most platforms now derive their content from `src/templates/common/` (commands + skills) via `resolvePlaceholders()` in `configurators/shared.ts`. Platform-specific template directories only contain **agents**, **settings/hooks config**, and platform-specific overrides. The `createTemplateReader()` factory from `src/templates/template-utils.ts` eliminates boilerplate in platform `index.ts` files.

**Standard with shared hooks** (Qoder, CodeBuddy, Droid, Cursor, Gemini, Trae):

| Directory                                                | Contents                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/templates/{platform}/`                              | Root directory                                                          |
| `src/templates/{platform}/index.ts`                      | Uses `createTemplateReader(import.meta.url)` — exports agents, settings |
| `src/templates/{platform}/agents/`                       | Agent definitions (`.md` files — implement, check, research)            |
| `src/templates/{platform}/settings.json` or `hooks.json` | Platform settings / hook config (may use `{{PYTHON_CMD}}` placeholder)  |

> Note: These platforms use `writeSharedHooks()` from `shared.ts` to copy platform-independent hook scripts from `src/templates/shared-hooks/` into each platform's hooks directory. Commands and skills come from `src/templates/common/` via `resolveCommands()` / `resolveSkills()` / `resolveAllAsSkills()`. The `createTemplateReader()` factory provides `listMdAgents()`, `getSettings()`, etc. without per-platform boilerplate.
>
> Trae follows this shared-hook template pattern but writes `.trae/hooks.json`, `.trae/commands/trellis-*.md` with command frontmatter, `.trae/skills/`, `.trae/agents/`, and `.trae/hooks/`. Its main session uses `SessionStart` / `UserPromptSubmit` hooks; sub-agent context remains class-2 pull-based because Trae does not expose a Trellis-supported sub-agent prompt mutation surface.

**Claude Code pattern** (full hooks + agents + settings):

| Directory                            | Contents                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `src/templates/claude/`              | Root directory                                               |
| `src/templates/claude/index.ts`      | Export functions for agents, hooks, settings                 |
| `src/templates/claude/agents/`       | Agent definitions (`.md` files — implement, check, research) |
| `src/templates/claude/hooks/`        | Claude-specific hook scripts (`.py` files)                   |
| `src/templates/claude/settings.json` | Claude settings (uses `{{PYTHON_CMD}}` placeholder)          |

> Note: Claude Code is the reference platform. It has its own hooks directory (not shared-hooks) because Claude hooks have platform-specific integration points. Commands come from `src/templates/common/commands/`.

**JS plugin pattern** (OpenCode):

| Directory                                    | Contents                     |
| -------------------------------------------- | ---------------------------- |
| `src/templates/{platform}/`                  | Root directory               |
| `src/templates/{platform}/commands/trellis/` | Slash commands (`.md` files) |
| `src/templates/{platform}/plugin/`           | JS plugin files              |
| `src/templates/{platform}/lib/`              | JS library files             |
| `src/templates/{platform}/package.json`      | Plugin dependencies          |

> Note: OpenCode uses JS plugins instead of Python hooks, has no `index.ts` template module, and has no `collectTemplates` — so `trellis update` does not track OpenCode template files. If a new platform uses JS plugins, follow this pattern.

**TypeScript extension pattern** (Pi Agent):

| Directory                                                  | Contents                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/templates/{platform}/`                                | Root directory                                                                            |
| `src/templates/{platform}/index.ts`                        | Uses `createTemplateReader(import.meta.url)` — exports agents, settings, extension source |
| `src/templates/{platform}/agents/`                         | Agent definitions (`.md` files — implement, check, research)                              |
| `src/templates/{platform}/extensions/trellis/index.ts.txt` | Project-local extension source written to `.pi/extensions/trellis/index.ts`               |
| `src/templates/{platform}/settings.json`                   | Platform settings that enable extension, skills, and prompts                              |

> Note: Pi Agent uses project-local TypeScript extensions instead of Trellis Python hooks. Keep generated hooks under `.pi/extensions/`, write prompt templates under `.pi/prompts/trellis-*.md`, and do not copy `shared-hooks/*.py` into `.pi/`. Agent Skills write to the shared `.agents/skills/` root (same path Codex and Gemini CLI use) via `resolveSkillsNeutral()`, not a private `.pi/skills/` root — Pi discovers `.agents/skills/` natively, and keeping a separate `.pi/skills/` copy caused Pi to see every skill twice when Codex or Gemini was also installed (#447). `configDir` stays `.pi`; `supportsAgentSkills: true` adds `.agents/skills` to Pi's managed paths, same as Codex/Gemini. A rename-dir migration (`0.6.8.json`) relocates any pre-#447 `.pi/skills/` install into `.agents/skills/` on `trellis update`. For the nested Pi launcher contract, see "Scenario: Pi Sub-Agent Launcher".
>
> Pi is an explicit `trellis-start` exception: `session_start` is notify-only and cannot mutate model-visible context, so the configurator must keep `.pi/prompts/trellis-start.md` as a manual bootstrap fallback while the extension injects startup/full Trellis context through `before_agent_start.systemPrompt` and persists compact workflow/session context through a hidden custom message returned from `before_agent_start`.
>
> Project-local package isolation rule: when Trellis enables Pi for a project, `.pi/settings.json` does not include `npm:pi-subagents` in `packages` — Trellis's own tool is named `trellis_subagent`, so no name collision with community `subagent` tool exists. Users may install community sub-agent packages (nicobailon/pi-subagents or tintinweb/pi-subagents) independently.

**Skills pattern** (Codex, Kiro):

| Directory                                | Contents                                                      |
| ---------------------------------------- | ------------------------------------------------------------- |
| `src/templates/{platform}/`              | Root directory                                                |
| `src/templates/{platform}/index.ts`      | Uses `createTemplateReader(import.meta.url)` — exports agents |
| `src/templates/{platform}/agents/`       | Agent definitions (platform-specific format)                  |
| `src/templates/{platform}/settings.json` | Platform settings (optional)                                  |

> Note: Codex/Kiro use `resolveAllAsSkills()` from `shared.ts` to generate all templates as SKILL.md files with YAML frontmatter. Skills are written via `writeSkills()`.
>
> **Qoder is a hybrid** — it has native Custom Commands (`.qoder/commands/{name}.md`) with required YAML frontmatter (`name` + `description`, flat layout per Qoder CLI docs), so session-boundary commands (`finish-work`, `continue`) go there via `resolveCommands()` + `wrapWithCommandFrontmatter()`, while the auto-triggered skills from `common/skills/` stay as `.qoder/skills/` via `resolveSkills()`. Use the `COMMAND_DESCRIPTIONS` registry in `shared.ts` (separate from `SKILL_DESCRIPTIONS`) for the short palette blurbs — command descriptions are one-line imperatives aimed at the user; skill descriptions are long prose aimed at the AI matcher.
>
> **Codex has a two-layer directory model:**
>
> | Layer                     | Install Path      | Template Source                           | Purpose                                                                           |
> | ------------------------- | ----------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
> | Shared skills             | `.agents/skills/` | Generated from `common/` templates        | Cross-platform skills (agentskills.io standard)                                   |
> | Codex config/agents/hooks | `.codex/`         | `src/templates/codex/{agents,hooks.json}` | Config, custom agents, UserPromptSubmit hook config, and compatibility hook files |
>
> **Key rules:**
>
> - Shared skills in `.agents/skills/` must NOT contain platform-specific references (no `--platform codex`, no `codex exec`)
> - Agent TOML format: `name` + `description` + `developer_instructions` + optional `sandbox_mode` (NOT `[sandbox_read_only]` + `prompt`)
> - Codex hooks require `features.hooks = true` in user config (Codex 0.129+; older versions accept legacy `codex_hooks = true`); 0.129+ also gates per-hook activation behind a one-time `/hooks` TUI review
> - Platform detection uses `.codex/` only — `.agents/skills/` alone does NOT trigger codex detection
> - `configDir` is `".codex"`, with `supportsAgentSkills: true` to auto-include `.agents/skills` in managed paths
>
> **Kimi Code is a hybrid skills platform** — workflow/bundled skills go to the shared `.agents/skills/` root via `resolveSkillsNeutral()` (byte-identical to Codex/Gemini/Pi; Kimi discovers that root natively), while the session-boundary commands (`start` / `continue` / `finish-work`, invoked as `/skill:trellis-<name>`) and the Trellis agent prompts are written as Kimi-private skills under `.kimi-code/skills/<name>/SKILL.md`. Kimi has no project-level hooks/settings file (hooks are user-level `~/.kimi-code/config.toml` only) and no custom sub-agent definitions (built-in coder/explore/plan only), so no hooks, settings, extension, or `agents/` directory is written, and the agent prompts ship as skills with the pull-based prelude on implement/check (class-2).

#### Rule: `.agents/skills/` writes use `resolvePlaceholdersNeutral()`

`.agents/skills/` is a **shared destination**: multiple configurators (Codex, Gemini CLI 0.40+ via the workspace alias, future agentskills.io consumers) all write into the same path. Per-platform `{{CMD_REF:name}}` resolution (`$name` for Codex, `/trellis:name` for Gemini, etc.) makes the same `<skill>/SKILL.md` differ byte-for-byte depending on which configurator ran last → "last-writer-wins" content collisions and `.template-hashes.json` churn.

**Rule**: Anything written under `.agents/skills/` MUST be rendered via `resolvePlaceholdersNeutral()` (in `configurators/shared.ts`), which substitutes `` `name` (Trellis command) `` for `{{CMD_REF:name}}` instead of a platform prefix. All other placeholders (`{{CLI_FLAG}}`, `{{EXECUTOR_AI}}`, `{{USER_ACTION_LABEL}}`, conditionals, `{{PYTHON_CMD}}`) still resolve from the platform context — those don't appear in the auto-triggered skill templates from `common/skills/`, so the rendered output stays identical across writers.

Per-platform skill directories (`.claude/skills/`, `.cursor/skills/`, `.qoder/skills/`, etc.) keep using `resolvePlaceholders()` — `{{CMD_REF}}` resolves to the platform-correct slash form there, because no other configurator writes those paths.

**Command-as-skill fallback files under `.agents/skills/`** (currently `trellis-start/SKILL.md`, `trellis-continue/SKILL.md`, and `trellis-finish-work/SKILL.md`, written via `resolveAllAsSkillsNeutral()` by Codex) may use per-platform `{{CLI_FLAG}}` / `{{PYTHON_CMD}}` because they are user-invoked fallback entrypoints. They still go through the neutral helper to keep `{{CMD_REF}}` neutralized for consistency with the surrounding shared skills. Platforms with their own private command and skill roots should not write `.agents/skills/`; for example, ZCode writes workflow/bundled skills under `.zcode/skills/` and keeps slash commands under `.zcode/commands/trellis/*.md`.

**Wrong**:

```typescript
// Codex configurator
files.set(".agents/skills/check/SKILL.md", resolvePlaceholders(tmpl, codexCtx));
// Gemini configurator (later)
files.set(
  ".agents/skills/check/SKILL.md",
  resolvePlaceholders(tmpl, geminiCtx),
);
// → byte-different SKILL.md from the same template; whoever runs last wins
```

**Correct**:

```typescript
files.set(
  ".agents/skills/check/SKILL.md",
  resolvePlaceholdersNeutral(tmpl, ctx),
);
// → byte-identical regardless of which configurator wrote it
```

**Kiro JSON agent pattern** (Kiro):

| Directory                     | Contents                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `src/templates/kiro/`         | Root directory                                                                       |
| `src/templates/kiro/index.ts` | Uses `createTemplateReader(import.meta.url)` — exports agents via `listJsonAgents()` |
| `src/templates/kiro/agents/`  | Agent definitions (`.json` files)                                                    |

> Note: Kiro is unique in using JSON format for agent definitions (not Markdown). The `createTemplateReader()` factory provides `listJsonAgents()` specifically for this. Skills are generated from `common/` templates via `resolveAllAsSkills()`.

**Workflows pattern** (Kilo):

| Directory               | Contents                                           |
| ----------------------- | -------------------------------------------------- |
| (no template directory) | Kilo generates from `common/` templates at runtime |

> Note: Kilo uses `resolveCommands()` + `resolveSkills()` to generate workflows and skills. No physical template files needed.

**Workflows pattern** (Antigravity):

| Directory               | Contents                                         |
| ----------------------- | ------------------------------------------------ |
| (no template directory) | Antigravity derives from Codex skills at runtime |

> Note: Antigravity has no physical template files — workflow content is **derived from Codex skills at runtime** via `adaptSkillContentToWorkflow()`. The config dir is `.agent/workflows` (not `.agent/`). Workflows are triggered with `/workflow-name` slash commands. When adding a new Codex skill, Antigravity automatically picks it up.

**Copilot pattern** (prompts + hooks):

| Directory                          | Contents                            |
| ---------------------------------- | ----------------------------------- |
| `src/templates/copilot/`           | Root directory                      |
| `src/templates/copilot/index.ts`   | Export functions for prompts, hooks |
| `src/templates/copilot/prompts/`   | Prompt files (`.prompt.md`)         |
| `src/templates/copilot/hooks/`     | Hook scripts (`.py` files)          |
| `src/templates/copilot/hooks.json` | Hooks configuration                 |

> Note: Copilot uses `.prompt.md` format for commands (not plain `.md`). Hooks use `hooks.json` (not `settings.json`).
>
> SessionStart status: Microsoft's [VS Code Agent hooks docs](https://code.visualstudio.com/docs/copilot/customization/hooks) (preview, documented since VS Code 1.110 in Feb 2026) define `SessionStart.hookSpecificOutput.additionalContext` as the field that injects context into the agent's conversation. Trellis's `copilot/hooks/session-start.py` emits this spec-compliant shape. Whether Copilot consumes `additionalContext` depends on the user's installed VS Code and Copilot versions, which is outside Trellis's control — do not re-introduce a hardcoded `systemMessage` claiming Copilot ignores hook output (see GitHub #248). Copilot remains a class-2 (pull-based) platform for sub-agent context delivery until end-to-end consumption is verified.

**Droid pattern** (droids + settings):

| Directory                           | Contents                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `src/templates/droid/`              | Root directory                                                          |
| `src/templates/droid/index.ts`      | Uses `createTemplateReader(import.meta.url)` — exports droids, settings |
| `src/templates/droid/droids/`       | Droid definitions (`.md` files — implement, check, research)            |
| `src/templates/droid/settings.json` | Droid settings                                                          |

> Note: Droid uses "droids" terminology instead of "agents" but follows the same pattern. Uses `writeAgents()` with the droids directory.

**Devin pattern** (no template directory):

| Directory               | Contents                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| (no template directory) | Devin generates from `common/` templates + shared hooks at runtime |

> Note: Devin uses `resolveCommands()` for workflows and `resolveSkills()` for auto-triggered skills. Shared hooks are written via `writeSharedHooks()`. No platform-specific template files needed.

**Required commands/skills**: All platforms must include the following (adapted to each platform's format). Content comes from `src/templates/common/`:

| Type    | Name          | Purpose                                                    | Required |
| ------- | ------------- | ---------------------------------------------------------- | -------- |
| Command | `start`       | Session initialization                                     | Yes      |
| Command | `finish-work` | Pre-commit checklist                                       | Yes      |
| Skill   | `before-dev`  | Read development guidelines (auto-discovers package specs) | Yes      |
| Skill   | `brainstorm`  | Requirements discovery                                     | Yes      |
| Skill   | `check`       | Check code quality (auto-discovers relevant specs)         | Yes      |
| Skill   | `break-loop`  | Post-debug analysis                                        | Yes      |
| Skill   | `update-spec` | Update code-spec docs                                      | Yes      |

> **Rule**: When a new command/single-file workflow skill is added, it is added to `src/templates/common/commands/` or `src/templates/common/skills/` — ALL platforms pick it up automatically via `resolveCommands()` / `resolveSkills()` / `resolveAllAsSkills()`. Check `src/templates/common/` as the reference source.

**Bundled built-in skills**: Multi-file skills with references/assets live under `src/templates/common/bundled-skills/<skill-name>/` and are installed through the same platform skill roots as workflow skills.

#### Scenario: Multi-file bundled skills

##### 1. Scope / Trigger

Use bundled skills when a built-in skill needs files beyond `SKILL.md`, such as `references/`, examples, or assets. Do not flatten large reference trees into `src/templates/common/skills/*.md`; single-file workflow skills stay there, while multi-file built-ins use `src/templates/common/bundled-skills/<skill-name>/`.

##### 2. Signatures

| Helper                                                    | Contract                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getBundledSkillTemplates()`                              | Recursively reads `bundled-skills/*/` and returns POSIX relative file paths under each skill directory |
| `resolveBundledSkills(ctx)`                               | Resolves placeholders without adding frontmatter; bundled `SKILL.md` already owns frontmatter          |
| `writeSkills(skillRoot, skills, bundledSkills)`           | Writes both single-file workflow skills and bundled skill files                                        |
| `collectSkillTemplates(skillRoot, skills, bundledSkills)` | Returns the same skill file set for `collectTemplates()` / update hash tracking                        |

##### 3. Contracts

- Bundled skill source path: `src/templates/common/bundled-skills/<skill-name>/`.
- Bundled skill target path: `<platform-skill-root>/<skill-name>/<relative-file>`.
- `SKILL.md` inside a bundled skill owns its own YAML frontmatter; `wrapWithSkillFrontmatter()` must not be applied to bundled files.
- Relative file paths returned from the common template reader are POSIX-style, stable, and relative to the skill directory.
- `collectTemplates()` must return byte-identical content for every file that `configure*()` writes.

##### 4. Validation & Error Matrix

| Condition                                                            | Expected behavior                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bundled skill directory is missing                                   | Return no bundled skills; single-file workflow skill generation continues |
| Bundled skill has nested references                                  | Preserve the nested relative path under every platform skill root         |
| Bundled `SKILL.md` contains placeholders                             | Resolve placeholders with the platform `TemplateContext`                  |
| Platform writes bundled skill but omits it from `collectTemplates()` | Failing test; update hash tracking would drift                            |
| Bundled file path uses OS-specific separators                        | Normalize to POSIX relative paths before adding to template maps          |

##### 5. Good/Base/Bad Cases

- Good: `trellis-meta` installs as `<platform-skill-root>/trellis-meta/SKILL.md` plus `references/**`, and `collectPlatformTemplates(platform)` returns the same files.
- Base: no bundled skills exist; existing `resolveSkills()` / `resolveAllAsSkills()` behavior remains unchanged.
- Bad: platform-specific configurators copy `trellis-meta` manually, creating a second installer that update hash tracking can miss.

##### 6. Tests Required

- Init integration test proving at least Claude and Codex write `trellis-meta/SKILL.md` plus one reference file.
- Configurator test proving configured files are byte-for-byte equal to `collectPlatformTemplates()` for every platform that writes skills.
- Regression test proving `.trellis/.template-hashes.json` includes bundled skill reference files after init.
- Release smoke test when a changelog or docs page claims the skill is
  bundled: build the CLI, verify the skill appears in `npm pack --dry-run
--json` under `dist/templates/common/bundled-skills/<skill>/`, then run the
  built binary in a fresh temp repository and confirm both generated skill
  files and `.trellis/.template-hashes.json` contain the skill paths.

##### 7. Wrong vs Correct

Wrong:

```typescript
files.set(".claude/skills/trellis-meta/SKILL.md", metaSkillContent);
```

Correct:

```typescript
await writeSkills(skillRoot, resolveSkills(ctx), resolveBundledSkills(ctx));
for (const [filePath, content] of collectSkillTemplates(
  skillRoot,
  skills,
  bundled,
)) {
  files.set(filePath, content);
}
```

**Rule**: Do not add a parallel installer for built-in multi-file skills. If `trellis init` writes a bundled skill file, the platform's `collectTemplates()` path must return the same relative path and byte-identical content so `.trellis/.template-hashes.json` can track it. At minimum, tests must cover one reference file (for example `trellis-meta/references/core/template-pipeline.md`) and the platform-specific install root.

**Release rule**: A bundled skill is not release-ready until it has passed the
source, dist, generated-files, and update-tracking chain:
`src/templates/common/bundled-skills/<skill>/` ->
`dist/templates/common/bundled-skills/<skill>/` -> platform skill roots after
built-binary `trellis init` -> `.trellis/.template-hashes.json` -> built-binary
`trellis update --dry-run` with no pending changes.

### Step 5: Template Extraction

| File                       | Change                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/templates/extract.ts` | Only needed if platform has a physical template directory. Most new platforms generate from `common/` templates and don't need extraction functions |

> Note: Platforms using `createTemplateReader(import.meta.url)` in their `index.ts` handle their own template reading. The `extract.ts` functions (`getTrellisSourcePath()`, `readTrellisFile()`, `copyTrellisDir()`) are primarily for the `.trellis/` workflow files, not platform templates.

### Step 6: Python Scripts (independent runtime)

> **Warning**: `cli_adapter.py` uses if/elif/else chains with NO exhaustive check. New platforms silently fall through to the `else` branch (Claude defaults). You MUST add explicit branches for **every method** listed below.

| File                                                  | Change                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/templates/trellis/scripts/common/cli_adapter.py` | Add to `Platform` literal type, `config_dir_name` property, `detect_platform()`, `get_cli_adapter()` validation |

**cli_adapter.py methods requiring explicit branches** (do NOT rely on `else` fallthrough):

| Method                       | What to decide                    | Example                                          |
| ---------------------------- | --------------------------------- | ------------------------------------------------ |
| `config_dir_name`            | Config directory name             | `".gemini"`, `".agent"`                          |
| `get_trellis_command_path()` | Command file path format          | `.toml` vs `.md`, subdirectory vs flat           |
| `get_non_interactive_env()`  | Non-interactive env var           | `{}` if none, or platform-specific               |
| `build_run_command()`        | CLI command for running agents    | `["gemini", prompt]` or raise ValueError         |
| `build_resume_command()`     | CLI command for resuming sessions | `["gemini", "--resume", id]` or raise ValueError |
| `cli_name`                   | CLI executable name               | `"gemini"`, `"agy"`                              |
| `detect_platform()`          | Directory detection logic         | Check `.gemini/` exists                          |
| `get_commands_path()`        | Command directory structure       | `commands/trellis/` or `workflows/`              |

> Note: Python scripts run in user projects at runtime — they cannot import from the TS registry and maintain their own registry in `cli_adapter.py`.

### Active Task Resolution

Current-task state is session/window scoped. New hook, statusline, plugin,
extension, and sub-agent consumers must call the shared resolver path:

| Runtime                         | Resolver surface                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Python hooks/statusline/scripts | `.trellis/scripts/common/active_task.py`                                                              |
| Existing Python callers         | `common.paths.get_current_task()` / `get_current_task_abs()` / `get_current_task_source()`            |
| OpenCode plugin                 | JS resolver in `lib/trellis-context.js`, mirroring `active_task.py`                                   |
| Pi extension                    | Extension-local resolver using `ctx.sessionManager.getSessionId()` and Bash `tool_call` env injection |

Do not add direct `.trellis/.current-task` reads in hooks, statusline scripts,
sub-agent context injection, or platform plugins. Direct reads reintroduce
multi-window task pollution.

Context-key precedence for hook-capable platforms:

1. `TRELLIS_CONTEXT_ID` environment override for subprocesses.
2. `session_id`, `sessionId`, or `sessionID`.
3. Cursor IDE `conversation_id` / `conversationId` / `conversationID`.
4. `transcript_path` / `transcriptPath` / `transcript` when non-empty.
5. Platform-native session environment variables only when the AI host exports
   them to shell commands, such as `CODEX_SESSION_ID`, `CODEX_THREAD_ID`,
   `CLAUDE_SESSION_ID`, `OPENCODE_RUN_ID`, `CURSOR_SESSION_ID`, or
   `PI_SESSION_ID`.

Cursor IDE may send `transcript_path: null`; this must not prevent session
scoping when `session_id` or `conversation_id` is present. OpenCode uses
`OPENCODE_RUN_ID` when available so plugin context and AI-run Bash commands
share the same runtime file; otherwise it falls back to `sessionID` from plugin
input or event properties. OpenCode TUI builds may not expose `OPENCODE_RUN_ID`
to the Bash tool even though plugin events include `sessionID`; the OpenCode
plugin must therefore inject a shell-aware `TRELLIS_CONTEXT_ID` prefix into Bash
tool commands in `tool.execute.before` when the command does not already set
it: POSIX shells use `export TRELLIS_CONTEXT_ID=<context-key>;`, while Windows
PowerShell uses `$env:TRELLIS_CONTEXT_ID = '<context-key>';`. Do not infer the
shell dialect from `process.platform` alone: on Windows, Git Bash / MSYS2 still
parse POSIX syntax. OpenCode must treat `MSYSTEM`, `MINGW_PREFIX`,
`OSTYPE=msys|mingw|cygwin`, `SHELL=...bash`, or `OPENCODE_GIT_BASH_PATH` as
POSIX-shell signals and keep PowerShell as the Windows default only when no
POSIX-shell signal is present.
Regression tests must cover both families: `win32` with no POSIX-shell signal
emits the PowerShell prefix, while `win32` with each supported POSIX-shell
signal emits the `export` prefix. Existing explicit-assignment dedupe tests
must continue to cover POSIX, `env ... TRELLIS_CONTEXT_ID=...`, and PowerShell
forms.
Cursor must use `beforeShellExecution` as the shell bridge. The hook writes a
short-lived `.trellis/.runtime/cursor-shell/*.json` ticket containing the
`conversation_id`-derived context key for matching `task.py start/current/finish`
commands. `task.py` may consume that ticket only when no native session env
exists and exactly one fresh matching ticket is present.
Pi Agent exposes its real session identity through the extension context, not
through ordinary Bash environment. The generated `.pi/extensions/trellis/index.ts`
extension must read `ctx.sessionManager.getSessionId()`, derive the same
`pi_<session-id>` context key for context injection and sub-agent launches, and
prefix Bash tool calls in `tool_call` with
`export TRELLIS_CONTEXT_ID=<context-key>;` when the command does not already set
one.
Copilot should use
`session_id` / `sessionId` only if the actual payload provides it; otherwise it
has no active task.

`task.py start <task>` has no hook stdin when it is run as a normal shell
command. It can write session-local state only when a context key is available
through `TRELLIS_CONTEXT_ID` or a platform-native environment variable exposed
by the host. Hooks and plugins should pass `TRELLIS_CONTEXT_ID` to subprocesses
they launch. Claude Code is special: SessionStart provides `CLAUDE_ENV_FILE`,
so the shared hook must persist `export TRELLIS_CONTEXT_ID=<context-key>` there
for later Bash tool calls in the same conversation. OpenCode is also special:
there is no env-file bridge, so the JS plugin must prefix Bash tool commands
with a shell-aware `TRELLIS_CONTEXT_ID` assignment using plugin session identity
before execution; on Windows, this must be shell-dialect-aware rather than a
plain `process.platform === "win32"` check. Cursor has no reliable command-env
bridge, so `beforeShellExecution` must create the short-lived shell ticket
described above. Without one of these session signals, `task.py start` must
fail with a clear session identity hint and must not write
`.trellis/.current-task`.
Pi is extension-backed rather than Python-hook-backed: `tool_call` must mutate
`event.input.command` before Bash execution, and the custom `trellis_subagent` tool must
spawn child `pi` processes with `TRELLIS_CONTEXT_ID` in `env`.

Hook, statusline, or plugin output that mentions an active task should include
the source (`session` or `session:<key>`) so cross-window mistakes are visible
while debugging. Statuslines may shorten this to `[session]` to avoid noisy UI.

**Also update `task_store.py` when adding a sub-agent-capable platform**:

| File                                                 | Constant                        | When to update                                                                                                              |
| ---------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/templates/trellis/scripts/common/task_store.py` | `_SUBAGENT_CONFIG_DIRS` (tuple) | Add `.{configDir}/` if the new platform can spawn sub-agents (Class-1 hook-inject, Class-2 pull-based, or extension-backed) |

This tuple is consulted by `cmd_create` to decide whether to seed `implement.jsonl` / `check.jsonl` for the new task. Agent-less platforms (Kilo, Antigravity, Devin) MUST be excluded — they don't consume jsonl.

Same root reason as `cli_adapter.py`: Python scripts run at user-project runtime and can't import from the TS `AI_TOOLS` registry, so they maintain their own parallel registry. When adding/removing sub-agent capability, update both in tandem.

> **Codex-specific CLIAdapter notes:**
>
> - `config_dir_name` returns `".codex"` (not `".agents"`)
> - `get_agent_path` returns `.toml` for codex (not `.md`)
> - `requires_agent_definition_file` is `False` — Codex auto-discovers agents from `.codex/agents/*.toml`, no `--agent` CLI flag
> - `detect_platform` checks `.codex/` existence (not `.agents/skills/`)
> - **CRITICAL**: Template copy (`src/templates/trellis/scripts/`) must be byte-identical to live copy (`.trellis/scripts/`)

### Scenario: Codex Native `SubagentStart` Context Delivery

#### 1. Scope / Trigger

Trigger: Codex has a native sub-agent start hook. Trellis must send only the
dispatched role's task context to a child without letting a stale environment
override the parent session or letting a missing parent borrow another window's
task.

#### 2. Signatures

```python
def resolve_active_task(
    repo_root: Path,
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
    *,
    allow_single_session_fallback: bool = True,
    allow_environment_context: bool = True,
) -> ActiveTask: ...
```

The native hook path calls this resolver with `platform="codex"`,
`allow_single_session_fallback=False`, and
`allow_environment_context=False`. Other callers retain both defaults.

#### 3. Contracts

- Generated `.codex/hooks.json` keeps `UserPromptSubmit` and adds a
  `SubagentStart` matcher for exactly `trellis-implement`, `trellis-check`,
  and `trellis-research`.
- Codex hook input uses parent `session_id`, `agent_type`, and `cwd`. A valid
  result is JSON with
  `hookSpecificOutput.hookEventName="SubagentStart"` and
  `hookSpecificOutput.additionalContext` beginning with
  `<!-- trellis-hook-injected -->`.
- Implement/check context order is role JSONL, `prd.md`, optional `design.md`,
  then optional `implement.md`. Research receives the resolved `Active task:`
  path and research-only context; it must not read implement/check manifests.
- Custom Codex role profiles must retain a marker-gated child-side pull path:
  native injection is preferred, while `Active task:` enables degraded loading
  when the hook is untrusted or unavailable.

#### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| recognised role + parent session maps to a live task | emit role-specific `additionalContext` |
| unknown/missing/malformed parent session | exit successfully with no output |
| one unrelated runtime session exists | no output; never use sole-session fallback |
| inherited `TRELLIS_CONTEXT_ID` conflicts with parent session | parent `session_id` wins on this native path |
| stale/missing task, malformed hook JSON, or unexpected error | fail open; Codex still starts the child |
| non-Trellis `agent_type` | no Trellis output |

#### 5. Good / Base / Bad Cases

- Good: a parent session dispatches `trellis-implement`; the child receives
  its curated implementation context and does not dispatch another role.
- Base: project Hook trust is pending; the child reads the dispatch prompt's
  `Active task:` value and follows the marker-absent pull protocol.
- Bad: resolving an unknown native parent through `TRELLIS_CONTEXT_ID` or a
  sole unrelated session. This leaks task context across windows and is
  forbidden.

#### 6. Tests Required

- Parse generated Hook config and assert both event registrations plus the
  narrowed matcher.
- Black-box the shared hook for valid, unknown, malformed, concurrent, and
  non-Trellis subagents; assert the output envelope, marker, ordering, and
  environment-override isolation.
- Cover `auto` default, explicit `inline`, legacy `sub-agent`, and invalid
  configuration across JSONL seeding, effective workflow platform, and the
  Codex workflow-state banner.
- Assert `configureCodex()` and `collectPlatformTemplates("codex")` remain
  byte-equivalent and distribute the shared injector.

#### 7. Wrong vs Correct

**Wrong:** call the ordinary resolver with defaults from `SubagentStart`; its
environment override and single-session compatibility fallback can select a
different parent task.

**Correct:** make the strict native call explicit while preserving the defaults
for legacy shell, hook, and pull-based consumers.

### Step 7: Documentation

| File           | Change                                         |
| -------------- | ---------------------------------------------- |
| `README.md`    | Add platform to supported tools list           |
| `README_CN.md` | Add platform to supported tools list (Chinese) |

### Step 8: Build Scripts

| File                        | Change                                                      |
| --------------------------- | ----------------------------------------------------------- |
| `scripts/copy-templates.js` | No change needed (copies entire `src/templates/` directory) |

### Step 9: Project Config (Optional)

If Trellis project itself should support the new platform:

| Directory                       | Contents                       |
| ------------------------------- | ------------------------------ |
| `.{platform}/`                  | Project's own config directory |
| `.{platform}/commands/trellis/` | Slash commands                 |
| `.{platform}/agents/`           | Agents                         |
| `.{platform}/hooks/`            | Hooks                          |
| `.{platform}/settings.json`     | Settings                       |

### Step 10: Gitignore

| File         | Change                                                    |
| ------------ | --------------------------------------------------------- |
| `.gitignore` | Add local config patterns (e.g., `{platform}.local.json`) |

### Step 11: Tests (MANDATORY)

> **Warning**: Dynamic iteration tests (e.g., `PLATFORM_IDS.forEach`) only verify registry metadata. They do NOT cover platform-specific runtime behavior. You MUST add explicit tests.

| Test File                                | What to Add                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/templates/{platform}.test.ts`      | **NEW FILE**: Verify `getAllCommands()`/`getAllSkills()`/`getAllWorkflows()` returns expected set, content non-empty, format valid                                                                                      |
| `test/configurators/platforms.test.ts`   | Detection test: `getConfiguredPlatforms` finds `.{configDir}`. Configurator test: `configurePlatform` writes expected files, no compiled artifacts                                                                      |
| `test/commands/init.integration.test.ts` | Init test: `init({ {platform}: true })` creates correct directory. Negative assertions: add `.{configDir}` checks to existing platform tests                                                                            |
| `test/templates/extract.test.ts`         | `get{Platform}TemplatePath()` returns existing dir. `get{Platform}SourcePath()` deprecated alias equals template path                                                                                                   |
| `test/regression.test.ts`                | Platform registration: `AI_TOOLS.{platform}` exists with correct `configDir`. cli_adapter: `commonCliAdapter` contains `"{platform}"` and `".{configDir}"`. Update `withTracking` list if `collectTemplates` is defined |

For extension-backed platforms like Pi Agent, add explicit regression coverage that no Python hook files are installed under the platform config directory and that the generated extension exposes the required sub-agent and hook-equivalent event surface.

---

## Scenario: Extension-Backed Platform Support

### 1. Scope / Trigger

Use this pattern when a platform provides project-local JS/TS extension events and custom tools rather than Trellis-compatible Python hooks. Pi Agent is the reference implementation.

### 2. Signatures

TypeScript registry:

```typescript
AI_TOOLS.pi = {
  configDir: ".pi",
  cliFlag: "pi",
  hasPythonHooks: false,
  templateContext: {
    agentCapable: true,
    hasHooks: true,
  },
};
```

Configurator output:

```text
.pi/settings.json
.pi/prompts/trellis-<command>.md
.agents/skills/<skill>/SKILL.md
.pi/agents/trellis-<agent>.md
.pi/extensions/trellis/index.ts
```

Runtime script registry:

```python
Platform = Literal[..., "pi", "zcode"]
_SUBAGENT_CONFIG_DIRS = (..., ".pi", ".zcode")
```

### 3. Contracts

Extension-backed platforms MUST NOT receive `.trellis/templates/shared-hooks/*.py` under their config directory. Their hook-equivalent behavior belongs in generated extension source.

For Pi Agent:

| Trellis concept                    | Pi surface                                                                                                                                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session start                      | `session_start` extension event (notify-only; context-key is established but no prompt mutation)                                                                                                                                                                      |
| Per-turn workflow-state breadcrumb | `before_agent_start.message` hidden custom message — persists cached `<workflow-state>` + `<session-overview>` from `getTurnCtx()` without showing it in the UI; skipped when identical to the last persisted runtime context (dedup)                                |
| Startup context                    | `before_agent_start` builds compact SessionStart-equivalent context (`<session-context>`, adaptive `<first-reply-notice>`, `<session-overview>`, `<trellis-workflow>`, `<ready>`) once per context key, memoizes it, and contributes the identical bytes to `systemPrompt` on every turn |
| Per-agent-invocation context       | `before_agent_start.systemPrompt` carries a per-context-key snapshot of task context (PRD + jsonl) taken on first use; later on-disk task changes are delivered through `before_agent_start.message` as `<trellis-task-context-update>` persisted messages           |
| Per-Bash-tool session identity     | `tool_call` extension event; mutates `event.input.command` in place via `injectTrellisContextIntoBash()` to prefix `export TRELLIS_CONTEXT_ID=<context-key>;`                                                                                                         |
| Sub-agent dispatch                 | custom `trellis_subagent` tool with `promptSnippet`/`promptGuidelines = SUBAGENT_DISPATCH_PROTOCOL`; resolves the Pi CLI JS entrypoint when possible, runs `--mode text -p --no-session`, sends the delegated prompt through stdin, and forwards `TRELLIS_CONTEXT_ID` |

The compact model-visible context injection point is `before_agent_start.message`; it uses `TurnContextCache` so the same request path does not re-spawn the default `get_context.py` session-context call unnecessarily. Pi does not register a Trellis `input` handler for runtime context injection, so user text is not rewritten. The existing Pi `context` event may establish the context key, but it must not append Trellis runtime messages because request-local messages are not persisted and can break provider prefix cache. See "Class-3 injection points (Pi extension)" below the modes table for the runtime contract.

Cache-stability invariant: everything the extension contributes to `systemPrompt` must be byte-identical across every turn of a session (provider prefix caches invalidate from byte 0 on any system prompt change). Startup context and task context are therefore memoized per context key; anything volatile (workflow breadcrumb, session overview, task-doc changes) is delivered exclusively through persisted `before_agent_start.message` custom messages, and only when its content differs from the last persisted copy.

If `agentCapable` is true, `task.py create` must seed `implement.jsonl` / `check.jsonl`, and generated sub-agent definitions or extension code must consume those files.

### 4. Validation & Error Matrix

| Condition                                                                     | Behavior                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `hasHooks: true` and `hasPythonHooks: false`                                  | Init does not run Windows Python hook detection for the platform                        |
| Platform can spawn Trellis sub-agents                                         | Add config dir to `_SUBAGENT_CONFIG_DIRS`                                               |
| Platform cannot consume JSONL context                                         | Keep it out of `_SUBAGENT_CONFIG_DIRS` even if it has commands/skills                   |
| Generated extension source is tracked                                         | `collectTemplates()` must include the same path written by `configure{Platform}`        |
| Extension path contains `spec/` in a skill name such as `trellis-update-spec` | Template hash exclusion must not drop it; only `.trellis/spec/` is user-owned spec data |
| Platform uses extension hooks                                                 | Do not copy Python hook files into the platform config dir                              |

### 5. Good / Base / Bad Cases

Good:

```text
.pi/extensions/trellis/index.ts
.pi/agents/trellis-implement.md
.agents/skills/update-spec/SKILL.md
```

Base:

```text
.pi/prompts/trellis-continue.md
.pi/settings.json
```

Bad:

```text
.pi/hooks/session-start.py
.pi/hooks/inject-subagent-context.py
```

### 6. Tests Required

Add or update tests that assert:

- `AI_TOOLS.<platform>` has the expected `configDir`, `cliFlag`, `agentCapable`, `hasHooks`, and `hasPythonHooks`.
- `configurePlatform("<platform>")` writes every generated file and writes no Python hook files for extension-backed platforms (canonical assertion: `expect(fs.existsSync(".pi/hooks")).toBe(false)` in `test/configurators/platforms.test.ts`).
- `collectPlatformTemplates("<platform>")` matches init output paths.
- `init({ <flag>: true })` creates platform assets and tracks hashes for all generated templates.
- `get_context.py --mode phase --platform <platform>` routes to sub-agent-capable workflow blocks when `agentCapable` is true.
- Runtime script copies (`src/templates/trellis/scripts/**` and live `.trellis/scripts/**`) both recognize the platform.
- The generated extension registers handlers for the Pi runtime surfaces (`before_agent_start`, `context`, `tool_call`) plus the `subagent` custom tool with `promptSnippet`/`promptGuidelines` set to the dispatch protocol constant, and does not register `input` for Trellis runtime context injection.
- The TS-port workflow-state regex (`WORKFLOW_STATE_TAG_RE`) matches the same status names and body content as the Python `_TAG_RE` on a shared fixture from `templates/trellis/workflow.md`.

### 7. Wrong vs Correct

#### Wrong

```typescript
await writeSharedHooks(path.join(configRoot, "hooks"));
```

This writes Python hooks into a platform whose hook surface is a TypeScript extension API.

#### Correct

```typescript
await writeFile(
  path.join(configRoot, "extensions", "trellis", "index.ts"),
  getExtensionTemplate(),
);
```

Extension-backed platforms keep hook-equivalent behavior in platform-native extension files and test those files as templates.

---

## Scenario: Pi Sub-Agent Launcher

### 1. Scope / Trigger

Use this contract when `.pi/extensions/trellis/index.ts` launches a nested Pi process for the Trellis `subagent` tool.

This is Windows-sensitive runtime integration. Node `spawn("pi", ...)` can fail with `ENOENT` when Pi is installed through an npm shim instead of a real `pi.exe`, and passing the full delegated prompt as an argv value can hit platform argument-length limits.

### 2. Signatures

Launcher resolver:

```typescript
interface PiInvocation {
  command: string;
  argsPrefix: string[];
}

function resolvePiInvocation(): PiInvocation;
```

Nested launch:

```typescript
spawn(
  invocation.command,
  [...invocation.argsPrefix, "--mode", "text", "-p", "--no-session"],
  {
    cwd: projectRoot,
    env: { ...process.env, TRELLIS_CONTEXT_ID: contextKey },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  },
);
```

### 3. Contracts

| Field / Env         | Contract                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRELLIS_PI_CLI_JS` | Optional absolute or relative path to `@mariozechner/pi-coding-agent/dist/cli.js`; if set, it is authoritative                                                                                                       |
| `command`           | `process.execPath` when a CLI JS entrypoint is resolved; otherwise `"pi"` fallback                                                                                                                                   |
| `argsPrefix`        | `[cliJs]` for resolved JS entrypoint; `[]` for fallback                                                                                                                                                              |
| Prompt transport    | Write delegated prompt to `child.stdin`, never as a positional argv prompt                                                                                                                                           |
| Output mode         | Use `--mode text`; keep final-output formatter tolerant of structured or diagnostic output                                                                                                                           |
| Context             | Forward `TRELLIS_CONTEXT_ID` into the child env when available                                                                                                                                                       |
| Agent config        | Parse `model`, `thinking`, and `fallbackModels` from `.pi/agents/*.md` frontmatter                                                                                                                                   |
| Per-call overrides  | `trellis_subagent` tool input may override frontmatter with `model` and `thinking`                                                                                                                                   |
| Agent validation    | `isTrellisAgent()` checks `existsSync(.pi/agents/trellis-{agent}.md)` before spawn; invalid → returns error text listing community alternatives                                                                      |
| Model/thinking args | If model and thinking are present and model has no thinking suffix, pass `--model <model>:<thinking>`; if model already has a suffix, pass it unchanged; if thinking exists without model, pass `--thinking <level>` |
| Output buffers      | Bound stdout and stderr collection separately; keep the tail plus truncation notice                                                                                                                                  |

Candidate JS entrypoint lookup should cover:

```text
process.argv entries ending in pi-coding-agent/dist/cli.js
npm_config_prefix / NPM_CONFIG_PREFIX
APPDATA/npm
PATH entries, their parent directories, and parent/lib variants
```

### 4. Validation & Error Matrix

| Condition                                      | Behavior                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `TRELLIS_PI_CLI_JS` points to an existing file | Launch with `process.execPath` and `[cliJs, "--mode", "text", "-p", "--no-session"]` |
| `TRELLIS_PI_CLI_JS` points to a missing file   | Reject with an error naming `TRELLIS_PI_CLI_JS` and the resolved missing path        |
| A candidate CLI JS entrypoint exists           | Launch with `process.execPath` and the candidate path                                |
| No candidate CLI JS entrypoint exists          | Fall back to `spawn("pi", ["--mode", "text", "-p", "--no-session"])`                 |
| `AbortSignal` is already aborted               | Reject before spawning                                                               |
| `AbortSignal` fires after spawn                | Kill the child and reject with `pi subagent cancelled`                               |
| Child exits non-zero                           | Reject with stderr, else stdout, else an exit-code message                           |
| stdout/stderr exceed limits                    | Keep the most recent bytes and prefix output with a truncation notice                |

### 5. Good / Base / Bad Cases

Good:

```typescript
const invocation = resolvePiInvocation();
const child = spawn(
  invocation.command,
  [...invocation.argsPrefix, "--mode", "text", "-p", "--no-session"],
  { stdio: ["pipe", "pipe", "pipe"] },
);
child.stdin?.end(prompt);
```

Base:

```typescript
return { command: "pi", argsPrefix: [] };
```

Bad:

```typescript
spawn("pi", ["--mode", "json", "-p", "--no-session", prompt]);
```

### 6. Tests Required

Add or update template/configurator tests that assert:

- the generated extension contains `resolvePiInvocation`, `TRELLIS_PI_CLI_JS`, `process.execPath`, `APPDATA`, npm prefix lookup, and PATH splitting by `delimiter`;
- the generated extension writes the prompt through `child.stdin?.end(prompt)`;
- the generated extension contains bounded stdout/stderr collectors;
- the old argv launcher and `toPiPromptArgument` are absent;
- `.pi/extensions/trellis/index.ts` stays byte-for-byte aligned with `src/templates/pi/extensions/trellis/index.ts.txt`;
- the dogfood extension compiles as TypeScript independently of the package build.

### 7. Wrong vs Correct

#### Wrong

```typescript
spawn("pi", [
  "--mode",
  "json",
  "-p",
  "--no-session",
  toPiPromptArgument(prompt),
]);
```

This depends on direct executable lookup for `pi` and uses argv for an unbounded generated prompt.

#### Correct

```typescript
const invocation = resolvePiInvocation();
const child = spawn(
  invocation.command,
  [...invocation.argsPrefix, "--mode", "text", "-p", "--no-session"],
  { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
);

child.stdin?.end(prompt);
```

Resolve npm-shim installs through the real JS entrypoint when possible, keep `pi` as the compatibility fallback, and transport generated prompts through stdin.

---

## What You DON'T Need to Update

These are now **automatically derived** from the registry:

| Previously hardcoded                          | Now derived from                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `BACKUP_DIRS` in update.ts                    | `ALL_MANAGED_DIRS` from `configurators/index.ts`                       |
| `TEMPLATE_DIRS` in template-hash.ts           | `ALL_MANAGED_DIRS` from `configurators/index.ts`                       |
| `getConfiguredPlatforms()` in update.ts       | `getConfiguredPlatforms()` from `configurators/index.ts`               |
| `cleanupEmptyDirs()` whitelist in update.ts   | `isManagedPath()` / `isManagedRootDir()` from `configurators/index.ts` |
| `collectTemplateFiles()` if/else in update.ts | `collectPlatformTemplates()` dispatch loop                             |
| `TOOLS[]` in init.ts                          | `getInitToolChoices()` from `configurators/index.ts`                   |
| Configurator dispatch in init.ts              | `configurePlatform()` from `configurators/index.ts`                    |
| Windows Python detection in init.ts           | `getPlatformsWithPythonHooks()` from `configurators/index.ts`          |

---

## Command Format by Platform

| Platform    | Command Format                                                         | File Format                                                   | Example (finish-work)  |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| Claude Code | `/trellis:xxx`                                                         | Markdown (`.md`)                                              | `/trellis:finish-work` |
| Cursor      | `/trellis-xxx`                                                         | Markdown (`.md`)                                              | `/trellis-finish-work` |
| OpenCode    | `/trellis:xxx`                                                         | Markdown (`.md`)                                              | `/trellis:finish-work` |
| Gemini CLI  | `/trellis:xxx`                                                         | TOML (`.toml`)                                                | `/trellis:finish-work` |
| Kilo        | `/<workflow-name>`                                                     | Markdown (`.md`)                                              | `/finish-work`         |
| Codex       | `$<skill-name>` / `/skills`                                            | Markdown (`SKILL.md`)                                         | `$finish-work`         |
| Kiro        | `$<skill-name>` / `/skills`                                            | Markdown (`SKILL.md`)                                         | `$finish-work`         |
| Qoder       | `/trellis-<name>` (commands) + `$<skill-name>` / `/skills` (workflows) | Markdown (`.md` with frontmatter + `SKILL.md`)                | `/trellis-finish-work` |
| Antigravity | `/<workflow-name>`                                                     | Markdown (`.md`)                                              | `/finish-work`         |
| CodeBuddy   | `/trellis:xxx`                                                         | Markdown (`.md`)                                              | `/trellis:finish-work` |
| Copilot     | `/trellis:xxx`                                                         | Markdown (`.prompt.md`)                                       | `/trellis:finish-work` |
| Droid       | `/trellis:xxx`                                                         | Markdown (`.md`)                                              | `/trellis:finish-work` |
| Devin       | `/trellis-xxx`                                                         | Markdown (`.md`) + `SKILL.md`                                 | `/trellis-finish-work` |
| Pi Agent    | `/trellis-xxx` prompt templates + `/skill:<name>` skills               | Markdown (`.md`) + `SKILL.md` + TypeScript extension          | `/trellis-finish-work` |
| Trae IDE    | `/trellis-xxx` commands + skills                                       | Markdown (`.md` with frontmatter) + `SKILL.md` + `hooks.json` | `/trellis-finish-work` |
| Oh My Pi    | `/trellis-xxx`                                                         | Markdown (`.md` with YAML frontmatter) + TypeScript extension | `/trellis-finish-work` |
| Kimi Code   | `/skill:trellis-<name>` skills                                         | Markdown (`SKILL.md`)                                         | `/skill:trellis-finish-work` |

When creating platform templates, ensure references match the platform's interaction format and file format.

## Command Set by Platform Capability

Commands emitted by `resolveCommands(ctx)` / `resolveAllAsSkills(ctx)` / `resolveAllAsSkillsNeutral(ctx)` in `src/configurators/shared.ts`:

| Command       | `agentCapable && hasHooks` (12)                                                                                                                                                                                                                | `agentCapable && !hasHooks` (3)                                                                       | `!agentCapable` (3)                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `start`       | ✔ filtered by the shared resolver — SessionStart-style hook injects opening context, user-facing `/start` would be redundant. Pi is the approved exception and re-adds `.pi/prompts/trellis-start.md` because `session_start` is notify-only. | ✅ emitted (skill and/or slash command per platform) — no hook fires, users need an invocable `start` | ✅ emitted — manual equivalent of session-start hook |
| `continue`    | ✅ emitted                                                                                                                                                                                                                                     | ✅ emitted                                                                                            | ✅ emitted                                           |
| `finish-work` | ✅ emitted                                                                                                                                                                                                                                     | ✅ emitted                                                                                            | ✅ emitted                                           |

**Rule**: filter is by `ctx.agentCapable && ctx.hasHooks` — **both flags required** (changed in 0.6.4; the prior single-flag rule silently dropped `start` from Codex / ZCode / OpenCode / Reasonix). `agentCapable` alone is not a proxy for "has a session-start mechanism" because some agent-capable platforms ship without a SessionStart-equivalent hook and rely on user-invocable `start` instead.

- `agentCapable && hasHooks`: `claude-code, cursor, kiro, gemini, qoder, codebuddy, copilot, droid, pi, trae, zcode, omp`
- `agentCapable && !hasHooks`: `codex, opencode, reasonix, grok, kimi` — Codex has a UserPromptSubmit hook but no SessionStart; OpenCode has a `plugins/session-start.js` plugin but registry-`hasHooks` is reserved for the SessionStart-style hook protocol; Reasonix and Grok have neither; Kimi has hooks only in the user-level `~/.kimi-code/config.toml` (no project-level hook file Trellis may write).
- `!agentCapable`: `kilo, antigravity, devin`

> ZCode joined `agentCapable && hasHooks` in the zcode-hook-support task: it ships a workspace hook config at `.zcode/config.json` covering SessionStart + UserPromptSubmit (reusing the shared `session-start.py` / `inject-workflow-state.py`). Live probing confirmed ZCode PreToolUse with matcher `Agent|Task` can mutate the sub-agent prompt through `hookSpecificOutput.updatedInput`, so ZCode is **class-1** for sub-agent context and ships `inject-subagent-context.py`.

> **Gotcha**: do not treat `hasHooks=false` as "platform has no automation at all". For OpenCode it means "no SessionStart hook protocol" — its plugin still injects context. The flag is a hook-protocol marker, not a capability summary. When filtering by capability, query the actual capability you need, never assume a default pairing from one boolean.

## Subagent Context Injection: Hook-based vs Pull-based vs Extension-backed

Trellis sub-agents (implement / check / research) need task context (`prd.md` + spec files listed in `implement.jsonl` / `check.jsonl`) at startup. There are **three** delivery classes depending on the platform's hook capabilities. The class-1 / class-2 / class-3 labels below are also used by the `[workflow-state:in_progress]` breadcrumb body and by the Pi `SUBAGENT_DISPATCH_PROTOCOL` constant — keep terminology stable across all three writers.

| Class                          | Mechanism                                                                                                                                                                                                      | Platforms                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Class-1** — Hook-inject      | Native hook or plugin fires at sub-agent start and injects context before the child runs, either by rewriting the spawn prompt or adding developer context                                                        | Claude Code, Cursor, OpenCode, Kiro, CodeBuddy, Codex, Factory Droid, ZCode |
| **Class-2** — Pull-based       | Platform lacks a Trellis-supported native sub-agent context injection hook; Trellis injects a "Required: Load Trellis Context First" prelude into each definition so the sub-agent reads context at startup     | Gemini CLI, Qoder, Copilot, Reasonix, Trae IDE, Grok Build, Kimi Code  |
| **Class-3** — Extension-backed | Platform exposes hook-equivalent events and custom tools through a project-local TypeScript extension; Trellis owns the sub-agent tool and the context injection path                                          | Pi Agent, Oh My Pi                                           |

### Class-1 — Hook-inject (8 platforms)

Platform's native sub-agent-start hook delivers context before the child runs. Most platforms rewrite the spawn prompt; Codex emits developer context through `SubagentStart`. Trellis's `inject-subagent-context.py` (or OpenCode's plugin) reads `prd.md` + the JSONL-referenced spec files for that delivery.

| Platform      | Hook event                            | Mechanism                               |
| ------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code   | `PreToolUse` + matcher `Task`/`Agent` | `updatedInput.prompt`                   |
| CodeBuddy     | `PreToolUse` + matcher `Task`         | `modifiedInput.prompt` (same as Claude) |
| Codex         | `SubagentStart` + exact Trellis-role matcher | `hookSpecificOutput.additionalContext`; child-side pull fallback |
| Cursor        | `preToolUse` + matcher `Task          | Subagent`                               | `updated_input.prompt` (Cursor staff marked Task prompt mutation fixed on 2026-04-07; current Cursor may emit native sub-agent calls as tool name `Subagent`, and native Task args may encode custom agents as `subagent_type.custom.name`) |
| Factory Droid | `PreToolUse` + matcher `Task`         | `updatedInput.prompt`                   |
| Kiro          | per-agent `agentSpawn` hook           | direct stdout context                   |
| OpenCode      | JS plugin `tool.execute.before`       | `args.prompt` mutation                  |
| ZCode         | `PreToolUse` + matcher `Agent|Task`   | `hookSpecificOutput.updatedInput.prompt` |

#### OpenCode injection contract (issue #264)

OpenCode is a hybrid class-1 platform: its main session uses `tool.execute.before` for sub-agent prompt mutation, but it also runs separate `chat.message` plugins (`session-start.js`, `inject-workflow-state.js`) that fire for **every** chat turn — including sub-agent child sessions. Without explicit filtering, those plugins inject 30-40KB of main-session SessionStart context into sub-agent turns and drown the parent's intended prompt injection.

**Required contract** for any OpenCode `chat.message` plugin that mutates `output.parts`:

```js
import { isTrellisSubagent } from "../lib/trellis-context.js"

"chat.message": async (input, output) => {
  if (isTrellisSubagent(input)) {
    // input.agent matched /^trellis-(implement|check|research)$/
    // Sub-agent context is injected by inject-subagent-context.js on the
    // parent's tool.execute.before — do not double-inject here.
    return
  }
  // ... main-session injection ...
}
```

`isTrellisSubagent()` lives in `lib/trellis-context.js`; the regex matches `trellis-implement` / `trellis-check` / `trellis-research` exactly.

**Sub-agent task resolution order** in `inject-subagent-context.js` `tool.execute.before` (only later steps run when earlier ones miss):

1. Exact session runtime context lookup for `input.sessionID` (writes a `session:<key>` source)
2. `Active task: <path>` line parsed from `args.prompt` first non-empty line (source `prompt-hint`) — explicit per-dispatch override, beats single-session inference so multi-window users can disambiguate
3. Single-session fallback in `TrellisContext._resolveSingleSessionFallback()` — only when exactly 1 file exists in `.trellis/.runtime/sessions/`; refuses to guess when 0 or ≥2 files exist (source `session-fallback:<context_key>`). Mirrors Python `_resolve_single_session_fallback` (`active_task.py:497-519`).

`buildPrompt()` for implement / check / finish / research **must** prepend `<!-- trellis-hook-injected -->` so generated agent definitions in `.opencode/agents/*.md` can detect a successful injection (Trellis-internal contract; OpenCode itself ignores the marker).

`getActiveTask()` in `lib/trellis-context.js` itself includes the single-session fallback so any caller (`workflow-state` breadcrumb, `session-start` task status) sees the same resolved task as the prompt injector. The fallback only activates when the explicit context-key lookup misses, so multi-window setups remain isolated.

### Class-2 — Pull-based (7 platforms)

Platform's hook either does not expose a sub-agent-start event or cannot inject Trellis context. Sub-agents must read context themselves at startup. Trellis injects a "Required: Load Trellis Context First" prelude into each sub-agent definition file.

| Platform | Why native context injection is unavailable |
|---|---|
| Gemini CLI | `BeforeTool` fires but [#18128](https://github.com/google-gemini/gemini-cli/issues/18128) hides chain-of-thought; reliability margin too thin |
| Qoder | No `Task` tool concept; `SubagentStart` input has no `prompt` field; Context Isolation |
| Copilot | `preToolUse` doesn't enforce on subagents ([#2392](https://github.com/github/copilot-cli/issues/2392), [#2540](https://github.com/github/copilot-cli/issues/2540)) |
| Reasonix | Sub-agent skills run with `runAs: subagent`; no prompt-mutation hook exists, so workflow dispatch must carry the active task and the sub-agent skill reads task artifacts itself. |
| Trae IDE | `SessionStart` / `UserPromptSubmit` hooks cover main-session context, but no Trellis-supported sub-agent prompt mutation surface exists; generated `.trae/agents/*.md` files receive the pull-based prelude. |
| Grok Build | Hook stdout `additionalContext` is not consumed (verified on 0.2.x), so no Trellis hook is installed; dispatch goes through `spawn_subagent` and generated `.grok/agents/*.md` files receive the pull-based prelude. |
| Kimi Code | Hooks exist only in the user-level `~/.kimi-code/config.toml` (no project-level hook/settings file Trellis may write) and there are no custom sub-agent definitions (built-in coder/explore/plan only), so the Trellis agent prompts ship as `.kimi-code/skills/trellis-*/SKILL.md` with the pull-based prelude. |

#### Active task discovery on class-2 platforms (issue #225)

Sub-agents on class-2 platforms run as **separate sessions** with their own session ids — they do not inherit the parent's `<PLATFORM>_SESSION_ID` env, so the session-scoped active-task resolver (see `### Active Task Resolution` above) returns `None` for the sub-agent's own session key. To bridge that gap the prelude (`buildPullBasedPrelude` in `src/configurators/shared.ts`) tells sub-agents to discover the active task in this order:

1. **`Active task: <path>` line in dispatch prompt** — primary path. The main agent is required by `workflow.md`'s `[workflow-state:in_progress]` breadcrumb to prefix every sub-agent dispatch (including `trellis-research`, since 0.5.8) with `Active task: <path from task.py current>`. The breadcrumb fires on every `UserPromptSubmit` while `task.json.status == in_progress`, so the rule is reinjected per turn.
2. **`task.py current --source`** — secondary. Resolves via the session-scoped runtime store. Returns `Source: session:<key>` on a precise match, or `Source: session-fallback:<key>` when the runtime contains exactly one session file (single-window inference; see `_resolve_single_session_fallback` in `active_task.py`). Returns nothing when ≥2 session files exist — refuses to guess across windows so 04-21's multi-session isolation contract holds.
3. **Ask the user** — terminal fallback when both above yield nothing.

When changing the prelude, the dispatch protocol, or the `session-fallback` semantics, all three layers must stay aligned. `regression.test.ts > [issue-225]` and `regression.test.ts > [session-fallback]` are the contract tests; `templates/trellis.test.ts > [issue-225]` asserts the workflow.md breadcrumb still carries the protocol. Manual e2e runbook lives in the historical task `.trellis/tasks/<archive>/05-04-fix-codex-subagent-missing-active-task/manual-verify.md`.

### Class-3 — Extension-backed (2 platforms)

Platform can expose hook-equivalent events and custom tools through a project-local extension. Trellis owns the sub-agent tool and the context injection path. Unlike class-1 (which only handles sub-agent context) and class-2 (which only handles sub-agent prelude), class-3 owns hidden persistent custom-message context injection and per-Bash-tool-call session-identity prefixing through the platform extension API.

| Platform | Extension surface                                                  | Context delivery                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi Agent | `.pi/extensions/trellis/index.ts` events + `trellis_subagent` tool | extension builds full prompt/context from `.pi/agents/*.md`, `prd.md`, `design.md` if present, `implement.md` if present, and JSONL-referenced files via `buildContext()`; preserves startup/full task context through `before_agent_start.systemPrompt` and persists compact workflow/session context through a hidden `before_agent_start.message` custom message; agent definitions also receive the pull-based prelude as a fallback |
| Oh My Pi | `.omp/extensions/trellis/index.ts` events                          | extension resolves a session-scoped context key from the OMP runtime, injects session/task context through extension events, and keeps JSONL-referenced files jailed inside the project root                                                                                                                                                                                                       |

See **"Class-3 injection points (Pi extension)"** and **"Cross-platform consistency invariant"** below for the runtime contract details.

### Class-3 injection points (Pi extension)

`templates/pi/extensions/trellis/index.ts.txt` registers handlers for three platform events plus one custom tool. Each injection point has a distinct lifecycle and a distinct failure mode if dropped.

| Injection point         | Handler                                              | When it fires                              | What it injects                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input`                 | not registered for Trellis runtime context             | n/a                                        | Trellis must not rewrite submitted user text; context identity is resolved in `before_agent_start` and `tool_call` where it is needed                                                                          |
| `before_agent_start`    | `pi.on?.("before_agent_start", …)`                   | every agent invocation (main + sub-agents) | preserves `systemPrompt` with startup/full task context only, and additionally returns `message: { customType: "trellis-runtime-context", display: false, content }` containing compact `<workflow-state>` + `<session-overview>`; Pi wraps the message as a persisted `role: "custom"` session message |
| `context`               | `pi.on?.("context", …)`                              | before each LLM call                       | preserves existing context-key establishment only; must not append request-local Trellis runtime messages because they are not persisted and can move between turns                                           |
| `tool_call` (Bash)      | `pi.on?.("tool_call", …)`                            | every Bash tool call                       | mutates `event.input.command` in place via `injectTrellisContextIntoBash()` to prefix `export TRELLIS_CONTEXT_ID=<context-key>;` so child Python scripts (e.g. `task.py current`) inherit session identity      |
| `trellis_subagent` tool | `pi.registerTool?.({ name: "trellis_subagent", … })` | extension load time (once)                 | `promptSnippet` and `promptGuidelines` carry `SUBAGENT_DISPATCH_PROTOCOL` so the model sees the dispatch contract before it ever calls the tool                                                                 |

`TurnContextCache` (in `index.ts.txt`) memoizes the per-turn context-key → `{workflowState, sessionOverview}` pair so `before_agent_start` does not double-spawn the default `get_context.py` session-context call. The cache key is the resolved context key; entries are short-lived (one turn/request window).

The startup context is tracked separately by resolved context key and contributes to `before_agent_start.systemPrompt` only once. It shells out to `get_context.py` for both the default session overview and `--mode phase --platform pi`, then wraps those canonical outputs in `<session-overview>` and `<trellis-workflow>`. Do not move this payload to `session_start`; Pi's event can notify the UI but has no model-visible context return path.

### Cross-platform consistency invariant

The body of the `<workflow-state>` breadcrumb MUST be byte-identical across class-1 (Python hook), class-2 (no breadcrumb — relies on session-start prelude), and class-3 (TS-port) writers. Agents reading workflow-state across platforms in the same conversation (e.g. user switching from Claude to Pi mid-task) must see the same content.

Concrete rules:

- **Regex parity**: `templates/pi/extensions/trellis/index.ts.txt:WORKFLOW_STATE_TAG_RE` MUST mirror `templates/shared-hooks/inject-workflow-state.py:_TAG_RE` byte-for-byte. Both use the closing-tag backreference `\1` (or its TS equivalent in `[\/workflow-state:\1\]`) so a tag block parses identically in Python and TypeScript.
- **Breadcrumb body source**: `loadWorkflowBreadcrumbs()` in the Pi extension reads `.trellis/workflow.md` directly — same source as the Python hook. There is no separate TS-side template for breadcrumb bodies. If the regex drifts, the TS port silently falls back to hardcoded defaults and Pi loses parity.
- **Status writer parity**: `task.json.status` is the sole input to "which `[workflow-state:STATUS]` block fires". Both the Python hook (`get_active_task` + status read) and the TS port (`readActiveTaskStatus()` in `index.ts.txt`) MUST agree on the status string. Custom statuses pass through both unchanged.
- **`<session-overview>` parity**: Pi shells out to `python3 .trellis/scripts/get_context.py` rather than re-implementing context generation in TS, so output stays canonical. Don't replace this with an inline TS implementation — that's a parity drift waiting to happen.

#### Anti-pattern: bypassing the shared TS port

```typescript
// WRONG — re-implements parsing with a different regex
const blocks = workflow.match(
  /\[workflow-state:(\w+)\][\s\S]+?\[\/workflow-state/g,
);
```

```typescript
// WRONG — inline-formats <session-overview> differently than get_context.py
const overview = `<session-overview>\n${gitStatus}\n${activeTasks}\n</session-overview>`;
```

```typescript
// WRONG — rewrites the user's visible prompt and persists generated context as user-authored text
function onInput(event, ctx) {
  const overview = spawnSync("python3", [".trellis/scripts/get_context.py"]);
  return { action: "transform", text: `${event.text}\n\n${overview}` };
}
```

#### Correct

```typescript
// Match Python regex byte-for-byte (TS uses [\s\S]*? for cross-line; Python uses re.DOTALL)
const WORKFLOW_STATE_TAG_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n([\s\S]*?)\n\s*\[\/workflow-state:\1\]/g;

// Compact runtime context is persisted through before_agent_start as a hidden custom message.
const onBeforeAgentStart = (event, ctx) => {
  const turn = turnContextCache.get(projectRoot, contextKey);
  const runtimeContext = [turn.wf, turn.ov].filter(Boolean).join("\n\n");
  return {
    message: runtimeContext
      ? {
          customType: "trellis-runtime-context",
          content: runtimeContext,
          display: false,
        }
      : undefined,
    systemPrompt: [cur, startup, taskContext].filter(Boolean).join("\n\n"),
  };
};
```

### Subagent dispatch protocol — single source of truth

The dispatch protocol text (the `Active task: <path>` first-line rule plus the class-1 / class-2 / class-3 platform notes) appears in **two writers** and they MUST stay in sync:

| Writer                | Location                                                                  | Consumed by                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Workflow breadcrumb   | `templates/trellis/workflow.md` `[workflow-state:in_progress]` block      | Python `inject-workflow-state.py` and the Pi TS port — surfaced per-turn while a task is in progress                               |
| Pi extension constant | `templates/pi/extensions/trellis/index.ts.txt:SUBAGENT_DISPATCH_PROTOCOL` | Pi `trellis_subagent` tool's `promptSnippet` / `promptGuidelines` — surfaced at extension load and on each tool description render |

When you change one, change both. The two channels exist because:

1. The breadcrumb is per-turn but only active when `task.json.status == in_progress`.
2. The tool `promptSnippet` is always visible in the tool catalog, including before any task is started or in fresh windows where the breadcrumb hasn't fired yet.

A drift between the two is silent: the model will still see _some_ dispatch guidance, just inconsistent guidance, and the resulting class-1/class-2/class-3 fallback chain breaks in subtle ways (e.g. sub-agent skips the `Active task:` line because the breadcrumb mentions it but the tool snippet doesn't, or vice versa).

#### Tests required

- Regression test asserting the `Active task:` rule appears in `templates/trellis/workflow.md` (`templates/trellis.test.ts > [issue-225]`).
- Regression test asserting `workflow.md` Phase 2.1 routes generated pull-based sub-agent definitions through the pull-based block, not the `The platform hook/plugin auto-handles` block (`templates/trellis.test.ts > [issue-zcode-repeat]`). The test derives generated pull-based platforms from `collectPlatformTemplates()` by looking for `Required: Load Trellis Context First`; adding a new pull-based platform without adding its workflow marker mapping must fail. Pi is excluded from this derivation because its generated agents keep the same prelude as a fallback while the primary context path is class-3 extension-backed and is covered by Pi-specific tests.
- Configurator test asserting the Pi extension's `SUBAGENT_DISPATCH_PROTOCOL` constant contains the same `Active task:` rule and the same class-1/class-2/class-3 platform list.
- Cross-source parity test: when the breadcrumb text in `workflow.md` changes, the Pi extension's `SUBAGENT_DISPATCH_PROTOCOL` constant must change in the same commit. Either co-locate the parity assertion in a single regression test, or rely on diff review — but document the rule here.

### Implementation

Pull-based prelude is injected by `injectPullBasedPreludeMarkdown()` / `injectPullBasedPreludeToml()` in `src/configurators/shared.ts`. Each pull-based platform's configurator:

1. Calls `writeSharedHooks(dir, platform)` where `SHARED_HOOKS_BY_PLATFORM[platform]` excludes `inject-subagent-context.py` — no prompt-mutation hook installed
2. Calls `detectSubAgentType(name)` → `injectPullBasedPrelude*()` on every sub-agent definition before writing

Hook-inject platforms keep using `writeSharedHooks(dir, platform)` with a capability table entry that includes `inject-subagent-context.py`, and their hook-config JSON references that hook as before. ZCode follows this path through `.zcode/config.json` `PreToolUse` entries matching `Agent|Task`; its generated `.zcode/agents/*.md` files carry only the hook-failure fallback protocol, not the pull-based prelude.

### Recursion guard in implement/check agent definitions

Every generated `trellis-implement` and `trellis-check` agent definition must
carry an explicit recursion guard near the top of its instructions. The guard
must state that the reader is already the dispatched sub-agent, that any
SessionStart / workflow-state / workflow.md text saying to dispatch
`trellis-implement` or `trellis-check` applies only to the main session, and
that the agent must do its own work directly instead of spawning another
implement/check agent.

This rule applies to Markdown, TOML, JSON, and extension-backed agent
definitions. It is deliberately duplicated with the workflow-state breadcrumb:
some hosts can surface per-turn breadcrumbs inside sub-agent turns, while other
hosts rely only on the agent definition text. The two channels must both be
safe.

For Cursor, `.cursor/hooks.json` must match both `Task` and `Subagent` on `preToolUse`. Current Cursor 3.2.11 emits native sub-agent spawns as `tool_name: "Subagent"` even though the docs still describe the generic Task tool under `Task`. `inject-subagent-context.py` must parse both legacy/string and native protobuf-shaped Task inputs. Custom agents can arrive as `subagent_type: "trellis-implement"`, `subagent_type: { "custom": { "name": "trellis-implement" } }`, or `subagent_type: { "type": { "case": "custom", "value": { "name": "trellis-implement" } } }`. All three forms must resolve to the Trellis agent name before deciding whether to inject context.

Extension-backed platforms must not call `writeSharedHooks()` for their config directory. They generate platform-native extension files and tests must assert that no Python hook files are installed under the platform config root.

### Audit reference

Historical reliability audit (per-platform evidence, GitHub issues, Cursor
staff confirmations, Claude Code canary test) lives in the archived task:
`.trellis/tasks/archive/2026-04/04-17-subagent-hook-reliability-audit/research/platform-hook-audit.md`

---

## Planning Artifact and JSONL Context Contract

### Scope / Trigger

Task planning is artifact-driven:

- `prd.md` is created by `task.py create` and stores requirements, constraints, and acceptance criteria.
- `design.md` is required for complex tasks and stores technical design, boundaries, data flow, contracts, and tradeoffs.
- `implement.md` is required for complex tasks and stores execution order, checklist, validation commands, and rollback points.
- `implement.jsonl` / `check.jsonl` are spec and research manifests for implement/check context. They do not replace `implement.md`.

Lightweight tasks may be PRD-only. Complex tasks must have `prd.md`, `design.md`, and `implement.md` before `task.py start` moves the task into implementation.

### Lifecycle

1. **Create** — `task.py create` writes `task.json` with `status = planning`, creates the default `prd.md`, and seeds `implement.jsonl` / `check.jsonl` when a sub-agent-capable platform is detected.
2. **Plan** — AI updates `prd.md`. If the task is complex, AI also writes `design.md` and `implement.md`; if sub-agent/spec context is needed, AI curates jsonl entries.
3. **Review / start** — the user reviews the planning artifacts. `task.py start` is valid when the task's artifact gate is satisfied.
4. **Consume** — hook, prelude, Pi extension, and OpenCode plugin read context in the same order: jsonl entries, `prd.md`, `design.md` if present, `implement.md` if present.

### Signatures

**Seed row schema** (one line, written by `_write_seed_jsonl` in `task_store.py`):

```json
{
  "_example": "Fill with {\"file\": \"<path>\", \"reason\": \"<why>\"}. Put spec/research files only — no code paths. Run `python3 .trellis/scripts/get_context.py --mode packages` to list available specs. Delete this line when done."
}
```

**Curated row schema** (written by AI):

```json
{ "file": "<repo-relative-path>", "reason": "<one-line rationale>" }
```

Optional `type: "directory"` is supported for directory entries. Consumers ignore any other fields.

### Contracts

| Contract                  | Enforcer                                        | Behavior                                                                           |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Task creation             | `task_store.py`                                 | Always creates default `prd.md`; never auto-creates `design.md` or `implement.md`. |
| Lightweight planning gate | workflow-state / SessionStart / continue        | PRD-only is valid when the task is clearly small.                                  |
| Complex planning gate     | workflow-state / SessionStart / continue        | Requires `prd.md`, `design.md`, and `implement.md` before `task.py start`.         |
| Seed detection            | Every jsonl consumer                            | Row without a `file` key is treated as non-entry and skipped.                      |
| Empty-file tolerance      | hook / prelude / plugin readers                 | Missing or seed-only jsonl is tolerated; task artifacts still load.                |
| Context order             | hook / prelude / Pi extension / OpenCode plugin | jsonl entries → `prd.md` → `design.md` if present → `implement.md` if present.     |

### Validation & Error Matrix

| Condition                                              | Behavior                                                                                              | Exit / Surface          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `implement.jsonl` has only seed row                    | `cmd_validate` reports 0 errors; `cmd_list_context` prints "(no curated entries yet — only seed row)" | Exit 0                  |
| `implement.jsonl` entry points at non-existent file    | `cmd_validate` prints "File not found: …" per row                                                     | Exit 1                  |
| Lightweight task has only `prd.md`                     | Valid planning state; SessionStart / continue can ask for start review                                | No error                |
| Complex task is missing `design.md` or `implement.md`  | Stay in planning; ask user to complete missing planning artifacts                                     | Hook / command guidance |
| Sub-agent platform detected, but jsonl seed is missing | Context readers fall back to task artifacts and warn where applicable                                 | No create failure       |

### Good / Base / Bad Cases

- **Good**: complex task has `prd.md`, `design.md`, `implement.md`, and curated jsonl manifests. Context consumers load jsonl entries first, then all three artifacts.
- **Base**: lightweight task has only `prd.md`. SessionStart / continue treats this as a valid planning state and may ask for start review.
- **Bad**: complex task has only `prd.md` plus seed-only jsonl. SessionStart / continue must keep the task in planning; it must not treat jsonl file existence as implementation readiness.

### Wrong vs Correct

#### Wrong

```python
def is_ready(task_dir: Path) -> bool:
    return (task_dir / "prd.md").is_file() and (task_dir / "implement.jsonl").is_file()
```

File existence alone cannot distinguish a lightweight PRD-only task from an incomplete complex task, and a seed-only jsonl manifest is not curated context.

#### Correct

```python
def planning_next_action(task_dir: Path, is_complex: bool, inline_mode: bool) -> str:
    if not (task_dir / "prd.md").is_file():
        return "write-prd"
    if is_complex and (
        not (task_dir / "design.md").is_file()
        or not (task_dir / "implement.md").is_file()
    ):
        return "complete-complex-artifacts"
    if not inline_mode and not has_curated_jsonl(task_dir):
        return "curate-jsonl"
    return "review-before-start"
```

The route depends on task intent, artifact presence, and execution mode. Missing optional artifacts are skipped for lightweight tasks, but complex tasks cannot enter implementation until their planning artifacts are complete.

### Tests Required

- **Create behavior**: `task.py create` creates default `prd.md` and seeds jsonl only on sub-agent-capable platforms.
- **Consumer tolerance**: `inject-subagent-context.py` skips seed rows and still injects task artifacts.
- **Validate seed**: `task.py validate` treats seed-only jsonl as 0 errors.
- **List-context seed**: `task.py list-context` prints "no curated entries yet" for seed-only jsonl.
- **Artifact gates**: workflow-state, SessionStart, and continue distinguish PRD-only lightweight tasks from complex tasks that still need `design.md` / `implement.md`.

## Context Injection Limits Contract (`context_injection`)

### 1. Scope / Trigger

Sub-agent context injection (hook Python + Pi extension TS) caps how much task
context is inlined into a sub-agent's first prompt. Added for #441 (task
`07-22-subagent-context-limits`). Any change to injection formatting, caps, or
config keys MUST be applied to **both** implementations:

- `packages/cli/src/templates/shared-hooks/inject-subagent-context.py`
- `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`

### 2. Signatures

- Python: `common.config.get_context_injection_limits() -> dict[str, int]`,
  `truncate_utf8(data: bytes, cap: int) -> bytes`
- TS: `readContextInjectionLimits(repoRoot: string)`, `truncateUtf8(buf: Buffer, cap: number)`
  (exported for tests via `loadExtensionInternals()` in `pi.test.ts`)

### 3. Contracts

`.trellis/config.yaml` section (ships commented in the template; defaults live in code):

```yaml
context_injection:
  max_file_bytes: 32768        # per implement.jsonl / check.jsonl referenced file
  max_artifact_bytes: 65536    # per task artifact (prd.md / design.md / implement.md)
  max_total_bytes: 131072      # whole payload; overflow degrades to index lines
```

- `0` disables that limit; negative / non-int → default + stderr warning.
- Notice strings (byte-frozen, identical in both implementations):
  - truncation: `\n[Trellis: truncated at {cap} bytes — read {path} for the full content]`
  - degradation: `[Trellis: not inlined (total context limit reached) — {path} ({size} bytes): {reason}]`
- Artifact reasons: `Requirements document` / `Technical design document` / `Execution plan document`.
- Accounting: `=== path ===` headers and notices count toward `max_total_bytes`.
  Processing order unchanged: jsonl entries first, then prd → design → implement.md.
- Truncation is UTF-8-safe: back off over continuation bytes; drop an incomplete lead byte.
- `task.py validate` emits non-blocking hygiene warnings (yellow, exit code unchanged):
  code-file extension outside `.trellis/spec/`, `docs/`, `docs-site/`, or the task's
  own dir; and entries larger than `max_file_bytes`.

### 4. Validation & Error Matrix

- unreadable referenced file → skipped (pre-existing behavior, unchanged)
- file > `max_file_bytes` → truncated + truncation notice
- artifact > `max_artifact_bytes` → truncated + truncation notice
- next block would exceed `max_total_bytes` → index line instead of content
- invalid config value → default for that key + stderr warning, never a crash

### 5. Good/Base/Bad Cases

- Good: curated spec files of a few KB — output byte-identical to pre-cap behavior.
- Base: one 2 MiB file → ≤32 KiB inlined + notice; total payload ≤128 KiB.
- Bad (guarded): setting values via env vars or CLI flags — not supported; config.yaml only.

### 6. Tests Required

- Python: `packages/cli/test/scripts/context-injection-limits.integration.test.ts`
  (probe-spawned; fixture matrix: at-cap / 1-over / UTF-8 straddle 2-byte & 3-byte /
  3-file total overflow / `0` disable / config override / golden under-cap / validate warnings).
- TS: `packages/cli/test/templates/pi.test.ts` `describe("pi extension: context injection limits (issue #441)")`
  — same matrix, asserts the exact frozen notice strings.
- Template: `trellis.test.ts` asserts config.yaml's `context_injection` section exists and is fully commented.

### 7. Wrong vs Correct

#### Wrong

Change a notice string or cap semantics in one implementation only, or account
only file bodies (not headers/notices) toward the total budget.

#### Correct

Treat the notice strings, key names, ordering, and accounting rules above as a
frozen cross-implementation contract; change both sides plus both test suites in
the same commit.

> **Warning**: Pi's jsonl block format converged to the Python format
> (`=== path ===` headers) in this change — an approved deviation from Pi's old
> `## file` + `---` format. Directory-type jsonl entries remain Python-only; the
> Pi extension skips them (pre-existing platform difference).

## Parent / Child Task Tree Contract

### Scope / Trigger

Use parent/child task trees when a request contains multiple deliverables that can be planned, implemented, checked, and archived independently. The hierarchy is for work structure and review scope, not for dependency scheduling.

### Signatures

```bash
python3 ./.trellis/scripts/task.py create "<title>" --slug <name> --parent <parent-dir>
python3 ./.trellis/scripts/task.py add-subtask <parent-dir> <child-dir>
python3 ./.trellis/scripts/task.py remove-subtask <parent-dir> <child-dir>
```

### Contracts

| Contract              | Enforcer                                      | Behavior                                                                                                                          |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| New child creation    | `task_store.py`                               | `create --parent` writes the child's `parent` field and appends the child directory name to the parent's `children` list.         |
| Existing task link    | `task_store.py`                               | `add-subtask` links two existing active tasks; the child must not already have a different parent.                                |
| Unlink                | `task_store.py`                               | `remove-subtask` removes the child from the parent's `children` and clears the child's `parent`.                                  |
| Parent responsibility | workflow / skills                             | Parent task owns source requirements, task map, cross-child acceptance, and final integration review.                             |
| Child responsibility  | workflow / skills                             | Child task owns one independently verifiable deliverable, including its own dependencies and acceptance criteria.                 |
| Archive progress      | `script-conventions.md` / `children_progress` | Parent `children` is historical. Archiving a child does not prune it from the parent; missing active children count as completed. |

### Good / Base / Bad Cases

- **Good**: parent task records the overall requirement set and lists child deliverables; each child has its own PRD and any ordering dependency is written in that child's planning artifacts.
- **Base**: a single lightweight task uses no parent/child structure.
- **Bad**: parent task is started as a generic "manager" implementation task while child tasks are the only real deliverables.
- **Bad**: one child depends on another but the dependency is only implied by the parent/child tree. The child artifact must state the dependency explicitly.

### Tests Required

- Workflow template guidance must mention when to use parent/child task trees and where dependency ordering belongs.
- Task system references must match the archive invariant in `script-conventions.md`.

---

## Workflow Step Detail Loading

`.trellis/workflow.md` contains per-phase step detail under `#### X.X` headings, with per-platform variants demarcated by `[Platform Name, ...]` … `[/Platform Name, ...]` blocks.

Load step detail on demand (both commands and hooks use this):

```bash
python3 ./.trellis/scripts/get_context.py --mode phase                                   # Phase Index (no --step)
python3 ./.trellis/scripts/get_context.py --mode phase --step 1.1                        # Step 1.1 (all platforms)
python3 ./.trellis/scripts/get_context.py --mode phase --step 1.2 --platform cursor      # Step 1.2, cursor-filtered
```

Platform markers are filtered by matching `[...]` block membership against the given platform name (case-insensitive; accepts `claude-code` and `Claude Code`). Lines outside any marker block are always kept.

---

## Windows Encoding Fix

All hook scripts that output to stdout must include the Windows encoding fix.
This includes platform-specific `session-start.py` copies that opt out of
`shared-hooks/session-start.py` (`codex/hooks/session-start.py` and
`copilot/hooks/session-start.py`), because they still print JSON payloads with
`ensure_ascii=False`.

When a hook can resolve the Trellis project directory before printing, prefer
the shared helper from `.trellis/scripts/common/__init__.py`:

```python
def configure_project_encoding(project_dir: Path) -> None:
    scripts_dir = project_dir / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from common import configure_encoding  # type: ignore[import-not-found]

        configure_encoding()
    except Exception:
        pass
```

Call it after resolving `project_dir` and before `json.dumps(...,
ensure_ascii=False)` is printed.

For standalone hooks that cannot safely import `.trellis/scripts/common`, use
the local fallback pattern:

```python
# IMPORTANT: Force stdout to use UTF-8 on Windows
# This fixes UnicodeEncodeError when outputting non-ASCII characters
if sys.platform == "win32":
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")  # type: ignore[union-attr]
```

### Tests Required

- Regression coverage must assert every platform-specific Python
  `session-start.py` template contains:
  - `from common import configure_encoding`
  - `configure_encoding()` before printing JSON
  - `ensure_ascii=False` at the JSON output boundary
- When a platform copies rather than consumes `shared-hooks/session-start.py`,
  treat Windows stdout encoding as part of the copied contract, not as an
  optional implementation detail.

---

## SessionStart Hook: additionalContext Size Constraint

### Adaptive First-Reply Notice

#### 1. Scope / Trigger

Trellis uses a one-shot visible acknowledgment as proof that otherwise-hidden
SessionStart context loaded. This contract applies to every live implementation
that already provides that proof: the shared Python hook used by Claude Code,
Cursor, Gemini, Qoder, CodeBuddy, Droid, Kiro, Trae, and ZCode; the Codex hook;
OpenCode's startup plugin; and Pi's SessionStart-equivalent
`before_agent_start` context.

The acknowledgment is an instruction inside the existing context string, not a
new payload field or host UI feature. Copilot remains notice-free until its
model-visible consumption is verified end to end.

#### 2. Signatures

| Implementation | Injection signature | Adaptive notice? |
| --- | --- | ---: |
| `shared-hooks/session-start.py` | Existing shared hook output (`hookSpecificOutput.additionalContext` plus host-specific aliases, or Kiro's plain stdout context) | Yes |
| `codex/hooks/session-start.py` | Existing Codex SessionStart payload when hooks are enabled and approved | Yes |
| `opencode/lib/session-utils.js` + `plugins/session-start.js` | Compact context prepended to the first user message and marked for persistence | Yes |
| `pi/extensions/trellis/index.ts.txt` | Memoized SessionStart-equivalent context added to `before_agent_start.systemPrompt` | Yes |
| `copilot/hooks/session-start.py` | Microsoft's documented `SessionStart.hookSpecificOutput.additionalContext` payload | No |

#### 3. Contracts

- Put `<first-reply-notice>` near the top of model-visible startup context,
  before current-state or other orientation blocks.
- On the first visible assistant reply, briefly acknowledge that Trellis
  SessionStart context loaded, then continue directly with the user's request.
- Choose the acknowledgment language in this exact order:
  1. the language of the user's current request, meaning the user message that
     triggered the first visible reply;
  2. if that request has no clear natural language, an explicitly established
     project communication language;
  3. if neither provides a language, the language-neutral fallback exactly
     `Trellis SessionStart ✓`.
- The acknowledgment must not alter the language used for the remainder of the
  response.
- Emit the acknowledgment only once per session. Do not repeat it on later
  assistant replies.
- Do not infer a fallback language from operating-system locale, source files,
  README frequency, commit history, or other repository content.
- Keep hook payload keys, compact context content, event timing, and
  per-session deduplication unchanged.
- OpenCode persists startup context once per session. Pi memoizes identical
  startup `systemPrompt` bytes per context key.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| First request has a clear natural language | Acknowledgment uses that request language; the rest of the response keeps its intended language |
| Request has no clear natural language and project instructions explicitly establish a communication language | Acknowledgment uses the explicit project language |
| Neither request nor project instructions provide a language | Acknowledgment is exactly `Trellis SessionStart ✓` |
| Later assistant reply in the same session | No repeated acknowledgment |
| Repeated OpenCode message in one session | Startup context is not prepended again |
| Repeated Pi turn with the same context key | Memoized startup `systemPrompt` bytes remain stable |
| Shared or Codex hook output | Existing payload keys and `SessionStart` event name remain unchanged |
| Copilot SessionStart | Context remains notice-free |

#### 5. Good / Base / Bad Cases

- **Good:** an English request receives a brief English proof-of-load sentence,
  then the requested work continues in English.
- **Base:** a code-only request in a project that explicitly establishes Japanese
  as its communication language receives a brief Japanese acknowledgment.
- **Fallback:** a request and project with no language signal receive
  `Trellis SessionStart ✓`, then processing continues directly.
- **Bad:** the notice says `say once in Chinese`, requires `exactly one short
  Chinese sentence`, includes a fixed Chinese acknowledgment, or causes the
  remainder of an otherwise non-Chinese response to switch languages.

#### 6. Tests Required

- Execute shared and Codex hook templates; assert exact payload shape, normal
  compact context blocks, the adaptive priority, neutral fallback, one-shot
  rule, and absence of fixed Chinese wording.
- Build OpenCode context and exercise its plugin entry point; assert adaptive
  notice content, first-message prefix and persistence, and no second injection
  in the same session.
- Exercise Pi `before_agent_start`; assert normal startup/workflow context,
  adaptive notice content, and byte-stable memoized `systemPrompt` behavior.
- Keep Copilot regression assertions notice-free.
- Validate the injected instruction contract deterministically. Do not attempt
  to test an LLM's actual language classification in template tests.

#### 7. Wrong vs Correct

```text
# Wrong: fixed language steers the conversation
<first-reply-notice>Say once in Chinese that Trellis loaded.</first-reply-notice>

# Correct: request language -> explicit project language -> neutral fallback
<first-reply-notice>
Use the language of the user message that triggered this reply. If it has no
clear natural language, use an explicitly established project communication
language. Otherwise output exactly `Trellis SessionStart ✓`. Continue directly
without altering the language of the remainder of the response. Emit once.
</first-reply-notice>
```

### Per-Platform Output Schema

`shared-hooks/session-start.py` is consumed by hosts with **different sessionStart output schemas**. It must emit both shapes so every host reads the context it expects:

```python
{
    # Claude / Gemini / Qoder / CodeBuddy / Droid / Copilot — nested camelCase
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context_text,
    },
    # Cursor — top-level snake_case per cursor.com/docs/agent/hooks
    "additional_context": context_text,
}
```

Each host ignores keys it does not recognize, so dual emission is safe. **Do not refactor to single-format output** — dropping the Cursor key breaks Cursor's auto-context injection for all models (not just GPT). The same multi-format convention exists in `inject-subagent-context.py` (Cursor's `permission` + `updated_input` alongside Claude's `hookSpecificOutput`). ZCode is the exception: its PreToolUse hook should emit the live-tested nested `hookSpecificOutput.updatedInput` shape only, because ZCode's hook diagnostics describe strict stdout schemas.

### Constraint

Claude Code truncates `hookSpecificOutput.additionalContext` at **~20 KB**. When exceeded, only a ~2 KB preview is shown and the full payload is written to a fallback file (`tool-results/hook-*-additionalContext.txt`). AI agents do **not** proactively read the fallback file, so any content past the preview is effectively invisible.

Codex has even tighter limits — users report 40-80 KB payloads consuming most of the context window on large projects.

### Size Budget (measured on Trellis dev repo)

| Block                |       Size | Notes                                                                                                                                 |
| -------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `<session-context>`  |     0.1 KB | Fixed                                                                                                                                 |
| `<current-state>`    |     0.3 KB | Compact developer/git/task state                                                                                                      |
| `<trellis-workflow>` |     4.4 KB | Compact Phase Index after stripping workflow-state blocks, comments, and platform markers; detailed phase bodies are loaded on demand |
| `<guidelines>`       |     0.5 KB | Context order + spec index paths only                                                                                                 |
| `<ready>`            |     0.1 KB | Fixed                                                                                                                                 |
| **Total**            | **6.0 KB** | **Under 20 KB ✓**                                                                                                                     |

Historical note: pre-workflow-rewrite (v0.4.0-beta.10) the payload included a 16 KB `<instructions>` block (start.md content). Later iterations injected a large `<workflow>` block. Current SessionStart uses `<trellis-workflow>` with a compact Phase Index and leaves detailed steps to `/trellis:continue` / phase-context loading.

### Guidelines: Paths-only

Before: every `.trellis/spec/*/index.md` was inlined in `<guidelines>` (10 KB+
on this repo). Main agents rarely need every index at SessionStart, and
sub-agents receive their specific spec / research context through
`implement.jsonl` / `check.jsonl` or pull-based prelude loading.

Now: `<guidelines>` contains only the artifact read order and available spec
index paths, including `.trellis/spec/guides/index.md`. Agents read the relevant
index on demand after the task and phase are known.

### Task Status Guidance

`SessionStart` reports task status and artifact presence, but it does not
approve implementation. Planning tasks stay behind the review gate: lightweight
tasks may be PRD-only, while complex tasks need `prd.md`, `design.md`, and
`implement.md` before `task.py start`.

For `in_progress` tasks, `SessionStart` points the AI to the per-turn
`<workflow-state>` block and restates the implementation/check context order.
Dispatch-vs-inline behavior belongs to workflow-state, skills, and agent
definitions, not to a large SessionStart instruction block.

### Design Decision: Inject Orientation, Not References

**Context**: earlier SessionStart payloads injected full `workflow.md`, full
`get_context.py` output, and sometimes command-sized instruction blocks. Large
repositories crossed host truncation thresholds, leaving the AI with a preview
instead of the actual workflow guidance.

**Decision**: SessionStart now injects only compact orientation:

1. compact current state (developer, git summary, active task, journal, spec
   index count)
2. compact `<trellis-workflow>` Phase Index
3. artifact read order and spec index paths
4. current `<task-status>`

Detailed workflow steps, task artifacts, and spec content are loaded on demand
through `/trellis:continue`, `get_context.py --mode phase --step <X.Y>`, skills,
sub-agent context injection, or pull-based preludes.

**Rule**: When adding content to SessionStart, prefer paths and one-action
orientation over inline reference text. Keep the measured total comfortably
below host truncation limits.

---

## Workflow State Injection: Per-Turn Breadcrumb

### Problem

`SessionStart` only fires once per session. In long conversations, Claude's context compression can push the SessionStart message out of recent context, and the AI forgets the active Trellis task — resulting in workflow drift (skips `check`, forgets to `update-spec`, doesn't return to `finish` after user interruptions).

### Solution: `UserPromptSubmit` hook injecting per-turn breadcrumb

A lightweight hook (`shared-hooks/inject-workflow-state.py`) fires on **every user prompt**, emitting a short `<workflow-state>` block reminding the AI of the active task + expected flow. Keep the payload compact and directive; it is injected every turn.

### Skip keyword (`prompt_injection.skip_keyword`, #427)

A user prompt containing the skip keyword (default `no-trellis`) mutes the per-turn
breadcrumb for that turn only — the hook exits 0 with empty stdout before any task
resolution or file reads. Contract:

- Match rule (frozen, identical in Python hook and OpenCode plugin):
  case-insensitive `(?<![\w-])<keyword>(?![\w-])` — `no-trellisfoo`/`foo-no-trellis`
  do not match; `path/no-trellis.md` does (accepted false-positive).
- Config: `.trellis/config.yaml` → `prompt_injection.skip_keyword`
  (ships commented; default in code via `common.config.get_prompt_injection_config()`;
  quoted `""` explicitly disables the hatch).
- Scope: per-turn breadcrumb ONLY. `session-start.py`, `inject-subagent-context.py`,
  and `inject-shell-session-context.py` must never gain keyword handling.
- Coverage gap: the Pi extension cannot implement this — it has no `input` handler
  (must not rewrite user text) and its `systemPrompt` must stay byte-identical per
  turn for provider prefix caching.
- Dogfood copies to keep patched region-identically: `.claude/hooks/` and
  `.codex/hooks/` `inject-workflow-state.py`.

### Single Source of Truth: `workflow.md` Tag Blocks

Breadcrumb text lives in `workflow.md` as `[workflow-state:STATUS]...[/workflow-state:STATUS]` blocks (same tag style as existing `[Platform, ...]` blocks). Users who fork the Trellis workflow edit **only the markdown**; the hook script stays untouched.

```markdown
[workflow-state:in_progress]
Flow: trellis-implement → trellis-check → trellis-update-spec → finish
Next required action: inspect conversation history + git status, then execute the next uncompleted step in that sequence.
For agent-capable platforms, do NOT edit code in the main session; dispatch `trellis-implement` for implementation and dispatch `trellis-check` before reporting completion.
[/workflow-state:in_progress]
```

STATUS matches `task.json.status`. Built-in: `planning` / `in_progress` / `completed`. Custom statuses (including hyphenated like `in-review`) are recognized — STATUS regex is `[A-Za-z0-9_-]+`.

### Fallback Strategy (hook never crashes)

1. `workflow.md` missing → hardcoded defaults for 3 built-in statuses
2. Tag block missing for a status → same hardcoded default
3. Status unknown (no tag, no default) → generic `"Refer to workflow.md for current step."`
4. No session active task → emit `no_task` pseudo-status breadcrumb instead of silent-exit. Header is `Status: no_task`; body nudges AI to load `trellis-brainstorm` + `task.py create` for multi-step work (or answer directly for trivial asks).

### Design Principle: Per-Turn Hooks Must Not Silent-Exit on "Nothing to Say"

A hook whose job is to **re-ground the AI every turn** should always emit _something_. Silent-exit looks cheaper but defeats the whole purpose — the turn where there's "nothing" is often the most important one (e.g. user switches topics, hops into a fresh subject without an active task).

**Wrong** — hook exits silently when no session active task exists:

```python
task = get_active_task(root)
if task is None:
    return 0  # nothing to inject; goodbye
```

Net effect on a "no task" session: AI sees the Next-Action only at SessionStart; after 20 turns of context compression, the guidance is gone and AI forgets to use `trellis-brainstorm` for new multi-step requests.

**Correct** — treat "no task" as its own pseudo-status with a dedicated breadcrumb template:

```python
task = get_active_task(root)
if task is None:
    breadcrumb = build_breadcrumb(task_id=None, status="no_task", templates=...)
else:
    breadcrumb = build_breadcrumb(*task, templates=...)
```

The same rule applies to every other hook that's positioned as "repeated reminder": if the hook isn't emitting, the reminder loop is broken. The only legitimate silent-exit case is when **the hook doesn't own this codebase at all** (e.g. `.trellis/` not found → definitely not a Trellis project → OK to no-op).

### Platform Support Matrix

| Platform        | Event                                                                                                 | Config File                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code     | `UserPromptSubmit`                                                                                    | `.claude/settings.json`                                                                                            | Auto-distributes via `writeSharedHooks()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Cursor          | ⚠️ Not supported                                                                                      | n/a                                                                                                                | Cursor's `beforeSubmitPrompt` schema accepts only `{continue, user_message}` — no context-injection field exists. Per-turn reminders rely on `sessionStart` only (one-shot at session begin). `inject-workflow-state.py` is not distributed to Cursor; see `SHARED_HOOKS_BY_PLATFORM.cursor` in `shared-hooks/index.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Qoder           | `UserPromptSubmit`                                                                                    | `.qoder/settings.json`                                                                                             | Auto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CodeBuddy       | `UserPromptSubmit`                                                                                    | `.codebuddy/settings.json`                                                                                         | Auto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Droid (Factory) | `UserPromptSubmit`                                                                                    | `.factory/settings.json`                                                                                           | Auto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Gemini CLI      | `UserPromptSubmit`                                                                                    | `.gemini/settings.json`                                                                                            | Auto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Copilot CLI     | `userPromptSubmitted` (camelCase)                                                                     | `.github/copilot/hooks.json`                                                                                       | `bash` + `powershell` dual field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Codex           | `UserPromptSubmit`                                                                                    | `.codex/hooks.json`                                                                                                | **Requires `features.hooks = true` in user's `~/.codex/config.toml` (Codex 0.129+; legacy: `codex_hooks = true`).** Codex 0.129+ also requires running `/hooks` once to approve the installed hook before it activates — until approved, hooks never fire (the trellis-bootstrap fallback in inject-workflow-state.py covers the gap by directing the AI to read `trellis-start` skill manually)                                                                                                                                                                                                                                                                                                                                                                                        |
| OpenCode        | `chat.message` (Bun plugin)                                                                           | `plugins/inject-workflow-state.js`                                                                                 | Equivalent JS implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Kiro            | CLI: `userPromptSubmit` (main `trellis` agent JSON) · IDE: `promptSubmit` (`.kiro/hooks/*.kiro.hook`) | CLI: `.kiro/agents/trellis.json` `hooks` · IDE: `.kiro/hooks/trellis-workflow-state.kiro.hook` (`then.runCommand`) | Plain stdout (NOT the `hookSpecificOutput` JSON envelope) — Kiro adds a hook's raw stdout to conversation context. `inject-workflow-state.py` has a `platform == "kiro"` branch (detected via `KIRO_PROJECT_DIR` env or `.kiro` script path) that prints the bare breadcrumb. **Activation:** CLI users must make `trellis` the active agent (`kiro-cli settings chat.defaultAgent trellis` or `/agent swap trellis`) — Kiro defaults to built-in `kiro_default`. **Real-machine note:** the plain-stdout→context contract (and whether IDE `runCommand` stdout is injected vs only `askAgent`) is per official docs, pending Kiro hardware verification; fallback is `askAgent` + static steering. Sub-agent context injection unchanged via `agentSpawn → inject-subagent-context.py` |
| Trae IDE        | `UserPromptSubmit`                                                                                    | `.trae/hooks.json`                                                                                                 | Auto; shared Python hook written under `.trae/hooks/inject-workflow-state.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### CWD Robustness

The hook uses `find_trellis_root()` to walk up from CWD until it finds `.trellis/`, so it works when the terminal is in a subdirectory (monorepo package, etc.) or when sub-agent spawn inherits a drifted CWD.

ZCode hook commands must also make the script path itself CWD-robust. Use the ZCode project-root placeholder in `.zcode/config.json`, for example `{{PYTHON_CMD}} "${ZCODE_PROJECT_DIR}/.zcode/hooks/inject-workflow-state.py"`, rather than `{{PYTHON_CMD}} .zcode/hooks/inject-workflow-state.py`. The Python hook's `find_trellis_root()` only runs after Python opens the script; a cwd-relative command can fail before the hook starts if ZCode launches from a nested directory such as `.github/docs/...`.

### Why No State Machine / No Extra `task.json` Fields

After first-principles analysis (historical task:
`.trellis/tasks/archive/2026-04/04-17-workflow-enforcement-v2/prd.md`), we
dropped the original design's `current_phase` string / `phase_history` /
`checkpoints` / 7 new `task.py` commands / skill tail blocks. The core insight:
**workflow.md Phase 1.0/1.1/... is documentation layering, not runtime state**.
The existing `task.json.status` (`planning` / `in_progress` / `completed`) is
sufficient to express task lifecycle; sub-phase position is inferred by the AI
from conversation history + git state.

This keeps state minimal, avoids the "task.json drifts from filesystem reality" class of bugs, and is trivially customizable — users modify one markdown file, not Python/TypeScript.

---

## Bootstrap & Joiner Task Auto-Generation

`trellis init` generates a first-session task based on checkout state. Three branches dispatch off two filesystem flags:

| `.trellis/` exists? | `.trellis/.developer` exists? | Meaning                                                           | Task generated                           |
| ------------------- | ----------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| no                  | n/a                           | First-time `init` on this project                                 | `00-bootstrap-guidelines` (creator flow) |
| yes                 | no                            | Fresh clone / per-checkout first-init (new machine, new teammate) | `00-join-<slug>` (joiner flow)           |
| yes                 | yes                           | Same dev re-running init                                          | none (no-op)                             |

### Design Decision: `.developer` File Is the Per-Checkout Signal

**Context**: we need a signal for "this checkout has never been init'd by this developer before" to trigger joiner onboarding.

**Options Considered**:

1. `.trellis/workspace/<name>/` directory existence — ❌ this dir is committed to git, so a fresh clone already has it
2. A registry file listing onboarded developers — ❌ needs migration + bookkeeping, over-engineered for single-user checkouts
3. `.trellis/.developer` file existence — ✅ **chosen**

**Decision**: Use `.trellis/.developer` (gitignored) as the per-checkout onboarding signal.

**Why**: `.trellis/.developer` is declared in `.trellis/.gitignore` (template `gitignore.txt`), so it is never committed. A fresh clone has an empty `.developer` slot by construction; the first `init` writes it. Subsequent same-machine re-inits see the file and no-op.

**Consequence (accepted)**: Same developer on two machines (laptop A + laptop B) gets a joiner task on laptop B. This is fine — it's a chance to re-read the spec, and archiving is one command.

**Anti-pattern**: Do not use `.trellis/workspace/<name>/` existence as "this developer already onboarded" — that directory is the journal archive and belongs to git.

### Gotcha: Joiner Dispatch Must Be Wired in Two Places

`trellis init` has two code paths that both reach the end of initialization but through different branches of `init()`. Any new init-time trigger (joiner onboarding, future first-session tasks, etc.) must be registered in **both**:

**Path 1 — Main dispatch** (`src/commands/init.ts`, near the end of `init()`):

- Reached only when `!isFirstInit` is false **OR** `options.force` / `options.skipExisting` is set
- Fires from the block that runs after `createWorkflowStructure` + `init_developer.py`

**Path 2 — Re-init fast path** (`handleReinit`, inside `doAddDeveloper` branch):

- Reached when `.trellis/` already exists AND user runs default `trellis init --user <name>` (no `--force`, no `--skip-existing`)
- `init()` short-circuits via `if (!isFirstInit && !options.force && !options.skipExisting) { await handleReinit(...); return; }` — main dispatch is **never executed**

Both paths must capture the pre-existing `.developer` state **before** running `init_developer.py` (which writes the file), then use that snapshot to decide whether joiner generation applies.

```typescript
// Path 1 (init end) — snapshot at init() start
const hadDeveloperFileAtStart = fs.existsSync(developerFilePath);
// ... later, after init_developer.py:
if (!isFirstInit && !hadDeveloperFileAtStart) {
  createJoinerOnboardingTask(cwd, developerName);
}

// Path 2 (handleReinit) — snapshot just before init_developer.py
const hadDeveloperFileBefore = fs.existsSync(developerFilePath);
execSync(`${pythonCmd} ${initDeveloperScript} "${devName}"`, { ... });
if (!hadDeveloperFileBefore) {
  createJoinerOnboardingTask(cwd, devName);
}
```

**Test coverage requirement**: integration tests must cover BOTH paths. The quick way to detect regressions is to run `init` without `force: true` and assert joiner-task creation — tests that all pass `{ force: true }` will miss Path 2 bugs entirely.

---

## Common Mistakes

### Forgot to add entry to PLATFORM_FUNCTIONS

**Symptom**: `trellis init` configures the platform, but `trellis update` doesn't track its template files.

**Fix**: Add entry with `collectTemplates` function to `PLATFORM_FUNCTIONS` in `src/configurators/index.ts`.

### Missing platform in cli_adapter.py

**Symptom**: Python scripts fail with "Unsupported platform" error.

**Fix**: Add platform to `Platform` literal type, `config_dir_name` property, and `get_cli_adapter()` validation in `cli_adapter.py`.

### Wrong command format in templates

**Symptom**: Slash commands don't work or show wrong format.

**Fix**: Check platform's command format and update all command references in templates.

### Codex template copied from project `.agents/skills` instead of `src/templates`

**Symptom**: Generated templates accidentally include repo-specific customizations and drift from template source-of-truth.

**Fix**: Always use `src/templates/{platform}/...` as source templates for `init/update`. Do not copy from project runtime directories.

### Codex skill directory exists but `SKILL.md` is missing

**Symptom**: Template loading fails with `ENOENT` when scanning skills.

**Fix**: Keep `src/templates/codex/skills/<skill-name>/SKILL.md` complete; when removing a skill, delete both `SKILL.md` and the directory.

### EXCLUDE_PATTERNS missing `.js` in configurator

**Symptom**: In production builds (`dist/`), `trellis init` copies compiled `index.js` (and `.js.map`, `.d.ts`) into the user's config directory (e.g., `.gemini/index.js`).

**Cause**: The configurator's `EXCLUDE_PATTERNS` doesn't filter out `.js` files. In development (`src/`), only `.ts` files exist so the issue is invisible. In production, `tsc` compiles `index.ts` → `index.js` into `dist/templates/{platform}/`, and `copyDirFiltered` copies it.

**Fix**: Ensure `EXCLUDE_PATTERNS` includes `.js`, `.js.map`, `.d.ts`, `.d.ts.map` — matching the Cursor configurator pattern. The Claude configurator correctly excludes these; copy from there.

**Prevention**: When creating a new configurator, copy the full `EXCLUDE_PATTERNS` from an existing one (e.g., `cursor.ts`), don't write from scratch.

### Missing CLI flag or InitOptions field

**Symptom**: `trellis init --{platform}` doesn't work.

**Fix**: Add `--{platform}` option in `src/cli/index.ts` and `{platform}?: boolean` in `InitOptions` in `src/commands/init.ts`. These are static declarations that cannot be derived from the registry.

### Template placeholder not resolved in collectTemplates

**Symptom**: `trellis update` auto-updates platform files on every run, even when nothing changed. The update summary shows hooks/settings as "changed".

**Cause**: `configurePlatform()` resolves `{{PYTHON_CMD}}` to `python3`/`python` when writing files during init, but `collectPlatformTemplates()` returns raw templates with `{{PYTHON_CMD}}` unresolved. The hash comparison sees them as different.

**Fix**: Apply `resolvePlaceholders()` (from `configurators/shared.ts`) in the `collectTemplates` lambda in `PLATFORM_FUNCTIONS`. Any new placeholder added to templates must be resolved in **both** `configure()` and `collectTemplates()`.

### Init-time settings.json key injection serialized differently from update's preservation

**Symptom**: On a freshly initialized project that used an opt-in feature (e.g., `--with-statusline`), the very first `trellis update` reports `.claude/settings.json` as "Template updated (will auto-update)", rewrites it, and leaves a spurious backup — with zero actual changes.

**Cause**: Init injected the key at a hand-picked position in the template (e.g., `statusLine` "between `env` and `hooks`"), but update's preservation step (`preserveExistingClaudeStatusLine()` in `update.ts`) re-adds preserved keys via plain `parse → assign → stringify`, which appends at the end. The two serializations differ byte-wise, so the content comparison flags a false change.

**Fix**: The init-time injection must mirror the update-time preservation routine byte-for-byte (same parse → assign → stringify, same indent). Pinned by a regression test asserting `settings.json` byte-identity across `update --force` on a fresh opted-in project.

**Rule**: A feature that both (a) injects a key into a generated JSON file at init and (b) preserves that key during update must produce identical serialization on both paths — key order is part of the contract. Assert byte-identity (not deep-equality) in tests; deep-equal comparisons cannot catch key-order drift.

### Template listed in update but not created by init

**Symptom**: `trellis update` always detects a "new file" to add, even on a freshly initialized project with the same version.

**Cause**: `collectTemplateFiles()` in `update.ts` lists a file that `createSpecTemplates()` / `createWorkflowStructure()` in init never creates. The two template lists are out of sync.

**Fix**: Ensure every file listed in `collectTemplateFiles()` is actually created during `init`. If a file is project-specific (not a user template), do not include it in the update template list.

### Project-type-conditional content not gated in init or update

**Symptom**: Pure backend project gets empty frontend spec templates after `trellis init`. After user deletes the unwanted `spec/frontend/` dir, `trellis update` recreates it.

**Cause (init)**: `createSpecTemplates()` in `workflow.ts` received `projectType` but ignored it (parameter named `_projectType`). All project types got both backend and frontend spec dirs.

**Cause (update)**: `collectTemplateFiles()` in `update.ts` unconditionally included all 13 backend + frontend spec files in the template map, without checking whether `spec/backend/` or `spec/frontend/` actually existed on disk.

**Fix (init)**: Use `projectType` to conditionally create spec dirs:

- `"backend"` → guides + backend only
- `"frontend"` → guides + frontend only
- `"fullstack"` / `"unknown"` → guides + both

**Fix (update)**: Wrap backend/frontend spec file blocks in `fs.existsSync()` checks (same pattern as `getConfiguredPlatforms()` for platform dirs).

**Rule**: When init creates content conditionally based on project type, update must check for directory existence before including files in its template map. The two paths must agree.

### PRD assumed platform capabilities without research

**Symptom**: Implementation builds the wrong abstraction (e.g., commands instead of skills, or vice versa). Requires major rework after discovery.

**Cause**: PRD was written based on assumptions about how a platform works (e.g., "Trae uses commands like Kilo") without verifying against official documentation or GitHub repos.

**Fix**: Before writing the PRD for a new platform, research the platform's actual extension mechanism:

- Check official docs for supported formats (skills, commands, rules, workflows)
- Check the platform's GitHub repo for directory structure conventions
- Verify how users invoke extensions (slash command, AI-automatic matching, manual mention)

**Prevention**: Add a "Research" step before PRD finalization. The PRD should cite sources for platform capability claims.

### Updated command/skill content in platform template instead of common/

**Symptom**: After updating a command in one platform's template, other platforms still use old content.

**Cause**: Since v0.5.0, command and skill content lives in `src/templates/common/` as the single source of truth. Editing platform-specific copies creates drift.

**Fix**: Always edit templates in `src/templates/common/commands/` or `src/templates/common/skills/`. All platforms derive their content from there via `resolveCommands()` / `resolveSkills()` / `resolveAllAsSkills()`.

### Stale platform references in copied templates

**Symptom**: A Qoder skill references "Claude Code" syntax or a Kiro-specific invocation pattern.

**Cause**: When creating agent templates for a new platform by copying from an existing one, platform-specific references (command syntax, platform names, invocation instructions) weren't updated.

**Fix**: After copying agent templates, search-and-replace all references to the source platform. Check for:

- Platform name mentions (e.g., "Claude Code", "Kiro")
- Command invocation syntax (e.g., `/trellis:xxx` vs `$skill-name`)
- Config directory references (e.g., `.claude/` vs `.qoder/`)

### Forgot to use shared hooks

**Symptom**: Platform's hooks directory contains duplicated Python scripts instead of using `writeSharedHooks()`.

**Cause**: When adding a new agent-capable platform, developer manually copied hook scripts from another platform instead of calling `writeSharedHooks(hooksDir)` from `shared.ts`.

**Fix**: Use `writeSharedHooks()` which copies platform-independent scripts from `src/templates/shared-hooks/`. Only create platform-specific hook files when the platform has unique hook integration points (e.g., Claude Code).

### Hardcoded JSONL fallback paths

**Symptom**: Agent definitions reference JSONL files that don't exist (e.g., `debug.jsonl`, `plan.jsonl`).

**Cause**: Only `implement.jsonl` and `check.jsonl` exist as task JSONL files. Agent templates were copied from older versions that referenced removed JSONL types.

**Fix**: Ensure agent `.md` definitions only reference `implement.jsonl` and `check.jsonl`. The debug, plan, and dispatch agents have been removed.

### `__pycache__` in template hooks directory causes EISDIR crash

**Symptom**: Tests fail with `EISDIR: illegal operation on a directory, read` in `getAllHooks()` at `src/templates/claude/index.ts`.

**Cause**: Running a Python hook locally (e.g., `python3 session-start.py` for testing) creates `__pycache__/` inside `src/templates/{platform}/hooks/`. `listFiles("hooks")` returns `__pycache__` as an entry, then `readFileSync("hooks/__pycache__")` fails because it's a directory.

**Fix**: `rm -rf src/templates/*/hooks/__pycache__`. Consider adding `__pycache__` to `.gitignore` or filtering directories in `listFiles()`.

**Prevention**: Don't run Python hooks directly from `src/templates/` during development. Use `/tmp` copies or the installed project copy instead.

### Added an init-time trigger but forgot the `handleReinit` fast path

**Symptom**: The trigger works when users pass `--force` / `--skip-existing` / run init on an empty dir, but the default `trellis init --user <name>` on an existing checkout silently does nothing. Integration tests pass.

**Cause**: `init()` at `src/commands/init.ts` early-returns into `handleReinit` when `.trellis/` already exists and neither `--force` nor `--skip-existing` is set. Main dispatch at the end of `init()` is never reached. If the new trigger is only wired into main dispatch, the most common real-user path is uncovered.

**Fix**: Wire the trigger into BOTH (a) the main-dispatch block near the end of `init()` AND (b) `handleReinit`'s `doAddDeveloper` / `doAddPlatforms` branch, whichever is relevant. Capture any pre-init filesystem state (e.g., `.developer` existence) in each path separately, before scripts that mutate it run.

**Prevention**: Integration tests must cover the default path WITHOUT `force: true`. Any test using `force: true` bypasses `handleReinit` and is not testing real-user behavior. See "Bootstrap & Joiner Task Auto-Generation" above for the canonical two-point wiring pattern.

---

## Method-skill composition contract

Trellis workflow roles may compose optional external `SKILL.md` methods through
the `method_skills` configuration slots: `brainstorm`, `implement`, `check`, and
`debug`.

- Trellis owns lifecycle state, task scope, artifacts, phase gates, Git
  restrictions, dispatch, and reporting. Method instructions are subordinate.
- Project-local references resolve from the repository root and must remain
  inside it. `global:<name>` resolves below `~/.agents/skills/` and accepts a
  single safe skill name, not an arbitrary path.
- A reference names a directory containing a readable `SKILL.md`. Resolution
  preserves configuration order and drops canonical-path duplicates after the
  first occurrence.
- Invalid or missing references emit structured diagnostics and never stop the
  built-in Trellis role.
- Inline and delegated roles resolve methods through
  `get_context.py --mode method-skills`. Every generated implement/check agent
  prompt carries that self-load contract; native hooks may additionally inject
  the already-resolved method list. New platform integrations must preserve the
  prompt-level fallback so hook availability cannot remove the capability.
- Init and update share the managed resolver runtime. Config additions use the
  additive `configSectionsAdded` migration path so user-edited config files are
  not overwritten.
- Method installation, registry discovery, dependency recursion, automatic
  selection, version locking, and complete Trellis-role replacement are outside
  this contract.

## Reference PRs

| PR                            | Platform         | Pattern                                        | Notes                                                                                          |
| ----------------------------- | ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| feat/gemini branch            | Gemini CLI       | Agents + shared hooks                          | First non-Markdown command format (TOML settings)                                              |
| main                          | Antigravity      | Workflows (derived from Codex)                 | No physical templates — runtime adaptation from Codex skills                                   |
| #71                           | Qoder            | Skills (like Codex/Kiro)                       | Skills with YAML frontmatter; Trae was dropped (IDE-only, no deterministic invocation trigger) |
| feat/v0.5.0-beta              | All 13 platforms | Unified template architecture                  | Common templates + shared hooks + `createTemplateReader()` factory                             |
| `04-21-bootstrap-onboard-gap` | n/a              | Three-branch init dispatch + joiner onboarding | `.developer` file as per-checkout signal; documents the `handleReinit` two-point wiring        |
