# Implementation Plan

## Ordered Work

| Step | Work | Status | Verification |
| --- | --- | --- | --- |
| 1 | Refactor Plan2 identity-group validation to keep archive-only repeats separate from active authority counting while retaining identity, generation, provenance, case, and workspace checks. | Done | Typecheck and focused migration tests. |
| 2 | Keep the active duplicate binding key limited to repeated active copies; do not add binding rows for history-only archives. | Done | Tests for archive-only copies and one active authority with archive copies. |
| 3 | Add positive integration coverage for complete multi-workspace preservation, including raw bytes and modes. Add negative coverage for same-workspace duplicate archives and mismatched identity facts. | Done | `pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts` |
| 4 | Preserve existing active-copy collision tests and add/adjust assertions only where the new archive-only rule changes the expected result. | Done | Focused migration suite and existing active-copy cases. |
| 5 | Update `commands-migrate.md` to document the narrow `history_only` exception and unchanged active binding rules. | Done | Read changed spec and compare it with implementation/tests. |
| 6 | Review full diff and run the affected CLI quality checks. | Done | `pnpm --filter @mindfoldhq/trellis typecheck`, `pnpm --filter @mindfoldhq/trellis lint`, focused migration tests. |

## Risk Controls

- Do not alter the migration plan schema or serialized identity fields.
- Do not synthesize bindings, merge Task records, or modify Task/archive bytes outside reviewed migrations.
- Keep failed-preview and invalid-identity tests asserting zero writes.
- Stop installation follow-up if the target's independent active-Task branch binding remains unresolved; do not create it inside this CLI feature.

## Completion Boundary

This Task produces a reviewed source change. A complete source lock, published package version, Guru source update, and `k8s-infra` installation are separate dependent operations and must use their owning repository/release workflows.
