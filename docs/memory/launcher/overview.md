---
title: Launcher Overview
module: launcher
layer: overview
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Launcher Overview

> High-level architecture of the Launcher3 module. Fill in from actual codebase analysis.

---

## Purpose

Launcher3 is the Android home screen application. It manages the app grid, widget placement, recent apps (delegated to SystemUI on newer AOSP), and folder organization.

---

## Key Components

| Component | Class (pending) | Responsibility |
|-----------|----------------|---------------|
| Launcher Activity | (pending) | Main home screen activity |
| All Apps Container | (pending) | App drawer UI |
| Widget Host | (pending) | Widget rendering and lifecycle |
| Drag Layer | (pending) | Drag-and-drop handling |
| Model | (pending) | App list data model |

---

## Process Model

- Runs as the default home app (`android.intent.category.HOME`)
- Separate process from SystemUI
- Communicates with SystemUI via broadcast and shared state

---

## Extension Points Available

- (pending: list overlay resources, hooks, listener interfaces)

---

## Our Customizations

- (pending: list what this project changes in Launcher)

---

## Related Files

- `entrypoints.md` — key class and method entry points
- `state_owners.md` — state ownership map
- `debug_playbook.md` — how to debug Launcher issues
- `known_pitfalls.md` — common mistakes and gotchas
