# Trellis File Reference

Complete reference of all files in the `.trellis/` directory.

---

## Directory Structure

```
.trellis/
├── .developer              # Developer identity (gitignored)
├── .current-task           # Active task pointer (gitignored)
├── .ralph-state.json       # Ralph Loop state (gitignored)
├── .template-hashes.json   # Template version tracking
├── .version                # Installed Trellis version
├── .gitignore              # Git ignore rules
├── workflow.md             # Main workflow documentation
├── worktree.yaml           # Multi-session configuration
│
├── workspace/              # Developer workspaces
├── tasks/                  # Task tracking
├── spec/                   # Coding guidelines
└── scripts/                # Automation scripts
```

---

## Root Files

### `.developer`

**Purpose**: Store current developer identity.

**Created by**: `init_developer.py`

**Format**: Plain text, single line with developer name.

```
taosu
```

**Gitignored**: Yes - each machine has its own identity.

---

### `.current-task`

**Purpose**: Point to the active task directory.

**Created by**: `task.py start <task-dir>`

**Format**: Plain text, relative path to task directory.

```
.trellis/tasks/01-31-add-login-taosu
```

**Gitignored**: Yes - each developer works on different tasks.

**Used by**:
- Hooks read this to find task context
- Scripts use this for current task operations

---

### `.ralph-state.json`

**Purpose**: Track Ralph Loop iteration state.

**Created by**: `ralph-loop.py` (Claude Code only)

**Format**: JSON

```json
{
  "task": ".trellis/tasks/01-31-add-login",
  "iteration": 2,
  "started_at": "2026-01-31T10:30:00"
}
```

**Gitignored**: Yes - runtime state.

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `task` | string | Task directory path |
| `iteration` | number | Current iteration (1-5) |
| `started_at` | ISO date | When loop started |

---

### `.template-hashes.json`

**Purpose**: Track template file versions for `trellis update`.

**Created by**: `trellis init` or `trellis update`

**Format**: JSON object mapping file paths to SHA-256 hashes.

```json
{
  ".trellis/workflow.md": "028891d1fe839a266...",
  ".claude/hooks/session-start.py": "0a9899e80f6bfe15...",
  ".claude/commands/start.md": "d1276dcbff880299..."
}
```

**Used by**:
- `trellis update` - Detect which files have been modified
- Determines if files can be auto-updated or need conflict resolution

**Behavior**:
- File hash matches template → Safe to update
- File hash differs → User modified, needs manual merge

---

### `.version`

**Purpose**: Track installed Trellis CLI version.

**Created by**: `trellis init` or `trellis update`

**Format**: Plain text, semver version string.

```
0.3.0-beta.5
```

**Used by**:
- `trellis update` - Determine if update is needed
- Version mismatch detection

---

### `.gitignore`

**Purpose**: Define which files to exclude from git.

**Default content**:
```gitignore
# Developer identity (local only)
.developer

# Current task pointer
.current-task

# Ralph Loop state
.ralph-state.json

# Agent runtime files
.agents/
.agent-log
.agent-runner.sh
.session-id

# Task directory runtime files
.plan-log

# Atomic update temp files
*.tmp
.backup-*
*.new

# Python cache
**/__pycache__/
**/*.pyc
```

---

### `workflow.md`

**Purpose**: Main workflow documentation for developers and AI.

**Created by**: `trellis init`

**Content sections**:
1. Quick Start guide
2. Workflow overview
3. Session start process
4. Development process
5. Session end
6. File descriptions
7. Best practices

**Injected by**: `session-start.py` hook (Claude Code)

**For Cursor**: Read manually at session start.

---

### `worktree.yaml`

**Purpose**: Configure Multi-Session and Ralph Loop.

**Created by**: `trellis init`

**Format**: YAML

```yaml
worktree_dir: ../worktrees
copy:
  - .trellis/.developer
  - .env
post_create:
  - npm install
verify:
  - pnpm lint
  - pnpm typecheck
```

→ See `claude-code/worktree-config.md` for details.

---

## Runtime Files (Gitignored)

### `.agents/`

**Purpose**: Agent registry for Multi-Session.

**Location**: `.trellis/workspace/{developer}/.agents/`

**Content**: `registry.json` tracking running agents.

---

### `.session-id`

**Purpose**: Store Claude Code session ID for resume.

**Created by**: Multi-Session `start.py`

**Format**: UUID string.

---

### `.agent-log`

**Purpose**: Agent execution log.

**Created by**: Multi-Session scripts.

---

### `.plan-log`

**Purpose**: Plan Agent execution log.

**Location**: Task directory.

---

## Directories

### `workspace/`

Developer workspaces with journals and indexes.

→ See `core/workspace.md`

### `tasks/`

Task directories with PRDs and context files.

→ See `core/tasks.md`

### `spec/`

Coding guidelines and specifications.

→ See `core/specs.md`

### `scripts/`

Automation scripts.

→ See `core/scripts.md` and `claude-code/scripts.md`

---

## Template Files

These files are managed by `trellis update`:

| File | Purpose |
|------|---------|
| `.trellis/workflow.md` | Workflow documentation |
| `.trellis/worktree.yaml` | Multi-session config |
| `.trellis/.gitignore` | Git ignore rules |
| `.claude/hooks/*.py` | Hook scripts |
| `.claude/commands/*.md` | Slash commands |
| `.claude/agents/*.md` | Agent definitions |
| `.cursor/commands/*.md` | Cursor commands (mirror) |

**Update behavior**:
1. Compare file hash with `.template-hashes.json`
2. If unchanged → Auto-update
3. If modified → Create `.new` file for manual merge
4. Update hashes after successful update

---

## File Lifecycle

### Created by `trellis init`

```
.trellis/
├── .template-hashes.json
├── .version
├── .gitignore
├── workflow.md
├── worktree.yaml
├── spec/
│   ├── frontend/
│   ├── backend/
│   └── guides/
└── scripts/
```

### Created at runtime

```
.trellis/
├── .developer           # init_developer.py
├── .current-task        # task.py start
├── .ralph-state.json    # ralph-loop.py
├── workspace/{dev}/     # init_developer.py
│   ├── index.md
│   ├── journal-1.md
│   └── .agents/
└── tasks/{task}/        # task.py create
    ├── task.json
    ├── prd.md
    └── *.jsonl
```

### Cleaned up

```
# After task completion
.trellis/tasks/{task}/ → .trellis/tasks/archive/YYYY-MM/

# After worktree removal
.agents/registry.json entries removed
```
