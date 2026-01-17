# Agent Traces Index

> Records of all AI Agent work traces across all developers

---

## Overview

This directory tracks traces for all developers working with AI Agents on this project.

### File Structure

```
agent-traces/
|-- index.md              # This file - main index
\-- {developer}/          # Per-developer directory
    |-- index.md          # Personal index with session history
    |-- features/         # Feature files
    |   |-- *.json        # Active features
    |   \-- archive/      # Archived features by month
    \-- traces-N.md     # Progress files (sequential: 1, 2, 3...)
```

---

## Active Developers

| Developer | Last Active | Sessions | Active File |
|-----------|-------------|----------|-------------|
| (none yet) | - | - | - |

---

## Getting Started

### For New Developers

Run the initialization script:

```bash
./.trellis/scripts/init-developer.sh <your-name>
```

This will:
1. Create your identity file (gitignored)
2. Create your progress directory
3. Create your personal index
4. Create initial traces file

### For Returning Developers

1. Get your developer name:
   ```bash
   ./.trellis/scripts/get-developer.sh
   ```

2. Read your personal index:
   ```bash
   cat .trellis/agent-traces/$(./.trellis/scripts/get-developer.sh)/index.md
   ```

---

## Guidelines

### Traces File Rules

- **Max 2000 lines** per traces file
- When limit is reached, create `traces-{N+1}.md`
- Update your personal `index.md` when creating new files

### Session Record Format

Each session should include:
- Summary: One-line description
- Main Changes: What was modified
- Git Commits: Commit hashes and messages
- Next Steps: What to do next

---

## Session Template

Use this template when recording sessions:

```markdown
## Session {N}: {Title}

**Date**: YYYY-MM-DD
**Feature**: {feature-name}

### Summary

{One-line summary}

### Main Changes

- {Change 1}
- {Change 2}

### Git Commits

| Hash | Message |
|------|---------|
| `abc1234` | {commit message} |

### Testing

- [OK] {Test result}

### Status

[OK] **Completed** / # **In Progress** / [P] **Blocked**

### Next Steps

- {Next step 1}
- {Next step 2}
```

---

**Language**: All documentation must be written in **English**.
