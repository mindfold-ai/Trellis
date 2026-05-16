# Rename spec bootstrap marketplace skill

## Goal
Rename and reshape the marketplace skill `cc-codex-spec-bootstrap` into `trellis-spec-bootstarp` as a platform-neutral Trellis spec bootstrap bundle skill.

## Requirements
- Rename the marketplace skill directory from `marketplace/skills/cc-codex-spec-bootstrap` to `marketplace/skills/trellis-spec-bootstarp`.
- Update the skill frontmatter name to `trellis-spec-bootstarp`.
- Remove hard dependencies on Claude Code, Codex, and a CC + Codex orchestration model.
- Describe the workflow as a single-agent workflow that can be run by any capable agent; do not restrict the agent implementation or platform.
- Restructure the skill like `trellis-meta`: keep `SKILL.md` concise and move detailed procedure into `references/` files.
- Preserve useful GitNexus / ABCoder / Trellis spec bootstrapping guidance, but make MCP setup platform-neutral instead of Claude Code/Codex-specific.
- Update marketplace index or references where needed so the new skill name is discoverable and stale direct references are removed from active source files.

## Acceptance Criteria
- [ ] No active marketplace skill path or frontmatter uses `cc-codex-spec-bootstrap`.
- [ ] `marketplace/skills/trellis-spec-bootstarp/SKILL.md` is a routing/index skill with references.
- [ ] The skill body describes single-agent execution and does not require Claude Code or Codex.
- [ ] Detailed workflow and MCP setup live under `references/`.
- [ ] Marketplace metadata points to the new skill if metadata is present.
- [ ] Checks pass for changed docs/marketplace files.
