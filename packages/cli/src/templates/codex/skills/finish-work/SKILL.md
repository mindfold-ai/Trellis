---
name: finish-work
description: "Wrap up an active Trellis task: archive it and record a session journal. Refuses to run if the working tree has uncommitted code changes (those belong in workflow Phase 3.4 first). Use when the user asks to finish / wrap up / call it a day, or invokes $finish-work."
---

# Finish Work

Wrap up the current session: archive the active task and record the session journal. Code commits are NOT done here — those happen in workflow Phase 3.4 before you invoke this skill.

## Step 1: Sanity check — working tree must be clean

Run:

```bash
git status --porcelain
```

Filter out paths under `.trellis/workspace/` and `.trellis/tasks/` — those are managed by `add_session.py` and `task.py archive` auto-commits and will appear dirty as part of this skill's own work.

If anything else is dirty (any path outside those two prefixes), **stop and bail out** with:

> "Working tree has uncommitted code changes. Return to workflow Phase 3.4 to commit them before running `$finish-work`."

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

## Relationship to Other Skills

```
Development Flow:
  Phase 3.4 (workflow.md) -> AI drafts batched commits -> user confirms -> git commit
                                                                              |
                                                                              v
                                                                    $finish-work
                                                                    (archive + journal)

Debug Flow:
  Hit bug -> Fix -> $break-loop -> Knowledge capture
```

- `$finish-work` — this skill, archive + record session
- `$break-loop` — deep analysis after debugging
