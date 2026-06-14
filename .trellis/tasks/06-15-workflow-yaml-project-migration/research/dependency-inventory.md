# Workflow YAML Migration Dependency Inventory

Date: 2026-06-15

## Scope

This inventory records current `.trellis/workflow.md` runtime dependencies that must move to `.trellis/workflow.yaml` plus `.trellis/workflow/**` body files.

## Reference Implementation

The downstream OpenBao project already uses:

* `.trellis/workflow.yaml`
* `.trellis/workflow/index-extra.md`
* `.trellis/workflow/states/*.md`
* `.trellis/workflow/steps/*.md`
* `.trellis/scripts/common/workflow_model.py`

The manifest shape is a nested mapping keyed by phase id and step id. That is important because generated Python scripts must stay standard-library only; this shape can be parsed by the existing lightweight YAML subset parser without adding PyYAML.

## Runtime Consumers To Replace

* `.trellis/scripts/common/workflow_phase.py`
  Current role: parses Markdown headings and strips workflow-state blocks.
  Target role: delegate rendering to `common.workflow_model`.
* `.trellis/scripts/common/git_context.py`
  Current role: emits phase mode errors mentioning `workflow.md`.
  Target role: report `workflow.yaml`; optionally include JSON payload source metadata.
* `packages/cli/src/templates/shared-hooks/inject-workflow-state.py`
  Current role: regex parses `[workflow-state:*]` blocks from `.trellis/workflow.md`.
  Target role: call generated Python loader `get_workflow_state_bodies()`.
* `packages/cli/src/templates/shared-hooks/session-start.py`
  Current role: builds workflow TOC by scanning `.trellis/workflow.md`.
  Target role: call `render_workflow_toc()`.
* `packages/cli/src/templates/codex/hooks/session-start.py`
  Same migration as shared session-start.
* `packages/cli/src/templates/copilot/hooks/session-start.py`
  Same migration as shared session-start.
* `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js`
  Current role: JS regex parses `.trellis/workflow.md`.
  Target role: load workflow manifest/body files through OpenCode JS helper logic.
* `packages/cli/src/templates/opencode/lib/session-utils.js`
  Current role: scans `.trellis/workflow.md` for session overview.
  Target role: render from manifest/body files.
* `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
  Current role: TS regex parses `.trellis/workflow.md`.
  Target role: load workflow manifest/body files in extension.

## Template / Update Surfaces

* `packages/cli/src/templates/trellis/index.ts`
  Add `workflowYamlTemplate`, workflow body templates, and `commonWorkflowModel`.
* `packages/cli/src/configurators/workflow.ts`
  Fresh init should write `.trellis/workflow.yaml` and `.trellis/workflow/**`, not `.trellis/workflow.md`.
* `packages/cli/src/commands/update.ts`
  Template collection should include manifest/body files and stop writing `workflow.md`.
* `packages/cli/src/constants/paths.ts`
  Replace or supplement workflow guide constants with workflow manifest/body constants.
* `packages/cli/src/migrations/manifests/*.json`
  Add migration/safe deletion for pristine `.trellis/workflow.md`.
* `packages/cli/src/utils/template-hash.ts`
  Review managed/protected path behavior; `.trellis/workflow/**` must be treated as managed template content, unlike `.trellis/spec/**` and `.trellis/tasks/**`.

## Docs / Skills To Update

Current source-of-truth language still appears in:

* `AGENTS.md`
* `packages/cli/src/templates/markdown/agents.md`
* `packages/cli/src/templates/common/commands/start.md`
* `packages/cli/src/templates/common/commands/continue.md`
* `packages/cli/src/templates/common/skills/brainstorm.md`
* `packages/cli/src/templates/codex/skills/start/SKILL.md`
* `packages/cli/src/templates/codex/skills/onboard/SKILL.md`
* `packages/cli/src/templates/common/bundled-skills/trellis-meta/**`
* `.trellis/spec/cli/backend/directory-structure.md`
* `.trellis/spec/cli/backend/migrations.md`
* `.trellis/spec/cli/backend/workflow-state-contract.md`
* `.trellis/spec/guides/cross-layer-thinking-guide.md`

Historical task files and old release drafts may keep historical `workflow.md` references unless a test reads them as current guidance.

## Test Surfaces

Tests currently asserting `.trellis/workflow.md` behavior include:

* `packages/cli/test/templates/trellis.test.ts`
* `packages/cli/test/templates/extract.test.ts`
* `packages/cli/test/templates/opencode.test.ts`
* `packages/cli/test/templates/pi.test.ts`
* `packages/cli/test/commands/update.integration.test.ts`
* `packages/cli/test/commands/update-internals.test.ts`
* `packages/cli/test/constants/paths.test.ts`
* `packages/cli/test/regression.test.ts`

Update tests should prove both fresh init and update convergence:

* fresh init creates manifest and body files, no workflow.md.
* update replaces an old hash-tracked workflow.md structure with new managed files.
* workflow-state bodies are read from body files.
* `get_context.py --mode phase --step <id> --platform codex` still filters platform blocks.
* OpenCode and Pi template code no longer contains `.trellis/workflow.md` regex parsing.

## Chosen Direction

Use the OpenBao interface as the upstream baseline:

* `workflow_model.py`
  * `load_workflow_manifest()`
  * `get_workflow_state_bodies()`
  * `render_step()`
  * `render_phase_index()`
  * `render_workflow_toc()`
* Keep `workflow_phase.py` as the platform filtering wrapper, so existing callers do not need a large interface change.
* Keep body Markdown platform marker syntax unchanged so platform filtering behavior remains stable.
