# Security Spec — Permission Model & Audit

> Guidelines for managing AOSP permissions, SELinux policies, and security audit requirements.

---

## Overview

AOSP has a layered permission model (manifest permissions, SELinux, binder UIDs). Changes to security-sensitive code require additional scrutiny.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Permission Boundaries](./permission-boundaries.md) | Permission model, dangerous operations, audit checklist | Pending |

---

## Pre-Development Checklist

Before writing code that touches permissions or system services:

- Identify if the change requires a new permission → [permission-boundaries.md](./permission-boundaries.md)
- Check SELinux policy implications → `permission-boundaries.md` section "SELinux"
- Verify binder interface caller identity is checked → `permission-boundaries.md` section "Binder Security"

---

## Quality Check

After writing code:

1. No new `android.permission.DANGEROUS` permission added without justification
2. SELinux policy change is minimal and reviewed
3. Binder calls verify caller UID/PID before granting access
4. No hardcoded secrets or tokens (see global security rules)

---

**Language**: All documentation should be written in **English**.
