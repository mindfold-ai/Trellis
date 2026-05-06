# Journal - taosu (Part 5)

> Continuation from `journal-4.md` (archived at ~2000 lines)
> Started: 2026-04-30

---



## Session 138: Workflow-state breadcrumb SoT collapse + commit step + auto-active create

**Date**: 2026-04-30
**Task**: Workflow-state breadcrumb SoT collapse + commit step + auto-active create
**Branch**: `feat/v0.5.0-beta`

### Summary

Converged the workflow-state breadcrumb subsystem to workflow.md as single source of truth. R1+R2 added Phase 3.4 commit and Phase 1.3 jsonl curation enforcement to the relevant tag bodies; R5 deleted _FALLBACK_BREADCRUMBS dicts in py + js so drift is structurally impossible (load_breadcrumbs returns {} on miss; build_breadcrumb falls back to 'Refer to workflow.md'); R4 added per-tag managed-block migration in update.ts so existing user projects pick up new tags via trellis update; R7 made task.py create auto-set the session active-task pointer (best-effort + graceful degrade) so [workflow-state:planning] is reachable during brainstorm + jsonl curation; R8 rewrote /trellis:continue Step 3 to route by task.json.status + artifact presence including 1.4 Activate; R6 added new spec at .trellis/spec/cli/backend/workflow-state-contract.md documenting marker syntax / parser-strip backreference invariant / runtime contract / status writer table / lifecycle ≠ status / reachability matrix / hook reachability / custom statuses. trellis-check found 6 nits/observations; landed Findings 1 (parser/strip regex backreference parity in 4 hook scripts + 4 runtime mirrors) + 2 (E2E legacy migration test) + 3 (no_task/completed presence tests) + 6 (create→start idempotency test). 783 → 788 tests passing; lint/typecheck/build all clean. Out of scope (tracked as follow-up): docs-site architecture page sync, trellis-meta SKILL.md update, stale trellis-update-spec/SKILL.md:345 reminder, vestigial 'done' status reader cleanup.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ad49153` | (see git log) |
| `c52ece2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 139: fix opencode trellis-research persist (#211)

**Date**: 2026-05-01
**Task**: fix opencode trellis-research persist (#211)
**Branch**: `feat/v0.5.0-rc`

### Summary

Rewrote opencode trellis-research agent template to grant write/edit permission and added the cursor/claude shared body (PERSIST + Workflow + Scope Limits). Extended the existing 'research agent persists findings' regression test to cover opencode (the missing platform that masked the drift). 789/789 vitest, lint, tsc clean. Closes #211.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fd32162` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 140: regression test for opencode plugin export shape (#212)

**Date**: 2026-05-01
**Task**: regression test for opencode plugin export shape (#212)
**Branch**: `feat/v0.5.0-rc`

### Summary

Added regression test asserting every .opencode/plugins/*.js file has exactly one top-level export and that it is 'export default'. Backfills the missing test for dc2bea3's #212 fix — without this, anyone adding a named export to a plugin file would silently break opencode plugin loading. 792/792 vitest, lint, tsc clean. Manually verified the test catches a probe 'export const X = 1'.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5e938d9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 141: trellis uninstall command (#221)

**Date**: 2026-05-02
**Task**: trellis uninstall command (#221)
**Branch**: `feat/v0.5.0-rc`

### Summary

Added trellis uninstall: manifest-driven removal of all trellis assets + .trellis/ directory. Two-column listing (deleted/modified) + Continue? [Y/n] default Y; --yes / --dry-run options. Four scrubbers preserve user-added fields in 11 structured config files (claude/gemini/factory/codebuddy/qoder/codex/cursor/copilot/opencode/pi/codex-toml). Token-based command matching avoids substring false positives. Cleans up empty managed root dirs after file removal. 23 new tests; 830/830 total pass.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `255d499` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 142: Fix Gemini CLI 0.40.x template compat (#224)

**Date**: 2026-05-03
**Task**: Fix Gemini CLI 0.40.x template compat (#224)
**Branch**: `feat/v0.5.0-rc`

### Summary

Three Gemini CLI 0.40.x bug fixes from issue #224: drop `tools:` line from agent frontmatter (inherit parent), rename hook event UserPromptSubmit→BeforeAgent in settings.json + platform-aware hookEventName branch in inject-workflow-state.py, move shared skills from .gemini/skills/ to .agents/skills/. Bundled `{{CMD_REF}}` neutralization (resolvePlaceholdersNeutral) so Codex+Gemini render byte-identical content in .agents/skills/. Side-fix: needsCodexUpgrade narrowed to Codex-only markers (was false-positive on Gemini's new .agents/skills/ writes). Spec updates: workflow-state-contract.md (platform-aware hookEventName), platform-integration.md (neutral-resolver rule). 847/847 tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9a4c53b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 143: Fix codex sub-agent missing active task (#225)

**Date**: 2026-05-04
**Task**: Fix codex sub-agent missing active task (#225)
**Branch**: `feat/v0.5.0-rc`

### Summary

Class-2 platform sub-agents (codex/copilot/gemini/qoder) couldn't find the active task because they run in separate sessions with different session ids. Three-layer fix: prelude reads 'Active task: <path>' from dispatch prompt, workflow.md in_progress breadcrumb mandates the protocol per turn, and resolve_active_task adds single-session fallback (with new session-fallback source type). 856 tests passing.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8a39265` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


---



## Session 144: TRELLIS_HOOKS env var to disable Trellis hooks at runtime

**Date**: 2026-05-05
**Task**: Inline change — add env-var gate so hook scripts return early when host process opts out
**Branch**: `feat/v0.5.0-rc`

### Summary

Added `TRELLIS_HOOKS=0` / `TRELLIS_DISABLE_HOOKS=1` early-return gate to every shipped Trellis hook (5 Python templates + 3 OpenCode JS plugins) plus their dogfood copies in this repo (12 files). When either env var is set on the host CLI process, all hooks emit empty stdout / no `additionalContext` so Claude/Codex/Cursor/Copilot/OpenCode see no Trellis injection. Use cases: (a) wrapper scripts (`TRELLIS_HOOKS=0 claude`) for casual chat sessions where the operator does not want the workflow breadcrumb / spec index / sub-agent context; (b) programmatic spawn of host CLIs as subprocesses where the parent orchestrator wants a clean session. Researched whether any of Claude Code / Codex / OpenCode / Cursor expose true mid-session hook toggles — none do (Claude Code has `disableAllHooks` in settings.json with file-watcher reload; Cursor has the rename-hooks.json hack; Codex / OpenCode require restart). Concluded env-var gate is the right ergonomic for this round; punted on a `.runtime/config.json` JSON toggle and `task.py hooks on|off` UX until demand is clearer. Also fixed three pre-existing regression test failures rooted in `test/setup.ts` not stripping `*_PROJECT_DIR` host-shell env vars — when a dev runs vitest from inside a Claude Code / Copilot session, those vars made the hooks read the *real* repo's `.trellis/` instead of the test tmpDir. Fix follows the SoT documented in `.trellis/spec/cli/unit-test/conventions.md` "Test Isolation" section.

### Main Changes

- `packages/cli/src/templates/shared-hooks/session-start.py` — extend existing `should_skip_injection()` with TRELLIS_HOOKS / TRELLIS_DISABLE_HOOKS checks
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` — early-return at `main()` head
- `packages/cli/src/templates/shared-hooks/inject-subagent-context.py` — early-return at `main()` head
- `packages/cli/src/templates/shared-hooks/inject-shell-session-context.py` — early-return at `main()` head
- `packages/cli/src/templates/codex/hooks/session-start.py` — prepend gate to local `should_skip_injection()`
- `packages/cli/src/templates/copilot/hooks/session-start.py` — prepend gate to local `should_skip_injection()`
- `packages/cli/src/templates/opencode/plugins/session-start.js` — early-return in `chat.message` handler
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js` — early-return in `chat.message` handler
- `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js` — early-return in `tool.execute.before` handler
- `.claude/hooks/*.py`, `.cursor/hooks/*.py`, `.codex/hooks/*.py`, `.opencode/plugins/*.js` — dogfood sync (12 files)
- `packages/cli/test/setup.ts` — delete CLAUDE_/QODER_/CODEBUDDY_/FACTORY_/CURSOR_/GEMINI_/KIRO_/COPILOT_PROJECT_DIR before tests load
- `packages/cli/test/regression.test.ts` — two new regression tests under "current-task path normalization" / end-of-file: string-level invariant (all 9 hook scripts contain the gate) + runtime integration (baseline emits content; TRELLIS_HOOKS=0 / TRELLIS_DISABLE_HOOKS=1 emit empty stdout)

### Git Commits

| Hash | Message |
|------|---------|
| (pending) | feat(hooks): support TRELLIS_HOOKS=0 env var to disable hooks at runtime |

### Testing

- [OK] `pnpm vitest run` — 858 / 858 tests (was 853 / 856 before this work; 3 pre-existing failures fixed via test/setup.ts, +2 new TRELLIS_HOOKS regression tests)
- [OK] `pnpm lint` clean
- [OK] `pnpm typecheck` clean
- [OK] `pnpm build` clean (templates copied to dist with gate verified via grep on dist/)
- [OK] Python `py_compile` on all 5 modified template `.py` files
- [OK] `node --check` on all 3 modified OpenCode `.js` plugins
- [OK] Manual smoke test: shared-hooks templates emit 0 bytes stdout when invoked with `TRELLIS_HOOKS=0`

### Status

[OK] **Completed**

### Next Steps

- Optional: README / docs-site mention of the new env vars (not done — punted per "fast push" instruction)
- Optional: `.trellis/spec/cli/backend/hooks-runtime-toggle.md` documenting the env-var gate as the only supported runtime toggle and recording the upstream-CLI comparison from this session's research


---



## Session 145: Integrate mem-poc into trellis CLI as 'trellis mem' subcommand

**Date**: 2026-05-04
**Task**: Integrate mem-poc into trellis CLI as 'trellis mem' subcommand
**Branch**: `feat/v0.6.0-beta`

### Summary

Created feat/v0.6.0-beta branch and ported the mem-poc chat-history.ts POC into packages/cli as the 'trellis mem' subcommand group (projects/list/search/context/extract). Wired through commander as a passthrough; added zod ^4 dep; adapted code to Trellis ESLint rules (interface over type, no non-null assertions, 'unknown' callback return for readJsonl). All 847 existing tests pass; smoke-tested all 5 subcommands against real session data.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e1b368d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
