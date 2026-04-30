# Test Conventions

> File naming, structure, and assertion patterns.

---

## Test Infrastructure

| Item | Value |
|------|-------|
| Framework | Vitest 4.x |
| Config | `vitest.config.ts` |
| Include | `test/**/*.test.ts` |
| Exclude | `third/**` |
| Setup files | `test/setup.ts` (runs before any test, strips host-shell session env vars — see "Test Isolation" below) |
| Lint scope | `eslint src/ test/` |
| Module system | ESM (`"type": "module"` + `"module": "NodeNext"`) |
| Coverage provider | `@vitest/coverage-v8` |
| Coverage command | `pnpm test:coverage` |
| Coverage scope | `src/**/*.ts` (excludes `src/cli/index.ts`) |
| Coverage reports | `text` (terminal), `html` (`./coverage/index.html`), `json-summary` |

---

## Test Isolation

### Strip host-shell session env vars at process start

Several Trellis modules (e.g. `OpenCodeContext.getContextKey`, `TrellisContext.getActiveTask`) consult `process.env.TRELLIS_CONTEXT_ID` and `process.env.OPENCODE_RUN_ID` as **highest-priority overrides** — production behavior, by design.

When tests run inside a Claude Code or OpenCode session, those env vars leak from the parent shell into the vitest process and **hijack the resolver**, ignoring the test's mocked `platformInput`. Symptom: tests expecting a derived `opencode_oc-a` contextKey receive `claude_<host-session-id>` instead, failing deterministically only on dev machines.

**Convention**: `test/setup.ts` is registered via `setupFiles` in `vitest.config.ts` and unconditionally `delete`s these env vars before any test loads:

```ts
// test/setup.ts
delete process.env.TRELLIS_CONTEXT_ID;
delete process.env.OPENCODE_RUN_ID;
```

**When to extend**: any new env var that production resolvers honor as a user override, AND that the dev's host shell may export, must be added to `test/setup.ts`. Do NOT fix this in production code by ignoring the env var — the override is a real feature for end users.

**When NOT to use**: tests that *intentionally* exercise the env-override path should set the env explicitly inside the test (`process.env.X = "..."` in a `beforeEach` and restore in `afterEach`).

---

## When to Write Tests

### Must write

| Change Type | Test Type | Example |
|-------------|-----------|---------|
| New pure/utility function | Unit test | Added `compareVersions()` → test boundary values |
| New platform | Unit (auto-covered by `registry-invariants.test.ts`) | Added opencode → invariants verify consistency |
| Bug fix | Regression test | Fixed Windows encoding → add to `regression.test.ts` |
| Changed init/update behavior | Integration test | Changed downgrade logic → add/update scenario in `update.integration.test.ts` |

### Don't need tests

| Change Type | Reason |
|-------------|--------|
| Template text / doc content changes | No logic change |
| New migration manifest JSON | `registry-invariants.test.ts` auto-validates format |
| CLI flag description text | Display-only |

### Must update existing tests

| Change Type | What to Update |
|-------------|----------------|
| New command/skill added to a platform | Add to `EXPECTED_COMMAND_NAMES` / `EXPECTED_SKILL_NAMES` in that platform's test file |
| New command added to ANY platform | Add to ALL platform test files (claude, cursor, iflow, codex) — see platform-integration spec for required command list |

### Decision flow

```
Does this change have logic branches?
├─ No (pure data/text) → Don't write tests
└─ Yes
   ├─ Standalone function with predictable input→output? → Unit test
   ├─ Fixing a historical bug? → Regression test (verify fix exists in source)
   └─ Changes init/update end-to-end behavior? → Integration test
```

---

## File Naming

```
test/
  types/
    ai-tools.test.ts          # Unit tests for src/types/ai-tools.ts
  commands/
    update-internals.test.ts   # Unit tests for internal functions
    init.integration.test.ts   # Integration tests for init() command
    update.integration.test.ts # Integration tests for update() command
  regression.test.ts           # Cross-version regression tests
```

**Rules**:
- Mirror `src/` directory structure under `test/`
- Suffix: `.test.ts` for unit tests, `.integration.test.ts` for integration tests
- One test file per source module (exceptions: regression tests)

---

## Test Structure

### Standard Pattern

```typescript
import { describe, it, expect } from "vitest";

describe("functionName", () => {
  it("does X when given Y", () => {
    const result = functionName(input);
    expect(result).toBe(expected);
  });
});
```

### With Setup/Teardown

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("module", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

---

## Assertion Patterns

### Prefer Exact Matchers

```typescript
// Good: Exact
expect(result).toBe("expected");
expect(array).toEqual(["a", "b"]);

// Avoid: Loose
expect(result).toBeTruthy();
expect(array.length).toBeGreaterThan(0);
```

### Snapshot Comparison for No-Op Verification

When asserting that an operation made zero changes, use full directory snapshots:

```typescript
// Collect all files + contents before
const before = new Map<string, string>();
walk(dir, (filePath, content) => before.set(filePath, content));

// Run operation
await operation();

// Collect after and diff
const after = new Map<string, string>();
walk(dir, (filePath, content) => after.set(filePath, content));

const added = [...after.keys()].filter((k) => !before.has(k));
const removed = [...before.keys()].filter((k) => !after.has(k));
expect(added).toEqual([]);
expect(removed).toEqual([]);
```

---

## ESLint Compatibility

Tests must pass the same ESLint rules as `src/`. Common workarounds:

```typescript
// Empty function (no-empty-function rule)
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};
vi.spyOn(console, "log").mockImplementation(noop);

// Avoiding non-null assertion
// Bad: match![0]
// Good: (match as [unknown])[0]
```

---

## Test Anti-Patterns

Tests should verify **meaningful behavior**, not restate what TypeScript or the runtime already guarantees. The following anti-patterns were identified during a full test audit and should be avoided.

### Hardcoded Counts on Growing Data

```typescript
// Bad: breaks every time a manifest/script is added
expect(scripts.size).toBe(23);
expect(versions.length).toBe(23);

// Good: dynamic count from source of truth
const jsonFiles = fs.readdirSync(manifestDir).filter(f => f.endsWith(".json"));
expect(versions.length).toBe(jsonFiles.length);
expect(versions.length).toBeGreaterThan(0);
```

**Why**: Hardcoded counts create false-positive failures on unrelated changes and require constant manual updates.

### Tautological Assertions

```typescript
// Bad: testing that registry[key] === registry[key]
const config = getToolConfig(id);
expect(config).toBe(AI_TOOLS[id]); // getToolConfig just returns AI_TOOLS[id]

// Bad: testing that a function returns its own input
const dirs = getTemplateDirs(id);
expect(dirs).toEqual(AI_TOOLS[id].templateDirs); // getTemplateDirs just returns .templateDirs
```

**Why**: These tests verify that JavaScript object property access works, not that our code is correct. If the implementation is a trivial lookup, don't test it — test the **consumer behavior** instead.

### Redundant Type Checks (TypeScript Guarantees)

```typescript
// Bad: TypeScript already guarantees these at compile time
expect(typeof settingsTemplate).toBe("string");
expect(Array.isArray(commands)).toBe(true);
expect(typeof cmd.name).toBe("string");

// Good: test meaningful properties instead
expect(settingsTemplate.length).toBeGreaterThan(0);
expect(commands.length).toBeGreaterThan(0);
```

**Why**: In a strict TypeScript project, runtime type checks in tests add noise without catching real bugs.

### Duplicate Coverage Across Files

```typescript
// Bad: registry-invariants.test.ts AND index.test.ts both test:
// - PLATFORM_IDS length matches AI_TOOLS keys
// - cliFlag uniqueness
// - configDir starts with dot

// Good: test each invariant in ONE canonical location
// registry-invariants.test.ts: internal consistency (unique flags, no collisions, reserved names)
// index.test.ts: derived helper correctness (getConfiguredPlatforms, isManagedPath, etc.)
```

**Why**: Duplicate tests give a false sense of coverage, make refactoring harder, and increase maintenance burden.

### Redundant Assertions Within a Test

```typescript
// Bad: parse test already proves it's valid JSON string
it("is valid JSON", () => {
  expect(() => JSON.parse(settingsTemplate)).not.toThrow();
});
it("is a non-empty string", () => { // redundant if parse succeeds
  expect(settingsTemplate.length).toBeGreaterThan(0);
});

// Good: combine into one meaningful assertion
it("is valid non-empty JSON", () => {
  const parsed = JSON.parse(settingsTemplate);
  expect(parsed).toBeTruthy();
});
```

### Stale Regression Tests After Refactoring

```typescript
// Bad: regression test checks old location after code was moved
it("[beta.10] git_context.py has inline encoding fix", () => {
  expect(commonGitContext).toContain('sys.platform == "win32"');  // Moved to __init__.py!
});

// Good: updated to check new location
it("[beta.10] common/__init__.py has centralized encoding fix", () => {
  expect(commonInit).toContain('sys.platform == "win32"');
});
```

**Why**: When refactoring moves code between files (e.g., centralizing encoding from individual scripts to `common/__init__.py`), regression tests that check specific strings in specific files will break. The regression is still prevented — just in a different file.

**Prevention**: When refactoring code across files, search `test/regression.test.ts` for references to the affected files and update assertions to match the new location.

### Tautological Input (Test Doesn't Exercise the Code Path)

```typescript
// Bad: test input never triggers the code path being tested
it("safe-file-delete respects update.skip", () => {
  // Writes "some content" — hash never matches allowed_hashes
  // So collectSafeFileDeletes() returns "skip-modified" BEFORE checking update.skip
  // Even if update.skip logic is completely broken, this test passes
  fs.writeFileSync(deprecatedFile, "some content");
  config.update.skip = [".claude/commands/trellis/"];
  await update({ force: true });
  expect(fs.existsSync(deprecatedFile)).toBe(true); // Always true!
});

// Good: use input that WOULD trigger deletion without the guard
it("safe-file-delete respects update.skip", () => {
  // Write content whose hash IS in allowed_hashes
  // Without update.skip, the file WOULD be deleted
  fs.writeFileSync(deprecatedFile, originalTemplateContent);
  config.update.skip = [".claude/commands/trellis/"];
  await update({ force: true });
  expect(fs.existsSync(deprecatedFile)).toBe(true); // Proves update.skip works
});
```

**Why**: The test looks like it covers the feature, but the input makes the feature's code path unreachable. The test passes regardless of whether the feature works. This is worse than a missing test because it gives **false confidence**.

**Detection**: For any test that asserts a file/value is preserved, ask: "Would this assertion fail if I deleted the feature being tested?" If no → tautological input.

### Decision Rule

Before writing a test, ask:

1. **Does TypeScript already guarantee this?** → Skip (typeof, Array.isArray, property existence)
2. **Is this a trivial passthrough?** → Skip (getter that returns a property)
3. **Is this already tested elsewhere?** → Skip (avoid cross-file duplication)
4. **Does this depend on data that grows over time?** → Use dynamic counts
5. **Does this test real behavior or just restate the implementation?** → Only test behavior
6. **Does the test input actually reach the code path being tested?** → Verify with mental deletion test
7. **For bug-fix tests: do the args match the user's reported flag combination?** → If you "simplified" by adding a convenience flag, you're testing a different path

### Bug-Fix Tests Must Reproduce the Reported Flag Combination

```typescript
// Bad: convenience flag bypasses the very guard the bug lives behind
it("#2b issue #204: empty tasks/ → bootstrap", async () => {
  await init({ yes: true, user: "alice", force: true });
  // ↑ `force: true` skips the `if (!options.force) handleReinit(...)` guard
  //   in init.ts:931. Test green even though the user's `--yes` alone hits
  //   handleReinit and mis-routes to joiner.
  expect(fs.existsSync(bootstrapPath)).toBe(true);
});

// Good: args match exactly what the issue reporter typed
it("#2b issue #204: empty tasks/ + --yes alone → bootstrap", async () => {
  await init({ yes: true, user: "alice" });  // user's literal command
  expect(fs.existsSync(bootstrapPath)).toBe(true);
});

// Optional sibling for the parallel happy path
it("#2c issue #204: empty tasks/ + --yes --force → bootstrap", async () => {
  await init({ yes: true, user: "alice", force: true });
  expect(fs.existsSync(bootstrapPath)).toBe(true);
});
```

**Why**: Convenience flags (`force`, `skipExisting`, `--no-confirm`) in CLI tests often exist to skip prompts in test runs — but those same flags also short-circuit reinit / dispatch / interactive guards. A test that adds them to "make the test simpler" can silently route through a different code path than the one the user hit. Test green ≠ bug fixed.

**Detection**: For any bug-fix test, line up the args against the issue reporter's exact command. Each extra flag must justify itself: is it required to reach the reproduction state, or did you add it because the test "wouldn't run without it"? If the latter, the test is testing the bypass, not the fix.

**Related**: `cli/backend/quality-guidelines.md` → "Routing Fixes: Audit ALL Entry Paths" — the structural side of the same lesson. Every convenience flag in tests typically corresponds to an unfixed entry path in production code.

### Helper Setup Functions Are Load-Bearing — Audit Their Dependents Before Changing

```typescript
// Original helper — every joiner test relies on tasks/ being empty
function simulateExistingCheckout() {
  fs.mkdirSync(path.join(workflow, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(workflow, "spec"), { recursive: true });
}

// Updated helper — now also seeds tasks/archive/
function simulateExistingCheckout() {
  fs.mkdirSync(path.join(workflow, "tasks", "archive"), { recursive: true });
  // ...
}
```

If production code starts using `tasks/.length === 0` as the discriminator between "real reinit" and "aborted recovery", every test that calls `simulateExistingCheckout()` silently flips to the new branch. Tests still green, but they're testing a different scenario than their name claims.

**Rule**: Before modifying a helper that produces fixture state, `grep` for its callers and trace each one against the new behavior. Document load-bearing invariants in a JSDoc comment so the next maintainer doesn't need to re-derive them:

```typescript
/**
 * Helper: simulate a fresh clone of an existing Trellis project...
 *
 * NOTE: the seeded `tasks/archive/` is load-bearing for the joiner branch.
 * If you change the `tasksEmpty` predicate in init.ts (currently
 * `!exists || readdirSync().length === 0`), audit this helper — e.g., if
 * archive/ stops counting as "non-empty", every joiner test below regresses
 * into the bootstrap-fallback branch and assertions flip silently.
 */
```

---

## DO / DON'T

### DO

- Use independent temp directories per test (no shared state)
- Clean up temp directories in `afterEach`
- Restore all mocks in `afterEach` with `vi.restoreAllMocks()`
- Use `vi.mocked()` for type-safe mock access
- Number test scenarios (`#1`, `#2`, ...) for traceability to PRD
- Use dynamic counts derived from the source of truth (filesystem, registry)
- Test meaningful behavior, not implementation details

### DON'T

- Don't depend on test execution order
- Don't use timers, network, or global state
- Don't leave temp files after test completion
- Don't use `any` in test files (same ESLint rules apply)
- Don't forget `vi.unstubAllGlobals()` when using `vi.stubGlobal`
- Don't hardcode counts on growing datasets (manifests, scripts, platforms)
- Don't add `typeof` or `Array.isArray` checks in TypeScript tests
- Don't duplicate the same assertion across multiple test files
- Don't write tautological tests that just verify `x === x`
