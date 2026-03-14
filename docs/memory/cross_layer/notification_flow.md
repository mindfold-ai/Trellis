---
title: Notification Flow
module: cross_layer
layer: notification
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Notification Flow

> End-to-end trace of a notification from app posting to SystemUI display.

---

## User Entry

App calls `NotificationManager.notify()`.

---

## Trigger Source

| Component | Event | Details |
|-----------|-------|---------|
| App process | `NotificationManager.notify()` | Via binder to NotificationManagerService |

---

## Bridge Layer

| Component | Role | Details |
|-----------|------|---------|
| NotificationManagerService (Framework) | Validates and routes notification | Applies importance, do-not-disturb rules |
| (pending) | Delivers to SystemUI | Via (pending: callback/binder) |

---

## State Owner

| State | Owner | Notes |
|-------|-------|-------|
| Notification list | NotificationManagerService | |
| SystemUI notification state | (pending: NotificationEntryManager) | |
| Ranking | (pending) | Importance, alerting level |

---

## Presentation Layer

| Component | Action | Module |
|-----------|--------|--------|
| Status bar icon | Updates notification count icon | SystemUI |
| Notification shade | Displays notification row | SystemUI |
| Heads-up | Shows floating peek notification | SystemUI |

---

## Risk Points

- Notification not appearing: ranking may have filtered it out
- Heads-up not showing: importance level too low
- (pending: add more as discovered)

---

## Verification Points

- [ ] Notification appears in shade
- [ ] Status bar icon updates
- [ ] Heads-up shows for high-importance notifications
- [ ] Dismissal propagates back to app via `deleteIntent`

---

## Debug Entry Points

```bash
# Dump notification state
adb shell dumpsys notification

# Watch notification events
adb logcat -s NotificationManagerService:D SystemUI:D | grep -i notif
```
