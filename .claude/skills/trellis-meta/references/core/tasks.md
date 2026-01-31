# Task System

Track work items with phase-based execution.

---

## Directory Structure

```
.trellis/tasks/
├── {MM-DD-slug-assignee}/      # Active task directories
│   ├── task.json               # Metadata, phases, branch
│   ├── prd.md                  # Requirements document
│   ├── info.md                 # Additional context (optional)
│   ├── implement.jsonl         # Context for implement phase
│   ├── check.jsonl             # Context for check phase
│   └── debug.jsonl             # Context for debug phase
│
└── archive/                    # Completed tasks
    └── {YYYY-MM}/
        └── {task-dir}/
```

---

## Task Directory Naming

Format: `{MM-DD}-{slug}-{assignee}`

Examples:
- `01-31-add-login-taosu`
- `02-01-fix-api-bug-cursor-agent`

---

## task.json

Task metadata and workflow configuration.

```json
{
  "name": "Add user login",
  "slug": "add-login",
  "created": "2026-01-31T10:30:00",
  "assignee": "taosu",
  "status": "active",
  "dev_type": "fullstack",
  "scope": ["frontend", "backend"],
  "branch": "feature/add-login",
  "base_branch": "main",
  "current_phase": 1,
  "next_action": [
    {"phase": 1, "action": "implement"},
    {"phase": 2, "action": "check"},
    {"phase": 3, "action": "finish"}
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable task name |
| `slug` | string | URL-safe identifier |
| `created` | ISO date | Creation timestamp |
| `assignee` | string | Developer name |
| `status` | string | `active`, `paused`, `completed` |
| `dev_type` | string | `frontend`, `backend`, `fullstack` |
| `scope` | array | Affected areas |
| `branch` | string | Git branch name |
| `base_branch` | string | Branch to merge into |
| `current_phase` | number | Current workflow phase |
| `next_action` | array | Workflow phases |

---

## prd.md

Requirements document for the task.

```markdown
# Add User Login

## Overview
Implement user authentication with email/password.

## Requirements
1. Login form with email and password fields
2. Form validation
3. API endpoint for authentication
4. Session management

## Acceptance Criteria
- [ ] User can log in with valid credentials
- [ ] Error shown for invalid credentials
- [ ] Session persists across page refresh

## Technical Notes
- Use existing auth service pattern
- Follow security guidelines in spec
```

---

## JSONL Context Files

List files to inject as context for each phase.

### Format

```jsonl
{"file": ".trellis/spec/backend/index.md", "reason": "Backend guidelines"}
{"file": "src/services/auth.ts", "reason": "Existing auth service"}
{"file": ".trellis/tasks/01-31-add-login/prd.md", "reason": "Requirements"}
```

### Files

| File | Phase | Purpose |
|------|-------|---------|
| `implement.jsonl` | implement | Dev specs, patterns to follow |
| `check.jsonl` | check | Quality criteria, review specs |
| `debug.jsonl` | debug | Debug context, error reports |

---

## Current Task Pointer

### `.trellis/.current-task`

Points to active task directory.

```
.trellis/tasks/01-31-add-login-taosu
```

### Set Current Task

```bash
python3 .trellis/scripts/task.py start <task-dir>
```

### Clear Current Task

```bash
python3 .trellis/scripts/task.py stop
```

---

## Task CLI

### Create Task

```bash
python3 .trellis/scripts/task.py create "Task name" --slug task-slug
```

### List Tasks

```bash
python3 .trellis/scripts/task.py list
```

### Start Task

```bash
python3 .trellis/scripts/task.py start <task-dir>
```

### Initialize Context

```bash
python3 .trellis/scripts/task.py init-context <task-dir> <dev-type>
```

Dev types: `frontend`, `backend`, `fullstack`

### Archive Task

```bash
python3 .trellis/scripts/task.py archive <task-dir>
```

---

## Workflow Phases

Standard phase progression:

```
1. implement  →  Write code
2. check      →  Review and fix
3. finish     →  Final verification
4. create-pr  →  Create pull request (Multi-Session only)
```

### Custom Phases

Modify `next_action` in task.json:

```json
"next_action": [
  {"phase": 1, "action": "research"},
  {"phase": 2, "action": "implement"},
  {"phase": 3, "action": "check"}
]
```

---

## Best Practices

1. **One task at a time** - Use `.current-task` to track focus
2. **Clear PRDs** - Write specific, testable requirements
3. **Relevant context** - Only include needed files in JSONL
4. **Archive completed** - Keep task directory clean
