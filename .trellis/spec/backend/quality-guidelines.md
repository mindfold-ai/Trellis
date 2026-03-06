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

## CLI Design Patterns

### Explicit Flags Take Precedence

When a CLI has both explicit flags (`--tool`) and convenience flags (`-y`), explicit flags must always win:

```typescript
// Bad: -y overrides explicit flags
if (options.yes) {
  tools = ["cursor", "claude"]; // Ignores --iflow, --opencode!
} else if (options.cursor || options.iflow) {
  // Build from flags...
}

// Good: Check explicit flags first
const hasExplicitTools = options.cursor || options.iflow || options.opencode;
if (hasExplicitTools) {
  // Build from explicit flags (works with or without -y)
} else if (options.yes) {
  // Default only when no explicit flags
}
```

**Why**: Users specify explicit flags intentionally. The `-y` flag means "skip interactive prompts", not "ignore my other flags".

### Data-Driven Configuration

When handling multiple similar options, use arrays with metadata instead of repeated if-else:

```typescript
// Bad: Repetitive if-else
if (options.cursor) tools.push("cursor");
if (options.claude) tools.push("claude");
if (options.iflow) tools.push("iflow");
// ... repeated logic, easy to miss one

// Good: Data-driven approach
const TOOLS = [
  { key: "cursor", name: "Cursor", defaultChecked: true },
  { key: "claude", name: "Claude Code", defaultChecked: true },
  { key: "iflow", name: "iFlow CLI", defaultChecked: false },
] as const;

// Single source of truth for:
// - Building from flags: TOOLS.filter(t => options[t.key])
// - Interactive choices: TOOLS.map(t => ({ name: t.name, value: t.key }))
// - Default values: TOOLS.filter(t => t.defaultChecked)
```

**Benefits**:
- Adding a new tool = adding one line to TOOLS array
- Display name, flag key, and default are co-located
- Less code duplication, fewer bugs

### Auto-Detect Modes Must Probe in ALL Code Paths

When a CLI auto-detects mode (e.g., marketplace vs direct download) by probing a resource, the probe must run in **every** code path that uses the result — including `-y` (non-interactive) mode:

```typescript
// Bad: Probe only runs in interactive mode
let templates: Item[] = [];
if (!options.yes) {
  templates = await fetchIndex(url); // Only interactive probes
}
// -y mode: templates stays [], falls through to direct mode
// Bug: marketplace registries silently downloaded as raw directory

// Good: Probe in all paths that need the result
if (options.template) {
  selectedTemplate = options.template; // Explicit: no probe needed
} else if (!options.yes) {
  // Interactive: probe + show picker
  const result = await probeIndex(url);
  // ...
} else if (registry) {
  // -y mode with registry: still need to probe
  const result = await probeIndex(url);
  if (result.templates.length > 0) {
    // Marketplace requires selection — can't auto-select in -y mode
    console.error("Use --template to specify which template");
    return;
  }
}
```

**Why**: The `-y` flag means "skip interactive prompts", not "skip network operations". If a mode decision depends on a remote resource, the probe must happen regardless of interactivity.

### Don't Drop Fields When Reconstructing Composite Identifiers

When a structured object is parsed into parts and later reassembled, include **all** parsed fields:

```typescript
// Bad: ref is parsed but dropped when rebuilding
const registry = parseSource("gh:org/repo/path#develop");
// registry = { provider: "gh", repo: "org/repo", ref: "develop", ... }
const repoSource = `${registry.provider}:${registry.repo}`;
// Result: "gh:org/repo" — ref "develop" is lost, defaults to "main"

// Good: Include all relevant fields
const repoSource = `${registry.provider}:${registry.repo}#${registry.ref}`;
// Result: "gh:org/repo#develop"
```

**Prevention**: When building a string from a parsed object, review the object's fields and verify each one is either included or explicitly irrelevant.

### Don't: "Warn and Continue" for Mode-Detection Logic

When code decides which mode to run based on a probe result, a warning + continue is functionally equivalent to no fix at all:

```typescript
// Bad: Warning prints but code still falls through to wrong mode
if (!probeResult.isNotFound) {
  console.log(chalk.yellow("Warning: network issue, attempting direct download"));
}
// Falls through → downloads marketplace root as spec directory

// Good: Abort or loop back — never silently switch modes
if (!probeResult.isNotFound) {
  console.log(chalk.red("Could not reach registry. Check connection and retry."));
  return; // or: continue (loop back to picker)
}
```

**Why**: "Warn and continue" is appropriate for **degraded functionality** (missing optional data). It is **not** appropriate for **mode decisions** — the wrong mode causes data corruption, not just degraded UX.

### Convention: Reset Shared State on Branch Switch

When user input or control flow changes context (e.g., switching from official marketplace to a custom source), reset any shared state that was populated by the previous context:

```typescript
// Bad: fetchedTemplates still has official marketplace results
registry = parseRegistrySource(customSource);
// fetchedTemplates.length > 0 → direct-download guard never fires!

// Good: Reset before entering new context
registry = parseRegistrySource(customSource);
fetchedTemplates = []; // Clear stale data from previous source
```

**Why**: Shared mutable state across branches is a silent bug factory. The later guard (`registry && fetchedTemplates.length === 0`) depends on `fetchedTemplates` reflecting the *current* source, not a previous one.

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
