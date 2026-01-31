---
name: trellis-meta
description: |
  Meta-skill for understanding and customizing Mindfold Trellis - the AI workflow system for Claude Code and Cursor. This skill documents the ORIGINAL Trellis system design. When users customize their Trellis installation, modifications should be recorded in a project-local `trellis-local` skill, NOT in this meta-skill. Use this skill when: (1) understanding Trellis architecture, (2) customizing Trellis workflows, (3) adding commands/agents/hooks, (4) troubleshooting issues, or (5) adapting Trellis to specific projects.
---

# Trellis Meta-Skill

## Version Compatibility

| Item | Value |
|------|-------|
| **Trellis CLI Version** | 0.3.0-beta.5 |
| **Skill Last Updated** | 2026-01-31 |
| **Min Claude Code Version** | 1.0.0+ |

> ⚠️ **Version Mismatch Warning**: If your Trellis CLI version differs from above, some features may not work as documented. Run `trellis --version` to check.

---

## Platform Compatibility

### Feature Support Matrix

| Feature | Claude Code | Cursor | OpenCode (Future) |
|---------|-------------|--------|-------------------|
| **Core Systems** | | | |
| Workspace system | ✅ Full | ✅ Full | ✅ Planned |
| Task system | ✅ Full | ✅ Full | ✅ Planned |
| Spec system | ✅ Full | ✅ Full | ✅ Planned |
| Slash commands | ✅ Full | ✅ Full | ⏳ TBD |
| Agent definitions | ✅ Full | ⚠️ Manual | ⏳ TBD |
| **Hook-Dependent Features** | | | |
| SessionStart hook | ✅ Full | ❌ None | ⏳ TBD |
| PreToolUse hook | ✅ Full | ❌ None | ⏳ TBD |
| SubagentStop hook | ✅ Full | ❌ None | ⏳ TBD |
| Auto context injection | ✅ Full | ❌ Manual | ⏳ TBD |
| Ralph Loop | ✅ Full | ❌ None | ⏳ TBD |
| **Multi-Agent/Session** | | | |
| Multi-Agent (current dir) | ✅ Full | ⚠️ Limited | ⏳ TBD |
| Multi-Session (worktrees) | ✅ Full | ❌ None | ⏳ TBD |
| `claude --resume` | ✅ Full | ❌ None | ⏳ TBD |

### Legend

- ✅ **Full**: Feature works as documented
- ⚠️ **Limited/Manual**: Works but requires manual steps
- ❌ **None**: Not supported on this platform
- ⏳ **TBD**: Under consideration for future support

### Platform-Specific Notes

#### Claude Code (Full Support)
All features work as documented. Hooks provide automatic context injection and quality enforcement.

#### Cursor (Partial Support)
- **Works**: Workspace, tasks, specs, commands (read manually)
- **Doesn't work**: Hooks, auto-injection, Ralph Loop, Multi-Session
- **Workaround**: Manually read spec files at session start; no automatic quality gates

#### OpenCode (Future Consideration)
- Need to evaluate OpenCode's extension/hook capabilities
- May require adapter layer for hook compatibility
- Core file-based systems should work once integrated

### Designing for Portability

When customizing Trellis, consider platform compatibility:

```
┌─────────────────────────────────────────────────────────────┐
│                    PORTABLE (All Platforms)                  │
│  - .trellis/workspace/    - .trellis/tasks/                 │
│  - .trellis/spec/         - .claude/commands/               │
│  - File-based configs     - JSONL context files             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                  CLAUDE CODE ONLY                            │
│  - .claude/hooks/         - .claude/settings.json hooks     │
│  - SubagentStop control   - Auto context injection          │
│  - Ralph Loop             - Multi-Session worktrees         │
│  - claude CLI features    - --resume, --agent flags         │
└─────────────────────────────────────────────────────────────┘
```

---

## Purpose

This is the **meta-skill** for Trellis - it documents the original, unmodified Trellis system. When customizing Trellis for a specific project, record changes in a **project-local skill** (`trellis-local`), keeping this meta-skill as the authoritative reference for vanilla Trellis.

## Skill Hierarchy

```
~/.claude/skills/
└── trellis-meta/              # THIS SKILL - Original Trellis documentation
                               # ⚠️ DO NOT MODIFY for project-specific changes

project/.claude/skills/
└── trellis-local/             # Project-specific customizations
                               # ✅ Record all modifications here
```

**Why this separation?**
- User may have multiple projects with different Trellis customizations
- Each project's `trellis-local` skill tracks ITS OWN modifications
- The meta-skill remains clean as the reference for original Trellis
- Enables easy upgrades: compare meta-skill with new Trellis version

---

## Self-Iteration Protocol

When modifying Trellis for a project, follow this protocol:

### 1. Check for Existing Project Skill

```bash
# Look for project-local skill
ls -la .claude/skills/trellis-local/
```

### 2. Create Project Skill if Missing

If no `trellis-local` exists, create it:

```bash
mkdir -p .claude/skills/trellis-local
```

Then create `.claude/skills/trellis-local/SKILL.md`:

```markdown
---
name: trellis-local
description: |
  Project-specific Trellis customizations for [PROJECT_NAME].
  This skill documents modifications made to the vanilla Trellis system
  in this project. Inherits from trellis-meta for base documentation.
---

# Trellis Local - [PROJECT_NAME]

## Base Version
Trellis version: X.X.X (from package.json or trellis --version)
Date initialized: YYYY-MM-DD

## Customizations

### Commands Added
(none yet)

### Agents Modified
(none yet)

### Hooks Changed
(none yet)

### Specs Customized
(none yet)

### Workflow Changes
(none yet)

---

## Changelog

### YYYY-MM-DD
- Initial setup
```

### 3. Record Every Modification

When making ANY change to Trellis, update `trellis-local/SKILL.md`:

**Example: Adding a new command**
```markdown
### Commands Added

#### /trellis:my-command
- **File**: `.claude/commands/trellis/my-command.md`
- **Purpose**: [what it does]
- **Added**: 2026-01-31
- **Why**: [reason for adding]
```

**Example: Modifying a hook**
```markdown
### Hooks Changed

#### inject-subagent-context.py
- **Change**: Added support for `my-agent` type
- **Lines modified**: 45-67
- **Date**: 2026-01-31
- **Why**: [reason]
```

### 4. Never Modify Meta-Skill for Project Changes

The `trellis-meta` skill should ONLY be updated when:
- Trellis releases a new version
- Fixing documentation errors in the original
- Adding missing documentation for original features

---

## Architecture Overview

Trellis transforms AI assistants into structured development partners through **enforced context injection**.

### System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                              │
│  /trellis:start  /trellis:parallel  /trellis:finish-work            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                         SKILLS LAYER                                 │
│  .claude/commands/trellis/*.md   (slash commands)                   │
│  .claude/agents/*.md             (sub-agent definitions)            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                          HOOKS LAYER                                 │
│  SessionStart     → session-start.py (injects workflow + context)   │
│  PreToolUse:Task  → inject-subagent-context.py (spec injection)     │
│  SubagentStop     → ralph-loop.py (quality enforcement)             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                       PERSISTENCE LAYER                              │
│  .trellis/workspace/  (journals, session history)                   │
│  .trellis/tasks/      (task tracking, context files)                │
│  .trellis/spec/       (coding guidelines)                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Specs Injected, Not Remembered** | Hooks enforce specs - agents always receive context |
| **Read Before Write** | Understand guidelines before writing code |
| **Layered Context** | Only relevant specs load (via JSONL files) |
| **Human Commits** | AI never commits - human validates first |
| **Pure Dispatcher** | Dispatch agent only orchestrates |

---

## Core Components

### 1. Workspace System

Track development progress across sessions with per-developer isolation.

```
.trellis/workspace/
├── index.md                    # Global overview
└── {developer}/                # Per-developer
    ├── index.md                # Personal index (@@@auto markers)
    └── journal-N.md            # Session journals (max 2000 lines)
```

**Key files**: `.trellis/.developer` (identity), journals (session history)

### 2. Task System

Track work items with phase-based execution.

```
.trellis/tasks/{MM-DD-slug-assignee}/
├── task.json           # Metadata, phases, branch
├── prd.md              # Requirements
├── implement.jsonl     # Context for implement agent
├── check.jsonl         # Context for check agent
└── debug.jsonl         # Context for debug agent
```

### 3. Spec System

Maintain coding standards that get injected to agents.

```
.trellis/spec/
├── frontend/           # Frontend guidelines
├── backend/            # Backend guidelines
└── guides/             # Thinking guides
```

### 4. Hooks System

Automatically inject context and enforce quality.

| Hook | When | Purpose |
|------|------|---------|
| `SessionStart` | Session begins | Inject workflow, guidelines |
| `PreToolUse:Task` | Before sub-agent | Inject specs via JSONL |
| `SubagentStop:check` | Check agent stops | Enforce verification (Ralph Loop) |

### 5. Agent System

Specialized agents for different phases.

| Agent | Purpose | Restriction |
|-------|---------|-------------|
| `dispatch` | Orchestrate pipeline | Pure dispatcher |
| `plan` | Evaluate requirements | Can reject unclear reqs |
| `research` | Find code patterns | Read-only |
| `implement` | Write code | No git commit |
| `check` | Review and self-fix | Ralph Loop controlled |
| `debug` | Fix issues | Precise fixes only |

### 6. Multi-Agent Pipeline

Run parallel isolated sessions via Git worktrees.

```
plan.py → start.py → Dispatch → implement → check → create-pr
```

---

## Customization Guide

### Adding a Command

1. Create `.claude/commands/trellis/my-command.md`
2. Update `trellis-local` skill with the change

### Adding an Agent

1. Create `.claude/agents/my-agent.md` with YAML frontmatter
2. Update `inject-subagent-context.py` to handle new agent type
3. Create `my-agent.jsonl` in task directories
4. Update `trellis-local` skill

### Modifying Hooks

1. Edit the hook script in `.claude/hooks/`
2. Document the change in `trellis-local` skill
3. Note which lines were modified and why

### Extending Specs

1. Create new category in `.trellis/spec/my-category/`
2. Add `index.md` and guideline files
3. Reference in JSONL context files
4. Update `trellis-local` skill

### Changing Task Workflow

1. Modify `next_action` array in `task.json`
2. Update dispatch or hook scripts as needed
3. Document in `trellis-local` skill

---

## Resources

Reference documents are organized by platform compatibility:

```
references/
├── core/              # All Platforms (Claude Code, Cursor, etc.)
├── claude-code/       # Claude Code Only
├── how-to-modify/     # Modification Guides
└── meta/              # Documentation & Templates
```

### `core/` - All Platforms

| Document | Content |
|----------|---------|
| `overview.md` | Core systems introduction |
| `files.md` | All `.trellis/` files with purposes |
| `workspace.md` | Workspace system, journals, developer identity |
| `tasks.md` | Task system, directories, JSONL context files |
| `specs.md` | Spec system, guidelines organization |
| `scripts.md` | Platform-independent scripts |

### `claude-code/` - Claude Code Only

| Document | Content |
|----------|---------|
| `overview.md` | Claude Code features introduction |
| `hooks.md` | Hook system, context injection |
| `agents.md` | Agent types, invocation, Task tool |
| `ralph-loop.md` | Quality enforcement mechanism |
| `multi-session.md` | Parallel worktree sessions |
| `worktree-config.md` | worktree.yaml configuration |
| `scripts.md` | Claude Code only scripts |

### `how-to-modify/` - Modification Guides

| Document | Scenario |
|----------|----------|
| `overview.md` | Quick reference for all modifications |
| `add-command.md` | Adding slash commands |
| `add-agent.md` | Adding new agent types |
| `add-spec.md` | Adding spec categories |
| `add-phase.md` | Adding workflow phases |
| `modify-hook.md` | Modifying hook behavior |
| `change-verify.md` | Changing verify commands |

### `meta/` - Documentation

| Document | Content |
|----------|---------|
| `platform-compatibility.md` | Detailed platform support matrix |
| `self-iteration-guide.md` | How to document customizations |
| `trellis-local-template.md` | Template for project-local skill |

---

## Quick Reference

### Key Scripts

| Script | Purpose |
|--------|---------|
| `get_context.py` | Get session context |
| `task.py` | Task management |
| `add_session.py` | Record session |
| `multi_agent/start.py` | Start parallel agent |

### Key Paths

| Path | Purpose |
|------|---------|
| `.trellis/.developer` | Developer identity |
| `.trellis/.current-task` | Active task pointer |
| `.trellis/workflow.md` | Main workflow docs |
| `.claude/settings.json` | Hook configuration |

---

## Upgrade Protocol

When upgrading Trellis to a new version:

1. **Compare** new meta-skill with current
2. **Review** changes in new version
3. **Check** `trellis-local` for conflicts
4. **Merge** carefully, preserving customizations
5. **Update** `trellis-local` with migration notes

```markdown
## Changelog

### 2026-02-01 - Upgraded to Trellis X.Y.Z
- Merged new hook behavior from meta-skill
- Kept custom agent `my-agent`
- Updated check.jsonl template
```
