# Update Spec - Capture Knowledge into Specifications

When you learn something valuable (from debugging, implementing, or discussion), use this command to update the relevant spec documents.

**Timing**: After completing a task, fixing a bug, or discovering a new pattern

---

## When to Update Specs

| Trigger | Example | Target Spec |
|---------|---------|-------------|
| **Fixed a bug** | Found a subtle issue with error handling | `backend/error-handling.md` |
| **Discovered a pattern** | Found a better way to structure code | Relevant guidelines file |
| **Hit a gotcha** | Learned that X must be done before Y | Relevant spec + "Common Mistakes" section |
| **Established a convention** | Team agreed on naming pattern | `quality-guidelines.md` |
| **Cross-layer insight** | Understood how data flows between layers | `guides/cross-layer-thinking-guide.md` |

---

## Spec Structure Overview

```
.trellis/spec/
├── backend/           # Backend development standards
│   ├── index.md       # Overview and links
│   └── *.md           # Topic-specific guidelines
├── frontend/          # Frontend development standards
│   ├── index.md       # Overview and links
│   └── *.md           # Topic-specific guidelines
└── guides/            # Thinking guides
    ├── index.md       # Guide index
    └── *.md           # Topic-specific guides
```

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

2. **What surprised you or was non-obvious?**
   - (Describe the insight)

3. **Would this help someone else avoid the same problem?**
   - Yes → Proceed to update spec
   - No → Maybe not worth documenting

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
  Learn something → /trellis-update-spec → Knowledge captured
       ↑                                  ↓
  /trellis-break-loop ←──────────────────── Future sessions benefit
  (deep bug analysis)
```

- `/trellis-break-loop` - Analyzes bugs deeply, often reveals spec updates needed
- `/trellis-update-spec` - Actually makes the updates (this command)
- `/trellis-finish-work` - Reminds you to check if specs need updates

---

## Core Philosophy

> **Specs are living documents. Every debugging session, every "aha moment" is an opportunity to make the spec better.**

The goal is **institutional memory**:
- What one person learns, everyone benefits from
- What AI learns in one session, persists to future sessions
- Mistakes become documented guardrails
