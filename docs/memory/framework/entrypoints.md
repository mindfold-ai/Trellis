---
title: Framework Entry Points
module: framework
layer: entrypoints
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Framework Entry Points

> Key service initialization paths and extension points in the Android Framework.

---

## SystemServer Boot Sequence

| Stage | Class / Method | Notes |
|-------|---------------|-------|
| Start critical services | (pending) | Early boot phase |
| Start core services | (pending) | AMS, WMS, PMS |
| Start other services | (pending) | Later boot phase |

---

## Key Extension Points

| Extension Point | Location | How to Use |
|----------------|---------|------------|
| (pending) | (pending) | (pending) |

---

## Binder Interface Entry Points

| Interface | AIDL File | Service |
|-----------|----------|---------|
| IActivityManager | (pending) | ActivityManagerService |
| IWindowManager | (pending) | WindowManagerService |
| (pending) | (pending) | (pending) |

---

## Hook Points for SystemUI/Launcher

| Hook | Location | Consumer |
|------|---------|---------|
| (pending) | (pending) | SystemUI |
| (pending) | (pending) | Launcher |

---

## Related Files

- `overview.md` — service model
- `services_map.md` — full service and binder inventory
