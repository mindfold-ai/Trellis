# How To: Add Slash Command

Add a new `/trellis:my-command` command.

**Platform**: All (Claude Code + Cursor)

---

## Files to Modify

| File | Action | Required |
|------|--------|----------|
| `.claude/commands/trellis/my-command.md` | Create | Yes |
| `.cursor/commands/my-command.md` | Create | Optional |
| `trellis-local/SKILL.md` | Update | Yes |

---

## Step 1: Create Command File

Create `.claude/commands/trellis/my-command.md`:

```markdown
---
name: my-command
description: Short description of what the command does
---

# My Command

## Purpose

Detailed description of the command's purpose.

## When to Use

- Scenario 1
- Scenario 2

## Workflow

1. First step
2. Second step
3. Third step

## Output

What the command produces.
```

### Command Name Convention

- Use kebab-case: `my-command`, not `myCommand`
- Prefix with category if needed: `check-backend`, `before-frontend-dev`

---

## Step 2: Mirror to Cursor (Optional)

If supporting Cursor, copy to `.cursor/commands/my-command.md`.

**Note**: Cursor commands don't have the `trellis:` prefix.

---

## Step 3: Document in trellis-local

Update `.claude/skills/trellis-local/SKILL.md`:

```markdown
## Commands

### Added Commands

#### /trellis:my-command
- **File**: `.claude/commands/trellis/my-command.md`
- **Platform**: [ALL]
- **Purpose**: What it does
- **Added**: 2026-01-31
- **Reason**: Why it was added
```

---

## Examples

### Simple Command

```markdown
---
name: check-types
description: Run TypeScript type checking
---

# Check Types

Run `pnpm typecheck` and report results.

## Usage

Run this command after making code changes to verify type safety.
```

### Command with Parameters

Commands can reference user input or context:

```markdown
---
name: review-file
description: Review a specific file for code quality
---

# Review File

## Input

User should specify which file to review.

## Workflow

1. Read the specified file
2. Check against relevant specs
3. Report issues found
```

---

## Testing

1. Run the command: `/trellis:my-command`
2. Verify behavior matches description
3. Test edge cases

---

## Checklist

- [ ] Command file created with proper frontmatter
- [ ] Mirrored to Cursor (if needed)
- [ ] Documented in trellis-local
- [ ] Tested the command
