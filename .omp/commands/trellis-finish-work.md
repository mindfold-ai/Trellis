---
description: "Finish completed tasks: verify evidence and archive the selected task."
argument-hint: [task-name]
---

# Finish Work

Wrap up the current session: archive the active task (and any other completed-but-unarchived tasks the user wants to clean up). Code commits are NOT done here — those happen in workflow Phase 3.4 before you invoke this command.

## Step 1: Survey current state

```bash
python3 ./.trellis/scripts/get_context.py
```

Context distinguishes the current-session task from the project task inventory. Read the current task's acceptance criteria and verification evidence before archiving it. Other tasks require explicit selection and user confirmation; never infer personal task ownership.

## Step 2: Sanity check — classify dirty paths

Run:

```bash
git status --porcelain -- . ':(exclude).trellis/workspace' ':(exclude).trellis/agent-traces' ':(exclude).trellis/.developer' ':(exclude).trellis/.backup-*'
```

The command excludes retired historical data before Git examines files. Classify task metadata changes separately from code; leave unrelated changes untouched.

For each remaining dirty path, decide whether it belongs to **the current task** or to **other parallel work** (e.g., another terminal window editing the same repo). Heuristics:

- Paths referenced in the current task's `prd.md` / `implement.jsonl` / `check.jsonl` → current task
- Paths in code areas matching the task's stated scope, or that you remember editing this session → current task
- Paths in unrelated areas you have no recollection of touching this session → other parallel work

Then route:

- **Any remaining path looks like current-task work** — bail out with:
  > "Working tree has uncommitted code changes from this task: `<list>`. Return to workflow Phase 3.4 to commit them before running `/trellis-finish-work`."

  Do NOT run `git commit` here. Do NOT prompt the user to commit. The user goes back to Phase 3.4 and the AI drives the batched commit there.
- **All remaining paths look unrelated** (other parallel-window work) — report them once and continue to Step 3:
  > "FYI, dirty files outside this task's scope — leaving them for the other window: `<list>`."
- **Genuinely unsure** — ask the user once: "Are `<list>` this task's work I forgot to commit, or another window's? (commit / ignore)" — then route per their answer.

## Step 3: Archive task(s)

```bash
python3 ./.trellis/scripts/task.py archive <task-name>
```

Archive the current task only when its acceptance criteria and verification evidence establish completion. If incomplete, leave it active and report remaining work. Additional tasks require the explicit confirmation from Step 1. Archive auto-commit defaults to true, controlled by `task_auto_commit`; honor explicit opt-outs and use `--no-commit` when commits are not authorized.

If there is no active task and the user did not confirm any cleanup archives, skip this step.

## Step 4: Report outcome

Summarize the archived task, validation results, and remaining follow-ups. Keep durable evidence in the task artifacts; no additional recording step is needed.
