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

First, read the following files to understand the workflow system:

```bash
cat init-agent.md         # Project overview and initialization guide
cat .trellis/workflow.md  # Development process and conventions
```

### Step 2: Get Current Status `[AI]`

```bash
./.trellis/scripts/get-context.sh
```

This returns:
- Developer identity
- Git status (branch, uncommitted changes)
- Recent commits
- Active features
- Traces file status

### Step 3: Read Project Guidelines `[AI]`

Based on the upcoming task, read appropriate structure docs:

**For Frontend Work**:
```bash
cat .trellis/structure/frontend/index.md
```

**For Backend Work**:
```bash
cat .trellis/structure/backend/index.md
```

**For Cross-Layer Features**:
```bash
cat .trellis/structure/guides/index.md
cat .trellis/structure/guides/cross-layer-thinking-guide.md
```

### Step 4: Check Active Features `[AI]`

```bash
./.trellis/scripts/feature.sh list
```

If continuing previous work, review the feature file.

### Step 5: Report Ready Status and Ask for Tasks

Output a summary:

```markdown
## Session Initialized

| Item | Status |
|------|--------|
| Developer | {name} |
| Branch | {branch} |
| Uncommitted | {count} file(s) |
| Traces | {file} ({lines}/2000 lines) |
| Active Features | {count} |

Ready for your task. What would you like to work on?
```

---

## Working on Tasks

### For Simple Tasks

1. Read relevant guidelines based on task type `[AI]`
2. Implement the task directly `[AI]`
3. Remind user to run `/finish-work` before committing `[USER]`

### For Complex Tasks (Multi-Step Features)

#### Step 1: Create Feature `[AI]`

```bash
./.trellis/scripts/feature.sh create <name>
```

#### Step 2: Implement and Verify `[AI]`

1. Read relevant structure docs
2. Implement the feature
3. Run lint and type checks

#### Step 3: Complete

1. Verify typecheck and lint pass `[AI]`
2. Remind user to test
3. Remind user to commit
4. Remind user to run `/record-agent-flow` `[USER]`
5. Archive feature `[AI]`:
   ```bash
   ./.trellis/scripts/feature.sh archive <feature-name>
   ```

---

## User Available Commands `[USER]`

The following slash commands are for users (not AI):

| Command | Description |
|---------|-------------|
| `/start` | Start development session (this command) |
| `/before-frontend-dev` | Read frontend guidelines |
| `/before-backend-dev` | Read backend guidelines |
| `/check-frontend` | Check frontend code |
| `/check-backend` | Check backend code |
| `/check-cross-layer` | Cross-layer verification |
| `/finish-work` | Pre-commit checklist |
| `/record-agent-flow` | Record session progress |

---

## AI Executed Scripts `[AI]`

| Script | Purpose |
|--------|---------|
| `feature.sh create <name>` | Create feature directory |
| `feature.sh list` | List active features |
| `feature.sh archive <name>` | Archive feature |
| `get-context.sh` | Get session context |

---

## Session End Reminder

**IMPORTANT**: When a task or session is completed, remind the user:

> Before ending this session, please run `/record-agent-flow` to record what we accomplished.
