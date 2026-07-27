# Define no-active-task completion receipt contract

## Goal

Clarify and route finish-work/final-bundle behavior for journal-only completions that currently fail with `completion_archive_move_missing` when no active Trellis task exists.

## Background

Recent downstream sessions showed `completion_archive_move_missing` during lifecycle completion when there was no active Trellis task or the work was journal-only. Recovery required creating or archiving corrective local task state. This task should clarify the intended no-active-task completion contract and route the implementation to the owning lifecycle tool.

## Requirements

- Define whether no-active-task, journal-only, or maintenance-only Trellis lifecycle completions are supported.
- Distinguish a legitimate no-active-task completion from a real missing archive move defect.
- Ensure the completion receipt or final-bundle diagnostic explains the supported recovery path.
- Preserve fail-closed behavior for genuinely incomplete task archive moves.
- Route implementation to sd-ai-command-pack/final-bundle if the failing behavior is not emitted by Trellis core.

## Acceptance Criteria

- [ ] The supported no-active-task completion behavior is documented.
- [ ] The lifecycle diagnostic is actionable and distinguishes unsupported workflow from missing archive evidence.
- [ ] A regression or fixture covers the no-active-task/journal-only completion case.
- [ ] Trellis task validation remains strict for real archive-move requirements.
- [ ] Any external issue, PR, or task needed for sd-ai-command-pack ownership is linked from this task.

## Notes

- Source item: 2 from the numbered "missing Trellis task" report.
- Likely owner: sd-ai-command-pack lifecycle tooling, with Trellis owning only the task-state contract if needed.
