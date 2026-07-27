# Route Gemini settings review-scope coverage

## Goal

Ensure `.gemini/settings.json` is covered by generated/tooling review-scope classification or route the fix to the owning classifier.

## Background

A downstream review identified `.gemini/settings.json` as generated/tooling scope that was omitted from the review-scope classifier. The consumer repo should not fork generated payload just to satisfy review classification, so this task tracks the producer-side fix or handoff.

## Requirements

- Confirm whether `.gemini/settings.json` is emitted by Trellis templates, sd-ai-command-pack, or both.
- Ensure generated Gemini settings are classified consistently with other generated platform/tooling files.
- Add classifier coverage for generated platform settings without requiring consumer repos to fork generated files.
- Keep the classification aligned with Trellis platform integration and directory-structure expectations.
- Route implementation to the owning classifier if it lives outside Trellis.

## Acceptance Criteria

- [ ] `.gemini/settings.json` is included in generated/tooling review-scope classification where applicable.
- [ ] A regression test or fixture covers Gemini settings classification.
- [ ] Ownership is documented if the fix belongs in sd-ai-command-pack rather than Trellis.
- [ ] Consumer repos no longer need a local generated-payload workaround for this case.
- [ ] Any external issue, PR, or task needed for sd-ai-command-pack ownership is linked from this task.

## Notes

- Source item: 3 from the numbered "missing Trellis task" report.
- Likely owner: sd-ai-command-pack review-scope tooling, unless Trellis template metadata is the classification source.
