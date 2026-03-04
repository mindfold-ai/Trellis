# Task: support-trae-qoder

## Overview
Add Trae and Qoder as supported platforms in Trellis, following existing platform integration patterns. Trae follows the skills-based pattern (like Codex/Kiro), and Qoder follows the commands-only pattern (like Kilo).

## Requirements

### Trae Platform (Skills-based, like Codex)
- AITool: `"trae"`, CliFlag: `"trae"`, configDir: `".trae/skills"`
- templateDirs: `["common", "trae"]`, defaultChecked: `false`, hasPythonHooks: `false`
- Template structure: `src/templates/trae/skills/<skill-name>/SKILL.md`
- Configurator writes skills to `.trae/skills/<name>/SKILL.md`
- collectTemplates returns `".trae/skills/${skill.name}/SKILL.md"` paths
- IDE-only platform (no CLI agent) — `build_run_command` and `build_resume_command` should `raise ValueError`
- `cli_name`: `"trae"`, `supports_cli_agents`: `false`

### Qoder Platform (Commands-only, like Kilo)
- AITool: `"qoder"`, CliFlag: `"qoder"`, configDir: `".qoder"`
- templateDirs: `["common", "qoder"]`, defaultChecked: `false`, hasPythonHooks: `false`
- Template structure: `src/templates/qoder/commands/trellis/<name>.md`
- Configurator copies filtered directory to `.qoder`
- collectTemplates returns `".qoder/commands/trellis/${cmd.name}.md"` paths
- CLI executable: `qodercli`
- `build_run_command`: `["qodercli", "-p", prompt]`
- `detect_platform`: check `.qoder/` directory exists

### Files to Create (8 new files)
1. `src/configurators/trae.ts` — from codex.ts pattern
2. `src/configurators/qoder.ts` — from kilo.ts pattern
3. `src/templates/trae/index.ts` — export `getAllSkills()`
4. `src/templates/trae/skills/*/SKILL.md` — adapt from codex skills
5. `src/templates/qoder/index.ts` — export `getAllCommands()`
6. `src/templates/qoder/commands/trellis/*.md` — adapt from kilo commands
7. `test/templates/trae.test.ts` — skills test
8. `test/templates/qoder.test.ts` — commands test

### Files to Modify (14 files)
1. `src/types/ai-tools.ts` — 3 union types + 2 AI_TOOLS entries
2. `src/configurators/index.ts` — imports + PLATFORM_FUNCTIONS entries
3. `src/templates/extract.ts` — `getTraeTemplatePath()` + `getQoderTemplatePath()`
4. `src/cli/index.ts` — `--trae` and `--qoder` CLI options
5. `src/commands/init.ts` — `trae?` and `qoder?` in InitOptions
6. `src/templates/trellis/scripts/common/cli_adapter.py` — Platform literal + all method branches
7. `src/templates/trellis/scripts/multi_agent/plan.py` — `--platform` choices
8. `src/templates/trellis/scripts/multi_agent/start.py` — `--platform` choices
9. `README.md` — supported tools list
10. `README_CN.md` — supported tools list
11. `test/configurators/platforms.test.ts` — detection + configurator tests
12. `test/commands/init.integration.test.ts` — init tests
13. `test/templates/extract.test.ts` — template path tests
14. `test/regression.test.ts` — platform registration + cli_adapter assertions

## Acceptance Criteria
- [ ] `pnpm build` compiles without errors (TypeScript compile-time assertion catches missing InitOptions fields)
- [ ] `pnpm test` passes with all new and existing tests green
- [ ] `trellis init --trae` creates `.trae/skills/` directory with SKILL.md files
- [ ] `trellis init --qoder` creates `.qoder/` directory with command files
- [ ] Both platforms appear in `getConfiguredPlatforms()` when their config dirs exist
- [ ] `collectTemplates()` returns correct paths for both platforms
- [ ] EXCLUDE_PATTERNS in both configurators include `.js`, `.js.map`, `.d.ts`, `.d.ts.map`
- [ ] cli_adapter.py has explicit branches for trae/qoder in ALL methods (no silent fallthrough)
- [ ] `python3 plan.py --platform trae` and `--platform qoder` are accepted choices
- [ ] README.md and README_CN.md list Trae and Qoder as supported tools

## Technical Notes
- EXCLUDE_PATTERNS MUST include `.js`, `.js.map`, `.d.ts`, `.d.ts.map` to prevent compiled artifacts from being copied in production builds
- `collectTemplates` paths MUST match the directory structure created by `configure()` (asymmetric mechanism is a historical issue)
- cli_adapter.py uses if/elif/else chains with NO exhaustive check — new platforms silently fall through to `else` (Claude defaults). Must add explicit branches for EVERY method
- The compile-time assertion `_AssertCliFlagsInOptions` in init.ts will catch missing InitOptions fields — the build will error if CliFlag has a value not in InitOptions
- Template content must adapt platform-specific command invocation syntax

## Out of Scope
- Trae rules file support (`.trae/rules/`) — separate feature if needed
- Qoder rules/skills support — only commands for now
- Python script Windows-specific testing
- MCP configuration for either platform
- Auto-detection priority tuning (both default to `false` for defaultChecked)
