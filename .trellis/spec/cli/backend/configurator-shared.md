---
name: configurator-shared
description: "configurators/shared.ts public surface: placeholder substitution, write helpers, pull-based prelude, cross-configurator invariants"
paths:
  - packages/cli/src/configurators/shared.ts
---
# Configurator Shared Helpers

How `packages/cli/src/configurators/shared.ts` is structured: what it exports, what each helper guarantees, and when a platform configurator should reach for shared logic vs. write its own.

For per-platform integration mechanics (which directory each platform writes, which hooks each one registers), see `platform-integration.md`. This spec only covers the cross-cutting helpers.

---

## Overview

`configurators/shared.ts` exists to keep platform configurators (`configurators/claude.ts`, `configurators/cursor.ts`, `configurators/codex.ts`, `configurators/gemini.ts`, `configurators/iflow.ts`, `configurators/kiro.ts`, `configurators/qoder.ts`, `configurators/copilot.ts`, `configurators/codebuddy.ts`, `configurators/droid.ts`, `configurators/kilo.ts`, `configurators/antigravity.ts`, `configurators/devin.ts`, `configurators/pi.ts`, `configurators/opencode.ts`) from independently re-implementing the same byte-for-byte rendering, write, and prelude-injection logic. Drift between configurators reliably becomes a bug:

- If two platforms render `{{PYTHON_CMD}}` differently, `trellis update`'s template-hash compare reports a phantom diff after every install.
- If two configurators that both write into `.agents/skills/` resolve `{{CMD_REF}}` per-platform, the last writer wins and clobbers the other (see `platform-integration.md` "Rule: `.agents/skills/` writes use `resolvePlaceholdersNeutral()`").
- If `configure*()` writes through a helper but `collectTemplates()` byte-renders the raw template, hash tracking churns on every `trellis update`.

A helper belongs in `shared.ts` when (a) two or more configurators need the same behavior **or** (b) a single configurator needs the helper in **both** the init write path and the update collect path — putting it in shared.ts forces both to call the same code.

A helper does **not** belong in `shared.ts` when it encodes platform-specific formatting (e.g. Codex TOML agents, OpenCode plugin JSON, Kiro JSON agents). Those stay in the per-platform configurator.

---

## Public helper roster

### Python command resolution

`configurators/shared.ts:setResolvedPythonCommand` — called once by `commands/init.ts` after probing the host (`python` / `python3` / `py -3`). All subsequent renders pick up the resolved value.

`configurators/shared.ts:resetResolvedPythonCommand` — test helper. Unit tests that exercise rendering without going through init must call this in `beforeEach`/`afterEach` to avoid leaking module state between cases.

`configurators/shared.ts:getPythonCommandForPlatform` — returns the resolved command if init has run; otherwise the static default (`python` on Windows, `python3` elsewhere). The optional `platform` arg exists solely for unit tests; production callers must not pass it (passing it bypasses the resolved cache).

`configurators/shared.ts:replacePythonCommandLiterals` — line-wise replace of literal `python3` with the resolved command, **excluding shebang lines** (`#!`). Idempotent; no-op when the resolved command is `python3`. Applied at write time so even raw `.py`, `.toml`, `.md` content (templates that don't go through `resolvePlaceholders`) gets the right command on Windows. Every public write helper (`writeSkills`, `writeAgents`, `writeSharedHooks`) calls this before writing — a configurator that does its own `await writeFile(...)` must call it explicitly.

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

`configurators/shared.ts:resolveAllAsSkills` — folds command templates into skill format (with `trellis-` prefix and skill frontmatter). Used by skill-only platforms (Codex, Kiro, Qoder when emitting workflow skills). `start` is filtered out only when `agentCapable && hasHooks` (same rule as `resolveCommands`); skill-only platforms without hooks (Codex, Reasonix) get a `trellis-start` skill so `<trellis-bootstrap>` notices and manual `/skill trellis-start` invocations resolve.

`configurators/shared.ts:resolveAllAsSkillsNeutral` — same, but neutral. Used by Codex for command-as-skill files in `.agents/skills/` (`trellis-continue/SKILL.md`, `trellis-finish-work/SKILL.md`, and — on no-hook platforms — `trellis-start/SKILL.md`). When multiple platforms write to `.agents/skills/`, byte-identity is required; running through the neutral renderer is what makes that hold. Platforms with their own command surface, such as ZCode, should keep command entrypoints in that command surface and use `resolveSkills()` for the platform skill root.

`configurators/shared.ts:resolveBundledSkills` — resolves multi-file built-in skills (currently `trellis-meta`) into `ResolvedSkillFile[]`. Each entry has a POSIX-relative path under the skill name (e.g. `trellis-meta/references/core/template-pipeline.md`). Bundled `SKILL.md` already owns its frontmatter — this helper does **not** wrap it. Configurators must pass these to both `writeSkills()` (init) and `collectSkillTemplates()` (update) to keep hash tracking aligned.

### Write helpers

`configurators/shared.ts:writeSkills` — writes single-file workflow skills as `<skillsRoot>/<name>/SKILL.md`, plus any bundled skill files at their relative paths. Calls `replacePythonCommandLiterals` on every write. Idempotent.

`configurators/shared.ts:writeAgents` — writes agent definitions as `<agentsDir>/<name><ext>`. Default extension is `.md`; pass `".toml"` for Codex, `".json"` for Kiro. Used by every configurator that has an agents directory.

`configurators/shared.ts:writeSharedHooks` — copies the platform-independent Python hook scripts from `templates/shared-hooks/` that are registered for `platform`, applying `replacePythonCommandLiterals` to each. The list is determined by `templates/shared-hooks/index.ts:getSharedHookScriptsForPlatform`. Class-2 (pull-based) platforms get the same list **minus** `inject-subagent-context.py` — they can't mutate sub-agent prompts. Extension-backed platforms (Pi Agent) must not call this at all.

`configurators/shared.ts:collectSkillTemplates` — returns the same `Map<path, content>` that `writeSkills` produces, for hash tracking. Both `writeSkills` and `collectSkillTemplates` accept the same `(skillsRoot, skills, bundledSkills)` so configurators can share a single resolved set between init and update paths. Skipping the bundled arg in either call is the canonical way to drift the two paths.

### Pull-based prelude (class-2 platforms)

`configurators/shared.ts:SubAgentType` — `"implement" | "check"`. `research` is intentionally excluded — research doesn't depend on an active task; it traverses the spec tree.

`configurators/shared.ts:buildPullBasedPrelude` — returns the standard "Required: Load Trellis Context First" block. Used by class-2 platforms whose hook can't inject the sub-agent prompt (Gemini, Qoder, Codex, Copilot). The prelude tells the sub-agent to: (1) read `Active task: <path>` from the dispatch prompt; (2) fall back to `task.py current --source`; (3) ask the user. See `platform-integration.md` "Active task discovery on class-2 platforms (issue #225)" for why all three layers are needed.

`configurators/shared.ts:detectSubAgentType` — returns `"implement"` / `"check"` / `null` from a filename like `trellis-implement.md`. Strips `.md`, `.toml`, `.prompt.md`. Returns `null` for `trellis-research` and unknown names — they skip the prelude.

`configurators/shared.ts:injectPullBasedPreludeMarkdown` — inserts the prelude after a markdown agent's YAML frontmatter, or prepends it if there's no frontmatter.

`configurators/shared.ts:injectPullBasedPreludeToml` — inserts the prelude inside Codex's `developer_instructions = """` block. No-op if the regex doesn't match (defensive — Codex agents always have `developer_instructions`, but if a future agent skips it, the prelude is simply omitted rather than corrupting TOML).

`configurators/shared.ts:applyPullBasedPreludeMarkdown` — apply over a list of `AgentContent`. Convenience wrapper used by class-2 markdown configurators; agents whose `name` doesn't resolve to `implement`/`check` pass through unchanged.

`configurators/shared.ts:applyPullBasedPreludeToml` — TOML equivalent for Codex.

The transform must be applied in **both** `configure*()` (write path) and `collectPlatformTemplates.*` (manifest path) for class-2 platforms; otherwise hash tracking churns.

### Copilot frontmatter normalization

`configurators/shared.ts:normalizeCopilotMarkdownAgents` — Copilot's `tools:` frontmatter uses a different vocabulary (`read` / `edit` / `search` / `execute` / `web` / `exa/*`) than the canonical Claude vocabulary (`Read` / `Write` / `Edit` / `Glob` / `Grep` / `Bash` / `mcp__exa__*`). This helper rewrites a markdown agent's `tools:` line from canonical to Copilot vocabulary. Applied in both write and collect paths.

The internal `mapLegacyToolToCopilot` table is the source of truth for the mapping; if Copilot ever extends its tool vocabulary, edit that switch and add a regression test.

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

- **Init and update agree byte-for-byte.** Every file `configure*()` writes during init must appear with byte-identical content in `collectPlatformTemplates.*` for update hash tracking. Any post-write transform (`resolvePlaceholders`, `replacePythonCommandLiterals`, `wrapWithSkillFrontmatter`, `injectPullBasedPreludeMarkdown`, `normalizeCopilotMarkdownAgents`) must run in both paths.
- **`replacePythonCommandLiterals` runs at write time.** Helpers in this file already call it inside `writeSkills` / `writeAgents` / `writeSharedHooks`. A configurator that does its own `await writeFile(...)` must call it explicitly. If `collectTemplates()` returns the post-replacement string, the write must produce the same string.
- **`.agents/skills/` writes use `resolvePlaceholdersNeutral`.** See `platform-integration.md` "Rule: `.agents/skills/` writes use `resolvePlaceholdersNeutral()`". Per-platform skill roots (`.claude/skills/`, `.qoder/skills/`, etc.) keep using `resolvePlaceholders`.
- **Class-2 agent definitions carry the pull-based prelude.** `applyPullBasedPreludeMarkdown` / `applyPullBasedPreludeToml` must run on every class-2 platform's `trellis-implement` and `trellis-check` definitions (research is intentionally exempt).
- **Pull-based prelude wording is the same on every class-2 platform.** They all call `buildPullBasedPrelude`. A platform that hand-rolls its own prelude breaks the cross-platform contract documented in `platform-integration.md` "Active task discovery on class-2 platforms".
- **`start.md` is filtered only on `agentCapable && hasHooks` platforms.** `filterCommands` is private; `resolveCommands` / `resolveAllAsSkills` / `resolveAllAsSkillsNeutral` apply it. The filter intentionally keeps `start` when `hasHooks=false` (Codex / ZCode / OpenCode / Reasonix) — those platforms have no SessionStart-style hook to inject opening context, so users need an invocable `start`. Configurators must not bypass these resolvers and call `getCommandTemplates()` directly — that re-introduces `start` on hook-bearing platforms that don't need it. Inversely, **a configurator must not re-implement its own "filter start" rule** — that's how the 0.5.5 → 0.6.4 Codex special-case helper (`resolveCodexTrellisStartSkill`) leaked into the codebase and stayed there for three release lines. Pi is the only approved prompt fallback exception, and it still obtains `start` through `resolveCommands` with the Pi context adjusted to `hasHooks: false`.
- **Skill / command descriptions live in `SKILL_DESCRIPTIONS` / `COMMAND_DESCRIPTIONS`.** Adding a workflow skill or palette command requires adding the description here; the wrapper helpers throw at init if the description is missing.
- **Bundled skills already own frontmatter.** `wrapWithSkillFrontmatter` must not be applied to `resolveBundledSkills` output. `writeSkills` and `collectSkillTemplates` accept bundled files separately for this reason.
- **Hooks dir writes go through `writeSharedHooks(dir, platform)`.** The `platform` arg drives the per-platform inclusion list. Class-2 platforms automatically lose `inject-subagent-context.py` — configurators must not pass an arbitrary file list of their own.

---

## Boundaries

`configurators/shared.ts` does not:

- **Encode platform-specific layout.** Where each platform writes (`.claude/`, `.codex/`, `.gemini/`, etc.) is decided by the per-platform configurator. Shared helpers take a `dir` argument and don't compute it.
- **Read user input.** Init prompts, `--user`, `--force` flags, project-type detection — all in `commands/init.ts` and the platform configurator's body.
- **Touch the network.** No template fetching; no version probing. Everything operates on bundled templates loaded from `templates/common/index.ts` and `templates/shared-hooks/index.ts`.
- **Mutate the registry.** `types/ai-tools.ts:AI_TOOLS` is read-only from this file. Adding a platform updates the registry first, then the configurator file consumes it.
- **Decide capability flags.** `agentCapable` / `hasHooks` come from the `TemplateContext` constructed in `configurators/index.ts`; shared helpers only read them.
- **Touch user-owned spec content.** `.trellis/spec/`, `.trellis/.developer`, `.trellis/tasks/`, `.trellis/workspace/`, `.trellis/.current-task` are protected paths owned by `commands/update.ts` migration logic, not by configurators.
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

### Init writes through helper, update collect renders raw

Wrong:

```typescript
// configureFoo
await writeAgents(dir, applyPullBasedPreludeMarkdown(agents));
// collectFoo
files.set(`${dir}/${a.name}.md`, a.rawContent);  // missing prelude
```

Correct: feed the same agent list through `applyPullBasedPreludeMarkdown` in both paths, then pass the result to `writeAgents` and `collectTemplates` respectively. After every `trellis update` on a stable installation the hash-tracker must report zero changes.

### Calling `getCommandTemplates()` directly in a configurator

Wrong:

```typescript
const cmds = getCommandTemplates();   // includes start.md unconditionally
for (const cmd of cmds) {
  await writeFile(path.join(dir, `${cmd.name}.md`), cmd.content);
}
```

Correct:

```typescript
for (const cmd of resolveCommands(ctx)) {
  await writeFile(path.join(dir, `${cmd.name}.md`), cmd.content);
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

### Forgetting `replacePythonCommandLiterals` in a custom write

Wrong:

```typescript
// Custom write that bypasses writeAgents / writeSkills
await writeFile(path.join(dir, "custom.py"), template);
```

Correct:

```typescript
await writeFile(path.join(dir, "custom.py"), replacePythonCommandLiterals(template));
```

If init writes `python3` but the host is Windows where `python3` doesn't exist, the script silently fails at runtime. Every helper exported from this file already handles it; ad-hoc writes must call it explicitly.

### Missing skill / command description

Wrong: adding a new skill template under `templates/common/skills/foo.md` without registering its description.

Correct: edit `SKILL_DESCRIPTIONS` in `configurators/shared.ts` to add the new entry, then add a regression test asserting `wrapWithSkillFrontmatter("trellis-foo", "...")` does not throw. The throw at init time is the safety net that prevents shipping a skill the AI matcher can never trigger.

### Applying prelude to research

Wrong:

```typescript
// In configureGemini, by hand
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
- `test/configurators/platforms.test.ts` — per-platform `configurePlatform()` writes the expected files and `collectPlatformTemplates()` returns matching content.
- `test/regression.test.ts` — historical issue gates: pull-based prelude alignment between write/collect (issue #225); `.agents/skills/` neutral rendering byte-identity; Codex `trellis-start` skill present after both init and update.
- `test/templates/<platform>.test.ts` — that the relevant resolver returns the expected set for each platform.

When adding a new helper to `shared.ts`:

1. Add a unit test in `test/configurators/index.test.ts` exercising the contract directly (input → output, error cases, idempotency).
2. If the helper is called by both `configure*()` and `collectTemplates()`, add a regression test asserting byte-identity between the two outputs for at least one platform (`test/regression.test.ts` is the right home — group with existing `[init-update-parity]` cases).
3. If the helper introduces a new placeholder, extend `resolvePlaceholders` and `resolvePlaceholdersNeutral` together; the test suite for `test/configurators/index.test.ts` includes "neutral renderer parity" cases that catch single-renderer additions.
4. If the helper changes the rendered output of an existing template, run `pnpm test` and visually confirm the diff in the platform integration tests; failure usually points at a missing transform on one side of the init/update pair.

When removing a helper:

- Delete uses in every configurator first (`grep -r "helperName" packages/cli/src/configurators/`), then remove from `shared.ts`. Removing from `shared.ts` first leaves stale call sites that compile if the import survives — TypeScript only catches the bare reference, not a removed export with the same name accidentally re-introduced later.
- Run `pnpm typecheck` after removal, then `pnpm test` — type errors usually appear before test failures here because every configurator imports `shared.ts` directly.
