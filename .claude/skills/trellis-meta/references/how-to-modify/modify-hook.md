# How To: Modify Hook

Change hook behavior for context injection or validation.

**Platform**: Claude Code only

---

## Files to Modify

| File | Action | Required |
|------|--------|----------|
| `.claude/hooks/{hook}.py` | Modify | Yes |
| `.claude/settings.json` | Modify | If changing matcher/timeout |
| `trellis-local/SKILL.md` | Update | Yes |

---

## Hook Types

| Hook | File | Purpose |
|------|------|---------|
| SessionStart | `session-start.py` | Inject initial context |
| PreToolUse:Task | `inject-subagent-context.py` | Inject agent context |
| SubagentStop:check | `ralph-loop.py` | Quality enforcement |

---

## Step 1: Understand Hook Structure

### Input (stdin)

Hooks receive JSON input:

```json
{
  "hook_event": "PreToolUse",
  "tool_name": "Task",
  "tool_input": {
    "subagent_type": "implement",
    "prompt": "..."
  }
}
```

### Output (stdout)

Hooks output JSON:

```json
{
  "result": "continue",
  "message": "Optional message to inject",
  "updatedInput": {
    "prompt": "Modified prompt..."
  }
}
```

### Result Types

| Result | Effect |
|--------|--------|
| `continue` | Allow operation, optionally modify |
| `block` | Prevent operation |

---

## Step 2: Modify Hook Logic

### Example: Add Context to Session Start

Edit `.claude/hooks/session-start.py`:

```python
def get_additional_context():
    """Add custom context."""
    context = []

    # Add custom file
    custom_path = os.path.join(repo_root, ".trellis/custom.md")
    if os.path.exists(custom_path):
        with open(custom_path) as f:
            context.append(f"## Custom Context\n{f.read()}")

    return "\n".join(context)

# In main():
additional = get_additional_context()
message = f"{existing_message}\n\n{additional}"
```

### Example: Add Agent Validation

Edit `.claude/hooks/inject-subagent-context.py`:

```python
def validate_agent_input(subagent_type, prompt):
    """Validate agent invocation."""
    if subagent_type == "implement":
        if "git commit" in prompt.lower():
            return False, "Implement agent cannot commit"
    return True, None

# In main():
valid, error = validate_agent_input(subagent_type, prompt)
if not valid:
    output = {"result": "block", "message": error}
    print(json.dumps(output))
    return
```

### Example: Add Verify Command

Edit `.claude/hooks/ralph-loop.py`:

```python
# Add to verify commands list
ADDITIONAL_COMMANDS = ["pnpm test:unit"]

def get_verify_commands():
    commands = read_worktree_yaml_verify()
    commands.extend(ADDITIONAL_COMMANDS)
    return commands
```

---

## Step 3: Modify Settings (If Needed)

Edit `.claude/settings.json`:

### Change Timeout

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ...",
            "timeout": 60  // Increase from 30
          }
        ]
      }
    ]
  }
}
```

### Change Matcher

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "check|my-agent",  // Add new agent
        "hooks": [...]
      }
    ]
  }
}
```

---

## Step 4: Document in trellis-local

Update `.claude/skills/trellis-local/SKILL.md`:

```markdown
## Hooks Changed

#### session-start.py
- **Hook Event**: SessionStart
- **Change**: Added custom context injection
- **Lines modified**: 45-60
- **Date**: 2026-01-31
- **Reason**: Need to inject project-specific context

#### inject-subagent-context.py
- **Hook Event**: PreToolUse:Task
- **Change**: Added validation for implement agent
- **Lines modified**: 120-135
- **Date**: 2026-01-31
- **Reason**: Prevent accidental git commits
```

---

## Testing

### Manual Test

```bash
# Test session-start
python3 .claude/hooks/session-start.py

# Test inject-subagent-context
echo '{"tool_input":{"subagent_type":"implement","prompt":"test"}}' | \
  python3 .claude/hooks/inject-subagent-context.py

# Test ralph-loop
echo '{"subagent_type":"check","output":"test"}' | \
  python3 .claude/hooks/ralph-loop.py
```

### Integration Test

1. Start new Claude Code session
2. Verify session-start output
3. Invoke subagent
4. Verify context injection
5. Verify Ralph Loop (for check agent)

---

## Common Modifications

### Add File to Session Context

```python
# session-start.py
files_to_inject = [
    ".trellis/workflow.md",
    ".trellis/custom-context.md",  # Add this
]
```

### Skip Injection for Certain Agents

```python
# inject-subagent-context.py
SKIP_INJECTION = ["research"]

if subagent_type in SKIP_INJECTION:
    print(json.dumps({"result": "continue"}))
    return
```

### Add Custom Verification

```python
# ralph-loop.py
def custom_check():
    """Custom verification logic."""
    # Check something
    return True, None

# In verify():
ok, error = custom_check()
if not ok:
    return False, error
```

---

## Checklist

- [ ] Hook logic modified
- [ ] Settings updated (if needed)
- [ ] Manual test passed
- [ ] Integration test passed
- [ ] Documented in trellis-local
