# Route review-learnings unsafe path diagnostics

## Goal

Ensure unsafe changed paths in review-learnings produce fail-closed diagnostics instead of uncaught `ValueError` tracebacks, or route the fix to the owning tool.

## Background

A downstream review-learning flow failed with an uncaught `ValueError` for an unsafe changed path. The underlying path safety behavior should stay fail-closed, but the user-facing review workflow needs a structured diagnostic instead of a raw traceback.

## Requirements

- Identify whether the unsafe-path exception is raised by Trellis filesystem-safety code or by sd-ai-command-pack review-learnings tooling.
- Preserve fail-closed handling for paths outside the allowed workspace or task scope.
- Convert unsafe changed-path failures into an actionable diagnostic for the review workflow.
- Make clear whether the agent should retry, skip the offending path, or stop and request user action.
- Add coverage for unsafe changed-path input.

## Acceptance Criteria

- [ ] Unsafe changed paths no longer surface as an uncaught traceback in review-learnings.
- [ ] The diagnostic identifies the unsafe path and the allowed recovery behavior.
- [ ] A regression test or fixture covers the unsafe changed-path case.
- [ ] Ownership is documented if the implementation belongs outside Trellis.
- [ ] Any external issue, PR, or task needed for sd-ai-command-pack ownership is linked from this task.

## Notes

- Source item: 4 from the numbered "missing Trellis task" report.
- Likely owner: sd-ai-command-pack review-learnings tooling, with Trellis owning filesystem-safety contracts if implicated.
