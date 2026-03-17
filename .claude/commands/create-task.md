# Create Task

Create a new task directory with task.json.

---

## Usage

```
/create-task <title>
```

User provides a task title (and optionally a slug). If no slug is given, generate one from the title.

---

## Steps `[AI]`

### Step 1: Parse Arguments

From `$ARGUMENTS`, extract:
- **title** (required): The task title
- **slug** (optional): If user provides `--slug <name>`, use it; otherwise auto-generate a short kebab-case slug from the title

### Step 2: Create Task

```bash
python3 ./.trellis/scripts/task.py create "<title>" --slug <slug>
```

### Step 3: Report

Show the user:
- Task directory path created
- Suggest next steps: write a PRD, or run `/activate-task` to set it as current task
