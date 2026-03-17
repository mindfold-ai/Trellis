# Activate Task

Set a task as the current active task so hooks can inject its context into subagents.

---

## Usage

```
/activate-task [task-name]
```

If no task name is provided, list active tasks and ask the user to pick one.

---

## Steps `[AI]`

### Step 1: Identify Task

If `$ARGUMENTS` is provided, use it as the task name/directory.

If not provided, list tasks and ask user to choose:

```bash
python3 ./.trellis/scripts/task.py list
```

### Step 2: Activate

```bash
python3 ./.trellis/scripts/task.py start <task-dir>
```

Where `<task-dir>` is the task directory name (e.g. `03-16-create-task-commands`).

### Step 3: Report

Confirm which task is now active. Mention that subagent context injection is now enabled for this task.
