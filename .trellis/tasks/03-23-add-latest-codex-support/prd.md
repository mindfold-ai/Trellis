# Add latest Codex support

## Goal
Bring Trellis's Codex integration up to date with current Codex capabilities and with the project's own dogfooded workflow.

## Requirements
- Sync the Codex skill template set with the current Trellis workflow where appropriate.
- Add project-scoped Codex assets for newer Codex capabilities (custom agents and project config) in a way that `trellis init --codex` can install and `trellis update` can track.
- Extend Codex platform detection/managed-path logic so `.codex/` assets are recognized alongside existing `.agents/skills/` assets.
- Keep the repository's dogfooded Codex setup aligned with the packaged templates where practical.
- Update tests and user-facing docs/readmes that describe Codex integration.

## Acceptance Criteria
- [ ] `trellis init --codex` creates the expected Codex skill directory plus new `.codex/` files.
- [ ] `trellis update` tracks the new Codex-managed files without regressions.
- [ ] Codex template tests cover skills, custom agents, config, and extract helpers.
- [ ] Platform detection/managed-path tests cover `.codex/`.
- [ ] Documentation mentions the updated Codex integration surface.

## Technical Notes
- Use official Codex docs as the source of truth for AGENTS discovery, project config, skills, and custom agents.
- Preserve backward compatibility for existing `.agents/skills/` installs while adding `.codex/` support.
