---
description: "Trellis Copilot prompt: Cross-Layer Check"
---

# Cross-Layer Check

Check if your changes considered all dimensions. Most bugs come from "didn't think of it", not lack of technical skill.

> **Note**: This is a **post-implementation** safety net. Ideally, read the [Pre-Implementation Checklist](.trellis/spec/guides/pre-implementation-checklist.md) **before** writing code.

---

## Related Documents

| Document | Purpose | Timing |
|----------|---------|--------|
| [Pre-Implementation Checklist](.trellis/spec/guides/pre-implementation-checklist.md) | Questions before coding | **Before** writing code |
| [Code Reuse Thinking Guide](.trellis/spec/guides/code-reuse-thinking-guide.md) | Pattern recognition | During implementation |
| **`/`** (this) | Verification check | **After** implementation |

---

## Execution Steps

### 1. Identify Change Scope

```bash
git status
git diff --name-only
```

### 2. Select Applicable Check Dimensions

Based on your change type, execute relevant checks below:

---

## Dimension A: Cross-Layer Data Flow (Required when 3+ layers)

**Trigger**: Changes involve 3 or more layers

| Layer | Common Locations |
|-------|------------------|
| API/Routes | `routes/`, `api/`, `handlers/`, `controllers/` |
| Service/Business Logic | `services/`, `lib/`, `core/`, `domain/` |
| Database/Storage | `db/`, `models/`, `repositories/`, `schema/` |
| UI/Presentation | `components/`, `views/`, `templates/`, `pages/` |
| Utility | `utils/`, `helpers/`, `common/` |

**Checklist**:
- [ ] Read flow: Database -> Service -> API -> UI
- [ ] Write flow: UI -> API -> Service -> Database
- [ ] Types/schemas correctly passed between layers?
- [ ] Errors properly propagated to caller?
- [ ] Loading/pending states handled at each layer?

**Detailed Guide**: `.trellis/spec/guides/cross-layer-thinking-guide.md`

---

## Dimension B: Code Reuse (Required when modifying constants/config)

**Trigger**:
- Modifying UI constants (label, icon, color)
- Modifying any hardcoded value
- Seeing similar code in multiple places
- Creating a new utility/helper function
- Just finished batch modifications across files

**Checklist**:
- [ ] Search first: How many places define this value?
  ```bash
  # Search in source files (adjust extensions for your project)
  grep -r "value-to-change" src/
  ```
- [ ] If the same value repeats -> does it represent one stable concept whose callers must change together? Extract only then. Two literals that merely happen to match today should stay separate
- [ ] After modification, all usage sites updated?
- [ ] If creating utility: Does similar utility already exist?

**Detailed Guide**: `.trellis/spec/guides/code-reuse-thinking-guide.md`

---

## Dimension B2: New Utility Functions

**Trigger**: About to create a new utility/helper function

**Checklist**:
- [ ] Search for existing similar utilities first
  ```bash
  grep -r "functionNamePattern" src/
  ```
- [ ] If similar exists, can you extend it instead?
- [ ] If creating new, is it in the right location (shared vs domain-specific)?

---

## Dimension B3: After Batch Modifications

**Trigger**: Just modified similar patterns in multiple files

**Checklist**:
- [ ] Did you check ALL files with similar patterns?
  ```bash
  grep -r "patternYouChanged" src/
  ```
- [ ] Any files missed that should also be updated?
- [ ] Do the repeated sites represent one stable concept whose callers must change together? Abstract only then — not to pre-empt duplication that has not happened.

---

## Dimension C: Import/Dependency Paths (Required when creating new files)

**Trigger**: Creating new source files

**Checklist**:
- [ ] Using correct import paths (relative vs absolute)?
- [ ] No circular dependencies?
- [ ] Consistent with project's module organization?

---

## Dimension D: Same-Layer Consistency

**Trigger**:
- Modifying display logic or formatting
- Same domain concept used in multiple places

**Checklist**:
- [ ] Search for other places using same concept
  ```bash
  grep -r "ConceptName" src/
  ```
- [ ] Are these usages consistent?
- [ ] Should they share configuration/constants?

---

## Dimension E: Scope Discipline (Always applicable)

**Trigger**: Every change, before reporting done

**Checklist**:
- [ ] Any tidying of code the task did not require?
- [ ] Any abstraction, config or extension point added for a case that does not exist yet?
- [ ] Any speculative fallback for a state that cannot occur?
- [ ] Any file changed that the acceptance criteria do not mention?
- [ ] Any workaround added at the caller instead of a fix where the behavior actually lives?

---

## Common Issues Quick Reference

| Issue | Root Cause | Prevention |
|-------|------------|------------|
| Changed one place, missed others | Didn't search impact scope | `grep` before changing |
| Data lost at some layer | Didn't check data flow | Trace data source to destination |
| Type/schema mismatch | Cross-layer types inconsistent | Use shared type definitions |
| UI/output inconsistent | Same concept in multiple places | Extract shared constants |
| Similar utility exists | Didn't search first | Search before creating |
| Batch fix incomplete | Didn't verify all occurrences | grep after fixing |

---

## Output

Report:
1. Which dimensions your changes involve
2. Check results for each dimension
3. Issues found and fix suggestions
