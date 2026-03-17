# Archive Task

Archive a completed task to `.trellis/tasks/archive/{year-month}/`.

---

## Usage

```
/archive-task [task-name]
```

If no task name is provided, list active tasks and ask the user to pick one.

---

## Steps `[AI]`

### Step 1: Identify Task

If `$ARGUMENTS` is provided, use it as the task name.

If not provided, list tasks and ask user to choose:

```bash
python3 ./.trellis/scripts/task.py list
```

### Step 2: Archive

```bash
python3 ./.trellis/scripts/task.py archive <task-name>
```

### Step 3: Report

Confirm the task has been archived and show the archive path.
