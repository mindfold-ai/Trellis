---
title: Launcher State Owners
module: launcher
layer: state
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Launcher State Owners

> Which class/component owns which piece of state in Launcher.

---

## State Registry

| State | Owner Class | Access Pattern | Notes |
|-------|------------|----------------|-------|
| App list | (pending) | (pending) | |
| Widget list | (pending) | (pending) | |
| Workspace layout | (pending) | (pending) | |
| Current page | (pending) | (pending) | |
| Drag state | (pending) | (pending) | |

---

## State Flow Pattern

```
PackageManager event (app install/remove)
  → (pending: model listener)
  → (pending: model update)
  → (pending: view refresh)
```

---

## Shared State with Other Modules

| State | Shared With | Mechanism |
|-------|------------|-----------|
| Recents (pending) | SystemUI | (pending) |
| (pending) | Framework | (pending) |

---

## Related Files

- `entrypoints.md` — where state is initialized
- `../cross_layer/` — cross-module state flows
