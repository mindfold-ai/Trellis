# Implementation plan

1. Add `plugins/codex/.codex-plugin/plugin.json` with the companion plugin
   metadata and hook entrypoint.
2. Add `plugins/codex/hooks/hooks.json` registering
   `UserPromptSubmit` and matcher-scoped `SubagentStart` hooks.
3. Implement the small cross-platform dispatcher with plugin-bundled copies of
   the shared runtimes; test that repository-local hooks are never executed.
4. Add the opt-in `codex.hook_mode: plugin` template filter and prove update
   does not regenerate removed project-local hooks while default mode is unchanged.
5. Add plugin README and link the Codex platform documentation to the
   companion installation path, trust boundary, and fallback behavior.
6. Run plugin tests plus the CLI Codex template/configurator suites, then run
   package lint/typecheck and inspect the final diff.
7. Reinstall the local plugin through Codex's native lifecycle, remove local
   Codex hooks from the test fleet, and validate plugin events plus update
   durability in every affected repository.
8. Run `detect_changes()` before committing and update the existing draft PR
   linked to issue #593 only after every end-to-end check passes.

## Review gates

- Keep the generic platform registry API unchanged; apply hook ownership only
  at Codex-specific init/update/manifest boundaries.
- Keep the PR explicitly draft/feedback-oriented until maintainers confirm the
  plugin distribution location and whether marketplace metadata belongs in this
  repository or a companion marketplace change.
