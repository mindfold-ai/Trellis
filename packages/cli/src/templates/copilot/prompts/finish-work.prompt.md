---
description: "Trellis Copilot prompt: Finish Work — archive task + record session journal"
---

# Finish Work

Wrap up the current session: archive the active task and record the session journal. Code commits are NOT done here — those happen in workflow Phase 3.4 before you invoke this prompt.

**Timing**: After Phase 3.4 (Commit changes) — when the working tree is already clean.

---

## Step 1: Sanity check — working tree must be clean

Run:

```bash
git status --porcelain
```

Filter out paths under `.trellis/workspace/` and `.trellis/tasks/` — those are managed by `add_session.py` and `task.py archive` auto-commits and will appear dirty as part of this prompt's own work.

If anything else is dirty (any path outside those two prefixes), **stop and bail out** with:

> "Working tree has uncommitted code changes. Return to workflow Phase 3.4 to commit them before running `/finish-work`."

Do NOT run `git commit` here. Do NOT prompt the user to commit. The user goes back to Phase 3.4 and the AI drives the batched commit there.

## Step 2: Archive task (if there is an active task)

```bash
python3 ./.trellis/scripts/task.py archive <task-name>
```

This produces a `chore(task): archive ...` commit via the script's auto-commit. If there is no active task, skip this step.

## Step 3: Record session journal

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

Use the work-commit hashes produced in Phase 3.4 (run `git log --oneline` to find them) for `--commit`. Do not include the archive commit hash. This produces a `chore: record journal` commit.

Final git log order: `<work commits from 3.4>` → `chore(task): archive ...` → `chore: record journal`.

---

## Relationship to Other Commands

```
Development Flow (workflow.md Phase 3):
  3.1 Quality verification
  3.2 Debug retrospective (on demand)
  3.3 Spec update
  3.4 Commit changes  -> AI drafts batched commits, user confirms
  3.5 Wrap-up         -> /finish-work (this prompt: archive + journal)

Debug Flow:
  Hit bug -> Fix -> /break-loop -> Knowledge capture
```

- `/finish-work` — archive + record session (this prompt)
- `/break-loop` — deep analysis after debugging

---

## Core Principle

> **Finish-work is pure bookkeeping.** Code is already committed before this runs. If the working tree is dirty, this prompt refuses to proceed.
