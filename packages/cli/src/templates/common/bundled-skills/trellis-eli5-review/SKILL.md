---
name: trellis-eli5-review
description: Produce task-local HTML review views at Trellis's final planning review and finish-work handoff. Summarize authoritative task evidence for human review.
---

# Human review views

Use in the main session at the existing plan and finish review points. Read
`references/input.md` for the JSON contract. The installed skill directory
contains `scripts/render_review.py`; resolve its path from this SKILL.md,
not from an assumed platform directory.

## Plan

After requirements converge, read the task's `prd.md`, `design.md` and
`implement.md` when present. Write `plan-review.json` beside them. Summarize
what changes, why, the approach, in/out scope, acceptance, and decisions or
risks needing attention. Use a short approach sequence only when it explains
the mechanism. Link to the detailed evidence rather than copying it.

Render and present `plan-review.html` alongside the existing final planning
summary before its approval/start transition. A generated report is not user
approval. Update the view while planning changes; after approval preserve the
reviewed JSON and HTML. Material replanning follows the existing re-review
process; retain the earlier approved pair under revision-specific names first.

## Finish

After verification and the finish-work dirty-code check, read the retained
plan view/input, actual changes, work commits, and check results. Write
`finish-review.json`. Include before/after, delivered behavior, checks with
their actual outcomes, explicit deviations from the reviewed plan, and
remaining work. Do not infer success from a file or commit existing. Failed,
unrun, and partially verified work must remain visible.

Set `plan_basis` to `reviewed` only when the retained plan is known to be the
one the user reviewed; otherwise use `unavailable` and explain the comparison
limit in deviations. Never reconstruct approval from the current PRD. Finish
must not rewrite the plan pair. For an older task without a view, report the
available evidence honestly; the renderer adds a visible comparison warning.

## Render and hand off

```sh
{{PYTHON_CMD}} <installed-skill-dir>/scripts/render_review.py --task-dir <task-dir> --mode plan
{{PYTHON_CMD}} <installed-skill-dir>/scripts/render_review.py --task-dir <task-dir> --mode finish
```

Use only the mode needed. Inspect the result for accurate synthesis and
readable layout; open it when the host supports local HTML, otherwise share
the path. Keep wording in the user's language. The report is self-contained
and has no remote assets. Use task-relative evidence paths so archive retains
working links, or stable HTTPS commit URLs. Copy no secrets into reports.

Keep both pairs inside the task directory; existing archive moves them with
the evidence. Present the final archived report path after archive. No active
task means no report. A render failure requires repair before presenting a
report as generated; it does not authorize changes to task completion rules.

These views are derived human explanations, not authoritative requirements,
approval records, or verification results. Do not add the skill, review JSON,
or HTML to implement/check context manifests or worker dispatch prompts.
