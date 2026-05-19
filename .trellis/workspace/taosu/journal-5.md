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


## Session 144: Fix Codex sub-agent recursion (#234) + Cursor agent description format

**Date**: 2026-05-06
**Task**: Fix Codex sub-agent recursion (#234) + Cursor agent description format
**Branch**: `feat/v0.6.0-beta`

### Summary

Two independent sub-agent template bugs fixed. (1) Codex multi_agent_v2: SessionStart hook indiscriminately injected 'dispatch trellis-implement' into every agent session, including spawned sub-agents — they re-read it and recursively spawned another same-name sub-agent, causing the outer wrapper to stay running forever and blocking wait_agent in the main session. Upstream openai/codex#16226 (no agent-identity field in SessionStart stdin) blocks the clean A-hard fix, so applied B + A-soft: Recursion guard at the top of trellis-implement.toml / trellis-check.toml developer_instructions, plus a Sub-agent self-exemption clause in both READY-state and <guidelines> blocks of codex/hooks/session-start.py and shared-hooks/session-start.py (Audit ALL Writers — covers Claude/Cursor/Gemini/Qoder/CodeBuddy/Droid/Kiro). (2) Cursor agent UI was leaving the Description field blank for trellis-research/implement/check because their .md frontmatters used YAML block scalar 'description: |' — Cursor's parser only recognizes inline literals; collapsed all three to single-line literals, body preserved verbatim. Tests: 3 keyword-assert tests in templates/codex.test.ts, 1 in shared-hooks.test.ts, new templates/cursor.test.ts (4 tests). 869/869 vitest green, lint clean. Research persisted to research/codex-sessionstart-subagent-signals.md documenting why A-hard isn't yet feasible.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9768b08` | (see git log) |
| `0f3c706` | (see git log) |
| `d8efcbc` | (see git log) |
| `4cf0ab8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 146: Release 0.5.2: Python <=3.11 f-string SyntaxError hotfix in session-start hooks

**Date**: 2026-05-06
**Task**: Release 0.5.2: Python <=3.11 f-string SyntaxError hotfix in session-start hooks
**Branch**: `main`

### Summary

Hotfix on top of 0.5.1. Trellis 0.5.0-rc.6 added a Windows MSYS/Cygwin/WSL path normalizer using f-string with .replace('/', '\\') inside the expression part. PEP 498 (Python <=3.11) forbids backslashes in f-string expression parts; the file failed to parse, the hook exited code 1 before running, and the user saw 'SessionStart hook (failed) — exited with code 1'. Codex CLI 0.128 + Trellis 0.5.0 reproduced in the field. PEP 701 (Python 3.12) lifted the restriction, hiding the bug from 3.12+ developers. Fix: lifted the .replace(...) call out of each f-string expression into a local variable across 9 occurrences in codex/hooks/session-start.py, copilot/hooks/session-start.py, and shared-hooks/session-start.py (Claude Code / Cursor / Gemini CLI / Qoder / CodeBuddy / Factory Droid / Kiro). Regression coverage in test/regression.test.ts: regex scan asserts no f-string contains a backslash inside any {...} expression, plus a best-effort python3 ast.parse check. 875/875 vitest green, lint clean. Released via main → tag v0.5.2 → GitHub Actions Publish to npm workflow (completed/success, 38s); npm @mindfoldhq/trellis@latest now resolves to 0.5.2.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3f1711b` | (see git log) |
| `263c8c6` | (see git log) |
| `601f213` | (see git log) |
| `2468cb2` | (see git log) |
| `5ad1e21` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 147: Release 0.5.3: class-1 sub-agent context fallback + non-blocking task.py start

**Date**: 2026-05-06
**Task**: Release 0.5.3: class-1 sub-agent context fallback + non-blocking task.py start
**Branch**: `feat/v0.6.0-beta`

### Summary

Hotfix on top of 0.5.2 addressing two related Windows + Claude Code failure modes traced via two trellis-research dispatches. (1) Class-1 platform sub-agent context injection (claude/cursor/opencode/kiro/codebuddy/droid) goes through inject-subagent-context.py PreToolUse hook, but the hook silent-skips on Windows at v2.1.119 (upstream anthropics/claude-code#53254) and existing class-1 sub-agent definition files trusted hook to always fire (no fallback) — sub-agents ran without specs. Added marker-based dual-channel: hook prepends <!-- trellis-hook-injected --> sentinel to build_implement_prompt/build_check_prompt/build_finish_prompt outputs (success path only); each class-1 trellis-implement/trellis-check definition opens with Trellis Context Loading Protocol section that branches on marker (present → hook injected, proceed; absent → read Active task: line + Read prd.md + jsonl yourself). workflow.md dispatch protocol scope changed from class-2-only to all platforms except trellis-research. trellis-research intentionally not marker'd (decoupled from active task). class-2 platforms untouched (already use buildPullBasedPrelude). (2) task.py start hard-failed (return 1) when resolve_context_key returned None, blocking AI when CLAUDE_ENV_FILE not sourced (Windows + Claude Code, --continue resume, fork distributions). Replaced with yellow degraded-mode warning + still flips planning→in_progress + return 0; happy path byte-identical. 16 source files (1 hook + 12 sub-agent defs + workflow + task.py + 1 test) and 156 lines of regression coverage. 890/890 vitest, lint clean. Released via main → tag v0.5.3 → GitHub Actions Publish to npm.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `6272a9e` | (see git log) |
| `1adb7b0` | (see git log) |
| `5b298ba` | (see git log) |
| `a7d54ec` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 148: Workflow-state recursion guard

**Date**: 2026-05-06
**Task**: Workflow-state recursion guard
**Branch**: `feat/v0.6.0-beta`

### Summary

Hardened workflow-state and implement/check agent prompts against recursive Trellis sub-agent dispatch; updated multi-platform templates, specs, and regression tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `0db57e5` | (see git log) |
| `48f966e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 149: 0.5.7 release + Codex dispatch mode + mem unit tests + 0.6 beta sync

**Date**: 2026-05-08
**Task**: 0.5.7 release + Codex dispatch mode + mem unit tests + 0.6 beta sync
**Branch**: `feat/v0.6.0-beta`

### Summary

Shipped 0.5.7 with Codex configurable dispatch mode (codex.dispatch_mode=sub-agent|inline) + new configSectionsAdded manifest field (generic mechanism for future config additions, append-only / idempotent). Tracked Codex 0.129 features.codex_hooks→features.hooks rename + new /hooks TUI approval gate across docs / spec / runtime warning / uninstall scrubber. Found and fixed parser bug in trellis_config.py during dogfood (inline # comments not stripped, breaking inline-mode detection). Merged main into feat/v0.6.0-beta to bring 0.5.5/0.5.6/0.5.7 into beta. Added 84 unit tests for trellis mem command (1461 LoC POC integrated to v0.6.0-beta with 0 coverage); 81.89% statement coverage achieved; only export annotations on mem.ts (no logic edits). Vitest 1019/1019, lint+typecheck green. npm 0.5.7 published as latest tag.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `278b40a` | (see git log) |
| `b5b23fb` | (see git log) |
| `b02faf1` | (see git log) |
| `b829b14` | (see git log) |
| `1ac65c2` | (see git log) |
| `1222f36` | (see git log) |
| `c10ded7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 150: ship 0.5.9 + 0.6.0-beta.1; fix mem --since cross-day; spec audit batches A+B+C+D

**Date**: 2026-05-08
**Task**: ship 0.5.9 + 0.6.0-beta.1; fix mem --since cross-day; spec audit batches A+B+C+D
**Branch**: `feat/v0.6.0-beta`

### Summary

Released 0.5.9 (main) and 0.6.0-beta.1 (feat/v0.6.0-beta) shipping the codex dispatch namespace fix + default inline. Restored 0.6.0-beta.0.json on main for manifest continuity. Fixed tl mem list/search --since to respect cross-day session activity (interval-overlap helper, +23 tests, 1023→1046). Ran full spec audit (48 findings); cleared all P0 + mechanical P1 (Batch A+B+C+D): script-conventions task_context init-context drop, workflow-state-contract writer-table line-number refresh, quality-guidelines + unit-test conventions init.ts:931→:1081, directory-structure tree refresh, docs-site architecture.mdx .current-task fallback claim corrected EN+ZH. Out of scope: Batch E new spec files (mem.md/update.md/uninstall.md/uninstall-scrubbers.md/configurator-shared-helpers.md), Batch F docs-site Mode taxonomy + ai-tools coverage decisions, codex perf one-sided f.until prune, readJsonlFirst streaming, residual MEMORY.md iflow notes.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4b90152` | (see git log) |
| `89bb3a0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 151: spec batch E: 5 new specs for uncovered modules + mem search-index-gap doc

**Date**: 2026-05-08
**Task**: spec batch E: 5 new specs for uncovered modules + mem search-index-gap doc
**Branch**: `feat/v0.6.0-beta`

### Summary

Spawned 5 parallel trellis-implement agents to author commands-mem.md (634), commands-update.md (383), commands-uninstall.md (306), uninstall-scrubbers.md (330), configurator-shared.md (309) — total 1962 lines new spec content. trellis-check single agent reviewed bundle: style consistency (all 5 mirror platform-integration.md), 10 sampled file.ts:symbolName refs all resolved, fixed 1 stale uninstall-scrubbers.md ref (performUninstall→uninstall), updated backend/index.md with 5 rows + 4 checklist lines. Added 'Search index gaps (known limitations)' section to commands-mem.md documenting that tool_use / thinking / tool_result fields are excluded from search index — users searching for tool/skill/agent names should use raw grep over JSONL. Code untouched, 1046/1046 tests pass. Local commit only — not pushed per user directive.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d7341cb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 152: feat: tl mem extract --phase brainstorm|implement|all (cross-day fix already in 0.6.0-beta.2)

**Date**: 2026-05-08
**Task**: feat: tl mem extract --phase brainstorm|implement|all (cross-day fix already in 0.6.0-beta.2)
**Branch**: `feat/v0.6.0-beta`

### Summary

Added --phase flag to tl mem extract for slicing session into [task.py create, task.py start) brainstorm windows. Boundary signal: regex match on Bash tool_use commands with 6+ invoker variants (python/python3/py -3/no prefix, forward/backward/double-escaped slashes, abs/rel paths) and false-positive guards. Single-pass collector emits cleaned turns + task.py events with turnIndex (necessary because the cleaning pipeline drops tool_use). Multi-task pairing: slug match > FIFO; missing-pair fallbacks. Codex/OpenCode degrade to full dialogue + stderr warning. trellis-check caught a real bug (pre-compact task.py events not reset on compaction → stale turnIndex into collapsed [compact summary] surface) and pinned a regression test. Tests: 1046 → 1079 (+33). Spec: commands-mem.md adds ## Phase slicing (--phase) section. Local commit only — not pushed.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a16b8d9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 153: fix(mem): OpenCode SQLite reader (1.2+ users restored, perf streaming, --phase dogfood fixes)

**Date**: 2026-05-08
**Task**: fix(mem): OpenCode SQLite reader (1.2+ users restored, perf streaming, --phase dogfood fixes)
**Branch**: `feat/v0.6.0-beta`

### Summary

Major mem.ts overhaul on feat/v0.6.0-beta. (1) Batch E new spec files (commands-{mem,update,uninstall}.md, uninstall-scrubbers.md, configurator-shared.md, +index.md). (2) Added --phase brainstorm|implement|all to mem extract with task.py create/start boundary detection. (3) Dogfood-driven robustness: shell-arg $(...) closing-paren strip, multi-task.py-per-Bash-command, prose rejection, MM-DD- prefix strip; Codex collectCodexTurnsAndEvents. (4) perf: chunked sync streaming readJsonl + byte-prefix fast-reject — list 3.5s→0.67s (5x), extract 5.8s→0.73s (8x), heap from 36MB→256KB. (5) OpenCode SQLite reader replaces obsolete JSON-tree reader: 138 sessions visible (was 0), search 0.235s on 678 messages. better-sqlite3 added as deps with createRequire bridge for ESM, pnpm.onlyBuiltDependencies for native binding install, dynamic PRAGMA schema defense, soft-degrade if dep load fails. 1085 → 1087 tests. NOT pushed per user directive.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d7341cb` | (see git log) |
| `a16b8d9` | (see git log) |
| `a992325` | (see git log) |
| `7e8f30c` | (see git log) |
| `f26c5fd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 154: marketplace mem-recall: add --phase brainstorm + symlink user local

**Date**: 2026-05-09
**Task**: marketplace mem-recall: add --phase brainstorm + symlink user local
**Branch**: `feat/v0.6.0-beta`

### Summary

Updated marketplace/skills/mem-recall/SKILL.md to match 0.6.0-beta.3: prereq bump, 6 new brainstorm-rationale trigger phrases, new --phase brainstorm section with 5 examples, OpenCode row → SQLite, parent_id rename. Replaced user local ~/.claude/skills/chat-history-recall (old TS POC) with symlink to marketplace mem-recall. trellis-check caught 3 Codex-as-degraded mistakes (Codex actually supports phase), fixed. commands-mem.md spec also has same stale Codex degradation table — out of scope, follow-up.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b397638` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 155: 0.6.0-beta.4 emergency revert: drop better-sqlite3 (Windows install fix)

**Date**: 2026-05-09
**Task**: 0.6.0-beta.4 emergency revert: drop better-sqlite3 (Windows install fix)
**Branch**: `feat/v0.6.0-beta`

### Summary

0.6.0-beta.3 added better-sqlite3 dep for OpenCode SQLite reader. Windows + China-network users hit prebuild-install timeouts; node-gyp fallback needed VS2017+ (most users don't have) → Trellis itself failed to install. Emergency revert: drop the dep, OpenCode adapters return [] + one-shot stderr warning, Claude/Codex unaffected. Synced marketplace mem-recall skill + commands-mem.md spec to match. mem.ts -279 lines, package.json deps cleaned, pnpm-lock -217 lines, tests 1095→1078. Released as 0.6.0-beta.4.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `300b729` | (see git log) |
| `daba04d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 156: Task artifact routing gates

**Date**: 2026-05-10
**Task**: Task artifact routing gates
**Branch**: `feat/v0.6.0-beta`

### Summary

Implemented task artifact contracts, task-creation consent gates, compact SessionStart context, cross-platform artifact loading, and matching CLI regression coverage.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f01c772` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 157: Harden trellis upgrade execution

**Date**: 2026-05-11
**Task**: Harden trellis upgrade execution
**Branch**: `feat/v0.6.0-beta`

### Summary

Added cross-platform command planning for trellis upgrade, routed Windows npm execution through cmd.exe, preserved POSIX shell-free spawn, and expanded npm failure/success diagnostics with tests and spec coverage.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `aa54b45` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 158: Trellis Channel Runtime — multi-agent collaboration layer

**Date**: 2026-05-12
**Task**: Trellis Channel Runtime — multi-agent collaboration layer
**Branch**: `feat/v0.6.0-beta`

### Summary

Built the trellis channel command tree: 11 subcommands, claude/codex worker adapters, supervisor with ShutdownController, project-scoped storage with legacy migration, --ephemeral lifecycle, channel run one-shot, wait --all, --agent + --file + --jsonl context injection. Hardened against spawn race / kill ladder / signal handling bugs via multi-round dogfood CR. Spec doc + agent cards added; codex multi_agent_v2 disabled now that channel owns the multi-agent surface.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a2d3c83` | (see git log) |
| `7608c30` | (see git log) |
| `dab8e57` | (see git log) |
| `f5681a4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 159: Core mem and forum channels

**Date**: 2026-05-14
**Task**: Core mem and forum channels
**Branch**: `feat/v0.6.0-beta`

### Summary

Added the @mindfoldhq/trellis-core/mem subpath API, converted trellis mem into a CLI wrapper, renamed channel thread-board commands to forum terminology, updated specs, and passed Trellis check review.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3e53e17` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 160: Align Agent Artifacts

**Date**: 2026-05-15
**Task**: Align Agent Artifacts
**Branch**: `feat/v0.6.0-beta`

### Summary

Aligned platform check agent templates with the task artifact contract, added optional-artifact regression coverage, and verified the beta templates with focused/full regression tests and typecheck.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fb7a4ed` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 161: Workflow marketplace switcher

**Date**: 2026-05-15
**Task**: Workflow marketplace switcher
**Branch**: `feat/v0.6.0-beta`

### Summary

Implemented workflow marketplace templates and trellis workflow switching, documented the workflow command/update hash contract, and archived the workflow marketplace task.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5c27923` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 162: Channel wait supervisor warnings

**Date**: 2026-05-15
**Task**: Channel wait supervisor warnings
**Branch**: `feat/v0.6.0-beta`

### Summary

Implemented channel wait kind unions and supervisor pre-timeout warning events; split worker inbox API into a follow-up child task; updated channel command spec and tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d2e72268` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 163: Worker inbox core API

**Date**: 2026-05-15
**Task**: Worker inbox core API
**Branch**: `feat/v0.6.0-beta`

### Summary

Added the core worker inbox read/watch API, documented generation-boundary semantics, covered inbox routing and limit edge cases, and completed channel-driven check review.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `86f98938` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 164: Fix Cursor sessionStart context injection

**Date**: 2026-05-15
**Task**: Fix Cursor sessionStart context injection
**Branch**: `feat/v0.6.0-beta`

### Summary

Cursor's sessionStart expects top-level additional_context, not Claude's nested hookSpecificOutput.additionalContext — the schema mismatch caused all Cursor models (including GPT) to silently miss Trellis context. Shared session-start.py now dual-emits both fields. Also dropped the no-op beforeSubmitPrompt → inject-workflow-state.py registration for Cursor (Cursor's beforeSubmitPrompt schema accepts only continue/user_message; per-turn context injection is impossible on Cursor by design). Spec updated to capture both the support-matrix change and the dual-format output contract.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `98339802` | (see git log) |
| `d7491ed2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 165: Channel Worker OOM Guard

**Date**: 2026-05-17
**Task**: Channel Worker OOM Guard
**Branch**: `feat/v0.6.0-beta`

### Summary

Added default idle cleanup and live-worker budget controls for channel workers, with config/env/CLI overrides, supervisor idle termination, core idle projection, tests, and channel command spec updates.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e7d626b0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 166: Core Channel Durable Idempotency

**Date**: 2026-05-17
**Task**: Core Channel Durable Idempotency
**Branch**: `feat/v0.6.0-beta`

### Summary

Added durable idempotency keys to core channel send/thread writes, documented the event-log contract, verified with channel check workers, build, and dist-based real JSONL tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b645447e` | (see git log) |
| `399ef98f` | (see git log) |
| `f301155f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 167: Bundle spec bootstrap skill

**Date**: 2026-05-19
**Task**: Bundle spec bootstrap skill
**Branch**: `feat/v0.6.0-beta`

### Summary

Investigated why v0.6.0-beta.18/19 did not install trellis-spec-bootstarp after trellis init. Ported the bundled spec bootstrap skill into the beta CLI templates, added init/update tracking tests, verified the built CLI through npm pack dry-run and a fresh temp-directory init/update smoke test, documented release artifact smoke-test requirements, updated docs-site changelog notes for Codex timeout bounds, and committed Trellis local platform/template refreshes in separate batches.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `6a8a9049` | (see git log) |
| `99f87d1c` | (see git log) |
| `3a296287` | (see git log) |
| `247d85c1` | (see git log) |
| `8bed2de5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
