# Break the Loop - Deep Bug Analysis

When debug is complete, use this command for deep analysis to break the "fix bug -> forget -> repeat" cycle.

**This project**: TypeScript CLI tool (`@mindfoldhq/trellis`)

---

## Analysis Framework

Analyze the bug you just fixed from these 5 dimensions:

### 1. Root Cause Category

Which category does this bug belong to?

| Category | Characteristics | Example |
|----------|-----------------|---------|
| **A. Missing Spec** | No documentation on how to do it | New feature without checklist |
| **B. Cross-Layer Contract** | Interface between layers unclear | API returns different format than expected |
| **C. Change Propagation Failure** | Changed one place, missed others | Changed function signature, missed call sites |
| **D. Test Coverage Gap** | Unit test passes, integration fails | Works alone, breaks when combined |
| **E. Implicit Assumption** | Code relies on undocumented assumption | Timestamp seconds vs milliseconds |

### 2. Why Fixes Failed (if applicable)

If you tried multiple fixes before succeeding, analyze each failure:

- **Surface Fix**: Fixed symptom, not root cause
- **Incomplete Scope**: Found root cause, didn't cover all cases
- **Tool Limitation**: grep missed it, type check wasn't strict
- **Mental Model**: Kept looking in same layer, didn't think cross-layer

### 3. Prevention Mechanisms

What mechanisms would prevent this from happening again?

| Type | Description | Example |
|------|-------------|---------|
| **Documentation** | Write it down so people know | Update thinking guide |
| **Architecture** | Make the error impossible structurally | Type-safe wrappers |
| **Compile-time** | TypeScript strict, no any | Signature change causes compile error |
| **Runtime** | Monitoring, alerts, scans | Detect orphan entities |
| **Test Coverage** | E2E tests, integration tests | Verify full flow |
| **Code Review** | Checklist, PR template | "Did you check X?" |

### 4. Systematic Expansion

What broader problems does this bug reveal?

- **Similar Issues**: Where else might this problem exist?
- **Design Flaw**: Is there a fundamental architecture issue?
- **Process Flaw**: Is there a development process improvement?
- **Knowledge Gap**: Is the team missing some understanding?

### 5. Knowledge Capture

Solidify insights into the system:

- [ ] Update `.trellis/spec/guides/` thinking guides
- [ ] Update `.trellis/spec/backend/` or `frontend/` docs
- [ ] Create issue record (if applicable)
- [ ] Create feature ticket for root fix
- [ ] Update check commands if needed

---

## Output Format

Please output analysis in this format:

```markdown
## Bug Analysis: [Short Description]

### 1. Root Cause Category
- **Category**: [A/B/C/D/E] - [Category Name]
- **Specific Cause**: [Detailed description]

### 2. Why Fixes Failed (if applicable)
1. [First attempt]: [Why it failed]
2. [Second attempt]: [Why it failed]
...

### 3. Prevention Mechanisms
| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | ... | ... | TODO/DONE |

### 4. Systematic Expansion
- **Similar Issues**: [List places with similar problems]
- **Design Improvement**: [Architecture-level suggestions]
- **Process Improvement**: [Development process suggestions]

### 5. Knowledge Capture
- [ ] [Documents to update / tickets to create]
```

---

## Core Philosophy

> **The value of debugging is not in fixing the bug, but in making this class of bugs never happen again.**

Three levels of insight:
1. **Tactical**: How to fix THIS bug
2. **Strategic**: How to prevent THIS CLASS of bugs
3. **Philosophical**: How to expand thinking patterns

30 minutes of analysis saves 30 hours of future debugging.

---

## Trellis-Specific Examples

### Example 1: Worktree Data Sync Bug

**Bug**: Pipeline status shows stale task data after agent runs

**Analysis**:
- **Category**: B - Cross-Layer Contract
- **Root Cause**: Reading task.json from main repo instead of worktree
- **Prevention**: Added "Worktree Data Sync Pattern" to `quality-guidelines.md`
- **Lesson**: Agent works in worktree, so read data from worktree

### Example 2: Claude Agent Flag

**Bug**: `claude --agent .claude/agents/dispatch.md` fails

**Analysis**:
- **Category**: E - Implicit Assumption
- **Root Cause**: Assumed full path, but Claude Code only needs name
- **Fix**: `claude --agent dispatch`
- **Prevention**: Added to `quality-guidelines.md` → Claude Code Integration

### Common Trellis Bug Categories

| Bug Type | Example | Check |
|----------|---------|-------|
| Worktree sync | Only updated one location | Write to both |
| Module export | New file not visible | Check index.ts |
| Dogfooding | Works here, breaks in new project | Test fresh init |
| Platform | Assumed Claude-specific | Use adapter pattern |
