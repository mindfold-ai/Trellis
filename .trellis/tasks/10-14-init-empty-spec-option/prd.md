# Add empty spec option to init

## Goal

Allow projects whose domain does not fit Trellis's built-in frontend/backend guidance, such as Linux kernel development, to initialize Trellis without receiving unrelated `.trellis/spec` files.

## Background

- `trellis init` currently offers `from scratch (default)`, but selecting it still generates built-in backend/frontend specification files and generic guides.
- The backend starter set assumes concerns such as database conventions, logging, error handling, and backend directory layout; the frontend set assumes components, hooks, state management, and type safety. These are fill-in skeletons, not domain-neutral specifications.
- When project detection returns `unknown`, init treats it as `fullstack` and writes both backend and frontend starter sets. The built-in set does not cover Linux kernel or embedded-specific concerns such as kernel subsystems, drivers, hardware interfaces, RTOS, or firmware build and test conventions.
- Fresh initialization with a developer identity also creates `00-bootstrap-guidelines`; its PRD and related files currently direct users to fill backend/frontend spec paths, so it would be inconsistent with a truly empty spec setup if left unchanged.
- When a custom `--registry` is used, the interactive single-repository picker contains remote templates only and does not offer a blank choice.
- Monorepo initialization always creates generic guides, and creates per-package backend/frontend docs for packages without a successfully downloaded remote template.
- The reported issue is [#658](https://github.com/mindfold-ai/Trellis/issues/658).

## Requirements

- Provide a built-in way to complete `trellis init` while skipping all generated `.trellis/spec` scaffolding.
- The empty-spec choice generates no files or directories under `.trellis/spec`, including `backend/`, `frontend/`, `guides/`, and monorepo package spec directories.
- Keep the existing `from scratch` choice and its generic starter-document behavior unchanged.
- Preserve `-y` behavior and add an explicit `--empty-spec` CLI option for non-interactive initialization.
- Make the interactive empty-spec choice available whether templates come from the built-in marketplace, a custom marketplace, or a direct-download registry.
- Apply empty-spec behavior to both single-repository and monorepo initialization.
- In monorepo mode, empty spec is a project-wide choice that skips all package specs and shared guides.
- Continue creating the rest of the Trellis runtime and platform configuration normally.
- Preserve successful remote-template installation behavior.
- If `.trellis/spec` already contains user files, selecting the empty-spec choice must leave them untouched.
- `--empty-spec` skips remote spec selection/download and works with or without `-y` or `--registry`.
- `--empty-spec` and `--template` are conflicting explicit spec choices and must produce a clear error; `--registry` may be supplied with `--empty-spec` but is not accessed or persisted.
- Retain the normal first-run bootstrap task, but make its instructions domain-neutral and spec setup optional; it must not direct users to nonexistent backend/frontend paths.

## Out of Scope

- Adding Linux-kernel-specific specs or a Linux kernel template.
- Changing the content of the existing generic backend, frontend, or guide documents.
- Changing `trellis update` behavior for projects that already contain specs.

## Acceptance Criteria

- [x] The selected empty-spec path creates no files under `.trellis/spec`, including generic guides, backend/frontend specs, or package specs.
- [x] Users can choose the empty-spec path in interactive single-repository initialization with built-in marketplace, custom marketplace, and direct-download registry modes.
- [x] Monorepo initialization can skip all built-in spec files while still setting up the rest of Trellis.
- [x] The empty-spec path preserves any pre-existing `.trellis/spec` files.
- [x] The bootstrap task remains available in empty-spec mode and offers optional, project-specific spec setup without backend/frontend assumptions.
- [x] A remote spec template can still be selected and installed as before.
- [x] `-y` continues producing the existing default spec files unless `--empty-spec` is passed.
- [x] Automated tests cover CLI option validation, interactive choices, user-file preservation, and single-repository/monorepo behavior.

## Key Decisions

- `from scratch` and `-y` retain their current generated-spec behavior for compatibility.
- Empty spec is a distinct interactive choice and the `--empty-spec` flag.
- Empty spec is global in monorepo mode, not selected independently per package.
- The bootstrap task remains, but in empty-spec mode it makes adding project-specific specs optional and uses no frontend/backend assumptions.
