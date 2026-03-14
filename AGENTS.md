<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`structure/`)
- Session traces (`agent-traces/`)

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

## AOSP Adaptation Context

This project adapts Trellis for AOSP large-repo development. The following directories extend the standard Trellis structure.

### AOSP Spec Directories

| Spec | Path | Purpose |
|------|------|---------|
| Project context | `.trellis/spec/project/` | Goals, team, timeline |
| Architecture | `.trellis/spec/architecture/` | Layer boundaries, low-intrusion rules |
| Quality | `.trellis/spec/quality/` | Build/test/review/merge gates |
| Security | `.trellis/spec/security/` | Permission model, audit checklist |
| Module ownership | `.trellis/spec/module_ownership/` | Attribution decision tree |
| Build & debug | `.trellis/spec/build_debug/` | Build targets, debug workflow |

### AOSP Memory Store

| Memory Dir | Module | Key Files |
|-----------|--------|-----------|
| `docs/memory/codebase/` | Cross-module | CODEBASE_MAP, BUILD_TARGET_MAP, DEBUG_ENTRYPOINTS |
| `docs/memory/systemui/` | SystemUI | overview, entrypoints, state_owners, debug_playbook, known_pitfalls |
| `docs/memory/launcher/` | Launcher | overview, entrypoints, state_owners, debug_playbook, known_pitfalls |
| `docs/memory/framework/` | Framework | overview, entrypoints, state_owners, debug_playbook, known_pitfalls, services_map |
| `docs/memory/cross_layer/` | Cross-module flows | gesture_home, recents, notification, device_state |

### Module Scope Quick Reference

When starting a task, load memory based on module scope:
- **SystemUI task** → `docs/memory/systemui/overview.md` + `docs/memory/codebase/CODEBASE_MAP.md`
- **Launcher task** → `docs/memory/launcher/overview.md` + `docs/memory/codebase/CODEBASE_MAP.md`
- **Framework task** → `docs/memory/framework/overview.md` + `docs/memory/framework/services_map.md`
- **Cross-layer task** → load all relevant modules + `docs/memory/cross_layer/<flow>.md`

### Cross-Layer Context Hint

For changes that span multiple modules, always check `docs/memory/cross_layer/` for an existing flow document before tracing the code manually. These flows document the end-to-end path, state owners, risk points, and debug entry points.

> Note: Files with `confidence: pending` are unfilled templates. Skip them until populated.
