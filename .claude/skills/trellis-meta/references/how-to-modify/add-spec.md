# How To: Add Spec Category

Add a new spec category like `mobile/`.

**Platform**: All

---

## Files to Modify

| File | Action | Required |
|------|--------|----------|
| `.trellis/spec/mobile/index.md` | Create | Yes |
| `.trellis/spec/mobile/*.md` | Create | Yes |
| Task JSONL templates | Update | Yes |
| `trellis-local/SKILL.md` | Update | Yes |

---

## Step 1: Create Category Directory

```bash
mkdir -p .trellis/spec/mobile
```

---

## Step 2: Create Index File

Create `.trellis/spec/mobile/index.md`:

```markdown
# Mobile Specifications

Guidelines for mobile development.

## Quick Reference

| Topic | Guideline |
|-------|-----------|
| Architecture | MVVM pattern |
| State | Use StateFlow |
| Navigation | Jetpack Navigation |

## Specifications

1. [Architecture Guidelines](./architecture.md)
2. [UI Guidelines](./ui-guidelines.md)
3. [State Management](./state-management.md)

## Key Principles

- Principle 1
- Principle 2
- Principle 3
```

---

## Step 3: Create Spec Files

Create individual spec files in the category:

### Example: `architecture.md`

```markdown
# Mobile Architecture

## Overview

Description of architecture approach.

## Guidelines

### 1. Use MVVM Pattern

Explanation...

**Do:**
```kotlin
// Good example
```

**Don't:**
```kotlin
// Bad example
```

### 2. Another Guideline

...

## Related Specs

- [UI Guidelines](./ui-guidelines.md)
```

---

## Step 4: Update JSONL Templates

Add the new specs to relevant JSONL templates.

### Option A: Update task.py

Modify `init-context` to include mobile specs:

```python
def init_mobile_context(task_dir):
    jsonl_path = os.path.join(task_dir, "implement.jsonl")
    with open(jsonl_path, "a") as f:
        f.write(json.dumps({
            "file": ".trellis/spec/mobile/index.md",
            "reason": "Mobile guidelines"
        }) + "\n")
```

### Option B: Add to Existing Templates

Edit existing JSONL files:

```jsonl
{"file": ".trellis/spec/mobile/index.md", "reason": "Mobile guidelines"}
{"file": ".trellis/spec/mobile/architecture.md", "reason": "Architecture patterns"}
```

---

## Step 5: Document in trellis-local

Update `.claude/skills/trellis-local/SKILL.md`:

```markdown
## Specs Customized

### Added Categories

#### mobile/
- **Path**: `.trellis/spec/mobile/`
- **Purpose**: Mobile development guidelines
- **Added**: 2026-01-31
- **Files**:
  - `index.md` - Overview
  - `architecture.md` - Architecture patterns
  - `ui-guidelines.md` - UI patterns
```

---

## Spec File Best Practices

### Structure

```markdown
# [Spec Title]

## Overview
Brief description.

## Guidelines

### 1. [Guideline Name]
Explanation with examples.

### 2. [Another Guideline]
...

## Related Specs
Links to related specs.
```

### Naming

- Use kebab-case: `ui-guidelines.md`
- Be descriptive: `state-management.md` not `state.md`

### Cross-References

Link between specs:

```markdown
See [State Management](./state-management.md) for more details.
```

---

## Testing

1. Verify index links work
2. Create a task with the new specs in JSONL
3. Verify specs are injected correctly (Claude Code)
4. Verify specs are readable (Cursor)

---

## Checklist

- [ ] Category directory created
- [ ] Index file created with overview
- [ ] Spec files created with proper format
- [ ] JSONL templates updated
- [ ] Documented in trellis-local
- [ ] Cross-references verified
