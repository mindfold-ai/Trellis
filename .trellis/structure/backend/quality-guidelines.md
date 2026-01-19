# Quality Guidelines

> Code quality standards for backend/CLI development.

---

## Overview

This project enforces strict TypeScript and ESLint rules to maintain code quality. The configuration prioritizes type safety, explicit declarations, and modern JavaScript patterns.

---

## TypeScript Configuration

### Strict Mode

The project uses `strict: true` in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

This enables:
- `strictNullChecks` - Null and undefined must be explicitly handled
- `strictFunctionTypes` - Function parameter types are checked strictly
- `strictPropertyInitialization` - Class properties must be initialized
- `noImplicitAny` - All types must be explicit
- `noImplicitThis` - `this` must have explicit type

---

## ESLint Rules

### Forbidden Patterns

| Rule | Setting | Reason |
|------|---------|--------|
| `@typescript-eslint/no-explicit-any` | `error` | Forces proper typing |
| `@typescript-eslint/no-non-null-assertion` | `error` | Prevents runtime null errors |
| `no-var` | `error` | Use `const` or `let` instead |

### Required Patterns

| Rule | Setting | Description |
|------|---------|-------------|
| `@typescript-eslint/explicit-function-return-type` | `error` | All functions must declare return type |
| `@typescript-eslint/prefer-nullish-coalescing` | `error` | Use `??` instead of `\|\|` for defaults |
| `@typescript-eslint/prefer-optional-chain` | `error` | Use `?.` for optional access |
| `prefer-const` | `error` | Use `const` when variable is not reassigned |

### Exceptions

```javascript
// eslint.config.js
rules: {
  "@typescript-eslint/explicit-function-return-type": [
    "error",
    {
      allowExpressions: true,          // Arrow functions in callbacks OK
      allowTypedFunctionExpressions: true,  // Typed function expressions OK
    },
  ],
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",   // Prefix unused params with _
      varsIgnorePattern: "^_",   // Prefix unused vars with _
    },
  ],
}
```

---

## Code Patterns

### Return Type Declarations

All functions must have explicit return types:

```typescript
// Good: Explicit return type
function detectProjectType(cwd: string): ProjectType {
  // ...
}

async function init(options: InitOptions): Promise<void> {
  // ...
}

// Bad: Missing return type (ESLint error)
function detectProjectType(cwd: string) {
  // ...
}
```

### Nullish Coalescing

Use `??` for default values, not `||`:

```typescript
// Good: Nullish coalescing
const name = options.name ?? "default";
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const depNames = Object.keys(allDeps ?? {});

// Bad: Logical OR (treats empty string, 0 as falsy)
const name = options.name || "default";
```

### Optional Chaining

Use `?.` for optional property access:

```typescript
// Good: Optional chaining
const version = config?.version;
const deps = pkg?.dependencies?.["react"];

// Bad: Manual checks
const version = config && config.version;
```

### Const Declarations

Use `const` by default, `let` only when reassignment is needed:

```typescript
// Good: const for non-reassigned
const cwd = process.cwd();
const options: InitOptions = { force: true };

// Good: let for reassigned
let developerName = options.user;
if (!developerName) {
  developerName = detectFromGit();
}

// Bad: let for non-reassigned
let cwd = process.cwd();  // ESLint error: prefer-const
```

### Unused Variables

Prefix unused parameters with underscore:

```typescript
// Good: Prefixed with underscore
function handler(_req: Request, res: Response): void {
  res.send("OK");
}

// Bad: Unused without prefix (ESLint error)
function handler(req: Request, res: Response): void {
  res.send("OK");
}
```

---

## Interface and Type Patterns

### Interface Definitions

Define interfaces for structured data:

```typescript
// Good: Interface for options
interface InitOptions {
  cursor?: boolean;
  claude?: boolean;
  yes?: boolean;
  user?: string;
  force?: boolean;
}

// Good: Interface for return types
interface WriteOptions {
  mode: WriteMode;
}
```

### Type Aliases

Use type aliases for unions and computed types:

```typescript
// Good: Type alias for union
export type AITool = "claude-code" | "cursor" | "opencode";
export type WriteMode = "ask" | "force" | "skip" | "append";
export type ProjectType = "frontend" | "backend" | "fullstack" | "unknown";

// Good: Type alias with const assertion
export const DIR_NAMES = {
  WORKFLOW: ".trellis",
  PROGRESS: "agent-traces",
} as const;
```

### Export Patterns

Export types explicitly:

```typescript
// Good: Explicit type export
export type { WriteMode, WriteOptions };
export { writeFile, ensureDir };

// Good: Combined export
export type WriteMode = "ask" | "force" | "skip" | "append";
export function writeFile(path: string, content: string): Promise<boolean> {
  // ...
}
```

---

## Forbidden Patterns

### Never Use `any`

```typescript
// Bad: Explicit any
function process(data: any): void { }

// Good: Proper typing
function process(data: Record<string, unknown>): void { }
function process<T>(data: T): void { }
```

### Never Use Non-Null Assertion

```typescript
// Bad: Non-null assertion
const name = user!.name;

// Good: Proper null check
const name = user?.name ?? "default";
if (user) {
  const name = user.name;
}
```

### Never Use `var`

```typescript
// Bad: var declaration
var count = 0;

// Good: const or let
const count = 0;
let mutableCount = 0;
```

---

## Quality Checklist

Before committing, ensure:

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm typecheck` passes with no errors
- [ ] All functions have explicit return types
- [ ] No `any` types in code
- [ ] No non-null assertions (`x!` operator)
- [ ] Using `??` instead of `||` for defaults
- [ ] Using `?.` for optional property access
- [ ] Using `const` by default, `let` only when needed
- [ ] Unused variables prefixed with `_`

---

## Running Quality Checks

```bash
# Run ESLint
pnpm lint

# Run TypeScript type checking
pnpm typecheck

# Run both
pnpm lint && pnpm typecheck
```

---

## DO / DON'T

### DO

- Declare explicit return types on all functions
- Use `const` by default
- Use `??` for default values
- Use `?.` for optional access
- Define interfaces for structured data
- Prefix unused parameters with `_`

### DON'T

- Don't use `any` type
- Don't use non-null assertion (`x!` operator)
- Don't use `var`
- Don't use `||` for default values (use `??`)
- Don't leave implicit return types
- Don't ignore ESLint or TypeScript errors
