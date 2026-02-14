---
name: start
description: "Start Session"
---

# Start Session

Initialize your AI development session and begin working on tasks.

---

## Operation Types

| Marker | Meaning | Executor |
|--------|---------|----------|
| `[AI]` | Bash scripts or tool calls executed by AI | You (AI) |
| `[USER]` | Skills executed by user | User |

---

## Initialization `[AI]`

### Step 1: Understand Development Workflow

First, read the workflow guide to understand the development process:

```bash
cat .trellis/workflow.md
```

**Follow the instructions in workflow.md** - it contains:
- Core principles (Read Before Write, Follow Standards, etc.)
- File system structure
- Development process
- Best practices

### Step 2: Get Current Context

```bash
python3 ./.trellis/scripts/get_context.py
```

This shows: developer identity, git status, current task (if any), active tasks.

### Step 3: Read Guidelines Index

```bash
cat .trellis/spec/frontend/index.md  # Frontend guidelines
cat .trellis/spec/backend/index.md   # Backend guidelines
cat .trellis/spec/guides/index.md    # Thinking guides
```

### Step 4: Report and Ask

Report what you learned and ask: "What would you like to work on?"

---

## Task Classification

When user describes a task, classify it:

| Type | Criteria | Workflow |
|------|----------|----------|
| **Question** | User asks about code, architecture, or how something works | Answer directly |
| **Trivial Fix** | Typo fix, comment update, single-line change, < 5 minutes | Direct Edit |
| **Development Task** | Any code change that: modifies logic, adds features, fixes bugs, touches multiple files | **Task Workflow** |

### Decision Rule

> **If in doubt, use Task Workflow.**
>
> Task Workflow ensures code-specs are injected to the right context, resulting in higher quality code.
> The overhead is minimal, but the benefit is significant.

---

## Question / Trivial Fix

For questions or trivial fixes, work directly:

1. Answer question or make the fix
2. If code was changed, remind user to run `$finish-work`

---

## Task Workflow (Development Tasks)

**Why this workflow?**
- Run a dedicated research pass before coding
- Configure specs in jsonl context files
- Implement using injected context
- Verify with a separate check pass
- Result: Code that follows project conventions automatically

### Step 1: Understand the Task `[AI]`

Before creating anything, understand what user wants:
- What is the goal?
- What type of development? (frontend / backend / fullstack)
- Any specific requirements or constraints?

If unclear, ask clarifying questions.

### Step 1.5: Code-Spec Depth Requirement (CRITICAL) `[AI]`

If the task touches infra or cross-layer contracts, do not start implementation until code-spec depth is defined.

Trigger this requirement when the change includes any of:
- New or changed command/API signatures
- Database schema or migration changes
- Infra integrations (storage, queue, cache, secrets, env contracts)
- Cross-layer payload transformations

Must-have before implementation:
- [ ] Target code-spec files to update are identified
- [ ] Concrete contract is defined (signature, fields, env keys)
- [ ] Validation and error matrix is defined
- [ ] At least one Good/Base/Bad case is defined

### Step 2: Research the Codebase `[AI]`

Run a focused research pass and produce:

1. Relevant spec files in `.trellis/spec/`
2. Existing code patterns to follow (2-3 examples)
3. Files that will likely need modification
4. Suggested task slug

Use this output format:

```markdown
## Relevant Specs
- <path>: <why it's relevant>

## Code Patterns Found
- <pattern>: <example file path>

## Files to Modify
- <path>: <what change>

## Suggested Task Name
- <short-slug-name>
```

### Step 3: Create Task Directory `[AI]`

Based on research results:

```bash
TASK_DIR=$(python3 ./.trellis/scripts/task.py create "<title from research>" --slug <suggested-slug>)
```

### Step 4: Configure Context `[AI]`

Initialize default context:

```bash
python3 ./.trellis/scripts/task.py init-context "$TASK_DIR" <type>
# type: backend | frontend | fullstack
```

Add specs found in your research pass:

```bash
# For each relevant spec and code pattern:
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" implement "<path>" "<reason>"
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" check "<path>" "<reason>"
```

### Step 5: Write Requirements `[AI]`

Create `prd.md` in the task directory with:

```markdown
# <Task Title>

## Goal
<What we're trying to achieve>

## Requirements
- <Requirement 1>
- <Requirement 2>

## Acceptance Criteria
- [ ] <Criterion 1>
- [ ] <Criterion 2>

## Technical Notes
<Any technical decisions or constraints>
```

### Step 6: Activate Task `[AI]`

```bash
python3 ./.trellis/scripts/task.py start "$TASK_DIR"
```

This sets `.current-task` so hooks can inject context.

### Step 7: Implement `[AI]`

Implement the task described in `prd.md`.

- Follow all specs injected into implement context
- Keep changes scoped to requirements
- Run lint and typecheck before finishing

### Step 8: Check Quality `[AI]`

Run a quality pass against check context:

- Review all code changes against the specs
- Fix issues directly
- Ensure lint and typecheck pass

### Step 9: Complete `[AI]`

1. Verify lint and typecheck pass
2. Report what was implemented
3. Remind user to:
   - Test the changes
   - Commit when ready
   - Run `$record-session` to record this session

---

## Continuing Existing Task

If `get_context.py` shows a current task:

1. Read the task's `prd.md` to understand the goal
2. Check `task.json` for current status and phase
3. Ask user: "Continue working on <task-name>?"

If yes, resume from the appropriate step (usually Step 7 or 8).

---

## Skills Reference

### User Skills `[USER]`

| Skill | When to Use |
|---------|-------------|
| `$start` | Begin a session (this skill) |
| `$finish-work` | Before committing changes |
| `$record-session` | After completing a task |

### AI Scripts `[AI]`

| Script | Purpose |
|--------|---------|
| `python3 ./.trellis/scripts/get_context.py` | Get session context |
| `python3 ./.trellis/scripts/task.py create` | Create task directory |
| `python3 ./.trellis/scripts/task.py init-context` | Initialize jsonl files |
| `python3 ./.trellis/scripts/task.py add-context` | Add spec to jsonl |
| `python3 ./.trellis/scripts/task.py start` | Set current task |
| `python3 ./.trellis/scripts/task.py finish` | Clear current task |
| `python3 ./.trellis/scripts/task.py archive` | Archive completed task |

### Workflow Phases `[AI]`

| Phase | Purpose | Context Source |
|-------|---------|----------------|
| research | Analyze codebase | direct repo inspection |
| implement | Write code | `implement.jsonl` |
| check | Review & fix | `check.jsonl` |
| debug | Fix specific issues | `debug.jsonl` |

---

## Key Principle

> **Code-spec context is injected, not remembered.**
>
> The Task Workflow ensures agents receive relevant code-spec context automatically.
> This is more reliable than hoping the AI "remembers" conventions.
