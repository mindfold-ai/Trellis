# Package Trellis Codex integration as a plugin

## Goal

Add an optional Codex plugin path so reusable Trellis hooks do not require per-repository trust.

## Requirements

- Ship a Codex plugin bundle in the Trellis repository with a valid `.codex-plugin/plugin.json` manifest.
- Register stable `UserPromptSubmit` and `SubagentStart` hooks from the plugin so the user can review/trust one plugin hook definition instead of repeating approval for every repository-local hook file.
- Keep repository-local Trellis state and customization authoritative while keeping executable hook code inside the reviewed plugin bundle. The plugin must never execute `.codex/hooks/*` from the active repository.
- Preserve the current project-local Codex integration as the default fallback. Projects that install the plugin may opt into `codex.hook_mode: plugin`; in that mode `trellis init` and `trellis update` must not generate or re-add `.codex/hooks.json` or `.codex/hooks/*`.
- Document installation, supported Codex surfaces, the trust boundary, and fallback behavior in the plugin README and the Codex platform documentation.
- Add automated coverage for the manifest/hook wiring, bundled dispatcher behavior, non-Trellis no-op behavior, and update behavior after project-local hooks are removed.

## Constraints

- The plugin is a companion distribution artifact, not a second Trellis runtime. It must not copy `.trellis/` state, specs, skills, or agent profiles into the plugin.
- Hook commands must use `PLUGIN_ROOT` and remain portable across macOS, Linux, and Windows environments supported by Codex.
- Bundled hook runtime files must remain byte-identical to the shared hook templates used for project-local generation so the two supported modes cannot drift.

## Acceptance Criteria

- [ ] A Codex plugin manifest validates and points at the plugin hook configuration.
- [ ] Installing/enabling the plugin registers both supported Trellis Codex hook events with stable plugin-root-relative commands.
- [ ] In a Trellis repository initialized for Codex, plugin hooks run only the bundled runtime with repository-local `.trellis` state; a planted repository-local hook is never executed.
- [ ] In a non-Trellis repository plugin hooks exit successfully without output.
- [ ] With `codex.hook_mode: plugin`, `trellis update` leaves removed project-local Codex hooks absent and preserves all other Codex templates.
- [ ] Existing CLI template/configurator tests remain green and verify the project-local fallback is unchanged.
- [ ] Documentation explains that plugin hook review is still required once and that changed plugin hook definitions can require re-review; plugin installation does not grant unrelated command/tool permissions.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
