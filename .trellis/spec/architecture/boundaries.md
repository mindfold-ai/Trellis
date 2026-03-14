---
title: Layer and Module Boundaries
module: architecture
layer: boundaries
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Layer and Module Boundaries

> Fill in the sections below with validated boundary rules. Keep `confidence: pending` until confirmed against actual AOSP codebase.

---

## Layer Model

```
┌─────────────────────────────┐
│  Applications (Launcher)    │  ← Top layer, uses Framework APIs
├─────────────────────────────┤
│  System UI (SystemUI)       │  ← Sits above Framework, below Launcher
├─────────────────────────────┤
│  Framework Services         │  ← Provides system services, binder APIs
├─────────────────────────────┤
│  HAL / Kernel               │  ← Out of scope for this project
└─────────────────────────────┘
```

**Allowed dependency direction**: Launcher → SystemUI → Framework (downward only)

---

## Module Boundaries

| Module | Source Root | Public API Surface | Notes |
|--------|------------|-------------------|-------|
| SystemUI | (pending) | (pending) | (pending) |
| Launcher | (pending) | (pending) | (pending) |
| Framework | (pending) | (pending) | (pending) |

---

## Forbidden Patterns

- Framework importing SystemUI or Launcher classes
- Direct field access across module boundaries (use binder/AIDL)
- (pending: add more as discovered)

---

## Related Memory

- `docs/memory/codebase/MODULE_OWNERSHIP.md`
- `docs/memory/cross_layer/` — cross-layer flow docs
