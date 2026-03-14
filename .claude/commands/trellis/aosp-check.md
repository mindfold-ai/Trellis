# AOSP Check - Quality Gates

Run AOSP-specific quality gates on changed files. Use before `/trellis:finish-work` or as the check phase in the task pipeline.

---

## Steps

Execute these steps:

### Step 1: Identify Changed Files

```bash
git diff --name-only HEAD
```

### Step 2: Attribution Gate

For each changed file that is an AOSP base file (not in a project-owned directory):

```bash
git diff --unified=0 HEAD -- <file>
```

Check: Does every modified section have an `[AOSP-CUSTOM]` attribution tag?

```java
// [AOSP-CUSTOM] <module>/<owner>: <reason>
// Added: YYYY-MM-DD
```

- [ ] All AOSP base file edits have `[AOSP-CUSTOM]` tag?
- [ ] Tag format is correct (module/owner/reason/date)?
- [ ] Owner appears in `docs/memory/codebase/MODULE_OWNERSHIP.md`?

**If missing**: Add the attribution tag to each untagged modification before proceeding.

### Step 3: Boundary Gate

Read `.trellis/spec/architecture/boundaries.md` (if `confidence` is not `pending`).

Check the changed files for forbidden patterns:
- Framework code importing SystemUI or Launcher classes
- Launcher code directly importing Framework internal classes (should use binder APIs)
- Any `import` statement that crosses the allowed dependency direction

```bash
# Example check — adapt to actual package names once CODEBASE_MAP is filled
git diff HEAD | grep "^+.*import" | grep -v "^+++"
```

- [ ] No upward layer dependency introduced?
- [ ] Cross-module communication uses binder/AIDL/broadcast (not direct import)?

### Step 4: Low-Intrusion Gate

For each changed AOSP base file, verify the change follows the lowest-intrusion pattern:

```
[1] Resource overlay (no base file change)
[2] Existing hook/listener registration
[3] Subclass extension
[4] Minimal base-file edit with [AOSP-CUSTOM] tag  ← last resort
```

- [ ] Is there an existing extension point that could have been used instead?
- [ ] If base file was edited, is the change truly minimal?

### Step 5: Ownership Gate

For each module touched by the changes:

```bash
cat docs/memory/codebase/MODULE_OWNERSHIP.md
cat .trellis/spec/module_ownership/ownership-rules.md
```

- [ ] Module appears in the ownership registry?
- [ ] If new module: has a registration task been created?

### Step 6: Memory Sync Flag

Scan the changed code for new knowledge that should update memory docs:

- New entry point discovered → flag `docs/memory/<module>/entrypoints.md`
- Bug root cause understood → flag `docs/memory/<module>/known_pitfalls.md`
- State owner confirmed → flag `docs/memory/<module>/state_owners.md`
- Build target validated → flag `docs/memory/codebase/BUILD_TARGET_MAP.md`

Report any flagged files with a note: "Consider upgrading `confidence` and adding content."

---

## Output Format

```
AOSP Check Results
==================
Attribution: PASS | FAIL (<N> untagged edits)
Boundaries:  PASS | FAIL (<detail>)
Low-Intrusion: PASS | NEEDS REVIEW (<detail>)
Ownership:   PASS | FAIL (<unregistered modules>)
Memory Sync: <N> files flagged for update

Overall: PASS | FAIL
```

If any gate FAILS, fix the issue before running `/trellis:finish-work`.

---

## Integration with Task Pipeline

This command is automatically included in `check.jsonl` and `debug.jsonl` by `task.py init-context`. The Check Agent will run these gates as part of the quality check phase.
