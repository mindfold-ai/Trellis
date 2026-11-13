---
name: trellis-continue
description: "Resume the exact current-session task by loading the current workflow-owned continuation contract. Returns no_current_task when no exact binding exists and never selects from project inventory."
---

# Continue Current Task

Resume only the task bound to this exact session and repository.

---

## Step 1: Load Exact Context

```bash
python3 ./.trellis/scripts/get_context.py
```

Use only `## CURRENT SESSION TASK` as current-task authority. Ignore `## PROJECT TASKS` for selection, even when it contains exactly one active task.

- If context resolution reports a stale, conflicting, corrupt, or ambiguous binding, stop and report that result.
- If `## CURRENT SESSION TASK` is `(none)`, return `no_current_task` and stop. Do not create, activate, or select a task.

## Step 2: Load the Workflow-Owned Continuation Contract

For an exact current task, run:

```bash
python3 ./.trellis/scripts/get_context.py --mode continuation
```

Execute the returned contract using the current-task and Git facts from Step 1. The contract exclusively decides the workflow-specific next owner, public DTO consumer, producer-owned recovery, fresh semantic rerun, or fail-closed stop.

If extraction returns `invalid_continuation_contract`, stop and report the workflow path and structural error. Do not infer a route from task status, artifact presence, Git history, project inventory, or earlier conversation text.
