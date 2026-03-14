---
title: Framework Known Pitfalls
module: framework
layer: pitfalls
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Framework Known Pitfalls

> Document issues encountered during Framework development. Framework changes have high blast radius — capture learnings immediately.

---

## Pitfall Template

```
### [PITFALL-FWK-NNN] Short Description
- **Symptom**: What you observe
- **Root Cause**: Why it happens
- **Fix**: How to fix it
- **Prevention**: How to avoid it in the future
- **Confidence**: pending | inferred | validated
- **Date**: YYYY-MM-DD
```

---

## Pitfalls

*(No pitfalls recorded yet — add as discovered)*

---

## General Framework Warnings

- Framework changes require a full device flash to take effect (no incremental push)
- `system_server` crash causes device reboot — test changes carefully
- Binder interface changes are not backwards-compatible — never remove methods

---

## Related Files

- `debug_playbook.md` — how to investigate issues
- `../../codebase/BUILD_TARGET_MAP.md` — build commands
