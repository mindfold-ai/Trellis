# Platform Integration Guide

How to add support for a new AI CLI platform (like Claude Code, Cursor, Gemini CLI, OpenCode, Codex, Kilo, Kiro, Qoder, CodeBuddy, Copilot, Droid, Pi, Windsurf, Antigravity).

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

| File | Change |
|------|--------|
| `src/types/ai-tools.ts` | Add to `AITool` union type |
| `src/types/ai-tools.ts` | Add to `CliFlag` union type |
| `src/types/ai-tools.ts` | Add to `TemplateDir` union type |
| `src/types/ai-tools.ts` | Add entry to `AI_TOOLS` record (name, configDir, cliFlag, defaultChecked, hasPythonHooks, templateDirs) |

**This single entry automatically propagates to**: `BACKUP_DIRS`, `TEMPLATE_DIRS`, `getConfiguredPlatforms()`, `cleanupEmptyDirs()`, `initializeHashes()`, init `TOOLS[]` prompt, Windows detection.

### Step 2: CLI Flag

| File | Change |
|------|--------|
| `src/cli/index.ts` | Add `--{platform}` option |
| `src/commands/init.ts` | Add `{platform}?: boolean` to `InitOptions` interface |

> Note: Commander.js options and TypeScript interfaces require static declarations — cannot be derived from registry. A compile-time assertion `_AssertCliFlagsInOptions` in `init.ts` will catch missing `InitOptions` fields — you'll get a build error if `CliFlag` has a value not present in `InitOptions`.

### Step 3: Configurator (function registry)

| File | Change |
|------|--------|
| `src/configurators/{platform}.ts` | Create new configurator (copy from existing, export `configure{Platform}`) |
| `src/configurators/index.ts` | Add entry to `PLATFORM_FUNCTIONS` with `configure` and optional `collectTemplates` |

### Step 4: Templates

> **Key concept**: Most platforms now derive their content from `src/templates/common/` (commands + skills) via `resolvePlaceholders()` in `configurators/shared.ts`. Platform-specific template directories only contain **agents**, **settings/hooks config**, and platform-specific overrides. The `createTemplateReader()` factory from `src/templates/template-utils.ts` eliminates boilerplate in platform `index.ts` files.

**Standard with shared hooks** (Qoder, CodeBuddy, Droid, Cursor, Gemini):

| Directory | Contents |
|-----------|----------|
| `src/templates/{platform}/` | Root directory |
| `src/templates/{platform}/index.ts` | Uses `createTemplateReader(import.meta.url)` — exports agents, settings |
| `src/templates/{platform}/agents/` | Agent definitions (`.md` files — implement, check, research) |
| `src/templates/{platform}/settings.json` | Platform settings (may use `{{PYTHON_CMD}}` placeholder) |

> Note: These platforms use `writeSharedHooks()` from `shared.ts` to copy platform-independent hook scripts from `src/templates/shared-hooks/` into each platform's hooks directory. Commands and skills come from `src/templates/common/` via `resolveCommands()` / `resolveSkills()` / `resolveAllAsSkills()`. The `createTemplateReader()` factory provides `listMdAgents()`, `getSettings()`, etc. without per-platform boilerplate.

**Claude Code pattern** (full hooks + agents + settings):

| Directory | Contents |
|-----------|----------|
| `src/templates/claude/` | Root directory |
| `src/templates/claude/index.ts` | Export functions for agents, hooks, settings |
| `src/templates/claude/agents/` | Agent definitions (`.md` files — implement, check, research) |
| `src/templates/claude/hooks/` | Claude-specific hook scripts (`.py` files) |
| `src/templates/claude/settings.json` | Claude settings (uses `{{PYTHON_CMD}}` placeholder) |

> Note: Claude Code is the reference platform. It has its own hooks directory (not shared-hooks) because Claude hooks have platform-specific integration points. Commands come from `src/templates/common/commands/`.

**JS plugin pattern** (OpenCode):

| Directory | Contents |
|-----------|----------|
| `src/templates/{platform}/` | Root directory |
| `src/templates/{platform}/commands/trellis/` | Slash commands (`.md` files) |
| `src/templates/{platform}/plugin/` | JS plugin files |
| `src/templates/{platform}/lib/` | JS library files |
| `src/templates/{platform}/package.json` | Plugin dependencies |

> Note: OpenCode uses JS plugins instead of Python hooks, has no `index.ts` template module, and has no `collectTemplates` — so `trellis update` does not track OpenCode template files. If a new platform uses JS plugins, follow this pattern.

**TypeScript extension pattern** (Pi Agent):

| Directory | Contents |
|-----------|----------|
| `src/templates/{platform}/` | Root directory |
| `src/templates/{platform}/index.ts` | Uses `createTemplateReader(import.meta.url)` — exports agents, settings, extension source |
| `src/templates/{platform}/agents/` | Agent definitions (`.md` files — implement, check, research) |
| `src/templates/{platform}/extensions/trellis/index.ts.txt` | Project-local extension source written to `.pi/extensions/trellis/index.ts` |
| `src/templates/{platform}/settings.json` | Platform settings that enable extension, skills, and prompts |

> Note: Pi Agent uses project-local TypeScript extensions instead of Trellis Python hooks. Keep generated hooks under `.pi/extensions/`, write prompt templates under `.pi/prompts/trellis-*.md`, write Agent Skills under `.pi/skills/`, and do not copy `shared-hooks/*.py` into `.pi/`. Do not redirect Pi to shared `.agents/skills` until shared Agent Skill text is platform-neutral; Codex and Pi command references can differ. For the nested Pi launcher contract, see "Scenario: Pi Sub-Agent Launcher".
>
> Project-local package isolation rule: when Trellis enables Pi for a project, `.pi/settings.json` must include a project-level `packages["npm:pi-subagents"]` override with empty resource lists (`agents`, `commands`, `skills`, `prompts`, `extensions`) to isolate global `npm:pi-subagents` effects from the repository while keeping the user's global Pi environment intact outside the project.

**Skills pattern** (Codex, Kiro):

| Directory | Contents |
|-----------|----------|
| `src/templates/{platform}/` | Root directory |
| `src/templates/{platform}/index.ts` | Uses `createTemplateReader(import.meta.url)` — exports agents |
| `src/templates/{platform}/agents/` | Agent definitions (platform-specific format) |
| `src/templates/{platform}/settings.json` | Platform settings (optional) |

> Note: Codex/Kiro use `resolveAllAsSkills()` from `shared.ts` to generate all templates as SKILL.md files with YAML frontmatter. Skills are written via `writeSkills()`.
>
> **Qoder is a hybrid** — it has native Custom Commands (`.qoder/commands/{name}.md`) with required YAML frontmatter (`name` + `description`, flat layout per Qoder CLI docs), so session-boundary commands (`finish-work`, `continue`) go there via `resolveCommands()` + `wrapWithCommandFrontmatter()`, while the 5 auto-trigger workflows stay as `.qoder/skills/` via `resolveSkills()`. Use the `COMMAND_DESCRIPTIONS` registry in `shared.ts` (separate from `SKILL_DESCRIPTIONS`) for the short palette blurbs — command descriptions are one-line imperatives aimed at the user; skill descriptions are long prose aimed at the AI matcher.
>
> **Codex has a two-layer directory model:**
>
> | Layer | Install Path | Template Source | Purpose |
> |-------|-------------|-----------------|---------|
> | Shared skills | `.agents/skills/` | Generated from `common/` templates | Cross-platform skills (agentskills.io standard) |
> | Codex config/agents/hooks | `.codex/` | `src/templates/codex/{agents,hooks.json}` | Config, custom agents, SessionStart hook |
>
> **Key rules:**
> - Shared skills in `.agents/skills/` must NOT contain platform-specific references (no `--platform codex`, no `codex exec`)
> - Agent TOML format: `name` + `description` + `developer_instructions` + optional `sandbox_mode` (NOT `[sandbox_read_only]` + `prompt`)
> - Codex hooks require `features.codex_hooks = true` in user config (experimental as of v0.116.0)
> - Platform detection uses `.codex/` only — `.agents/skills/` alone does NOT trigger codex detection
> - `configDir` is `".codex"`, with `supportsAgentSkills: true` to auto-include `.agents/skills` in managed paths

#### Rule: `.agents/skills/` writes use `resolvePlaceholdersNeutral()`

`.agents/skills/` is a **shared destination**: multiple configurators (Codex, Gemini CLI 0.40+ via the workspace alias, future agentskills.io consumers) all write into the same path. Per-platform `{{CMD_REF:name}}` resolution (`$name` for Codex, `/trellis:name` for Gemini, etc.) makes the same `<skill>/SKILL.md` differ byte-for-byte depending on which configurator ran last → "last-writer-wins" content collisions and `.template-hashes.json` churn.

**Rule**: Anything written under `.agents/skills/` MUST be rendered via `resolvePlaceholdersNeutral()` (in `configurators/shared.ts`), which substitutes `` `name` (Trellis command) `` for `{{CMD_REF:name}}` instead of a platform prefix. All other placeholders (`{{CLI_FLAG}}`, `{{EXECUTOR_AI}}`, `{{USER_ACTION_LABEL}}`, conditionals, `{{PYTHON_CMD}}`) still resolve from the platform context — those don't appear in the 5 shared workflow skills (`brainstorm`, `before-dev`, `check`, `break-loop`, `update-spec`), so the rendered output stays identical across writers.

Per-platform skill directories (`.claude/skills/`, `.cursor/skills/`, `.qoder/skills/`, etc.) keep using `resolvePlaceholders()` — `{{CMD_REF}}` resolves to the platform-correct slash form there, because no other configurator writes those paths.

**Codex-only files under `.agents/skills/`** (currently `trellis-continue/SKILL.md` and `trellis-finish-work/SKILL.md`, written via `resolveAllAsSkillsNeutral()`) are an explicit exception: only Codex writes them, so byte-identity across platforms is not required and they may use `{{CLI_FLAG}}` / `{{PYTHON_CMD}}`. They still go through the neutral helper to keep `{{CMD_REF}}` neutralized for consistency with the surrounding shared skills.

**Wrong**:
```typescript
// Codex configurator
files.set(".agents/skills/check/SKILL.md", resolvePlaceholders(tmpl, codexCtx));
// Gemini configurator (later)
files.set(".agents/skills/check/SKILL.md", resolvePlaceholders(tmpl, geminiCtx));
// → byte-different SKILL.md from the same template; whoever runs last wins
```

**Correct**:
```typescript
files.set(".agents/skills/check/SKILL.md", resolvePlaceholdersNeutral(tmpl, ctx));
// → byte-identical regardless of which configurator wrote it
```

**Kiro JSON agent pattern** (Kiro):

| Directory | Contents |
|-----------|----------|
| `src/templates/kiro/` | Root directory |
| `src/templates/kiro/index.ts` | Uses `createTemplateReader(import.meta.url)` — exports agents via `listJsonAgents()` |
| `src/templates/kiro/agents/` | Agent definitions (`.json` files) |

> Note: Kiro is unique in using JSON format for agent definitions (not Markdown). The `createTemplateReader()` factory provides `listJsonAgents()` specifically for this. Skills are generated from `common/` templates via `resolveAllAsSkills()`.

**Workflows pattern** (Kilo):

| Directory | Contents |
|-----------|----------|
| (no template directory) | Kilo generates from `common/` templates at runtime |

> Note: Kilo uses `resolveCommands()` + `resolveSkills()` to generate workflows and skills. No physical template files needed.

**Workflows pattern** (Antigravity):

| Directory | Contents |
|-----------|----------|
| (no template directory) | Antigravity derives from Codex skills at runtime |

> Note: Antigravity has no physical template files — workflow content is **derived from Codex skills at runtime** via `adaptSkillContentToWorkflow()`. The config dir is `.agent/workflows` (not `.agent/`). Workflows are triggered with `/workflow-name` slash commands. When adding a new Codex skill, Antigravity automatically picks it up.

**Copilot pattern** (prompts + hooks):

| Directory | Contents |
|-----------|----------|
| `src/templates/copilot/` | Root directory |
| `src/templates/copilot/index.ts` | Export functions for prompts, hooks |
| `src/templates/copilot/prompts/` | Prompt files (`.prompt.md`) |
| `src/templates/copilot/hooks/` | Hook scripts (`.py` files) |
| `src/templates/copilot/hooks.json` | Hooks configuration |

> Note: Copilot uses `.prompt.md` format for commands (not plain `.md`). Hooks use `hooks.json` (not `settings.json`).

**Droid pattern** (droids + settings):

| Directory | Contents |
|-----------|----------|
| `src/templates/droid/` | Root directory |
| `src/templates/droid/index.ts` | Uses `createTemplateReader(import.meta.url)` — exports droids, settings |
| `src/templates/droid/droids/` | Droid definitions (`.md` files — implement, check, research) |
| `src/templates/droid/settings.json` | Droid settings |

> Note: Droid uses "droids" terminology instead of "agents" but follows the same pattern. Uses `writeAgents()` with the droids directory.

**Windsurf pattern** (no template directory):

| Directory | Contents |
|-----------|----------|
| (no template directory) | Windsurf generates from `common/` templates + shared hooks at runtime |

> Note: Windsurf uses `resolveCommands()` for workflows and `resolveSkills()` for auto-triggered skills. Shared hooks are written via `writeSharedHooks()`. No platform-specific template files needed.

**Required commands/skills**: All platforms must include the following (adapted to each platform's format). Content comes from `src/templates/common/`:

| Type | Name | Purpose | Required |
|------|------|---------|----------|
| Command | `start` | Session initialization | Yes |
| Command | `finish-work` | Pre-commit checklist | Yes |
| Skill | `before-dev` | Read development guidelines (auto-discovers package specs) | Yes |
| Skill | `brainstorm` | Requirements discovery | Yes |
| Skill | `check` | Check code quality (auto-discovers relevant specs) | Yes |
| Skill | `break-loop` | Post-debug analysis | Yes |
| Skill | `update-spec` | Update code-spec docs | Yes |

> **Rule**: When a new command/single-file workflow skill is added, it is added to `src/templates/common/commands/` or `src/templates/common/skills/` — ALL platforms pick it up automatically via `resolveCommands()` / `resolveSkills()` / `resolveAllAsSkills()`. Check `src/templates/common/` as the reference source.

**Bundled built-in skills**: Multi-file skills with references/assets live under `src/templates/common/bundled-skills/<skill-name>/` and are installed through the same platform skill roots as workflow skills.

#### Scenario: Multi-file bundled skills

##### 1. Scope / Trigger

Use bundled skills when a built-in skill needs files beyond `SKILL.md`, such as `references/`, examples, or assets. Do not flatten large reference trees into `src/templates/common/skills/*.md`; single-file workflow skills stay there, while multi-file built-ins use `src/templates/common/bundled-skills/<skill-name>/`.

##### 2. Signatures

| Helper | Contract |
|--------|----------|
| `getBundledSkillTemplates()` | Recursively reads `bundled-skills/*/` and returns POSIX relative file paths under each skill directory |
| `resolveBundledSkills(ctx)` | Resolves placeholders without adding frontmatter; bundled `SKILL.md` already owns frontmatter |
| `writeSkills(skillRoot, skills, bundledSkills)` | Writes both single-file workflow skills and bundled skill files |
| `collectSkillTemplates(skillRoot, skills, bundledSkills)` | Returns the same skill file set for `collectTemplates()` / update hash tracking |

##### 3. Contracts

- Bundled skill source path: `src/templates/common/bundled-skills/<skill-name>/`.
- Bundled skill target path: `<platform-skill-root>/<skill-name>/<relative-file>`.
- `SKILL.md` inside a bundled skill owns its own YAML frontmatter; `wrapWithSkillFrontmatter()` must not be applied to bundled files.
- Relative file paths returned from the common template reader are POSIX-style, stable, and relative to the skill directory.
- `collectTemplates()` must return byte-identical content for every file that `configure*()` writes.

##### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| Bundled skill directory is missing | Return no bundled skills; single-file workflow skill generation continues |
| Bundled skill has nested references | Preserve the nested relative path under every platform skill root |
| Bundled `SKILL.md` contains placeholders | Resolve placeholders with the platform `TemplateContext` |
| Platform writes bundled skill but omits it from `collectTemplates()` | Failing test; update hash tracking would drift |
| Bundled file path uses OS-specific separators | Normalize to POSIX relative paths before adding to template maps |

##### 5. Good/Base/Bad Cases

- Good: `trellis-meta` installs as `<platform-skill-root>/trellis-meta/SKILL.md` plus `references/**`, and `collectPlatformTemplates(platform)` returns the same files.
- Base: no bundled skills exist; existing `resolveSkills()` / `resolveAllAsSkills()` behavior remains unchanged.
- Bad: platform-specific configurators copy `trellis-meta` manually, creating a second installer that update hash tracking can miss.

##### 6. Tests Required

- Init integration test proving at least Claude and Codex write `trellis-meta/SKILL.md` plus one reference file.
- Configurator test proving configured files are byte-for-byte equal to `collectPlatformTemplates()` for every platform that writes skills.
- Regression test proving `.trellis/.template-hashes.json` includes bundled skill reference files after init.

##### 7. Wrong vs Correct

Wrong:

```typescript
files.set(".claude/skills/trellis-meta/SKILL.md", metaSkillContent);
```

Correct:

```typescript
await writeSkills(skillRoot, resolveSkills(ctx), resolveBundledSkills(ctx));
for (const [filePath, content] of collectSkillTemplates(skillRoot, skills, bundled)) {
  files.set(filePath, content);
}
```

**Rule**: Do not add a parallel installer for built-in multi-file skills. If `trellis init` writes a bundled skill file, the platform's `collectTemplates()` path must return the same relative path and byte-identical content so `.trellis/.template-hashes.json` can track it. At minimum, tests must cover one reference file (for example `trellis-meta/references/core/template-pipeline.md`) and the platform-specific install root.

### Step 5: Template Extraction

| File | Change |
|------|--------|
| `src/templates/extract.ts` | Only needed if platform has a physical template directory. Most new platforms generate from `common/` templates and don't need extraction functions |

> Note: Platforms using `createTemplateReader(import.meta.url)` in their `index.ts` handle their own template reading. The `extract.ts` functions (`getTrellisSourcePath()`, `readTrellisFile()`, `copyTrellisDir()`) are primarily for the `.trellis/` workflow files, not platform templates.

### Step 6: Python Scripts (independent runtime)

> **Warning**: `cli_adapter.py` uses if/elif/else chains with NO exhaustive check. New platforms silently fall through to the `else` branch (Claude defaults). You MUST add explicit branches for **every method** listed below.

| File | Change |
|------|--------|
| `src/templates/trellis/scripts/common/cli_adapter.py` | Add to `Platform` literal type, `config_dir_name` property, `detect_platform()`, `get_cli_adapter()` validation |

**cli_adapter.py methods requiring explicit branches** (do NOT rely on `else` fallthrough):

| Method | What to decide | Example |
|--------|---------------|---------|
| `config_dir_name` | Config directory name | `".gemini"`, `".agent"` |
| `get_trellis_command_path()` | Command file path format | `.toml` vs `.md`, subdirectory vs flat |
| `get_non_interactive_env()` | Non-interactive env var | `{}` if none, or platform-specific |
| `build_run_command()` | CLI command for running agents | `["gemini", prompt]` or raise ValueError |
| `build_resume_command()` | CLI command for resuming sessions | `["gemini", "--resume", id]` or raise ValueError |
| `cli_name` | CLI executable name | `"gemini"`, `"agy"` |
| `detect_platform()` | Directory detection logic | Check `.gemini/` exists |
| `get_commands_path()` | Command directory structure | `commands/trellis/` or `workflows/` |

> Note: Python scripts run in user projects at runtime — they cannot import from the TS registry and maintain their own registry in `cli_adapter.py`.

### Active Task Resolution

Current-task state is session/window scoped. New hook, plugin, extension, and
sub-agent consumers must call the shared resolver path:

| Runtime | Resolver surface |
|---------|------------------|
| Python hooks/scripts | `.trellis/scripts/common/active_task.py` |
| Existing Python callers | `common.paths.get_current_task()` / `get_current_task_abs()` / `get_current_task_source()` |
| OpenCode plugin | JS resolver in `lib/trellis-context.js`, mirroring `active_task.py` |
| Pi extension | Extension-local resolver using `ctx.sessionManager.getSessionId()` and Bash `tool_call` env injection |

Do not add direct `.trellis/.current-task` reads in hooks, sub-agent context
injection, or platform plugins. Direct reads reintroduce multi-window task
pollution.

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
PowerShell uses `$env:TRELLIS_CONTEXT_ID = '<context-key>';`.
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
before execution. Cursor has no reliable command-env bridge, so `beforeShellExecution`
must create the short-lived shell ticket described above. Without one of these
session signals, `task.py start` must fail with a clear session identity hint
and must not write `.trellis/.current-task`.
Pi is extension-backed rather than Python-hook-backed: `tool_call` must mutate
`event.input.command` before Bash execution, and the custom `subagent` tool must
spawn child `pi` processes with `TRELLIS_CONTEXT_ID` in `env`.

Hook or plugin output that mentions an active task should include the source
(`session` or `session:<key>`) so cross-window mistakes are visible while
debugging.

**Also update `task_store.py` when adding a sub-agent-capable platform**:

| File | Constant | When to update |
|------|----------|----------------|
| `src/templates/trellis/scripts/common/task_store.py` | `_SUBAGENT_CONFIG_DIRS` (tuple) | Add `.{configDir}/` if the new platform can spawn sub-agents (Class-1 hook-inject, Class-2 pull-based, or extension-backed) |

This tuple is consulted by `cmd_create` to decide whether to seed `implement.jsonl` / `check.jsonl` for the new task. Agent-less platforms (Kilo, Antigravity, Windsurf) MUST be excluded — they don't consume jsonl.

Same root reason as `cli_adapter.py`: Python scripts run at user-project runtime and can't import from the TS `AI_TOOLS` registry, so they maintain their own parallel registry. When adding/removing sub-agent capability, update both in tandem.

> **Codex-specific CLIAdapter notes:**
> - `config_dir_name` returns `".codex"` (not `".agents"`)
> - `get_agent_path` returns `.toml` for codex (not `.md`)
> - `requires_agent_definition_file` is `False` — Codex auto-discovers agents from `.codex/agents/*.toml`, no `--agent` CLI flag
> - `detect_platform` checks `.codex/` existence (not `.agents/skills/`)
> - **CRITICAL**: Template copy (`src/templates/trellis/scripts/`) must be byte-identical to live copy (`.trellis/scripts/`)

### Step 7: Documentation

| File | Change |
|------|--------|
| `README.md` | Add platform to supported tools list |
| `README_CN.md` | Add platform to supported tools list (Chinese) |

### Step 8: Build Scripts

| File | Change |
|------|--------|
| `scripts/copy-templates.js` | No change needed (copies entire `src/templates/` directory) |

### Step 9: Project Config (Optional)

If Trellis project itself should support the new platform:

| Directory | Contents |
|-----------|----------|
| `.{platform}/` | Project's own config directory |
| `.{platform}/commands/trellis/` | Slash commands |
| `.{platform}/agents/` | Agents |
| `.{platform}/hooks/` | Hooks |
| `.{platform}/settings.json` | Settings |

### Step 10: Gitignore

| File | Change |
|------|--------|
| `.gitignore` | Add local config patterns (e.g., `{platform}.local.json`) |

### Step 11: Tests (MANDATORY)

> **Warning**: Dynamic iteration tests (e.g., `PLATFORM_IDS.forEach`) only verify registry metadata. They do NOT cover platform-specific runtime behavior. You MUST add explicit tests.

| Test File | What to Add |
|-----------|-------------|
| `test/templates/{platform}.test.ts` | **NEW FILE**: Verify `getAllCommands()`/`getAllSkills()`/`getAllWorkflows()` returns expected set, content non-empty, format valid |
| `test/configurators/platforms.test.ts` | Detection test: `getConfiguredPlatforms` finds `.{configDir}`. Configurator test: `configurePlatform` writes expected files, no compiled artifacts |
| `test/commands/init.integration.test.ts` | Init test: `init({ {platform}: true })` creates correct directory. Negative assertions: add `.{configDir}` checks to existing platform tests |
| `test/templates/extract.test.ts` | `get{Platform}TemplatePath()` returns existing dir. `get{Platform}SourcePath()` deprecated alias equals template path |
| `test/regression.test.ts` | Platform registration: `AI_TOOLS.{platform}` exists with correct `configDir`. cli_adapter: `commonCliAdapter` contains `"{platform}"` and `".{configDir}"`. Update `withTracking` list if `collectTemplates` is defined |

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
}
```

Configurator output:

```text
.pi/settings.json
.pi/prompts/trellis-<command>.md
.pi/skills/<skill>/SKILL.md
.pi/agents/trellis-<agent>.md
.pi/extensions/trellis/index.ts
```

Runtime script registry:

```python
Platform = Literal[..., "pi"]
_SUBAGENT_CONFIG_DIRS = (..., ".pi")
```

### 3. Contracts

Extension-backed platforms MUST NOT receive `.trellis/templates/shared-hooks/*.py` under their config directory. Their hook-equivalent behavior belongs in generated extension source.

For Pi Agent:

| Trellis concept | Pi surface |
|---|---|
| Session start | `session_start` extension event |
| User prompt submit | `input` extension event |
| Per-turn context injection | `before_agent_start` or `context` extension event |
| Pre-tool-use guard / mutation | `tool_call` extension event; mutate Bash `event.input.command` in place |
| Sub-agent dispatch | custom `subagent` tool that resolves the Pi CLI JS entrypoint when possible, runs `--mode text -p --no-session`, sends the delegated prompt through stdin, and forwards `TRELLIS_CONTEXT_ID` |

If `agentCapable` is true, `task.py create` must seed `implement.jsonl` / `check.jsonl`, and generated sub-agent definitions or extension code must consume those files.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| `hasHooks: true` and `hasPythonHooks: false` | Init does not run Windows Python hook detection for the platform |
| Platform can spawn Trellis sub-agents | Add config dir to `_SUBAGENT_CONFIG_DIRS` |
| Platform cannot consume JSONL context | Keep it out of `_SUBAGENT_CONFIG_DIRS` even if it has commands/skills |
| Generated extension source is tracked | `collectTemplates()` must include the same path written by `configure{Platform}` |
| Extension path contains `spec/` in a skill name such as `trellis-update-spec` | Template hash exclusion must not drop it; only `.trellis/spec/` is user-owned spec data |
| Platform uses extension hooks | Do not copy Python hook files into the platform config dir |

### 5. Good / Base / Bad Cases

Good:

```text
.pi/extensions/trellis/index.ts
.pi/agents/trellis-implement.md
.pi/skills/update-spec/SKILL.md
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
- `configurePlatform("<platform>")` writes every generated file and writes no Python hook files for extension-backed platforms.
- `collectPlatformTemplates("<platform>")` matches init output paths.
- `init({ <flag>: true })` creates platform assets and tracks hashes for all generated templates.
- `get_context.py --mode phase --platform <platform>` routes to sub-agent-capable workflow blocks when `agentCapable` is true.
- Runtime script copies (`src/templates/trellis/scripts/**` and live `.trellis/scripts/**`) both recognize the platform.

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
spawn(invocation.command, [
  ...invocation.argsPrefix,
  "--mode",
  "text",
  "-p",
  "--no-session",
], {
  cwd: projectRoot,
  env: { ...process.env, TRELLIS_CONTEXT_ID: contextKey },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
```

### 3. Contracts

| Field / Env | Contract |
|---|---|
| `TRELLIS_PI_CLI_JS` | Optional absolute or relative path to `@mariozechner/pi-coding-agent/dist/cli.js`; if set, it is authoritative |
| `command` | `process.execPath` when a CLI JS entrypoint is resolved; otherwise `"pi"` fallback |
| `argsPrefix` | `[cliJs]` for resolved JS entrypoint; `[]` for fallback |
| Prompt transport | Write delegated prompt to `child.stdin`, never as a positional argv prompt |
| Output mode | Use `--mode text`; keep final-output formatter tolerant of structured or diagnostic output |
| Context | Forward `TRELLIS_CONTEXT_ID` into the child env when available |
| Agent config | Parse `model`, `thinking`, and `fallbackModels` from `.pi/agents/*.md` frontmatter |
| Per-call overrides | `subagent` tool input may override frontmatter with `model` and `thinking` |
| Model/thinking args | If model and thinking are present and model has no thinking suffix, pass `--model <model>:<thinking>`; if model already has a suffix, pass it unchanged; if thinking exists without model, pass `--thinking <level>` |
| Output buffers | Bound stdout and stderr collection separately; keep the tail plus truncation notice |

Candidate JS entrypoint lookup should cover:

```text
process.argv entries ending in pi-coding-agent/dist/cli.js
npm_config_prefix / NPM_CONFIG_PREFIX
APPDATA/npm
PATH entries, their parent directories, and parent/lib variants
```

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| `TRELLIS_PI_CLI_JS` points to an existing file | Launch with `process.execPath` and `[cliJs, "--mode", "text", "-p", "--no-session"]` |
| `TRELLIS_PI_CLI_JS` points to a missing file | Reject with an error naming `TRELLIS_PI_CLI_JS` and the resolved missing path |
| A candidate CLI JS entrypoint exists | Launch with `process.execPath` and the candidate path |
| No candidate CLI JS entrypoint exists | Fall back to `spawn("pi", ["--mode", "text", "-p", "--no-session"])` |
| `AbortSignal` is already aborted | Reject before spawning |
| `AbortSignal` fires after spawn | Kill the child and reject with `pi subagent cancelled` |
| Child exits non-zero | Reject with stderr, else stdout, else an exit-code message |
| stdout/stderr exceed limits | Keep the most recent bytes and prefix output with a truncation notice |

### 5. Good / Base / Bad Cases

Good:

```typescript
const invocation = resolvePiInvocation();
const child = spawn(invocation.command, [
  ...invocation.argsPrefix,
  "--mode",
  "text",
  "-p",
  "--no-session",
], { stdio: ["pipe", "pipe", "pipe"] });
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
spawn("pi", ["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)]);
```

This depends on direct executable lookup for `pi` and uses argv for an unbounded generated prompt.

#### Correct

```typescript
const invocation = resolvePiInvocation();
const child = spawn(invocation.command, [
  ...invocation.argsPrefix,
  "--mode",
  "text",
  "-p",
  "--no-session",
], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

child.stdin?.end(prompt);
```

Resolve npm-shim installs through the real JS entrypoint when possible, keep `pi` as the compatibility fallback, and transport generated prompts through stdin.

---

## What You DON'T Need to Update

These are now **automatically derived** from the registry:

| Previously hardcoded | Now derived from |
|---------------------|------------------|
| `BACKUP_DIRS` in update.ts | `ALL_MANAGED_DIRS` from `configurators/index.ts` |
| `TEMPLATE_DIRS` in template-hash.ts | `ALL_MANAGED_DIRS` from `configurators/index.ts` |
| `getConfiguredPlatforms()` in update.ts | `getConfiguredPlatforms()` from `configurators/index.ts` |
| `cleanupEmptyDirs()` whitelist in update.ts | `isManagedPath()` / `isManagedRootDir()` from `configurators/index.ts` |
| `collectTemplateFiles()` if/else in update.ts | `collectPlatformTemplates()` dispatch loop |
| `TOOLS[]` in init.ts | `getInitToolChoices()` from `configurators/index.ts` |
| Configurator dispatch in init.ts | `configurePlatform()` from `configurators/index.ts` |
| Windows Python detection in init.ts | `getPlatformsWithPythonHooks()` from `configurators/index.ts` |

---

## Command Format by Platform

| Platform | Command Format | File Format | Example (finish-work) |
|----------|---------------|-------------|-----------------------|
| Claude Code | `/trellis:xxx` | Markdown (`.md`) | `/trellis:finish-work` |
| Cursor | `/trellis-xxx` | Markdown (`.md`) | `/trellis-finish-work` |
| OpenCode | `/trellis:xxx` | Markdown (`.md`) | `/trellis:finish-work` |
| Gemini CLI | `/trellis:xxx` | TOML (`.toml`) | `/trellis:finish-work` |
| Kilo | `/<workflow-name>` | Markdown (`.md`) | `/finish-work` |
| Codex | `$<skill-name>` / `/skills` | Markdown (`SKILL.md`) | `$finish-work` |
| Kiro | `$<skill-name>` / `/skills` | Markdown (`SKILL.md`) | `$finish-work` |
| Qoder | `/trellis-<name>` (commands) + `$<skill-name>` / `/skills` (workflows) | Markdown (`.md` with frontmatter + `SKILL.md`) | `/trellis-finish-work` |
| Antigravity | `/<workflow-name>` | Markdown (`.md`) | `/finish-work` |
| CodeBuddy | `/trellis:xxx` | Markdown (`.md`) | `/trellis:finish-work` |
| Copilot | `/trellis:xxx` | Markdown (`.prompt.md`) | `/trellis:finish-work` |
| Droid | `/trellis:xxx` | Markdown (`.md`) | `/trellis:finish-work` |
| Windsurf | `/trellis-xxx` | Markdown (`.md`) + `SKILL.md` | `/trellis-finish-work` |
| Pi Agent | `/trellis-xxx` prompt templates + `/skill:<name>` skills | Markdown (`.md`) + `SKILL.md` + TypeScript extension | `/trellis-finish-work` |

When creating platform templates, ensure references match the platform's interaction format and file format.

## Command Set by Platform Capability

Commands emitted by `resolveCommands(ctx)` / `resolveAllAsSkills(ctx)` in `src/configurators/shared.ts`:

| Command | Agent-capable platforms (11) | Agent-less platforms (3) |
|---------|------------------------------|--------------------------|
| `start` | ❌ not emitted (hook/plugin injects workflow overview on session start) | ✅ emitted — manual equivalent of session-start hook |
| `continue` | ✅ emitted | ✅ emitted |
| `finish-work` | ✅ emitted | ✅ emitted |

**Rule**: filter is by `ctx.agentCapable`, not `hasHooks`. `agentCapable` is authoritative because it also correlates with "has a session-start mechanism" (Python hook or JS plugin).

- Agent-capable: `claude-code, cursor, opencode, codex, kiro, gemini, qoder, codebuddy, copilot, droid, pi`
- Agent-less: `kilo, antigravity, windsurf`

## Subagent Context Injection: Hook-based vs Pull-based vs Extension-backed

Trellis sub-agents (implement / check / research) need task context (`prd.md` + spec files listed in `implement.jsonl` / `check.jsonl`) at startup. There are two delivery modes depending on the platform's hook capabilities:

### Mode A — Hook-inject (6 platforms)

Platform's PreToolUse-equivalent hook can fire on the sub-agent spawn tool AND modify the tool's prompt input. Trellis's `inject-subagent-context.py` (or OpenCode's plugin) reads `prd.md` + the JSONL-referenced spec files and rewrites the sub-agent's initial prompt.

| Platform | Hook event | Mechanism |
|---|---|---|
| Claude Code | `PreToolUse` + matcher `Task`/`Agent` | `updatedInput.prompt` |
| CodeBuddy | `PreToolUse` + matcher `Task` | `modifiedInput.prompt` (same as Claude) |
| Cursor | `preToolUse` + matcher `Task|Subagent` | `updated_input.prompt` (Cursor staff marked Task prompt mutation fixed on 2026-04-07; current Cursor may emit native sub-agent calls as tool name `Subagent`, and native Task args may encode custom agents as `subagent_type.custom.name`) |
| Factory Droid | `PreToolUse` + matcher `Task` | `updatedInput.prompt` |
| Kiro | per-agent `agentSpawn` hook | direct stdout context |
| OpenCode | JS plugin `tool.execute.before` | `args.prompt` mutation |

### Mode B — Pull-based (4 platforms)

Platform's hook either doesn't expose a sub-agent spawn event or can't modify the prompt. Sub-agents must Read context themselves at startup. Trellis injects a "Required: Load Trellis Context First" prelude into each sub-agent definition file.

| Platform | Why hook-inject is unavailable |
|---|---|
| Gemini CLI | `BeforeTool` fires but [#18128](https://github.com/google-gemini/gemini-cli/issues/18128) hides chain-of-thought; reliability margin too thin |
| Qoder | No `Task` tool concept; `SubagentStart` input has no `prompt` field; Context Isolation |
| Codex | `PreToolUse` only fires for Bash; `CollabAgentSpawn` hook unimplemented ([#15486](https://github.com/openai/codex/issues/15486)) |
| Copilot | `preToolUse` doesn't enforce on subagents ([#2392](https://github.com/github/copilot-cli/issues/2392), [#2540](https://github.com/github/copilot-cli/issues/2540)) |

#### Active task discovery on class-2 platforms (issue #225)

Sub-agents on class-2 platforms run as **separate sessions** with their own session ids — they do not inherit the parent's `<PLATFORM>_SESSION_ID` env, so the session-scoped active-task resolver (see `### Active Task Resolution` above) returns `None` for the sub-agent's own session key. To bridge that gap the prelude (`buildPullBasedPrelude` in `src/configurators/shared.ts`) tells sub-agents to discover the active task in this order:

1. **`Active task: <path>` line in dispatch prompt** — primary path. The main agent is required by `workflow.md`'s `[workflow-state:in_progress]` breadcrumb to prefix every class-2 sub-agent dispatch with `Active task: <path from task.py current>`. The breadcrumb fires on every `UserPromptSubmit` while `task.json.status == in_progress`, so the rule is reinjected per turn.
2. **`task.py current --source`** — secondary. Resolves via the session-scoped runtime store. Returns `Source: session:<key>` on a precise match, or `Source: session-fallback:<key>` when the runtime contains exactly one session file (single-window inference; see `_resolve_single_session_fallback` in `active_task.py`). Returns nothing when ≥2 session files exist — refuses to guess across windows so 04-21's multi-session isolation contract holds.
3. **Ask the user** — terminal fallback when both above yield nothing.

When changing the prelude, the dispatch protocol, or the `session-fallback` semantics, all three layers must stay aligned. `regression.test.ts > [issue-225]` and `regression.test.ts > [session-fallback]` are the contract tests; `templates/trellis.test.ts > [issue-225]` asserts the workflow.md breadcrumb still carries the protocol. Manual e2e runbook lives in the historical task `.trellis/tasks/<archive>/05-04-fix-codex-subagent-missing-active-task/manual-verify.md`.

### Mode C — Extension-backed (1 platform)

Platform can expose hook-equivalent events and custom tools through a project-local extension. Trellis owns the sub-agent tool and/or context injection path.

| Platform | Extension surface | Context delivery |
|---|---|---|
| Pi Agent | `.pi/extensions/trellis/index.ts` events + `subagent` tool | extension builds prompt from `.pi/agents/*.md`, `prd.md`, `info.md`, and JSONL-referenced files; agent definitions also receive pull-based prelude as a fallback |

### Implementation

Pull-based prelude is injected by `injectPullBasedPreludeMarkdown()` / `injectPullBasedPreludeToml()` in `src/configurators/shared.ts`. Each pull-based platform's configurator:

1. Calls `writeSharedHooks(dir, platform)` where `SHARED_HOOKS_BY_PLATFORM[platform]` excludes `inject-subagent-context.py` — no prompt-mutation hook installed
2. Calls `detectSubAgentType(name)` → `injectPullBasedPrelude*()` on every sub-agent definition before writing

Hook-inject platforms keep using `writeSharedHooks(dir, platform)` with a capability table entry that includes `inject-subagent-context.py`, and their hook-config JSON references that hook as before.

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

Full reliability audit (per-platform evidence, GitHub issues, Cursor staff confirmations, Claude Code canary test) lives at:
`.trellis/tasks/04-17-subagent-hook-reliability-audit/research/platform-hook-audit.md`

---

## Agent-Curated JSONL Contract (Phase 1.3)

### Scope / Trigger

`implement.jsonl` / `check.jsonl` list which spec + research files should be injected into the implement / check sub-agent's prompt. Before v0.5.0-beta.12, `task.py init-context` mechanically generated entries from `dev_type` + package config — which silently produced broken paths on monorepo layouts the script didn't anticipate. Now these files are **agent-curated during Phase 1.3**.

### Lifecycle

1. **Seed** — `task.py create` writes **one line** to each jsonl when a sub-agent-capable platform is detected (see `_SUBAGENT_CONFIG_DIRS` in Step 6). Agent-less platforms skip seeding.
2. **Curate** — AI executes Phase 1.3 per `workflow.md`: replaces the seed line with real `{file, reason}` entries pointing at spec files or `research/*.md`. **Code paths are forbidden**; code gets read in Phase 2.
3. **Consume** — hook / prelude reads the file and injects referenced content into the sub-agent prompt.

### Signatures

**Seed row schema** (one line, written by `_write_seed_jsonl` in `task_store.py`):

```json
{"_example": "Fill with {\"file\": \"<path>\", \"reason\": \"<why>\"}. Put spec/research files only — no code paths. Run `python3 .trellis/scripts/get_context.py --mode packages` to list available specs. Delete this line when done."}
```

**Curated row schema** (written by AI):

```json
{"file": "<repo-relative-path>", "reason": "<one-line rationale>"}
```

Optional `type: "directory"` for directory entries. Consumers ignore any other fields.

### Contracts

| Contract | Enforcer | Behavior |
|---|---|---|
| Seed detection | Every consumer | Row without a `file` key is treated as non-entry (silently skipped; no error) |
| Empty-file tolerance | `read_jsonl_entries` in `shared-hooks/inject-subagent-context.py` | Missing file or seed-only file → empty list returned + single stderr warning (not an exception) |
| READY detection | `session-start.py` / `session-start.js` per platform | A task is "ready to implement" ONLY if at least one curated (non-seed) row exists. File existence alone is NOT ready. |
| Class-2 prelude fallback | `buildPullBasedPrelude` in `configurators/shared.ts` | If jsonl has no `file` entries, sub-agent reads prd.md and judges which specs apply from context |

### Validation & Error Matrix

| Condition | Behavior | Exit / Surface |
|---|---|---|
| `implement.jsonl` has only seed row | `cmd_validate` reports 0 errors; `cmd_list_context` prints "(no curated entries yet — only seed row)" | Exit 0 |
| `implement.jsonl` entry points at non-existent file | `cmd_validate` prints "File not found: …" per row | Exit 1 |
| Sub-agent platform detected, but `cmd_create` fails to write seed | Create succeeds, but sub-agent dispatch later sees a missing jsonl and hook warns | Exit 0 on create, stderr warn on consume |
| Agent-less platform mistakenly added to `_SUBAGENT_CONFIG_DIRS` | Task gets useless seeded jsonl that no hook/prelude consumes | No error, just clutter — catch in review |

### Wrong vs Correct

#### Wrong — treat "file exists" as "ready"

```python
def has_context(task_dir: Path) -> bool:
    return (task_dir / "implement.jsonl").is_file()   # ← fires READY even with only seed row
```

This was the drift found in 3 different session-start implementations (codex / copilot / opencode) after init-context was removed. Result: main agent thought Phase 1.3 was done before any curation happened.

#### Correct — require at least one curated row

```python
def _has_curated_jsonl_entry(path: Path) -> bool:
    if not path.is_file():
        return False
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict) and row.get("file"):
            return True
    return False
```

All session-start hooks/plugins that check readiness must use this contract. **Four implementations** share the same gate and must stay in sync:

| Implementation | Consumed by |
|---|---|
| `shared-hooks/session-start.py` | Claude, Cursor, Kiro, CodeBuddy, Droid, Gemini, Qoder (via `writeSharedHooks`) |
| `codex/hooks/session-start.py` | Codex (opts out of shared via `exclude`) |
| `copilot/hooks/session-start.py` | Copilot (opts out of shared via `exclude`) |
| `opencode/plugins/session-start.js` | OpenCode (JS plugin, different runtime) |

When adding a new sub-agent-capable platform with its own session-start, implement the same check.

**Audit lesson** (worth internalizing — this drift cost two review passes):

1. First pass after `task.py init-context` removal: only the 3 per-platform Python/JS hooks got the fix; `shared-hooks/session-start.py` was missed entirely.
2. Second pass caught the fourth implementation because **reviewer asked "对应的 session-start 改了吗?"** — not because audit process found it.

Mechanical rule: when a contract touches **any** session-start, grep all four implementations in one pass. Relying on review to catch drift is fragile — per `quality-guidelines.md` "Audit ALL Writers".

### Tests Required

- **Create behavior**: `[init-context-removal] task.py create seeds jsonl when a sub-agent platform dir exists` (regression.test.ts)
- **Consumer tolerance**: `[init-context-removal] inject-subagent-context.py skips seed rows (no \`file\` field)`
- **Validate seed**: `[init-context-removal] task.py validate treats seed-only jsonl as 0 errors`
- **List-context seed**: `[init-context-removal] task.py list-context prints 'no curated entries yet' for seed-only jsonl`
- **READY gating**: Per-platform session-start test asserting "seed-only jsonl → NOT ready" (TODO gap, track per platform when expanding suite)

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

### First-Reply Notice

Every Trellis-owned SessionStart implementation that injects model-visible
context must include a short `<first-reply-notice>` block near the top of the
injected context, before `<current-state>`. The instruction tells the AI to
start the first visible assistant reply with exactly one concise Chinese
sentence:

```text
Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。
```

Then it must continue directly with the user's request and never repeat the
notice after that first assistant reply in the same session.

This is an instruction-only proof surface, not a host UI feature. It belongs
only in implementations where Trellis can actually put context into the model
conversation:

| Implementation | Include notice? | Reason |
|---|---:|---|
| `shared-hooks/session-start.py` | ✅ | Claude/Cursor/Gemini/Qoder/CodeBuddy/Droid-style shared hook context |
| `codex/hooks/session-start.py` | ✅ | Codex accepts SessionStart stdout / `additionalContext` when `features.codex_hooks = true` |
| `opencode/plugins/session-start.js` | ✅ | Plugin prepends Trellis context into the first user message and persists it |
| `copilot/hooks/session-start.py` | ❌ | Copilot docs say `sessionStart` output is ignored; do not claim model-visible injection |

Keep hook payload shapes unchanged. Add this as text inside the existing
context string, not as a new JSON key.

### Constraint

Claude Code truncates `hookSpecificOutput.additionalContext` at **~20 KB**. When exceeded, only a ~2 KB preview is shown and the full payload is written to a fallback file (`tool-results/hook-*-additionalContext.txt`). AI agents do **not** proactively read the fallback file, so any content past the preview is effectively invisible.

Codex has even tighter limits — users report 40-80 KB payloads consuming most of the context window on large projects.

### Size Budget (measured on Trellis dev repo)

| Block | Size | Notes |
|---|---:|---|
| `<session-context>` | 0.1 KB | Fixed |
| `<first-reply-notice>` | 0.4 KB | One-shot visible proof instruction |
| `<current-state>` | 2.3 KB | Grows with tasks/git state |
| `<workflow>` | 9.5 KB | TOC + Phase Index + Phase 1/2/3 step bodies. Meta sections (Core Principles / Trellis System / Breadcrumbs) excluded — they are either short prose Readable on demand or consumed by other hooks |
| `<guidelines>` | 4.6 KB | `guides/index.md` inlined + paths-only for other indexes |
| `<task-status>` | 0.2 KB | Fixed |
| `<ready>` | 0.3 KB | Fixed |
| **Total** | **17.1 KB** | **Under 20 KB ✓** |

Historical note: pre-workflow-rewrite (v0.4.0-beta.10) the payload included a 16 KB `<instructions>` block (start.md content). That block was removed — start.md is now only sent as the `/start` command body for agent-less platforms (Kilo/Antigravity/Windsurf); agent-capable platforms get workflow overview via `<workflow>` instead.

### Guidelines: Paths-only vs Inline

Before: every `.trellis/spec/*/index.md` was inlined in `<guidelines>` (10 KB+ on this repo). Main agent rarely uses index content (work is delegated to sub-agents, which get their own specific specs via `{task}/implement.jsonl` / `check.jsonl`).

Now: paths only for most indexes; `guides/index.md` (cross-package thinking guides) stays inlined because it's small and applies broadly. Agent-capable platforms should delegate implementation/check work to sub-agents so `implement.jsonl` / `check.jsonl` context is loaded there; agent-less platforms that edit in the main session read the relevant index on demand.

### READY Guidance Must Be a Single Action

When a task has `prd.md` plus curated jsonl context, `SessionStart` should give one executable next action: dispatch `trellis-implement`, then dispatch `trellis-check` before completion. Do not include fallback language such as "continue with implement or check", "if you stay in the main session", or "ask whether to continue"; those phrases make the AI negotiate workflow instead of following the task state.

### Design Decision: Inject Instructions, Not Reference Content

**Context**: session-start.py injected both `workflow.md` (~12 KB reference) and `start.md` (~11 KB instructions), totaling ~29 KB on vanilla — always truncated.

**Decision**: Remove `workflow.md` full injection. Keep `start.md` injection because:

1. `start.md` is **imperative** (step-by-step instructions the AI follows) — must be in context to be effective
2. `workflow.md` is **reference** (principles, file structure, best practices) — `start.md` Step 1 tells AI to `cat .trellis/workflow.md`, so it's accessed on-demand
3. Other slash commands (`brainstorm`, `finish-work`, `check`) are not pre-injected — this restores symmetry

**Rule**: When adding content to session-start, prefer pointers over full injection for reference material. Reserve inline injection for actionable instructions the AI must follow immediately.

### Gotcha: `<guidelines>` Is the Next Growth Risk

On the Trellis dev repo (light use), `<guidelines>` is 10.8 KB vs 5.1 KB on vanilla — it grows linearly with spec `index.md` file count. Combined with `<instructions>` (16.1 KB), a project with many spec layers can still exceed 20 KB. Monitor this and consider the same lazy-load pattern for guidelines if it becomes a problem.

---

## Workflow State Injection: Per-Turn Breadcrumb

### Problem

`SessionStart` only fires once per session. In long conversations, Claude's context compression can push the SessionStart message out of recent context, and the AI forgets the active Trellis task — resulting in workflow drift (skips `check`, forgets to `update-spec`, doesn't return to `finish` after user interruptions).

### Solution: `UserPromptSubmit` hook injecting per-turn breadcrumb

A lightweight hook (`shared-hooks/inject-workflow-state.py`) fires on **every user prompt**, emitting a short `<workflow-state>` block reminding the AI of the active task + expected flow. Keep the payload compact and directive; it is injected every turn.

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

A hook whose job is to **re-ground the AI every turn** should always emit *something*. Silent-exit looks cheaper but defeats the whole purpose — the turn where there's "nothing" is often the most important one (e.g. user switches topics, hops into a fresh subject without an active task).

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

| Platform | Event | Config File | Notes |
|---|---|---|---|
| Claude Code | `UserPromptSubmit` | `.claude/settings.json` | Auto-distributes via `writeSharedHooks()` |
| Cursor | `beforeSubmitPrompt` | `.cursor/hooks.json` | Auto |
| Qoder | `UserPromptSubmit` | `.qoder/settings.json` | Auto |
| CodeBuddy | `UserPromptSubmit` | `.codebuddy/settings.json` | Auto |
| Droid (Factory) | `UserPromptSubmit` | `.factory/settings.json` | Auto |
| Gemini CLI | `UserPromptSubmit` | `.gemini/settings.json` | Auto |
| Copilot CLI | `userPromptSubmitted` (camelCase) | `.github/copilot/hooks.json` | `bash` + `powershell` dual field |
| Codex | `UserPromptSubmit` | `.codex/hooks.json` | **Requires `features.codex_hooks = true` in user's `~/.codex/config.toml`** — without this flag, hooks never fire |
| OpenCode | `chat.message` (Bun plugin) | `plugins/inject-workflow-state.js` | Equivalent JS implementation |
| Kiro | ⚠️ Not supported | n/a | Kiro's only hook is `agentSpawn` (sub-agent lifecycle). No per-turn main-conversation hook exists; awaiting upstream. Sub-agent context injection still works via shared-hooks `inject-subagent-context.py` |

### CWD Robustness

The hook uses `find_trellis_root()` to walk up from CWD until it finds `.trellis/`, so it works when the terminal is in a subdirectory (monorepo package, etc.) or when sub-agent spawn inherits a drifted CWD.

### Why No State Machine / No Extra `task.json` Fields

After first-principles analysis (see `.trellis/tasks/04-17-workflow-enforcement-v2/prd.md`), we dropped the original design's `current_phase` string / `phase_history` / `checkpoints` / 7 new `task.py` commands / skill tail blocks. The core insight: **workflow.md Phase 1.0/1.1/... is documentation layering, not runtime state**. The existing `task.json.status` (`planning` / `in_progress` / `completed`) is sufficient to express task lifecycle; sub-phase position is inferred by the AI from conversation history + git state.

This keeps state minimal, avoids the "task.json drifts from filesystem reality" class of bugs, and is trivially customizable — users modify one markdown file, not Python/TypeScript.

---

## Bootstrap & Joiner Task Auto-Generation

`trellis init` generates a first-session task based on checkout state. Three branches dispatch off two filesystem flags:

| `.trellis/` exists? | `.trellis/.developer` exists? | Meaning | Task generated |
|---|---|---|---|
| no | n/a | First-time `init` on this project | `00-bootstrap-guidelines` (creator flow) |
| yes | no | Fresh clone / per-checkout first-init (new machine, new teammate) | `00-join-<slug>` (joiner flow) |
| yes | yes | Same dev re-running init | none (no-op) |

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

## Reference PRs

| PR | Platform | Pattern | Notes |
|----|----------|---------|-------|
| feat/gemini branch | Gemini CLI | Agents + shared hooks | First non-Markdown command format (TOML settings) |
| main | Antigravity | Workflows (derived from Codex) | No physical templates — runtime adaptation from Codex skills |
| #71 | Qoder | Skills (like Codex/Kiro) | Skills with YAML frontmatter; Trae was dropped (IDE-only, no deterministic invocation trigger) |
| feat/v0.5.0-beta | All 13 platforms | Unified template architecture | Common templates + shared hooks + `createTemplateReader()` factory |
| `04-21-bootstrap-onboard-gap` | n/a | Three-branch init dispatch + joiner onboarding | `.developer` file as per-checkout signal; documents the `handleReinit` two-point wiring |
