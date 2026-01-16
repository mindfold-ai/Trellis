# Monorepo Support

## Problem

Currently Trellis assumes a single-package project structure. Many modern projects use monorepo setups (Turborepo, Nx, pnpm workspaces, etc.) where multiple packages coexist in one repository.

## Goal

Adapt Trellis to work seamlessly with monorepo project structures.

## Requirements

### Must Have

- [ ] Detect monorepo structure (package.json workspaces, pnpm-workspace.yaml, nx.json, turbo.json)
- [ ] Support per-package `.trellis/structure/` guidelines
- [ ] Allow agents to understand package boundaries
- [ ] Feature tracking that can scope to specific packages

### Nice to Have

- [ ] Shared guidelines at root level, package-specific overrides
- [ ] Cross-package dependency awareness
- [ ] Package-specific slash commands

## Technical Considerations

- How to handle package-specific vs shared guidelines?
- How to scope agent context to relevant packages?
- How to track features that span multiple packages?

## Status

Planning
