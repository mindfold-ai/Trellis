---
title: SystemUI Debug Playbook
module: systemui
layer: debug
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# SystemUI Debug Playbook

> Step-by-step procedures for common SystemUI debugging scenarios.

---

## Quick Start

```bash
# Restart SystemUI (no reboot needed)
adb shell am restart com.android.systemui

# Tail SystemUI logs
adb logcat -s SystemUI:D

# Dump current state
adb shell dumpsys statusbar
```

---

## Playbook: Status Bar Not Updating

1. Check log tag: `(pending)`
2. Dump state: `adb shell dumpsys statusbar`
3. Verify state owner: see `state_owners.md`
4. (pending: add steps)

---

## Playbook: Notification Not Showing

1. (pending)

---

## Playbook: Quick Settings Tile Broken

1. (pending)

---

## Build and Push for Debugging

```bash
# Build SystemUI
m SystemUI -j8

# Push to device (userdebug build required)
adb push out/target/product/<device>/system/priv-app/SystemUI/SystemUI.apk /system/priv-app/SystemUI/
adb shell am restart com.android.systemui
```

---

## Related Files

- `known_pitfalls.md` — known issues and fixes
- `../../codebase/DEBUG_ENTRYPOINTS.md` — global debug commands
