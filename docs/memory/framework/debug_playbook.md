---
title: Framework Debug Playbook
module: framework
layer: debug
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Framework Debug Playbook

> Procedures for debugging Framework-level issues (SystemServer, AMS, WMS).

---

## Quick Start

```bash
# Dump ActivityManager state
adb shell dumpsys activity

# Dump WindowManager state
adb shell dumpsys window

# Dump all system services
adb shell dumpsys

# Framework crash logs
adb logcat -s AndroidRuntime:E system_server:E
```

---

## Playbook: SystemServer Crash

1. Check `adb logcat -s AndroidRuntime:E` for exception
2. Look for `Fatal exception in system` tag
3. (pending: add recovery steps)

---

## Playbook: Binder Transaction Failure

1. Check for `DeadObjectException` in logs
2. Verify service is running: `adb shell service list | grep <service>`
3. (pending: add steps)

---

## Playbook: Activity Not Starting

1. `adb shell dumpsys activity activities | grep <package>`
2. Check for permission denial in logs
3. (pending: add steps)

---

## Build and Test

```bash
# Build framework
m framework -j8

# Build system server
m services -j8

# Full device flash required for framework changes
# (pending: add flash procedure)
```

---

## Related Files

- `known_pitfalls.md` — known issues
- `../../codebase/DEBUG_ENTRYPOINTS.md` — global debug commands
