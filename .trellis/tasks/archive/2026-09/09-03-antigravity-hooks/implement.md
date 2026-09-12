# Implementation Plan: Antigravity Lifecycle Hook Integration

## Completed Steps

1. **AI Tools Type Definition**:
   - Added `hasPythonHooks: true` and `hasHooks: true` to `AI_TOOLS.antigravity` in `packages/cli/src/types/ai-tools.ts`.
   - Added `.agent/hooks` and `.agent/hooks.json` to `extraManagedPaths`.

2. **Template Creation**:
   - Created `packages/cli/src/templates/antigravity/hooks.json` with `PreInvocation` and `PreToolUse` events.
   - Configured `packages/cli/src/templates/antigravity/index.ts` to export template definitions.

3. **Hook Script Adaptation**:
   - Updated `inject-workflow-state.py` to detect `antigravity` and format output as `{"injectSteps": [{"ephemeralMessage": ...}]}`.
   - Updated `inject-shell-session-context.py` to extract commands from `toolCall.args.CommandLine` and return `{"decision": "allow"}`.
   - Switched to `Path(sys.argv[0]).resolve().parts` for robust platform detection.

4. **Task Context Resolver**:
   - Added `"agent": "antigravity"` and `"agents": "antigravity"` to platform indicators in `packages/cli/src/templates/trellis/scripts/common/active_task.py`.

5. **Integration Testing**:
   - Created `packages/cli/test/scripts/inject-workflow-state-antigravity.integration.test.ts`.
   - Dynamically detected Python command via `getPythonCommandForPlatform()`.
   - Verified both `PreInvocation` and `PreToolUse` hooks in simulated Antigravity runtime environment.

6. **Review Feedback Hardening**:
   - Addressed CodeRabbit review comments on PR #600: confirmed relative `hooks/` path correctness and verified Python command detection.
