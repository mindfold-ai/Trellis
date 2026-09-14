# Before and after: human review views

Open `index.html` locally for three side-by-side comparisons, or view
`before-after.png` directly on GitHub. Each example includes the JSON input,
redacted documentation excerpt, and generated plan/finish HTML.

| Example | Plan | Finish |
| --- | --- | --- |
| Interview helper | [Plan](interview-helper/plan-review.html) | [Finish](interview-helper/finish-review.html) |
| Record export | [Plan](record-export/plan-review.html) | [Finish](record-export/finish-review.html) |
| Publishing pipeline | [Plan](publishing-pipeline/plan-review.html) | [Finish](publishing-pipeline/finish-review.html) |

These are reconstructed presentation examples based on project documentation,
not historical task approvals or measured comprehension improvements. Personal
names, account identifiers, project identifiers, local paths, portal/feed URLs,
credentials, records, and session content are excluded. No live services were
accessed to make the examples. Every finish view explicitly labels live checks
as unrun and the historical reviewed plan as unavailable.

Regenerate from repository root:

```sh
python3 packages/cli/src/templates/common/bundled-skills/trellis-eli5-review/scripts/render_review.py --task-dir docs/examples/eli5-review/interview-helper --mode plan
python3 packages/cli/src/templates/common/bundled-skills/trellis-eli5-review/scripts/render_review.py --task-dir docs/examples/eli5-review/interview-helper --mode finish
```

Repeat for `record-export` and `publishing-pipeline`. Use `python` on Windows.
GitHub displays HTML source; download the directory or serve it locally to use
the linked views. The PNG is a browser capture of the comparison page.
