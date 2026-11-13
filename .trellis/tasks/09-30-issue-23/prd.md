# Retire Task Personnel Metadata and Decouple Brainstorm (#23)

## Goal

Remove the former User/person identity, personal workspace, journal and task personnel systems from active Trellis code and distribution. Requirement exploration must work without creating or activating a task. Historical files remain untouched but have no supported compatibility path.

## Source and Background

- Source: https://github.com/castbox/Trellis/issues/23, read on 2026-09-30; no comments at inspection.
- Python task creation currently validates personnel input in `packages/cli/src/templates/trellis/scripts/common/task_store.py:419`; task listing, queue and context also consume it.
- The public TypeScript model requires personnel fields in `packages/core/src/task/schema.ts:29`; bootstrap and migration factories collect and persist them.
- `packages/cli/src/templates/common/skills/brainstorm.md:27` requires task consent and creates a task. Shared skill descriptions, workflow steps and platform prompts distribute that requirement.
- The original implementation added cumulative retirement detection and migration guidance. The user subsequently rejected all such compatibility on 2026-09-30. Historical files may remain as inert evidence; current runtime must not read or upgrade them.

## Requirements and Acceptance Criteria

| ID | Requirement | Observable acceptance |
| --- | --- | --- |
| R1 | Remove User/personnel input, fields, filters, resolution, validation, recording and display. | Task create, bootstrap init, list, context and supported task lifecycle work without personnel input; newly written tasks have no personnel fields. Old CLI flags are absent and rejected by argument parsing. No environment, Git or config identity substitutes for them. |
| R2 | Remove compatibility with former identity/history and personnel systems. | No active migration detector, cumulative retirement guide, legacy path guard, old-task adapter or special write-back exists. Current task readers and writers do not accept or retain unknown old record fields. Old installations and old task formats are unsupported; historical files are not rewritten. |
| R3 | Make brainstorm a standalone requirement exploration skill. | With no current task, it can inspect evidence, clarify real product decisions, converge requirements and deliver planning content. It does not create/select directories or tasks, bind sessions, start/archive tasks, or ask lifecycle consent. The caller supplies the output destination; absent a destination, planning content is returned in conversation. |
| R4 | Keep normal Trellis orchestration usable. | Outer workflow/start/continue steps explicitly own task consent, creation, output paths, context manifests, planning approval and activation. Existing product clarification and final planning review remain effective. |
| R5 | Converge all active distribution surfaces. | Canonical source, generated platform assets, dogfood copies, maintained specs, examples, tests and package output contain no active former User/identity/history or personnel system. Channel-thread personnel assignment is also removed. Generic package and current task worktree concepts remain. |
| R6 | End old installation and task compatibility. | Update rejects earlier installed versions before inspecting historical manifests or project data. Fresh init and same-version reapply use only current assets. Historical manifests and task files remain inert and unchanged. |
| R7 | Validate current behavior and handoff. | Verification covers ordinary Trellis, generated platforms, fresh init, same-version update, taskless brainstorm, channel behavior and no legacy-data access. Guru #481 receives the new breaking contract after an installable candidate exists; downstream implementation and production settings are outside this task. |

## Scope

Python runtime and dogfood twins; CLI/core task and channel contracts; init/update; task-derived Linear mapping; canonical skills, workflows and platform entry points; generated project assets; maintained documentation/specs; current-version tests and release metadata. Active downloadable marketplace content is included. Remove the cumulative retirement and history-path modules and their callers.

## Out of Scope

- Git commit author metadata and GitHub's external Issue/PR assignment service.
- Rewriting previous task artifacts, archived evidence, historical release manifests or Git history. These files are inert evidence, not compatibility inputs.
- Direct changes to the independently owned docs-site repository, global installation, Guru #481 implementation or production configuration. Report maintained external documentation gaps for handoff. The marketplace submodule receives local source edits; publication remains a separate action.
- Adversarial, concurrency or unrelated session-routing hardening.
- Push, PR, tag, publication, merge and Issue closure are separate delivery actions.

## Planning Status

The user's 2026-09-30 direction supersedes the earlier compatibility plan. No old-install or old-task path is supported. Local validation is distinct from published installation and downstream runtime validation.
