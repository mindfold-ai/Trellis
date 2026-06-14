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
│   ├── index.ts         # Platform registry (PLATFORM_FUNCTIONS, derived helpers)
│   ├── shared.ts        # Shared utilities (resolvePlaceholders, writeSkills, writeAgents, writeSharedHooks)
│   ├── antigravity.ts   # Antigravity configurator
│   ├── claude.ts        # Claude Code configurator
│   ├── codebuddy.ts     # CodeBuddy configurator
│   ├── codex.ts         # Codex configurator
│   ├── copilot.ts       # Copilot configurator
│   ├── cursor.ts        # Cursor configurator
│   ├── droid.ts         # Droid configurator
│   ├── gemini.ts        # Gemini CLI configurator
│   ├── kilo.ts          # Kilo configurator
│   ├── kiro.ts          # Kiro configurator
│   ├── opencode.ts      # OpenCode configurator
│   ├── qoder.ts         # Qoder configurator
│   ├── windsurf.ts      # Windsurf configurator
│   └── workflow.ts      # Creates .trellis/ structure
├── constants/           # Shared constants and paths
│   └── paths.ts         # Path constants (centralized)
├── templates/           # Template utilities and platform templates
│   ├── template-utils.ts # createTemplateReader() factory — eliminates boilerplate
│   ├── extract.ts       # Template extraction utilities (.trellis/ files)
│   ├── common/          # Single source of truth for commands + skills
│   │   ├── commands/    # Slash commands (start.md, finish-work.md)
│   │   ├── skills/      # Auto-triggered skills (before-dev, brainstorm, check, break-loop, update-spec)
│   │   └── index.ts     # getCommandTemplates(), getSkillTemplates()
│   ├── shared-hooks/    # Platform-independent Python hook scripts
│   │   ├── index.ts     # getSharedHookScripts()
│   │   ├── session-start.py
│   │   ├── inject-shell-session-context.py
│   │   ├── inject-workflow-state.py
│   │   └── inject-subagent-context.py
│   ├── claude/          # Claude Code templates (agents, hooks, settings)
│   ├── codebuddy/       # CodeBuddy templates (agents, settings)
│   ├── codex/           # Codex templates (agents, hooks.json)
│   ├── copilot/         # Copilot templates (prompts, hooks, hooks.json)
│   ├── cursor/          # Cursor templates (agents, hooks.json)
│   ├── droid/           # Droid templates (droids, settings)
│   ├── gemini/          # Gemini templates (agents, settings)
│   ├── kiro/            # Kiro templates (agents as JSON)
│   ├── opencode/        # OpenCode templates (agents, plugin, lib)
│   ├── qoder/           # Qoder templates (agents, settings)
│   ├── markdown/        # Generic markdown templates
│   │   ├── spec/        # Spec templates (*.md.txt)
│   │   ├── agents.md    # Project root file template
│   │   └── index.ts     # Template exports
│   └── trellis/         # .trellis/ workflow templates (scripts, workflow.yaml, workflow/)
├── types/               # TypeScript type definitions
│   └── ai-tools.ts      # AI tool types and registry
├── utils/               # Shared utility functions
│   ├── compare-versions.ts # Semver comparison with prerelease support
│   ├── file-writer.ts   # File writing with conflict handling
│   ├── project-detector.ts # Project type detection
│   ├── template-fetcher.ts # Remote template download from GitHub
│   └── template-hash.ts # Template hash tracking for update detection
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
│   ├── common/          # Shared utilities (paths.py, developer.py, cli_adapter.py, etc.)
│   ├── hooks/           # Lifecycle hook scripts (project-specific, NOT dogfooded)
│   └── *.py             # Main scripts (task.py, get_context.py, etc.)
├── workspace/           # Developer progress tracking
│   └── index.md         # Index template (dogfooded)
├── spec/                # Project guidelines (NOT dogfooded)
│   ├── cli/             # CLI package specs (backend/, unit-test/)
│   ├── docs-site/       # Docs package specs (docs/)
│   └── guides/          # Thinking guides
├── workflow.yaml        # Structured workflow manifest (dogfooded)
├── workflow/            # Workflow body markdown files (dogfooded)
│   ├── states/          # Per-status breadcrumb bodies
│   └── steps/           # Per-step phase bodies
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
| `.trellis/workflow.yaml` | `.trellis/workflow.yaml` | Direct copy |
| `.trellis/workflow/` | `.trellis/workflow/` | Workflow body markdown files |
| `.trellis/.gitignore` | `.trellis/.gitignore` | Direct copy |
| `.trellis/workspace/index.md` | `.trellis/workspace/index.md` | Direct copy |

### What is NOT Dogfooded

Files that use generic templates (in `src/templates/`):

| Template Source | Destination | Reason |
|----------------|-------------|--------|
| `src/templates/markdown/spec/**/*.md.txt` | `.trellis/spec/**/*.md` | User fills with project-specific content |
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
│   ├── scripts/       # All scripts (no multi_agent/)
│   ├── workspace/
│   │   └── index.md   # Only index.md, no developer subdirs
│   ├── workflow.yaml
│   ├── workflow/
│   └── .gitignore
└── templates/         # From src/templates/ (no .ts files)
    ├── common/        # Shared command + skill templates
    ├── shared-hooks/  # Platform-independent hook scripts
    ├── claude/        # Claude-specific templates
    ├── {platform}/    # Other platform templates
    └── markdown/
        └── spec/      # Generic spec templates
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

### Why `.txt` Extension for Templates

Templates use `.txt` extension to:
- Prevent IDE markdown preview from rendering templates
- Make clear these are template sources, not actual docs
- Avoid confusion with actual markdown files

### Don't: Leak dogfood spec into `templates/markdown/spec/`

**Invariant**: `packages/cli/src/templates/markdown/spec/` contains **only `.md.txt` files**. A bare `.md` file there is a bug — it ships to `dist/` (into the npm tarball) but is never imported by `markdown/index.ts`, so it never lands on a user's disk and serves no purpose except dead weight + future maintainer confusion.

**How the bug happens** (confirmed in git log — v0.1.x through v0.4): a spec-authoring workflow writes to the wrong directory. The two paths look almost identical:

| Path | Purpose |
|------|---------|
| `.trellis/spec/<pkg>/<layer>/*.md` | This repo's dogfood spec (Trellis documenting its own code) |
| `packages/cli/src/templates/markdown/spec/<layer>/*.md.txt` | User-facing placeholder templates (ship to new projects via `trellis init`) |

If you open-and-edit the wrong one, nothing fails at build / test / lint time — `markdown/index.ts` silently ignores your new file because it only reads the `.md.txt` variants. The drift can persist for years (caught in 2026-04 after ~3 months).

**Prevention checklist** (apply whenever you add or edit a spec-layer file):

1. Write spec content to `.trellis/spec/<pkg>/<layer>/<file>.md` — this is the dogfood location.
2. Template stubs for users live in `packages/cli/src/templates/markdown/spec/<layer>/<file>.md.txt` — write the user-facing placeholder, NOT the real content.
3. If the new file is not imported by `packages/cli/src/templates/markdown/index.ts`, it shouldn't exist in that directory. `ls packages/cli/src/templates/markdown/spec/**/*.md` must return empty.

**Audit command**:
```bash
# Every file here must end in .md.txt
find packages/cli/src/templates/markdown/spec -type f -name "*.md" ! -name "*.md.txt"
# (empty output = clean)
```

Consider adding this find to a regression test (non-empty output → fail) so the invariant is machine-enforced, not memory-enforced.

---

## Monorepo Detection (`project-detector.ts`)

### `detectMonorepo(cwd)` Flow

Detects monorepo workspace configuration and enumerates packages. Returns `DetectedPackage[]` or `null`.

**Return value semantics**:

| Return | Meaning |
|--------|---------|
| `null` | Not a monorepo (no workspace config or `.gitmodules` found) |
| `[]` (empty array) | Monorepo config exists (e.g., `pnpm-workspace.yaml`) but no packages match on disk |
| `[...]` (populated array) | Monorepo with detected packages |

**Detection priority** (checked in order, results merged):

1. `.gitmodules` — parsed first to build a submodule path set
2. `pnpm-workspace.yaml` — `packages:` list
3. `package.json` `workspaces` — array or `{packages: [...]}` (npm/yarn/bun)
4. `Cargo.toml` `[workspace]` — `members` minus `exclude`
5. `go.work` — `use` directives (block and single-line forms)
6. `pyproject.toml` `[tool.uv.workspace]` — `members` list
7. `parsePolyrepo` — sibling `.git` scan, **only fires if 1–6 all miss AND no submodules exist** (last-resort fallback)

All workspace managers' glob patterns are expanded via `expandWorkspaceGlobs()`, and results are deduplicated by normalized path.

### `DetectedPackage` Interface

```typescript
interface DetectedPackage {
  name: string;         // From readPackageName() fallback chain
  path: string;         // Normalized relative path (no ./ or trailing /)
  type: ProjectType;    // Detected via detectProjectType() on the package dir
  isSubmodule: boolean; // True if path appears in .gitmodules
  isGitRepo: boolean;   // True if discovered via parsePolyrepo (independent .git, not a submodule)
}
```

`isSubmodule` and `isGitRepo` are **mutually exclusive** — they correspond to two distinct runtime config schemas (`type: submodule` vs `git: true`). See "CLI ↔ Runtime Schema Parity" below.

### `expandWorkspaceGlobs()` Limitations

- Only supports `*` as a **full path segment** wildcard (e.g., `packages/*`, `crates/*/subcrate`)
- Does **not** support `**` (recursive globbing), `?`, or character classes `[abc]`
- Segments that are not exactly `*` are treated as literal path components
- Dotfiles (directories starting with `.`) are excluded from wildcard matches
- Supports `!` prefix for exclusion patterns (e.g., `!packages/internal`)

### `readPackageName()` Fallback Chain

Reads the package name from config files in priority order, falling back to the directory basename:

1. `package.json` → `name` field
2. `Cargo.toml` → `[package]` `name`
3. `go.mod` → `module` directive (last path segment)
4. `pyproject.toml` → `[project]` `name`
5. Fallback: `path.basename(pkgPath)`

### `.gitmodules` Auto-Detection

When `.gitmodules` exists, its entries are parsed and:

- Paths are added to the submodule lookup set
- If no workspace manager is detected, submodule-only repos still return a non-null result (each submodule becomes a `DetectedPackage` with `isSubmodule: true`)
- If workspace managers are also detected, submodule paths are merged: workspace packages at submodule paths get `isSubmodule: true`, and submodule paths not covered by any workspace manager are added as additional packages

### `parsePolyrepo()` — Sibling `.git` Fallback

Last-resort detector for **polyrepo** layouts (multiple independent git repos in one directory, no workspace manager, no `.gitmodules`).

**Rules**:

- Scans up to **2 levels deep** from `cwd` (immediate children + grandchildren). Deeper layouts must be configured manually via `config.yaml`
- Once a directory containing `.git` is found, that path is a candidate and the scan **does not descend into it** (a package is atomic)
- Filters out: dot-prefixed dirs (`.git`, `.next`, `.venv`, `.trellis`, …) and an explicit ignore set: `node_modules`, `target`, `dist`, `build`, `out`, `bin`, `obj`, `vendor`, `coverage`, `tmp`, `__pycache__`. Filter applies at every depth
- `.git` may be a **directory or a file** (worktree gitlink). Detection MUST use `fs.existsSync` without `.isDirectory()`
- Skips paths already in the submodule set (avoid double-counting)
- Returns `null` if fewer than 2 candidates (single `.git` is more likely an accidental clone than a polyrepo)

**Gating**: Only runs when all 6 prior parsers return null **and** the submodule set is empty. Workspace config always wins over polyrepo inference.

> **Gotcha**: The sibling-`.git` heuristic is intentionally fired in auto-detect mode (no flag required). The existing interactive `confirm` prompt in `init.ts` is the user-intent gate. Do NOT add a separate `--monorepo`-style guard — it duplicates an existing safety mechanism.

---

## Monorepo Init Flow (`init.ts`)

### CLI Flags

| Flag | Behavior |
|------|----------|
| `--monorepo` | Force monorepo mode. On detector miss, prints a checklist of all 7 markers checked + a manual `config.yaml` example showing both `type: submodule` and `git: true`, then `return`s (not `process.exit(1)`) |
| `--no-monorepo` | Skip monorepo detection entirely |
| _(neither)_ | Auto-detect; prompt user to confirm if packages found |

> **Design Decision (do NOT revisit lightly)**: There is intentionally **no `--packages` CLI flag**. The escape hatch for users with non-standard layouts is hand-writing `packages:` in `.trellis/config.yaml` — `writeMonorepoConfig` is non-destructive and won't overwrite. Reasons: (1) `config.yaml` is the runtime source of truth, a flag would be a transient duplicate; (2) Trellis prefers declarative configuration over imperative flags. If future need pushes back, document the use case before adding the flag.

### Init Sequence (Monorepo Path)

1. **Detect**: Call `detectMonorepo(cwd)` to find packages
2. **Confirm**: In interactive mode, show detected packages and prompt "Enable monorepo mode?"
3. **Per-package template**: For each package, ask whether to use blank spec or download a remote template (skipped with `-y`)
4. **Create workflow structure**: Call `createWorkflowStructure()` with `packages` array, which creates per-package spec directories (`spec/<name>/backend/`, `spec/<name>/frontend/`, etc.)
5. **Write config**: Call `writeMonorepoConfig()` to patch `config.yaml`

### `writeMonorepoConfig()` Behavior

Non-destructive config.yaml patch:

- **Reads** existing `config.yaml` (no-op if file doesn't exist yet)
- **Skips** if `packages:` key already present (re-init safety — also makes hand-written config the supported escape hatch for non-standard layouts)
- **Appends** `packages:` block with each package's `path` and optional `type: submodule` **or** `git: true` (mutually exclusive — a package is never both a submodule and a polyrepo entry)
- **Sets** `default_package:` to the first non-submodule package (fallback to first package)

### CLI ↔ Runtime Schema Parity

The TS `DetectedPackage` interface and the Python runtime config schema are coupled. When changing one, change the other.

| TS field (`DetectedPackage`) | YAML key (`config.yaml` `packages.<name>`) | Python reader |
|---|---|---|
| `isSubmodule: true` | `type: submodule` | `get_submodule_packages()` in `.trellis/scripts/common/config.py` |
| `isGitRepo: true` | `git: true` | `get_git_packages()` in `.trellis/scripts/common/config.py` |

The Python helper `_is_true_config_value()` accepts `true` (case-insensitive string). YAML literals are emitted unquoted by `writeMonorepoConfig`. End-to-end round-trip is covered by `test/commands/init.integration.test.ts` polyrepo case.

### Runtime Session Context Fallback

`common/session_context.py` consumes the `git: true` runtime schema when
injecting package Git status. The configured package list remains the primary
source of truth.

For backward compatibility with projects initialized before polyrepo detection
or hand-created Trellis roots, session context has a bounded fallback: when the
Trellis root is not a Git worktree and no configured package Git repositories
are available, it may scan immediate child and grandchild directories for
independent `.git` entries and inject those repositories' status. This fallback
must mirror `parsePolyrepo()`:

- maximum depth: two levels
- skip dot-prefixed and generated/vendor directories
- accept `.git` as a directory or file
- stop descending once a child repository is found
- require at least two discovered repositories before treating the layout as a
  polyrepo

Do not use the fallback to rewrite `config.yaml`; it is context-only. Users with
non-standard layouts should still configure `packages:` explicitly.

### Per-Package Spec Directory Creation

For each detected package, `createWorkflowStructure()` creates spec directories based on the package's detected `ProjectType`:

- `backend` → `.trellis/spec/<name>/backend/*.md`
- `frontend` → `.trellis/spec/<name>/frontend/*.md`
- `fullstack` / `unknown` → both backend and frontend directories

Packages that received a remote template download (tracked via `remoteSpecPackages` set) skip blank spec template creation.

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

await downloadTemplate("gh:mindfold-ai/Trellis/marketplace/specs/electron-fullstack", {
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
