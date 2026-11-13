# Research evidence (2026-10-16)

## Sources

- Live Issue: https://github.com/castbox/Trellis/issues/43, retrieved with `gh issue view 43 --repo castbox/Trellis --json number,title,body,comments,url`; comments were empty.
- Fetched `upstream/main`: `138961cbcac8367d15abe3d9d2f06101fa921cf6`. Local planning HEAD: `dde5f90903e9299236e3574d4dfab6441daec09d`. Maintenance source is absent at local HEAD; use `git show upstream/main:<path>` for this research, not inferred local contents.
- Historical writer: `43fffc170927c85d9f7fc106cc5a059e80d4530b:packages/cli/src/templates/trellis/scripts/common/active_task.py`. Lines 42-44 define nine optional aliases; 677-694 construct nonempty platform/timestamp/string metadata; 697-724 write schema version, original common-dir/workspace/Task locator and null run slot.
- Baseline `packages/core/src/task/maintenance.ts`: already has the finite alias list and positive unversioned metadata predicate. Schema-1 instead uses exact four-field matching; existing path/common ownership matching is independent of metadata.
- Baseline `packages/cli/src/commands/maintenance/bindings.ts`: enumerates shared common storage then checkout-local storage; all records must classify before their match is inspected. Filtering after a successful classification already excludes supported unrelated records.
- Baseline Core tests cover metadata-bearing unversioned records and minimal schema-1 separately. CLI tests cover unversioned records and a metadata-free schema-1 closeout fixture. Neither reproduces the seven-field schema-1 writer record.
- Baseline `.trellis/spec/cli/backend/commands-maintain.md` owns independent-maintenance contracts. It is absent in the stale planning checkout. It must be read from the implementation baseline before code changes and added to both context manifests there.

## Design consequence

Recognize two explicit schema-1 shapes: the existing minimal shape and the original writer's complete metadata shape, with its finite optional aliases. Reuse metadata validation without accepting arbitrary fields. Keep current authority, matching and CLI enumeration unchanged. Add ordinary compatibility regression proof through existing public maintenance machinery.

## Verification boundary

This file records static inspection only. No parser reproduction, build, test, installation, business migration, Guru adoption or publication ran during planning. Repository fetched references only; original branch and other worktrees were left unchanged. Task creation uses the current native workflow in planning status; its creation message's word "Activated" denotes session selection, not implementation approval.

## Context loading caveat

The context validator passes both six-entry manifests but warns that `quality-guidelines.md` exceeds the 32 KiB per-file injection limit. Implement/check agents must explicitly read its remaining content from disk rather than assuming injected context is complete. After transfer to the approved baseline, add the existing `commands-maintain.md` to both manifests and rerun validation. Do not change injection limits for this Issue.
