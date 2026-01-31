# Claude Code Scripts

Scripts that require Claude Code CLI and hook system.

---

## Overview

These scripts require:
- `claude` CLI command
- Hook system for context injection
- `--resume` for session persistence

```
.trellis/scripts/
├── common/
│   ├── worktree.py         # Worktree utilities
│   └── registry.py         # Agent registry
│
└── multi_agent/            # Multi-Session scripts
    ├── plan.py             # Launch Plan agent
    ├── start.py            # Start worktree agent
    ├── status.py           # Monitor agents
    ├── create_pr.py        # Create pull request
    └── cleanup.py          # Cleanup worktree
```

---

## Multi-Session Scripts

### `multi_agent/plan.py`

Launch Plan Agent to create task configuration.

```bash
python3 .trellis/scripts/multi_agent/plan.py \
  --name <task-name> \
  --type <dev-type> \
  --requirement "<requirement text>"
```

**Options:**
- `--name` - Task slug
- `--type` - `frontend`, `backend`, `fullstack`
- `--requirement` - Task description

**Actions:**
1. Creates task directory
2. Launches Plan Agent via `claude`
3. Plan Agent can REJECT unclear requirements
4. Creates `prd.md`, `task.json`, JSONL files

---

### `multi_agent/start.py`

Start agent in a new worktree.

```bash
python3 .trellis/scripts/multi_agent/start.py <task-dir>
```

**Actions:**
1. Read `task.json` for branch name
2. Create git worktree:
   ```bash
   git worktree add -b <branch> ../worktrees/<branch>
   ```
3. Copy files from `worktree.yaml` copy list
4. Copy task directory to worktree
5. Run `post_create` commands
6. Set `.trellis/.current-task`
7. Start Claude Dispatch Agent:
   ```bash
   claude -p --agent dispatch \
     --session-id <uuid> \
     --dangerously-skip-permissions \
     --output-format stream-json \
     "Start the pipeline"
   ```
8. Register to `registry.json`

---

### `multi_agent/status.py`

Monitor running sessions.

```bash
# Overview of all sessions
python3 .trellis/scripts/multi_agent/status.py

# Detailed view
python3 .trellis/scripts/multi_agent/status.py --detail <task-name>

# Watch mode (auto-refresh)
python3 .trellis/scripts/multi_agent/status.py --watch <task-name>

# View logs
python3 .trellis/scripts/multi_agent/status.py --log <task-name>

# Show registry
python3 .trellis/scripts/multi_agent/status.py --registry
```

**Output:**
```
Active Sessions:
┌──────────────┬──────────┬────────────────┬──────────┬───────────┐
│ Task         │ Status   │ Phase          │ Elapsed  │ Files     │
├──────────────┼──────────┼────────────────┼──────────┼───────────┤
│ add-login    │ Running  │ 2/4 (check)    │ 15m 32s  │ 5 changed │
│ fix-api      │ Stopped  │ 1/4 (implement)│ 8m 15s   │ 2 changed │
└──────────────┴──────────┴────────────────┴──────────┴───────────┘
```

---

### `multi_agent/create_pr.py`

Create pull request from worktree changes.

```bash
python3 .trellis/scripts/multi_agent/create_pr.py [--dry-run]
```

**Actions:**
1. Stage changes: `git add -A`
2. Exclude workspace: `git reset .trellis/workspace/`
3. Commit with conventional format
4. Push to remote
5. Create Draft PR via `gh pr create --draft`
6. Update task.json with `pr_url`

---

### `multi_agent/cleanup.py`

Clean up completed worktrees.

```bash
# Specific worktree
python3 .trellis/scripts/multi_agent/cleanup.py <branch-name>

# All merged worktrees
python3 .trellis/scripts/multi_agent/cleanup.py --merged

# All worktrees (with confirmation)
python3 .trellis/scripts/multi_agent/cleanup.py --all
```

**Actions:**
1. Archive task to `.trellis/tasks/archive/YYYY-MM/`
2. Remove from registry
3. Remove worktree: `git worktree remove <path>`
4. Optionally delete branch

---

## Common Utilities

### `common/worktree.py`

Worktree management utilities.

```python
from common.worktree import (
    read_worktree_config,  # Read worktree.yaml
    get_worktree_path,     # Get path for branch
    create_worktree,       # Create new worktree
    remove_worktree,       # Remove worktree
)
```

### `common/registry.py`

Agent registry for tracking running sessions.

```python
from common.registry import (
    registry_add_agent,       # Add agent to registry
    registry_remove_by_id,    # Remove by agent ID
    registry_remove_by_worktree,  # Remove by path
    registry_search_agent,    # Search by pattern
    registry_list_agents,     # List all agents
)
```

**Registry file:** `.trellis/workspace/<developer>/.agents/registry.json`

```json
{
  "agents": [
    {
      "id": "feature-add-login",
      "worktree_path": "/abs/path/to/worktrees/feature/add-login",
      "pid": 12345,
      "started_at": "2026-01-31T10:30:00",
      "task_dir": ".trellis/tasks/01-31-add-login-taosu"
    }
  ]
}
```

---

## Claude CLI Usage

### Agent Mode

```bash
claude --agent dispatch "Start the pipeline"
```

### Print Mode (non-interactive)

```bash
claude -p "Do something"
```

### Session Resume

```bash
claude --resume <session-id>
```

### Automation Mode

```bash
claude --dangerously-skip-permissions -p "..."
```

### JSON Output

```bash
claude --output-format stream-json -p "..."
```

---

## Resuming Stopped Sessions

```bash
# Find session info
python3 .trellis/scripts/multi_agent/status.py --detail <task-name>

# Resume in worktree
cd ../worktrees/feature/task-name
claude --resume <session-id>
```
