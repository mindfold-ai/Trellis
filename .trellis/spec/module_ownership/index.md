# Module Ownership Spec — Attribution Decision Tree

> Guidelines for determining which team/individual owns a module and how attribution is recorded.

---

## Overview

In a large AOSP repo with multiple contributors, clear module ownership prevents ambiguous attribution and merge conflicts. Every change must map to an owner.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Ownership Rules](./ownership-rules.md) | Decision tree, scope definitions, attribution format | Pending |

---

## Pre-Development Checklist

Before writing code:

- Identify the owner of the module you are changing → [ownership-rules.md](./ownership-rules.md)
- If the module has no owner yet, follow the ownership registration procedure in `ownership-rules.md`
- Ensure attribution tag format matches the project standard

---

## Quality Check

After writing code:

1. Every modified file has correct `[AOSP-CUSTOM]` attribution tag
2. Owner field in attribution tag matches `ownership-rules.md` registry
3. No change is made to a module owned by another team without explicit sign-off

---

**Language**: All documentation should be written in **English**.
