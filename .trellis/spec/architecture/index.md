# Architecture Spec — AOSP Layer & Module Boundaries

> Guidelines for understanding layer boundaries, module isolation, and low-intrusion principles.

---

## Overview

AOSP has a strict layered architecture. Changes that violate layer boundaries cause long-term maintenance burden and merge conflicts. This spec codifies the rules.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Boundaries](./boundaries.md) | Layer/module boundary definitions, allowed dependency directions | Pending |
| [Low-Intrusion Principles](./low-intrusion-principles.md) | Rules for minimizing AOSP base modifications | Pending |

---

## Pre-Development Checklist

Before writing any code that touches AOSP modules:

- Identify the layer your change belongs to → [boundaries.md](./boundaries.md)
- Confirm the change is the least-intrusive option → [low-intrusion-principles.md](./low-intrusion-principles.md)
- Check module ownership → [../module_ownership/ownership-rules.md](../module_ownership/ownership-rules.md)
- Confirm no permission boundary is crossed → [../security/permission-boundaries.md](../security/permission-boundaries.md)

---

## Quality Check

After writing code, verify:

1. No upward dependency introduced (Framework ← SystemUI ← Launcher is forbidden)
2. Change uses overlay/hook/extension point rather than modifying AOSP base file where possible
3. If base file must be changed, attribution tag is present
4. Cross-layer flow affected? → load `docs/memory/cross_layer/` for that flow

---

**Language**: All documentation should be written in **English**.
