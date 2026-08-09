# Task System

Track work items with phase-based execution.

---

## Directory Structure

```
.trellis/tasks/
├── {MM-DD-slug}/               # Active task directories
│   ├── task.json               # Metadata, phases, branch
│   ├── prd.md                  # Requirements document
│   ├── design.md               # Technical design for complex tasks
│   ├── implement.md            # Execution plan for complex tasks
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

Format: `{MM-DD}-{slug}`

Examples:
- `01-31-add-login`
- `02-01-fix-api-bug`

---

## task.json

Task metadata and workflow configuration.

```json
{
  "id": "add-login",
  "name": "add-login",
  "title": "Add user login",
  "description": "",
  "status": "planning",
  "dev_type": null,
  "scope": null,
  "priority": "P2",
  "creator": "taosu",
  "assignee": "taosu",
  "createdAt": "2026-01-31",
  "completedAt": null,
  "branch": null,
  "base_branch": "main",
  "worktree_path": null,
  "current_phase": 0,
  "next_action": [
    {"phase": 1, "action": "implement"},
    {"phase": 2, "action": "check"},
    {"phase": 3, "action": "finish"},
    {"phase": 4, "action": "create-pr"}
  ],
  "commit": null,
  "pr_url": null,
  "subtasks": [],
  "children": [],
  "parent": null,
  "relatedFiles": [],
  "notes": "",
  "meta": {}
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Slug identifier |
| `name` | string | Slug identifier (same as id) |
| `title` | string | Human-readable task title |
| `description` | string | Task description |
| `status` | string | `planning`, `in_progress`, `completed`, `rejected` |
| `dev_type` | string\|null | `frontend`, `backend`, `fullstack`, `test`, `docs` |
| `scope` | string\|null | Scope for PR title |
| `priority` | string | `P0`, `P1`, `P2`, `P3` |
| `creator` | string | Developer who created the task |
| `assignee` | string | Developer assigned to the task |
| `createdAt` | string | Creation date (YYYY-MM-DD) |
| `completedAt` | string\|null | Completion date |
| `branch` | string\|null | Git branch name |
| `base_branch` | string | Branch to merge into |
| `worktree_path` | string\|null | Git worktree path (multi-agent) |
| `current_phase` | number | Current workflow phase |
| `next_action` | array | Workflow phases |
| `commit` | string\|null | Commit hash |
| `pr_url` | string\|null | Pull request URL |
| `subtasks` | array | Deprecated (legacy bootstrap format) |
| `children` | string[] | Child task directory names |
| `parent` | string\|null | Parent task directory name |
| `relatedFiles` | string[] | Related file paths |
| `notes` | string | Free-text notes |
| `meta` | object | Extensible metadata for integrations (e.g. `linear_id`, `jira_ticket`) |

---

## prd.md

Requirements document for the task.

```markdown
# Add User Login

## Goal
Implement user authentication with email/password.

## Requirements
- Login form with email and password fields
- Form validation
- API endpoint for authentication

## Acceptance Criteria
- [ ] User can log in with valid credentials
- [ ] Error shown for invalid credentials

## Research References
- Link to relevant research/spec notes
```

---

## JSONL Context Files

List files to inject as context for each phase.

### Format

```jsonl
{"file": ".trellis/spec/cli/backend/index.md", "reason": "Backend guidelines"}
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

## Session-Scoped Active Task

### `.trellis/.runtime/sessions/<session-key>.json`

Stores the active task for one AI session/window.

```json
{
  "current_task": ".trellis/tasks/01-31-add-login"
}
```

### Set Active Task

```bash
python3 .trellis/scripts/task.py start <task-dir>
```

### Clear Current Task

```bash
python3 .trellis/scripts/task.py finish
```

---

## Task CLI

### Create Task

```bash
python3 .trellis/scripts/task.py create "Task name" --description "What this task delivers" --slug task-slug
python3 .trellis/scripts/task.py create "Child task" --description "What this child delivers" --slug child --parent <parent-dir>
```

Options: `--assignee <name>`, `--priority P0|P1|P2|P3`, `--description "text"`, `--parent <dir>`

### List Tasks

```bash
python3 .trellis/scripts/task.py list
python3 .trellis/scripts/task.py list --mine
python3 .trellis/scripts/task.py list --status planning
```

Tasks with a `parent` are displayed indented under their parent.
Parent tasks show children progress: `(planning) [2/3 done]`.

### Start Task

```bash
python3 .trellis/scripts/task.py start <task-dir>
```

### Finish (Clear Current Task)

```bash
python3 .trellis/scripts/task.py finish
```

### Initialize Context

```bash
python3 .trellis/scripts/task.py init-context <task-dir> <dev-type>
```

Dev types: `frontend`, `backend`, `fullstack`, `test`, `docs`

### Add Subtask

```bash
python3 .trellis/scripts/task.py add-subtask <parent-dir> <child-dir>
```

Links an existing task as a child of another task. Errors if the child already has a parent.

### Remove Subtask

```bash
python3 .trellis/scripts/task.py remove-subtask <parent-dir> <child-dir>
```

Removes the parent-child link between two tasks.

### Archive Task

```bash
python3 .trellis/scripts/task.py archive <task-dir>
```

When archiving a child task, the child name remains in the parent's `children` list. The list is historical so parent progress stays stable after completed children move to `archive/`.

When archiving a parent task, active children remain in place and keep their own task data. Do not archive a parent as a substitute for finishing or reviewing its child deliverables.

### Other Commands

```bash
python3 .trellis/scripts/task.py set-branch <dir> <branch>
python3 .trellis/scripts/task.py set-base-branch <dir> <branch>
python3 .trellis/scripts/task.py set-scope <dir> <scope>
python3 .trellis/scripts/task.py add-context <dir> <jsonl> <path> [reason]
python3 .trellis/scripts/task.py validate <dir>
python3 .trellis/scripts/task.py list-context <dir>
python3 .trellis/scripts/task.py list-archive [month]
python3 .trellis/scripts/task.py create-pr [dir] [--dry-run]
```

---

## get_context.py

Display session runtime including task information.

```bash
python3 .trellis/scripts/get_context.py                      # Default text (full context)
python3 .trellis/scripts/get_context.py --json                # Default JSON
python3 .trellis/scripts/get_context.py --mode record         # Record text (my tasks focus)
python3 .trellis/scripts/get_context.py --mode record --json  # Record JSON
```

`--mode` controls content scope, `--json` controls output format. Can be combined.

---

## Workflow Phases

Standard phase progression:

```
1. implement  →  Write code
2. check      →  Review and fix
3. finish     →  Final verification
4. create-pr  →  Create pull request (Multi-Agent only)
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

1. **Session-local focus** - Use `task.py start` in each AI session/window
2. **Clear PRDs** - Write specific, testable requirements
3. **Relevant context** - Only include needed files in JSONL
4. **Archive completed** - Keep task directory clean
5. **Use child tasks** - Break complex tasks into independently verifiable children; write dependency ordering in the child task artifacts, not just in the tree shape
