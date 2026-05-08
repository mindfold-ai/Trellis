# 0.5.8: delete prompt-layer sub-agent dispatch directives

## Goal

0.5.7 introduced **structural** disable of Codex sub-agent collab tools (`[features.multi_agent_v2].enabled = false` in each `codex/agents/trellis-*.toml`). The structural fix made the **prompt-layer** dispatch / wait directives in AGENTS.md, workflow.md, and brainstorm skill **redundant at best, misleading at worst**. Real-world Codex sessions show the leftover prompt-layer rules causing:

- AI applying "ALWAYS wait for every spawned subagent" to phantom / stale `list_agents` records (Bug A)
- AI dispatching `trellis-research` for local-code audits because brainstorm skill's "Research-first Mode" trigger phrases are too broad — sub-agent loses task context, produces noise (Bug B + Bug F)

This patch removes **all** prompt-layer dispatch directives that aren't tied to a specific workflow phase. Sub-agent dispatch survives only where workflow.md explicitly drives it (Phase 2.1 `trellis-implement`, Phase 2.2 `trellis-check`, and inside `[workflow-state:in_progress]` body).

## Resolved decisions

- Scope: **conservative sweep** — keep `[workflow-state:in_progress]` dispatch language and Phase 2.1 / 2.2 detailed sections (the core sub-agent mode contract). Only delete prompts that route to sub-agents OUTSIDE of those explicit workflow steps.
- Default dispatch_mode unchanged (still `sub-agent`). Inline mode opt-in unchanged.
- AGENTS.md `## Subagents` section retired entirely — sub-agent semantics now governed by `.codex/agents/*.toml` (structural) + `workflow.md` (phase-explicit) + AI judgment, not by AGENTS.md prompt rules.

## Files + delete list

### A. `packages/cli/src/templates/markdown/agents.md`

Delete:
- `## Subagents` section (lines 19-29) — the "ALWAYS wait", "NEVER cancel", "Spawn subagents automatically when..." rules
- `### Codex-only — spawn_agent parameters` section (line 30+) — `fork_turns="none"` directive
- `### Codex-only — multi-subagent close-loop` section (line 38+)

### B. `packages/cli/src/templates/trellis/workflow.md`

Surgical deletes:
- **`[workflow-state:no_task]` block (line 154)**: remove sentence "For research-heavy work, dispatch `trellis-research` sub-agents — main agent must NOT do 3+ inline WebFetch / WebSearch / `gh api` calls."
- **`[workflow-state:planning]` block (line 172)**: remove sentence "Research output **must** land in `{task_dir}/research/*.md`, written by `trellis-research` sub-agents. The main agent should not inline WebFetch / WebSearch — the PRD only links to research files."
- **`[workflow-state:planning-inline]` block (line 185)**: remove sentence "In inline mode the main session may do research itself or dispatch `trellis-research` sub-agents."

Keep:
- `[workflow-state:in_progress]` block — `trellis-implement` / `trellis-check` dispatch (default sub-agent mode core)
- `[workflow-state:in_progress-inline]` block — already drops dispatch
- Phase 2.1 / 2.2 detailed sections (line 351+ research dispatch lives there but is part of explicit phase routing — keep as-is OR cleanup later in 0.6)
- `Sub-agent dispatch protocol` requiring `Active task: <path>` line (line 203) — even simplify per Bug B fix below

### C. brainstorm skill source files

Delete "## Step 4: Research-first Mode (Mandatory for technical choices)" section in:
- `packages/cli/src/templates/common/skills/brainstorm.md` (line 182+)
- `packages/cli/src/templates/codex/skills/brainstorm/SKILL.md` (line 184+)
- `packages/cli/src/templates/copilot/prompts/brainstorm.prompt.md` (verify if has similar)

Also drop the bullet references:
- `* **Research-first** for technical choices` (line 7 / 12 in respective files)
- `5. **Research-first for technical choices**` numbered principle (line 37 / 42)

### D. workflow.md `Sub-agent dispatch protocol` simplification (Bug B)

In line 203, drop the "EXCEPT trellis-research" exemption:

Before:
> "**Sub-agent dispatch protocol (all platforms, all sub-agents EXCEPT trellis-research)**: ... `trellis-research` does not need this line because it operates without a task binding."

After:
> "**Sub-agent dispatch protocol (all platforms, all sub-agents)**: ... your dispatch prompt **MUST** start with one line: `Active task: <task path from \`task.py current\`>`. No exceptions."

Closes Bug B for weaker / strictly-protocol-following models.

## Out of scope

- `dispatch_mode` default change (stays `sub-agent`).
- `[workflow-state:in_progress]` body (still drives implement/check dispatch).
- Phase 2.1 / 2.2 detailed content under workflow.md (separate cleanup if needed).
- Codex 0.129 `list_agents` cross-session leak (upstream Codex bug; mitigated indirectly by removing the "ALWAYS wait" rule).

## Acceptance criteria

- [ ] `agents.md` no longer contains "ALWAYS wait" / "NEVER cancel" / "Spawn subagents automatically when..." / `fork_turns="none"` / multi-subagent close-loop content
- [ ] `workflow.md` no_task / planning / planning-inline blocks no longer instruct dispatch of `trellis-research`
- [ ] `workflow.md:203` Sub-agent dispatch protocol covers ALL sub-agents (no `EXCEPT trellis-research` carve-out)
- [ ] brainstorm skill source files (common + codex + copilot if applicable) no longer have "Research-first Mode" section
- [ ] `pnpm lint && pnpm typecheck && pnpm test` all green
- [ ] Manifest 0.5.8.json drafted with the user-facing changelog (Codex no longer wait-deadlocks on `list_agents` residuals; trellis-research dispatch no longer triggered for local-code audits)

## Definition of Done

- All edits committed
- Tests green
- 0.5.8 manifest + docs-site changelog drafted (en + zh)
- Not released yet (per release cadence)

## Notes

This is a **prompt-layer trim**, not a logic / structural change. No Python, no TypeScript edits. Just markdown + .toml-comment cleanup.
