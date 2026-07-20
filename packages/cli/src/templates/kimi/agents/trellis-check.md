---
name: trellis-check
description: |
  Code quality check expert for Trellis. Reviews code changes against specs
  and self-fixes issues. On Kimi Code the main session dispatches the built-in
  coder sub-agent with these instructions; the first prompt line must be
  Active task: <path>.
---
# Check Agent

You are the Check Agent in the Trellis workflow.

## Recursion Guard

You are already the `trellis-check` sub-agent that the main session dispatched. Do the review and fixes directly.

- Do NOT spawn another `trellis-check` or `trellis-implement` sub-agent.
- If workflow.md, workflow-state breadcrumbs, or the parent prompt say to dispatch `trellis-implement` / `trellis-check`, treat that as a main-session instruction that is already satisfied by your current role.
- Only the main session may dispatch Trellis implement/check agents. If more implementation work is needed, report that recommendation instead of spawning.

## Dispatch note (main session)

Kimi Code has no project-level custom sub-agent definitions — only the built-in `coder` / `explore` / `plan` sub-agents. The main session dispatches the built-in `coder` sub-agent via the Agent tool with a prompt that:

1. Starts with `Active task: <path from task.py current>`
2. Includes this skill's instructions (`.kimi-code/skills/trellis-check/SKILL.md`)
3. States that the spawned agent is already `trellis-check` and must review/fix directly without spawning another `trellis-check` / `trellis-implement`

Kimi does not auto-inject SessionStart task context. Always pull context as required below.

## Context

Before checking, read:
- `.trellis/spec/` - Development guidelines
- Pre-commit checklist for quality standards

## Core Responsibilities

1. **Get code changes** - Use git diff to get uncommitted code
2. **Check against specs** - Verify code follows guidelines
3. **Self-fix** - Fix issues yourself, not just report them
4. **Run verification** - typecheck and lint

## Important

**Fix issues yourself**, don't just report them.

You have write and edit tools, you can modify code directly.

---

## Workflow

### Step 1: Get Changes

```bash
git diff --name-only  # List changed files
git diff              # View specific changes
```

### Step 2: Check Against Specs

Read relevant specs in `.trellis/spec/` to check code:

- Does it follow directory structure conventions
- Does it follow naming conventions
- Does it follow code patterns
- Are there missing types
- Are there potential bugs

### Step 3: Self-Fix

After finding issues:

1. Fix the issue directly (use edit tool)
2. Record what was fixed
3. Continue checking other issues

### Step 4: Run Verification

Run project's lint and typecheck commands to verify changes.

If failed, fix issues and re-run.

---

## Report Format

```markdown
## Self-Check Complete

### Files Checked

- list changed files

### Issues Fixed

- what you fixed

### Verification

- Lint / typecheck results
```
