# Update Spec - Capture Knowledge into Specifications

When you learn something valuable (from debugging, implementing, or discussion), use this command to update the relevant spec documents.

**This project**: TypeScript CLI tool (`@mindfoldhq/trellis`)

**Timing**: After completing a task, fixing a bug, or discovering a new pattern

---

## When to Update Specs

| Trigger | Example | Target Spec |
|---------|---------|-------------|
| **Fixed a bug** | Worktree/main repo sync issue | `backend/quality-guidelines.md` |
| **Discovered a pattern** | Platform adapter pattern for multi-IDE | `backend/quality-guidelines.md` |
| **Hit a gotcha** | Claude `--agent` uses name only, not path | `backend/quality-guidelines.md` |
| **Established a convention** | Zod-first schema design | `backend/quality-guidelines.md` |
| **Cross-layer insight** | CLI → Command → Core data flow | `guides/cross-layer-thinking-guide.md` |
| **New module added** | Pipeline module structure | `backend/directory-structure.md` |

---

## Trellis Spec Structure

```
.trellis/spec/
├── backend/                    # Backend/CLI development standards
│   ├── index.md                # Overview and links
│   ├── quality-guidelines.md   # Code quality, patterns, conventions
│   └── directory-structure.md  # Module organization
├── frontend/                   # N/A (pure CLI project)
│   └── (placeholder files)
└── guides/                     # Thinking guides
    ├── index.md                # Guide index
    └── *.md                    # Topic-specific guides
```

**Note**: Trellis is a pure CLI tool. The `frontend/` directory contains placeholder files for template completeness.

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
  Learn something → /trellis:update-spec → Knowledge captured
       ↑                                  ↓
  /trellis:break-loop ←──────────────────── Future sessions benefit
  (deep bug analysis)
```

- `/trellis:break-loop` - Analyzes bugs deeply, often reveals spec updates needed
- `/trellis:update-spec` - Actually makes the updates (this command)
- `/trellis:finish-work` - Reminds you to check if specs need updates

---

## Core Philosophy

> **Specs are living documents. Every debugging session, every "aha moment" is an opportunity to make the spec better.**

The goal is **institutional memory**:
- What one person learns, everyone benefits from
- What AI learns in one session, persists to future sessions
- Mistakes become documented guardrails

---

## Trellis-Specific Knowledge Categories

When updating specs for Trellis, consider these common categories:

| Category | Examples | Target File |
|----------|----------|-------------|
| **Worktree Patterns** | Data sync between main/worktree, branch naming | `quality-guidelines.md` |
| **Pipeline Orchestration** | Agent lifecycle, queue management, status tracking | `quality-guidelines.md` |
| **Platform Adapters** | Claude Code, Cursor, IDE-specific behavior | `quality-guidelines.md` |
| **CLI Conventions** | stdout/stderr usage, JSON output, initialization checks | `quality-guidelines.md` |
| **Module Structure** | New module organization, index.ts exports | `directory-structure.md` |
| **Dogfooding** | Template changes affecting new projects | `quality-guidelines.md` |

### Common Trellis Patterns to Document

1. **Worktree Data Synchronization**
   - Always update task.json in BOTH locations
   - Read from worktree for agent context

2. **Zod-First Schema Design**
   - Define schema first, derive types via `z.infer`
   - Use `nullable()` for optional file reads

3. **Claude Code Integration**
   - `--agent` flag uses name only (not path)
   - Per-developer agent registry pattern
   - Background process management

4. **Command Output Conventions**
   - Data → stdout (for piping)
   - Messages → stderr (for user)
