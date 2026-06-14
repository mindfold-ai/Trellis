# Local Workflow System

`.trellis/workflow.yaml` is the Trellis workflow source of truth inside the user project. An AI does not need Trellis source code to understand how the current project should move tasks forward; this file is enough.

## File Responsibilities

`.trellis/workflow.yaml` and the referenced `.trellis/workflow/**/*.md` body
files have three responsibilities:

1. **Explain workflow phases**: Plan, Execute, Finish.
2. **Define skill routing**: which skill or agent the AI should use when the user expresses a certain intent.
3. **Provide workflow-state prompt bodies**: hooks can inject the body for the current state into the conversation.

## Current Phase Model

```text
Phase 1: Plan    -> clarify what to build, produce prd.md and required research
Phase 2: Execute -> implement against the PRD and specs, then check
Phase 3: Finish  -> final verification, preserve lessons, and wrap up
```

Each phase contains numbered steps, such as `1.3 Configure context`. These numbers are not runtime fields in `task.json`; they are workflow structure for AI and humans to read.

## Skill Routing

`workflow.yaml` plus the referenced step body files separate routing by platform capability:

- Platforms with sub-agent support: dispatch `trellis-implement` by default for implementation and `trellis-check` for checking.
- Platforms without sub-agent support: the main session reads skills such as `trellis-before-dev`, then executes directly.

When changing local AI behavior, update the routing descriptions in `.trellis/workflow.yaml` and referenced body files first, then check whether the corresponding platform skill, command, or agent files need to stay in sync.

## Workflow-State Prompt Bodies

`.trellis/workflow.yaml` maps each status to a body file:

```yaml
workflow_states:
  no_task:
    body_file: .trellis/workflow/states/no_task.md
```

Hooks choose the right body based on current task status and inject it into the conversation. Common states include:

| State | Meaning |
| --- | --- |
| `no_task` | The current session has no active task. |
| `planning` | The task is still in requirements, research, or context configuration. |
| `in_progress` | The task has entered implementation and checking. |
| `completed` | The task is complete and waiting for wrap-up or archive. |

If the user wants to change policies such as "whether to create a task when there is no task," "when task creation may be skipped," or "whether sub-agents are required," edit the relevant state body file and any matching phase/routing body file.

## Local Modification Patterns

Common changes:

| Goal | Edit point |
| --- | --- |
| Add a phase | Update the manifest, phase body, routing, and relevant state body files. |
| Change task creation policy | Update the `no_task` state body file and Phase 1 description. |
| Change the default implementation/check path | Update Phase 2 and skill routing. |
| Change the wrap-up flow | Update Phase 3 and `finish-work` related descriptions. Note the current split: Phase 3.4 = AI-driven code commits (batched, user-confirmed), Phase 3.5 = `/finish-work` (archive + record session). `/finish-work` refuses to run if the working tree is dirty. |
| Change platform differences | Update routing descriptions grouped by platform. |

After editing, make the AI reread `.trellis/workflow.yaml`; do not assume the flow from the old conversation is still valid.

## Relationship To Platform Files

`workflow.yaml` and `.trellis/workflow/` are the semantic center of the local workflow, but each platform can also have its own entry files:

- skills, such as `trellis-brainstorm` and `trellis-check`.
- commands/prompts/workflows, such as continue and finish-work.
- hooks, such as session-start or workflow-state injection.

If only the workflow manifest or body files change, platform entry files may still contain old language. When the user wants to change "what the AI actually does," also inspect the relevant platform directory.
