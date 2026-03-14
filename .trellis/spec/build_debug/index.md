# Build & Debug Spec — AOSP Build System and Debugging Workflow

> Guidelines for building AOSP modules and debugging issues in SystemUI, Launcher, and Framework.

---

## Overview

AOSP builds are large and complex. This spec documents the subset of build targets, debug flags, and diagnostic tools relevant to this project.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| Build Targets | Module-to-target mapping, incremental build commands | Pending |
| Debug Flags | Log tags, debug flags, dumpsys shortcuts | Pending |
| Test Execution | atest patterns, unit and integration test commands | Pending |

> Topic files will be added as content is validated. See `docs/memory/codebase/BUILD_TARGET_MAP.md` and `docs/memory/codebase/DEBUG_ENTRYPOINTS.md` for the live memory versions.

---

## Pre-Development Checklist

Before building or debugging:

- Know the correct build target for your module → `docs/memory/codebase/BUILD_TARGET_MAP.md`
- Know the log tags for your module → `docs/memory/codebase/DEBUG_ENTRYPOINTS.md`
- Check for known build pitfalls → `docs/memory/<module>/known_pitfalls.md`

---

## Quality Check

After making a change:

1. Run incremental build for affected module
2. Confirm no new build warnings
3. Run atest for affected module if test exists
4. If build fails, update `known_pitfalls.md` with the issue and fix

---

**Language**: All documentation should be written in **English**.
