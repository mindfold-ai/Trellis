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

### Mistake 3: Silent failure without comment

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
