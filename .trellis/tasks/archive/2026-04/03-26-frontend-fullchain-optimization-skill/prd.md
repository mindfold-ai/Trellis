# Add frontend-fullchain-optimization marketplace skill

## Goal

Add a new marketplace skill for frontend performance diagnosis and optimization,
centered on Web Vitals and evidence-based debugging. Register it in the
marketplace index and publish matching docs-site pages if the docs submodule is
available locally.

## Requirements

- Add `marketplace/skills/frontend-fullchain-optimization/SKILL.md`
- Register the skill in `marketplace/index.json`
- Keep the skill framework-agnostic and diagnosis-first
- Cover the MVP metrics: LCP, FCP, INP, CLS, TTFB, and TBT
- Support two usage modes:
  - MCP-assisted mode when Lighthouse/performance tooling exists
  - Manual-evidence mode when users provide reports, traces, or screenshots
- Include a before/after verification template
- Publish EN/ZH docs-site pages and navigation entries if `docs-site/` is
  available locally

## Acceptance Criteria

- [ ] Marketplace skill exists with valid frontmatter and clear structure
- [ ] Marketplace index includes the new skill entry
- [ ] Skill content prioritizes evidence collection and primary bottleneck
- [ ] Docs-site pages are added when local docs-site files are available
- [ ] Validation covers JSON syntax and installability assumptions

## Technical Notes

- Existing CLI marketplace support is generic; no CLI feature work is expected
- `docs-site/` is currently an uninitialized submodule in this workspace and may
  require separate handling if local files are unavailable
- This is primarily a text/template change, so new automated tests are only
  needed if implementation uncovers installer or registry logic changes
