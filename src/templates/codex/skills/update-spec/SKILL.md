---
name: update-spec
description: "Update Spec - Capture Knowledge into Specifications"
---

# Update Spec - Capture Knowledge into Specifications

When you learn something valuable (from debugging, implementing, or discussion), use this skill to update the relevant spec documents.

**Timing**: After completing a task, fixing a bug, or discovering a new pattern

---

## When to Update Specs

| Trigger | Example | Target Spec |
|---------|---------|-------------|
| **Implemented a feature** | Added template download with giget | Relevant `backend/` or `frontend/` file |
| **Made a design decision** | Used type field + mapping table for extensibility | Relevant spec + "Design Decisions" section |
| **Fixed a bug** | Found a subtle issue with error handling | `backend/error-handling.md` |
| **Discovered a pattern** | Found a better way to structure code | Relevant `backend/` or `frontend/` file |
| **Hit a gotcha** | Learned that X must be done before Y | Relevant spec + "Common Mistakes" section |
| **Established a convention** | Team agreed on naming pattern | `quality-guidelines.md` |
| **New thinking trigger** | "Don't forget to check X before doing Y" | `guides/*.md` (as a checklist item, not detailed rules) |

**Key Insight**: Spec updates are NOT just for problems. Every feature implementation contains design decisions and project conventions that future AI/developers need to know.

---

## Spec Structure Overview

```
.trellis/spec/
├── backend/           # Backend coding standards
│   ├── index.md       # Overview and links
│   └── *.md           # Topic-specific guidelines
├── frontend/          # Frontend coding standards
│   ├── index.md       # Overview and links
│   └── *.md           # Topic-specific guidelines
└── guides/            # Thinking checklists (NOT coding specs!)
    ├── index.md       # Guide index
    └── *.md           # Topic-specific guides
```

### CRITICAL: Spec vs Guide - Know the Difference

| Type | Location | Purpose | Content Style |
|------|----------|---------|---------------|
| **Spec** | `backend/*.md`, `frontend/*.md` | Tell AI "how to write code" | Detailed rules, code examples, forbidden patterns |
| **Guide** | `guides/*.md` | Help AI "what to think about" | Checklists, questions, pointers to specs |

**Decision Rule**: Ask yourself:

- "This is **how to write** the code" → Put in `backend/` or `frontend/`
- "This is **what to consider** before writing" → Put in `guides/`

**Example**:

| Learning | Wrong Location | Correct Location |
|----------|----------------|------------------|
| "Use `reconfigure()` not `TextIOWrapper` for Windows stdout" | ❌ `guides/cross-platform-thinking-guide.md` | ✅ `backend/script-conventions.md` |
| "Remember to check encoding when writing cross-platform code" | ❌ `backend/script-conventions.md` | ✅ `guides/cross-platform-thinking-guide.md` |

**Guides should be short checklists that point to specs**, not duplicate the detailed rules.

---

## Update Process

### Step 1: Identify What You Learned

Answer these questions:

1. **What did you learn?** (Be specific)
2. **Why is it important?** (What problem does it prevent?)
3. **Where does it belong?** (Which spec file?)

### Step 2: Classify the Update Type

| Type | Description | Action |
|------|-------------|--------|
| **Design Decision** | Why we chose approach X over Y | Add to "Design Decisions" section |
| **Project Convention** | How we do X in this project | Add to relevant section with examples |
| **New Pattern** | A reusable approach discovered | Add to "Patterns" section |
| **Forbidden Pattern** | Something that causes problems | Add to "Anti-patterns" or "Don't" section |
| **Common Mistake** | Easy-to-make error | Add to "Common Mistakes" section |
| **Convention** | Agreed-upon standard | Add to relevant section |
| **Gotcha** | Non-obvious behavior | Add warning callout |

### Step 3: Read the Target Spec

Before editing, read the current spec to:
- Understand existing structure
- Avoid duplicating content
- Find the right section for your update

```bash
cat .trellis/spec/<category>/<file>.md
```

### Step 4: Make the Update

Follow these principles:

1. **Be Specific**: Include concrete examples, not just abstract rules
2. **Explain Why**: State the problem this prevents
3. **Show Code**: Add code snippets for patterns
4. **Keep it Short**: One concept per section

### Step 5: Update the Index (if needed)

If you added a new section or the spec status changed, update the category's `index.md`.

---

## Update Templates

### Adding a Design Decision

```markdown
### Design Decision: [Decision Name]

**Context**: What problem were we solving?

**Options Considered**:
1. Option A - brief description
2. Option B - brief description

**Decision**: We chose Option X because...

**Example**:
\`\`\`typescript
// How it's implemented
code example
\`\`\`

**Extensibility**: How to extend this in the future...
```

### Adding a Project Convention

```markdown
### Convention: [Convention Name]

**What**: Brief description of the convention.

**Why**: Why we do it this way in this project.

**Example**:
\`\`\`typescript
// How to follow this convention
code example
\`\`\`

**Related**: Links to related conventions or specs.
```

### Adding a New Pattern

```markdown
### Pattern Name

**Problem**: What problem does this solve?

**Solution**: Brief description of the approach.

**Example**:
\`\`\`
// Good
code example

// Bad
code example
\`\`\`

**Why**: Explanation of why this works better.
```

### Adding a Forbidden Pattern

```markdown
### Don't: Pattern Name

**Problem**:
\`\`\`
// Don't do this
bad code example
\`\`\`

**Why it's bad**: Explanation of the issue.

**Instead**:
\`\`\`
// Do this instead
good code example
\`\`\`
```

### Adding a Common Mistake

```markdown
### Common Mistake: Description

**Symptom**: What goes wrong

**Cause**: Why this happens

**Fix**: How to correct it

**Prevention**: How to avoid it in the future
```

### Adding a Gotcha

```markdown
> **Warning**: Brief description of the non-obvious behavior.
>
> Details about when this happens and how to handle it.
```

---

## Interactive Mode

If you're unsure what to update, answer these prompts:

1. **What did you just finish?**
   - [ ] Fixed a bug
   - [ ] Implemented a feature
   - [ ] Refactored code
   - [ ] Had a discussion about approach

2. **What did you learn or decide?**
   - Design decision (why X over Y)
   - Project convention (how we do X)
   - Non-obvious behavior (gotcha)
   - Better approach (pattern)

3. **Would future AI/developers need to know this?**
   - To understand how the code works → Yes, update spec
   - To maintain or extend the feature → Yes, update spec
   - To avoid repeating mistakes → Yes, update spec
   - Purely one-off implementation detail → Maybe skip

4. **Which area does it relate to?**
   - [ ] Backend code
   - [ ] Frontend code
   - [ ] Cross-layer data flow
   - [ ] Code organization/reuse
   - [ ] Quality/testing

---

## Quality Checklist

Before finishing your spec update:

- [ ] Is the content specific and actionable?
- [ ] Did you include a code example?
- [ ] Did you explain WHY, not just WHAT?
- [ ] Is it in the right spec file?
- [ ] Does it duplicate existing content?
- [ ] Would a new team member understand it?

---

## Relationship to Other Commands

```
Development Flow:
  Learn something → $update-spec → Knowledge captured
       ↑                                  ↓
  $break-loop ←──────────────────── Future sessions benefit
  (deep bug analysis)
```

- `$break-loop` - Analyzes bugs deeply, often reveals spec updates needed
- `$update-spec` - Actually makes the updates (this skill)
- `$finish-work` - Reminds you to check if specs need updates

---

## Core Philosophy

> **Specs are living documents. Every debugging session, every "aha moment" is an opportunity to make the spec better.**

The goal is **institutional memory**:
- What one person learns, everyone benefits from
- What AI learns in one session, persists to future sessions
- Mistakes become documented guardrails
