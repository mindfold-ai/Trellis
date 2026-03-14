---
title: SystemUI State Owners
module: systemui
layer: state
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# SystemUI State Owners

> Which class/component owns which piece of state. Critical for understanding data flow.

---

## State Registry

| State | Owner Class | Access Pattern | Notes |
|-------|------------|----------------|-------|
| Battery level | (pending) | (pending) | |
| Network status | (pending) | (pending) | |
| Notification list | (pending) | (pending) | |
| Quick settings tiles | (pending) | (pending) | |
| Lock screen state | (pending) | (pending) | |

---

## State Flow Pattern

```
Hardware/System event
  → (pending: controller/listener)
  → (pending: state holder)
  → (pending: view update)
```

---

## Shared State with Other Modules

| State | Shared With | Mechanism |
|-------|------------|-----------|
| (pending) | Launcher | (pending) |
| (pending) | Framework | (pending) |

---

## Related Files

- `entrypoints.md` — where state is initialized
- `../cross_layer/` — cross-module state flows
