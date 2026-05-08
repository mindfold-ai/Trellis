# Fix Codex generic sub-agent Trellis workflow bleed (#240)

## Goal

When a Codex parent session calls `spawn_agent(message=...)` to launch a generic sub-agent (smoke test, exploration, arbitrary one-off task), the sub-agent currently follows Trellis SessionStart + UserPromptSubmit injections instead of the parent's `spawn_agent.message`. This causes:

1. **NO ACTIVE TASK case** — the sub-agent returns the SessionStart "no active task" template instead of executing the parent message.
2. **Active task case** — the sub-agent runs `task.py add-context` / `task.py start`, writes `implement.jsonl` / `check.jsonl`, then enters `wait_agent(...)` and stays running until manually killed.

Goal: make Trellis injections **subordinate** to an explicit `spawn_agent.message` so generic sub-agents do exactly what the parent told them and nothing else.

## What I already know

### Why it happens

Codex `multi_agent_v2` runs `SessionStart` for every spawned sub-agent. Codex SessionStart payload has no agent-identity field ([`openai/codex#16226`](https://github.com/openai/codex/issues/16226)) so the hook cannot detect "I'm a sub-agent". Same applies to UserPromptSubmit: every sub-agent turn also triggers `inject-workflow-state.py`, which injects the per-turn `<workflow-state>` breadcrumb.

### Existing partial guards (insufficient)

- `codex/hooks/session-start.py` already injects sub-agent self-exemption text at lines 247–254 and 370–373 — but ONLY mentions `trellis-implement` / `trellis-check` roles. Generic sub-agents have no role and skip the exemption.
- v0.5.4 added "Recursion Guard" sections to `trellis-implement` / `trellis-check` agent definition files. Generic sub-agents don't read those files.

### Affected files identified

- `packages/cli/src/templates/codex/hooks/session-start.py` (Codex-only SessionStart)
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` (per-turn breadcrumb across all platforms)
- Possibly: `packages/cli/src/templates/shared-hooks/session-start.py` (used by Claude / Cursor / Gemini / Qoder / CodeBuddy / Droid / Kiro — these platforms typically only fire SessionStart once for main session, but hardening is cheap)

### User's suggested fixes (#240)

1. Always prioritize explicit `spawn_agent.message` over SessionStart no-task guidance.
2. Generic sub-agents do not auto-enter Phase 1/2 unless message asks.
3. Enforce read-only role constraints before Trellis workflow steps (defensive).
4. NO ACTIVE TASK case: do not terminate with "tell me what to do" when concrete spawn message exists.

Suggestions 1, 2, 4 reduce to one prompt-level fix (top-of-injection wrap). Suggestion 3 is a runtime guard in `task.py`.

## Assumptions

- This is **not a 0.5.4 regression** — same behavior existed in 0.5.3 and earlier. Marsor707 happened to test on 0.5.4. Confirm before claiming.
- LLMs reliably honor a "if you have an explicit parent task message, do that and ignore everything below" wrap when placed at the very top of the injected context. v0.5.1 already used a narrower variant of this pattern successfully for `trellis-implement` recursion in `SessionStart`.
- Codex is the only platform with this multi-fire SessionStart problem. Claude / Cursor / OpenCode / Gemini / Qoder / CodeBuddy / Droid / Kiro fire SessionStart only once for the main session.
- The per-turn `inject-workflow-state.py` breadcrumb DOES reach Codex sub-agent turns (every user prompt fires UserPromptSubmit, and sub-agent's "first prompt" = parent's `spawn_agent.message`).

## Requirements

- Add a top-of-injection prompt wrap in `codex/hooks/session-start.py` that explicitly tells a sub-agent reading the injection: if you were spawned via `spawn_agent` with an explicit task message, that message is your only job — execute it and return; do NOT call `task.py` / `wait_agent` / `spawn_agent`; do NOT write task files; ignore all Trellis workflow guidance below.
- Add the same wrap (shorter version) in `inject-workflow-state.py` for the per-turn `<workflow-state>` breadcrumb when running on Codex (detected via `_detect_platform(data) == "codex"`).
- Both wraps must clearly distinguish "main interactive session (use the workflow)" from "sub-agent spawned by parent (do parent's message only)".
- The fix applies to existing `trellis-implement` / `trellis-check` recursion case too — the existing role-based exemption (lines 247–254, 370–373 in session-start.py) becomes redundant but stays in place as a second layer.
- Regression test: assert the packaged Codex SessionStart hook output contains the top-level sub-agent notice; assert `inject-workflow-state.py` output on Codex contains the same notice.

## Acceptance Criteria

- [ ] `packages/cli/src/templates/codex/hooks/session-start.py` injects a sub-agent notice at the very top of `additionalContext` (before `<session-context>`).
- [ ] `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` injects the same notice when `_detect_platform(data) == "codex"`.
- [ ] Notice content explicitly: (a) tells `spawn_agent`-derived sub-agents to execute parent message and stop; (b) forbids `task.py start` / `add-context` / `wait_agent` / `spawn_agent` / file writes unless parent message explicitly asks; (c) tells main interactive session to use workflow normally.
- [ ] Existing `trellis-implement` / `trellis-check` self-exemption text still present (defense in depth).
- [ ] Regression test in `packages/cli/test/regression.test.ts` (or new file) asserts notice presence in both hooks' output.
- [ ] Manual repro in throwaway tmp project: spawn a generic Codex sub-agent with explicit message, confirm it executes the message and does NOT touch `.trellis/tasks/*.jsonl` or call `wait_agent`.
- [ ] `pnpm test` / `pnpm lint` green.

## Definition of Done

- All Acceptance Criteria checked.
- `pnpm test` / `pnpm lint` / `pnpm typecheck` green.
- Phase 3.4 commit landed on `feat/v0.5` with conventional `fix(hooks):` message referencing #240.
- Release (manifest + docs-site changelog + `pnpm release`) deferred — handled separately when the user signals "ship 0.5.5".

## Out of Scope

- Detection-based sub-agent identification (waiting on Codex upstream `codex#16226` — not under our control).
- Defensive `task.py start` / `add-context` runtime guard (suggestion 3 from #240). Reasoning: same root issue (no sub-agent identity) — runtime guard cannot reliably distinguish sub-agent calls. May add a soft-warning print line as nice-to-have; full guard out of scope.
- Refactoring the existing line-247–254 / 370–373 self-exemption text. Stays as second-layer guard.
- Other platforms' SessionStart hooks (Claude / Cursor / etc.) — they don't have multi-fire SessionStart so this issue doesn't apply.
- Issue #238 (`features.multi_agent_v2` config TOML schema). Separate problem.

## Decisions (ADR-lite)

**Decision 1: No `task.py` runtime soft-warning** — pure prompt-level fix only. Adding a stdout note to every `task.py start` / `add-context` call would pollute legitimate users; the prompt wrap covers the vast majority of cases. If post-release reports show wrap is insufficient, revisit with stderr-only variant.

**Decision 2: Test via source-file content assertion** — read the packaged hook source, regex-grep for required marker phrases ("SUB-AGENT NOTICE", "spawn_agent", "Do NOT call task.py", "Do NOT call wait_agent"). Matches existing pattern in `packages/cli/test/regression.test.ts` (e.g. UTF-8 stdout assertion at line 86). Cheaper and more direct than spawning Python; no need to build a fake hook stdin payload.

## Technical Notes

### Files to edit

- `packages/cli/src/templates/codex/hooks/session-start.py` — add wrap at top of `output.write(...)` chain (before line 339 `<session-context>`).
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` — wrap `breadcrumb` output when platform == "codex" (around line 220).
- `packages/cli/test/regression.test.ts` (or new `packages/cli/test/templates/codex-subagent-guard.test.ts`) — assert presence.

### Wrap content (draft)

```
═══════════════════════════════════════════════════════════════════
SUB-AGENT NOTICE — READ FIRST IF SPAWNED VIA spawn_agent
───────────────────────────────────────────────────────────────────
If your parent session spawned you via spawn_agent with an explicit
task message above this hook output, that message is your ONLY job.
  • Execute the parent message exactly as written, then return.
  • IGNORE all Trellis workflow guidance below this notice.
  • Do NOT call task.py start / add-context / archive.
  • Do NOT call wait_agent or spawn_agent.
  • Do NOT modify .trellis/tasks/* or any other file unless your
    parent message explicitly asks for that.

If you are the main interactive Codex session (the user is typing
at the terminal, no parent agent), use the workflow guidance below
normally.
═══════════════════════════════════════════════════════════════════
```

### Verification approach

Manual repro mirrors #240's reproduction:

```text
spawn_agent(
  fork_turns="none",
  task_name="subagent_smoke",
  message="只读检查：1) 当前目录；2) AGENTS.md 是否存在。回复后退出。"
)
```

Expected post-fix: sub-agent replies with the 2 facts then exits; no `.trellis/tasks/*` writes; parent's `wait_agent` returns terminated quickly.

### Related issues / commits

- Issue: https://github.com/mindfold-ai/Trellis/issues/240
- Related (already-fixed adjacent class): #237 (recursion guard), v0.5.1 sub-agent ignore-dispatch wording in `codex/hooks/session-start.py`.
- Codex upstream identity-field request: https://github.com/openai/codex/issues/16226
