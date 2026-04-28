# Optimize Trellis Documentation Site

## Goal

Rebuild the Trellis documentation site around the real adoption problem: making AI coding reliable across teams, tools, and sessions. The current docs explain many Trellis mechanics, but they do not yet make the enterprise/team-scale value obvious or route different user types efficiently.

This task should turn the research in `.trellis/workspace/kleinhe/trellis-docs-deep-research-2026-04-27.md` into an actionable docs-site implementation plan and then, in a follow-up implementation pass, update the Mintlify docs content and navigation.

## Background

Inputs already gathered:

- Current GitHub README positioning: Trellis as a repo-native operating layer for team-scale AI coding.
- Current docs-site public content from `docs.trytrellis.app`.
- Peer documentation research:
  - GitHub Spec Kit
  - OpenSpec
  - Kiro Specs and Steering
  - BMad Method
  - Agent OS
  - Superpowers
  - SuperClaude
  - Cursor/Kiro rule and steering documentation patterns
- Trellis user research:
  - Interview insight summary
  - Survey data
  - Enterprise rollout document

Key research conclusion:

Trellis docs should move from command-first documentation to intent-based documentation paths. The site should help a reader quickly answer:

1. Is Trellis for me?
2. What workflow does it introduce?
3. What files and artifacts does it create?
4. How do I get one useful task done?
5. How do I roll it out to a team?
6. How do I keep it safe, debuggable, and maintainable?

## User Segments

### Solo / power user

Needs:

- Quick proof that Trellis improves one real task.
- Minimal mental overhead.
- Clear explanation of what to run, what files are created, and how to undo/update.

Primary path:

`What is Trellis?` -> `Install & First Task` -> `Write Better Specs` -> `Troubleshooting`

### Team lead

Needs:

- A rollout process for one pilot repo.
- Guidance on shared specs, task boundaries, check gates, and review loops.
- Success metrics for whether adoption is working.

Primary path:

`What is Trellis?` -> `Team Rollout Playbook` -> `Write Better Specs` -> `Review Feedback to Specs`

### Enterprise / platform lead

Needs:

- Confidence that Trellis supports multi-platform teams without IDE lock-in.
- Clear governance story: versioned standards, explicit memory, update safety, and rollout control.
- Comparison against CLAUDE.md, AGENTS.md, Cursor Rules, Spec Kit, OpenSpec, and Superpowers.

Primary path:

`What is Trellis?` -> `Enterprise Deployment and Governance` -> `Platform Matrix` -> `Comparisons`

### Advanced integrator

Needs:

- Hooks, skills, sub-agents, JSONL, custom commands, templates, and registry references.
- Exact file paths and schemas.

Primary path:

`Architecture Overview` -> `Custom Hooks` -> `Custom Skills` -> `JSONL Context Config` -> `Template Registry`

## Requirements

### Positioning

- Replace beginner-sounding docs copy such as "training wheels" with a mature team-scale framing.
- Align docs homepage with README framing:
  - "Make AI coding reliable at team scale."
  - "Repo-native operating layer for specs, tasks, workflow gates, and memory."
- Explain that Trellis does not replace Claude Code, Cursor, Codex, OpenCode, Kiro, or Gemini. It provides a shared repo source of truth around them.

### Information architecture

Restructure docs around these top-level areas:

1. Start Here
2. Core Concepts
3. Guides
4. Use Cases
5. Reference
6. Community / Marketplace
7. Changelog

Recommended page set:

Start Here:

- `What is Trellis?`
- `Choose Your Path`
- `Install & First Task`
- `Bootstrap Specs from an Existing Repo`
- `Upgrade from CLAUDE.md / AGENTS.md / Cursor Rules`

Core Concepts:

- `Concept Map: Specs, Tasks, Workspace, Workflow`
- `Specs: Standards AI Actually Follows`
- `Tasks & PRDs: Boundaries for AI Work`
- `Workspace Memory: Explicit Journaling, Not Magic Memory`
- `Workflow Lifecycle: Plan, Build, Check, Finish, Learn`
- `Platform Adapters`
- `Hooks, Skills, Sub-agents, Commands`

Guides:

- `Write Better Specs`
- `Team Rollout Playbook`
- `Brownfield / Monorepo Adoption`
- `Multi-agent Worktrees`
- `Enterprise Deployment and Governance`
- `Troubleshooting and Known Conflicts`
- `Updating and Migrations`

Use Cases:

- `Make AI Follow Team Conventions`
- `Reduce Repeated PR Review Feedback`
- `Run AI Coding Across Multiple IDEs`
- `Onboard a 50-person Department`
- `Manage Large Brownfield Repos`
- `Coordinate Parallel Agents Safely`

Reference:

- `CLI Commands`
- `Platform Matrix`
- `File Structure`
- `JSONL Context Config`
- `task.json Schema`
- `Hook Reference`
- `Skill Reference`
- `Template Registry Reference`

Community / Marketplace:

- `Spec Templates`
- `Skills`
- `Showcase`
- `Contributing`

### Homepage

The homepage should do four jobs:

1. Establish the mature value proposition.
2. Show a concrete Trellis workflow outcome.
3. Route users by intent.
4. Provide trust signals.

Recommended homepage structure:

1. Hero
   - H1: "Make AI coding reliable at team scale."
   - Subcopy: "Repo-native specs, tasks, workflow gates, and memory for Claude Code, Cursor, Codex, OpenCode, Kiro, Gemini, and more."
   - CTAs: `Start in 10 minutes`, `Team rollout guide`, `GitHub`
2. Problem
   - AI coding works for one person; teams need shared context, task boundaries, review gates, and memory.
3. How Trellis works
   - Specs
   - Tasks
   - Workflow
   - Workspace
   - Platform adapters
4. See it in action
   - Short transcript showing task creation, PRD, spec injection, implementation, check, spec update, and journal.
5. Choose your path
   - Solo builder
   - Team lead
   - Enterprise/platform lead
   - Advanced customizer
6. Proof
   - Supported platforms
   - Team/department adoption note
   - Marketplace/templates/community links

### First-task onboarding

Rewrite the first-task guide to show a concrete artifact story:

1. Install.
2. Run `trellis init`.
3. Bootstrap or write one real spec.
4. Ask for one real task.
5. Inspect the created task directory and PRD.
6. See which specs are injected.
7. Run check/finish.
8. See the journal entry.

This page should not lead with platform matrices. Platform specifics should be either tabs or a linked platform setup page.

### Spec-writing guidance

Create or heavily expand a guide named `Write Better Specs`.

It must include:

- Bad vs good examples.
- How specific a spec needs to be.
- How long a spec should be.
- How to split specs.
- How to include file paths and code examples.
- How to prevent spec bloat.
- How to test whether a spec works.
- How to promote repeated review feedback into a spec.

### Team rollout guidance

Create a `Team Rollout Playbook` based on the enterprise rollout material.

Required sections:

1. Pick a pilot repo.
2. Bootstrap first specs.
3. Run one complete task.
4. Add check gates.
5. Convert repeated review feedback into specs.
6. Add more platforms and developers.
7. Measure success.

Success signals:

- AI output style becomes more consistent.
- PRDs become clearer.
- Repeated review comments decrease.
- New members onboard faster.
- Multi-platform usage does not split the workflow.
- Task scope sprawl decreases.

### Comparisons

Add practical comparison pages or a comparison hub:

- Trellis vs CLAUDE.md / AGENTS.md / Cursor Rules
- Trellis vs Superpowers
- Trellis vs OpenSpec
- Trellis vs GitHub Spec Kit
- Trellis vs BMad / Agent OS
- Trellis with Kiro / Cursor / Codex / OpenCode

Tone rule:

- Comparisons must be factual and pragmatic.
- Include "use both when..." and "migrate when..." guidance.
- Avoid dismissive competitor framing.

### Troubleshooting

Add or expand troubleshooting for:

- Superpowers / Superpower harness conflicts.
- Specs not being followed.
- Context too long.
- Hook did not fire.
- Existing settings overwritten or protected.
- Codex / Claude / Cursor / OpenCode platform differences.
- Update and migration safety.
- How to verify Trellis is active.

### Trust and enterprise readiness

Add trust signals without overclaiming:

- Supported platform matrix.
- Versioned repo-native source of truth.
- Explicit journaling instead of opaque memory.
- Update safety and protected paths.
- Sanitized team/enterprise usage examples.
- Case studies when public approval is available.

## Non-goals

- Do not create a GUI product page unless product direction is finalized.
- Do not overstate that specs are "executable" or that Trellis guarantees AI correctness.
- Do not turn the docs into a generic AI coding education site.
- Do not remove existing advanced references; reorganize them behind better user paths.
- Do not mix English and Chinese in the same page. Follow the docs-site i18n structure.

## Implementation Plan

### Phase 0: Local docs-site readiness

Status: blocked until docs-site submodule is available locally.

Actions:

- Initialize or update the `docs-site/` submodule.
- Inspect the current `docs.json` and MDX file tree.
- Identify canonical routes and duplicate legacy routes.
- Confirm whether the implementation target is beta docs, release docs, or both.

Deliverable:

- A file-level change plan mapping existing pages to keep, rewrite, move, merge, or redirect.

### Phase 1: IA and navigation cleanup

Actions:

- Update `docs.json` navigation around the proposed top-level structure.
- Pick canonical routes for duplicated quickstart/start/guide pages.
- Preserve old routes only if required for SEO/backlinks.
- Ensure EN and ZH navigation remain structurally aligned.

Deliverable:

- Updated navigation with clear Start Here, Core Concepts, Guides, Use Cases, Reference, Community/Marketplace sections.

### Phase 2: Homepage and start path

Actions:

- Rewrite homepage to match README positioning.
- Add `Choose Your Path`.
- Rewrite `Install & First Task` to show end-to-end artifacts instead of flag lists first.
- Move large platform details into tabs or linked reference pages.

Deliverable:

- A reader can understand Trellis and complete one useful task without reading advanced reference material.

### Phase 3: Core concept pages

Actions:

- Rewrite concept overview around a single mental model:
  - Specs
  - Tasks
  - Workflow
  - Workspace
  - Platform adapters
- Add visual lifecycle map.
- Add glossary or concept map.

Deliverable:

- New users can distinguish spec, task, workspace, workflow, hook, skill, sub-agent, command, JSONL, and journal.

### Phase 4: Practical guides

Actions:

- Add `Write Better Specs`.
- Add `Team Rollout Playbook`.
- Add `Brownfield / Monorepo Adoption`.
- Add or expand `Troubleshooting and Known Conflicts`.
- Add `Updating and Migrations` with stable/beta guidance.

Deliverable:

- Docs directly address the known survey blockers: weak docs, onboarding friction, version churn, spec bloat, and tool conflicts.

### Phase 5: Comparisons and use cases

Actions:

- Add comparison hub and initial comparison pages.
- Add use-case pages for team conventions, review feedback, multi-IDE teams, large repos, and multi-agent workflows.
- Include sanitized adoption proof where allowed.

Deliverable:

- Prospective users can evaluate whether Trellis fits before installing.

### Phase 6: Validation and release prep

Actions:

- Run local Mintlify dev server.
- Check navigation, search, links, language switcher, and route redirects.
- Validate MDX syntax.
- Review docs against `.trellis/spec/docs-site/docs/` guidelines.
- Capture screenshots or a short walkthrough for review.

Deliverable:

- Docs-site changes are ready for human review and PR.

## Acceptance Criteria

- [ ] Task has a complete PRD and implementation plan.
- [ ] Research report is referenced from the task.
- [ ] docs-site submodule state and implementation target are clarified before editing docs.
- [ ] Navigation proposal maps to concrete Mintlify pages and `docs.json` groups.
- [ ] Homepage rewrite plan aligns with README positioning.
- [ ] First-task onboarding plan includes created artifacts and workflow outcome.
- [ ] Spec-writing and team-rollout guides are planned as first-class pages.
- [ ] Troubleshooting covers known harness conflicts and spec-injection failures.
- [ ] Comparison content is factual and includes "use both when..." guidance.
- [ ] EN/ZH structure is accounted for before implementation.
- [ ] Final implementation runs Mintlify validation or documents why it could not run.

## Relevant Source Material

- `.trellis/workspace/kleinhe/trellis-docs-deep-research-2026-04-27.md`
- `README.md`
- `.trellis/spec/docs-site/docs/index.md`
- `.trellis/spec/docs-site/docs/directory-structure.md`
- `.trellis/spec/docs-site/docs/mdx-guidelines.md`
- `.trellis/spec/docs-site/docs/config-guidelines.md`
- `.trellis/spec/docs-site/docs/style-guide.md`
- `.trellis/spec/guides/index.md`

## Risks

- `docs-site/` is currently an uninitialized submodule in this workspace, so implementation cannot safely edit MDX files until the submodule is available.
- Route duplication may have SEO/backlink implications; canonicalization should be deliberate.
- Enterprise adoption claims require sanitized/publicly approved wording.
- A full bilingual rewrite is larger than one small PR; implementation may need staged PRs.

## Open Questions

1. Should the first implementation target beta docs, release docs, or both?
2. Which enterprise/user adoption claims are approved for public wording?
3. Should Chinese docs be rewritten in the same PR or staged after English IA is approved?
4. Should comparison pages be public at launch, or start as internal review drafts?
