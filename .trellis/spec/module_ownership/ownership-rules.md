---
title: Ownership Rules
module: module_ownership
layer: rules
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Ownership Rules

> Decision tree and registry for module ownership in the AOSP adaptation project.

---

## Ownership Decision Tree

```
Is the file under a module we own (see registry below)?
  YES → Proceed. Add attribution tag.
  NO  → Is it a shared/framework file?
          YES → Consult the framework owner before changing.
                Create a minimal hook; avoid owning framework internals.
          NO  → Out of scope. Do not modify.
```

---

## Module Registry

| Module | Source Path | Owner | Contact |
|--------|------------|-------|---------|
| SystemUI | (pending) | (pending) | (pending) |
| Launcher | (pending) | (pending) | (pending) |
| Framework hooks | (pending) | (pending) | (pending) |

---

## Ownership Registration Procedure

When a new sub-module is first modified:

1. Add a row to the Module Registry table above
2. Set `confidence: inferred` until the owner acknowledges
3. Create a task to confirm ownership with the human team lead
4. Update to `confidence: validated` after confirmation

---

## Attribution Tag Format

```java
// [AOSP-CUSTOM] <module>/<owner>: <one-line reason>
// Added: YYYY-MM-DD
```

Example:
```java
// [AOSP-CUSTOM] SystemUI/team-systemui: Add ambient display hook for custom sensor
// Added: 2026-03-14
```

---

## Related Memory

- `docs/memory/codebase/MODULE_OWNERSHIP.md` — runtime-populated ownership map
