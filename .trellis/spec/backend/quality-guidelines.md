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

## Zod Runtime Validation

### Schema-First Types

Use Zod schemas as the single source of truth for types:

```typescript
// Good: Type inferred from schema
import { z } from "zod";

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["planning", "in_progress", "completed"]),
  assignee: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export type Task = z.infer<typeof TaskSchema>;

// Bad: Separate type definition that can drift from validation
interface Task {
  id: string;
  name: string;
  // ... might not match what you actually validate
}
```

### Safe Parsing Pattern

Use `safeParse` for external data, let TypeScript infer the return type:

```typescript
// Good: Let TypeScript infer safeParse return type
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function safeParseTask(content: unknown) {
  return TaskSchema.safeParse(content);
}

// Usage
const result = safeParseTask(JSON.parse(fileContent));
if (result.success) {
  const task: Task = result.data;  // Type-safe
} else {
  console.warn(`Invalid: ${result.error.message}`);
}
```

> **Gotcha**: In Zod v4, `z.SafeParseReturnType` is not exported. Don't try to explicitly type the return - let TypeScript infer it.

### Template-Schema Consistency

When bash scripts or templates generate JSON, they MUST match the Zod schema:

```bash
# Bad: Missing required fields (will fail Zod validation)
cat > task.json << EOF
{
  "id": "$ID",
  "name": "$NAME"
}
EOF

# Good: All schema-required fields included
cat > task.json << EOF
{
  "id": "$ID",
  "name": "$NAME",
  "title": "$TITLE",
  "status": "planning",
  "assignee": "$ASSIGNEE",
  "createdAt": "$TODAY",
  "completedAt": null
}
EOF
```

> **Common Mistake**: Adding Zod validation to existing code without updating all JSON-generating scripts (bash, templates). This causes runtime validation errors.

---

## Git Operations with execa

### Why execa over child_process

Use `execa` for executing external commands (especially git):

```typescript
// Good: execa with proper types and error handling
import { execa } from "execa";

export async function getCurrentBranch(cwd?: string): Promise<string> {
  const { stdout } = await execa("git", ["branch", "--show-current"], {
    cwd: cwd ?? getRepoRoot(),
  });
  return stdout.trim();
}

// Bad: child_process.execSync with string command
import { execSync } from "child_process";
const branch = execSync("git branch --show-current").toString().trim();
```

**Why execa**:
- Promise-based API
- Better error messages with `stderr` included
- Proper argument escaping (no shell injection)
- TypeScript types included
- Industry standard (used by Shadcn/ui, etc.)

### Sync vs Async

Use async by default, sync only for CLI initialization:

```typescript
// Async (preferred): For most operations
export async function getGitStatusAsync(cwd?: string): Promise<GitStatus> {
  const { stdout } = await execa("git", ["status", "--porcelain"], { cwd });
  return parseGitStatus(stdout);
}

// Sync: Only for synchronous CLI flows (e.g., before async context is available)
export function getGitStatusSync(cwd?: string): GitStatus {
  const result = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
  return parseGitStatus(result);
}
```

### Error Handling

```typescript
export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--verify", branch], { cwd });
    return true;
  } catch {
    return false;  // Branch doesn't exist
  }
}
```

---

## Platform Adapter Pattern

### When to Use

Use the adapter pattern when code needs to support multiple platforms (Claude Code, OpenCode, Cursor, etc.):

```typescript
// core/platforms/types.ts
export type Platform = "claude" | "opencode" | "cursor" | "codex";

export interface PlatformAdapter {
  readonly platform: Platform;

  // Feature-specific methods
  generateContextFiles(taskDir: string, devType: DevType): void;
  getConfigDir(): string;  // ".claude" or ".opencode"

  // Capability detection
  supportsMultiAgent(): boolean;
  supportsHooks(): boolean;

  // Platform-specific operations
  launchAgent(options: LaunchAgentOptions): Promise<AgentProcess>;
}
```

### Implementation

```typescript
// core/platforms/claude/index.ts
export const claudeAdapter: PlatformAdapter = {
  platform: "claude",

  generateContextFiles(taskDir, devType) {
    // Claude-specific context generation
  },

  getConfigDir() {
    return ".claude";
  },

  supportsMultiAgent() {
    return true;  // Claude Code supports multi-agent
  },

  supportsHooks() {
    return true;
  },

  async launchAgent(options) {
    // Launch claude --agent
  },
};
```

### Detection and Usage

```typescript
// core/platforms/index.ts
export function detectPlatform(repoRoot?: string): Platform {
  const root = repoRoot ?? getRepoRoot();
  if (fs.existsSync(path.join(root, ".claude"))) return "claude";
  if (fs.existsSync(path.join(root, ".opencode"))) return "opencode";
  // ... etc
  return "claude";  // Default
}

export function getPlatformAdapter(repoRoot?: string): PlatformAdapter {
  const platform = detectPlatform(repoRoot);
  switch (platform) {
    case "claude": return claudeAdapter;
    // case "opencode": return opencodeAdapter;
    default: return claudeAdapter;
  }
}
```

### Capability-Based Feature Flags

```typescript
// Usage in commands
const adapter = getPlatformAdapter();

if (!adapter.supportsMultiAgent()) {
  console.error(`${adapter.platform} does not support multi-agent pipeline`);
  console.error("Use manual workflow instead.");
  process.exit(1);
}

await adapter.launchAgent({ agentType: "dispatch", ... });
```

---

## Claude Code Integration Patterns

### Agent File Naming

Claude Code's `--agent` flag accepts just the agent name, not the full path:

```bash
# Good: Just the agent name
claude --agent dispatch

# Bad: Full path (not needed)
claude --agent .claude/agents/dispatch.md
```

The agent file should exist at `.claude/agents/<name>.md`.

### Per-Developer Registry

Agent registry is stored per-developer to avoid conflicts in multi-developer scenarios:

```
.trellis/workspace/{developer}/.agents/
├── registry.json    # Agent registry (id, pid, worktree_path, etc.)
└── current-task     # Current task for this developer
```

**Why per-developer?**
- Multiple developers can run pipelines simultaneously
- Each developer's agents don't interfere with others
- Registry is gitignored (not committed)

### Background Process Management

When launching agents in background mode:

```typescript
// 1. Create runner script (for claude --print compatibility)
const runnerScript = createRunnerScript({
  workDir,
  agentType,
  prompt,
  logFile,
});

// 2. Spawn detached process
const subprocess = spawn("bash", [runnerScript], {
  detached: true,
  stdio: ["ignore", logFd, logFd],
  cwd: workDir,
});

// 3. Unref to allow parent to exit
subprocess.unref();

// 4. Store session ID for resume capability
fs.writeFileSync(sessionIdFile, sessionId);
```

**Key Points:**
- Use `detached: true` for background processes
- Redirect stdio to log file
- Call `unref()` so parent can exit
- Store session ID for `claude --resume`

### Session Resume Pattern

Store session ID to enable resuming interrupted agents:

```typescript
// Save session ID when starting
const sessionId = randomUUID();
fs.writeFileSync(path.join(workDir, ".session-id"), sessionId);

// Read for resume command
export function getSessionId(workDir: string): string | null {
  const sessionIdFile = path.join(workDir, ".session-id");
  if (!fs.existsSync(sessionIdFile)) return null;
  return fs.readFileSync(sessionIdFile, "utf-8").trim();
}

// Generate resume command
export function getResumeCommand(workDir: string, sessionId: string): string {
  return `cd ${workDir} && claude --resume ${sessionId}`;
}
```

---

## Large File Refactoring

### When to Split

Split a file when:
- It exceeds ~500 lines
- It has distinct responsibilities that could be independent
- Tests would be cleaner with separation
- Multiple unrelated imports are needed

### How to Split

**Before** (monolithic):
```
src/core/task.ts (629 lines)
├── Task type definitions
├── Task CRUD operations
├── Context file generation
└── Platform-specific logic
```

**After** (domain-driven):
```
src/core/task/
├── index.ts       # Re-exports everything
├── schemas.ts     # Zod schemas + types
├── crud.ts        # CRUD operations
└── context.ts     # Context file management

src/core/platforms/
├── index.ts       # Platform detection
├── types.ts       # PlatformAdapter interface
└── claude/
    ├── index.ts   # Claude adapter
    └── context.ts # Claude-specific context
```

### Export Pattern for Split Modules

Each submodule has an `index.ts` that exports everything:

```typescript
// core/task/index.ts
export * from "./schemas.js";
export * from "./crud.js";
export * from "./context.js";
```

Root index re-exports for backward compatibility:

```typescript
// core/index.ts
export * from "./task/index.js";
export * from "./platforms/index.js";
// ...
```

**Why**: Consumers can import from `core/index.js` or directly from `core/task/index.js`.

---

## Nullable Return Pattern

### When to Return Null vs Throw

Use nullable return types for "not found" scenarios:

```typescript
// Good: Return null when item may not exist
export function readTask(taskDir: string): Task | null {
  const taskJsonPath = path.join(taskDir, "task.json");
  if (!fs.existsSync(taskJsonPath)) {
    return null;  // Not found is a valid state
  }
  // ... read and validate
}

// Good: Return null for optional lookups
export function findTask(nameOrSlug: string): { task: Task; dir: string } | null {
  // Search logic...
  return match ?? null;
}

// Bad: Throwing for not found (unless truly exceptional)
export function getTask(taskDir: string): Task {
  if (!fs.existsSync(taskJsonPath)) {
    throw new Error("Task not found");  // Too aggressive
  }
}
```

**When to throw**:
- Invalid arguments (programming error)
- Corrupted data that can't be recovered
- Required initialization missing

**When to return null**:
- Item doesn't exist (but could)
- Optional data not configured
- Search with no results

---

## Path Management

### Centralized Path Functions

All paths are managed through `core/paths.ts`:

```typescript
// Good: Use path functions
import { getTasksDir, getTaskDir, getRepoRoot } from "./core/paths.js";

const tasksDir = getTasksDir(repoRoot);
const taskDir = getTaskDir("01-30-my-task", repoRoot);

// Bad: Construct paths manually
const tasksDir = path.join(repoRoot, ".trellis", "tasks");
```

### Path Function Signature Pattern

All path functions accept optional `repoRoot` parameter:

```typescript
export function getTasksDir(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return path.join(root, DIR_NAMES.WORKFLOW, DIR_NAMES.TASKS);
}
```

### Store Relative, Display Relative

```typescript
// Store paths relative to repo root
const relativePath = `.trellis/tasks/${dirName}`;

// Convert to absolute only when needed for fs operations
const absolutePath = path.join(repoRoot, relativePath);
```

---

## Command Implementation Pattern

### Command Structure

Each CLI command follows this structure:

```typescript
export async function taskCreate(
  title: string,
  options: TaskCreateOptions,
): Promise<void> {
  // 1. Get repo root
  const repoRoot = getRepoRoot();

  // 2. Validate initialization
  if (!isTrellisInitialized(repoRoot)) {
    console.error(chalk.red("Error: Trellis not initialized. Run: trellis init"));
    process.exit(1);
  }

  // 3. Validate required inputs
  if (!title) {
    console.error(chalk.red("Error: Title is required"));
    process.exit(1);
  }

  // 4. Call core function
  const taskPath = createTask(title, options, repoRoot);

  // 5. Format output
  if (options.json) {
    console.log(JSON.stringify({ path: taskPath }));
  } else {
    console.log(taskPath);  // stdout for scripting
    console.error(chalk.green(`Created task: ${taskPath}`));  // stderr for UI
  }
}
```

### Output Conventions

| Stream | Usage | Example |
|--------|-------|---------|
| `stdout` | Data for scripting/piping | Task path, JSON output |
| `stderr` | User messages, errors | Success messages, errors |

```typescript
// Data on stdout (can be piped)
console.log(taskPath);

// Messages on stderr (visible to user but not piped)
console.error(chalk.green("Task created successfully"));

// JSON mode outputs only to stdout
if (options.json) {
  console.log(JSON.stringify(result));
  return;  // No stderr messages in JSON mode
}
```

### --json Flag Pattern

All list/read commands support `--json` flag:

```typescript
interface ListOptions {
  json?: boolean;
  // other options...
}

export async function taskList(options: ListOptions): Promise<void> {
  const tasks = listTasks(options);

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  // Human-readable format
  for (const task of tasks) {
    console.log(`${task.name} - ${task.status}`);
  }
}
```

---

## File Format Specifications

### JSON Files

- 2-space indentation
- Trailing newline
- Used for: `task.json`, `package.json`

```typescript
fs.writeFileSync(
  filePath,
  JSON.stringify(data, null, 2) + "\n",
  "utf-8"
);
```

### JSONL Files (JSON Lines)

- One JSON object per line
- No trailing comma
- Used for: `implement.jsonl`, `check.jsonl`, `debug.jsonl`

```typescript
// Reading JSONL
const entries = content
  .split("\n")
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

// Writing JSONL
const jsonl = entries
  .map(entry => JSON.stringify(entry))
  .join("\n") + "\n";
```

### YAML Files

- Comments above configuration values
- Used for: `worktree.yaml`

```yaml
# Base directory for worktrees (relative to repo root)
base_dir: "../worktrees"

# Files to copy from main repo to worktree
copy_files:
  - ".env"
  - ".env.local"
```

### Developer File Format

Key-value pairs (not JSON):

```
name=developer-name
initialized_at=2026-01-30T10:00:00Z
```

```typescript
// Reading
const match = content.match(/^name=(.+)$/m);
const name = match?.[1];

// Writing
const content = `name=${name}\ninitialized_at=${new Date().toISOString()}\n`;
```

---

## Import Conventions

### Node.js Built-ins

Use `node:` prefix:

```typescript
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
```

### ESM Extensions

Always use `.js` extension in imports (even for `.ts` files):

```typescript
// Good
import { Task } from "./schemas.js";
import { getRepoRoot } from "../paths.js";

// Bad (won't work in ESM)
import { Task } from "./schemas";
```

### Re-export Pattern

Each module directory has an `index.ts`:

```typescript
// core/task/index.ts
export * from "./schemas.js";
export * from "./crud.js";
export * from "./context.js";
```

---

## Worktree Data Synchronization Pattern

### Problem

When using git worktrees for multi-agent pipeline, `task.json` exists in two locations:
1. **Main repo**: `.trellis/tasks/<task-dir>/task.json`
2. **Worktree**: `<worktree-path>/.trellis/tasks/<task-dir>/task.json`

These can get out of sync, causing stale data issues.

### Rule 1: Write to Both Locations

When updating task state, ALWAYS update both copies:

```typescript
// Good: Update both main repo and worktree
const taskUpdates = {
  status: "completed" as const,
  pr_url: prUrl,
  current_phase: createPrPhase,
};

// Update worktree copy
updateTask(worktreeTaskDir, taskUpdates);

// Also update main repo copy
if (taskDirRel && workDir !== repoRoot) {
  const mainRepoTaskDir = path.join(repoRoot, taskDirRel);
  if (fs.existsSync(mainRepoTaskDir)) {
    updateTask(mainRepoTaskDir, taskUpdates);
  }
}

// Bad: Only update one location
updateTask(taskDir, { status: "completed" });  // Which one? Main or worktree?
```

### Rule 2: Read from Worktree for Agent Context

When reading data about a running agent, read from the worktree (where the agent is working):

```typescript
// Good: Read from worktree where agent is actually working
const taskDirAbs = path.join(agent.worktree_path, agent.task_dir);
const task = readTask(taskDirAbs);
const phaseInfo = getPhaseInfo(taskDirAbs);

// Bad: Read from main repo (stale data)
const taskDirAbs = path.join(repoRoot, agent.task_dir);
const task = readTask(taskDirAbs);  // May have old status
```

### Rule 3: Preserve Existing Values

When preparing worktrees, don't overwrite values that are already set:

```typescript
// Good: Preserve existing base_branch if already set
const existingTask = readTask(taskDirAbs);
const updates: { worktree_path: string; base_branch?: string } = {
  worktree_path: worktreePath,
};

if (!existingTask?.base_branch) {
  updates.base_branch = await getCurrentBranchAsync(root);
}

updateTask(taskDirAbs, updates);

// Bad: Always overwrite (loses intentionally set values)
updateTask(taskDirAbs, {
  worktree_path: worktreePath,
  base_branch: await getCurrentBranchAsync(root),  // Overwrites even if already set!
});
```

### Common Mistake: Forgetting to Sync on Worktree Reuse

When reusing an existing worktree, you must still update task state:

```typescript
if (!worktreePath) {
  // New worktree - update both locations ✓
  const worktreeResult = await createPipelineWorktree({ ... });
  updateTask(taskDirAbs, taskUpdates);
  updateTask(worktreeTaskDir, taskUpdates);
} else {
  // Reusing worktree - DON'T FORGET to update! ✓
  await prepareWorktreeForTask(worktreePath, taskDirRel, repoRoot);

  // Must still sync task state
  updateTask(taskDirAbs, taskUpdates);
  updateTask(worktreeTaskDir, taskUpdates);
}
```

> **Gotcha**: `prepareWorktreeForTask()` only syncs `worktree_path` and `base_branch`. It does NOT update `status` to `in_progress`. You must do that explicitly.

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
