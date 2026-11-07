---
description: "Trellis Copilot prompt: Finish Work — survey + archive task + record session journal"
---

# Finish Work

Wrap up the current session: archive the active task (and any other completed-but-unarchived tasks the user wants to clean up) and record the session journal. Code commits are NOT done here — those happen in workflow Phase 3.4 before you invoke this prompt.

If the task worktree will be removed, run archival and journal recording from a retained checkout where the task artifacts are already available. Do not leave bookkeeping commits only in a checkout or branch scheduled for deletion.

**Timing**: After Phase 3.4 (Commit changes) — when the working tree is already clean.

---

## Step 1: Survey current state

```bash
python3 ./.trellis/scripts/get_context.py --mode record
```

This prints:

- **My active tasks** — review whether any besides the current one are actually done (code merged, AC met) and should be archived this round.
- **Git status** — quick visual on what's dirty.
- **Recent commits** — you'll need their hashes in Step 4 for `--commit`.

If `--mode record` surfaces other completed tasks not tied to the current session, surface them to the user with a one-shot confirmation: "These N tasks look done — archive them too in this round? [y/N]". Default is no; the current active task is always archived in Step 3 regardless.

## Step 2: Sanity check — classify dirty paths

Run:

```bash
git status --porcelain
```

Filter out paths under `.trellis/workspace/` and `.trellis/tasks/` — those are managed by `add_session.py` and `task.py archive` auto-commits and will appear dirty as part of this prompt's own work.

For each remaining dirty path, decide whether it belongs to **the current task** or to **other parallel work** (e.g., another terminal window editing the same repo). Heuristics:

- Paths referenced in the current task's `prd.md` / `implement.jsonl` / `check.jsonl` → current task
- Paths in code areas matching the task's stated scope, or that you remember editing this session → current task
- Paths in unrelated areas you have no recollection of touching this session → other parallel work

Then route:

- **Any remaining path looks like current-task work** — bail out with:
  > "Working tree has uncommitted code changes from this task: `<list>`. Return to workflow Phase 3.4 to commit them before running `/finish-work`."

  Do NOT run `git commit` here. Do NOT prompt the user to commit. The user goes back to Phase 3.4 and the AI drives the batched commit there.
- **All remaining paths look unrelated** (other parallel-window work) — report them once and continue to Step 3:
  > "FYI, dirty files outside this task's scope — leaving them for the other window: `<list>`."
- **Genuinely unsure** — ask the user once: "Are `<list>` this task's work I forgot to commit, or another window's? (commit / ignore)" — then route per their answer.

## Step 3: Archive task(s)

```bash
python3 ./.trellis/scripts/task.py archive <task-name>
```

At minimum: the current active task (if any). Plus any extra tasks the user confirmed in Step 1. Each archive produces a `chore(task): archive ...` commit via the script's auto-commit.

If there is no active task and the user did not confirm any cleanup archives, skip this step.

## Step 4: Record session journal

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

Use the work-commit hashes produced in Phase 3.4 (visible in Step 1's `Recent commits` list, or via `git log --oneline`) for `--commit`. Do not include the archive commit hashes from Step 3. This produces a `chore: record journal` commit.

Final git log order: `<work commits from 3.4>` → `chore(task): archive ...` (one or more) → `chore: record journal`.

## Step 5: Clean up task worktree and branches

Account for all three resources: **task worktree, local task branch, and remote task branch**. This applies even when no Trellis task was created. Follow the user's and project's cleanup authorization; do not ask again when cleanup is already authorized.

Before deleting anything, verify the task PR is merged into its intended target and any project-required delivery or deployment is complete. If either is pending, retain the resources and report cleanup as pending; archival alone is not proof of merge. Preserve resources the user explicitly wants to keep.

Record the task worktree path, branch, PR URL, merged PR head commit, and the remote matching the PR's **source repository** (including forks). Check for uncommitted and untracked work, commits outside the merged PR, and archive/journal commits that still need delivery. Preserve and report anything not safely accounted for; never select resources by a similar name or delete another session's work.

From a retained checkout, clean up each verified resource and read back the result:

1. Remove the task worktree with `git worktree remove <task-path>`, then confirm its path is absent from `git worktree list --porcelain`.
2. Delete the local branch with `git branch -d <task-branch>`, then confirm `refs/heads/<task-branch>` is absent with `git show-ref --verify`. If safe deletion refuses (including squash/rebase merges), retain and report it; do not silently escalate to `-D` or `--force`.
3. Query the exact remote ref with `git ls-remote --heads <source-remote> refs/heads/<task-branch>`. If present, require its tip to match the merged PR head commit and use that expected tip as a deletion lease: `git push --force-with-lease=refs/heads/<task-branch>:<pr-head-commit> <source-remote> :refs/heads/<task-branch>`. Query the exact ref again to confirm deletion. A successful query with no match means absent, including platform auto-deletion; a failed query does not. If the tip changed, retain and report the branch.

Report each resource as removed, already absent, or retained with a reason. Local cleanup alone must not be reported as complete cleanup.

---

## Relationship to Other Commands

```
Development Flow (workflow.md Phase 3):
  3.2 Debug retrospective (on demand)
  3.3 Spec update
  3.4 Commit changes  -> AI drafts batched commits, user confirms
  3.5 Wrap-up         -> /finish-work (survey + archive + journal + eligible task cleanup)
  (3.1 was folded into 2.2 + 3.4 — see workflow.md "Phase 3: Finish" note)

Debug Flow:
  Hit bug -> Fix -> /break-loop -> Knowledge capture
```

- `/finish-work` — survey + archive + record session + eligible task cleanup (this prompt)
- `/break-loop` — deep analysis after debugging

---

## Core Principle

> **Code delivery precedes cleanup.** Code is already committed before this runs. Task resources are removed only after merge and required delivery, with each removal verified; pending delivery or unsafe cleanup is reported explicitly.
