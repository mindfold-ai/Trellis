# Directory Structure

> How backend/CLI code is organized in this project.

---

## Overview

This project is a **TypeScript CLI tool** using ES modules. The source code follows a modular architecture where each directory has a clear, single responsibility.

---

## Directory Layout

```
src/
├── cli/                 # CLI entry point and argument parsing
│   └── index.ts         # Main CLI entry (Commander.js setup)
├── commands/            # Command implementations
│   └── init.ts          # Each command in its own file
├── configurators/       # Configuration generators
│   ├── claude.ts        # Claude-specific configuration
│   ├── cursor.ts        # Cursor-specific configuration
│   ├── opencode.ts      # OpenCode-specific configuration
│   ├── templates.ts     # Shared template utilities
│   └── workflow.ts      # Workflow structure creation
├── constants/           # Shared constants and paths
│   └── paths.ts         # Path constants (centralized)
├── templates/           # Template files and loaders
│   ├── agents/          # Agent configuration templates
│   │   ├── index.ts     # Exports all agent templates
│   │   └── metadata.ts  # Agent metadata definitions
│   ├── commands/        # Command templates by tool
│   │   ├── common/      # Shared across all tools
│   │   ├── claude/      # Claude-specific commands
│   │   ├── cursor/      # Cursor-specific commands
│   │   ├── opencode/    # OpenCode-specific commands
│   │   └── index.ts     # Template registry and exports
│   ├── hooks/           # Hook configuration templates
│   │   └── index.ts     # Exports all hook templates
│   ├── markdown/        # Markdown template files
│   │   └── index.ts     # Exports all markdown templates
│   ├── scripts/         # Shell script templates
│   │   ├── common/      # Shared utilities (*.sh.txt)
│   │   ├── multi-agent/ # Multi-agent scripts
│   │   └── index.ts     # Exports all script templates
│   └── extract.ts       # Template file reading utilities
├── types/               # TypeScript type definitions
│   └── ai-tools.ts      # AI tool types and registry
├── utils/               # Shared utility functions
│   ├── file-writer.ts   # File writing with conflict handling
│   └── project-detector.ts # Project type detection
└── index.ts             # Package entry point (exports public API)
```

---

## Module Organization

### Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Package entry point, exports public API |
| `src/cli/index.ts` | CLI entry point, parsed by Commander.js |

### Layer Responsibilities

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| CLI | `cli/` | Parse arguments, display help, call commands |
| Commands | `commands/` | Implement CLI commands, orchestrate actions |
| Configurators | `configurators/` | Generate configuration files for various tools |
| Templates | `templates/` | Store and load template content |
| Types | `types/` | TypeScript type definitions |
| Utils | `utils/` | Reusable utility functions |
| Constants | `constants/` | Shared constants (paths, names) |

### Template Organization

Templates are stored as `.txt` files and loaded via index files:

```
templates/scripts/
├── common/
│   ├── paths.sh.txt       # Template file
│   └── developer.sh.txt   # Template file
└── index.ts               # Exports: export const commonPathsScript = readScript("common/paths.sh.txt")
```

---

## Naming Conventions

### Files and Directories

| Convention | Example | Usage |
|------------|---------|-------|
| `kebab-case` | `file-writer.ts` | All TypeScript files |
| `kebab-case` | `multi-agent/` | All directories |
| `*.ts` | `init.ts` | TypeScript source files |
| `*.txt` | `paths.sh.txt` | Template files (to avoid execution) |

### Index Files

Each directory with multiple exports should have an `index.ts`:

```typescript
// templates/scripts/index.ts
export const commonPathsScript: string = readScript("common/paths.sh.txt");
export const initDeveloperScript: string = readScript("init-developer.sh.txt");
```

### Type Files

Type definitions go in the `types/` directory:

```typescript
// types/ai-tools.ts
export type AITool = "claude-code" | "cursor" | "opencode";
export interface AIToolConfig { /* ... */ }
```

---

## DO / DON'T

### DO

- Use `kebab-case` for all file and directory names
- Create an `index.ts` for directories with multiple exports
- Put type definitions in `types/` directory
- Store template content in `.txt` files
- Use descriptive, specific file names (`file-writer.ts` not `utils.ts`)

### DON'T

- Don't use `camelCase` or `PascalCase` for file names
- Don't put multiple unrelated utilities in a single file
- Don't import from deep paths when an index export exists
- Don't store executable scripts in `src/` (use `.txt` templates)

---

## Examples

### Good: Specific, focused files

```
src/utils/
├── file-writer.ts       # File writing utilities
└── project-detector.ts  # Project type detection
```

### Bad: Catch-all files

```
src/utils/
└── helpers.ts           # Don't: vague, catch-all name
```

### Good: Template organization with index

```typescript
// templates/commands/index.ts
import { readFileSync } from "fs";

function readCommand(subdir: string, filename: string): string {
  const filePath = join(__dirname, subdir, filename);
  return readFileSync(filePath, "utf-8");
}

export const claudeStartTemplate: string = readCommand("claude", "start.md.txt");
export const cursorStartTemplate: string = readCommand("cursor", "start.md.txt");
```

### Good: Centralized path constants

```typescript
// constants/paths.ts
export const DIR_NAMES = {
  WORKFLOW: ".trellis",
  PROGRESS: "agent-traces",
  STRUCTURE: "structure",
} as const;

export const PATHS = {
  WORKFLOW: DIR_NAMES.WORKFLOW,
  PROGRESS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.PROGRESS}`,
} as const;
```
