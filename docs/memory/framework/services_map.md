---
title: Framework Services Map
module: framework
layer: services
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Framework Services Map

> Inventory of system services and their binder interfaces relevant to this project.

---

## Service Registry

| Service Name | Manager Class | AIDL Interface | Service Token |
|-------------|--------------|----------------|--------------|
| ActivityManager | ActivityManager | IActivityManager | `activity` |
| WindowManager | WindowManager | IWindowManager | `window` |
| PackageManager | PackageManager | IPackageManager | `package` |
| PowerManager | PowerManager | IPowerManager | `power` |
| InputManager | InputManager | IInputManager | `input` |
| (pending) | (pending) | (pending) | (pending) |

---

## Service Dependency Graph

```
SystemServer
  ├── ActivityManagerService  ←→  WindowManagerService
  ├── PackageManagerService
  ├── PowerManagerService
  └── (pending)
```

---

## Binder Interface Notes

| Interface | Version Notes | Breaking Change Risk |
|-----------|--------------|---------------------|
| IActivityManager | (pending) | High — many callers |
| IWindowManager | (pending) | High — many callers |
| (pending) | (pending) | (pending) |

---

## Adding a New Service

1. Define AIDL in `core/java/android/os/I<Name>.aidl`
2. Implement in `services/core/java/com/android/server/<Name>Service.java`
3. Register in `SystemServer.java` startOtherServices()
4. Add `[AOSP-CUSTOM]` attribution tag to all new files
5. Update this file with the new service entry

---

## Related Files

- `entrypoints.md` — how to access services from SystemUI/Launcher
- `state_owners.md` — what state each service owns
