# Align task context validation with PR preflight

## Goal

Align Trellis task-context scaffolding and validation with downstream PR preflight so a freshly created planning task cannot pass `task.py validate` and later fail PR readiness solely because Trellis generated placeholder context rows.

## Background

The packaged task creator currently writes an `_example` row to both `implement.jsonl` and `check.jsonl`. The packaged context validator explicitly skips rows without a `file` field, so those generated manifests validate successfully. Downstream SD PR preflight treats `_example` rows in changed task context manifests as unresolved scaffolding and rejects them.

This mismatch surfaced while preparing SE PR #87: Trellis validation reported the task manifests as valid, while the subsequent full PR preflight reported twelve placeholder-context failures. The downstream check is useful defense in depth, but the producer and its local validator should establish the contract earlier.

## Requirements

- Establish one canonical lifecycle for new task context manifests.
- Prefer creating empty `implement.jsonl` and `check.jsonl` files and keeping curation instructions in task-create console output rather than storing instructions as data rows.
- If placeholder rows are deliberately retained, make `task.py validate` reject them before PR workflow begins. Do not preserve a create-then-validate path that passes locally but predictably fails PR preflight.
- Preserve the context curation gate: tasks that will delegate implementation or checking must still add real, relevant entries before starting subagents.
- Preserve consumer behavior for genuinely empty manifests and valid curated rows.
- Make changes in the authoritative packaged templates. Do not patch generated consumer `.trellis` copies as the primary remediation.
- Update bundled workflow, hook, or skill guidance that deliberately describes `_example` seed rows.
- Update regression and integration coverage for newly created, empty, placeholder-only, malformed, and curated manifests.
- Keep the SD PR preflight check independent as defense in depth; changing the downstream pack is outside this task unless the shared contract itself changes.

## Acceptance Criteria

- [ ] Newly created task context manifests contain no generated `_example` rows, or the local validator rejects those rows before reporting the task valid.
- [ ] `task.py validate` and PR preflight agree for freshly created, empty, placeholder-only, malformed, and correctly curated manifests.
- [ ] Task creation still tells users how and when to curate implementation and checking context.
- [ ] Subagent-start behavior still requires real curated entries where the workflow requires them.
- [ ] Packaged template tests cover the chosen context-manifest lifecycle and prevent the producer/validator contract from drifting again.
- [ ] Relevant CLI regression and integration tests pass, including template consistency checks.

## Affected Surfaces

- `packages/cli/src/templates/trellis/scripts/common/task_store.py` — `_write_seed_jsonl()` and task creation output.
- `packages/cli/src/templates/trellis/scripts/common/task_context.py` — `_validate_jsonl()` and readiness semantics.
- `packages/cli/test/regression.test.ts` — task creation and context-validation expectations.
- `packages/cli/test/scripts/context-injection-limits.integration.test.ts` — integration expectations for generated manifests.
- Bundled workflow, skill, and hook guidance that currently treats the seed row as an intentional scaffold.

## Out Of Scope

- Removing the downstream SD PR preflight rule.
- Editing installed `.trellis` consumer copies without updating their authoritative templates.
- Broad task-runtime hardening unrelated to the context-manifest producer/validator mismatch.

## Planning Notes

- Keep this task in `planning`; do not start it as part of task creation.
- Before implementation, inspect related archived task `06-24-issue-292-jsonl-gate` and recent `07-22-subagent-context-limits` behavior so the fix preserves the intended subagent readiness gate.
- Before editing runtime symbols, run the repository-required GitNexus impact analysis.
