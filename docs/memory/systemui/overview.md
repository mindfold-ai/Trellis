---
title: SystemUI Overview
module: systemui
layer: overview
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# SystemUI Overview

> High-level architecture of the SystemUI module. Fill in from actual codebase analysis.

---

## Purpose

SystemUI manages the visual chrome of Android: status bar, notification shade, quick settings, lock screen, and volume controls. It runs as a persistent system process.

---

## Key Components

| Component | Class (pending) | Responsibility |
|-----------|----------------|---------------|
| Status Bar | (pending) | Top status bar, clock, icons |
| Notification Shade | (pending) | Pull-down notification panel |
| Quick Settings | (pending) | Tiles for toggling settings |
| Lock Screen | (pending) | Lock screen UI |
| Volume Dialog | (pending) | Volume control overlay |

---

## Process Model

- Runs as `system` UID in the `com.android.systemui` process
- Started by `SystemServer` at boot
- Cannot crash — watched by `SystemServer` for restart

---

## Extension Points Available

- (pending: list overlay resources, hooks, listener interfaces)

---

## Our Customizations

- (pending: list what this project changes in SystemUI)

---

## Related Files

- `entrypoints.md` — where to find key class and method entry points
- `state_owners.md` — who owns what state
- `debug_playbook.md` — how to debug SystemUI issues
- `known_pitfalls.md` — common mistakes and gotchas
