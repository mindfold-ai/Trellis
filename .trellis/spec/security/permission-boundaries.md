---
title: Permission Boundaries
module: security
layer: permissions
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Permission Boundaries

> AOSP permission model and audit checklist for security-sensitive changes.

---

## AOSP Permission Model Overview

```
Manifest Permissions  ←  declared in AndroidManifest.xml
     ↓
Runtime Permissions   ←  granted/denied at runtime (dangerous permissions)
     ↓
SELinux Policies      ←  mandatory access control at kernel level
     ↓
Binder UID Checks     ←  service-level caller identity verification
```

---

## Dangerous Operations

| Operation | Risk | Required Check |
|-----------|------|----------------|
| (pending) | (pending) | (pending) |

---

## SELinux Rules

- Prefer `neverallow` assertions over permissive domains
- New type transitions require security team review
- (pending: fill in project-specific SELinux context names)

---

## Binder Security Checklist

- [ ] `Binder.getCallingUid()` checked before privileged operations
- [ ] `enforceCallingOrSelfPermission()` used for permission-gated APIs
- [ ] No `clearCallingIdentity()` in security-sensitive paths without restore

---

## Audit Checklist

Before any commit touching permissions:

- [ ] New permission is documented with justification
- [ ] SELinux diff reviewed
- [ ] No permission escalation path introduced
- [ ] Test covers the permission denial case

---

## Related Specs

- `../architecture/boundaries.md` — layer boundaries that affect permission scope
- `../quality/quality-gates.md` — review gate includes security check
