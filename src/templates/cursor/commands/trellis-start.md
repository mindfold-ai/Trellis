# Start Session

Initialize your AI development session and begin working on tasks.

---

## Operation Types

Operations in this document are categorized as:

| Marker | Meaning | Executor |
|--------|---------|----------|
| `[AI]` | Bash scripts or file reads executed by AI | You (AI) |
| `[USER]` | Slash commands executed by user | User |

---

## Initialization

### Step 1: Understand Trellis Workflow `[AI]`

First, read the workflow guide to understand the development process:

```bash
cat .trellis/workflow.md  # Development process, conventions, and quick start guide
```

### Step 2: Get Current Status `[AI]`

```bash
python3 ./.trellis/scripts/get_context.py
```

This returns:
- Developer identity
- Git status (branch, uncommitted changes)
- Recent commits
- Active tasks
- Journal file status

### Step 3: Read Project Code-Spec Index `[AI]`

Based on the upcoming task, read appropriate code-spec docs:

**For Frontend Work**:
```bash
cat .trellis/spec/frontend/index.md
```

**For Backend Work**:
```bash
cat .trellis/spec/backend/index.md
```

**For Cross-Layer Features**:
```bash
cat .trellis/spec/guides/index.md
cat .trellis/spec/guides/cross-layer-thinking-guide.md
```

### Step 4: Check Active Tasks `[AI]`

```bash
python3 ./.trellis/scripts/task.py list
```

If continuing previous work, review the task file.

### Step 5: Report Ready Status and Ask for Tasks

Output a summary:

```markdown
## Session Initialized

| Item | Status |
|------|--------|
| Developer | {name} |
| Branch | {branch} |
| Uncommitted | {count} file(s) |
| Journal | {file} ({lines}/2000 lines) |
| Active Tasks | {count} |

Ready for your task. What would you like to work on?
```

---

## Working on Tasks

### For Simple Tasks

1. Read relevant code-spec docs based on task type `[AI]`
2. Implement the task directly `[AI]`
3. Remind user to run `/trellis-finish-work` before committing `[USER]`

### For Complex Tasks (Multi-Step Tasks)

#### Step 1: Create Task `[AI]`

```bash
python3 ./.trellis/scripts/task.py create "<title>" --slug <name>
```

#### Step 1.5: Code-Spec Depth Requirement (CRITICAL) `[AI]`

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

#### Step 2: Implement and Verify `[AI]`

1. Read relevant code-spec docs
2. Implement the task
3. Run lint and type checks

#### Step 3: Complete

1. Verify typecheck and lint pass `[AI]`
2. Remind user to test
3. Remind user to commit
4. Remind user to run `/trellis-record-session` `[USER]`
5. Archive task `[AI]`:
   ```bash
   python3 ./.trellis/scripts/task.py archive <task-name>
   ```

---

## User Available Commands `[USER]`

The following slash commands are for users (not AI):

| Command | Description |
|---------|-------------|
| `/trellis-start` | Start development session (this command) |
| `/trellis-before-frontend-dev` | Read frontend guidelines |
| `/trellis-before-backend-dev` | Read backend guidelines |
| `/trellis-check-frontend` | Check frontend code |
| `/trellis-check-backend` | Check backend code |
| `/trellis-check-cross-layer` | Cross-layer verification |
| `/trellis-finish-work` | Pre-commit checklist |
| `/trellis-record-session` | Record session progress |

---

## AI Executed Scripts `[AI]`

| Script | Purpose |
|--------|---------|
| `python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>]` | Create task directory |
| `python3 ./.trellis/scripts/task.py list` | List active tasks |
| `python3 ./.trellis/scripts/task.py archive <name>` | Archive task |
| `python3 ./.trellis/scripts/get_context.py` | Get session context |

---

## Platform Detection

Trellis auto-detects your platform based on config directories. For Cursor users, ensure detection works correctly:

| Condition | Detected Platform |
|-----------|-------------------|
| Only `.cursor/` exists | `cursor` ✅ |
| Both `.cursor/` and `.claude/` exist | `claude` (default) |

If auto-detection fails, set manually:

```bash
export TRELLIS_PLATFORM=cursor
```

Or prefix commands:

```bash
TRELLIS_PLATFORM=cursor python3 ./.trellis/scripts/task.py list
```

---

## Session End Reminder

**IMPORTANT**: When a task or session is completed, remind the user:

> Before ending this session, please run `/trellis-record-session` to record what we accomplished.
