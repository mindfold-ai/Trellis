# Design: Antigravity Lifecycle Hook Integration

## Architecture Overview

```text
Antigravity Session Lifecycle
  ├── PreInvocation
  │     └── sh -c "python3 hooks/inject-workflow-state.py" (cwd: <repo>/.agent)
  │           ├── Resolves repo root (walk up from cwd)
  │           ├── Reads active task state / workflow phase
  │           └── Returns: {"injectSteps": [{"ephemeralMessage": "<workflow-state>..."}]}
  └── PreToolUse (matcher: "run_command")
        └── sh -c "python3 hooks/inject-shell-session-context.py" (cwd: <repo>/.agent)
              ├── Inspects toolCall.args.CommandLine
              ├── Extracts task.py subcommands
              ├── Writes short-lived shell ticket in .trellis/.runtime/shell-tickets/
              └── Returns: {"decision": "allow"}
```

## Key Design Decisions

### 1. Working Directory (`cwd`) Contract
In Antigravity, hooks defined in `.agent/hooks.json` execute with their working directory set to **the directory containing `hooks.json`** (i.e. `<workspace>/.agent/`).
- Setting command to `python3 .agent/hooks/...` causes a double `.agent/.agent/` path resolution failure (`[Errno 2] No such file or directory`).
- Commands are configured as `{{PYTHON_CMD}} hooks/inject-workflow-state.py` and `{{PYTHON_CMD}} hooks/inject-shell-session-context.py`, making them portable and correctly resolved relative to `.agent/`.

### 2. Platform Detection & Host Directory Resolution
When the hook command is executed via `python3 hooks/...`, `sys.argv[0]` contains only the relative path `hooks/...` without `.agent`. Using `Path(sys.argv[0]).resolve().parts` resolves the absolute path, ensuring `.agent` is always identified and mapped to the `antigravity` host identifier.

### 3. Ephemeral Workflow Breadcrumbs
Antigravity's `PreInvocation` hook allows injecting ephemeral context into the model's turn via:
```json
{
  "injectSteps": [
    {
      "ephemeralMessage": "<workflow-state>\nStatus: no_task\n...\n</workflow-state>"
    }
  ]
}
```
This keeps the conversational history clean while ensuring the active task, workflow rules, and guidance are consistently available to the model.

### 4. Shell Ticket Bridge
When Antigravity runs tools via `run_command`, `PreToolUse` passes `{ "toolCall": { "name": "run_command", "args": { "CommandLine": "..." } } }`. The hook writes a shell ticket keyed to `antigravity_<conversation_id>`, allowing subsequent `task.py start/current/finish` commands to seamlessly inherit the session identity.
