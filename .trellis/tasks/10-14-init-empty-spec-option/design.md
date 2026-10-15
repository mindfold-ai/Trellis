# Design: Empty Spec Initialization

## Scope

Add an explicit empty-spec path to `trellis init` while preserving existing
`from scratch`, remote-template, and `-y` behavior. Empty spec applies to the
whole initialization, including every package and shared guides in monorepo
mode.

## User Interface and Precedence

- Add `--empty-spec` to the init CLI and `InitOptions`.
- Add an `empty spec (skip all spec scaffolding)` choice to interactive
  single-repository template selection, including built-in/custom marketplace
  and direct-download registry flows.
- In monorepo mode, offer empty spec as one project-wide choice before the
  existing per-package template flow. Choosing it skips all package selection
  and remote spec access.
- Keep `-y` behavior unchanged. `--empty-spec` is explicit and works with `-y`.
- Reject `--empty-spec` with `--template` with a clear validation error.
- Accept `--registry` with `--empty-spec`, but skip registry parsing, probing,
  downloading, and config persistence because no registry content is used.

## Data Flow

`init()` resolves one `emptySpec` boolean from either the CLI flag or the
interactive selection. The value is global and is passed through workflow
creation and first-run bootstrap generation.

When empty spec is selected:

- Do not download a remote spec template.
- Do not call local spec scaffold creation. This suppresses backend, frontend,
  guides, and per-package spec output.
- Do not remove, overwrite, or otherwise alter any existing `.trellis/spec`
  files.
- Continue writing the workflow runtime, platform templates, task/workspace
  directories, root files, and normal template hashes.
- If the creator bootstrap task is generated, use domain-neutral optional
  guidance and avoid backend/frontend file paths and checklist requirements.

## Code Boundaries

- `packages/cli/src/cli/index.ts`: expose the flag through Commander.
- `packages/cli/src/commands/init.ts`: option validation, interactive choice,
  registry/template precedence, monorepo-wide selection, and bootstrap-task
  mode propagation.
- `packages/cli/src/configurators/workflow.ts`: accept an explicit empty-spec
  setting and skip all spec creation in both single-repo and monorepo paths.
- `packages/cli/test/commands/init.integration.test.ts`: verify generated
  filesystem output and bootstrap task content through the existing real-temp
  integration harness.

## Compatibility and Failure Behavior

- Existing `from scratch`, successful remote downloads, and `-y` output remain
  unchanged.
- `--empty-spec` plus `--template` fails before any files are written.
- `--empty-spec` plus `--registry` succeeds without network access and does not
  persist an unused registry source.
- A custom registry's template picker must retain the empty choice. For
  direct-download registries, interactive users must be able to choose between
  empty spec and the direct remote spec.
- Existing spec content is user data; empty mode only suppresses new generated
  content and never cleans or replaces existing paths.

## Bootstrap Task

The normal first-run task remains present when developer identity triggers it.
In empty mode, its content should:

- explain that specs are optional and domain-specific;
- invite the user to review existing conventions and decide whether specs help;
- if useful, create a fitting structure under `.trellis/spec/`;
- avoid backend/frontend-specific checklists, claims that guides exist, and
  related-file paths to files that init did not create.

The default bootstrap content for non-empty init remains unchanged.

## Risks

- Init has separate single-repository, monorepo, direct-registry, and
  marketplace branches. Keep the resolved empty-spec state global so none of
  these paths accidentally falls through to default scaffold generation.
- `createWorkflowStructure()` currently skips local specs only in the
  single-repo branch when a remote template was installed. Its contract must
  be extended carefully so monorepo behavior changes only for explicit empty
  mode.
- The bootstrap task is generated from several helpers; checklist text,
  related files, and PRD content must all agree with empty mode.
