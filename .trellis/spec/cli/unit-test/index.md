# Unit Test Guidelines

> Testing conventions and patterns for this project.

---

## Overview

This project uses **Vitest** with TypeScript ESM. Tests live in a centralized `test/` directory mirroring `src/` structure. The goal is fast, reproducible tests with minimal mocking.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Conventions](./conventions.md) | File naming, structure, assertion patterns, test isolation (env-leak guard), when to write tests | Done |
| [Mock Strategies](./mock-strategies.md) | What to mock, how, and the minimal mocking principle | Done |
| [Integration Patterns](./integration-patterns.md) | Function-level integration tests for commands | Done |

---

## Quick Reference

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Run a specific test file
pnpm test test/commands/init.integration.test.ts

# Run with coverage report (terminal + HTML)
pnpm test:coverage
```

---

## Code Coverage

Coverage is generated automatically via `@vitest/coverage-v8`. Configuration is in `vitest.config.ts`.

- **Terminal**: `pnpm test:coverage` prints per-file coverage table
- **HTML report**: `./coverage/index.html` (gitignored, generated on demand)
- **Source scope**: `src/**/*.ts` (excludes `src/cli/index.ts`)

Do **not** maintain a manual coverage table — always run `pnpm test:coverage` for the real numbers.

---

## CI / Pipeline Strategy

| Stage | What Runs | Rationale |
|-------|-----------|-----------|
| **pre-commit** (husky) | `lint-staged` (eslint + prettier) | Keep fast; don't add tests here or developers will skip with `--no-verify` |
| **CI** (GitHub Actions, PR gate) | Pin Python 3.9 → compile every tracked `.py` file → TypeScript + Python typecheck → `pnpm lint` → `pnpm build` → `pnpm test` | Parse all shipped scripts with the real minimum interpreter before running the suite, then enforce `basedpyright` so syntax and type regressions cannot hide in unexecuted templates |

**When to reconsider**: If total test time exceeds 5 minutes, split into fast (unit) and slow (integration) stages. Currently unnecessary.

---

## Pre-Development Checklist

Before writing or improving tests:

1. Read [conventions.md](./conventions.md) — file naming, structure, assertion patterns, when to write tests
2. Read [mock-strategies.md](./mock-strategies.md) — what to mock, how, minimal mocking principle
3. For command-level tests, read [integration-patterns.md](./integration-patterns.md)

---

## Quality Check

After writing tests:

1. Ensure tests follow conventions (naming, structure, assertions)
2. Verify mocking is minimal — prefer real code paths
3. Run validation:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```
4. Check coverage decisions — report any gaps with rationale

---

**Language**: All documentation should be written in **English**.


## Native Python lifecycle regression

Issue 53 adds `scripts/native-python-regression.mjs` as an implementation-independent
built public-CLI driver. CI runs `windows-2022` with real isolated `python3` and
`py -3`, and targeted `ubuntu-24.04` / `macos-15` python3 scenarios. Windows
compares independently built affected baseline and candidate with fresh projects;
Unix runs the complete candidate chain and explicitly records baseline comparison
as not applicable. Preserve raw subprocess exits and exact assertion failures,
keep matrix fail-fast disabled, and distinguish environment failure from the
expected Windows baseline selection defect. See the driver README for dispatch,
identity and evidence commands. A local Git marketplace fixture exercises actual
provider parsing/cloning; it does not certify external GitHub transport or Agent
automatic loading.

Temporary Git fixtures that delete `.git` immediately after subprocesses finish
must disable `maintenance.auto` and `gc.auto` in that fixture's local config.
A completed foreground Git command may leave maintenance writing objects in the
background; cleanup then fails with ENOTEMPTY. Do not change global/production
Git configuration or add arbitrary sleeps/retries to conceal the race.

Native interpreter isolation must preserve normal Python script import behavior:
copy/expose the genuine runtime, audit alternate aliases cannot execute, and run
a real script importing a sibling module before entering candidate assertions.
Do not introduce ._pth isolation that changes sys.path to manufacture a failure.
Record the hash of actual sys.executable separately from the original setup
binary when a launcher selects another registered version. Canonicalize temporary
checkout roots from Git before exact-root maintenance entry calls (Windows TEMP
may otherwise use an 8.3 alias). Fixture errors never count as baseline reproduction.
