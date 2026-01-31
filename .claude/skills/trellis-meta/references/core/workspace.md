# Workspace System

Track development progress across sessions with per-developer isolation.

---

## Directory Structure

```
.trellis/workspace/
├── index.md                    # Global overview
└── {developer}/                # Per-developer directory
    ├── index.md                # Personal index with @@@auto markers
    ├── journal-1.md            # Session journal (max 2000 lines)
    ├── journal-2.md            # Rolls over when limit reached
    └── ...
```

---

## Developer Identity

### `.trellis/.developer`

Stores current developer name. Created by `init_developer.py`.

```
taosu
```

### Initialize Developer

```bash
python3 .trellis/scripts/init_developer.py <name>
```

Creates:
- `.trellis/.developer` - Identity file
- `.trellis/workspace/<name>/` - Personal workspace
- `.trellis/workspace/<name>/index.md` - Personal index
- `.trellis/workspace/<name>/journal-1.md` - First journal

---

## Journals

### Purpose

Track session history, decisions, and context.

### Format

```markdown
# Journal 1

## Session: 2026-01-31 10:30

### Context
- Working on: [task description]
- Branch: feature/add-login

### Progress
- [x] Completed step 1
- [ ] Working on step 2

### Notes
Key decisions and learnings...

---
```

### Journal Rotation

When journal exceeds 2000 lines:
1. Archive current (append to index)
2. Create new journal-N.md
3. Continue writing

---

## Personal Index

### `workspace/{developer}/index.md`

Tracks all sessions and provides quick reference.

```markdown
# Developer Workspace - taosu

## Active Work
- Current task: `.trellis/tasks/01-31-add-login-taosu`
- Branch: feature/add-login

## Recent Sessions
<!-- @@@auto-sessions-start -->
- 2026-01-31: Implemented login UI
- 2026-01-30: Set up auth service
<!-- @@@auto-sessions-end -->

## Journals
- journal-1.md (lines 1-2000)
- journal-2.md (current)
```

### @@@auto Markers

Scripts use these markers to auto-update sections:
- `@@@auto-sessions-start/end` - Recent sessions list
- `@@@auto-tasks-start/end` - Task summaries

---

## Global Index

### `workspace/index.md`

Overview of all developers and project status.

```markdown
# Project Workspace

## Developers
- taosu - Last active: 2026-01-31
- cursor-agent - Last active: 2026-01-30

## Recent Activity
...
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `init_developer.py` | Initialize developer identity |
| `get_developer.py` | Get current developer name |
| `add_session.py` | Record session to journal |
| `get_context.py` | Get session context for AI |

---

## Best Practices

1. **One developer per machine** - Identity stored in `.developer`
2. **Regular journaling** - Record decisions and context
3. **Use markers** - Let scripts auto-update indexes
4. **Review journals** - Before starting new sessions
