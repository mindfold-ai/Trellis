# Start Session

Initialize your AI development session and begin working on tasks.

---

## Operation Types

| Marker | Meaning | Executor |
|--------|---------|----------|
| `[AI]` | Bash scripts or Task calls executed by AI | You (AI) |
| `[USER]` | Slash commands executed by user | User |

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
> Task Workflow ensures specs are injected to agents, resulting in higher quality code.
> The overhead is minimal, but the benefit is significant.

---

## Question / Trivial Fix

For questions or trivial fixes, work directly:

1. Answer question or make the fix
2. If code was changed, remind user to run `/trellis:finish-work`

---

## Task Workflow (Development Tasks)

**Why this workflow?**
- Research Agent analyzes what specs are needed
- Specs are configured in jsonl files
- Implement Agent receives specs via Hook injection
- Check Agent verifies against specs
- Result: Code that follows project conventions automatically

### Overview: Two Entry Points

```
From Brainstorm (Complex Task):
  PRD confirmed → Research → Configure Context → Activate → Implement → Check → Complete

From Simple Task:
  Confirm → Create Task → Write PRD → Research → Configure Context → Activate → Implement → Check → Complete
```

**Key principle: Research happens AFTER requirements are clear (PRD exists).**

---

### Phase 1: Establish Requirements

#### Path A: From Brainstorm (skip to Phase 2)

PRD and task directory already exist from brainstorm. Skip directly to Phase 2.

#### Path B: From Simple Task

**Step 1: Confirm Understanding** `[AI]`

Quick confirm:
- What is the goal?
- What type of development? (frontend / backend / fullstack)
- Any specific requirements or constraints?

**Step 2: Create Task Directory** `[AI]`

```bash
TASK_DIR=$(python3 ./.trellis/scripts/task.py create "<title>" --slug <name>)
```

**Step 3: Write PRD** `[AI]`

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

---

### Phase 2: Prepare for Implementation (shared)

> Both paths converge here. PRD and task directory must exist before proceeding.

**Step 4: Code-Spec Depth Check** `[AI]`

If the task touches infra or cross-layer contracts, do not start implementation until code-spec depth is defined.

Trigger this requirement when the change includes any of:
- New or changed command/API signatures
- Database schema or migration changes
- Infra integrations (storage, queue, cache, secrets, env contracts)
- Cross-layer payload transformations

Must-have before proceeding:
- [ ] Target spec files to update are identified
- [ ] Concrete contract is defined (signature, fields, env keys)
- [ ] Validation and error matrix is defined
- [ ] At least one Good/Base/Bad case is defined

**Step 5: Research the Codebase** `[AI]`

Based on the confirmed PRD, call Research Agent to find relevant specs and patterns:

```
Task(
  subagent_type: "research",
  prompt: "Analyze the codebase for this task:

  Task: <goal from PRD>
  Type: <frontend/backend/fullstack>

  Please find:
  1. Relevant spec files in .trellis/spec/
  2. Existing code patterns to follow (find 2-3 examples)
  3. Files that will likely need modification

  Output:
  ## Relevant Specs
  - <path>: <why it's relevant>

  ## Code Patterns Found
  - <pattern>: <example file path>

  ## Files to Modify
  - <path>: <what change>",
  model: "opus"
)
```

**Step 6: Configure Context** `[AI]`

Initialize default context:

```bash
python3 ./.trellis/scripts/task.py init-context "$TASK_DIR" <type>
# type: backend | frontend | fullstack
```

Add specs found by Research Agent:

```bash
# For each relevant spec and code pattern:
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" implement "<path>" "<reason>"
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" check "<path>" "<reason>"
```

**Step 7: Activate Task** `[AI]`

```bash
python3 ./.trellis/scripts/task.py start "$TASK_DIR"
```

This sets `.current-task` so hooks can inject context.

---

### Phase 3: Execute (shared)

**Step 8: Implement** `[AI]`

Call Implement Agent (specs are auto-injected by hook):

```
Task(
  subagent_type: "implement",
  prompt: "Implement the task described in prd.md.

  Follow all specs that have been injected into your context.
  Run lint and typecheck before finishing.",
  model: "opus"
)
```

**Step 9: Check Quality** `[AI]`

Call Check Agent (specs are auto-injected by hook):

```
Task(
  subagent_type: "check",
  prompt: "Review all code changes against the specs.

  Fix any issues you find directly.
  Ensure lint and typecheck pass.",
  model: "opus"
)
```

**Step 10: Complete** `[AI]`

1. Verify lint and typecheck pass
2. Report what was implemented
3. Remind user to:
   - Test the changes
   - Commit when ready
   - Run `/trellis:record-session` to record this session

---

## Continuing Existing Task

If `get_context.py` shows a current task:

1. Read the task's `prd.md` to understand the goal
2. Check `task.json` for current status and phase
3. Ask user: "Continue working on <task-name>?"

If yes, resume from the appropriate step (usually Step 7 or 8).

---

## Commands Reference

### User Commands `[USER]`

| Command | When to Use |
|---------|-------------|
| `/trellis:start` | Begin a session (this command) |
| `/trellis:parallel` | Complex tasks needing isolated worktree |
| `/trellis:finish-work` | Before committing changes |
| `/trellis:record-session` | After completing a task |

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

### Sub Agents `[AI]`

| Agent | Purpose | Hook Injection |
|-------|---------|----------------|
| research | Analyze codebase | No (reads directly) |
| implement | Write code | Yes (implement.jsonl) |
| check | Review & fix | Yes (check.jsonl) |
| debug | Fix specific issues | Yes (debug.jsonl) |

---

## Key Principle

> **Specs are injected, not remembered.**
>
> The Task Workflow ensures agents receive relevant specs automatically.
> This is more reliable than hoping the AI "remembers" conventions.
