# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization, file layout, design decisions | Done |
| [Script Conventions](./script-conventions.md) | Python script standards for .trellis/scripts/ | Done |
| [Error Handling](./error-handling.md) | Error types, handling strategies | Done |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Done |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | Done |
| [Migrations](./migrations.md) | Version migration system for template files | Done |
| [Platform Integration](./platform-integration.md) | How to add support for new AI CLI platforms | Done |
| [Workflow-State Contract](./workflow-state-contract.md) | Per-turn breadcrumb subsystem: marker syntax, status writers, lifecycle events, reachability | Done |
---

## Pre-Development Checklist

Before writing backend code, read the relevant guidelines based on your task:

- Error handling → [error-handling.md](./error-handling.md)
- Logging → [logging-guidelines.md](./logging-guidelines.md)
- Adding a platform → [platform-integration.md](./platform-integration.md)
- Modifying `init.ts` flow (new triggers, dispatch branches, bootstrap/joiner) → [platform-integration.md "Bootstrap & Joiner Task Auto-Generation"](./platform-integration.md) — two-point wiring + `.developer` signal
- Script work → [script-conventions.md](./script-conventions.md)
- Migration system → [migrations.md](./migrations.md)
- Editing `[workflow-state:STATUS]` breadcrumb blocks / `task.json.status` writers / lifecycle hooks → [workflow-state-contract.md](./workflow-state-contract.md)

Also read [unit-test/conventions.md](../unit-test/conventions.md) — specifically the "When to Write Tests" section.

---

## Quality Check

After writing code, verify against these guidelines:

1. Run `git diff --name-only` to see what you changed
2. Read the relevant guidelines above for each changed area
3. Always check [quality-guidelines.md](./quality-guidelines.md)
4. Check if tests need to be added or updated:
   - New pure function → needs unit test
   - Bug fix → needs regression test
   - Changed init/update behavior → needs integration test update
5. Run lint and typecheck:
   ```bash
   pnpm lint && pnpm typecheck
   ```

---

**Language**: All documentation should be written in **English**.
