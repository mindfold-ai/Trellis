# Trellis

English | [中文](./README-zh.md)

![Trellis](assets/trellis.png)

> AI capabilities grow like vines — full of vitality but spreading in all directions. Trellis provides structure, guiding them along a disciplined path.

## What Problems Does It Solve

### 1. AI Lacks Project Context

AI doesn't know what this project is, doesn't know the project's specialized coding standards, architectural constraints, or previous development decisions. Every session starts with repeating "what this project is, what tech stack it uses, what we're doing next..." — and mistakes made in one session will be repeated in the next.

**Trellis Solution**:
- Development guidelines are persistently stored in `.trellis/spec/`. Developers within the project can share and maintain them together. Once one developer writes high-quality guidelines, the entire team's code quality improves
- Session records are stored in `.trellis/workspace/`. New sessions can quickly review what you worked on previously, what code was changed, providing better project awareness without repeatedly explaining "what this project is"

### 2. Guidelines Written but Not Followed

`.cursorrules`, `CLAUDE.md`, `AGENTS.md` have limited space, and AI tends to forget mid-conversation. Guidelines and code are separated, making synchronization difficult. An all-in-one file forces AI to read potentially irrelevant context each time, wasting context window space, and a multi-thousand-line file is inconvenient to update and maintain.

**Trellis Solution**: Guidelines can be loaded on-demand, injected into the corresponding Agent's context window, allowing each specialized agent to receive only the project-specific domain knowledge and guidelines it needs.

### 3. Workflow Requires Human Supervision

Requires humans to guide AI step by step: first read guidelines, then implement, then check, then commit.

**Trellis Solution**: Slash Commands encapsulate complete workflows. Users only need to type `/trellis:start` or `/trellis:parallel`. Task distribution, script invocation, Hook interception, and other mechanisms are invisible to users — AI automatically executes according to predefined processes.

### 4. High Barrier for Multi-Agent Parallelism

Some tools support multi-Agent parallel development, but learning costs are high, configuration is complex, and multiple Agents working simultaneously can easily conflict.

**Trellis Solution**: One-click launch with `/trellis:parallel`. Uses Git Worktree for physical isolation underneath, with each Agent working in an independent directory without interference.

---

## Quick Start

### 1. Installation

```bash
npm install -g @mindfoldhq/trellis@latest
```

### 2. Initialize Project

```bash
cd your-project
trellis init -u your-name
```

### 3. Configure worktree.yaml (if using `/trellis:parallel`)

Edit `.trellis/worktree.yaml` according to your project:
- `worktree_dir`: Worktree storage directory (relative to project root, e.g., `../trellis-worktrees`)
- `copy`: Environment variable files to copy to Worktree (e.g., `.env`, `.trellis/.developer`)
- `post_create`: Initialization commands to run after Worktree creation (e.g., `pnpm install --frozen-lockfile`)
- `verify`: Verification commands that must pass before Check Agent finishes (e.g., `pnpm lint`, `pnpm typecheck`)

### 4. Start Using

#### Claude Code Workflow

**Simple tasks**:
```
/trellis:start → describe requirement → /trellis:record-session
```

**Complex features** (Multi-Agent Pipeline):
```
/trellis:parallel → describe requirement → /trellis:record-session
```

#### Cursor Workflow

```
/trellis:start → describe requirement → /trellis:before-frontend-dev or /trellis:before-backend-dev → implement → /trellis:check-frontend or /trellis:check-backend → /trellis:finish-work → /trellis:record-session
```

---

### 5. Behind-the-Scenes Process Details (Claude Code)

**`/trellis:start` Initialization**:
1. AI reads `.trellis/workflow.md` to understand development process
2. AI executes `get-context.sh` to get current developer, branch, recent commits, and other status
3. AI reads `.trellis/spec/` guideline indexes
4. AI reports ready status and asks user for task

**`/trellis:start` Task Classification**:

| Type | Criteria | Workflow |
|------|----------|----------|
| **Question** | User asks about code, architecture, or how something works | Answer directly |
| **Trivial Fix** | Typo fix, comment update, single-line change | Direct edit, remind `/trellis:finish-work` |
| **Development Task** | Any code change that modifies logic, adds features, fixes bugs, touches multiple files | **Feature Workflow** |

> **Decision Rule**: If in doubt, use Feature Workflow. It ensures specs are injected to agents, resulting in higher quality code.

**`/trellis:start` Feature Workflow (Development Tasks)**:
1. AI calls **Research Agent** to analyze codebase and find relevant guideline files
2. AI creates feature directory, records guideline file paths, and creates `prd.md` requirement document
3. AI calls **Implement Agent** to implement according to guidelines (guideline files are automatically injected via Hook)
4. AI calls **Check Agent** to review code and auto-fix issues (guideline files are automatically injected via Hook)

**`/trellis:parallel` Multi-Agent Pipeline** (Two Modes):

**Mode A: Plan Agent Auto-Planning** (Recommended for complex features with unclear requirements)
1. `plan.sh` script launches **Plan Agent** in background
2. Plan Agent evaluates requirement validity (rejects with reasons if requirement is unclear), calls **Research Agent** to analyze codebase and find relevant guideline files
3. Plan Agent records guideline file paths into feature directory and creates `prd.md` requirement document

**Mode B: Manual Configuration** (For simple features with clear requirements)
1. AI creates feature directory, calls **Research Agent** to analyze codebase and find relevant guideline files
2. AI records guideline file paths into feature directory and creates `prd.md` requirement document

**Subsequent Flow for Both Modes**:
1. `start.sh` creates independent Git Worktree, copies environment files per `worktree.yaml` `copy` field, runs initialization commands per `post_create` field, and launches **Dispatch Agent** in Worktree
2. Dispatch Agent reads `.trellis/.current-task` to locate feature directory, reads `task.json` `next_action` array, calls sub-Agents in phase order
3. **Implement Agent**: Hook (`inject-subagent-context.py`) automatically injects guideline files from `implement.jsonl` plus `prd.md` and `info.md` before Task call, then AI implements according to guidelines
4. **Check Agent**: Hook injects guideline file contents from `check.jsonl`, AI reviews code changes and auto-fixes; **Ralph Loop** (`ralph-loop.py`) intercepts Agent stop requests, runs verification commands per `worktree.yaml` `verify` field (e.g., lint, typecheck), only allows ending when all pass
5. `create-pr.sh` commits code (excluding agent-traces), pushes branch, creates Draft PR with `gh pr create`, updates `task.json` status to `review`

---

## System Architecture

After Trellis initialization, the following directory structure is created in your project:

```
your-project/
├── AGENTS.md                    # Lightweight AI instructions (agents.md protocol compatible)
├── .trellis/                    # Workflow and guidelines center
│   ├── workflow.md              # Development process guide (core document, read first in new sessions)
│   ├── worktree.yaml            # Multi-Agent pipeline configuration
│   ├── .developer               # Developer identity (git-ignored)
│   ├── .gitignore               # .trellis directory gitignore rules
│   ├── spec/               # Development guidelines (core knowledge base)
│   ├── workspace/            # Session records and Feature tracking
│   ├── backlog/                 # Requirements pool (bidirectional links with Features)
│   └── scripts/                 # Automation scripts
├── .claude/                     # Claude Code specific configuration
│   ├── commands/                # Slash Commands (13)
│   ├── agents/                  # Agent definitions (6)
│   ├── hooks/                   # Hook scripts (2)
│   └── settings.json            # Hook trigger configuration
└── .cursor/                     # Cursor specific configuration
    └── commands/                # Slash Commands (12)
```

### Entry Files

**`AGENTS.md`** (~18 lines):
- Lightweight instruction file following agents.md protocol
- Uses `<!-- TRELLIS:START -->` and `<!-- TRELLIS:END -->` markers to protect content (`trellis update` won't overwrite)
- Quick pointer to `/trellis:start` command and `.trellis/workflow.md`

**`.trellis/workflow.md`** (Core Document):
- **First-read document** for new AI Agent sessions
- Contains: Quick Start (developer identity initialization, context acquisition), development process, session recording, best practices
- Based on [Anthropic's Best Practices for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**Reading Order for New Agents**:
1. `.trellis/workflow.md` → Understand overall workflow and getting started steps
2. `.trellis/spec/{frontend|backend}/index.md` → Corresponding domain's guideline entry
3. Specific guideline files → Read on-demand based on task type

---

## I. Development Guidelines System (`.trellis/spec/`)

Stores project development guidelines — the team's knowledge assets. AI references these guidelines when implementing and reviewing code.

```
spec/
├── backend/                     # Backend development guidelines
│   ├── index.md                 # Backend guidelines entry
│   ├── directory-structure.md   # Directory structure conventions
│   ├── database-guidelines.md   # Database and ORM guidelines
│   ├── error-handling.md        # Error handling strategies
│   ├── quality-guidelines.md    # Code quality standards
│   └── logging-guidelines.md    # Logging guidelines
├── frontend/                    # Frontend development guidelines
│   ├── index.md                 # Frontend guidelines entry
│   ├── directory-structure.md   # Directory structure conventions
│   ├── component-guidelines.md  # Component design guidelines
│   ├── hook-guidelines.md       # Hook usage guidelines
│   ├── state-management.md      # State management guidelines
│   ├── quality-guidelines.md    # Code quality standards
│   └── type-safety.md           # Type safety guidelines
└── guides/                      # Problem thinking guides
    ├── index.md                 # Guides entry (with trigger conditions)
    ├── cross-layer-thinking-guide.md   # Cross-layer development thinking checklist
    └── code-reuse-thinking-guide.md    # Code reuse thinking checklist
```

**Core Philosophy**:
- Clearer guidelines = better AI execution results
- Update guidelines whenever issues are found (bugs, omissions, inconsistencies), forming a continuous improvement loop
- Thinking Guides help discover "didn't think of that" problems — most bugs come from incomplete thinking, not lack of skill

**Trigger Timing** (When to use which guide):
- **cross-layer-thinking-guide.md**: When feature involves 3+ layers (API, Service, Component, Database), data format changes between layers, multiple consumers need same data
- **code-reuse-thinking-guide.md**: When similar code already exists, same pattern repeats 3+ times, need to add fields in multiple places, before creating new utility functions (search first!)

---

## II. Session Tracking System (`.trellis/workspace/`)

Records all AI Agent work history, supporting multi-developer collaboration.

```
workspace/
├── index.md                     # Active developers list
└── {developer}/                 # Each developer's directory
    ├── index.md                 # Personal session index
    ├── journal-N.md              # Session records (max 2000 lines per file)
    ├── .agents/
    │   └── registry.json        # Running Agent registry
    └── tasks/                # Task directories
        ├── {day}-{name}/        # Active Feature
        │   ├── task.json     # Feature metadata
        │   ├── prd.md           # Requirement document
        │   ├── info.md          # Technical design (optional)
        │   ├── implement.jsonl  # Implement Agent context configuration
        │   ├── check.jsonl      # Check Agent context configuration
        │   └── debug.jsonl      # Debug Agent context configuration
        └── archive/             # Archived Features
            └── {YYYY-MM}/
```

### Feature Directory Details

Each Feature is an independent work unit containing complete context configuration:

**`task.json`** - Feature Metadata:
```json
{
  "name": "user-auth",
  "status": "planning|in_progress|review|completed|rejected",
  "dev_type": "backend|frontend|fullstack",
  "branch": "feature/user-auth",
  "base_branch": "main",
  "worktree_path": "../trellis-worktrees/feature/user-auth",
  "current_phase": 1,
  "next_action": [
    {"phase": 1, "action": "implement"},
    {"phase": 2, "action": "check"},
    {"phase": 3, "action": "finish"},
    {"phase": 4, "action": "create-pr"}
  ],
  "backlog_ref": "260119-user-auth.json"
}
```

**`implement.jsonl` / `check.jsonl` / `debug.jsonl`** - Context Configuration:
```jsonl
{"file": ".trellis/spec/backend/index.md", "reason": "Backend development guidelines"}
{"file": "src/api/auth.ts", "reason": "Existing auth pattern reference"}
{"file": "src/middleware/", "type": "directory", "reason": "Middleware pattern reference"}
```

These jsonl files define which guideline and code files each Agent needs to read. Hooks automatically inject these file contents when calling Agents.

### Traceability

**Traceability Value of jsonl Files**:

Each Feature's jsonl files record which guideline files were used, which existing code was referenced, and why each file was included. When issues arise, you can trace: whether necessary guideline references were missing, whether guidelines themselves were unclear, whether it's a guideline problem or execution deviation.

**Traceability Value of traces Files**:

`journal-N.md` records each session's date, Feature, work summary, main changes, Git commits, test status, and next steps. Forms complete development history; new sessions can quickly review previous work.

### Backlog System

Backlog is a requirements pool for managing features and tasks to be developed. Each backlog issue establishes bidirectional links with Features.

```
.trellis/
└── backlog/                     # Requirements pool directory
    ├── 260119-user-auth.json    # Backlog issue (ID format: YYMMDD-slug)
    └── 260119-payment-fix.json
```

**`backlog/*.json`** - Backlog Issue Structure:
```json
{
  "id": "260119-user-auth",
  "title": "Add user authentication",
  "description": "Implement JWT-based auth with email verification",
  "priority": "P1",
  "status": "in_progress",
  "assigned_to": "taosu",
  "created_by": "taosu",
  "created_at": "2026-01-19T10:30:00+08:00",
  "completed_at": null
}
```

**Bidirectional Links**:
- `backlog/*.json`'s `assigned_to` points to the developer
- `task.json`'s `backlog_ref` points to the backlog filename
- When archiving a Feature, the associated backlog status is automatically updated to `done`

**Priority**: P0 (urgent) > P1 (high) > P2 (medium) > P3 (low)

**Displayed in `get-context.sh`**:
```
## BACKLOG (Assigned to me)
- [P1] Add user authentication (2026-01-19)
- [P2] Fix payment display (2026-01-18)

## CREATED BY ME (Assigned to others)
- [P1] Review API design (assigned to: john)
```

---

## III. Script System (`.trellis/scripts/`)

Automation scripts that power the entire workflow.

```
scripts/
├── get-context.sh               # Get session context (developer, branch, recent commits, backlog)
├── task.sh                   # Feature management (create, archive, configure)
├── add-session.sh               # Record session
├── init-developer.sh            # Initialize developer identity
├── common/                      # Common utilities
│   ├── paths.sh                 # Path utilities
│   ├── developer.sh             # Developer utilities
│   ├── git-context.sh           # Git context
│   ├── phase.sh                 # Phase management
│   ├── worktree.sh              # Worktree utilities
│   ├── backlog.sh               # Backlog utilities (create, complete, list)
│   ├── registry.sh              # Agent registry CRUD operations
│   └── task-utils.sh         # Feature common utilities (find, archive, path safety)
└── multi-agent/                 # Multi-Agent pipeline scripts
    ├── plan.sh                  # Launch Plan Agent
    ├── start.sh                 # Create Worktree and launch Dispatch Agent
    ├── status.sh                # View pipeline status
    ├── create-pr.sh             # Create PR
    └── cleanup.sh               # Clean up Worktree
```

### Script System Design Philosophy

**Why Encapsulate Operations in Scripts?**

AI may "improvise" each time it executes tasks — using different commands, different parameters, different orders. This leads to:
- Inconsistent workflows, difficult to track and debug
- Easy to miss critical steps (like copying environment files, registering Agents)
- Reinventing the wheel, having to think "how to do it" every time

**Script Purpose**: Encapsulate complex operations into **deterministic, repeatable** commands. AI only needs to call scripts, doesn't need to know internal implementation details, and won't miss steps.

### Key Script Descriptions

**`task.sh`** - Feature Lifecycle Management:
```bash
# Create Feature (auto-creates backlog issue with bidirectional links)
task.sh create "<title>" [--slug <name>] [--assignee <dev>] [--priority P0|P1|P2|P3]
task.sh init-context <dir> <type>        # Initialize jsonl files
task.sh add-context <dir> <file> <path> <reason>  # Add context entry
task.sh set-branch <dir> <branch>        # Set branch
task.sh start <dir>                      # Set as current Feature
task.sh archive <name>                   # Archive Feature (also completes linked backlog)
task.sh list                             # List active Features
task.sh list-archive [YYYY-MM]           # List archived Features
```

**Create Examples**:
```bash
# Basic usage (slug auto-generated from title)
task.sh create "Add user authentication"

# Specify slug and priority
task.sh create "Add login page" --slug login-ui --priority P1

# Specify assignee (must be existing developer)
task.sh create "Fix payment bug" --assignee john --priority P0
```

**`multi-agent/plan.sh`** - Launch Plan Agent:

```bash
./plan.sh --name <feature-name> --type <dev-type> --requirement "<requirement>"
```

**How It Works**:
1. Create Feature directory (calls `task.sh create`)
2. Read `.claude/agents/plan.md`, extract Agent prompt (skip frontmatter)
3. Pass parameters to Agent via **environment variables**:
   ```bash
   export PLAN_FEATURE_NAME="user-auth"
   export PLAN_DEV_TYPE="backend"
   export PLAN_FEATURE_DIR=".trellis/workspace/taosu/tasks/19-user-auth"
   export PLAN_REQUIREMENT="Add JWT-based authentication"
   ```
4. Launch Claude Code in background: `nohup claude -p --dangerously-skip-permissions < prompt &`
5. Logs written to `<feature-dir>/.plan-log`

**Why Use Environment Variables for Parameters?**
- Agent prompt is a static template, environment variables make it dynamic
- Agent can directly read `$PLAN_FEATURE_DIR` and other variables, knowing which directory to operate on
- Avoids hardcoding paths in prompts, keeps templates generic

**`multi-agent/trellis:start.sh`** - Launch Dispatch Agent:

```bash
./trellis:start.sh <feature-dir>
```

**How It Works**:
1. **Validate Prerequisites**: task.json and prd.md must exist (ensures Plan phase completed)
2. **Check Feature Status**: If `status: "rejected"`, refuse to start and show reason
3. **Create Git Worktree**:
   ```bash
   git worktree add -b feature/user-auth ../trellis-worktrees/feature/user-auth
   ```
4. **Copy Environment Files**: Read `worktree.yaml` `copy` field, copy each file
5. **Copy Feature Directory**: Feature directory may not be committed yet, needs manual copy to Worktree
6. **Run Initialization Commands**: Read `worktree.yaml` `post_create` field, execute in order
7. **Set Current Feature**: Write to `.trellis/.current-task` file
8. **Prepare Agent Prompt**: Extract content from `dispatch.md`, write to `.agent-prompt`
9. **Launch Claude Code in Background**:
   ```bash
   nohup ./agent-runner.sh > .agent-log 2>&1 &
   ```
10. **Register to registry.json**: Record PID, Worktree path, start time for later management

**Key Design**:
- Scripts handle **environment preparation** (Worktree, dependencies, files), Agents only handle **task execution**
- Agents know which Feature they're handling by reading `.current-task` file
- All state persisted to files (registry.json, task.json), viewable and recoverable anytime

**`multi-agent/create-pr.sh`** - Create PR:
1. `git add -A` (exclude agent-traces)
2. `git commit -m "type(scope): feature-name"`
3. `git push origin <branch>`
4. `gh pr create --draft --base <base_branch>`
5. Update `task.json`: `status: "review"`, `pr_url: <url>`

---

## IV. Slash Commands (`.claude/commands/` and `.cursor/commands/`)

Users interact with Trellis through Slash Commands. Slash Commands are **the entry point for users and the system**, calling scripts and Agents behind the scenes to do actual work.

### `/trellis:start` - Session Initialization

**Purpose**: Initialize development session, read project context and guidelines.

**Execution Steps**:
1. Read `.trellis/workflow.md` to understand workflow
2. Execute `get-context.sh` to get current status (developer, branch, uncommitted files, active Features)
3. Read `.trellis/spec/{frontend|backend}/index.md` guideline entry
4. Report ready status, ask user for task

**Task Classification**:

| Type | Criteria | Workflow |
|------|----------|----------|
| **Question** | Asks about code, architecture, how something works | Answer directly |
| **Trivial Fix** | Typo, comment, single-line change | Direct edit → `/trellis:finish-work` |
| **Development Task** | Modifies logic, adds features, fixes bugs, multi-file | **Feature Workflow** |

> **If in doubt, use Feature Workflow** — specs are injected to agents, not "remembered".

**Feature Workflow** (Claude Code):
1. Research Agent analyzes codebase → finds relevant specs
2. Create Feature directory → configure jsonl → write prd.md
3. Implement Agent writes code (specs auto-injected via Hook)
4. Check Agent reviews and fixes (specs auto-injected via Hook)

### `/trellis:parallel` - Multi-Agent Pipeline (Claude Code Only)

**Purpose**: Launch parallel development pipeline using Git Worktree for isolated work environments.

**Differences from `/trellis:start`**:

| Dimension | `/trellis:start` | `/trellis:parallel` |
|-----------|----------|-------------|
| Execution Location | Main repo single process | Main repo + Worktree multi-process |
| Git Management | Develop directly on current branch | Create independent Worktree and branch |
| Use Case | Simple tasks, quick implementation | Complex features, multi-module, needs isolation |

**Two Modes**:
- **Plan Agent Mode** (Recommended): `plan.sh --name <name> --type <type> --requirement "<req>"` → Plan Agent auto-analyzes requirements, configures Feature → `start.sh` launches Dispatch Agent
- **Manual Configuration Mode**: Manually create Feature directory, configure jsonl, write prd.md → `start.sh` launches Dispatch Agent

### `/trellis:before-frontend-dev` and `/trellis:before-backend-dev` - Pre-Development Guidelines Reading

**Purpose**: Force reading of corresponding domain's development guidelines before coding.

**Execution Steps**:
1. Read `.trellis/spec/{frontend|backend}/index.md` guideline entry
2. Read specific guideline files based on task type:
   - **Frontend**: `component-guidelines.md`, `hook-guidelines.md`, `state-management.md`, `type-safety.md`
   - **Backend**: `database-guidelines.md`, `error-handling.md`, `logging-guidelines.md`, `type-safety.md`
3. Begin development after understanding coding standards

### `/trellis:check-frontend`, `/trellis:check-backend`, `/trellis:check-cross-layer` - Code Review

**`/trellis:check-frontend` and `/trellis:check-backend`**:
1. `git status` to see modified files
2. Read corresponding guideline files
3. Check code against guidelines
4. Report violations and fix them

**`/trellis:check-cross-layer`** (Cross-layer Check):

Checks multiple dimensions to prevent "didn't think of that" bugs:

| Dimension | Trigger Condition | Check Content |
|-----------|-------------------|---------------|
| **Cross-layer Data Flow** | Changes involve 3+ layers | Read/write flow, type propagation, error propagation, loading states |
| **Code Reuse** | Modifying constants/configs | `grep` search all usage locations, whether to extract shared constants |
| **New Utility Functions** | Creating utility | Search first if similar function exists |
| **After Batch Modifications** | Similar changes across multiple files | Any omissions, should it be abstracted |

### `/trellis:finish-work` - Pre-Commit Checklist

**Purpose**: Ensure code completeness, execute before commit.

**Checklist Items**:
1. **Code Quality**: lint, type-check, test pass, no `console.log`, no `x!` (non-null assertion), no `any`
2. **Documentation Sync**: Does `.trellis/spec/` guidelines need updating
3. **API Changes**: Are schema, docs, client code in sync
4. **Database Changes**: Are migration, schema, queries updated
5. **Cross-layer Validation**: Data flow, error handling, type consistency
6. **Manual Testing**: Functionality, edge cases, error states, after refresh

### `/trellis:record-session` - Record Session Progress

**Prerequisite**: User has tested and committed code (AI doesn't execute `git commit`)

**Execution Steps**:
1. Execute `get-context.sh` to get current context
2. Execute `add-session.sh --title "..." --commit "hash"` to record session:
   - Append to `journal-N.md` (auto-creates new file when exceeding 2000 lines)
   - Update `index.md` (session count, last active time, history table)
3. If Feature completed, execute `task.sh archive <name>` to archive

### Other Commands

| Command | Purpose |
|---------|---------|
| `/trellis:break-loop` | Deep bug analysis, break out of fix loops |
| `/trellis:create-command` | Create new Slash Command |
| `/trellis:integrate-skill` | Extract Claude Code skill into project guidelines |
| `/onboard-developer` | Landing guide for developers |

---

## V. Agent System (`.claude/agents/`)

Defines 6 specialized Agents, each with specific responsibilities:

| Agent | Responsibility |
|-------|----------------|
| **Plan** | Evaluate requirement validity, configure Feature directory |
| **Research** | Search code and docs, pure research without modifications |
| **Dispatch** | Pure dispatcher, calls sub-Agents by phase |
| **Implement** | Implement according to guidelines, git commit forbidden |
| **Check** | Review code and self-fix, controlled by Ralph Loop |
| **Debug** | Deep analysis and issue fixing |

### Agent Details

**Plan Agent** (`.claude/agents/plan.md`):
- Can **reject** unclear, incomplete, or out-of-scope requirements
- Calls Research Agent to analyze codebase
- Output: Fully configured Feature directory (task.json, prd.md, *.jsonl)

**Research Agent** (`.claude/agents/research.md`):
- Uses Haiku model (lightweight, fast)
- **Strict boundaries**: Can only describe "what it is, where it is, how it works", forbidden from suggestions, criticism, modifications

**Dispatch Agent** (`.claude/agents/dispatch.md`):
- **Pure dispatcher**: Only calls sub-Agents, doesn't read guidelines (Hook auto-injects)
- Reads `.trellis/.current-task` to locate Feature directory
- Reads `task.json` `next_action` array, executes phases in order

**Implement Agent** (`.claude/agents/implement.md`):
- Reads Hook-injected guidelines and requirements
- Implements features and runs lint/typecheck
- **Forbidden**: `git commit`, `git push`, `git merge`

**Check Agent** (`.claude/agents/check.md`):
- `git diff` to get code changes
- Check code against guidelines
- **Self-fix** issues, not just report
- Controlled by Ralph Loop: must output completion markers to end

**Debug Agent** (`.claude/agents/debug.md`):
- Not part of default flow, only called when Check Agent can't fix
- Categorize issues by priority: `[P1]` must fix, `[P2]` should fix, `[P3]` optional fix

---

## VI. Automation Mechanisms

Trellis implements workflow automation through Hooks and configuration files, making AI execute according to predefined processes, reducing arbitrariness.

### Staged Context Injection

**Why Staged Injection?**

Too much context causes AI distraction (irrelevant information interference), confusion (contradictory guidelines), and conflicts (different phase instructions overriding) — this is called **Context Rot**.

**Staged Injection Strategy**:
```
Plan/Research Agent analyzes requirements in advance
         ↓
Write relevant file paths to implement.jsonl, check.jsonl
         ↓
Hook injects only files needed for that phase when calling each Agent
         ↓
Each Agent receives precise context, focuses on current task
```

| Phase | Injected Content | Excluded Content |
|-------|------------------|------------------|
| Implement | Requirements + implementation-related guidelines and code | Check guidelines |
| Check | Check guidelines + code quality standards | Implementation details |
| Finish | Commit checklist + requirements (verify satisfaction) | Full check guidelines |

### Hook Implementation (`.claude/hooks/`)

Two Python scripts implement the above automation:

**1. `inject-subagent-context.py` (Context Injection)**

**Trigger Timing**: PreToolUse - Before Task tool call

**How It Works**:
```
Dispatch calls Task(subagent_type="implement", ...)
                    ↓
            Hook triggers (PreToolUse)
                    ↓
     Read .trellis/.current-task to locate Feature directory
                    ↓
     Read corresponding jsonl file based on subagent_type
                    ↓
     Inject all file contents listed in jsonl into Agent's prompt
                    ↓
            Implement Agent starts with complete context
```

**Content Injected Per Phase**:

| Agent | Injected Content | Purpose |
|-------|------------------|---------|
| Implement | Guidelines from `implement.jsonl` + `prd.md` + `info.md` | Understand requirements, implement according to guidelines |
| Check | Guidelines from `check.jsonl` + `finish-work.md` | Check if code meets guidelines |
| Check ([finish] marker) | `finish-work.md` + `prd.md` (lightweight) | Final verification before commit |
| Debug | Guidelines from `debug.jsonl` + error information | Deep analysis and fixing |

**Design Philosophy**:
- Dispatch becomes pure dispatcher, only sends simple commands
- Hook handles all context injection, sub-Agents work autonomously
- No manual context passing needed, behavior controlled by code not prompts

### 2. `ralph-loop.py` (Quality Control Loop)

**Trigger Timing**: SubagentStop - When Check Agent attempts to stop

**How It Works**:
```
Check Agent attempts to stop
        ↓
  Ralph Loop triggers (SubagentStop)
        ↓
   Has verify config?
   ├─ Yes → Execute verification commands from worktree.yaml
   │       ├─ All pass → Allow stop
   │       └─ Any fail → Block stop, report failure reason, continue fixing
   └─ No → Check completion markers in Agent output
           ├─ All markers present → Allow stop
           └─ Missing markers → Block stop, report which markers missing

Maximum 5 loops (prevent infinite loops and cost overruns)
```

**Two Verification Methods**:

1. **Programmatic Verification (Recommended)**:
   - Configure `verify` commands in `worktree.yaml` (e.g., `pnpm lint`, `pnpm typecheck`)
   - Ralph Loop executes these commands to verify code
   - Doesn't rely on AI output, program-enforced verification, more reliable

2. **Completion Marker Verification (Fallback)**:
   - Generate completion markers from `check.jsonl` `reason` fields
   - Format: `{REASON}_FINISH` (e.g., `TYPECHECK_FINISH`, `LINT_FINISH`)
   - Check Agent must actually execute checks and output corresponding markers
   - Ralph Loop checks if all markers are in Agent output

**State Management**:
- State file: `.trellis/.ralph-state.json`
- Tracks current iteration count and Feature
- 30-minute timeout auto-reset

### Continuous Guidelines Refinement

**Refinement Loop**:
```
AI executes according to guidelines → Issues discovered → Update .trellis/spec/ → Better execution next time → Guidelines get better with use
```

**Thinking Guides** (`.trellis/spec/guides/`) capture team's tacit knowledge:
- **cross-layer-thinking-guide.md**: Thinking checklist before cross-layer development
- **code-reuse-thinking-guide.md**: Search checklist before creating new code

Core philosophy: **30 minutes of thinking can save 3 hours of debugging**

---

## VII. Complete Workflow Examples

### Claude Code `/trellis:parallel` Complete Flow

```
User: /trellis:parallel
User: Implement user registration with email verification
         ↓
┌─────────────────────────────────────────────────────┐
│ Plan Phase (Main Repo)                              │
├─────────────────────────────────────────────────────┤
│ 1. plan.sh launches Plan Agent                      │
│ 2. Plan Agent evaluates requirements (may reject    │
│    unclear requirements)                            │
│ 3. Plan Agent calls Research Agent to analyze       │
│    codebase                                         │
│ 4. Plan Agent creates Feature directory:            │
│    - task.json (metadata)                        │
│    - prd.md (requirement document)                  │
│    - implement.jsonl (implement phase context)      │
│    - check.jsonl (check phase context)              │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Worktree Creation (Main Repo → Worktree)            │
├─────────────────────────────────────────────────────┤
│ 1. start.sh creates Git Worktree                    │
│ 2. Copy environment files (worktree.yaml copy)      │
│ 3. Run init commands (worktree.yaml post_create)    │
│ 4. Write .trellis/.current-task marker           │
│ 5. Launch Dispatch Agent in background              │
│ 6. Register to registry.json                        │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Implement Phase (In Worktree)                       │
├─────────────────────────────────────────────────────┤
│ 1. Dispatch calls Task(subagent_type="implement")   │
│ 2. Hook triggers, injects implement.jsonl +         │
│    prd.md + info.md                                 │
│ 3. Implement Agent implements according to          │
│    guidelines                                       │
│ 4. Run lint/typecheck                               │
│ 5. Report completion                                │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Check Phase (In Worktree)                           │
├─────────────────────────────────────────────────────┤
│ 1. Dispatch calls Task(subagent_type="check")       │
│ 2. Hook triggers, injects guidelines from           │
│    check.jsonl                                      │
│ 3. Check Agent reviews code, self-fixes issues      │
│ 4. Check Agent attempts to stop                     │
│ 5. Ralph Loop triggers:                             │
│    - Execute verify commands (pnpm lint,            │
│      pnpm typecheck)                                │
│    - All pass → Allow stop                          │
│    - Any fail → Block stop, continue fixing         │
│      (max 5 times)                                  │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Finish Phase (In Worktree)                          │
├─────────────────────────────────────────────────────┤
│ 1. Dispatch calls Task(prompt="[finish] ...")       │
│ 2. Hook triggers, injects finish-work.md +          │
│    prd.md (lightweight)                             │
│ 3. Check Agent executes Pre-Commit Checklist        │
│ 4. Skip Ralph Loop (already verified in check)      │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Create-PR Phase (In Worktree)                       │
├─────────────────────────────────────────────────────┤
│ 1. create-pr.sh executes                            │
│ 2. git add -A (exclude agent-traces)                │
│ 3. git commit -m "feat(scope): feature-name"        │
│ 4. git push origin <branch>                         │
│ 5. gh pr create --draft --base <base_branch>        │
│ 6. Update task.json (status: "review", pr_url)   │
└─────────────────────────────────────────────────────┘
         ↓
User: /trellis:record-session (record session)
```

### Cursor Complete Flow

```
User: /trellis:start
         ↓
AI: Read project status, report ready
         ↓
User: Describe requirement
         ↓
User: /trellis:before-backend-dev (if backend task)
         ↓
AI: Read .trellis/spec/backend/ guidelines
         ↓
AI: Implement feature
         ↓
User: /trellis:check-backend
         ↓
AI: Review code, self-fix issues
         ↓
User: /trellis:finish-work
         ↓
AI: Execute Pre-Commit Checklist
         ↓
User: git commit (manual commit)
         ↓
User: /trellis:record-session (record session)
```

---

## VIII. CLI Reference

### `trellis init`

Initialize Trellis in a project directory.

```bash
trellis init [options]
```

**Options**:
| Flag | Description |
|------|-------------|
| `--cursor` | Include Cursor commands only |
| `--claude` | Include Claude Code commands only |
| `-y, --yes` | Skip prompts and use defaults (both Cursor and Claude) |
| `-u, --user <name>` | Initialize developer identity with specified name |
| `-f, --force` | Overwrite existing files without asking |
| `-s, --skip-existing` | Skip existing files without asking |

**Examples**:
```bash
# Interactive initialization
trellis init

# Quick initialization with defaults
trellis init -y -u john

# Claude Code only
trellis init --claude -y
```

### `trellis update`

Update Trellis configuration and commands to the latest CLI version.

```bash
trellis update [options]
```

**Options**:
| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without applying them |
| `-f, --force` | Overwrite all changed files without asking |
| `-s, --skip-all` | Skip all changed files without asking |
| `-n, --create-new` | Create `.new` copies for all changed files |
| `--allow-downgrade` | Allow downgrading to an older CLI version |
| `--migrate` | Apply pending file migrations (prompts for modified files) |

**What It Does**:

1. **Version Check**: Compares project version (`.trellis/.version`) with CLI version
2. **Migration**: Handles file renames and deletions between versions (with `--migrate`)
3. **Template Updates**: Syncs template files (scripts, commands, agents, hooks)
4. **Hash Tracking**: Detects user-modified files to avoid overwriting changes

**Migration System**:

When upgrading between versions, Trellis may need to rename or delete files. The migration system:

- **Auto-migrates** unmodified template files (safe, no user changes to preserve)
- **Prompts for confirmation** on user-modified files
- **Reports conflicts** when both old and new paths exist
- **Cleans up** empty directories after file moves

**Examples**:
```bash
# Preview what would change
trellis update --dry-run

# Apply updates and migrations (prompts for modified files)
trellis update --migrate

# Force migrate all files (backup modified files first)
trellis update --migrate -f

# Skip all modified files during migration
trellis update --migrate -s
```

**Protected Paths** (never modified by update):
- `.trellis/workspace/` - Developer workspaces
- `.trellis/tasks/` - Task files
- `.trellis/.developer/` - Developer identity
- `.trellis/spec/frontend/` - User-written frontend guidelines
- `.trellis/spec/backend/` - User-written backend guidelines

---

## Extended Reading

- [Understanding Trellis Through Kubernetes Concepts](use-k8s-to-know-trellis.md) - If you're familiar with Kubernetes, this article explains Trellis design using K8s concept analogies
