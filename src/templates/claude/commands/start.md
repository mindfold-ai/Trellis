# Start Session

Initialize your AI development session and begin working on tasks.

---

## Operation Types

Operations in this document are categorized as:

| Marker | Meaning | Executor |
|--------|---------|----------|
| `[AI]` | Bash scripts or Task calls executed by AI | You (AI) |
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
./.trellis/scripts/get-context.sh
```

### Step 3: Read Project Guidelines `[AI]`

```bash
cat .trellis/structure/frontend/index.md  # Frontend guidelines index
cat .trellis/structure/backend/index.md   # Backend guidelines index
cat .trellis/structure/guides/index.md    # Thinking guides
```

### Step 4: Report Ready Status and Ask for Tasks

---

## Working on Tasks

### For Simple Tasks

1. Read relevant guidelines based on task type `[AI]`
2. Implement the task directly `[AI]`
3. Remind user to run `/finish-work` before committing `[USER]`

### For Complex Tasks (Multi-Step Features)

Use feature tracking and delegate to specialized agents.

#### Step 1: Create Feature Directory `[AI]`

```bash
FEATURE_DIR=$(./.trellis/scripts/feature.sh create "<title>" --slug <name>)
```

#### Step 2: Initialize Context `[AI]`

```bash
./.trellis/scripts/feature.sh init-context "$FEATURE_DIR" <type>
# type: backend | frontend | fullstack
```

#### Step 3: Call Research Agent to Analyze Task `[AI]`

```
Task(
  subagent_type: "research",
  prompt: "Analyze what development specs are needed for this task:

  Task description: <user requirements>
  Development type: <dev_type>

  Please:
  1. Find relevant spec files under .trellis/structure/
  2. Find related code modules and patterns in the project
  3. List specific files to add to implement.jsonl, check.jsonl, debug.jsonl

  Output format:
  ## implement.jsonl
  - path: <file path>, reason: <reason>

  ## check.jsonl
  - path: <file path>, reason: <reason>

  ## debug.jsonl
  - path: <file path>, reason: <reason>",
  model: "opus"
)
```

#### Step 4: Add Specs to jsonl `[AI]`

```bash
./.trellis/scripts/feature.sh add-context "$FEATURE_DIR" implement "<path>" "<reason>"
./.trellis/scripts/feature.sh add-context "$FEATURE_DIR" check "<path>" "<reason>"
./.trellis/scripts/feature.sh add-context "$FEATURE_DIR" debug "<path>" "<reason>"
```

Validate:
```bash
./.trellis/scripts/feature.sh list-context "$FEATURE_DIR"
```

#### Step 5: Create Requirements Document `[AI]`

Create `prd.md` in the feature directory.

#### Step 6: Start Feature `[AI]`

```bash
./.trellis/scripts/feature.sh start "$FEATURE_DIR"
```

#### Step 7: Delegate Work `[AI]`

```
Task(subagent_type: "implement", prompt: "Implement the feature described in prd.md", model: "opus")
```

Check quality:

```
Task(subagent_type: "check", prompt: "Check code changes and fix any issues", model: "opus")
```

#### Step 8: Complete

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
| `/parallel` | Start Multi-Agent Pipeline (worktree mode) |
| `/finish-work` | Pre-completion checklist |
| `/record-agent-flow` | Record session progress |
| `/check-frontend` | Check frontend code |
| `/check-backend` | Check backend code |

---

## Session End Reminder

**IMPORTANT**: When a task or session is completed, remind the user:

> Before ending this session, please run `/record-agent-flow` to record what we accomplished.

---

## AI Executed Scripts `[AI]`

| Script | Purpose |
|--------|---------|
| `feature.sh create "<title>" [--slug <name>]` | Create feature directory |
| `feature.sh init-context <dir> <type>` | Initialize jsonl files |
| `feature.sh add-context <dir> <jsonl> <path>` | Add specs |
| `feature.sh start <dir>` | Set current feature |
| `feature.sh finish` | Clear current feature |
| `feature.sh archive <name>` | Archive feature |
| `get-context.sh` | Get session context |

## Sub Agent Calls `[AI]`

All sub agent calls use the opus model:

| Agent | Purpose |
|-------|---------|
| research | Find specs, analyze code |
| implement | Implement features |
| check | Check code |
| debug | Fix issues |
