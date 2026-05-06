# Manual Verification — Codex Sub-Agent Active-Task Fix (issue #225)

This is the e2e verification you can't easily automate (vitest doesn't spawn a real codex). Run after vitest passes.

## Prereqs

- A project where Trellis is installed with `--codex` (or `--copilot` / `--gemini` / `--qoder`)
- The codex CLI ready to run

## Scenario A — Single window, fallback path

This validates the **single-session fallback** (R3 in PRD): even if the main agent forgets to write `Active task:` in the dispatch prompt, the sub-agent should still find the task as long as only one session is active.

1. Open one codex window in the project
2. Create + start a task:
   ```bash
   python3 ./.trellis/scripts/task.py create "smoke test"
   # ... write minimal prd.md, curate jsonl ...
   python3 ./.trellis/scripts/task.py start .trellis/tasks/<MM-DD>-smoke-test
   ```
3. Verify main session sees it:
   ```bash
   python3 ./.trellis/scripts/task.py current --source
   # Expected: Source: session:codex_session_<hash>
   ```
4. In the same codex session, ask the AI to dispatch `trellis-implement` **without** any explicit task path in the prompt. Watch the sub-agent's first action:
   - **Pass**: sub-agent runs `task.py current --source` and the output shows `Source: session-fallback:codex_session_<hash>` — fallback engaged, task found
   - **Fail**: sub-agent says "no active task, asking user"

## Scenario B — Main agent follows protocol (primary path)

This validates the **prompt protocol** (R1+R2 in PRD): main agent prepends `Active task:` to dispatch.

1. Same task setup as Scenario A (steps 1-3)
2. Ask the AI to do something requiring `trellis-implement` dispatch
3. Inspect the dispatch prompt the main agent sends to the sub-agent (from chat transcript). Verify:
   - **Pass**: dispatch prompt's first line is `Active task: .trellis/tasks/<MM-DD>-smoke-test`
   - **Fail**: no `Active task:` line

## Scenario C — Multi-window, isolation preserved

This validates that **R3 fallback does NOT leak across windows** (04-21 contract).

1. Open codex window #1 in the project, start task A
2. Open codex window #2 in the same project (not a worktree, same checkout), start task B (different task)
3. In window #1, dispatch a sub-agent without `Active task:` line in the prompt
4. The sub-agent runs `task.py current --source`:
   - **Pass**: returns "no active task" (because there are 2 session files now, fallback refuses to guess)
   - **Fail**: returns task A or task B — fallback got confused

The expected behavior in this scenario is for the AI to fall back to asking the user. **Not** silently picking one.

## Scenario D — Older project upgrade (post `trellis update --migrate`)

1. Take a project on a previous Trellis rc/beta
2. `trellis update --migrate`
3. Inspect `~/<project>/.codex/agents/trellis-implement.toml` (or `.gemini/agents/trellis-implement.md`, `.qoder/...`, `.github/agents/...`):
   - **Pass**: file contains both `Active task:` and `dispatch prompt` substrings (new prelude wording)
   - **Fail**: file still has the old "Run task.py current" wording without the dispatch-prompt step
4. Inspect `~/<project>/.trellis/workflow.md`:
   - **Pass**: `[workflow-state:in_progress]` block contains "Sub-agent dispatch protocol" + the `Active task:` directive
   - **Fail**: old in_progress block

## Cross-platform notes

The fix targets all 4 class-2 platforms uniformly via `buildPullBasedPrelude()`. If you only have codex available, that one validation is sufficient signal — the prelude is shared infrastructure, the other 3 platforms use the same source string.

## Reporting back to issue #225

After verification, comment on the GitHub issue with:
- Trellis version used
- Which scenario(s) were tested
- Pass/fail per scenario
- Any unexpected sub-agent behavior

---

**Note**: This file is intentionally checked in alongside the task PRD as a runbook. After the task is archived it serves as historical documentation for the fix and a template for similar e2e checks on future class-2 platform changes.
