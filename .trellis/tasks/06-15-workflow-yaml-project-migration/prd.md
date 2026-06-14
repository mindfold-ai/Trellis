# Migrate Trellis Workflow To YAML Manifest

## Goal

Replace the project-level Trellis workflow runtime source from the monolithic `.trellis/workflow.md` file to a structured `.trellis/workflow.yaml` manifest plus Markdown body files, using the OpenBao downstream experiment as evidence but making the solution robust for Trellis upstream and all downstream repositories created or updated by the CLI.

## What I Already Know

* The user pointed to `openbao-mcp-token-manager/docs/logs/20260615/trellis-workflow-md-structure-improvement.md` as the current downstream reference.
* The OpenBao reference concludes that `.trellis/workflow.md` should not be restored as a runtime entrypoint. It recommends `.trellis/workflow.yaml` for machine structure, `.trellis/workflow/` for long Markdown bodies, and a unified loader for CLI/hooks.
* This Trellis repo still ships and dogfoods `.trellis/workflow.md`.
* Current source and templates still reference `.trellis/workflow.md` across CLI init/update, shared hooks, Codex/Copilot session-start hooks, OpenCode plugin utilities, Pi extension, bundled skills, tests, docs, and specs.
* Existing specs explicitly describe `workflow.md` as runtime input and require whole-file update behavior. Those contracts must be rewritten as part of the migration.
* The migration is cross-platform and cross-language: TypeScript CLI, Python generated scripts/hooks, JavaScript OpenCode plugin, TypeScript Pi extension, Markdown/skill text, and tests all need alignment.

## Assumptions

* Long-term target: `.trellis/workflow.yaml` is the only machine-readable runtime structure source.
* Markdown body files remain editable by humans but are not parsed for structural discovery.
* Downstream repositories should get the new structure through fresh `trellis init` and `trellis update`.
* `.trellis/workflow.md` should be removed from generated projects when it is still an unmodified Trellis-managed template, while user-modified copies must remain protected by the existing hash/migration safeguards.
* This task should not preserve a hidden fallback parser for old `.trellis/workflow.md` in new runtime code.

## Requirements

* Add a structured workflow manifest at `.trellis/workflow.yaml` and template equivalent under `packages/cli/src/templates/trellis/`.
* Move long workflow bodies into `.trellis/workflow/` and template equivalents, with manifest `body_file` references.
* Add or replace the generated Python workflow runtime loader so `get_context.py`, workflow-state hooks, session-start hooks, and related generated scripts read the manifest/body model.
* Update OpenCode and Pi runtime equivalents to consume the manifest/body model or generated pre-rendered equivalents, without parsing `.trellis/workflow.md`.
* Update `trellis init` and `trellis update` template collection and hash tracking so fresh and existing downstream projects receive `.trellis/workflow.yaml` plus `.trellis/workflow/**`.
* Add a migration manifest that deletes unmanaged/pristine `.trellis/workflow.md` safely and introduces the new managed files.
* Update bundled skills, commands, prompts, docs, specs, and tests that describe `.trellis/workflow.md` as the source of truth.
* Add a workflow validation path or equivalent tests that catch missing body files, invalid manifest shape, empty step renders, and missing workflow-state bodies.
* Keep `.trellis/tasks/`, `.trellis/spec/`, `.trellis/workspace/`, and user-modified workflow files protected.

## Acceptance Criteria

* [ ] `trellis init` creates `.trellis/workflow.yaml` and `.trellis/workflow/**`, and does not create `.trellis/workflow.md`.
* [ ] `trellis update --force` updates a pristine older project to the new workflow structure.
* [ ] Runtime context commands render phase index and step detail from `.trellis/workflow.yaml`.
* [ ] Per-turn workflow-state injection reads bodies from the manifest/body model.
* [ ] Session-start context reads the workflow overview from the manifest/body model.
* [ ] OpenCode and Pi equivalents no longer parse `.trellis/workflow.md`.
* [ ] Tests cover fresh init, update migration, template extraction, Python loader behavior, hook behavior, and platform-specific workflow-state consumers.
* [ ] `pnpm lint`, `pnpm typecheck`, and targeted tests pass.
* [ ] Specs and bundled skills no longer teach `.trellis/workflow.md` as current runtime SoT.

## Technical Approach

Adopt the OpenBao three-layer architecture as the upstream direction:

1. `workflow.yaml` contains schema version, phases, steps, platform groups, workflow-state names, and body file paths.
2. `workflow/` contains Markdown body files for phase index extras, state breadcrumbs, and step details.
3. A unified loader owns validation and rendering so callers do not duplicate YAML/body parsing.

The implementation should prioritize a deep loader module over ad hoc parsing in each hook/plugin. For Python runtime, use standard-library parsing only; if YAML support is not already available in generated scripts, choose a YAML subset or manifest shape that can be parsed safely without external dependencies, or provide a small parser with explicit validation.

## Decision (ADR-lite)

**Context**: The old `.trellis/workflow.md` file mixes structure, runtime prompt text, platform routing, task lifecycle policy, and human documentation. Multiple consumers parse it differently, making prose edits a runtime risk.

**Decision**: Treat `.trellis/workflow.yaml` as the machine source of truth and `.trellis/workflow/` as body text storage. Do not add a new `.trellis/workflow.md` fallback for current runtime.

**Consequences**: The migration touches more files now, but reduces future parser drift. Downstream update needs careful template/hash/migration coverage so existing repositories converge safely.

## Out Of Scope

* Redesigning task statuses or adding a new phase model.
* Reworking sub-agent dispatch semantics beyond preserving existing behavior through the new source format.
* Publishing a release or submitting a PR in this task unless explicitly requested later.
* Rewriting historical `docs/pr/` notes to new terminology.

## Technical Notes

* Reference log: `/Users/wangyongchang/Jobs/Code/guru-agent-plugin/openbao-mcp-token-manager/docs/logs/20260615/trellis-workflow-md-structure-improvement.md`.
* Current Trellis task: `.trellis/tasks/06-15-workflow-yaml-project-migration`.
* Relevant specs already read: `cli/backend/index.md`, `directory-structure.md`, `script-conventions.md`, `migrations.md`, `platform-integration.md`, `workflow-state-contract.md`, `quality-guidelines.md`, `cli/unit-test/index.md`, `conventions.md`, `integration-patterns.md`, `mock-strategies.md`, `guides/code-reuse-thinking-guide.md`, `guides/cross-platform-thinking-guide.md`.
* Relevant skills read: `trellis-start`, `trellis-brainstorm`, `trellis-meta`, `python-design`.
