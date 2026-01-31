# How To: Add Workflow Phase

Add a new phase to the task workflow pipeline.

**Platform**: Claude Code only

---

## Files to Modify

| File | Action | Required |
|------|--------|----------|
| Task `task.json` | Modify | Yes |
| `.claude/agents/dispatch.md` | Modify | Yes |
| `.claude/agents/{new-agent}.md` | Create | If new agent |
| `inject-subagent-context.py` | Modify | If new agent |
| `trellis-local/SKILL.md` | Update | Yes |

---

## Standard Phases

Default workflow:

```
implement → check → finish → create-pr
```

---

## Step 1: Update task.json

Modify the `next_action` array in task.json:

### Add Phase After Implement

```json
{
  "next_action": [
    {"phase": 1, "action": "implement"},
    {"phase": 2, "action": "review"},      // New phase
    {"phase": 3, "action": "check"},
    {"phase": 4, "action": "finish"},
    {"phase": 5, "action": "create-pr"}
  ]
}
```

### Add Phase Before Implement

```json
{
  "next_action": [
    {"phase": 1, "action": "design"},      // New phase
    {"phase": 2, "action": "implement"},
    {"phase": 3, "action": "check"},
    {"phase": 4, "action": "finish"}
  ]
}
```

---

## Step 2: Update Dispatch Agent

Edit `.claude/agents/dispatch.md`:

### Add Phase Handling

```markdown
## Phase Handling

### implement Phase
...existing...

### review Phase (NEW)
- Purpose: Review implementation before check
- Call: `Task(subagent_type="review")`
- Next: Proceed to check phase

### check Phase
...existing...
```

### Update Workflow Description

```markdown
## Workflow

1. Read task.json for next_action
2. Execute phases in order:
   - implement: Write code
   - review: Review implementation (NEW)
   - check: Quality verification
   - finish: Final review
   - create-pr: Create pull request
```

---

## Step 3: Create Agent (If New)

If the phase uses a new agent, create the agent definition.

→ See `add-agent.md` for full details.

Quick version:

```markdown
---
name: review
description: Review implementation before check phase.
tools: Read, Glob, Grep
---

# Review Agent

## Core Responsibilities
1. Review code changes
2. Check against requirements
3. Identify issues before check phase

## Forbidden Operations
- Writing code (that's implement's job)
- Git operations
```

---

## Step 4: Update Hook (If New Agent)

If using a new agent, update `inject-subagent-context.py`:

```python
AGENT_REVIEW = "review"
AGENTS_ALL = (..., AGENT_REVIEW)

def get_review_context(repo_root, task_dir):
    # Load review.jsonl
    ...

elif subagent_type == AGENT_REVIEW:
    context = get_review_context(repo_root, task_dir)
    ...
```

---

## Step 5: Update Task Templates

Update default task.json creation in `task.py`:

```python
default_next_action = [
    {"phase": 1, "action": "implement"},
    {"phase": 2, "action": "review"},     # Add new phase
    {"phase": 3, "action": "check"},
    {"phase": 4, "action": "finish"},
]
```

---

## Step 6: Document in trellis-local

```markdown
## Workflow Changes

### Added review Phase
- **Position**: After implement, before check
- **Agent**: review
- **Purpose**: Review implementation quality
- **Date**: 2026-01-31
- **Reason**: Catch issues before check phase
```

---

## Common Phase Patterns

### Design → Implement → Check

```json
"next_action": [
  {"phase": 1, "action": "design"},
  {"phase": 2, "action": "implement"},
  {"phase": 3, "action": "check"}
]
```

### Implement → Test → Check

```json
"next_action": [
  {"phase": 1, "action": "implement"},
  {"phase": 2, "action": "test"},
  {"phase": 3, "action": "check"}
]
```

### Research → Implement → Check

```json
"next_action": [
  {"phase": 1, "action": "research"},
  {"phase": 2, "action": "implement"},
  {"phase": 3, "action": "check"}
]
```

---

## Testing

1. Create task with new phase in next_action
2. Set as current task
3. Run dispatch agent
4. Verify phases execute in order
5. Verify new phase works correctly

---

## Checklist

- [ ] task.json updated with new phase
- [ ] dispatch.md updated with phase handling
- [ ] Agent created (if new)
- [ ] Hook updated (if new agent)
- [ ] Task templates updated
- [ ] Documented in trellis-local
- [ ] Tested workflow
