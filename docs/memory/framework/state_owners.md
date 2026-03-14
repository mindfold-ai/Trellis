---
title: Framework State Owners
module: framework
layer: state
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Framework State Owners

> Which service owns which system state. Critical for understanding cross-module data flows.

---

## State Registry

| State | Owner Service | Access Pattern | Notes |
|-------|--------------|----------------|-------|
| Activity task stack | ActivityManagerService | Binder IPC | |
| Window focus | WindowManagerService | Binder IPC | |
| Installed packages | PackageManagerService | Binder IPC | |
| Screen on/off | PowerManagerService | (pending) | |
| (pending) | (pending) | (pending) | |

---

## State Change Notifications

| Event | Source Service | Listener Interface | Consumers |
|-------|--------------|-------------------|-----------|
| App install/remove | PackageManagerService | (pending) | Launcher, SystemUI |
| Activity focus change | ActivityManagerService | (pending) | SystemUI |
| (pending) | (pending) | (pending) | (pending) |

---

## Related Files

- `entrypoints.md` — where to register listeners
- `services_map.md` — full service and interface list
- `../cross_layer/` — cross-module state flows
