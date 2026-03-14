# Finish Work - AOSP Pre-Commit Checklist

Before committing AOSP module changes, use this checklist to ensure work completeness.

**Timing**: After code is written and tested, before commit

---

## Checklist

### 1. Build & Test

```bash
# Incremental build for your module
m <module> -j8             # e.g., m SystemUI -j8

# Run module tests
atest <module>Tests        # e.g., atest SystemUITests

# Framework changes require full flash — no incremental push
```

- [ ] Module builds cleanly (exit code 0, no new errors)?
- [ ] Existing unit tests pass?
- [ ] New behavior has a test? (see `docs/memory/<module>/debug_playbook.md`)
- [ ] Bug fix has a regression test?

### 2. AOSP Attribution

Every change to an AOSP base file (not owned by us) must have an attribution tag:

```java
// [AOSP-CUSTOM] <module>/<owner>: <one-line reason>
// Added: YYYY-MM-DD
```

- [ ] All AOSP base file edits have `[AOSP-CUSTOM]` tag?
- [ ] Tag includes correct module and owner (see `docs/memory/codebase/MODULE_OWNERSHIP.md`)?
- [ ] Owner is registered in `.trellis/spec/module_ownership/ownership-rules.md`?

### 3. Architecture Boundaries

- [ ] No upward layer dependency introduced (Framework ← SystemUI ← Launcher is forbidden)?
- [ ] Change uses lowest-intrusion pattern available:
  - `[1]` Overlay resource (preferred)
  - `[2]` Existing hook/listener registration
  - `[3]` Subclass extension
  - `[4]` Minimal base-file edit (last resort, must have attribution tag)
- [ ] Cross-layer impact assessed? If yes, run `/trellis:aosp-check`

### 4. Security & Permissions

If the change touches permissions, SELinux, or binder interfaces:

- [ ] No new `android.permission.DANGEROUS` without justification?
- [ ] SELinux policy change is minimal?
- [ ] Binder calls verify caller UID before granting access?
- [ ] See `.trellis/spec/security/permission-boundaries.md` for full checklist

### 5. Spec & Memory Sync

- [ ] Does `.trellis/spec/architecture/` need updates? (new boundary discovered)
- [ ] Does `.trellis/spec/module_ownership/` need updates? (new module added)
- [ ] Does `docs/memory/<module>/known_pitfalls.md` need a new entry? (bug fixed or gotcha hit)
- [ ] Does `docs/memory/<module>/entrypoints.md` need updates? (new entry point found)
- [ ] Should any memory file `confidence` be upgraded from `inferred` → `validated`?

**Key question**: "If I fixed a bug or discovered something non-obvious about AOSP internals, should I document it so future sessions won't repeat the investigation?"

If YES → update the relevant memory doc.

### 6. Cross-Layer Verification

If the change spans SystemUI + Launcher, or Framework + UI layer:

- [ ] Data flows correctly through all layers?
- [ ] No state ownership conflict introduced?
- [ ] See `docs/memory/cross_layer/<flow>.md` for the relevant flow doc

---

## Quick Check Flow

```bash
# 1. Build
m <module> -j8

# 2. Test
atest <module>Tests

# 3. View changes
git status
git diff --name-only

# 4. Attribution check (search for base-file edits without tag)
git diff --unified=0 | grep "^+" | grep -v "[AOSP-CUSTOM]" | grep -v "^+++"

# 5. Check relevant spec sections above based on changed files
```

---

## Common Oversights

| Oversight | Consequence | Check |
|-----------|-------------|-------|
| Missing `[AOSP-CUSTOM]` tag | Lost patch on next AOSP merge | `git diff` and search |
| Unregistered module owner | Attribution breaks at merge time | `MODULE_OWNERSHIP.md` |
| Upward layer dependency | Build failure in downstream modules | `grep -r "import.*<upper-layer>"` |
| Known pitfall not documented | Next session repeats same bug | `known_pitfalls.md` |
| Memory doc outdated | Session context diverges from reality | `/trellis:validate-memory` |

---

## Relationship to Other Commands

```
Development Flow:
  Write code -> Test -> /trellis:aosp-check -> /trellis:finish-work -> git commit -> /trellis:record-session
                           |                        |
                    AOSP gates check          Full checklist

Debug Flow:
  Hit bug -> Fix -> /trellis:break-loop -> Update known_pitfalls.md
```

- `/trellis:aosp-check` — Focused AOSP quality gates (attribution, boundaries, low-intrusion)
- `/trellis:finish-work` — Full pre-commit checklist (this command)
- `/trellis:validate-memory` — Check memory doc freshness

---

## Core Principle

> **AOSP delivery = Code + Attribution tags + Memory updates + Boundary verification**
