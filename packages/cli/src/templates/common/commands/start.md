# Start Session

Initialize a Trellis-managed development session. This platform has no session-start hook, so load the current repository facts and delegate workflow-specific continuation to the active workflow.

---

## Step 1: Load Exact Context

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py
```

This output contains Git facts, the exact current-session task binding, and project task inventory. Treat only `## CURRENT SESSION TASK` as current-task authority. `## PROJECT TASKS` is display-only and must never be used to choose a replacement task.

If context resolution reports a stale, conflicting, corrupt, or ambiguous binding, stop and report that result. Do not select another task.

If the output includes a line beginning `Trellis update available:`, copy the full line verbatim when summarizing session context. Do not shorten operational command hints.

## Step 2: Load the Current Workflow Overview

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase
```

Keep the returned Phase Index together with the current-task facts from Step 1.

## Step 3: Enter or Continue

- If `## CURRENT SESSION TASK` is `(none)`, follow only the current workflow's initial request entry from the Phase Index. Do not create or select a task from `## PROJECT TASKS` unless that entry and the user authorize it.
- If an exact current task is present, load the current invocation repository's continuation contract:

  ```bash
  {{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode continuation
  ```

  Execute the returned contract using the exact current-task facts and Phase Index already loaded. The contract, not this entry, decides the workflow-specific next owner, recovery path, or fail-closed stop.

If continuation extraction returns `invalid_continuation_contract` or any resolver error, stop and report the typed diagnostic. Do not infer a route from task status, artifacts, Git history, project inventory, or earlier conversation text.

## Step 4: Load Coding Guidelines When Needed

Before implementation, discover package/layer specs and read the relevant indexes:

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode packages
cat .trellis/spec/guides/index.md
cat .trellis/spec/<package>/<layer>/index.md
```

Full workflow detail remains in `.trellis/workflow.md` and should be read on demand.
