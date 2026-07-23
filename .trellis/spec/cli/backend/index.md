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
| [Filesystem Safety](./filesystem-safety.md) | Atomic writes (temp+rename / `os.replace`), path/name chokepoint validation, destructive-op ownership & backup gates, dogfood twin sync | Done |
| [Release Process](./release-process.md) | CI-only publishing, package versioning, release tracks, manifest continuity, submodule ordering | Done |
| [Trellis Core SDK](./trellis-core-sdk.md) | `@mindfoldhq/trellis-core` / CLI package boundary, public exports, build and versioning contracts | Done |
| [Platform Integration](./platform-integration.md) | How to add support for new AI CLI platforms | Done |
| [Workflow-State Contract](./workflow-state-contract.md) | Per-turn breadcrumb subsystem: marker syntax, status writers, lifecycle events, reachability | Done |
| [Configurator Shared Helpers](./configurator-shared.md) | `configurators/shared.ts` public surface: placeholder substitution, write helpers, pull-based prelude, cross-configurator invariants | Done |
| [`tl mem` Command](./commands-mem.md) | Cross-platform AI session memory: subcommands, schemas, indexing, cleaning pipeline, search relevance | Done |
| [`trellis upgrade` Command](./commands-upgrade.md) | Global CLI self-upgrade wrapper: channel inference, npm invocation, failure behavior | Done |
| [`trellis update` Command](./commands-update.md) | Update pipeline: flags, plan composition, migration trigger semantics, apply phase, idempotency, boundaries with `migrations.md` | Done |
| [`trellis workflow` Command](./commands-workflow.md) | Workflow marketplace templates, project-local workflow switching, hash ownership contract, and parser compatibility | Done |
| [`trellis platforms` Command](./commands-platforms.md) | Machine-readable report of configured AI platforms: `--json` shape, registry sourcing, failure behavior | Done |
| [`trellis uninstall` Command](./commands-uninstall.md) | Uninstall orchestration: plan composition, structured-file dispatch, execute phases, `.trellis/` removal | Done |
| [Uninstall Scrubbers](./uninstall-scrubbers.md) | Pure scrubber contract for structured config files (`settings.json`, `hooks.json`, `package.json`, `config.toml`) | Done |
| [`trellis channel` Command](./commands-channel.md) | Multi-agent collaboration runtime: events.jsonl protocol, per-worker supervisor, provider adapters (claude / codex), project buckets, ephemeral / run lifecycle, ShutdownController state machine | Done |
| [Spec Injection](./spec-injection.md) | Path-scoped on-demand spec injection: frontmatter `paths:` contract, glob matching, PostToolUse hook flow, session dedup, byte budgets, platform matrix | Done |
---

## Pre-Development Checklist

Before writing backend code, read the relevant guidelines based on your task:

- Error handling → [error-handling.md](./error-handling.md)
- Logging → [logging-guidelines.md](./logging-guidelines.md)
- Adding a platform → [platform-integration.md](./platform-integration.md)
- Modifying `init.ts` flow (new triggers, dispatch branches, bootstrap/joiner) → [platform-integration.md "Bootstrap & Joiner Task Auto-Generation"](./platform-integration.md) — two-point wiring + `.developer` signal
- Script work → [script-conventions.md](./script-conventions.md)
- Migration system → [migrations.md](./migrations.md)
- Writing/deleting/moving/overwriting files in a user repo (any `writeFileSync`, `rmSync`, `renameSync`, `shutil.move`, or user/agent-supplied path segment) → [filesystem-safety.md](./filesystem-safety.md)
- Cutting a release / cross-branch submodule coordination / manifest continuity / npm publishing → [release-process.md](./release-process.md)
- Editing `packages/core/**`, moving reusable CLI logic into core, or changing CLI imports from `@mindfoldhq/trellis-core` → [trellis-core-sdk.md](./trellis-core-sdk.md)
- Adding any native (`.node` / C++ / `node-gyp`) dependency → [quality-guidelines.md "Native dependency policy"](./quality-guidelines.md)
- Editing `[workflow-state:STATUS]` breadcrumb blocks / `task.json.status` writers / lifecycle hooks → [workflow-state-contract.md](./workflow-state-contract.md)
- Editing `configurators/shared.ts` (placeholder substitution, write helpers, prelude injection) → [configurator-shared.md](./configurator-shared.md)
- Editing `commands/mem.ts` (subcommands, platform indexers, search/cleaning pipeline) → [commands-mem.md](./commands-mem.md)
- Editing `commands/upgrade.ts` (global CLI self-upgrade behavior) → [commands-upgrade.md](./commands-upgrade.md)
- Editing `commands/update.ts` (flags, plan, apply phases, idempotency) → [commands-update.md](./commands-update.md) — manifest mechanics still in [migrations.md](./migrations.md)
- Editing `commands/workflow.ts`, `utils/workflow-resolver.ts`, workflow marketplace entries, or `init --workflow` behavior → [commands-workflow.md](./commands-workflow.md)
- Editing the `platforms` subcommand in `cli/index.ts` → [commands-platforms.md](./commands-platforms.md)
- Editing `commands/uninstall.ts` or `utils/uninstall-scrubbers.ts` → [commands-uninstall.md](./commands-uninstall.md) + [uninstall-scrubbers.md](./uninstall-scrubbers.md)
- Editing `commands/channel/**` (events.jsonl protocol, supervisors, adapters, project buckets, channel-lifecycle commands) → [commands-channel.md](./commands-channel.md)
- Editing `shared-hooks/inject-spec-context.py` or `common/spec_match.py` (or any spec file's `paths:` frontmatter) → [spec-injection.md](./spec-injection.md)

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
