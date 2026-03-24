# Decouple `.agents/skills/` from Codex — Shared Agent Skills Layer

## Goal

Decouple `.agents/skills/` from the codex platform and establish it as a shared "Agent Skills" layer. Currently Trellis binds `.agents/skills/` as codex's `configDir`, but `.agents/skills/` is an **open standard** (agentskills.io) used by 8+ Agent CLIs. This causes incorrect platform detection and blocks future multi-CLI support.

## Research Summary

### `.agents/skills/` is an Open Standard

Per research on `npx skills` (vercel-labs/skills, 11K+ stars) and official docs:

**Universal agents (all use `.agents/skills/` at project level):**
- OpenAI Codex, Kimi CLI, Amp (Sourcegraph), Cline, Warp, OpenCode, Replit, Antigravity, GitHub Copilot, Gemini CLI

**Platform-specific agents (use their own directories):**
- Claude Code → `.claude/skills/`
- Cursor → `.cursor/skills/`
- Kiro → `.kiro/skills/`

### Directory Ownership Model

| Directory | Owner | Purpose |
|-----------|-------|---------|
| `.agents/skills/` | **Shared standard** | Cross-platform skills (agentskills.io) |
| `.codex/` | **Codex only** | config.toml, agents/*.toml |
| `AGENTS.md` | **Shared standard** | Project instructions (14+ tools) |
| `.claude/` | Claude Code only | commands, settings, hooks |
| `.cursor/` | Cursor only | rules |

### `npx skills` Reference Architecture

`npx skills` uses `isUniversalAgent()` to determine if an agent belongs to the `.agents/skills/` shared group. This validates our approach of treating `.agents/skills/` as a shared layer.

## Decision (ADR-lite)

**Context**: `.agents/skills/` is bound to codex as `configDir`, but it's actually a shared standard.

**Decision**: Introduce `supportsAgentSkills` flag on `AIToolConfig`. Platforms that set this flag get `.agents/skills/` installed as a shared layer. Change codex's `configDir` to `.codex/` (its actual platform-specific directory).

**Consequences**:
- Platform detection no longer maps `.agents/skills/` → codex
- `.agents/skills/` installation is decoupled from any single platform
- Future platforms (Kimi CLI, etc.) can declare `supportsAgentSkills: true`
- Migration needed for existing codex users (configDir change)

## Requirements

### R1: Type System Change
- Add `supportsAgentSkills: boolean` to `AIToolConfig`
- Change codex `configDir` from `".agents/skills"` to `".codex"`
- Set `supportsAgentSkills: true` for codex (and antigravity if applicable)
- Remove `extraManagedPaths` from PR #112 (replaced by this model)

### R2: Shared Skills Installation
- `configureCodex()` splits into: `.codex/` (platform-specific) + `.agents/skills/` (shared)
- Shared skills installation uses a new `configureAgentSkills()` or similar
- `trellis init --codex` installs both `.codex/` and `.agents/skills/`
- `collectPlatformTemplates()` returns paths under both `.codex/` and `.agents/skills/`

### R3: Platform Detection (TS)
- `getConfiguredPlatforms()`: detect codex by `.codex/` existence, not `.agents/skills/`
- `isManagedPath()`: both `.codex/` and `.agents/skills/` are managed
- `ALL_MANAGED_DIRS`: include both `.codex` and `.agents/skills`

### R4: Platform Detection (Python)
- `cli_adapter.py` `config_dir_name`: codex → `.codex` (not `.agents`)
- `cli_adapter.py` `get_command_path`: extract shared skill path logic (`.agents/skills/{name}/SKILL.md`) usable by multiple platforms
- `cli_adapter.py` `detect_platform`: `.agents/skills/` alone → no specific platform; `.codex/` → codex
- `_ALL_PLATFORM_CONFIG_DIRS`: add `.codex`, keep `.agents` (for exclusion checks)
- Template copy (`templates/trellis/scripts/`) must stay in sync

### R5: Tests
- Update `regression.test.ts`: codex configDir assertion → `.codex`
- Update `platforms.test.ts`: codex detection by `.codex/`, not `.agents/skills/`
- Update `init.integration.test.ts`: codex init creates both `.codex/` and `.agents/skills/`
- Update `index.test.ts`: isManagedPath for both directories
- Add test: `.agents/skills/` alone does NOT detect as codex

### R6: PR #112 Integration
- Preserve from PR #112: `.codex/` support, agent TOML templates, new skills (improve-ut, parallel), test additions
- Revert from PR #112: iFlow CLI adapter change (unrelated, possible regression)
- Remove from PR #112: workspace files, task files
- Replace from PR #112: `extraManagedPaths` → `supportsAgentSkills`

## Acceptance Criteria

- [ ] `trellis init --codex` creates `.codex/` (config + agents) AND `.agents/skills/` (shared skills)
- [ ] `trellis update` tracks files under both `.codex/` and `.agents/skills/`
- [ ] Platform detection: `.codex/` → codex; `.agents/skills/` alone → NOT codex
- [ ] `isManagedPath` works for both `.codex/...` and `.agents/skills/...` paths
- [ ] Python `cli_adapter.py` mirrors TS detection logic
- [ ] Python template copy is identical to live script
- [ ] All existing tests pass (with updates)
- [ ] New test: `.agents/skills/` without `.codex/` does not detect as codex
- [ ] `pnpm lint && pnpm typecheck && pnpm test` all green

## Definition of Done

- Tests added/updated (unit + integration + regression)
- Lint / typecheck / CI green
- Python scripts and their template copies are identical
- Docs/specs updated if behavior changes
- Migration manifest considered (if configDir change affects existing users)

## Out of Scope

- Kimi CLI platform support (future task)
- `npx skills` integration
- Changes to migration manifests for historical versions
- `template-fetcher.ts` INSTALL_PATHS change (`.agents/skills` is correct for marketplace)
- `.trellis/gitignore.txt` `.agents/` entry (that's for worktree multi-agent registry, not skills)

## Impact Analysis — Full Change Map

### TS Source (6 files)

| File | Line(s) | Current | Change |
|------|---------|---------|--------|
| `src/types/ai-tools.ts` | 122 | `configDir: ".agents/skills"` | → `".codex"`, add `supportsAgentSkills: true` |
| `src/configurators/index.ts` | 139 | `files.set(".agents/skills/...")` | Split: shared skills + codex-specific |
| `src/configurators/index.ts` | getConfiguredPlatforms | check configDir existence | Check `.codex/` for codex |
| `src/configurators/codex.ts` | 9,12 | Writes to `.agents/skills/` | Split: `.codex/` + shared skills |
| `src/templates/codex/index.ts` | — | Skills only | Add agents + config (from PR #112) |
| `src/templates/antigravity/index.ts` | 27,31,34 | `.agents/skills/` string replace | Verify still works |

### Python Scripts (2 files × 2 copies)

| File | Line(s) | Current | Change |
|------|---------|---------|--------|
| `cli_adapter.py` | 100-101 | `codex → ".agents"` | → `".codex"` |
| `cli_adapter.py` | 197-198 | `codex → ".agents/skills/{name}/SKILL.md"` | Extract shared logic |
| `cli_adapter.py` | 508-519 | `_ALL_PLATFORM_CONFIG_DIRS` missing `.codex` | Add `.codex` |
| `cli_adapter.py` | 592-595 | `.agents/skills` → codex | `.codex/` → codex |
| Template copy | — | Must match live script | Sync after all changes |

### Tests (8 files)

| File | Key Assertions to Update |
|------|-------------------------|
| `test/regression.test.ts` | configDir `.agents/skills` → `.codex` |
| `test/configurators/platforms.test.ts` | Detection + configurePlatform |
| `test/configurators/index.test.ts` | isManagedPath, ALL_MANAGED_DIRS |
| `test/commands/init.integration.test.ts` | Codex init output |
| `test/templates/codex.test.ts` | Agents + config templates |
| `test/templates/extract.test.ts` | getCodexTemplatePath |
| `test/templates/antigravity.test.ts` | No `.agents/skills/` in content |
| `test/registry-invariants.test.ts` | New flag validation |

### Files NOT to Change

| File | Reason |
|------|--------|
| `src/migrations/manifests/*.json` | Historical records |
| `src/utils/template-fetcher.ts:25` | `.agents/skills` is correct marketplace install path |
| `src/templates/trellis/gitignore.txt:11` | `.agents/` = worktree registry, not skills |
| `scripts/common/worktree.py:290` | Multi-agent registry dir, unrelated |
| Skill template content (`SKILL.md` files) | User-facing path references are correct |
