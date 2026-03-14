<p align="center">
<picture>
<source srcset="assets/trellis.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/trellis.png" media="(prefers-color-scheme: light)">
<img src="assets/trellis.png" alt="Trellis Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>Trellis for AOSP — Layered memory and task execution for large-repo Android customization</strong><br/>
<sub>Extends Trellis with AOSP-specific spec, module memory, and cross-layer context for Claude Code and Codex.</sub>
</p>

<p align="center">
<a href="./README_CN.md">简体中文</a> •
<a href="./CLAUDE.md">Session Start</a> •
<a href="./.trellis/workflow.md">Workflow</a> •
<a href="./docs/memory/">Memory Store</a> •
<a href="./.trellis/spec/">Spec Docs</a>
</p>

---

## What This Is

This repo adapts [Trellis](https://github.com/mindfold-ai/Trellis) — an AI workflow harness — for AOSP large-repo development. The goal is to give Claude Code and Codex stable, reusable context across sessions without rebuilding the codebase from scratch each time.

**Target modules**: SystemUI · Launcher · Framework

**Core problem solved**: In a multi-million-line AOSP repo, AI assistants lose context between sessions, can't reliably determine module ownership, and produce changes that are hard to track across AOSP upgrades. This project builds a persistent memory and spec layer on top of Trellis to address that.

---

## What's Different From Upstream Trellis

| Capability | Upstream Trellis | This Project |
|-----------|-----------------|--------------|
| Spec layer | General software engineering | AOSP-specific: architecture, ownership, quality gates, security, build/debug |
| Memory layer | Workspace journals | `docs/memory/` — module-scoped, confidence-tagged, baseline-anchored |
| Context loading | Single spec read | Module-scoped load order: codebase → module → cross-layer |
| Cross-layer support | Cross-layer thinking guide | Dedicated flow docs: gesture, recents, notification, device state |
| Attribution | None | `[AOSP-CUSTOM]` tags + ownership decision tree |
| Confidence model | None | `validated / inferred / pending` per document |

---

## Repository Structure

```text
.trellis/
  spec/
    project/            # Goals, team, timeline
    architecture/       # Layer boundaries, low-intrusion rules
    quality/            # Build / test / review / merge gates
    security/           # Permission model, audit checklist
    module_ownership/   # Attribution decision tree
    build_debug/        # Build targets, debug workflow
  tasks/                # Active task tracking
  workspace/            # Per-developer session journals
  workflow.md           # Trellis + AOSP context loading rules

docs/
  memory/
    codebase/           # Codebase map, ownership, build targets, debug entrypoints, branch baseline
    systemui/           # Overview, entrypoints, state owners, debug playbook, pitfalls
    launcher/           # Overview, entrypoints, state owners, debug playbook, pitfalls
    framework/          # Overview, entrypoints, state owners, services map, debug playbook, pitfalls
    cross_layer/        # Gesture-home, recents, notification, device-state flows

CLAUDE.md               # AI session entry point — read this first
AGENTS.md               # Trellis + AOSP agent instructions
```

---

## Core Design Principles

1. **Repo as memory** — context lives in version-controlled files, not chat windows
2. **Prioritize judgments over summaries** — specs capture boundaries and decisions, not full text
3. **Layered organization** — by module, by flow, by task; not flat
4. **Load order discipline** — stable skeleton first, task delta second, raw code last
5. **Baseline anchoring** — every long-lived doc carries a `confidence` field and branch/manifest anchor to prevent stale memory
6. **Low intrusion** — prefer overlays, hooks, and extension points over modifying AOSP base files; every base-file edit gets an `[AOSP-CUSTOM]` attribution tag

---

## Session Start

```bash
# 1. Read the entry point
cat CLAUDE.md

# 2. Get current task context
python3 ./.trellis/scripts/get_context.py

# 3. Load module memory based on your task
cat docs/memory/codebase/CODEBASE_MAP.md
cat docs/memory/<module>/overview.md          # systemui | launcher | framework

# 4. For cross-layer tasks, load the relevant flow doc
cat docs/memory/cross_layer/<flow>.md         # gesture_home_flow | recents_flow | ...

# 5. Read the relevant spec before writing code
cat .trellis/spec/architecture/index.md
```

> Skip files with `confidence: pending` — they are unfilled templates.

---

## Memory Confidence Model

All `docs/memory/` files carry a `confidence` field:

| Value | Meaning | Action |
|-------|---------|--------|
| `validated` | Verified against actual codebase | Trust and use |
| `inferred` | Inferred but not directly confirmed | Use with caution |
| `pending` | Unfilled template | Skip |

When you validate a file, update `confidence`, `last_updated`, and `verified_by`.

---

## Development Phases

| Phase | Goal | Status |
|-------|------|--------|
| 1 — Skeleton | Directory structure, spec templates, memory templates, AGENTS.md, workflow | **Complete** |
| 2 — Codebase memory | Fill `CODEBASE_MAP`, `MODULE_OWNERSHIP`, branch baseline | Pending |
| 3 — Module memory | Fill SystemUI / Launcher / Framework memory docs | Pending |
| 4 — Task Pack | Upgrade Trellis task to AOSP Task Pack (prd, touchpoints, validation, rollback) | Pending |
| 5 — Context selector | Auto-infer which spec/memory to load per task | Pending |
| 6 — Verify profiles | Per-module build/smoke/debug/rollback profiles | Pending |
| 7 — Codex + startup | Unified startup guide for Claude Code and Codex | Pending |

---

## Attribution Format

Every AOSP base file modification must carry:

```java
// [AOSP-CUSTOM] <module>/<owner>: <one-line reason>
// Added: YYYY-MM-DD
```

This tag is the primary mechanism for identifying our patches during AOSP version upgrades.

---

## Based On

This project extends [Trellis](https://github.com/mindfold-ai/Trellis) — the open-source AI workflow harness by [Mindfold](https://github.com/mindfold-ai). The upstream Trellis workflow, spec structure, task system, and script utilities are preserved unchanged. AOSP-specific layers are additive.
