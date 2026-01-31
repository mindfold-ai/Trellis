# Spec System

Maintain coding standards that guide AI development.

---

## Directory Structure

```
.trellis/spec/
├── frontend/                   # Frontend guidelines
│   ├── index.md                # Overview and quick reference
│   ├── component-guidelines.md
│   ├── hook-guidelines.md
│   ├── state-management.md
│   └── ...
│
├── backend/                    # Backend guidelines
│   ├── index.md
│   ├── directory-structure.md
│   ├── error-handling.md
│   ├── api-patterns.md
│   └── ...
│
└── guides/                     # Thinking guides
    ├── index.md
    ├── cross-layer-thinking-guide.md
    ├── code-reuse-thinking-guide.md
    └── cross-platform-thinking-guide.md
```

---

## Spec Categories

### Frontend (`frontend/`)

UI and client-side patterns:
- Component structure
- React hooks usage
- State management
- Styling conventions
- Accessibility

### Backend (`backend/`)

Server-side patterns:
- Directory structure
- API design
- Error handling
- Database access
- Security

### Guides (`guides/`)

Cross-cutting thinking guides:
- How to think about cross-layer changes
- Code reuse strategies
- Platform considerations

---

## Index Files

Each category has an `index.md` that:
1. Provides category overview
2. Lists all specs in the category
3. Gives quick reference for common patterns

### Example: `frontend/index.md`

```markdown
# Frontend Specifications

## Quick Reference

| Topic | Guideline |
|-------|-----------|
| Components | Functional components only |
| State | Use React Query for server state |
| Styling | Tailwind CSS |

## Specifications

1. [Component Guidelines](./component-guidelines.md)
2. [Hook Guidelines](./hook-guidelines.md)
3. [State Management](./state-management.md)
```

---

## Spec File Format

```markdown
# [Spec Title]

## Overview
Brief description of what this spec covers.

## Guidelines

### 1. [Guideline Name]
Detailed explanation...

**Do:**
```typescript
// Good example
```

**Don't:**
```typescript
// Bad example
```

### 2. [Another Guideline]
...

## Related Specs
- [Related Spec 1](./related-spec.md)
```

---

## Using Specs

### In JSONL Context Files

Reference specs in task context:

```jsonl
{"file": ".trellis/spec/frontend/index.md", "reason": "Frontend overview"}
{"file": ".trellis/spec/frontend/component-guidelines.md", "reason": "Component patterns"}
```

### Manual Reading (Cursor)

Read specs at session start:
```
1. Read .trellis/spec/{category}/index.md
2. Read specific guidelines as needed
3. Follow patterns in your code
```

---

## Creating New Specs

### 1. Choose Category

- Frontend UI patterns → `frontend/`
- Backend/API patterns → `backend/`
- Cross-cutting guides → `guides/`

### 2. Create Spec File

```bash
touch .trellis/spec/frontend/new-pattern.md
```

### 3. Follow Format

Use the spec file format above.

### 4. Update Index

Add to category's `index.md`:

```markdown
## Specifications
...
N. [New Pattern](./new-pattern.md)
```

### 5. Reference in JSONL

Add to relevant task context files.

---

## Adding New Categories

### 1. Create Directory

```bash
mkdir .trellis/spec/mobile
```

### 2. Create Index

```bash
touch .trellis/spec/mobile/index.md
```

### 3. Add Category Specs

Create individual spec files.

### 4. Update Task Templates

Ensure new category is available in JSONL templates.

---

## Best Practices

1. **Keep specs focused** - One topic per file
2. **Use examples** - Show do/don't patterns
3. **Link related specs** - Cross-reference
4. **Update regularly** - Specs evolve with codebase
5. **Index everything** - Keep index files current
