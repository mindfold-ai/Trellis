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
| `[AI]` | Bash scripts executed by AI | You (AI) |
| `[USER]` | Skills invoked by user | User |

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
| **Trivial Fix** | Typo fix, comment update, single-line change | Direct Edit |
| **Simple Task** | Clear goal, 1-2 files, well-defined scope | Quick confirm → Implement |
| **Complex Task** | Vague goal, multiple files, architectural decisions | **Brainstorm → Task Workflow** |

### Classification Signals

**Trivial/Simple indicators:**
- User specifies exact file and change
- "Fix the typo in X"
- "Add field Y to component Z"
- Clear acceptance criteria already stated

**Complex indicators:**
- "I want to add a feature for..."
- "Can you help me improve..."
- Mentions multiple areas or systems
- No clear implementation path
- User seems unsure about approach

### Decision Rule

> **If in doubt, use Brainstorm + Task Workflow.**
>
> Task Workflow ensures code-spec context is injected to agents, resulting in higher quality code.
> The overhead is minimal, but the benefit is significant.

---

## Question / Trivial Fix

For questions or trivial fixes, work directly:

1. Answer question or make the fix
2. If code was changed, remind user to run `$finish-work`

---

## Simple Task

For simple, well-defined tasks:

1. Quick confirm: "I understand you want to [goal]. Ready to proceed?"
2. If yes, skip to **Task Workflow Step 2** (Research)
3. If no, clarify and confirm again

---

## Complex Task - Brainstorm First

For complex or vague tasks, use the brainstorm process to clarify requirements.

See `$brainstorm` for the full process. Summary:

1. **Acknowledge and classify** - State your understanding
2. **Create task directory** - Track evolving requirements in `prd.md`
3. **Ask questions one at a time** - Update PRD after each answer
4. **Propose approaches** - For architectural decisions
5. **Confirm final requirements** - Get explicit approval
6. **Proceed to Task Workflow** - With clear requirements in PRD

### Key Brainstorm Principles

| Principle | Description |
|-----------|-------------|
| **One question at a time** | Never overwhelm with multiple questions |
| **Update PRD immediately** | After each answer, update the document |
| **Prefer multiple choice** | Easier for users to answer |
| **YAGNI** | Challenge unnecessary complexity |

---

## Task Workflow (Development Tasks)

**Why this workflow?**
- Research phase analyzes what code-spec files are needed
- Code-spec files are configured in jsonl files
- Implementation receives code-spec context via Hook injection
- Check phase verifies against code-spec requirements
- Result: Code that follows project conventions automatically

### Step 1: Understand the Task `[AI]`

**If coming from Brainstorm:** Skip this step - requirements are already in PRD.

**If Simple Task:** Quick confirm understanding:
- What is the goal?
- What type of development? (frontend / backend / fullstack)
- Any specific requirements or constraints?

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

Analyze the codebase for the task:

1. Find relevant code-spec files in `.trellis/spec/`
2. Find existing code patterns to follow (2-3 examples)
3. Identify files that will likely need modification
4. Suggest a task name (short slug)

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

Add code-spec files found during research:

```bash
# For each relevant code-spec and code pattern:
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

Implement the task described in `prd.md`:

- Follow all code-spec files that have been configured for this task
- Run lint and typecheck before finishing

### Step 8: Check Quality `[AI]`

Review all code changes against the code-spec requirements:

- Fix any issues found directly
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

## Commands Reference

### User Skills `[USER]`

| Skill | When to Use |
|-------|-------------|
| `$start` | Begin a session (this skill) |
| `$brainstorm` | Clarify vague requirements (called from start) |
| `$finish-work` | Before committing changes |
| `$record-session` | After completing a task |

### AI Scripts `[AI]`

| Script | Purpose |
|--------|---------|
| `python3 ./.trellis/scripts/get_context.py` | Get session context |
| `python3 ./.trellis/scripts/task.py create` | Create task directory |
| `python3 ./.trellis/scripts/task.py init-context` | Initialize jsonl files |
| `python3 ./.trellis/scripts/task.py add-context` | Add code-spec/context file to jsonl |
| `python3 ./.trellis/scripts/task.py start` | Set current task |
| `python3 ./.trellis/scripts/task.py finish` | Clear current task |
| `python3 ./.trellis/scripts/task.py archive` | Archive completed task |

---

## Key Principle

> **Code-spec context is injected, not remembered.**
>
> The Task Workflow ensures code-spec context is provided automatically.
> This is more reliable than hoping the AI "remembers" conventions.
