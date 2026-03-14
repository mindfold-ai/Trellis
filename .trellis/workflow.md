# Development Workflow

> Based on [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## Table of Contents

1. [Quick Start (Do This First)](#quick-start-do-this-first)
2. [Workflow Overview](#workflow-overview)
3. [Session Start Process](#session-start-process)
4. [Development Process](#development-process)
5. [Session End](#session-end)
6. [File Descriptions](#file-descriptions)
7. [Best Practices](#best-practices)

---

## Quick Start (Do This First)

### Step 0: Initialize Developer Identity (First Time Only)

> **Multi-developer support**: Each developer/Agent needs to initialize their identity first

```bash
# Check if already initialized
python3 ./.trellis/scripts/get_developer.py

# If not initialized, run:
python3 ./.trellis/scripts/init_developer.py <your-name>
# Example: python3 ./.trellis/scripts/init_developer.py cursor-agent
```

This creates:
- `.trellis/.developer` - Your identity file (gitignored, not committed)
- `.trellis/workspace/<your-name>/` - Your personal workspace directory

**Naming suggestions**:
- Human developers: Use your name, e.g., `john-doe`
- Cursor AI: `cursor-agent` or `cursor-<task>`
- Claude Code: `claude-agent` or `claude-<task>`

### Step 1: Understand Current Context

```bash
# Get full context in one command
python3 ./.trellis/scripts/get_context.py

# Or check manually:
python3 ./.trellis/scripts/get_developer.py      # Your identity
python3 ./.trellis/scripts/task.py list          # Active tasks
git status && git log --oneline -10              # Git state
```

### Step 2: Read Project Guidelines [MANDATORY]

**CRITICAL**: Read guidelines before writing any code:

```bash
# Discover packages and their spec layers
python3 ./.trellis/scripts/get_context.py --mode packages

# Read index.md for the package you'll work on
cat .trellis/spec/<package>/<layer>/index.md

# Always read shared thinking guides
cat .trellis/spec/guides/index.md
```

Each `index.md` contains a **Pre-Development Checklist** listing the specific guideline files to read for that module. Follow it.

### Step 3: Before Coding - Read Specific Guidelines (Required)

Based on your task, follow the Pre-Development Checklist in the relevant spec `index.md`. It will point you to the exact guideline files for your work type (hooks, components, database, types, etc.).

---

## Workflow Overview

### Core Principles

1. **Read Before Write** - Understand context before starting
2. **Follow Standards** - [!] **MUST read `.trellis/spec/` guidelines before coding**
3. **Incremental Development** - Complete one task at a time
4. **Record Promptly** - Update tracking files immediately after completion
5. **Document Limits** - [!] **Max 2000 lines per journal document**

### File System

```
.trellis/
|-- .developer           # Developer identity (gitignored)
|-- scripts/
|   |-- __init__.py          # Python package init
|   |-- common/              # Shared utilities (Python)
|   |   |-- __init__.py
|   |   |-- paths.py         # Path utilities
|   |   |-- developer.py     # Developer management
|   |   +-- git_context.py   # Git context implementation
|   |-- multi_agent/         # Multi-agent pipeline scripts
|   |   |-- __init__.py
|   |   |-- start.py         # Start worktree agent
|   |   |-- status.py        # Monitor agent status
|   |   |-- create_pr.py     # Create PR
|   |   +-- cleanup.py       # Cleanup worktree
|   |-- init_developer.py    # Initialize developer identity
|   |-- get_developer.py     # Get current developer name
|   |-- task.py              # Manage tasks
|   |-- get_context.py       # Get session context
|   +-- add_session.py       # One-click session recording
|-- workspace/           # Developer workspaces
|   |-- index.md         # Workspace index + Session template
|   +-- {developer}/     # Per-developer directories
|       |-- index.md     # Personal index (with @@@auto markers)
|       +-- journal-N.md # Journal files (sequential numbering)
|-- tasks/               # Task tracking
|   +-- {MM}-{DD}-{name}/
|       +-- task.json
|-- spec/                # [!] MUST READ before coding
|   |-- <package>/       # Per-package specs (e.g., cli/, docs-site/)
|   |   +-- <layer>/     # Per-layer (e.g., backend/, frontend/, unit-test/)
|   |       |-- index.md # Start here — Pre-Dev Checklist & Quality Check
|   |       +-- *.md     # Topic-specific docs
|   +-- guides/          # Cross-package thinking guides
|       |-- index.md     # Guides index
|       +-- *.md         # Guide-specific docs
+-- workflow.md             # This document
```

---

## Session Start Process

### Step 1: Get Session Context

Use the unified context script:

```bash
# Get all context in one command
python3 ./.trellis/scripts/get_context.py

# Or get JSON format
python3 ./.trellis/scripts/get_context.py --json
```

### Step 2: Read Development Guidelines [!] REQUIRED

**[!] CRITICAL: MUST read guidelines before writing any code**

Based on what you'll develop, read the corresponding guidelines:

```bash
# Discover packages and their spec layers
python3 ./.trellis/scripts/get_context.py --mode packages

# Read the index for your target package and layer
cat .trellis/spec/<package>/<layer>/index.md

# Always read shared thinking guides
cat .trellis/spec/guides/index.md
```

Each `index.md` contains a **Pre-Development Checklist** that lists the specific guideline files to read. Follow it for your work type.

### Step 3: Select Task to Develop

Use the task management script:

```bash
# List active tasks
python3 ./.trellis/scripts/task.py list

# Create new task (creates directory with task.json)
python3 ./.trellis/scripts/task.py create "<title>" --slug <task-name>
```

---

## Development Process

### Task Development Flow

```
1. Create or select task
   --> python3 ./.trellis/scripts/task.py create "<title>" --slug <name> or list

2. Write code according to guidelines
   --> Read .trellis/spec/ docs relevant to your task
   --> For cross-layer: read .trellis/spec/guides/

3. Self-test
   --> Run project's lint/test commands (see spec docs)
   --> Manual feature testing

4. Commit code
   --> git add <files>
   --> git commit -m "type(scope): description"
       Format: feat/fix/docs/refactor/test/chore

5. Record session (one command)
   --> python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash"
```

### Code Quality Checklist

**Must pass before commit**:
- [OK] Lint checks pass (project-specific command)
- [OK] Type checks pass (if applicable)
- [OK] Manual feature testing passes

**Project-specific checks**:
- Run `/trellis:check` — it auto-discovers relevant spec modules based on changed files
- Or manually check the **Quality Check** section in the relevant `spec/<package>/<layer>/index.md`

---

## Session End

### One-Click Session Recording

After code is committed, use:

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "abc1234" \
  --summary "Brief summary"
```

This automatically:
1. Detects current journal file
2. Creates new file if 2000-line limit exceeded
3. Appends session content
4. Updates index.md (sessions count, history table)

### Pre-end Checklist

Use `/trellis:finish-work` command to run through:
1. [OK] All code committed, commit message follows convention
2. [OK] Session recorded via `add_session.py`
3. [OK] No lint/test errors
4. [OK] Working directory clean (or WIP noted)
5. [OK] Spec docs updated if needed

---

## File Descriptions

### 1. workspace/ - Developer Workspaces

**Purpose**: Record each AI Agent session's work content

**Structure** (Multi-developer support):
```
workspace/
|-- index.md              # Main index (Active Developers table)
+-- {developer}/          # Per-developer directory
    |-- index.md          # Personal index (with @@@auto markers)
    +-- journal-N.md      # Journal files (sequential: 1, 2, 3...)
```

**When to update**:
- [OK] End of each session
- [OK] Complete important task
- [OK] Fix important bug

### 2. spec/ - Development Guidelines

**Purpose**: Documented standards for consistent development

**Structure** (Package-scoped, auto-discoverable):
```
spec/
|-- <package>/          # One per package (e.g., cli/, docs-site/)
|   |-- <layer>/        # One per layer (e.g., backend/, frontend/, unit-test/)
|   |   |-- index.md    # Start here — has Pre-Dev Checklist & Quality Check
|   |   +-- *.md        # Topic-specific guideline docs
|   +-- ...
+-- guides/             # Cross-package thinking guides (always read)
    |-- index.md        # Guides index
    +-- *.md            # Guide-specific docs
```

**Discovery**: `python3 ./.trellis/scripts/get_context.py --mode packages` lists all packages, their paths, types, and spec layers. Adding a new package only requires updating `config.yaml` and creating `spec/<package>/`.

**When to update**:
- [OK] New pattern discovered
- [OK] Bug fixed that reveals missing guidance
- [OK] New convention established

### 3. Tasks - Task Tracking

Each task is a directory containing `task.json`:

```
tasks/
|-- 01-21-my-task/
|   +-- task.json
+-- archive/
    +-- 2026-01/
        +-- 01-15-old-task/
            +-- task.json
```

**Commands**:
```bash
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>]   # Create task directory
python3 ./.trellis/scripts/task.py archive <name>  # Archive to archive/{year-month}/
python3 ./.trellis/scripts/task.py list            # List active tasks
python3 ./.trellis/scripts/task.py list-archive    # List archived tasks
```

---

## Best Practices

### [OK] DO - Should Do

1. **Before session start**:
   - Run `python3 ./.trellis/scripts/get_context.py` for full context
   - [!] **MUST read** relevant `.trellis/spec/` docs

2. **During development**:
   - [!] **Follow** `.trellis/spec/` guidelines
   - For cross-layer features, use `/trellis:check-cross-layer`
   - Develop only one task at a time
   - Run lint and tests frequently

3. **After development complete**:
   - Use `/trellis:finish-work` for completion checklist
   - After fix bug, use `/trellis:break-loop` for deep analysis
   - Human commits after testing passes
   - Use `add_session.py` to record progress

### [X] DON'T - Should Not Do

1. [!] **Don't** skip reading `.trellis/spec/` guidelines
2. [!] **Don't** let journal single file exceed 2000 lines
3. **Don't** develop multiple unrelated tasks simultaneously
4. **Don't** commit code with lint/test errors
5. **Don't** forget to update spec docs after learning something
6. [!] **Don't** execute `git commit` - AI should not commit code

---

## Quick Reference

### Must-read Before Development

1. Discover packages: `python3 ./.trellis/scripts/get_context.py --mode packages`
2. Read `spec/<package>/<layer>/index.md` for your target package
3. Follow its **Pre-Development Checklist**
4. Always read `spec/guides/index.md` for cross-cutting concerns

### Commit Convention

```bash
git commit -m "type(scope): description"
```

**Type**: feat, fix, docs, refactor, test, chore
**Scope**: Module name (e.g., auth, api, ui)

### Common Commands

```bash
# Session management
python3 ./.trellis/scripts/get_context.py    # Get full context
python3 ./.trellis/scripts/add_session.py    # Record session

# Task management
python3 ./.trellis/scripts/task.py list      # List tasks
python3 ./.trellis/scripts/task.py create "<title>" # Create task

# Slash commands
/trellis:finish-work          # Pre-commit checklist
/trellis:break-loop           # Post-debug analysis
/trellis:check-cross-layer    # Cross-layer verification
```

---

## Summary

Following this workflow ensures:
- [OK] Continuity across multiple sessions
- [OK] Consistent code quality
- [OK] Trackable progress
- [OK] Knowledge accumulation in spec docs
- [OK] Transparent team collaboration

**Core Philosophy**: Read before write, follow standards, record promptly, capture learnings

---

## AOSP Context Loading

This section extends the standard workflow for tasks involving AOSP modules (SystemUI, Launcher, Framework).

### Context Loading Order

Always load context in this order to avoid missing dependencies:

**1. Always load (every AOSP task)**
```
docs/memory/codebase/CODEBASE_MAP.md
.trellis/spec/architecture/index.md
```

**2. Module-specific (load for your target module)**
```
# SystemUI
docs/memory/systemui/overview.md
docs/memory/systemui/entrypoints.md

# Launcher
docs/memory/launcher/overview.md
docs/memory/launcher/entrypoints.md

# Framework
docs/memory/framework/overview.md
docs/memory/framework/services_map.md
```

**3. Cross-layer (load if task spans modules)**
```
docs/memory/cross_layer/<flow>.md
# Available flows: gesture_home_flow, recents_flow, notification_flow, device_state_flow
```

### AOSP Task JSONL Pattern

When creating tasks for AOSP work, use this pattern in `task.json`:

```json
{
  "title": "Add ambient display hook to SystemUI",
  "module": "systemui",
  "layer": "overlay",
  "spec": ".trellis/spec/architecture/low-intrusion-principles.md",
  "memory": ["docs/memory/systemui/entrypoints.md"],
  "cross_layer": [],
  "attribution_owner": "team-systemui"
}
```

### Frontmatter Confidence Rules

All `docs/memory/` files have a `confidence` field. Apply these rules:

| Confidence | Action |
|-----------|--------|
| `validated` | Trust the content — it has been verified against the actual codebase |
| `inferred` | Use with caution — content was inferred but not directly verified |
| `pending` | **Skip** — this is an unfilled template, content is placeholder only |

When you validate content in a memory file, update `confidence` from `pending`/`inferred` to `validated` and set `last_updated` and `verified_by`.
