# Implementation Plan

## Checklist

1. [x] Add `emptySpec?: boolean` to init options and expose `--empty-spec` in the
   CLI help.
2. [x] Validate `--empty-spec` and `--template` as conflicting choices before
   filesystem writes; ensure `--registry` is not parsed or contacted when
   empty spec is explicit.
3. [x] Add an interactive empty-spec choice for single-repository flows with
   built-in marketplace, custom marketplace, and direct-download registries.
4. [x] Add a project-wide empty-spec choice for monorepo mode; when selected, skip
   per-package template prompts/downloads and all package/shared local specs.
5. [x] Pass the resolved setting into workflow structure creation and guard all
   local spec generation paths, including guides and monorepo packages.
6. [x] Add an empty-mode variant of the creator bootstrap task with optional,
   domain-neutral instructions and no nonexistent backend/frontend references;
   leave default-mode bootstrap content unchanged.
7. [x] Add integration coverage for flag and interactive empty selection, custom
   marketplace/direct registry selection, no network on flag mode,
   `--template` conflict, monorepo global skip, existing spec preservation,
   bootstrap content, and unchanged `-y` defaults/remote template behavior.
8. [x] Run focused CLI integration tests, full CLI tests, lint, and typecheck.
9. [x] Inspect the final diff and verify only the expected init/configurator/test
   behavior and task artifacts changed.

## Validation Commands

```bash
pnpm --filter @mindfoldhq/trellis exec vitest run test/commands/init.integration.test.ts
pnpm --filter @mindfoldhq/trellis test
pnpm lint
pnpm typecheck
```

## Review Gates

- Confirm the existing `from scratch` and `-y` snapshots remain unchanged.
- Confirm empty mode does not create `.trellis/spec` on a fresh project and
  does not modify any pre-existing spec files.
- Confirm all registry variants expose an interactive empty path and explicit
  `--empty-spec` does not perform registry network access.
- Confirm monorepo empty mode suppresses shared guides and every package spec,
  without suppressing normal Trellis runtime setup.
- Confirm empty-mode bootstrap output is optional and contains no
  backend/frontend-specific paths or instructions.
