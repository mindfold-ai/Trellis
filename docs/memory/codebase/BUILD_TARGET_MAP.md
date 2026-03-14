---
title: Build Target Map
module: codebase
layer: build
confidence: pending
status: template
last_updated: ""
verified_by: ""
---

# Build Target Map

> Mapping from module to build target commands. Fill in from actual AOSP build system.

---

## Module Build Targets

| Module | Build Command | Full Build | Incremental Build | Notes |
|--------|--------------|-----------|------------------|-------|
| SystemUI | `m SystemUI` | (pending) | (pending) | |
| Launcher | `m Launcher3` | (pending) | (pending) | |
| Framework | `m framework` | (pending) | (pending) | Long build time |

---

## Test Targets

| Module | Test Command | Notes |
|--------|-------------|-------|
| SystemUI | `atest SystemUITests` | (pending) |
| Launcher | `atest LauncherTests` | (pending) |
| Framework | `atest FrameworkCoreTests` | (pending) |

---

## Build Environment Setup

```bash
# Source build environment (run once per shell session)
source build/envsetup.sh
lunch <target>-<variant>

# Incremental build
m -j<N> <module>
```

- `<target>`: (pending — fill in device target)
- `<variant>`: userdebug (for development), user (for release)

---

## Known Build Pitfalls

See `docs/memory/<module>/known_pitfalls.md` for module-specific issues.

---

## Related Files

- `DEBUG_ENTRYPOINTS.md` — how to run and debug after build
- `.trellis/spec/build_debug/index.md` — build spec guidelines
