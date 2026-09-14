# Configurator Shared Helpers

How `packages/cli/src/configurators/shared.ts` is structured: what it exports, what each helper guarantees, and when a platform configurator should reach for shared logic vs. write its own.

For per-platform integration mechanics (which directory each platform writes, which hooks each one registers), see `platform-integration.md`. This spec only covers the cross-cutting helpers.

---

## Overview

`configurators/shared.ts` exists to keep the per-platform configurators — one `configurators/<platform>.ts` per entry in `AI_TOOLS`, 21 of them — from independently re-implementing the same byte-for-byte rendering, write, and prelude-injection logic. Drift between configurators reliably becomes a bug:

- If two platforms render `{{PYTHON_CMD}}` differently, `trellis update`'s template-hash compare reports a phantom diff after every install.
- If two configurators that both write into `.agents/skills/` resolve `{{CMD_REF}}` per-platform, the last writer wins and clobbers the other (see `platform-integration.md` "Rule: `.agents/skills/` writes use `resolvePlaceholdersNeutral()`").
- If a platform's file set is described in two places, the two descriptions disagree and `trellis update` silently stops managing whichever file only one of them names (see "Template maps" below).

A helper belongs in `shared.ts` when (a) two or more configurators need the same behavior **or** (b) a single configurator needs the helper in **both** the init write path and the update collect path — putting it in shared.ts forces both to call the same code.

A helper does **not** belong in `shared.ts` when it encodes platform-specific formatting (e.g. Codex TOML agents, OpenCode plugin JSON, Kiro JSON agents). Those stay in the per-platform configurator.

---

## Public helper roster

### Python command resolution

`configurators/shared.ts:setResolvedPythonCommand` — called once by `commands/init.ts` after probing the host (`python` / `python3` / `py -3`). All subsequent renders pick up the resolved value.

`configurators/shared.ts:resetResolvedPythonCommand` — test helper. Unit tests that exercise rendering without going through init must call this in `beforeEach`/`afterEach` to avoid leaking module state between cases.

`configurators/shared.ts:getPythonCommandForPlatform` — returns the resolved command if init has run; otherwise the static default (`python` on Windows, `python3` elsewhere). The optional `platform` arg exists solely for unit tests; production callers must not pass it (passing it bypasses the resolved cache).

`configurators/shared.ts:replacePythonCommandLiterals` — line-wise replace of literal `python3` with the resolved command, **excluding shebang lines** (`#!`). Idempotent; no-op when the resolved command is `python3`. Applied to whole template maps so even raw `.py`, `.toml`, `.md` content (templates that don't go through `resolvePlaceholders`) gets the right command on Windows. Configurators do not call it per file: `renderTemplateMap` applies it to every entry of a map, and both paths funnel through that one call — `writeTemplateMap` on init, `collectPlatformTemplates` on update. A configurator only calls it directly when it has to rewrite *before* another encoding step, e.g. `snow.ts:85` rewrites a command body before wrapping it in JSON (rewriting the JSON afterwards would still work, but the escaped body is harder to reason about).

### Placeholder substitution

`configurators/shared.ts:resolvePlaceholders` — the standard renderer. Resolves `{{PYTHON_CMD}}`, `{{CMD_REF:name}}`, `{{EXECUTOR_AI}}`, `{{USER_ACTION_LABEL}}`, `{{CLI_FLAG}}`, plus conditional blocks `{{#FLAG}}…{{/FLAG}}` / `{{^FLAG}}…{{/FLAG}}` for `AGENT_CAPABLE` and `HAS_HOOKS`. Cleans up consecutive blank lines left by removed conditionals. Without a `TemplateContext` it only resolves `{{PYTHON_CMD}}` (legacy mode for `settings.json`, `hooks.json`, etc.).

`configurators/shared.ts:resolvePlaceholdersNeutral` — same set of placeholders, but renders `{{CMD_REF:name}}` as `` `name` (Trellis command) `` instead of substituting the platform's command prefix. Use this whenever the rendered file is destined for `.agents/skills/`. Two configurators (Codex now, Gemini CLI 0.40+ via the workspace alias, future agentskills.io consumers) write into that path; if either uses the platform-specific renderer the rendered SKILL.md becomes byte-different and the second configurator silently overwrites the first.

### Template wrapping

`configurators/shared.ts:wrapWithSkillFrontmatter` — prefixes a resolved skill body with `---\nname: <name>\ndescription: "<desc>"\n---\n\n`. Description comes from the module-private `SKILL_DESCRIPTIONS` registry, keyed by the bare skill name (the `trellis-` prefix is stripped before lookup). Throws when the description is missing — this is intentional: a skill that ships without a description fails the AI auto-trigger matcher silently in production, so we fail loudly at init.

`configurators/shared.ts:wrapWithCommandFrontmatter` — same shape for command palette entries (`---\nname: …\ndescription: …\n---`). Uses the separate `COMMAND_DESCRIPTIONS` registry. Currently only used by Qoder's `resolveCommands(ctx)` → custom command frontmatter path. Two registries exist on purpose: skill descriptions are long prose for the AI matcher; command descriptions are one-line imperatives shown in the user-facing palette.

### High-level template resolvers

These return `ResolvedTemplate[]` (`{ name, content }`) and are the canonical entry points for configurators. Use them; do **not** stitch `getCommandTemplates() + resolvePlaceholders + wrapWithSkillFrontmatter` by hand in a configurator — that re-implements the filter and skip rules and is how drift creeps in.

`configurators/shared.ts:resolveCommands` — returns command templates as plain commands (no frontmatter). Used by platforms that have a native command surface (Cursor, Claude, Gemini, OpenCode, etc.). Filters out `start.md` on `agentCapable && hasHooks` platforms — the SessionStart-style hook injects the workflow overview, so a user-facing `/start` would be redundant. **The condition is two-flag, not one** (changed in 0.6.4 after the ZCode init bug): platforms with `agentCapable=true, hasHooks=false` (Codex, ZCode, OpenCode, Reasonix) keep `start` so users can manually load workflow context — no hook fires for them.

Pi is the exception handled in `configurators/pi.ts`: `session_start` is notify-only and cannot mutate model-visible context, so Pi keeps a generated `.pi/prompts/trellis-start.md` fallback while its extension injects compact startup context through the first `before_agent_start`. The configurator must still derive the fallback through `resolveCommands({ ...ctx, hasHooks: false })` rather than reading common command templates directly, so placeholder rendering and future command transforms stay centralized.

`configurators/shared.ts:resolveSkills` — returns the 5 single-file workflow skills (`brainstorm`, `before-dev`, `check`, `break-loop`, `update-spec`) wrapped with skill frontmatter and platform-specific `{{CMD_REF}}` rendering. Used by "both" platforms — those that emit native commands AND skills (Qoder, Cursor with `.cursor/skills`, Devin).

`configurators/shared.ts:resolveSkillsNeutral` — same 5 skills, but uses `resolvePlaceholdersNeutral`. Use this for any skill set destined for `.agents/skills/`.

`configurators/shared.ts:resolveAllAsSkills` — folds command templates into skill format (with `trellis-` prefix and skill frontmatter). Used by skill-only platforms: Kiro, Reasonix, Snow, Kimi. (Codex needs the same fold but writes into `.agents/skills/`, so it uses the neutral variant below.) `start` is filtered out only when `agentCapable && hasHooks` (same rule as `resolveCommands`); skill-only platforms without hooks (Codex, Reasonix) get a `trellis-start` skill so `<trellis-bootstrap>` notices and manual `/skill trellis-start` invocations resolve.

`configurators/shared.ts:resolveAllAsSkillsNeutral` — same, but neutral. Used by Codex for command-as-skill files in `.agents/skills/` (`trellis-continue/SKILL.md`, `trellis-finish-work/SKILL.md`, and — on no-hook platforms — `trellis-start/SKILL.md`). When multiple platforms write to `.agents/skills/`, byte-identity is required; running through the neutral renderer is what makes that hold. Platforms with their own command surface, such as ZCode, should keep command entrypoints in that command surface and use `resolveSkills()` for the platform skill root.

`configurators/shared.ts:resolveBundledSkills` — resolves multi-file built-in skills (`trellis-channel`, `trellis-meta`, `trellis-session-insight`, `trellis-spec-bootstrap` — everything under `templates/common/bundled-skills/`) into `ResolvedSkillFile[]`. Each entry has a POSIX-relative path under the skill name (e.g. `trellis-meta/references/core/template-pipeline.md`). Bundled `SKILL.md` already owns its frontmatter — this helper does **not** wrap it. Pass the result to `collectSkillTemplates()` as its third argument; omitting it drops every bundled skill from that platform.

### Map builders

These build the `Map<relPath, content>` that a `collect<Platform>Templates()` returns. See "Template maps" below for why that map is the only place a platform's file set may be written down.

`configurators/shared.ts:collectSkillTemplates(skillsRoot, skills, bundledSkills?)` — single-file workflow skills as `<skillsRoot>/<name>/SKILL.md`, plus any bundled skill files at their relative paths under `<skillsRoot>/`.

`configurators/shared.ts:collectBothTemplates(ctx, cmdPath, skillRoot, wrapCmd?)` — commands + skills for "both" platforms (a command surface *and* a skill root). `cmdPath(name)` returns the command's relative path so each platform keeps its own layout; `wrapCmd(filePath, content)` is the optional per-platform command wrapper. Used by cursor, antigravity, devin, kilo, qoder.

`configurators/shared.ts:collectSharedHooks(hooksPath, platform)` — the platform-independent Python hook scripts from `templates/shared-hooks/` that `platform` actually registers, keyed under `hooksPath`. The list comes from `templates/shared-hooks/index.ts:SHARED_HOOKS_BY_PLATFORM` via `getSharedHookScriptsForPlatform` — configurators must not hand-pick files, because the table is also what `shared-hooks.test.ts` checks the platform's hook config against (see `platform-integration.md` "Declaring a shared hook is half the wiring"). Class-2 (pull-based) platforms are simply absent from `inject-subagent-context.py`'s entry — they can't mutate sub-agent prompts. Extension-backed platforms (Pi Agent) must not call this at all.

`configurators/shared.ts:renderTemplateMap(files)` — applies `replacePythonCommandLiterals` to every value of a map. The one place the Windows rewrite runs; `writeTemplateMap` and `collectPlatformTemplates` both go through it, which is what makes their bytes equal by construction rather than by discipline.

`configurators/shared.ts:writeTemplateMap(cwd, files)` — renders through `renderTemplateMap`, then writes every entry under `cwd`, creating parent directories. Map keys are split on `/` (`shared.ts:560`), which is why keys must be POSIX — the guide's `toPosix`-at-the-boundary rule is now load-bearing for the write path, not just the hash dictionary. Idempotent.

### Pull-based prelude (class-2 platforms)

`configurators/shared.ts:SubAgentType` — `"implement" | "check"`. `research` is intentionally excluded — research doesn't depend on an active task; it traverses the spec tree.

`configurators/shared.ts:buildPullBasedPrelude` — returns the standard "Required: Load Trellis Context First" block. Used by class-2 platforms whose hook can't inject the sub-agent prompt (Gemini, Qoder, Codex, Copilot). The prelude tells the sub-agent to: (1) read `Active task: <path>` from the dispatch prompt; (2) fall back to `task.py current --source`; (3) ask the user. See `platform-integration.md` "Active task discovery on class-2 platforms (issue #225)" for why all three layers are needed.

`configurators/shared.ts:detectSubAgentType` — returns `"implement"` / `"check"` / `null` from a filename like `trellis-implement.md`. Strips `.md`, `.toml`, `.prompt.md`. Returns `null` for `trellis-research` and unknown names — they skip the prelude.

`configurators/shared.ts:injectPullBasedPreludeMarkdown` — inserts the prelude after a markdown agent's YAML frontmatter, or prepends it if there's no frontmatter.

`configurators/shared.ts:injectPullBasedPreludeToml` — inserts the prelude inside Codex's `developer_instructions = """` block. No-op if the regex doesn't match (defensive — Codex agents always have `developer_instructions`, but if a future agent skips it, the prelude is simply omitted rather than corrupting TOML).

`configurators/shared.ts:applyPullBasedPreludeMarkdown` — apply over a list of `AgentContent`. Convenience wrapper used by class-2 markdown configurators; agents whose `name` doesn't resolve to `implement`/`check` pass through unchanged.

`configurators/shared.ts:applyPullBasedPreludeToml` — TOML equivalent for Codex.

Apply the transform where the agent entries are added to the map, so both paths inherit it from the one description — `for (const agent of applyPullBasedPreludeMarkdown(getAllAgents())) files.set(…)`. Live in `gemini.ts:46`, `qoder.ts:32`, `trae.ts:36`, `copilot.ts:56`, plus grok, kimi and pi.

### Copilot frontmatter normalization

`configurators/shared.ts:normalizeCopilotMarkdownAgents` — Copilot's `tools:` frontmatter uses a different vocabulary (`read` / `edit` / `search` / `execute` / `web` / `exa/*`) than the canonical Claude vocabulary (`Read` / `Write` / `Edit` / `Glob` / `Grep` / `Bash` / `mcp__exa__*`). This helper rewrites a markdown agent's `tools:` line from canonical to Copilot vocabulary. Applied once, inside the `getCursorAgents()` → `normalizeCopilotMarkdownAgents` → `applyPullBasedPreludeMarkdown` chain that feeds `collectCopilotTemplates`'s map entries (`copilot.ts:56-57`).

The internal `mapLegacyToolToCopilot` table is the source of truth for the mapping; if Copilot ever extends its tool vocabulary, edit that switch and add a regression test.

---

## Template maps — a platform's file set, described once

### 1. Scope / Trigger

A platform used to be described twice: `configure<Platform>()` wrote its files to disk and `collectTemplates` returned the same set as a map for `trellis update` to diff. Two descriptions of one thing disagree eventually, and a one-sided edit ships silently — 0.5.5 wrote `.agents/skills/trellis-start/SKILL.md` from `configureCodex` with no matching `collectTemplates` entry, so upgraders' `trellis update` deleted the old skill dir and never regenerated the new one (`migrations/manifests/0.5.7.json`).

There is now exactly one description. This section is the contract for it, and it is a *code-spec* trigger on two counts: the per-category write helpers that let a configurator enumerate files a second time were deleted, and the init/update agreement is a cross-layer contract enforced by a test rather than by types.

### 2. Signatures

```typescript
// configurators/<platform>.ts — the required export, one per platform
export function collect<Platform>Templates(): Map<string, string>;

// configurators/<platform>.ts — only when a residual exists (3 platforms)
export function configure<Platform>(
  cwd: string,
  options?: PlatformConfigureOptions,
): Promise<void>;

// configurators/index.ts:58 — registry entry shape
interface PlatformFunctions {
  configure: (cwd: string, options?: PlatformConfigureOptions) => Promise<void>;
  collectTemplates?: () => Map<string, string>;
}

// configurators/index.ts:75 — derives `configure` from the map
function fromTemplates(
  collectTemplates: () => Map<string, string>,
): PlatformFunctions;

// configurators/shared.ts:538 / :555 — the render and write halves
export function renderTemplateMap(files: Map<string, string>): Map<string, string>;
export function writeTemplateMap(cwd: string, files: Map<string, string>): Promise<void>;

// configurators/index.ts:208 / :220 — the two consumers
export function configurePlatform(id: AITool, cwd: string, options?: PlatformConfigureOptions): Promise<void>;
export function collectPlatformTemplates(id: AITool): Map<string, string> | undefined;
```

### 3. Contracts

**Map key** — a POSIX relative path from the project root, config-dir prefix included (`.cursor/hooks.json`, `.agents/skills/trellis-check/SKILL.md`). Never absolute, never backslashed: `writeTemplateMap` splits on `/` to build the target path, and the same string is the hash key in `.template-hashes.json`, so a Windows-shaped key would produce a different manifest on Windows than on macOS. A configurator that builds keys from `path.join` must pass them through `toPosix` first (`claude.ts:89`, `opencode.ts:67`) — see `guides/cross-platform-thinking-guide.md` → "Logical key vs filesystem path".

**Map value** — the file's final content *before* the `python3` → `python` rewrite. Do not call `replacePythonCommandLiterals` per entry; `renderTemplateMap` does it for the whole map on both paths.

**`collectTemplates` purity** — it takes no `cwd`, and that is deliberate: it cannot read or write the project, so `trellis update` gets the same answer whatever the project looks like. It may read bundled templates off the package's own directory (`claude.ts`, `opencode.ts` walk theirs).

**`configure` derivation** — `fromTemplates(collect…)` gives `configure = (cwd) => writeTemplateMap(cwd, collect…())`. 18 of 21 platforms use it.

**Residual** — the only reason to spell out both fields. A residual is work that survives *after* the shared writer and cannot be expressed as a path→content pair. It must not restate the file list. Three exist:

| Platform | Residual | Why a map can't carry it |
|---|---|---|
| `claude-code` | `--with-statusline` adds `.claude/hooks/statusline.py` and replaces the `settings.json` entry (`claude.ts:146-153`) | Per-init flag; `collectTemplates` has no parameter, and an entry there would force-install the statusline on projects that opted out |
| `codex` | `ensureDir(.codex/skills)` (`codex.ts:206`) | An intentionally empty directory — a user extension point with no file in it |
| `zcode` | one-shot stderr notice that ZCode does not hot-reload hook config (`zcode.ts:82-88`) | Console output, not a file |

`codex` also post-processes the map with `preserveCodexAgentModelKeys(cwd, files)` before writing. That is a map transform, not a residual: it reads `cwd` so it cannot live in `collectTemplates`, but `update.ts:921` runs the same function over its own rendered map, so the two still agree. Note the ordering — `configureCodex` renders *before* preserving (`codex.ts:197`) so the preserved user keys are grafted onto exactly the bytes update compares against.

**Nothing else may decide what a platform installs.** No second directory walk, no additional write inside `configure`, no "and also copy this one file" in `commands/init.ts`. Migrations still name specific paths — that is their job (deleting or renaming files a *previous* version installed) and it is a different question from what the current version installs. Tests may assert specific paths; they must not be the source of them.

### 4. Validation & Error Matrix

Every row is a build failure, not a runtime one. All live in `test/configurators/platforms.test.ts` unless noted.

| Condition | Failure |
|---|---|
| `configure` writes a path `collectTemplates` doesn't hold | "configurePlatform writes no file collectTemplates does not describe, for every platform" — unless the path is in `CONFIGURE_ONLY_PATHS` |
| `collectTemplates` holds a path `configure` doesn't write | "configurePlatform writes collected templates byte-for-byte for every platform" |
| Contents differ between the two | same test, byte compare |
| Contents differ only under `setResolvedPythonCommand("python")` | "configurePlatform and collectTemplates agree under Windows python rendering" — the case a macOS/Linux run cannot see, because the rewrite is a no-op there |
| `configure` creates an empty directory | "created empty directories not named in `CONFIGURE_ONLY_EMPTY_DIRS`" |
| Running `configure` twice changes any byte | "`<id>` is not idempotent" |
| Platform declared in `SHARED_HOOKS_BY_PLATFORM` but its config template never invokes the hook | `test/templates/shared-hooks.test.ts` — see `platform-integration.md` |
| Registry entry omits `collectTemplates` | No failure. `collectPlatformTemplates` returns `undefined`, `trellis update` skips the platform, and `getConfiguredPlatforms` can never detect it. Silent, which is why every platform has one today |

Two exemptions exist, both named constants with a comment:

- `CONFIGURE_ONLY_PATHS = {".claude/hooks/statusline.py"}` — opt-in only, kept out of `collectTemplates` on purpose and separately locked by `regression.test.ts` "[statusline-opt-in] statusline.py is not in claude's collected templates". **Known, deliberately unfixed consequence**: init records the file in `.template-hashes.json`, then `pruneOrphanManifestKeys` drops it as an orphan (it is in neither `collectTemplates` nor a migration), so an opted-in user's statusline is frozen after their first `trellis update` and left behind by `trellis uninstall`.
- `CONFIGURE_ONLY_EMPTY_DIRS = { codex: [".codex/skills"] }` — the one empty directory.

### 5. Good / Base / Bad Cases

- **Good** — a new platform ships `collect<Platform>Templates()` and one `fromTemplates(...)` line in `PLATFORM_FUNCTIONS`. `configure` is derived; `trellis update` tracks every file from the first release; nothing can drift because there is nothing to drift from.
- **Base** — a platform needs a residual. It exports both, `configure` calls `writeTemplateMap(cwd, collect…())` first, and the residual runs after with a comment naming what a map cannot express. `configureZcode` (`zcode.ts:76-89`) is the smallest example: one write call, one notice.
- **Bad** — `configure` opens its own `writeFile` for "just one more file". It is now invisible to `trellis update`: never hash-tracked, never updated, never uninstalled. This is the 0.5.5 codex bug verbatim, and the reverse assertion exists to catch exactly it.

### 6. Tests Required

When you add or change a platform's file set:

1. `test/configurators/platforms.test.ts` — the four whole-registry assertions in §4 cover it automatically; they derive the platform list from `PLATFORM_IDS`, so a new platform is covered the moment it is registered. **Do not add a per-platform copy of them.**
2. `test/templates/<platform>.test.ts` — assert the *content* of what the platform emits (which agents, which commands, correct frontmatter). Assertion point: the resolver output, not the map, so a rename in the map doesn't silently pass.
3. If the change adds a residual, add a test that exercises it directly — assertion point is the residual's own effect (a directory exists / a file is present / stderr matched), never the file set, which the registry-wide tests already own.
4. If a path must be exempt from the parity oracle, add it to `CONFIGURE_ONLY_PATHS` or `CONFIGURE_ONLY_EMPTY_DIRS` **with a comment stating why and what the consequence is**. A silently weakened assertion is how the two-description bug survived three releases.

### 7. Wrong vs Correct

#### Wrong

```typescript
// configurators/foo.ts
export async function configureFoo(cwd: string): Promise<void> {
  for (const agent of getAllAgents()) {
    await writeFile(path.join(cwd, ".foo/agents", `${agent.name}.md`), agent.content);
  }
  await writeFile(path.join(cwd, ".foo/config.json"), getConfig());
}

export function collectFooTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  for (const agent of getAllAgents()) {
    files.set(`.foo/agents/${agent.name}.md`, agent.content);
  }
  return files;                       // config.json described nowhere
}
```

The file set is written down twice. `config.json` is on disk but untracked, so `trellis update` will never update it and `trellis uninstall` will leave it behind.

#### Correct

```typescript
// configurators/foo.ts — the only description
export function collectFooTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  for (const agent of getAllAgents()) {
    files.set(`.foo/agents/${agent.name}.md`, agent.content);
  }
  files.set(".foo/config.json", resolvePlaceholders(getConfig()));
  return files;
}

// configurators/index.ts
foo: fromTemplates(collectFooTemplates),
```

No `configureFoo` at all. If Foo later needs a residual, it grows a `configureFoo` that calls `writeTemplateMap(cwd, collectFooTemplates())` **and then** does the residual — it never re-lists the files.

---

## Placeholder substitution semantics

Resolution happens **at template-write time** (`trellis init`, `trellis update`). There are no runtime placeholders — by the time a hook script or agent definition is written to disk, every `{{…}}` is gone.

### Substitution table

| Placeholder | Source | Resolved by | Notes |
|-------------|--------|-------------|-------|
| `{{PYTHON_CMD}}` | `getPythonCommandForPlatform()` | `resolvePlaceholders`, `resolvePlaceholdersNeutral`, `replacePythonCommandLiterals` (line-wise, applied additionally on every write) | Init resolves once after probing host; tests must `resetResolvedPythonCommand()` |
| `{{CMD_REF:name}}` | `ctx.cmdRefPrefix` | `resolvePlaceholders` (per-platform) / `resolvePlaceholdersNeutral` (`` `name` (Trellis command) ``) | Use neutral form for any `.agents/skills/` write |
| `{{EXECUTOR_AI}}` | `ctx.executorAI` | both renderers | Description of the AI executor for prompt prose |
| `{{USER_ACTION_LABEL}}` | `ctx.userActionLabel` | both renderers | UI label, e.g. "in chat" |
| `{{CLI_FLAG}}` | `ctx.cliFlag` | both renderers | E.g. `claude`, `codex`, used in `--platform` examples |
| `{{#AGENT_CAPABLE}}…{{/AGENT_CAPABLE}}` | `ctx.agentCapable` | both renderers | Block kept iff true |
| `{{^AGENT_CAPABLE}}…{{/AGENT_CAPABLE}}` | `ctx.agentCapable` | both renderers | Block kept iff false |
| `{{#HAS_HOOKS}}…{{/HAS_HOOKS}}` | `ctx.hasHooks` | both renderers | Block kept iff true |
| `{{^HAS_HOOKS}}…{{/HAS_HOOKS}}` | `ctx.hasHooks` | both renderers | Block kept iff false |

Adding a new placeholder requires three changes — the regex constant at the top of `shared.ts`, a substitution in `resolvePlaceholders`, and the same in `resolvePlaceholdersNeutral`. Forgetting the neutral renderer is a silent bug for any platform writing into `.agents/skills/`.

### Conditional block cleanup

After conditional blocks are stripped, both renderers run `RE_BLANK_LINES = /\n{3,}/g` → `\n\n` to collapse the empty regions that removed blocks leave behind. This means templates can use `{{#FLAG}}…{{/FLAG}}` separated from surrounding prose by blank lines without producing 5-line gaps when the flag is false.

---

## Cross-configurator invariants

Configurators must respect these. They are not enforced by types; tests in `test/configurators/` and `test/regression.test.ts` catch most violations.

- **A platform's file set is described once.** `collect<Platform>Templates()` is that description; `configure` writes it. See "Template maps" above for the full contract, the three permitted residuals, and the parity oracle that enforces it in both directions.
- **`replacePythonCommandLiterals` runs once per map, in `renderTemplateMap`.** Both `writeTemplateMap` (init) and `collectPlatformTemplates` (update) go through it, so the rewrite cannot land on one path only. A configurator that calls it per entry is either wrapping the value in another encoding (`snow.ts:85`) or duplicating work — the rewrite is idempotent, so the duplicate is harmless but pointless.
- **`.agents/skills/` writes use `resolvePlaceholdersNeutral`.** See `platform-integration.md` "Rule: `.agents/skills/` writes use `resolvePlaceholdersNeutral()`". Per-platform skill roots (`.claude/skills/`, `.qoder/skills/`, etc.) keep using `resolvePlaceholders`.
- **Class-2 agent definitions carry the pull-based prelude.** `applyPullBasedPreludeMarkdown` / `applyPullBasedPreludeToml` must run on every class-2 platform's `trellis-implement` and `trellis-check` definitions (research is intentionally exempt).
- **Pull-based prelude wording is the same on every class-2 platform.** They all call `buildPullBasedPrelude`. A platform that hand-rolls its own prelude breaks the cross-platform contract documented in `platform-integration.md` "Active task discovery on class-2 platforms".
- **`start.md` is filtered only on `agentCapable && hasHooks` platforms.** `filterCommands` is private; `resolveCommands` / `resolveAllAsSkills` / `resolveAllAsSkillsNeutral` apply it. The filter intentionally keeps `start` when `hasHooks=false` (Codex / ZCode / OpenCode / Reasonix) — those platforms have no SessionStart-style hook to inject opening context, so users need an invocable `start`. Configurators must not bypass these resolvers and call `getCommandTemplates()` directly — that re-introduces `start` on hook-bearing platforms that don't need it. Inversely, **a configurator must not re-implement its own "filter start" rule** — that's how the 0.5.5 → 0.6.4 Codex special-case helper (`resolveCodexTrellisStartSkill`) leaked into the codebase and stayed there for three release lines. Pi is the only approved prompt fallback exception, and it still obtains `start` through `resolveCommands` with the Pi context adjusted to `hasHooks: false`.
- **Skill / command descriptions live in `SKILL_DESCRIPTIONS` / `COMMAND_DESCRIPTIONS`.** Adding a workflow skill or palette command requires adding the description here; the wrapper helpers throw at init if the description is missing.
- **Bundled skills already own frontmatter.** `wrapWithSkillFrontmatter` must not be applied to `resolveBundledSkills` output. `collectSkillTemplates` takes bundled files as a separate third argument for this reason.
- **Hooks dir entries come from `collectSharedHooks(hooksPath, platform)`.** The `platform` arg drives the per-platform inclusion list from `SHARED_HOOKS_BY_PLATFORM` — configurators must not pass an arbitrary file list of their own, because that table is also what `shared-hooks.test.ts` checks the platform's hook config against. Class-2 platforms are simply absent from `inject-subagent-context.py`'s entry.

---

## Boundaries

`configurators/shared.ts` does not:

- **Encode platform-specific layout.** Where each platform writes (`.claude/`, `.codex/`, `.gemini/`, etc.) is decided by the per-platform configurator. Shared helpers take a `dir` argument and don't compute it.
- **Read user input.** Init prompts, `--user`, `--force` flags, project-type detection — all in `commands/init.ts` and the platform configurator's body.
- **Touch the network.** No template fetching; no version probing. Everything operates on bundled templates loaded from `templates/common/index.ts` and `templates/shared-hooks/index.ts`.
- **Mutate the registry.** `types/ai-tools.ts:AI_TOOLS` is read-only from this file. Adding a platform updates the registry first, then the configurator file consumes it.
- **Decide capability flags.** `agentCapable` / `hasHooks` come from the `TemplateContext` constructed in `configurators/index.ts`; shared helpers only read them.
- **Touch user-owned spec/task content outside the operation contract.** Retired identity/workspace/history is never read or mutated, including by migration logic. See [Identity-Free Task Lifecycle](./identity-free-task-lifecycle.md).
- **Cache anything other than the resolved Python command.** The single piece of module state (`resolvedPythonCommand`) exists because init runs once and configurators are called repeatedly afterward. Anything else with cross-call lifetime belongs at the `commands/init.ts` call site, not here.

---

## Common pitfalls

### Adding platform-specific behavior to `shared.ts`

Wrong:

```typescript
// In shared.ts
export function wrapClaudeAgent(name: string, content: string): string {
  return `---\nname: ${name}\ntype: claude-agent\n---\n${content}`;
}
```

Correct: that wrapping belongs in `configurators/claude.ts:configureClaude`. Only promote helpers to `shared.ts` when a second configurator needs them.

### Forgetting the neutral renderer for `.agents/skills/`

Wrong:

```typescript
// In configurators/codex.ts
files.set(".agents/skills/check/SKILL.md", resolvePlaceholders(tmpl, ctx));
```

Correct:

```typescript
files.set(".agents/skills/check/SKILL.md", resolvePlaceholdersNeutral(tmpl, ctx));
```

Or call `resolveSkillsNeutral(ctx)` / `resolveAllAsSkillsNeutral(ctx)`. The neutral renderer makes byte-identity hold across platforms that target the same path.

### Re-listing a platform's files inside `configure`

Wrong:

```typescript
export async function configureFoo(cwd: string): Promise<void> {
  await writeTemplateMap(cwd, collectFooTemplates());
  // "just one more file"
  await writeFile(path.join(cwd, ".foo/extra.json"), getExtra());
}
```

Correct: put `.foo/extra.json` in `collectFooTemplates()` and delete the extra write. A residual runs *after* the writer and does something a `Map<path, content>` cannot express — it never adds a file. See "Template maps" above; the parity oracle in `test/configurators/platforms.test.ts` fails on this exact shape.

### Calling `getCommandTemplates()` directly in a configurator

Wrong:

```typescript
for (const cmd of getCommandTemplates()) {   // includes start.md unconditionally
  files.set(`.foo/commands/${cmd.name}.md`, cmd.content);
}
```

Correct:

```typescript
for (const cmd of resolveCommands(ctx)) {
  files.set(`.foo/commands/${cmd.name}.md`, cmd.content);
}
```

`resolveCommands` filters `start` only for `agentCapable && hasHooks` platforms and runs `resolvePlaceholders`. Direct iteration re-introduces `start` on platforms that don't need it (hook-bearing ones) and skips placeholder resolution.

Pi-specific fallback:

```typescript
const start = resolveCommands({ ...piCtx, hasHooks: false }).find(
  (command) => command.name === "start",
);
```

This is allowed only because Pi's `session_start` event cannot inject model-visible context. Keep the fallback in Pi's configurator, not in shared filtering logic.

### Forgetting `replacePythonCommandLiterals` in a write outside a template map

Platform configurators can't hit this any more — everything they emit goes through `renderTemplateMap`. It still applies to writers that don't produce a platform map, `configurators/workflow.ts` being the one in the tree.

Wrong:

```typescript
// configurators/workflow.ts — writing .trellis/ content directly
await writeFile(path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE), workflowMd);
```

Correct:

```typescript
await writeFile(
  path.join(cwd, PATHS.WORKFLOW_GUIDE_FILE),
  replacePythonCommandLiterals(workflowMd),
);
```

If init writes `python3` but the host is Windows where `python3` doesn't exist, the script silently fails at runtime. The rewrite is idempotent, so calling it on content that will also pass through `renderTemplateMap` is harmless.

### Missing skill / command description

Wrong: adding a new skill template under `templates/common/skills/foo.md` without registering its description.

Correct: edit `SKILL_DESCRIPTIONS` in `configurators/shared.ts` to add the new entry, then add a regression test asserting `wrapWithSkillFrontmatter("trellis-foo", "...")` does not throw. The throw at init time is the safety net that prevents shipping a skill the AI matcher can never trigger.

### Applying prelude to research

Wrong:

```typescript
// In collectGeminiTemplates, by hand
for (const agent of agents) {
  agent.content = injectPullBasedPreludeMarkdown(agent.content, "implement");
}
```

This applies the prelude even to `trellis-research`, which doesn't have an active task to load. Correct: use `applyPullBasedPreludeMarkdown(agents)` — `detectSubAgentType` returns `null` for research, so the helper passes it through unchanged.

### Class-1 platform calling `applyPullBasedPreludeMarkdown`

Wrong: a hook-inject platform (Claude, Cursor, CodeBuddy, OpenCode, Kiro, Droid) running `applyPullBasedPreludeMarkdown` on its agent definitions.

Correct: hook-inject platforms inject context via `inject-subagent-context.py` (or OpenCode's plugin). Adding the prelude to the agent definition duplicates the context payload — once via the hook prompt mutation and once via the agent's startup self-load. Only class-2 platforms apply the prelude.

### Reading `process.platform` directly inside a configurator helper

Wrong:

```typescript
// In a per-platform configurator
const pythonCmd = process.platform === "win32" ? "python" : "python3";
```

Correct:

```typescript
const pythonCmd = getPythonCommandForPlatform();
```

`process.platform` ignores the resolved-cache that init populates. On a Windows host where init resolved to `py -3`, the wrong form writes `python` literally and fails at runtime.

### Caching at module scope

Wrong: adding a second module-level `let` in `shared.ts` to memoize anything other than the resolved Python command.

Correct: configurators are called from `configurators/index.ts:configurePlatform` and `configurators/index.ts:collectPlatformTemplates`. Pass derived values through arguments. The only module state in this file is `resolvedPythonCommand`, and that exists because init runs in a separate process boundary from the configurator-driven test runs that exercise rendering without init.

---

## Test conventions

Most behavior here is covered by:

- `test/configurators/index.test.ts` — exercises `resolvePlaceholders`, `resolvePlaceholdersNeutral`, conditional blocks, `start` filtering, `wrapWithSkillFrontmatter` throw-on-missing-description.
- `test/configurators/platforms.test.ts` — the whole-registry `configure` ⟷ `collectTemplates` parity oracle (both directions, both rendering modes, empty dirs, idempotency) plus per-platform content checks.
- `test/regression.test.ts` — historical issue gates: pull-based prelude alignment between write/collect (issue #225); `.agents/skills/` neutral rendering byte-identity; Codex `trellis-start` skill present after both init and update.
- `test/templates/<platform>.test.ts` — that the relevant resolver returns the expected set for each platform.

When adding a new helper to `shared.ts`:

1. Add a unit test in `test/configurators/index.test.ts` exercising the contract directly (input → output, error cases, idempotency).
2. If the helper produces map entries, nothing extra is needed for init/update parity — the oracle in `platforms.test.ts` already covers every platform in both directions. Add a regression test only for behavior the oracle cannot see, e.g. content that is correct on both paths but wrong.
3. If the helper introduces a new placeholder, extend `resolvePlaceholders` and `resolvePlaceholdersNeutral` together; the test suite for `test/configurators/index.test.ts` includes "neutral renderer parity" cases that catch single-renderer additions.
4. If the helper changes the rendered output of an existing template, run `pnpm test` and visually confirm the diff in the platform integration tests; failure usually points at a missing transform on one side of the init/update pair.

When removing a helper:

- Delete uses in every configurator first (`grep -r "helperName" packages/cli/src/configurators/`), then remove from `shared.ts`. Removing from `shared.ts` first leaves stale call sites that compile if the import survives — TypeScript only catches the bare reference, not a removed export with the same name accidentally re-introduced later.
- Run `pnpm typecheck` after removal, then `pnpm test` — type errors usually appear before test failures here because every configurator imports `shared.ts` directly.
