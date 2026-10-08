# Local Workflow System

`.trellis/workflow.md` is the Trellis workflow source of truth inside the user project. An AI does not need Trellis source code to understand how the current project should move tasks forward; this file is enough.

## File Responsibilities

`.trellis/workflow.md` has four responsibilities:

1. **Explain workflow phases**: Plan, Execute, Finish.
2. **Define skill routing**: which skill or agent the AI should use when the user expresses a certain intent.
3. **Provide workflow-state prompt blocks**: hooks can inject the prompt block for the current state into the conversation.
4. **Own active-task continuation**: one `[trellis-continuation]` block decides the next semantic owner and recovery path from live facts.

## Current Phase Model

```text
Phase 1: Plan    -> clarify what to build, produce prd.md and required research
Phase 2: Execute -> implement against the PRD and specs, then check
Phase 3: Finish  -> final verification, preserve lessons, and wrap up
```

Each phase contains numbered steps, such as `1.3 Configure context`. These numbers are not runtime fields in `task.json`; they are workflow structure for AI and humans to read.

## Skill Routing

`workflow.md` separates routing by platform capability:

- Platforms with sub-agent support: dispatch `trellis-implement` by default for implementation and `trellis-check` for checking.
- Platforms without sub-agent support: the main session reads skills such as `trellis-before-dev`, then executes directly.

When changing local AI behavior, update the routing descriptions in `workflow.md`. Start/continue entries stay workflow-neutral and do not mirror the continuation route graph.

## Continuation Contract

Every active workflow must contain exactly one non-empty block:

```text
[trellis-continuation]
<workflow-owned continuation rules>
[/trellis-continuation]
```

`get_context.py --mode continuation` validates and returns this body without interpreting it. The current AI applies the contract to the exact active-task binding. Detailed lifecycle interpretation, next-owner selection, public DTO recovery, semantic reruns, and fail-closed stops belong here, not in platform entries or scripts.

## Workflow-State Prompt Blocks

The bottom of `workflow.md` can contain state blocks like this:

```text
[workflow-state:no_task]
...
[/workflow-state:no_task]
```

Hooks choose the right block based on current task status and inject it into the conversation. Common states include:

| State | Meaning |
| --- | --- |
| `no_task` | The current session has no active task. |
| `planning` | The task is still in requirements, research, or context configuration. |
| `in_progress` | The task has entered implementation and checking. |
| `completed` | The task is complete and waiting for wrap-up or archive. |

If the user wants to change policies such as "whether to create a task when there is no task," "when task creation may be skipped," or "whether sub-agents are required," edit these state blocks and the routing table above them.

## Local Modification Patterns

Common changes:

| Goal | Edit point |
| --- | --- |
| Add a phase | Update the Phase Index, phase body, routing, and state blocks. |
| Change task creation policy | Update the `no_task` state block and Phase 1 description. |
| Change the default implementation/check path | Update Phase 2 and skill routing. |
| Change the wrap-up flow | Update Phase 3 and `finish-work` related descriptions. Note the current split: Phase 3.4 = AI-driven code commits (batched, user-confirmed), Phase 3.5 = `/finish-work` (task archive). `/finish-work` refuses to run if the working tree is dirty. |
| Change platform differences | Update routing descriptions grouped by platform. |

After editing, make the AI reread `.trellis/workflow.md`; do not assume the flow from the old conversation is still valid.

## Relationship To Platform Files

`workflow.md` is the semantic center of the local workflow, but each platform can also have its own entry files:

- skills, such as `trellis-brainstorm` and `trellis-check`.
- commands/prompts/workflows, such as continue and finish-work.
- hooks, such as session-start or workflow-state injection.

Canonical `trellis-start` and `trellis-continue` projections load the current workflow contract on every invocation, so workflow switching changes continuation immediately. Inspect platform directories only for intentionally local replacement entries or format-specific wiring, not to synchronize a route table.
