---
title: Low-Intrusion Principles
module: architecture
layer: principles
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Low-Intrusion Principles

> Rules for minimizing the footprint of changes on AOSP base code to ease future merges.

---

## Core Principle

**Prefer extension over modification.** Every line changed in an AOSP base file is a potential merge conflict in the next AOSP upgrade.

---

## Decision Tree

```
Is there an existing extension point (overlay, hook, listener, ContentProvider)?
  YES → Use it. Do not modify the base file.
  NO  → Can we add a minimal hook to the base file?
          YES → Add only the hook call. Keep logic in a separate owned file.
          NO  → Full modification required. Document with attribution tag.
```

---

## Attribution Tag Format

```java
// [AOSP-CUSTOM] <module>/<owner>: <reason>
// Added: <date>
```

---

## Allowed Modification Patterns

1. **Overlay resources** — `res/` overrides via product overlay
2. **Runtime hooks** — callback/listener registration at existing hook points
3. **Subclass extension** — extend and override rather than patch base
4. **AIDL additions** — add new binder interfaces; do not remove existing ones
5. **Minimal base edits** — last resort, always tagged

---

## Related Specs

- `boundaries.md` — which layers can call which
- `../security/permission-boundaries.md` — permission implications of modifications
