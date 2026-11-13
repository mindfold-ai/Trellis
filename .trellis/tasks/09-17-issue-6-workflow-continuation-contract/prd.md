# Issue #6: workflow-owned continuation contract

Source: https://github.com/castbox/Trellis/issues/6
Contract version: `2026-09-17-r3-scope-correction`
Planning date: 2026-09-17

## Goal

Make `trellis-start` and `trellis-continue` workflow-neutral entry points. When
the current session has an exact active-task binding, both entries must load a
single continuation contract from the invocation repository's current
`.trellis/workflow.md` instead of reconstructing a workflow step from
`task.json.status`, artifact presence, Git history, project inventory, or old
conversation text.

The user value is that switching or customizing a workflow immediately changes
resume behavior without requiring synchronized edits to every platform entry.

## Confirmed Facts

- The canonical entry templates are
  `packages/cli/src/templates/common/commands/start.md` and `continue.md`;
  platform configurators project those templates into platform-specific files.
- The current `trellis-continue` template contains a workflow-specific
  `status + artifact presence` route table. `trellis-start` also embeds active
  task routing rules.
- `get_context.py` delegates CLI parsing to `common/git_context.py`; the shipped
  Python runtime has a template copy under
  `packages/cli/src/templates/trellis/scripts/` and a dogfood copy under
  `.trellis/scripts/`.
- Active-task resolution already owns session/task/workspace/repository
  identity. This issue must consume that result without changing the resolver
  algorithm.
- The root repository owns the bundled native workflow and its dogfood copy.
  Marketplace and custom workflows are external content selected through the
  existing workflow resolver; their authors own protocol migration.
- The Guru Trellis preset tracked by `castbox/guru-trellis#419` consumes no
  marketplace workflow components, so marketplace workflow migration is not a
  prerequisite for that issue.
- `trellis update` treats `.trellis/workflow.md` as a whole managed template;
  locally modified conflicts produce `.new` instead of partial block merging.
- The task is one coherent cross-cutting contract change. Splitting it into
  child tasks would create artificial ordering and duplicate integration gates,
  so it remains one Trellis task.

## Requirements

### R1. Fixed continuation block

Every workflow that participates in active-task resume must contain exactly one
non-empty block with these literal markers:

```text
[trellis-continuation]
<workflow-owned Markdown contract>
[/trellis-continuation]
```

The structure is invalid when the block is missing, duplicated, empty or
whitespace-only, unclosed, mismatched, or nested. Invalid structure must be
reported as `invalid_continuation_contract` and must stop active-task resume.

### R2. Deterministic extraction interface

`python3 .trellis/scripts/get_context.py --mode continuation` must:

- read the current invocation repository's `.trellis/workflow.md`;
- validate R1 and print the body in original order on success;
- return non-zero with the workflow path and structural error type on failure;
- remain read-only;
- avoid task-step selection and semantic conclusions such as pass/fail,
  finding, typed exit, readiness, completion, or user authorization.

The template and dogfood runtime copies must remain byte-equivalent.

### R3. Exact current-task authority

Active-task continuation may use only the active-task resolver's exact session
binding, including task identity, task workspace, and repository identity.

The entry points must not infer a current task from project inventory, number of
active tasks, assignee, invocation checkout, a unique session file, or artifact
presence. Resolver outcomes `no binding`, `stale`, `conflict`, or `ambiguous`
must stop or follow the explicit no-task behavior; they must not select a
replacement task.

### R4. Thin `trellis-start`

`trellis-start` must:

1. load session, Git, current-task, and project-inventory facts;
2. load the current workflow Phase Index;
3. use the current workflow's initial request entry when no task is bound;
4. load `--mode continuation` when an exact task is bound;
5. give current-task facts, Phase Index, and continuation body to the AI;
6. contain no workflow-specific phase/status/artifact route table.

### R5. Thin `trellis-continue`

`trellis-continue` must:

1. load session, Git, and current-task facts;
2. return `no_current_task` when no exact task is bound, without creating or
   selecting a task;
3. load `--mode continuation` when an exact task is bound;
4. give current-task facts and continuation body to the AI;
5. contain no workflow-specific phase/status/artifact route table.

### R6. Workflow ownership and recovery

The continuation block exclusively owns workflow-specific interpretation of
lifecycle status, live facts, next owner, public DTO consumer, producer-owned
recovery, fresh semantic rerun, identity/content/authority drift handling, and
fail-closed stops.

`[workflow-state:*]` remains a broad lifecycle breadcrumb. Active-task
breadcrumb text must direct the AI to load the continuation contract and must
not reproduce its route table.

### R7. Root native migration and external author boundary

The bundled native workflow and dogfood native workflow must each define the
same valid continuation contract. Every legacy native start/continue route case
must be represented by a named route and map to the same effective next owner
after migration.

External marketplace and custom workflow authors remain responsible for adding
a valid continuation block before their workflow can resume an active task.
The fixture/custom workflow used in switch tests must intentionally differ from
native so live workflow ownership is still proven without modifying the
marketplace repository.

### R8. Init, update, and workflow-switch compatibility

- Fresh init writes a workflow with a valid continuation block.
- `trellis update` updates pristine managed workflows and entry projections.
- Modified workflow conflicts preserve the active file and write `.new`.
- `.new` never participates in runtime extraction.
- Switching workflows changes the next extraction immediately; no previous
  continuation body is cached.
- Missing/invalid blocks have no native, legacy-route, or inventory fallback.

### R9. Canonical platform projections

All generated `trellis-start` and `trellis-continue` platform entries must come
from the same canonical templates, load the shared continuation interface, and
contain no workflow-specific status/artifact route row.

### R10. Trellis Meta guidance

`trellis-meta` must tell workflow authors to maintain only the workflow
Markdown continuation block. It must remove instructions to synchronize a
platform entry route table and state that `get_context.py` performs structural
extraction only while the current AI executes semantic continuation.

## Acceptance Criteria

- [ ] Valid, missing, duplicate, empty, unclosed, mismatched, and nested
      continuation blocks have deterministic unit-test results.
- [ ] Invalid structures exit non-zero as `invalid_continuation_contract` and
      identify the current workflow path and structural error.
- [ ] Valid extraction preserves the continuation body order and performs no
      writes.
- [ ] Extractor and entry tests prove they do not generate semantic pass,
      finding, typed-exit, readiness, completion, or authorization conclusions.
- [ ] `trellis-start` and `trellis-continue` contain no workflow-specific
      status/artifact route table.
- [ ] Both entries load the same continuation body for the same exact binding.
- [ ] With no session binding, neither entry chooses a task from `PROJECT TASKS`;
      `trellis-continue` returns `no_current_task`.
- [ ] Stale, conflict, and ambiguous resolver results do not execute
      continuation.
- [ ] A linked-worktree binding supplies task/workspace facts while extraction
      reads the invocation repository's current `.trellis/workflow.md`.
- [ ] Bundled and dogfood native workflows each have one valid continuation
      block and their extracted native continuation bodies match.
- [ ] Named native routes preserve the effective legacy native routing.
- [ ] Switching to a fixture workflow immediately changes both entry results.
- [ ] Init, update, workflow switch, modified-file conflict, and `.new`
      exclusion are integration-tested.
- [ ] Generated platform projections share the canonical entry source and do
      not contain legacy route rows.
- [ ] `trellis-meta` documents workflow-only ownership of continuation logic.
- [ ] Python template/dogfood twins match and all repository quality gates pass.

This candidate intentionally does not claim full compliance with the original
Issue wording that required migrating every marketplace workflow. It delivers
the root-native implementation and the general structural protocol only.

## Out of Scope

- Implementing Guru Team's continuation graph, typed-exit routes, or
  same-owner recovery; that belongs to `castbox/guru-trellis#419`.
- Changing the active-task resolver or its session-binding algorithm.
- Adding a lifecycle/stage ledger, persistent continuation checkpoint,
  cross-workflow typed-exit graph, or stored user authorization state.
- Encoding workflow-specific semantic judgment in TypeScript, Python, shell,
  hooks, or entry templates.
- Defining the continuation graph for arbitrary third-party workflows beyond
  the fixed structural protocol and fail-closed runtime behavior.
- Migrating or releasing `mindfold-ai/marketplace` workflows, including native,
  TDD, and channel-driven variants.
- Changing implementation, check, commit, review, publication, or finish
  business contracts outside their workflow-owned continuation text.

## Blocking Open Questions

None. The live Issue contract and repository evidence resolve the required
product, compatibility, and failure behavior.
