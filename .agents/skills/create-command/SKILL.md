---
name: create-command
description: "Scaffolds a new slash command in both .cursor/commands/ and .claude/commands/ directories with proper naming conventions and structure. Analyzes requirements to determine command type and generates appropriate content. Use when adding a new developer workflow command, creating a custom slash command, or extending the Trellis command set."
---

# Create New Slash Command

Create a new slash command in both `.cursor/commands/` (with `trellis-` prefix) and `.claude/commands/trellis/` directories based on user requirements.

## Usage

```
/trellis:create-command <command-name> <description>
```

**Example**:
```
/trellis:create-command review-pr Check PR code changes against project guidelines
```

## Execution Steps

### 1. Parse Input

Extract from user input:
- **Command name**: Use kebab-case (e.g., `review-pr`)
- **Description**: What the command should accomplish

### 2. Analyze Requirements

Determine command type based on description:
- **Initialization**: Read docs, establish context
- **Pre-development**: Read guidelines, check dependencies
- **Code check**: Validate code quality and guideline compliance
- **Recording**: Record progress, questions, structure changes
- **Generation**: Generate docs, code templates

### 3. Generate Command Content

Based on command type, generate appropriate content:

**Simple command** (1-3 lines):
```markdown
Concise instruction describing what to do
```

**Complex command** (with steps):
```markdown
# Command Title

Command description

## Steps

### 1. First Step
Specific action

### 2. Second Step
Specific action

## Output Format (if needed)

Template
```

### 4. Create Files

Create in both directories:
- `.cursor/commands/trellis-<command-name>.md`
- `.claude/commands/trellis/<command-name>.md`

### 5. Confirm Creation

Output result:
```
[OK] Created Slash Command: /<command-name>

File paths:
- .cursor/commands/trellis-<command-name>.md
- .claude/commands/trellis/<command-name>.md

Usage:
/trellis:<command-name>

Description:
<description>
```

## Command Content Guidelines

### [OK] Good command content

1. **Clear and concise**: Immediately understandable
2. **Executable**: AI can follow steps directly
3. **Well-scoped**: Clear boundaries of what to do and not do
4. **Has output**: Specifies expected output format (if needed)

### [X] Avoid

1. **Too vague**: e.g., "optimize code"
2. **Too complex**: Single command should not exceed 100 lines
3. **Duplicate functionality**: Check if similar command exists first

## Naming Conventions

| Command Type | Prefix | Example |
|--------------|--------|---------|
| Session Start | `start` | `start` |
| Pre-development | `before-` | `before-dev` |
| Check | `check-` | `check`, `check-cross-layer` |
| Record | `record-` | `record-session` |
| Generate | `generate-` | `generate-api-doc` |
| Update | `update-` | `update-changelog` |
| Other | Verb-first | `review-code`, `sync-data` |

## Example

### Input
```
/trellis:create-command review-pr Check PR code changes against project guidelines
```

### Generated Command Content
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
- Reference `.trellis/spec/cli/frontend/index.md`

**Backend files** (`packages/api/`):
- Reference `.trellis/spec/cli/backend/index.md`

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
