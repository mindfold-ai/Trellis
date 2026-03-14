---
title: Device State Flow
module: cross_layer
layer: device_state
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Device State Flow

> End-to-end trace of device state changes (screen on/off, fold/unfold, rotation) across Framework, SystemUI, and Launcher.

---

## User Entry

Physical event: power button press, lid fold/unfold, device rotation.

---

## Trigger Source

| Component | Event | Details |
|-----------|-------|---------|
| PowerManagerService (Framework) | Screen on/off | Power button or timeout |
| DeviceStateManagerService (Framework) | Fold/unfold | Hinge sensor |
| SensorManager (Framework) | Rotation | Accelerometer |

---

## Bridge Layer

| Component | Role | Details |
|-----------|------|---------|
| (pending) | Broadcasts screen state change | Via (pending: intent/callback) |
| DisplayManager (Framework) | Routes display configuration change | Via (pending) |

---

## State Owner

| State | Owner | Notes |
|-------|-------|-------|
| Screen on/off | PowerManagerService | |
| Device posture (fold state) | DeviceStateManagerService | |
| Display rotation | DisplayManager | |
| SystemUI visibility | (pending) | |

---

## Presentation Layer

| Component | Action | Module |
|-----------|--------|--------|
| Lock screen | Shows/hides on screen on/off | SystemUI |
| Status bar | Adapts layout for rotation/fold | SystemUI |
| Launcher | Relayouts for rotation/fold | Launcher |

---

## Risk Points

- Layout not adapting on fold: configuration change may not trigger relayout
- Lock screen showing after unlock in some edge cases: (pending)
- (pending: add more as discovered)

---

## Verification Points

- [ ] Screen-off triggers lock screen on wake
- [ ] Fold state change triggers correct layout in SystemUI and Launcher
- [ ] Rotation updates both SystemUI and Launcher layouts
- [ ] No flicker during state transitions

---

## Debug Entry Points

```bash
# Watch power state
adb logcat -s PowerManagerService:D

# Watch device state
adb shell dumpsys device_state

# Watch display changes
adb logcat -s DisplayManager:D
```
