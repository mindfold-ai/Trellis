---
title: Framework Overview
module: framework
layer: overview
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Framework Overview

> High-level architecture of the Android Framework layer relevant to this project.

---

## Purpose

The Android Framework provides the foundation services that SystemUI and Launcher depend on: window management, activity management, package management, and system-level binder services.

---

## Key Services (In Scope)

| Service | Class (pending) | Responsibility |
|---------|----------------|---------------|
| ActivityManagerService | (pending) | Activity/task lifecycle |
| WindowManagerService | (pending) | Window hierarchy, focus |
| PackageManagerService | (pending) | App install/remove events |
| InputManagerService | (pending) | Touch/key event routing |

---

## Process Model

- Runs as `system_server` process
- All services run in the same process (SystemServer)
- Communication with apps via Binder IPC

---

## Our Customization Approach

**Low intrusion required.** Framework changes have the highest risk and merge cost. Prefer:
1. Adding listener/hook interfaces in Framework for SystemUI/Launcher to consume
2. Overlaying resources
3. Last resort: patching Framework source with `[AOSP-CUSTOM]` tags

---

## Related Files

- `entrypoints.md` — key service entry points
- `state_owners.md` — service state ownership
- `services_map.md` — full service inventory and binder interfaces
- `debug_playbook.md` — how to debug Framework issues
- `known_pitfalls.md` — common mistakes
