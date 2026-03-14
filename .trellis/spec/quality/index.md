# Quality Spec — Build, Test, Review & Merge Gates

> Guidelines for quality gates that every change must pass before merging.

---

## Overview

Quality gates are checkpoints that prevent regressions and maintain codebase health. Gates are enforced at different phases (build, test, review, merge).

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Quality Gates](./quality-gates.md) | Per-phase gate criteria and enforcement | Pending |

---

## Pre-Development Checklist

Before starting implementation:

- Know which quality gates apply to your change type → [quality-gates.md](./quality-gates.md)
- Understand the test strategy for your module → `docs/memory/<module>/debug_playbook.md`
- Check if the change requires a new test → `quality-gates.md` section "Test Coverage Gates"

---

## Quality Check

After writing code:

1. Build gate: does the module compile cleanly? (no errors, no new warnings)
2. Test gate: do existing tests pass? Is new test coverage added?
3. Review gate: is the change self-reviewed against `architecture/low-intrusion-principles.md`?
4. Merge gate: is the commit message attribution-tagged?

---

**Language**: All documentation should be written in **English**.
