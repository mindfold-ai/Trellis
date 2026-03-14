---
title: Launcher Debug Playbook
module: launcher
layer: debug
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Launcher Debug Playbook

> Step-by-step procedures for common Launcher debugging scenarios.

---

## Quick Start

```bash
# Force-stop and restart Launcher
adb shell am force-stop com.android.launcher3
adb shell am start -n com.android.launcher3/.Launcher

# Tail Launcher logs
adb logcat -s Launcher3:D

# Dump Launcher activity state
adb shell dumpsys activity com.android.launcher3
```

---

## Playbook: Home Screen Not Loading

1. Check log tag: `(pending)`
2. Check activity stack: `adb shell dumpsys activity activities`
3. (pending: add steps)

---

## Playbook: App Icon Missing After Install

1. (pending)

---

## Playbook: Widget Not Rendering

1. (pending)

---

## Build and Push for Debugging

```bash
# Build Launcher3
m Launcher3 -j8

# Install on device
adb install -r out/target/product/<device>/system/priv-app/Launcher3/Launcher3.apk
```

---

## Related Files

- `known_pitfalls.md` — known issues and fixes
- `../../codebase/DEBUG_ENTRYPOINTS.md` — global debug commands
