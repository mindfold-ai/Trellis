# Hooks System

Claude Code hooks for automatic context injection and quality enforcement.

---

## Overview

Hooks intercept Claude Code lifecycle events to inject context and enforce quality.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HOOK LIFECYCLE                                 │
│                                                                          │
│  Session Start ──► SessionStart hook ──► Inject workflow context        │
│                                                                          │
│  Task() called ──► PreToolUse:Task hook ──► Inject specs from JSONL     │
│                                                                          │
│  Agent stops ──► SubagentStop hook ──► Ralph Loop verification          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### `.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.py\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/inject-subagent-context.py\"",
            "timeout": 30
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "check",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/ralph-loop.py\"",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

---

## SessionStart Hook

### Purpose

Inject initial context when a Claude Code session starts.

### Script: `session-start.py`

**Injects:**
- Developer identity from `.trellis/.developer`
- Git status and recent commits
- Current task (if `.trellis/.current-task` exists)
- `workflow.md` content
- All `spec/*/index.md` files
- Start instructions

**Output format:**
```json
{
  "result": "continue",
  "message": "# Session Context\n\n## Developer\ntaosu\n\n## Git Status\n..."
}
```

---

## PreToolUse:Task Hook

### Purpose

Inject relevant specs when a subagent is invoked.

### Script: `inject-subagent-context.py`

**Trigger:** When `Task(subagent_type="...")` is called.

**Flow:**
1. Read `subagent_type` from tool input
2. Find current task from `.trellis/.current-task`
3. Load `{subagent_type}.jsonl` from task directory
4. Read each file listed in JSONL
5. Build augmented prompt with context
6. Update `task.json` with current phase

**Output format:**
```json
{
  "result": "continue",
  "updatedInput": {
    "prompt": "# Implement Agent Task\n\n## Context\n...\n\n## Your Task\n..."
  }
}
```

### JSONL Format

```jsonl
{"file": ".trellis/spec/backend/index.md", "reason": "Backend guidelines"}
{"file": "src/services/auth.ts", "reason": "Existing pattern"}
{"file": ".trellis/tasks/01-31-add-login/prd.md", "reason": "Requirements"}
```

---

## SubagentStop Hook

### Purpose

Quality enforcement via Ralph Loop.

### Script: `ralph-loop.py`

**Trigger:** When Check Agent tries to stop.

**Flow:**
1. Read verify commands from `worktree.yaml`
2. Execute each command (pnpm lint, pnpm typecheck, etc.)
3. If all pass → allow stop
4. If any fail → block stop, agent continues

→ See [ralph-loop.md](./ralph-loop.md) for details.

---

## Hook Scripts Location

```
.claude/hooks/
├── session-start.py           # SessionStart handler
├── inject-subagent-context.py # PreToolUse:Task handler
└── ralph-loop.py              # SubagentStop:check handler
```

---

## Environment Variables

Available in hook scripts:

| Variable | Description |
|----------|-------------|
| `CLAUDE_PROJECT_DIR` | Project root directory |
| `HOOK_EVENT` | Event type (SessionStart, PreToolUse, etc.) |
| `TOOL_NAME` | Tool being called (for PreToolUse) |
| `TOOL_INPUT` | JSON string of tool input |
| `SUBAGENT_TYPE` | Agent type (for SubagentStop) |

---

## Hook Response Format

### Continue (allow operation)

```json
{
  "result": "continue",
  "message": "Optional message to inject"
}
```

### Continue with modified input

```json
{
  "result": "continue",
  "updatedInput": {
    "prompt": "Modified prompt..."
  }
}
```

### Block (prevent operation)

```json
{
  "result": "block",
  "message": "Reason for blocking"
}
```

---

## Debugging Hooks

### View hook output

```bash
# Check if hooks are configured
cat .claude/settings.json | grep -A 20 '"hooks"'

# Test session-start manually
python3 .claude/hooks/session-start.py

# Test inject-context (needs TOOL_INPUT env var)
TOOL_INPUT='{"subagent_type":"implement","prompt":"test"}' \
  python3 .claude/hooks/inject-subagent-context.py
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Hook not running | Wrong matcher | Check settings.json matcher |
| Timeout | Script too slow | Increase timeout or optimize |
| No context injected | Missing .current-task | Run `task.py start` |
| JSONL not found | Wrong task directory | Check .current-task path |
