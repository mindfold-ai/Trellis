# Platform Compatibility Reference

Detailed guide on Trellis feature availability across different AI coding platforms.

---

## Overview

Trellis is designed primarily for **Claude Code** but provides partial support for **Cursor**. Future support for **OpenCode** is under consideration.

The key differentiator is **hooks support** - Claude Code's hook system enables automatic context injection and quality enforcement, while other platforms require manual workarounds.

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRELLIS FEATURE LAYERS                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    LAYER 3: AUTOMATION                              │ │
│  │  Hooks, Ralph Loop, Auto-injection, Multi-Session                  │ │
│  │  ─────────────────────────────────────────────────────────────────│ │
│  │  Platform: Claude Code ONLY                                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                    LAYER 2: AGENTS                                  │ │
│  │  Agent definitions, Task tool, Subagent invocation                 │ │
│  │  ─────────────────────────────────────────────────────────────────│ │
│  │  Platform: Claude Code (full), Cursor (manual)                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                    LAYER 1: PERSISTENCE                             │ │
│  │  Workspace, Tasks, Specs, Commands, JSONL files                    │ │
│  │  ─────────────────────────────────────────────────────────────────│ │
│  │  Platform: ALL (file-based, portable)                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Feature Breakdown

### Layer 1: Persistence (All Platforms)

These features work on all platforms because they're file-based.

| Feature | Location | Description |
|---------|----------|-------------|
| Workspace system | `.trellis/workspace/` | Journals, session history |
| Task system | `.trellis/tasks/` | Task tracking, requirements |
| Spec system | `.trellis/spec/` | Coding guidelines |
| Slash commands | `.claude/commands/` | Command prompts (read manually on Cursor) |
| JSONL context | `*.jsonl` in task dirs | Context file lists |
| Developer identity | `.trellis/.developer` | Who is working |
| Current task | `.trellis/.current-task` | Active task pointer |

**Cursor workaround**: Manually read these files at session start.

### Layer 2: Agents (Claude Code Full, Cursor Limited)

| Feature | Claude Code | Cursor |
|---------|-------------|--------|
| Agent definitions | Auto-loaded via `--agent` flag | Read `.claude/agents/*.md` manually |
| Task tool | Full subagent support | No Task tool |
| Context injection | Automatic via hooks | Manual copy-paste |
| Agent restrictions | Enforced by definition | Honor code only |

**Cursor workaround**:
1. Read the agent definition file manually
2. Copy relevant context from JSONL files
3. Follow agent restrictions manually

### Layer 3: Automation (Claude Code Only)

| Feature | Dependency | Why Claude Code Only |
|---------|------------|---------------------|
| SessionStart hook | `.claude/settings.json` | Claude Code hook system |
| PreToolUse hook | Hook system | Intercepts tool calls |
| SubagentStop hook | Hook system | Controls agent lifecycle |
| Auto context injection | PreToolUse:Task | Hooks inject JSONL content |
| Ralph Loop | SubagentStop:check | Blocks agent until verify passes |
| Multi-Session | claude CLI + hooks | `claude --resume`, worktree scripts |

**No workaround**: These features fundamentally require Claude Code's hook system.

---

## Claude Code Features Used

### Hook System

```json
// .claude/settings.json
{
  "hooks": {
    "SessionStart": [...],
    "PreToolUse": [...],
    "SubagentStop": [...]
  }
}
```

Claude Code executes these hooks at specific lifecycle points. No other platform currently supports this.

### CLI Features

| Command | Purpose |
|---------|---------|
| `claude --agent <name>` | Load agent definition |
| `claude --resume <id>` | Resume session |
| `claude -p` | Print mode (non-interactive) |
| `claude --dangerously-skip-permissions` | Automation mode |
| `claude --output-format stream-json` | Machine-readable output |

### Task Tool

```javascript
Task(
  subagent_type: "implement",
  prompt: "...",
  model: "opus"
)
```

Claude Code's Task tool spawns subagents with isolated context. The PreToolUse hook intercepts this to inject specs.

---

## Cursor Usage Guide

For teams using Cursor, here's how to get partial Trellis benefits:

### What Works

1. **Workspace tracking**: Journals and sessions work normally
2. **Task organization**: Task directories and PRDs work
3. **Spec reading**: Read specs manually at session start
4. **Commands as prompts**: Read command files as reference

### Recommended Workflow

```
1. Session Start
   - Read .trellis/workflow.md
   - Read relevant specs from .trellis/spec/
   - Check .trellis/.current-task

2. Before Implementation
   - Read implement.jsonl for context files
   - Manually read each file listed
   - Follow spec guidelines

3. Before Commit
   - Run verify commands manually (pnpm lint, pnpm typecheck)
   - Self-review against check.jsonl specs
```

### What Doesn't Work

- No automatic spec injection
- No Ralph Loop (manual verification only)
- No Multi-Session (no worktree automation)
- No session resume

---

## OpenCode Considerations (Future)

### Requirements for Support

To support OpenCode, we would need:

1. **Hook equivalent**: Some way to intercept agent lifecycle events
2. **Agent system**: Subagent invocation with context
3. **CLI integration**: Scripting and automation support

### Potential Approaches

| Approach | Pros | Cons |
|----------|------|------|
| Native integration | Best UX, full features | Requires OpenCode changes |
| Adapter layer | Works with current OpenCode | Maintenance burden |
| File-based polling | No OpenCode changes needed | Hacky, latency issues |
| MCP server | Standard protocol | May not cover all hooks |

### Minimum Viable Support

If OpenCode adds hook support similar to Claude Code:

1. Port `session-start.py` to OpenCode format
2. Port `inject-subagent-context.py` for context injection
3. Port `ralph-loop.py` for quality enforcement

Without hooks, only Layer 1 (persistence) features would work.

---

## Version Compatibility Matrix

| Trellis Version | Claude Code | Cursor | OpenCode |
|-----------------|-------------|--------|----------|
| 0.3.x | Full support | Partial | Not supported |
| 0.4.x (planned) | Full support | Partial | TBD |

### Breaking Changes

| Version | Change | Impact |
|---------|--------|--------|
| 0.3.0 | New hook format | Update settings.json |
| 0.3.0-beta.3 | worktree.yaml schema | Update config |

---

## Checking Your Platform

### Claude Code

```bash
# Check Claude Code version
claude --version

# Verify hooks are loaded
cat .claude/settings.json | grep -A 5 '"hooks"'
```

### Cursor

```bash
# No CLI check available
# Verify by checking if hooks execute (they won't)
```

### Determining Support Level

```
Is hooks system available?
├── YES → Full Trellis support (Claude Code)
└── NO  → Partial support only
         ├── Can read files → Layer 1 works
         └── Has agent system → Layer 2 partial
```
