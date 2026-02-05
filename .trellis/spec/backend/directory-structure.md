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
│   └── init.ts          # Each command in its own file
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
│   ├── project-detector.ts # Project type detection
│   └── template-fetcher.ts # Remote template download from GitHub
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
├── scripts/             # Python scripts (dogfooded)
│   ├── common/          # Shared utilities (paths.py, developer.py, etc.)
│   ├── multi_agent/     # Pipeline scripts (start.py, status.py, etc.)
│   └── *.py             # Main scripts (task.py, get_context.py, etc.)
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
| Configurators | `configurators/` | Copy/generate configuration for tools |
| Templates | `templates/` | Extract template content, provide utilities |
| Types | `types/` | TypeScript type definitions |
| Utils | `utils/` | Reusable utility functions |
| Constants | `constants/` | Shared constants (paths, names) |

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
- Always use `python3` explicitly when documenting script invocation (Windows compatibility)

### DON'T

- Don't hardcode file lists - copy entire directories instead
- Don't duplicate content between templates and dogfooding sources
- Don't put project-specific content in generic templates
- Don't use dogfooding for spec/ (users fill these in)

---

## Design Decisions

### Remote Template Download (giget)

**Context**: Need to download GitHub subdirectories for remote template support.

**Options Considered**:
1. `degit` / `tiged` - Simple, but no programmatic API
2. `giget` - TypeScript native, has programmatic API, used by Nuxt/UnJS
3. Manual GitHub API - Too complex

**Decision**: Use `giget` because:
- TypeScript native with programmatic API
- Supports GitHub subdirectory: `gh:user/repo/path/to/subdir`
- Built-in caching for offline support
- Actively maintained by UnJS ecosystem

**Example**:
```typescript
import { downloadTemplate } from "giget";

await downloadTemplate("gh:mindfold-ai/docs/marketplace/specs/electron-fullstack", {
  dir: destDir,
  preferOffline: true,
});
```

### Directory Conflict Strategy (skip/overwrite/append)

**Context**: When downloading remote templates, target directory may already exist.

**Decision**: Three strategies with `skip` as default:
- `skip` - Don't download if directory exists (safe default)
- `overwrite` - Delete existing, download fresh
- `append` - Only copy files that don't exist (merge)

**Why**: giget doesn't support append natively, so we:
1. Download to temp directory
2. Walk and copy missing files only
3. Clean up temp directory

**Example**:
```typescript
// append strategy implementation
const tempDir = path.join(os.tmpdir(), `trellis-template-${Date.now()}`);
await downloadTemplate(source, { dir: tempDir });
await copyMissing(tempDir, destDir);  // Only copy non-existing files
await fs.promises.rm(tempDir, { recursive: true });
```

### Extensible Template Type Mapping

**Context**: Currently only `spec` templates, but future needs `skill`, `command`, `full` types.

**Decision**: Use type field + mapping table for extensibility:

```typescript
const INSTALL_PATHS: Record<string, string> = {
  spec: ".trellis/spec",
  skill: ".claude/skills",
  command: ".claude/commands",
  full: ".",  // Entire project root
};

// Usage: auto-detect install path from template type
const destDir = INSTALL_PATHS[template.type] || INSTALL_PATHS.spec;
```

**Extensibility**: To add new template type:
1. Add entry to `INSTALL_PATHS`
2. Add templates to `index.json` with new type
3. No code changes needed for download logic
