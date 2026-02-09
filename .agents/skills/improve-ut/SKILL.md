---
name: improve-ut
description: "Improve Unit Test Coverage for New Changes"
---

# Improve Unit Tests (UT)

Use this skill to improve test coverage after code changes.

## Usage

```text
$improve-ut
```

## Source of Truth

Read and follow these specs first:

1. `.trellis/spec/unit-test/index.md`
2. `.trellis/spec/unit-test/conventions.md`
3. `.trellis/spec/unit-test/integration-patterns.md`
4. `.trellis/spec/unit-test/mock-strategies.md`

> If this skill conflicts with the unit-test specs, the specs win.

---

## Execution Flow

1. Inspect changed files:
   - `git diff --name-only`
2. Decide test scope using unit-test specs:
   - unit vs integration vs regression
   - mock vs real filesystem flow
3. Add/update tests using existing project test patterns
4. Run validation:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

5. Summarize decisions, updates, and remaining test gaps.

---

## Output Format

```markdown
## UT Coverage Plan
- Changed areas: ...
- Test scope (unit/integration/regression): ...

## Test Updates
- Added: ...
- Updated: ...

## Validation
- pnpm lint: pass/fail
- pnpm typecheck: pass/fail
- pnpm test: pass/fail

## Gaps / Follow-ups
- <none or explicit rationale>
```
