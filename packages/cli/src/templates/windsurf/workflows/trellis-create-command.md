---
description: Create a new Windsurf workflow in `.windsurf/workflows/trellis-<workflow-name>.md` based on user requirements.
---

# Create New Workflow

## Usage

```
/trellis-create-command <workflow-name> <description>
```

**Example**:
```
/trellis-create-command review-pr Check PR code changes against project guidelines
```

## Execution Steps

### 1. Parse Input

Extract from user input:
- **Workflow name**: Use kebab-case (e.g., `review-pr`)
- **Description**: What the workflow should accomplish

### 2. Analyze Requirements

Determine workflow type based on description:
- **Initialization**: Read docs, establish context
- **Pre-development**: Read guidelines, check dependencies
- **Code check**: Validate code quality and guideline compliance
- **Recording**: Record progress, questions, structure changes
- **Generation**: Generate docs, code templates

### 3. Generate Workflow Content

Based on workflow type, generate appropriate content:

**Simple workflow** (1-3 lines):
```markdown
Concise instruction describing what to do
```

**Complex workflow** (with steps):
```markdown
# Workflow Title

Workflow description

## Steps

### 1. First Step
Specific action

### 2. Second Step
Specific action

## Output Format (if needed)

Template
```

### 4. Create Files

Create:
- `.windsurf/workflows/trellis-<workflow-name>.md`

### 5. Confirm Creation

Output result:
```
[OK] Created Workflow: /trellis-<workflow-name>

File paths:
- .windsurf/workflows/trellis-<workflow-name>.md

Usage:
/trellis-<workflow-name>

Description:
<description>
```

## Workflow Content Guidelines

### [OK] Good workflow content

1. **Clear and concise**: Immediately understandable
2. **Executable**: AI can follow steps directly
3. **Well-scoped**: Clear boundaries of what to do and not do
4. **Has output**: Specifies expected output format (if needed)

### [X] Avoid

1. **Too vague**: e.g., "optimize code"
2. **Too complex**: Single workflow should not exceed 100 lines
3. **Duplicate functionality**: Check if similar workflow exists first

## Naming Conventions

| Workflow Type | Prefix | Example |
|--------------|--------|---------|
| Session Start | `start` | `start` |
| Pre-development | `before-` | `before-dev` |
| Check | `check-` | `check` |
| Record | `record-` | `record-session` |
| Generate | `generate-` | `generate-api-doc` |
| Update | `update-` | `update-changelog` |
| Other | Verb-first | `review-code`, `sync-data` |

## Example

### Input
```
/trellis-create-command review-pr Check PR code changes against project guidelines
```

### Generated Workflow Content
```markdown
# PR Code Review

Check current PR code changes against project guidelines.

## Steps

### 1. Get Changed Files
```bash
git diff main...HEAD --name-only
```

### 2. Categorized Review

**Frontend files** (`apps/web/`):
- Reference `.trellis/spec/frontend/index.md`

**Backend files** (`packages/api/`):
- Reference `.trellis/spec/backend/index.md`

### 3. Output Review Report

Format:

## PR Review Report

### Changed Files
- [file list]

### Check Results
- [OK] Passed items
- [X] Issues found

### Suggestions
- [improvement suggestions]
```
