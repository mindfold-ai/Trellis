---
title: Codebase Map
module: codebase
layer: map
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Codebase Map

> Top-level directory structure, key entry paths, and module boundaries. Fill in from actual AOSP tree.

---

## Top-Level Directories

| Directory | Purpose | Notes |
|-----------|---------|-------|
| `frameworks/base/` | Android Framework | Core services, binder APIs |
| `packages/apps/SystemUI/` | System UI | Status bar, notifications, quick settings |
| `packages/apps/Launcher3/` | Launcher | Home screen, recents |
| (pending) | (pending) | (pending) |

---

## Key Entry Paths

| Entry Point | Path | Module |
|-------------|------|--------|
| SystemUI main service | (pending) | SystemUI |
| Launcher activity | (pending) | Launcher |
| WindowManagerService | (pending) | Framework |
| ActivityManagerService | (pending) | Framework |

---

## Module Boundaries

See `.trellis/spec/architecture/boundaries.md` for the authoritative boundary rules.

Quick reference:
- SystemUI cannot be imported by Framework
- Launcher communicates with SystemUI via broadcast/AIDL (no direct import)

---

## Related Files

- `MODULE_OWNERSHIP.md` — who owns each module
- `BUILD_TARGET_MAP.md` — how to build each module
- `.trellis/spec/architecture/boundaries.md` — formal boundary rules
