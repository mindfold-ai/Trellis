# Change Local Workflow

When the user wants to change Trellis phases, next-action hints, whether to create tasks, whether to use sub-agents, or when to check/wrap up, edit `.trellis/workflow.md` first.

## Read These Files First

1. `.trellis/workflow.md`
2. Entry files for the current platform, such as skills/commands/prompts/workflows
3. The current task's `task.json` and `prd.md`

## Common Needs And Edit Points

| Need | Edit point |
| --- | --- |
| Change phase names or phase order | `Phase Index` and the corresponding Phase sections. |
| Change whether to create a task when there is no task | `[workflow-state:no_task]` state block. |
| Change the next step during planning | Phase 1 and `[workflow-state:planning]`. |
| Change whether an agent is required during in_progress | Phase 2 and `[workflow-state:in_progress]`. |
| Change wrap-up after completion | Phase 3 and `[workflow-state:completed]`. |
| Change which skill a user intent triggers | `Skill Routing` table. |
| Change active-task resume semantics | The single `[trellis-continuation]` block. |

## Modification Steps

1. Find the relevant section in `.trellis/workflow.md`.
2. When changing rules, keep explicit trigger conditions and next actions.
3. If adding or renaming a skill/agent, synchronize the corresponding files in platform directories.
4. Workflow-state changes only need an edit to the `[workflow-state:STATUS]` block in `.trellis/workflow.md`. The hook is parser-only — it reads whatever you put in the block. Keep the opening and closing tags' STATUS strings identical (`[workflow-state:foo]…[/workflow-state:foo]`); mismatched STATUS pairs are silently dropped.
5. Active-task continuation changes only need an edit to the one non-empty `[trellis-continuation]…[/trellis-continuation]` block. Do not copy its route logic into platform commands, skills, prompts, hooks, or scripts.
6. Make the AI reread `.trellis/workflow.md`; do not keep using rules from the old conversation.

## Example: Relax Task Creation Requirements

To change when task creation can be skipped, usually edit `[workflow-state:no_task]`:

```md
[workflow-state:no_task]
Task is not required when the answer is a one-reply explanation, no files are changed, and no research is needed.
[/workflow-state:no_task]
```

If the formal Phase 1 flow also needs to change, synchronize the Phase 1 section.

## Example: One Platform Does Not Use Sub-Agents

If the user wants only one platform to avoid sub-agents, first confirm whether that platform has a separate group in the workflow. Then change Phase 2 routing for that platform group instead of deleting all `trellis-implement` / `trellis-check` instructions across platforms.

## Continuation Contract

`trellis-start` and `trellis-continue` are workflow-neutral entries. For an exact current-session binding they run:

```bash
python3 .trellis/scripts/get_context.py --mode continuation
```

The extractor validates one non-empty `[trellis-continuation]…[/trellis-continuation]` block and returns its body verbatim. It performs structural extraction only; the current AI executes the workflow's semantic continuation. Missing, duplicated, empty, nested, unclosed, or mismatched blocks fail as `invalid_continuation_contract` and stop resume.

Put lifecycle interpretation, live-fact checks, next owners, public DTO consumers, producer-owned recovery, fresh semantic reruns, drift handling, and fail-closed stops in this workflow block. Platform entries must not maintain a synchronized status/artifact table. When adding a custom status, keep its broad per-turn hint in `[workflow-state:STATUS]` and put detailed active-task continuation in `[trellis-continuation]`.

## Notes

`.trellis/workflow.md` is the local project workflow, not an immutable template. The user can adapt it to team habits. Canonical Trellis start/continue entries read its continuation block at invocation time; inspect platform entries only when the project intentionally replaced those generated files.
