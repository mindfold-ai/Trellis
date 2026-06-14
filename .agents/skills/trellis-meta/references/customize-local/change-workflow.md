# Change Local Workflow

When the user wants to change Trellis phases, next-action hints, whether to create tasks, whether to use sub-agents, or when to check/wrap up, edit `.trellis/workflow.yaml` first.

## Read These Files First

1. `.trellis/workflow.yaml`
2. `.trellis/workflow/**/*.md` body files referenced by the manifest
3. Entry files for the current platform, such as skills/commands/prompts/workflows
4. The current task's `task.json` and `prd.md`

## Common Needs And Edit Points

| Need | Edit point |
| --- | --- |
| Change phase names or phase order | `phase_index`, `phases`, and corresponding step body files. |
| Change whether to create a task when there is no task | `workflow_states.no_task.body_file`. |
| Change the next step during planning | Phase 1 step bodies and `workflow_states.planning.body_file`. |
| Change whether an agent is required during in_progress | Phase 2 step bodies and `workflow_states.in_progress.body_file`. |
| Change wrap-up after completion | Phase 3 step bodies and `workflow_states.completed.body_file`. |
| Change which skill a user intent triggers | The relevant workflow body file and platform entry files. |

## Modification Steps

1. Find the relevant manifest entry in `.trellis/workflow.yaml`.
2. When changing rules, keep explicit trigger conditions and next actions.
3. If adding or renaming a skill/agent, synchronize the corresponding files in platform directories.
4. Workflow-state wording changes usually only need an edit to the referenced `.trellis/workflow/states/<status>.md` file. Add or move `body_file` entries in `.trellis/workflow.yaml` only when adding or restructuring statuses.
5. Make the AI reread `.trellis/workflow.yaml`; do not keep using rules from the old conversation.

## Example: Relax Task Creation Requirements

To change when task creation can be skipped, usually edit the file referenced by `workflow_states.no_task.body_file`, normally `.trellis/workflow/states/no_task.md`:

```md
Task is not required when the answer is a one-reply explanation, no files are changed, and no research is needed.
```

If the formal Phase 1 flow also needs to change, synchronize the Phase 1 section.

## Example: One Platform Does Not Use Sub-Agents

If the user wants only one platform to avoid sub-agents, first confirm whether that platform has a separate group in the workflow. Then change Phase 2 routing for that platform group instead of deleting all `trellis-implement` / `trellis-check` instructions across platforms.

## `/trellis:continue` Route Table

`/trellis:continue` resumes a task by deciding which phase step to load next. The decision combines `task.json.status` with the presence of artifacts inside the task directory. The mapping is fixed in the command itself; forks that add custom statuses must extend both the workflow-state manifest/body file and this table.

| `status` | Artifact state | Resume at |
| --- | --- | --- |
| `planning` | `prd.md` missing | Phase 1.1 (load `trellis-brainstorm`) |
| `planning` | `prd.md` exists, `implement.jsonl` only has the seed `_example` row | Phase 1.3 (curate JSONL context) |
| `planning` | `prd.md` exists, `implement.jsonl` curated | Phase 1.4 (run `task.py start`) |
| `in_progress` | no implementation in conversation history | Phase 2.1 (`trellis-implement`) |
| `in_progress` | implementation done, no `trellis-check` run | Phase 2.2 (`trellis-check`) |
| `in_progress` | check passed | Phase 3.1 (verify quality + spec update) |
| `completed` | task is still in active tree | Phase 3.5 (run `/trellis:finish-work` to archive) |

When you add a custom status (e.g. `in-review`), add `workflow_states.in-review.body_file` in `.trellis/workflow.yaml`, create the referenced body file, and extend this route table — usually by editing the `/trellis:continue` command file (`.{platform}/commands/trellis/continue.md` or equivalent) to add a row that decides where to resume from. Without the route entry, `/trellis:continue` will fall through to a default branch and the user will not land on the step you intended.

## Notes

`.trellis/workflow.yaml` is the local project workflow, not an immutable template. The user can adapt it to team habits. After editing it, platform entry files may still contain old descriptions, so inspect them too.
