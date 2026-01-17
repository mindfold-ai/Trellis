# AI Agent Initialization Guide

> **Purpose**: Quick onboarding document for new AI Agent sessions. Read this first to understand the project and workflow.

---

## Quick Start (Do This First)

### Step 0: Initialize Developer Identity (First Time Only)

> **Multi-developer support**: Each developer/Agent needs to initialize their identity first

```bash
# Check if already initialized
./.trellis/scripts/get-developer.sh

# If not initialized, run:
./.trellis/scripts/init-developer.sh <your-name>
# Example: ./.trellis/scripts/init-developer.sh cursor-agent
```

This creates:
- `.trellis/.developer` - Your identity file (gitignored, not committed)
- `.trellis/agent-traces/<your-name>/` - Your personal traces directory

**Naming suggestions**:
- Human developers: Use your name, e.g., `john-doe`
- Cursor AI: `cursor-agent` or `cursor-<feature>`
- Claude Code: `claude-agent` or `claude-<feature>`

### Step 1: Understand Current Context (5 min)

```bash
# Get full context in one command
./.trellis/scripts/get-context.sh

# Or check manually:
./.trellis/scripts/get-developer.sh      # Your identity
./.trellis/scripts/feature.sh list       # Active features
git status && git log --oneline -10      # Git state
```

### Step 2: Read Project Guidelines (10 min) [MANDATORY]

**CRITICAL**: Read BOTH frontend and backend guideline indexes to understand the project:

```bash
# Read frontend guidelines index (REQUIRED - even for backend tasks)
cat .trellis/structure/frontend/index.md

# Read backend guidelines index (REQUIRED - even for frontend tasks)
cat .trellis/structure/backend/index.md
```

**Why read both?**
- Understand the full project architecture
- Know coding standards for the entire codebase
- See how frontend and backend interact
- Learn the overall code quality requirements

### Step 3: Read Workflow Guide (5 min)

```bash
cat .trellis/workflow.md
```

**CRITICAL**: This document defines the entire development workflow. You MUST follow it.

### Step 4: Before Coding - Read Specific Guidelines (Required)

Based on your task, read the **detailed** guidelines:

**Frontend Task**:
```bash
cat .trellis/structure/frontend/hook-guidelines.md      # For hooks
cat .trellis/structure/frontend/component-guidelines.md # For components
cat .trellis/structure/frontend/type-safety.md          # For types
```

**Backend Task**:
```bash
cat .trellis/structure/backend/database-guidelines.md   # For DB operations
cat .trellis/structure/backend/type-safety.md           # For Zod/types
cat .trellis/structure/backend/logging-guidelines.md    # For logging
```

---

## Project Overview

### What is This Project?

[Fill in your project description here after running `trellis init`]

### Tech Stack

[Fill in your tech stack here]

### Key Information

- **Main Branch**: Check with `git branch`
- **Current Branch**: Check `git status`
- **Package Manager**: Check for package-lock.json (npm), yarn.lock (yarn), or pnpm-lock.yaml (pnpm)
- **Linter**: Check package.json scripts

---

## Directory Structure

```
your-project/
├── .trellis/                 # [!] Agent-Human collaboration system
│   ├── workflow.md              # Workflow guide (MUST READ)
│   ├── scripts/             # Workflow scripts
│   │   ├── common/          # Shared utilities
│   │   ├── feature.sh       # Feature management
│   │   ├── get-context.sh   # Get session context
│   │   └── add-session.sh   # Record session
│   ├── agent-traces/      # Work traces records
│   │   └── {developer}/     # Per-developer directories
│   │       ├── features/    # Feature directories
│   │       │   └── {day}-{name}/
│   │       │       └── feature.json
│   │       └── traces-N.md
│   ├── structure/           # [!] Development guidelines (MUST READ)
│   │   ├── frontend/
│   │   │   ├── index.md     # Frontend guidelines index
│   │   │   └── *.md         # Topic-specific docs
│   │   ├── backend/
│   │   │   ├── index.md     # Backend guidelines index
│   │   │   └── *.md         # Topic-specific docs
│   │   └── guides/          # Thinking guides
├── init-agent.md            # This initialization guide
└── AGENTS.md                # Compatible with agents.md protocol
```

---

## Development Workflow System

### Overview

This project uses a structured workflow system based on [Anthropic's best practices](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

### Core Files

| File | Purpose | When to Update |
|------|---------|----------------|
| `.trellis/workflow.md` | Complete workflow guide | Read at session start |
| `.trellis/agent-traces/{developer}/features/` | Feature tracking | When creating/completing features |
| `.trellis/agent-traces/{developer}/traces-N.md` | Session work records | After each session |

### Key Rules (CRITICAL - Must Follow)

**1. Read Guidelines Before Coding**
   - Frontend: `.trellis/structure/frontend/index.md` -> specific docs
   - Backend: `.trellis/structure/backend/index.md` -> specific docs
   - This is **mandatory**, not optional

**2. Document Limits** **CRITICAL RULE**
   - `agent-traces/{developer}/traces-N.md` max 2000 lines
   - **IMPORTANT: Only create new file when current file EXCEEDS 2000 lines**
   - File naming: Use sequential numbers (`traces-1.md`, `traces-2.md`...)

**3. Update Tracking Files**
   - After completing work: Update `agent-traces` (include commit hashes)
   - When feature changes: Use `feature.sh` commands

---

## How to Use the Workflow System

### At Session Start

1. **Get context** - Run `./.trellis/scripts/get-context.sh`
2. **Read ALL guideline indexes** (see Quick Start Step 2 above)
   - **MANDATORY**: Read both frontend AND backend indexes
3. **Read workflow guide** - `cat .trellis/workflow.md`
4. **Identify your task** from feature list
5. **Read specific guidelines** for your task
6. **Create or select feature** to work on

### During Development

1. **Create feature** (if new)
   ```bash
   ./.trellis/scripts/feature.sh create <feature-name>
   ```

2. **Follow guidelines strictly**
   - Frontend: Type safety, Hook standards, Component standards
   - Backend: Directory structure, Type safety, Database operations

3. **Test before commit**
   ```bash
   npm run lint        # or pnpm lint / yarn lint - Must pass
   npm run type-check  # or pnpm type-check - Must pass
   ```

4. **Commit with convention**
   ```bash
   git commit -m "type(scope): description"
   # Types: feat, fix, docs, refactor, test, chore
   ```

### At Session End (REQUIRED)

**Record your session**:
```bash
./.trellis/scripts/add-session.sh \
  --title "Session Title" \
  --commit "abc1234" \
  --summary "Brief summary"
```

This automatically:
- Appends session to current traces file
- Creates new file if 2000-line limit exceeded
- Updates index.md

**Archive completed feature**:
```bash
./.trellis/scripts/feature.sh archive <feature-name>
```

---

## Common Commands

### Workflow Scripts
```bash
./.trellis/scripts/get-context.sh           # Get full context
./.trellis/scripts/get-developer.sh         # Get current developer
./.trellis/scripts/init-developer.sh <name> # Initialize developer
./.trellis/scripts/feature.sh list          # List features
./.trellis/scripts/feature.sh create <name> # Create feature
./.trellis/scripts/feature.sh archive <name># Archive feature
./.trellis/scripts/add-session.sh           # Record session
```

### Development
```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run lint          # Run linter
npm run format        # Format code
npm run type-check    # Type checking
```

### Git
```bash
git status
git log --oneline -20
git diff main...HEAD
```

---

## Critical Reminders

### DO (Follow These)

1. **Read BOTH guideline indexes** at session start (frontend AND backend)
2. **Read .trellis/workflow.md** at session start
3. **Read specific docs** before coding (based on task)
4. **Update tracking files** after work
5. **Test thoroughly** before committing
6. **Follow guidelines strictly**

### DON'T (Avoid These)

1. **Don't skip reading guideline indexes** at initialization (CRITICAL VIOLATION)
2. **Don't skip reading specific guidelines** before coding
3. **Don't exceed 2000 lines** in agent-traces files
4. **Don't commit with lint errors**
5. **Don't use non-null assertions** (`!`)
6. **Don't skip updating tracking files**
7. **Don't execute `git commit`** - AI should not commit code (only suggest)

---

## Your First Task Checklist

### Before You Start Coding

- [ ] Run `./.trellis/scripts/get-context.sh` - Understand context
- [ ] Read `.trellis/workflow.md` - Understand the workflow
- [ ] Read `.trellis/structure/[frontend|backend]/index.md` - Find relevant guidelines
- [ ] Read specific guideline docs based on your task
- [ ] Create or select a feature with `feature.sh`
- [ ] Start coding following the guidelines

### After Completing Your Work

- [ ] Run lint and type-check - Must pass
- [ ] Commit with proper message format
- [ ] Run `add-session.sh` to record session
- [ ] Archive feature if completed with `feature.sh archive`

---

## Success Criteria

You're doing well if:

- [x] All lint and type checks pass
- [x] Code follows the guidelines
- [x] Session is recorded via `add-session.sh`
- [x] Features are tracked via `feature.sh`
- [x] Commits are well-formatted
- [x] Documentation is up-to-date

---

**Ready to start? Follow the Quick Start section at the top!**
