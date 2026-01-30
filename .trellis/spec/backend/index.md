# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization, core/ structure, dogfooding | Done |
| [Shell Conventions](./shell-conventions.md) | Multi-agent pipeline scripts only | Done |
| [Error Handling](./error-handling.md) | Error types, handling strategies | Done |
| [Quality Guidelines](./quality-guidelines.md) | TypeScript, Zod, execa, commands, file formats, paths | Done |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | Done |
| [Migrations](./migrations.md) | Version migration system for template files | Done |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations | N/A (CLI project) |

---

## Key Patterns (Quick Reference)

### Zod Runtime Validation
```typescript
// Schema-first types
const TaskSchema = z.object({ ... });
type Task = z.infer<typeof TaskSchema>;

// Safe parsing for external data
const result = TaskSchema.safeParse(JSON.parse(content));
if (result.success) { /* use result.data */ }
```

### Git Operations with execa
```typescript
import { execa } from "execa";
const { stdout } = await execa("git", ["status", "--porcelain"], { cwd });
```

### Platform Adapter Pattern
```typescript
const adapter = getPlatformAdapter();
if (adapter.supportsMultiAgent()) {
  await adapter.launchAgent({ agentType: "dispatch", ... });
}
```

### Core Module Structure
```
src/core/
├── task/       # Task CRUD, context, schemas
├── git/        # Git operations, worktree
├── developer/  # Developer identity
├── session/    # Journal, workspace
└── platforms/  # Multi-platform adapters
```

### Nullable Return Pattern
```typescript
// Return null for "not found" scenarios
function readTask(taskDir: string): Task | null {
  if (!fs.existsSync(taskJsonPath)) return null;
  // ...
}
```

### Command Output Pattern
```typescript
// Data on stdout (for piping)
console.log(taskPath);
// Messages on stderr (for user)
console.error(chalk.green("Created task"));
// JSON mode
if (options.json) console.log(JSON.stringify(result));
```

### Worktree Data Sync (Critical!)
```typescript
// Write to BOTH locations
updateTask(worktreeTaskDir, updates);
updateTask(mainRepoTaskDir, updates);

// Read from WORKTREE for agent data
const task = readTask(path.join(agent.worktree_path, agent.task_dir));
```
See [Quality Guidelines](./quality-guidelines.md#worktree-data-synchronization-pattern) for details.

### Claude Code Integration
```typescript
// Agent name only (not full path)
claude --agent dispatch  // ✓
claude --agent .claude/agents/dispatch.md  // ✗

// Per-developer registry
.trellis/workspace/{developer}/.agents/registry.json
```
See [Quality Guidelines](./quality-guidelines.md#claude-code-integration-patterns) for details.

### Path Management
```typescript
// Always use centralized path functions
import { getTasksDir, getRepoRoot } from "./core/paths.js";
const tasksDir = getTasksDir(repoRoot);
```

### File Formats
| Format | Extension | Usage |
|--------|-----------|-------|
| JSON | `.json` | Task metadata, config |
| JSONL | `.jsonl` | Context entries (one object per line) |
| YAML | `.yaml` | Worktree config |
| Key-Value | `.developer` | Developer identity |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
