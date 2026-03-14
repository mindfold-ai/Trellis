---
title: Recents Flow
module: cross_layer
layer: recents
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Recents Flow

> End-to-end trace of the "recent apps" (Overview) interaction across Framework, SystemUI, and Launcher.

---

## User Entry

User swipes up and holds, or presses the recents button.

---

## Trigger Source

| Component | Event | Details |
|-----------|-------|---------|
| InputManagerService (Framework) | Gesture / key event | Detected as recents trigger by (pending) |

---

## Bridge Layer

| Component | Role | Details |
|-----------|------|---------|
| (pending) | Routes recents intent | Via (pending) |
| ActivityManagerService | Provides task snapshot | Via (pending binder call) |

---

## State Owner

| State | Owner | Notes |
|-------|-------|-------|
| Recent task list | ActivityManagerService (Framework) | |
| Task thumbnails | (pending) | |
| Recents UI state | (pending: SystemUI or Launcher) | Depends on AOSP version |

---

## Presentation Layer

| Component | Action | Module |
|-----------|--------|--------|
| (pending) | Renders task cards | SystemUI or Launcher |
| Launcher | (pending) | Launcher |

---

## Risk Points

- Task thumbnail staleness: (pending)
- Memory pressure causing task eviction during animation: (pending)

---

## Verification Points

- [ ] Recent tasks list populates correctly
- [ ] Task thumbnails are current
- [ ] Swipe-to-dismiss removes task from list and from AMS
- [ ] Tapping a task resumes it correctly

---

## Debug Entry Points

```bash
# Dump task stack
adb shell dumpsys activity activities

# Watch recents events
adb logcat -s ActivityManager:D | grep -i recent
```
