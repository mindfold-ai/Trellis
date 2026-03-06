# Error Handling

> How errors are handled in this CLI project.

---

## Overview

This CLI project uses a **top-level catch pattern** where errors bubble up to command handlers and are displayed to users with colored output. The approach prioritizes user-friendly error messages while maintaining proper exit codes for scripting.

---

## Error Handling Strategy

### Top-Level Catch Pattern

All command actions are wrapped in try-catch at the CLI level:

```typescript
// cli/index.ts
program
  .command("init")
  .action(async (options: Record<string, unknown>) => {
    try {
      await init(options);
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
```

### Key Principles

1. **Let errors bubble up** - Don't catch errors in utility functions unless you can handle them meaningfully
2. **Type guard for error messages** - Always use `error instanceof Error ? error.message : error`
3. **Exit with code 1** - All errors should result in `process.exit(1)` for scripting
4. **User-friendly messages** - Display only the message, not the full stack trace

---

## Error Patterns

### Pattern 1: Top-Level Command Catch

Used at the CLI command level to catch all errors:

```typescript
.action(async (options) => {
  try {
    await commandAction(options);
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
});
```

### Pattern 2: Silent Failure for Optional Operations

When an operation is optional and failure is acceptable:

```typescript
// Git config might not be available
let developerName: string | undefined;
try {
  developerName = execSync("git config user.name", {
    encoding: "utf-8",
  }).trim();
} catch {
  // Git not available or no user.name configured - silently ignore
}
```

### Pattern 3: Graceful Degradation with Warning

When operation fails but we can continue:

```typescript
try {
  execSync(`bash "${scriptPath}" "${developerName}"`, { cwd, stdio: "inherit" });
  developerInitialized = true;
} catch (error) {
  console.log(
    chalk.yellow(
      `Warning: Failed to initialize developer: ${error instanceof Error ? error.message : error}`,
    ),
  );
  // Continue without developer initialization
}
```

### Pattern 4: Return-Based Error Signaling

For functions that check conditions, return a result object or boolean:

```typescript
function checkPackageJson(cwd: string): { hasFrontend: boolean; hasBackend: boolean } {
  if (!fs.existsSync(packageJsonPath)) {
    return { hasFrontend: false, hasBackend: false };
  }

  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    // ... analysis logic
    return { hasFrontend, hasBackend };
  } catch {
    return { hasFrontend: false, hasBackend: false };
  }
}
```

### Pattern 5: Probe-Based Error Distinction (404 vs Transient)

When a function probes a remote resource to **decide a control flow branch** (e.g., marketplace vs direct download), returning a uniform empty result for all errors is a bug. Distinguish "resource doesn't exist" (404) from transient failures (timeout, auth, 5xx):

```typescript
// Good: Caller can distinguish "not found" from "network error"
export async function probeRegistryIndex(indexUrl: string): Promise<{
  templates: SpecTemplate[];
  isNotFound: boolean;
}> {
  try {
    const res = await fetch(indexUrl, {
      signal: AbortSignal.timeout(TIMEOUTS.INDEX_FETCH_MS),
    });
    if (res.status === 404) {
      return { templates: [], isNotFound: true };
    }
    if (!res.ok) {
      return { templates: [], isNotFound: false };
    }
    const index = (await res.json()) as TemplateIndex;
    return { templates: index.templates, isNotFound: false };
  } catch {
    return { templates: [], isNotFound: false };
  }
}

// Bad: Caller cannot tell why templates is empty
export async function fetchTemplateIndex(url: string): Promise<SpecTemplate[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).templates;
  } catch {
    return []; // 404? Timeout? Auth error? No way to know
  }
}
```

**When to use**: Any function whose empty/error result triggers a **different code path** (not just a fallback). If the caller just falls back to a default, a uniform empty result is fine (like the official marketplace fetch). If the caller switches modes, it needs the distinction.

**Real example**: `fetchTemplateIndex` returning `[]` for all errors caused a registry marketplace to be misclassified as a direct-download source when the network had a transient failure.

---

## Type Guard for Errors

Always use the type guard pattern when accessing error properties:

```typescript
// Correct: Type guard for error.message
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red("Error:"), message);
}

// Incorrect: Assuming error is Error
catch (error) {
  console.error(error.message); // TypeScript error: 'error' is 'unknown'
}
```

---

## Exit Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `0` | Success | Normal completion (implicit) |
| `1` | Error | Any error condition |

```typescript
// Error: exit with code 1
process.exit(1);

// Success: no explicit exit needed, or:
process.exit(0);
```

---

## DO / DON'T

### DO

- Catch errors at the top level (command handlers)
- Use `error instanceof Error ? error.message : error` type guard
- Exit with code 1 on errors for proper scripting
- Use empty catch for truly optional operations
- Show user-friendly messages, not stack traces
- Use `chalk.red()` for error prefixes
- Use `chalk.yellow()` for warnings

### DON'T

- Don't catch errors in utility functions unless you can handle them
- Don't assume `error` is an `Error` type
- Don't log full stack traces to users (unless in debug mode)
- Don't use exit code 0 for error conditions
- Don't swallow errors silently without a comment explaining why

---

## Common Mistakes

### Mistake 1: Not using type guard

```typescript
// Bad: TypeScript error, runtime risk
catch (error) {
  console.error(error.message);
}

// Good: Type guard
catch (error) {
  console.error(error instanceof Error ? error.message : error);
}
```

### Mistake 2: Catching too early

```typescript
// Bad: Error caught and re-thrown, losing context
function readConfig(path: string): Config {
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error("Failed to read config"); // Lost original error
  }
}

// Good: Let it bubble up with original error
function readConfig(path: string): Config {
  return JSON.parse(fs.readFileSync(path, "utf-8")); // Caller handles
}
```

### Mistake 3: Catch-all returning uniform empty result for mode-switching logic

```typescript
// Bad: All errors return [], caller uses length===0 to switch modes
async function fetchIndex(url: string): Promise<Item[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).items;
  } catch {
    return []; // 404 and timeout look identical to caller
  }
}
// Caller: if (items.length === 0) switchToDirectMode();
// Bug: timeout also triggers direct mode!

// Good: Return structured result when caller needs to branch
async function probeIndex(url: string): Promise<{ items: Item[]; isNotFound: boolean }> {
  // ... see Pattern 5 above
}
```

**Symptom**: Mode auto-detection works most of the time but randomly switches to the wrong mode under poor network conditions.

**Prevention**: Ask "does the caller branch on empty vs error?" If yes, return a structured result. If no (just fallback to default), uniform empty is fine.

### Mistake 4: Shortcut path inherits catch-all from downstream function

When a CLI has a "skip probe" shortcut (e.g., `--template` skips the interactive picker), the downstream action function may still call a catch-all internally, silently swallowing the errors that the probe was designed to surface:

```typescript
// Setup: probeRegistryIndex correctly distinguishes 404 from timeout
// But downloadTemplateById still calls findTemplate → fetchTemplateIndex (catch-all)

// Bad: --template path skips probe, hits catch-all downstream
if (options.template) {
  selectedTemplate = options.template; // Skip probe ✓
}
// ... later:
await downloadTemplateById(cwd, selectedTemplate, strategy, undefined, registry);
// Inside: findTemplate() → fetchTemplateIndex() → catch { return [] }
// Timeout becomes "Template not found" → falls back to blank

// Good: Action function uses probe-quality error handling for registry path
if (registry && indexUrl) {
  const probeResult = await probeRegistryIndex(indexUrl);
  if (!probeResult.isNotFound && probeResult.templates.length === 0) {
    return { success: false, message: "Could not reach registry." };
  }
  resolved = probeResult.templates.find((t) => t.id === templateId);
} else {
  resolved = await findTemplate(templateId); // catch-all OK for official source
}
```

**Symptom**: `--registry gh:org/repo/marketplace --template foo` silently falls back to blank templates when network fails, instead of reporting the real error.

**Prevention**: When adding a "skip to action" shortcut, verify the action function's internal error handling matches the quality of the path being skipped. If the skipped path uses `probeRegistryIndex`, the action must too.

### Mistake 5: Silent failure without comment

```typescript
// Bad: Why is this ignored?
try {
  doSomething();
} catch {
}

// Good: Explain why it's safe to ignore
try {
  doSomething();
} catch {
  // Optional operation - safe to ignore if it fails
}
```

---

## Examples

### Complete Command Handler

```typescript
import chalk from "chalk";

program
  .command("init")
  .description("Initialize the project")
  .action(async (options: InitOptions) => {
    try {
      await init(options);
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
```

### Function with Optional Operation

```typescript
async function init(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  // Optional: detect developer name from git
  let developerName = options.user;
  if (!developerName) {
    try {
      developerName = execSync("git config user.name", {
        cwd,
        encoding: "utf-8",
      }).trim();
    } catch {
      // Git not available - will prompt user later
    }
  }

  // Required operation - let errors bubble up
  await createWorkflowStructure(cwd, options);
}
```
