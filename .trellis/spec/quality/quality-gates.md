---
title: Quality Gates
module: quality
layer: gates
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Quality Gates

> Criteria that every change must satisfy before it progresses to the next phase.

---

## Gate 1: Build Gate

| Criterion | Tool | Pass Condition |
|-----------|------|----------------|
| Module compiles | `m <module>` | Exit code 0, no errors |
| No new lint warnings | `(pending)` | (pending) |
| Resource overlay valid | `(pending)` | (pending) |

---

## Gate 2: Test Gate

| Criterion | Tool | Pass Condition |
|-----------|------|----------------|
| Existing unit tests pass | `atest <module>Tests` | All green |
| New behavior has test | Code review | Test file present |
| Regression test for bug fix | Code review | Test reproduces original bug |

---

## Gate 3: Review Gate

Self-review checklist before requesting human review:

- [ ] Change follows `architecture/low-intrusion-principles.md`
- [ ] Attribution tag present on all AOSP base file edits
- [ ] No forbidden cross-layer dependency introduced
- [ ] Permission boundary not crossed (see `security/permission-boundaries.md`)

---

## Gate 4: Merge Gate

- [ ] Commit message follows convention: `type(module): description`
- [ ] Attribution tags reference correct owner
- [ ] Session recorded via `add_session.py`

---

## Related Memory

- `docs/memory/codebase/BUILD_TARGET_MAP.md` — build targets per module
- `docs/memory/<module>/debug_playbook.md` — how to run tests per module
