# Support Antigravity lifecycle hooks in Trellis CLI

## Goal

Enable full Trellis lifecycle hook integration for Antigravity (Google DeepMind agentic coding assistant), providing per-turn workflow state injection (`PreInvocation`) and shell session ticket bridging for command authorization (`PreToolUse`).

## Background & Context

Antigravity operates with a customization system under `.agent/` (or `.agents/`), configuring event hooks via `.agent/hooks.json`. Prior to this task, Trellis supported Antigravity workflows (`.agent/workflows/`) and skills (`.agent/skills/`), but lacked lifecycle hook automation. Consequently, Antigravity sessions could not automatically observe `<workflow-state>` breadcrumbs or bridge active session context into shell-invoked Trellis scripts (`task.py`).

## Requirements

1. **Platform Capability Declaration**:
   - Mark Antigravity with `hasPythonHooks: true` and `hasHooks: true` in `packages/cli/src/types/ai-tools.ts`.
   - Register `.agent/hooks` directory and `.agent/hooks.json` in `extraManagedPaths`.

2. **Template & Configuration**:
   - Provide `packages/cli/src/templates/antigravity/hooks.json` mapping `PreInvocation` and `PreToolUse` (for `run_command`).
   - Use relative `hooks/...` paths matching Antigravity's runtime working directory contract (where `cwd` is the directory containing `hooks.json`).

3. **Hook Script Adaptation**:
   - Update `inject-workflow-state.py` to recognize Antigravity and emit the native `PreInvocation` response envelope: `{"injectSteps": [{"ephemeralMessage": "..."}]}`.
   - Update `inject-shell-session-context.py` to parse Antigravity `toolCall.args.CommandLine` and emit `{"decision": "allow"}` with temporary shell ticket generation.
   - Robust host detection using `Path(sys.argv[0]).resolve().parts` to reliably locate `.agent` regardless of invocation cwd.

4. **Active Task Resolver**:
   - Update `common/active_task.py` to map `.agent` and `.agents` directory indicators to the `antigravity` platform identifier.

5. **Testing & Validation**:
   - Add unit tests for platform configuration and template collection.
   - Add end-to-end integration tests in `inject-workflow-state-antigravity.integration.test.ts` executing against the generated `.agent/` layout with dynamic Python interpreter resolution.
   - Ensure all 372 core tests and 1900 CLI tests pass without regression.

## Acceptance Criteria

- [x] `collectAntigravityTemplates` returns `.agent/hooks.json` and `.agent/hooks/*.py`.
- [x] Hook commands in `hooks.json` execute cleanly with relative `hooks/...` paths.
- [x] `inject-workflow-state.py` injects `<workflow-state>` breadcrumb into Antigravity input.
- [x] `inject-shell-session-context.py` generates `.trellis/.runtime/shell-tickets/` and returns `{"decision": "allow"}`.
- [x] Python command resolution uses `getPythonCommandForPlatform()` in integration tests.
- [x] All 1900 CLI regression tests pass.
- [x] Upstream issue #599 and PR #600 linked and documented.
