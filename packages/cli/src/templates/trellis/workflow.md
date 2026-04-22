# Development Workflow

---

## Core Principles

1. **Plan before code** — figure out what to do before you start
2. **Specs injected, not remembered** — guidelines are injected via hook/skill, not recalled from memory
3. **Persist everything** — research, decisions, and lessons all go to files; conversations get compacted, files don't
4. **Incremental development** — one task at a time
5. **Capture learnings** — after each task, review and write new knowledge back to spec

---

## Trellis System

### Developer Identity

On first use, initialize your identity:

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

Creates `.trellis/.developer` (gitignored) + `.trellis/workspace/<your-name>/`.

### Spec System

`.trellis/spec/` holds coding guidelines organized by package and layer.

- `.trellis/spec/<package>/<layer>/index.md` — entry point with **Pre-Development Checklist** + **Quality Check**. Actual guidelines live in the `.md` files it points to.
- `.trellis/spec/guides/index.md` — cross-package thinking guides.

```bash
python3 ./.trellis/scripts/get_context.py --mode packages   # list packages / layers
```

**When to update spec**: new pattern/convention found · bug-fix prevention to codify · new technical decision.

### Task System

Every task has its own directory under `.trellis/tasks/{MM-DD-name}/` holding `prd.md`, `implement.jsonl`, `check.jsonl`, `task.json`, optional `research/`, `info.md`.

```bash
# Task lifecycle
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>] [--parent <dir>]
python3 ./.trellis/scripts/task.py start <name>          # set as current (writes .current-task, triggers after_start hooks)
python3 ./.trellis/scripts/task.py finish                # clear current task (triggers after_finish hooks)
python3 ./.trellis/scripts/task.py archive <name>        # move to archive/{year-month}/
python3 ./.trellis/scripts/task.py list [--mine] [--status <s>]
python3 ./.trellis/scripts/task.py list-archive

# Code-spec context (injected into implement/check agents via JSONL)
python3 ./.trellis/scripts/task.py init-context <name> <type>    # type: backend|frontend|fullstack|test|docs
python3 ./.trellis/scripts/task.py add-context <name> <action> <file> <reason>
python3 ./.trellis/scripts/task.py list-context <name> [action]
python3 ./.trellis/scripts/task.py validate <name>

# Task metadata
python3 ./.trellis/scripts/task.py set-branch <name> <branch>
python3 ./.trellis/scripts/task.py set-base-branch <name> <branch>    # PR target
python3 ./.trellis/scripts/task.py set-scope <name> <scope>

# Hierarchy (parent/child)
python3 ./.trellis/scripts/task.py add-subtask <parent> <child>
python3 ./.trellis/scripts/task.py remove-subtask <parent> <child>

# PR creation
python3 ./.trellis/scripts/task.py create-pr [name] [--dry-run]
```

> Run `python3 ./.trellis/scripts/task.py --help` to see the authoritative, up-to-date list.

**Current-task mechanism**: `task.py start` writes the task path into `.trellis/.current-task`. Hook-capable platforms auto-inject this at session start, so the AI knows what you're working on without being told.

### Workspace System

Records every AI session for cross-session tracking under `.trellis/workspace/<developer>/`.

- `journal-N.md` — session log. **Max 2000 lines per file**; a new `journal-(N+1).md` is auto-created when exceeded.
- `index.md` — personal index (total sessions, last active).

```bash
python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash" --summary "Summary"
```

### Context Script

```bash
python3 ./.trellis/scripts/get_context.py                            # full session context
python3 ./.trellis/scripts/get_context.py --mode packages            # available packages + spec layers
python3 ./.trellis/scripts/get_context.py --mode phase --step <X.Y>  # detailed guide for a workflow step
```

---

## Phase Index

```
Phase 1: Plan    → figure out what to do (brainstorm + research → prd.md)
Phase 2: Execute → write code and pass quality checks
Phase 3: Finish  → distill lessons + wrap-up
```

### Phase 1: Plan
- 1.0 Create task `[required · once]`
- 1.1 Requirement exploration `[required · repeatable]`
- 1.2 Research `[optional · repeatable]`
- 1.3 Configure context `[required · once]` — Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid
- 1.4 Completion criteria

### Phase 2: Execute
- 2.1 Implement `[required · repeatable]`
- 2.2 Quality check `[required · repeatable]`
- 2.3 Rollback `[on demand]`

### Phase 3: Finish
- 3.1 Quality verification `[required · repeatable]`
- 3.2 Debug retrospective `[on demand]`
- 3.3 Spec update `[required · once]`
- 3.4 Wrap-up reminder

### Rules

1. Identify which Phase you're in, then continue from the next step there
2. Run steps in order inside each Phase; `[required]` steps can't be skipped
3. Phases can roll back (e.g., Execute reveals a prd defect → return to Plan to fix, then re-enter Execute)
4. Steps tagged `[once]` are skipped if already done; don't re-run

### Skill Routing

When a user request matches one of these intents, load the corresponding skill first — do not skip skills.

| User intent | Skill |
|---|---|
| Wants a new feature / requirement unclear | trellis-brainstorm |
| About to write code / start implementing | trellis-before-dev |
| Finished writing / want to verify | trellis-check |
| Stuck / fixed same bug several times | trellis-break-loop |
| Spec needs update | trellis-update-spec |

### DO NOT skip skills

| What you're thinking | Why it's wrong |
|---|---|
| "This is simple, just code it" | Simple tasks often grow complex; before-dev takes under a minute |
| "I already thought it through in plan mode" | Plan-mode output lives in memory — sub-agents can't see it; must be persisted to prd.md |
| "I already know the spec" | The spec may have been updated since you last read it; read again |
| "Code first, check later" | `check` surfaces issues you won't notice yourself; earlier is cheaper |

### Loading Step Detail

At each step, run this to fetch detailed guidance:

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step <step>
# e.g. python3 ./.trellis/scripts/get_context.py --mode phase --step 1.1
```

---

## Phase 1: Plan

Goal: figure out what to build, produce a clear requirements doc and the context needed to implement it.

#### 1.0 Create task `[required · once]`

Create the task directory and set it as current:

```bash
python3 ./.trellis/scripts/task.py create "<task title>" --slug <name>
python3 ./.trellis/scripts/task.py start <task-dir>
```

Skip when: `.trellis/.current-task` already points to a task.

#### 1.1 Requirement exploration `[required · repeatable]`

Load the `trellis-brainstorm` skill and explore requirements interactively with the user per the skill's guidance.

The brainstorm skill will guide you to:
- Ask one question at a time
- Prefer researching over asking the user
- Prefer offering options over open-ended questions
- Update `prd.md` immediately after each user answer

Return to this step whenever requirements change and revise `prd.md`.

#### 1.2 Research `[optional · repeatable]`

Research can happen at any time during requirement exploration. It isn't limited to local code — you can use any available tool (MCP servers, skills, web search, etc.) to look up external information, including third-party library docs, industry practices, API references, etc.

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

Spawn the research sub-agent:

- **Agent type**: `trellis-research`
- **Task description**: Research <specific question>
- **Key requirement**: Research output MUST be persisted to `{TASK_DIR}/research/`

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

[Kilo, Antigravity, Windsurf]

Do the research in the main session directly and write findings into `{TASK_DIR}/research/`.

[/Kilo, Antigravity, Windsurf]

**Research artifact conventions**:
- One file per research topic (e.g. `research/auth-library-comparison.md`)
- Record third-party library usage examples, API references, version constraints in files
- Note relevant spec file paths you discovered for later reference

Brainstorm and research can interleave freely — pause to research a technical question, then return to talk with the user.

**Key principle**: Research output must be written to files, not left only in the chat. Conversations get compacted; files don't.

#### 1.3 Configure context `[required · once]`

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

Once research output is solid, initialize the agent context files:

```bash
python3 ./.trellis/scripts/task.py init-context "$TASK_DIR" <type>
# type: backend | frontend | fullstack
```

Skip when: `implement.jsonl` already exists.

Append any extra spec files or code patterns you find `[optional · repeatable]`:

```bash
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" implement "<path>" "<reason>"
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" check "<path>" "<reason>"
```

These jsonl files are auto-injected into sub-agent prompts during Phase 2 via hook.

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

[Kilo, Antigravity, Windsurf]

Skip this step. Context is loaded directly by the `trellis-before-dev` skill in Phase 2.

[/Kilo, Antigravity, Windsurf]

#### 1.4 Completion criteria

| Condition | Required |
|------|:---:|
| `prd.md` exists | ✅ |
| User confirms requirements | ✅ |
| `research/` has artifacts (complex tasks) | recommended |
| `info.md` technical design (complex tasks) | optional |

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

| `implement.jsonl` exists | ✅ |

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

---

## Phase 2: Execute

Goal: turn the prd into code that passes quality checks.

#### 2.1 Implement `[required · repeatable]`

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

Spawn the implement sub-agent:

- **Agent type**: `trellis-implement`
- **Task description**: Implement the requirements per prd.md, consulting materials under `{TASK_DIR}/research/`; finish by running project lint and type-check

The platform hook auto-handles:
- Reads `implement.jsonl` and injects the referenced spec files into the agent prompt
- Injects prd.md content

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

[Kilo, Antigravity, Windsurf]

1. Load the `trellis-before-dev` skill to read project guidelines
2. Read `{TASK_DIR}/prd.md` for requirements
3. Consult materials under `{TASK_DIR}/research/`
4. Implement the code per requirements
5. Run project lint and type-check

[/Kilo, Antigravity, Windsurf]

#### 2.2 Quality check `[required · repeatable]`

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

Spawn the check sub-agent:

- **Agent type**: `trellis-check`
- **Task description**: Review all code changes against spec and prd; fix any findings directly; ensure lint and type-check pass

The check agent's job:
- Review code changes against specs
- Auto-fix issues it finds
- Run lint and typecheck to verify

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid]

[Kilo, Antigravity, Windsurf]

Load the `trellis-check` skill and verify the code per its guidance:
- Spec compliance
- lint / type-check / tests
- Cross-layer consistency (when changes span layers)

If issues are found → fix → re-check, until green.

[/Kilo, Antigravity, Windsurf]

#### 2.3 Rollback `[on demand]`

- `check` reveals a prd defect → return to Phase 1, fix `prd.md`, then redo 2.1
- Implementation went wrong → revert code, redo 2.1
- Need more research → research (same as Phase 1.2), write findings into `research/`

---

## Phase 3: Finish

Goal: ensure code quality, capture lessons, record the work.

#### 3.1 Quality verification `[required · repeatable]`

Load the `trellis-check` skill and do a final verification:
- Spec compliance
- lint / type-check / tests
- Cross-layer consistency (when changes span layers)

If issues are found → fix → re-check, until green.

#### 3.2 Debug retrospective `[on demand]`

If this task involved repeated debugging (the same issue was fixed multiple times), load the `trellis-break-loop` skill to:
- Classify the root cause
- Explain why earlier fixes failed
- Propose prevention

The goal is to capture debugging lessons so the same class of issue doesn't recur.

#### 3.3 Spec update `[required · once]`

Load the `trellis-update-spec` skill and review whether this task produced new knowledge worth recording:
- Newly discovered patterns or conventions
- Pitfalls you hit
- New technical decisions

Update the docs under `.trellis/spec/` accordingly. Even if the conclusion is "nothing to update", walk through the judgment.

#### 3.4 Wrap-up reminder

After the above, remind the user they can run `/finish-work` to wrap up (archive the task, record the session).

---

## Workflow State Breadcrumbs

<!-- Injected per-turn by UserPromptSubmit hook (inject-workflow-state.py).
     Edit the text inside each [workflow-state:STATUS]...[/workflow-state:STATUS]
     block to customize per-task-status flow reminders. Users who fork the
     Trellis workflow only need to edit this file, not the hook script.

     Tag STATUS matches task.json.status. Default statuses: planning /
     in_progress / completed. Add custom status blocks as needed (hyphens
     and underscores allowed). Hook falls back to built-in defaults when
     a status has no tag block. -->

[workflow-state:no_task]
No active task.
Trigger words in the user message that REQUIRE creating a task (non-negotiable, do NOT self-exempt): 重构 / 抽成 / 独立 / 分发 / 拆出来 / 搞一个 / 做成 / 接入 / 集成 / refactor / rewrite / extract / productize / publish / build X / design Y.
Task is NOT required ONLY if ALL three hold: (a) zero file writes this turn, (b) answer fits in one reply with no multi-round plan, (c) no research beyond reading 1-2 repo files.
When in doubt: create task. Over-tasking is cheap; under-tasking leaks plans and research into main context.
Flow: load `trellis-brainstorm` skill → it creates the task via `python3 ./.trellis/scripts/task.py create` and drives requirements Q&A. For research-heavy work (tool comparison, docs, cross-platform survey), spawn `trellis-research` sub-agents via Task tool — NEVER do 3+ inline WebFetch/WebSearch/`gh api` calls in the main conversation.
[/workflow-state:no_task]

[workflow-state:planning]
Complete prd.md via trellis-brainstorm skill; then run task.py start.
Research belongs in `{task_dir}/research/*.md`, written by `trellis-research` sub-agents. Do NOT inline WebFetch/WebSearch in main session — PRD only links to research files.
[/workflow-state:planning]

[workflow-state:in_progress]
Flow: trellis-implement → trellis-check → trellis-update-spec → finish
Check conversation history + git status to determine current step; do NOT skip trellis-check.
[/workflow-state:in_progress]

[workflow-state:completed]
User commits changes; then run task.py archive.
[/workflow-state:completed]
