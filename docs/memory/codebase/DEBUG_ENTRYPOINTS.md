---
title: Debug Entrypoints
module: codebase
layer: debug
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Debug Entrypoints

> Log tags, dumpsys commands, adb shortcuts, and debug flags for each module.

---

## Log Tags

| Module | Log Tag | Example Filter |
|--------|---------|---------------|
| SystemUI | (pending) | `adb logcat -s SystemUI:D` |
| Launcher | (pending) | `adb logcat -s Launcher3:D` |
| Framework / AMS | (pending) | `adb logcat -s ActivityManager:D` |
| Framework / WMS | (pending) | `adb logcat -s WindowManager:D` |

---

## Dumpsys Commands

| Service | Command | What It Shows |
|---------|---------|---------------|
| ActivityManager | `adb shell dumpsys activity` | Task stack, activity states |
| WindowManager | `adb shell dumpsys window` | Window hierarchy, focus state |
| StatusBar | `adb shell dumpsys statusbar` | SystemUI status bar state |
| (pending) | (pending) | (pending) |

---

## Debug Flags

| Flag | Location | Effect |
|------|---------|--------|
| (pending) | (pending) | (pending) |

---

## Useful ADB Commands

```bash
# Restart SystemUI without reboot
adb shell am restart com.android.systemui

# Dump Launcher state
adb shell dumpsys activity com.android.launcher3

# Enable verbose logging for a tag
adb shell setprop log.tag.<TAG> VERBOSE
```

---

## Related Files

- `BUILD_TARGET_MAP.md` — how to build before debugging
- `docs/memory/<module>/debug_playbook.md` — module-specific debug procedures
