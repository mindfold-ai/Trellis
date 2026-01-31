# Core Scripts

Platform-independent Python scripts for Trellis automation.

---

## Overview

These scripts work on all platforms - they only read/write files and don't require Claude Code's hook system.

```
.trellis/scripts/
├── common/                 # Shared utilities
│   ├── paths.py
│   ├── developer.py
│   ├── task_utils.py
│   ├── phase.py
│   └── git_context.py
│
├── init_developer.py       # Initialize developer
├── get_developer.py        # Get developer name
├── get_context.py          # Get session context
├── task.py                 # Task management CLI
└── add_session.py          # Record session
```

---

## Developer Scripts

### `init_developer.py`

Initialize developer identity.

```bash
python3 .trellis/scripts/init_developer.py <name>
```

**Creates:**
- `.trellis/.developer`
- `.trellis/workspace/<name>/`
- `.trellis/workspace/<name>/index.md`
- `.trellis/workspace/<name>/journal-1.md`

---

### `get_developer.py`

Get current developer name.

```bash
python3 .trellis/scripts/get_developer.py
# Output: taosu
```

**Exit codes:**
- `0` - Success
- `1` - Not initialized

---

## Context Scripts

### `get_context.py`

Get session context for AI consumption.

```bash
python3 .trellis/scripts/get_context.py
```

**Output includes:**
- Developer identity
- Git status and recent commits
- Current task (if any)
- Workspace summary

---

### `add_session.py`

Record session entry to journal.

```bash
python3 .trellis/scripts/add_session.py "Session summary"
```

**Actions:**
1. Appends to current journal
2. Updates index markers
3. Rotates journal if needed

---

## Task Scripts

### `task.py`

Task management CLI.

#### Create Task

```bash
python3 .trellis/scripts/task.py create "Task name" --slug task-slug
```

**Options:**
- `--slug` - URL-safe identifier
- `--assignee` - Developer name (default: current)
- `--type` - Dev type: frontend, backend, fullstack

#### List Tasks

```bash
python3 .trellis/scripts/task.py list
```

**Output:**
```
Active Tasks:
  01-31-add-login-taosu (active)
  01-30-fix-api-cursor-agent (paused)
```

#### Start Task

```bash
python3 .trellis/scripts/task.py start <task-dir>
```

Sets `.trellis/.current-task` to the task directory.

#### Stop Task

```bash
python3 .trellis/scripts/task.py stop
```

Clears `.trellis/.current-task`.

#### Initialize Context

```bash
python3 .trellis/scripts/task.py init-context <task-dir> <dev-type>
```

**Dev types:** `frontend`, `backend`, `fullstack`

Creates JSONL files with appropriate spec references.

#### Set Branch

```bash
python3 .trellis/scripts/task.py set-branch <task-dir> <branch-name>
```

Updates `branch` field in task.json.

#### Archive Task

```bash
python3 .trellis/scripts/task.py archive <task-dir>
```

Moves task to `.trellis/tasks/archive/YYYY-MM/`.

#### List Archive

```bash
python3 .trellis/scripts/task.py list-archive [month]
```

---

## Common Utilities

### `common/paths.py`

Path constants and utilities.

```python
from common.paths import (
    TRELLIS_DIR,      # .trellis/
    WORKSPACE_DIR,    # .trellis/workspace/
    TASKS_DIR,        # .trellis/tasks/
    SPEC_DIR,         # .trellis/spec/
)
```

### `common/developer.py`

Developer management.

```python
from common.developer import (
    get_developer,     # Get current developer name
    get_workspace_dir, # Get developer's workspace directory
)
```

### `common/task_utils.py`

Task lookup functions.

```python
from common.task_utils import (
    get_current_task,  # Get current task directory
    load_task_json,    # Load task.json
    save_task_json,    # Save task.json
)
```

### `common/phase.py`

Phase tracking.

```python
from common.phase import (
    get_current_phase,  # Get current phase number
    advance_phase,      # Move to next phase
)
```

### `common/git_context.py`

Git context generation.

```python
from common.git_context import (
    get_git_status,     # Get git status
    get_recent_commits, # Get recent commit messages
    get_branch_name,    # Get current branch
)
```

---

## Usage Examples

### Initialize New Developer

```bash
cd /path/to/project
python3 .trellis/scripts/init_developer.py john-doe
```

### Create and Start Task

```bash
# Create task
python3 .trellis/scripts/task.py create "Add user login" --slug add-login

# Initialize context for fullstack work
python3 .trellis/scripts/task.py init-context \
  .trellis/tasks/01-31-add-login-john-doe fullstack

# Start task
python3 .trellis/scripts/task.py start \
  .trellis/tasks/01-31-add-login-john-doe
```

### Record Session

```bash
python3 .trellis/scripts/add_session.py "Implemented login form, pending API integration"
```

### Archive Completed Task

```bash
python3 .trellis/scripts/task.py archive \
  .trellis/tasks/01-31-add-login-john-doe
```
