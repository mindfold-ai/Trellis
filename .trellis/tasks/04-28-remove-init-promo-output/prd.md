# Remove trellis init promotional output

## Goal

Remove the promotional "Sound familiar? You'll never say these again!!" output printed after `trellis init` completes. The init command should still perform all setup work and keep necessary progress/success messages, but it should not print the post-init pain-point/value-proposition block.

## What I Already Know

- The unwanted output appears after `trellis init`.
- The text comes from `packages/cli/src/commands/init.ts`.
- The output is isolated in `printWhatWeSolve()`, called at the end of `init()`.

## Requirements

- Delete the `trellis init` post-completion promotional output.
- Remove dead code if no other caller uses it.
- Keep existing init setup behavior unchanged.
- Add or update a regression test for the changed init output behavior.

## Acceptance Criteria

- [x] `trellis init` no longer prints the "Sound familiar?" / "You'll never say these again!!" block.
- [x] No related dead helper remains in `init.ts`.
- [x] CLI lint, typecheck, and relevant tests pass.

## Out of Scope

- Changing normal setup progress messages.
- Changing docs-site content or release notes.
- Changing bootstrap/joiner task generation behavior.

## Technical Notes

- Relevant code: `packages/cli/src/commands/init.ts`
- Relevant tests: `packages/cli/test/commands/init.integration.test.ts`
- Verification completed:
  - `pnpm --filter @mindfoldhq/trellis test test/commands/init.integration.test.ts`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - Built the CLI with `pnpm --filter @mindfoldhq/trellis build`, then ran the built CLI in a temp directory:
    `node packages/cli/dist/cli/index.js init --yes --claude --user actualtest`
    The command exited 0 and the captured output did not include the removed promotional block.
  - Re-ran after workflow/brainstorm template follow-up:
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm --filter @mindfoldhq/trellis build`
    - Built CLI actual init smoke test, exit 0, `PROMO_MATCHES=0`
- Follow-up from review: the created task directory was initially named `04-28-04-28-remove-init-promo-output` because I passed a date-prefixed slug and `task.py create` automatically prepends `MM-DD-`. The directory has been renamed to `.trellis/tasks/04-28-remove-init-promo-output`, and workflow/brainstorm template docs now state that `--slug` must not include the date prefix. Current installed dogfood `trellis-brainstorm` skill copies were updated too, so the active project instructions match the shipped templates.
- Spec update decision: no `.trellis/spec/` update needed for the init-output removal itself. The discovered workflow instruction ambiguity was fixed in `.trellis/workflow.md` and the shipped workflow/brainstorm templates.
- Relevant specs:
  - `.trellis/spec/cli/backend/index.md`
  - `.trellis/spec/cli/backend/platform-integration.md`
  - `.trellis/spec/cli/backend/quality-guidelines.md`
  - `.trellis/spec/cli/unit-test/conventions.md`
