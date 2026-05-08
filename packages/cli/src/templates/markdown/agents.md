<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

## Subagents

- ALWAYS wait for every spawned subagent to reach a terminal status before yielding, acting on partial results, or spawning followups.
  - On Codex, this means calling the `wait` tool with the subagent's thread id (requires `multi_agent_v2`). Do NOT infer completion from elapsed time.
  - On Claude Code / OpenCode, this means awaiting the Task/agent tool result before continuing.
- NEVER cancel or re-spawn a subagent that hasn't finished. If a subagent appears stuck, raise the wait timeout (Codex default 30s, max 1h) before judging it broken.
- Spawn subagents automatically when:
  - Parallelizable work (e.g., install + verify, npm test + typecheck, multiple tasks from plan)
  - Long-running or blocking tasks where a worker can run independently
  - Isolation for risky changes or checks

### Codex-only — `spawn_agent` parameters

When calling `spawn_agent`, ALWAYS pass `fork_turns="none"`. Without it the child inherits the parent transcript and sees your prior `spawn_agent(...)` records, then applies the "wait for spawned subagents" rule to itself — causing `wait_agent` self-deadlock.

```text
spawn_agent(agent_type="trellis-implement", message="...", fork_turns="none")
```

### Codex-only — multi-subagent close-loop

When `wait` returns a `completed` notification, treat it as an event signal — not as "all done". Run this loop:

1. Maintain an `expected_agents` set of dispatched sub-agent thread IDs.
2. After each `wait` update:
   1. Call `list_agents` to inspect ALL live agents' status.
   2. For each agent now in a terminal state:
      - Verify its promised deliverable exists (e.g. `{task_dir}/research/*.md`).
      - Read or summarize as needed.
      - `close_agent` to release the slot.
      - Remove from `expected_agents`.
   3. If `expected_agents` still contains running agents → keep waiting.
   4. If `expected_agents` is empty → continue main flow.
3. Never `wait` on an agent that has already reported `completed`.
4. If a `completed` agent is missing its deliverable, treat it as failed — surface that in your report instead of re-waiting.

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
