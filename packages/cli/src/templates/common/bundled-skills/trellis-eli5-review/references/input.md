# Review input

Write UTF-8 JSON to `<mode>-review.json` inside the task directory. All text
is plain text, not HTML/Markdown. Required arrays may contain a single
explicit "None" or "Not verified" statement where appropriate; do not omit
uncertainty. Prefer short entries over paragraphs.

Common fields:

```json
{
  "title": "Human-facing task title",
  "summary": "One sentence explaining the proposed change or actual outcome.",
  "evidence": [{"label": "Requirements", "href": "prd.md"}]
}
```

Plan additionally requires string arrays: `why`, `approach`, `in_scope`,
`out_of_scope`, `acceptance`, `decisions`.

Finish additionally requires strings `before`, `after`, `plan_basis`
(`reviewed` or `unavailable`); string arrays `delivered`, `deviations`,
`remaining`; and `checks`, whose entries each require non-empty string fields
`name`, `status`, and `detail`:

```json
[
  {"name": "Focused behavior tests", "status": "passed", "detail": "Observed result; link the log in evidence."},
  {"name": "Live user path", "status": "not_run", "detail": "Still requires a live run."}
]
```

Check status: `passed`, `failed`, `not_run`, or `partial`. Evidence links
accept existing files within the task directory (including subdirectories)
and HTTPS URLs without credentials. No absolute local paths, `..`, executable
URLs, or links to files outside the task. URL-encode spaces in links.

The renderer writes only `<mode>-review.html`. Invalid input leaves the
previous report intact. It validates structure and safe rendering, not the
truth of the agent's summary. A missing retained plan pair overrides
`plan_basis: reviewed` with a visible comparison limitation.
