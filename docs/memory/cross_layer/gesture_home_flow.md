---
title: Gesture Home Flow
module: cross_layer
layer: gesture
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Gesture Home Flow

> End-to-end trace of the "swipe up to go home" gesture across Framework, SystemUI, and Launcher.

---

## User Entry

User swipes up from the bottom of the screen.

---

## Trigger Source

| Component | Event | Details |
|-----------|-------|---------|
| InputManagerService (Framework) | Touch event | Detected as gesture by (pending) |

---

## Bridge Layer

| Component | Role | Details |
|-----------|------|---------|
| (pending) | Gesture detector | Recognizes swipe-up pattern |
| (pending) | Routes event to SystemUI | Via (pending: binder/callback) |

---

## State Owner

| State | Owner | Notes |
|-------|-------|-------|
| Gesture in progress | (pending) | |
| Home animation state | (pending) | |

---

## Presentation Layer

| Component | Action | Module |
|-----------|--------|--------|
| (pending) | Plays home transition animation | SystemUI |
| Launcher | Receives focus, shows home screen | Launcher |

---

## Risk Points

- Race condition between gesture recognition and app touch handling: (pending)
- Animation jank if SystemUI and Launcher are not synchronized: (pending)

---

## Verification Points

- [ ] Gesture triggers correctly after boot
- [ ] Transition animation plays smoothly
- [ ] Launcher receives focus correctly
- [ ] Back-to-app animation works (reverse flow)

---

## Debug Entry Points

```bash
# Watch gesture events
adb logcat -s InputManager:D

# Watch SystemUI home animation
adb logcat -s SystemUI:D | grep -i gesture

# Watch Launcher focus
adb logcat -s Launcher3:D | grep -i focus
```
