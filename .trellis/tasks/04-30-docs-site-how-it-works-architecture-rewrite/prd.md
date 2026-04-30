# Rewrite docs-site how-it-works and architecture

## Goal

Rewrite the live docs-site `How It Works` and `Architecture Overview` pages so they read like concrete engineering documentation and match the current Trellis architecture described by the bundled `trellis-meta` skill.

## Requirements

- Update the live English pages:
  - `docs-site/start/how-it-works.mdx`
  - `docs-site/advanced/architecture.mdx`
- Update the matching Chinese pages with the same structure and facts:
  - `docs-site/zh/start/how-it-works.mdx`
  - `docs-site/zh/advanced/architecture.mdx`
- Add a live Advanced page for custom spec template marketplace authoring, plus
  the matching Chinese page and navigation entries:
  - `docs-site/advanced/custom-spec-template-marketplace.mdx`
  - `docs-site/zh/advanced/custom-spec-template-marketplace.mdx`
  - `docs-site/docs.json`
- Expand the product-feature scenario in `real-world-scenarios` with a concrete
  task/subtask split example:
  - `docs-site/start/real-world-scenarios.mdx`
  - `docs-site/zh/start/real-world-scenarios.mdx`
- Use bundled `trellis-meta` references as the architecture baseline:
  - `.trellis/workflow.md` is the workflow source of truth.
  - `[workflow-state:STATUS]` blocks live in `workflow.md`; hook scripts parse them and do not embed fallback text.
  - Task state is persisted under `.trellis/tasks/`; session active-task pointers live under `.trellis/.runtime/sessions/`.
  - `implement.jsonl` and `check.jsonl` contain spec/research context, not files being modified.
  - Platform behavior differs by hook-push, pull-prelude, and no-sub-agent/skill-inline paths.
  - The AI drives the Phase 3.4 commit plan after user confirmation; `/trellis:finish-work` archives and journals after the work commit exists.
- Remove or rewrite AI-flavored abstractions, marketing-ish claims, and over-broad statements.
- Keep the pages concrete: explain what files are read, what commands run, which state changes happen, and what is deliberately not automatic.

## Acceptance Criteria

- [ ] The two English pages no longer claim that `/trellis:finish-work` commits work code.
- [ ] `workflow-state` is described as parser-only content loaded from `.trellis/workflow.md`, not as duplicated hook text.
- [ ] The platform capability descriptions do not overstate Codex/Kiro/Kilo/Antigravity/Windsurf hook behavior.
- [ ] The Chinese pages mirror the English pages structurally without literal machine-translation tone.
- [ ] The new Advanced spec template marketplace page explains current `--registry` behavior, `index.json`, direct mode, and `path` semantics accurately.
- [ ] The product-feature scenario explains when to keep work under one Trellis task versus when to split separate tasks.
- [ ] MDX syntax remains valid and the docs-site quality checks pass without starting a dev server.

## Definition of Done

- Run docs-site lint/type checks or the closest available non-server verification.
- Review the final diff for factual drift against `trellis-meta` and `workflow-state-contract.md`.
- Do not update `release/` mirror pages or changelog files in this task.

## Technical Notes

- User request: "看一下文档站的 how-it-works 和 advanced/architecture ... 参考 bundle 里的 trellis meta 帮我改一下".
- Relevant docs-site spec files: `.trellis/spec/docs-site/docs/index.md`, `mdx-guidelines.md`, `style-guide.md`, `sync-on-change.md`.
- Relevant architecture source files inspected:
  - `packages/cli/src/templates/common/bundled-skills/trellis-meta/SKILL.md`
  - `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/overview.md`
  - `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/workflow.md`
  - `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/context-injection.md`
  - `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/task-system.md`
  - `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/platform-files/platform-map.md`
  - `.trellis/spec/cli/backend/workflow-state-contract.md`

## Out of Scope

- `docs-site/release/**` frozen pages.
- Changelog pages.
- Updating `trellis-meta` itself.
- Runtime code changes.
