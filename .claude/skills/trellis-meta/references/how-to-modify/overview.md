# How-To Modification Guide

Common Trellis customization scenarios and what files need to be modified.

---

## Quick Reference

| Task | Files to Modify | Platform |
|------|-----------------|----------|
| [Add slash command](#add-slash-command) | commands/, trellis-local | All |
| [Add agent](#add-agent) | agents/, hook, jsonl, trellis-local | CC |
| [Modify hook](#modify-hook) | hooks/, settings.json, trellis-local | CC |
| [Add spec category](#add-spec-category) | spec/, jsonl, trellis-local | All |
| [Change verify commands](#change-verify-commands) | worktree.yaml | CC |
| [Add workflow phase](#add-workflow-phase) | task.json, dispatch, trellis-local | CC |
| [Add post_create step](#add-post_create-step) | worktree.yaml | CC |
| [Modify session start](#modify-session-start) | session-start.py, trellis-local | CC |
| [Add core script](#add-core-script) | scripts/, trellis-local | All |
| [Change task types](#change-task-types) | task.py, jsonl templates | All |

**Platform**: `All` = All platforms | `CC` = Claude Code only

---

## Detailed Guides

### Add Slash Command

**Scenario**: Add a new `/trellis:my-command` command.

**Files to modify**:

```
.claude/commands/trellis/my-command.md    # Create: Command prompt
.cursor/commands/my-command.md            # Create: Mirror for Cursor (optional)
.trellis-local/SKILL.md                   # Update: Document the change
```

**Steps**:
1. Create command file with YAML frontmatter
2. Mirror to Cursor if needed
3. Document in trellis-local

→ See `add-command.md` for details.

---

### Add Agent

**Scenario**: Add a new agent type like `my-agent`.

**Files to modify**:

```
.claude/agents/my-agent.md                          # Create: Agent definition
.claude/hooks/inject-subagent-context.py            # Modify: Add agent handling
.trellis/tasks/{template}/my-agent.jsonl            # Create: Context template
.trellis-local/SKILL.md                             # Update: Document the change
```

**Optional**:
```
.claude/agents/dispatch.md                          # Modify: If adding to pipeline
task.json template                                  # Modify: Add to next_action
```

→ See `add-agent.md` for details.

---

### Modify Hook

**Scenario**: Change hook behavior (context injection, validation, etc.).

**Files to modify**:

```
.claude/hooks/{hook-name}.py              # Modify: Hook logic
.claude/settings.json                     # Modify: If changing matcher/timeout
.trellis-local/SKILL.md                   # Update: Document the change
```

→ See `modify-hook.md` for details.

---

### Add Spec Category

**Scenario**: Add a new spec category like `mobile/`.

**Files to modify**:

```
.trellis/spec/mobile/index.md             # Create: Category index
.trellis/spec/mobile/*.md                 # Create: Spec files
.trellis/tasks/{template}/*.jsonl         # Update: Reference new specs
.trellis-local/SKILL.md                   # Update: Document the change
```

→ See `add-spec.md` for details.

---

### Change Verify Commands

**Scenario**: Add or modify Ralph Loop verification commands.

**Files to modify**:

```
.trellis/worktree.yaml                    # Modify: verify section
```

**Example**:
```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm test        # Add this
```

→ See `change-verify.md` for details.

---

### Add Workflow Phase

**Scenario**: Add a new phase to the task workflow.

**Files to modify**:

```
task.json (in task directories)           # Modify: next_action array
.claude/agents/dispatch.md                # Modify: Handle new phase
.claude/agents/{new-phase}.md             # Create: If new agent needed
.claude/hooks/inject-subagent-context.py  # Modify: If new agent
.trellis-local/SKILL.md                   # Update: Document the change
```

→ See `add-phase.md` for details.

---

### Add post_create Step

**Scenario**: Add setup steps after worktree creation.

**Files to modify**:

```
.trellis/worktree.yaml                    # Modify: post_create section
```

**Example**:
```yaml
post_create:
  - pnpm install
  - pnpm db:migrate    # Add this
```

---

### Modify Session Start

**Scenario**: Change what context is injected at session start.

**Files to modify**:

```
.claude/hooks/session-start.py            # Modify: Injection logic
.trellis-local/SKILL.md                   # Update: Document the change
```

→ See `modify-session-start.md` for details.

---

### Add Core Script

**Scenario**: Add a new automation script.

**Files to modify**:

```
.trellis/scripts/my-script.py             # Create: Script
.trellis/scripts/common/*.py              # Create/Modify: If shared utilities
.trellis-local/SKILL.md                   # Update: Document the change
```

→ See `add-script.md` for details.

---

### Change Task Types

**Scenario**: Add or modify task dev_type (frontend, backend, etc.).

**Files to modify**:

```
.trellis/scripts/task.py                  # Modify: init-context logic
.trellis/tasks/{template}/*.jsonl         # Create: New JSONL templates
.trellis-local/SKILL.md                   # Update: Document the change
```

→ See `change-task-types.md` for details.

---

## Documents in This Directory

| Document | Scenario |
|----------|----------|
| `add-command.md` | Adding slash commands |
| `add-agent.md` | Adding new agent types |
| `modify-hook.md` | Modifying hook behavior |
| `add-spec.md` | Adding spec categories |
| `change-verify.md` | Changing verify commands |
| `add-phase.md` | Adding workflow phases |
| `modify-session-start.md` | Changing session start injection |
| `add-script.md` | Adding automation scripts |
| `change-task-types.md` | Adding task types |
