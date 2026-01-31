# How To: Add Agent

Add a new agent type like `my-agent`.

**Platform**: Claude Code only

---

## Files to Modify

| File | Action | Required |
|------|--------|----------|
| `.claude/agents/my-agent.md` | Create | Yes |
| `.claude/hooks/inject-subagent-context.py` | Modify | Yes |
| `.trellis/tasks/{template}/my-agent.jsonl` | Create | Yes |
| `trellis-local/SKILL.md` | Update | Yes |
| `.claude/agents/dispatch.md` | Modify | If adding to pipeline |

---

## Step 1: Create Agent Definition

Create `.claude/agents/my-agent.md`:

```markdown
---
name: my-agent
description: |
  What this agent specializes in.
  When it should be used.
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---

# My Agent

## Core Responsibilities

1. Primary responsibility
2. Secondary responsibility
3. ...

## Workflow

1. First step
2. Second step
3. ...

## Forbidden Operations

- Thing 1 (why it's forbidden)
- Thing 2 (why it's forbidden)
- git commit (unless explicitly allowed)

## Output Format

What the agent should produce.
```

### Agent Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent identifier |
| `description` | Yes | What the agent does |
| `tools` | Yes | Allowed tools |
| `model` | No | Model to use (opus, sonnet) |

---

## Step 2: Update Hook

Edit `.claude/hooks/inject-subagent-context.py`:

### Add Constant

```python
# Near other agent constants
AGENT_MY_AGENT = "my-agent"

# Add to list
AGENTS_ALL = (..., AGENT_MY_AGENT)
```

### Add Context Function

```python
def get_my_agent_context(repo_root: str, task_dir: str) -> list:
    """Get context for my-agent."""
    context_files = []

    # Load from JSONL
    jsonl_path = os.path.join(task_dir, "my-agent.jsonl")
    if os.path.exists(jsonl_path):
        context_files.extend(load_jsonl_context(jsonl_path))

    # Add any additional files
    # context_files.append({"file": "...", "reason": "..."})

    return context_files
```

### Add to Main Switch

```python
elif subagent_type == AGENT_MY_AGENT:
    context = get_my_agent_context(repo_root, task_dir)
    new_prompt = build_agent_prompt(
        agent_name="My Agent",
        original_prompt=original_prompt,
        context=context
    )
```

---

## Step 3: Create JSONL Template

Create context template for task directories.

**Option A**: Add to `task.py init-context`:

```python
def init_my_agent_context(task_dir, dev_type):
    jsonl_path = os.path.join(task_dir, "my-agent.jsonl")
    with open(jsonl_path, "w") as f:
        # Add relevant specs
        f.write(json.dumps({
            "file": ".trellis/spec/guides/index.md",
            "reason": "Thinking guides"
        }) + "\n")
```

**Option B**: Manually create template:

```jsonl
{"file": ".trellis/spec/guides/index.md", "reason": "Thinking guides"}
{"file": ".trellis/tasks/{task}/prd.md", "reason": "Requirements"}
```

---

## Step 4: Add to Pipeline (Optional)

If the agent should be part of the standard workflow:

### Update task.json Template

```json
"next_action": [
  {"phase": 1, "action": "implement"},
  {"phase": 2, "action": "my-agent"},  // Add here
  {"phase": 3, "action": "check"},
  {"phase": 4, "action": "finish"}
]
```

### Update dispatch.md

Add handling for the new phase:

```markdown
## Phase Handling

...

### my-agent Phase
- Call `Task(subagent_type="my-agent")`
- Wait for completion
- Proceed to next phase
```

---

## Step 5: Document in trellis-local

Update `.claude/skills/trellis-local/SKILL.md`:

```markdown
## Agents

### Added Agents

#### my-agent
- **File**: `.claude/agents/my-agent.md`
- **Platform**: [CC]
- **Purpose**: What it does
- **Tools**: Read, Write, Edit, Bash, Glob, Grep
- **Added**: 2026-01-31
- **Reason**: Why it was added

### Hooks Changed

#### inject-subagent-context.py
- **Change**: Added support for `my-agent` type
- **Lines modified**: XX-YY
- **Date**: 2026-01-31
```

---

## Testing

1. Create a task with my-agent.jsonl
2. Set as current task: `task.py start <task-dir>`
3. Invoke agent: `Task(subagent_type="my-agent", prompt="Test")`
4. Verify context injection works
5. Verify agent behavior matches definition

---

## Checklist

- [ ] Agent definition created with proper frontmatter
- [ ] Hook updated with agent constant
- [ ] Hook updated with context function
- [ ] Hook updated with main switch case
- [ ] JSONL template created
- [ ] Added to pipeline (if needed)
- [ ] Documented in trellis-local
- [ ] Tested the agent
