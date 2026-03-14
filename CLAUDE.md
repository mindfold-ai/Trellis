# CLAUDE.md — AOSP Trellis Project

> AI assistant entry point. Read this first, then follow the routing below.

---

## Project Identity

This project adapts Trellis for **AOSP large-repo development**.

- **Primary target modules**: SystemUI · Launcher · Framework
- **Goal**: Low-intrusion, attribution-aware changes across a multi-module AOSP codebase
- **Workflow harness**: `.trellis/` (standard Trellis)
- **AOSP memory store**: `docs/memory/` (module-specific, confidence-tagged)

---

## Where to Find Things

| What | Where |
|------|-------|
| Development workflow | `.trellis/workflow.md` |
| AOSP spec guidelines | `.trellis/spec/project/`, `spec/architecture/`, `spec/quality/`, `spec/security/`, `spec/module_ownership/`, `spec/build_debug/` |
| Cross-cutting thinking guides | `.trellis/spec/guides/` |
| Codebase memory | `docs/memory/codebase/` |
| SystemUI memory | `docs/memory/systemui/` |
| Launcher memory | `docs/memory/launcher/` |
| Framework memory | `docs/memory/framework/` |
| Cross-layer flows | `docs/memory/cross_layer/` |
| Active tasks | `.trellis/tasks/` |
| Session journals | `.trellis/workspace/<developer>/` |

---

## Session Start Checklist

1. **Load workflow** → read `.trellis/workflow.md` (Quick Start section)
2. **Determine module scope** → which of SystemUI / Launcher / Framework is in scope?
3. **Load relevant memory** → `docs/memory/<module>/overview.md` + `docs/memory/codebase/CODEBASE_MAP.md`
4. **Check cross-layer** → if the task spans modules, load `docs/memory/cross_layer/<flow>.md`
5. **Read AOSP spec** → `.trellis/spec/architecture/index.md` and relevant topic files
6. **Check current task** → `python3 ./.trellis/scripts/task.py list`

> Skip files with `confidence: pending` — they are unfilled templates.

---

## Module Scope Quick Reference

| Module | Memory Dir | Key Spec |
|--------|-----------|----------|
| SystemUI | `docs/memory/systemui/` | `spec/architecture/boundaries.md` |
| Launcher | `docs/memory/launcher/` | `spec/architecture/boundaries.md` |
| Framework | `docs/memory/framework/` | `spec/architecture/low-intrusion-principles.md` |
| Cross-layer | `docs/memory/cross_layer/` | `spec/architecture/boundaries.md` |
| Build/Debug | `docs/memory/codebase/BUILD_TARGET_MAP.md` | `spec/build_debug/index.md` |

---

## Key Principles

- **Low intrusion**: Prefer overlay/hook patterns over modifying AOSP base files
- **Confidence-aware**: Trust `validated`, use caution on `inferred`, skip `pending`
- **Attribution first**: Every change must map to an owner via `spec/module_ownership/`
- **Follow Trellis workflow**: All session recording, task tracking, and spec updates go through `.trellis/`
