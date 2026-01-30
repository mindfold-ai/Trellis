# Directory Structure

> How backend/CLI code is organized in this project.

---

## Overview

This project is a **TypeScript CLI tool** using ES modules. The source code follows a **dogfooding architecture** - Trellis uses its own configuration files (`.cursor/`, `.claude/`, `.trellis/`) as templates for new projects.

---

## Directory Layout

```
src/
├── cli/                 # CLI entry point and argument parsing
│   └── index.ts         # Main CLI entry (Commander.js setup)
├── commands/            # Command implementations
│   ├── init.ts          # Each command in its own file
│   ├── task/            # Task commands (create, list, show, etc.)
│   ├── session.ts       # Session commands
│   └── pipeline/        # Multi-agent pipeline commands
│       ├── index.ts     # Re-exports all pipeline commands
│       ├── plan.ts      # trellis pipeline plan
│       ├── start.ts     # trellis pipeline start
│       ├── status.ts    # trellis pipeline status
│       ├── cleanup.ts   # trellis pipeline cleanup
│       └── create-pr.ts # trellis pipeline create-pr
├── configurators/       # Configuration generators
│   ├── claude.ts        # Copies .claude/ directory
│   ├── cursor.ts        # Copies .cursor/ directory
│   ├── opencode.ts      # OpenCode configuration (TODO)
│   └── workflow.ts      # Creates .trellis/ structure
├── constants/           # Shared constants and paths
│   └── paths.ts         # Path constants (centralized)
├── templates/           # Template utilities and generic templates
│   ├── markdown/        # Generic markdown templates
│   │   ├── spec/        # Spec templates (*.md.txt)
│   │   ├── init-agent.md    # Project root file template
│   │   ├── agents.md        # Project root file template
│   │   ├── worktree.yaml.txt # Generic worktree config
│   │   └── index.ts     # Template exports
│   └── extract.ts       # Template extraction utilities
├── types/               # TypeScript type definitions
│   └── ai-tools.ts      # AI tool types and registry
├── utils/               # Shared utility functions
│   ├── file-writer.ts   # File writing with conflict handling
│   └── project-detector.ts # Project type detection
└── index.ts             # Package entry point (exports public API)
```

### Dogfooding Directories (Project Root)

These directories are copied to `dist/` during build and used as templates:

```
.cursor/                 # Cursor configuration (dogfooded)
├── commands/            # Slash commands for Cursor
│   ├── start.md
│   ├── finish-work.md
│   └── ...

.claude/                 # Claude Code configuration (dogfooded)
├── commands/            # Slash commands
├── agents/              # Multi-agent pipeline agents
├── hooks/               # Context injection hooks
└── settings.json        # Hook configuration

.trellis/                # Trellis workflow (partially dogfooded)
├── scripts/             # Shell scripts (mostly migrated to CLI)
│   ├── _archive/        # Archived scripts (replaced by CLI)
│   ├── common/          # Shared utilities (still in use)
│   └── *.sh             # Legacy scripts
├── workspace/           # Developer progress tracking
│   └── index.md         # Index template (dogfooded)
├── spec/                # Project guidelines (NOT dogfooded)
│   ├── backend/         # Backend development docs
│   ├── frontend/        # Frontend development docs
│   └── guides/          # Thinking guides
├── workflow.md          # Workflow documentation (dogfooded)
├── worktree.yaml        # Worktree config (Trellis-specific)
└── .gitignore           # Git ignore rules (dogfooded)
```

---

## Dogfooding Architecture

### What is Dogfooded

Files that are copied directly from Trellis project to user projects:

| Source | Destination | Description |
|--------|-------------|-------------|
| `.cursor/` | `.cursor/` | Entire directory copied |
| `.claude/` | `.claude/` | Entire directory copied |
| `.trellis/scripts/` | `.trellis/scripts/` | All scripts copied |
| `.trellis/workflow.md` | `.trellis/workflow.md` | Direct copy |
| `.trellis/.gitignore` | `.trellis/.gitignore` | Direct copy |
| `.trellis/workspace/index.md` | `.trellis/workspace/index.md` | Direct copy |

### What is NOT Dogfooded

Files that use generic templates (in `src/templates/`):

| Template Source | Destination | Reason |
|----------------|-------------|--------|
| `src/templates/markdown/spec/**/*.md.txt` | `.trellis/spec/**/*.md` | User fills with project-specific content |
| `src/templates/markdown/worktree.yaml.txt` | `.trellis/worktree.yaml` | Language-agnostic template |
| `src/templates/markdown/init-agent.md` | `init-agent.md` | Project root file |
| `src/templates/markdown/agents.md` | `AGENTS.md` | Project root file |

### Build Process

```bash
# scripts/copy-templates.js copies dogfooding sources to dist/
pnpm build

# Result:
dist/
├── .cursor/           # From project root .cursor/
├── .claude/           # From project root .claude/
├── .trellis/          # From project root .trellis/ (filtered)
│   ├── scripts/       # All scripts
│   ├── workspace/
│   │   └── index.md   # Only index.md, no developer subdirs
│   ├── workflow.md
│   ├── worktree.yaml
│   └── .gitignore
└── templates/         # From src/templates/ (no .ts files)
    └── markdown/
        └── spec/      # Generic templates
```

---

## Module Organization

### Layer Responsibilities

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| CLI | `cli/` | Parse arguments, display help, call commands |
| Commands | `commands/` | Implement CLI commands, orchestrate actions |
| **Core** | `core/` | **Business domain modules** |
| Configurators | `configurators/` | Copy/generate configuration for tools |
| Templates | `templates/` | Extract template content, provide utilities |
| Types | `types/` | TypeScript type definitions |
| Utils | `utils/` | Reusable utility functions |
| Constants | `constants/` | Shared constants (paths, names) |

### Core Module Structure

The `core/` directory organizes business logic by **domain**, not by I/O type:

```
src/core/
├── index.ts              # Unified re-exports for backward compatibility
├── paths.ts              # Path utilities (used by all modules)
│
├── task/                 # Task management domain
│   ├── index.ts          # Unified exports
│   ├── schemas.ts        # Zod schemas (Task, ContextEntry types)
│   ├── crud.ts           # Task CRUD operations
│   ├── context.ts        # Context file management (.jsonl)
│   ├── queue.ts          # Task filtering and selection
│   └── utils.ts          # Task utilities (path validation, lookup)
│
├── developer/            # Developer identity domain
│   ├── index.ts          # Unified exports
│   └── schemas.ts        # Zod schemas (Developer type)
│
├── session/              # Session/Journal domain
│   ├── index.ts          # Unified exports
│   ├── schemas.ts        # Zod schemas (Session type)
│   ├── journal.ts        # Journal file operations
│   └── workspace.ts      # Workspace index.md updates
│
├── git/                  # Git operations domain
│   ├── index.ts          # Unified exports
│   ├── types.ts          # Git types (GitCommit, Worktree, etc.)
│   ├── base.ts           # Basic git commands (using execa)
│   ├── worktree.ts       # Worktree operations
│   └── config.ts         # worktree.yaml config parsing
│
├── pipeline/             # Multi-agent pipeline domain
│   ├── index.ts          # Unified exports
│   ├── schemas.ts        # Zod schemas (Agent, Registry, Phase)
│   ├── state.ts          # Agent registry, phase, currentTask management
│   ├── worktree.ts       # Pipeline-specific worktree operations
│   └── orchestrator.ts   # High-level pipeline orchestration
│
└── platforms/            # Platform adapters (Claude, OpenCode, etc.)
    ├── index.ts          # detectPlatform() + getPlatformAdapter()
    ├── types.ts          # Platform, PlatformAdapter interface
    └── claude/
        ├── index.ts      # Claude adapter implementation
        ├── context.ts    # Claude-specific context generation
        └── launcher.ts   # Agent launching, session management
```

**Design Decision**: Organize by business domain, NOT by I/O separation.

```typescript
// Bad: Separating I/O from logic (over-engineering for CLI)
core/
├── adapters/           # I/O adapters
│   ├── file-adapter.ts
│   └── git-adapter.ts
├── services/           # Pure logic
│   ├── task-service.ts
│   └── git-service.ts

// Good: Domain-driven (simpler for CLI tools)
core/
├── task/               # All task logic together
├── git/                # All git logic together
└── platforms/          # Platform-specific logic
```

### Module Export Pattern

Each domain module has an `index.ts` that re-exports everything:

```typescript
// core/task/index.ts
export * from "./schemas.js";   // Types and schemas
export * from "./crud.js";      // CRUD operations
export * from "./context.js";   // Context management
```

The root `core/index.ts` re-exports all domains for backward compatibility:

```typescript
// core/index.ts
export * from "./paths.js";
export * from "./developer/index.js";
export * from "./git/index.js";
export * from "./task/index.js";
export * from "./session/index.js";
export * from "./platforms/index.js";
```

### Configurator Pattern

Configurators use `cpSync` for direct directory copy (dogfooding):

```typescript
// configurators/cursor.ts
export async function configureCursor(cwd: string): Promise<void> {
  const sourcePath = getCursorSourcePath(); // dist/.cursor/ or .cursor/
  const destPath = path.join(cwd, ".cursor");
  cpSync(sourcePath, destPath, { recursive: true });
}
```

### Template Extraction

`extract.ts` provides utilities for reading dogfooded files:

```typescript
// Get path to .trellis/ (works in dev and production)
getTrellisSourcePath(): string

// Read file from .trellis/
readTrellisFile(relativePath: string): string

// Copy directory from .trellis/ with executable scripts
copyTrellisDir(srcRelativePath: string, destPath: string, options?: { executable?: boolean }): void
```

---

## Naming Conventions

### Files and Directories

| Convention | Example | Usage |
|------------|---------|-------|
| `kebab-case` | `file-writer.ts` | All TypeScript files |
| `kebab-case` | `multi-agent/` | All directories |
| `*.ts` | `init.ts` | TypeScript source files |
| `*.md.txt` | `index.md.txt` | Template files for markdown |
| `*.yaml.txt` | `worktree.yaml.txt` | Template files for yaml |

### Why `.txt` Extension for Templates

Templates use `.txt` extension to:
- Prevent IDE markdown preview from rendering templates
- Make clear these are template sources, not actual docs
- Avoid confusion with actual markdown files

---

## DO / DON'T

### DO

- Dogfood from project's own config files when possible
- Use `cpSync` for copying entire directories
- Keep generic templates in `src/templates/markdown/`
- Use `.md.txt` or `.yaml.txt` for template files
- Update dogfooding sources (`.cursor/`, `.claude/`, `.trellis/scripts/`) when making changes

### DON'T

- Don't hardcode file lists - copy entire directories instead
- Don't duplicate content between templates and dogfooding sources
- Don't put project-specific content in generic templates
- Don't use dogfooding for spec/ (users fill these in)
