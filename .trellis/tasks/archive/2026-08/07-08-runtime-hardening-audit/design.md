# Audit and harden Trellis runtime scripts

## Technical Design

Trellis copies `.trellis/scripts/common/*` into user projects. Runtime changes must therefore be treated as product changes, not just local script cleanup. The implementation should start with an audit matrix, then apply the smallest fixes that make unsafe cases explicit and testable.

## Boundaries

- Dogfood runtime: `.trellis/scripts/common/*`
- Packaged runtime template: `packages/cli/src/templates/trellis/scripts/common/*`
- Command wrappers that call the runtime helpers: `.trellis/scripts/*.py` and their packaged template equivalents
- Tests: `packages/cli/test/scripts/*`, `packages/cli/test/templates/*`, and any new focused regression file needed for Python runtime behavior

## Proposed Shape

1. Build an audit matrix for task path resolution, task directory moves, JSON reads/writes, config parsing, and lifecycle hook execution.
2. Classify every failure path as one of:
   - hard fail: risk of data loss, path escape, or corrupt task state
   - warn and continue: expected hook fail-open or optional context
   - quiet fallback: intentionally missing optional files only
3. Centralize or tighten path containment logic so callers cannot accidentally bypass it.
4. Split tolerant I/O from safety-sensitive I/O where the current `None`/`False` return shape hides useful failure details.
5. Reconcile the two simple config parsers or document why they differ, then lock the chosen subset with tests.
6. Keep dogfood and template copies synchronized in the same commit.

## Trade-Offs

- A stricter runtime may reveal previously hidden project-local config mistakes. Prefer clear warnings and migration notes over silently preserving broken behavior.
- Avoid adding PyYAML or other runtime dependencies unless the parser subset becomes too complex to maintain safely.
- Hook paths should remain resilient in AI sessions, but task lifecycle commands should prefer explicit failure over ambiguous success.

## Validation Strategy

- Add focused regression tests for the specific bug classes instead of relying on broad CLI smoke coverage.
- Verify both generated templates and dogfood scripts when helpers are duplicated.
- Run the relevant `pnpm --filter @mindfoldhq/trellis exec vitest run ...` targets plus lint/typecheck when implementation touches TypeScript test harnesses or template export code.
