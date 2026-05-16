# Verify trellis_subagent rename work in Pi

## Problem

PRD `.trellis/tasks/archive/2026-05/05-17-rename-pi-trellis-subagent-tool/prd.md` was implemented but never smoke-tested in a real Pi session. Need end-to-end verification that `trellis_subagent` tool works.

## Verification Steps

1. **Build**: `pnpm build` in Trellis repo
2. **Link globally**: `npm link` so `trellis` CLI is available system-wide
3. **Create test repo**: `mkdir -p /tmp/test-pi-subagent-verify && cd /tmp/test-pi-subagent-verify`
4. **Init Trellis with Pi**: `trellis init --pi -y -f --overwrite -u testing`
5. **Init git repo**: `git init`
6. **Install community subagent package (registers `Agent` tool)**: `pi install -l npm:@tintinweb/pi-subagents`
7. **Create test task**: `python3 ./.trellis/scripts/task.py create "Test Subagent" --slug test-subagent`
8. **Create README.md**: Write a simple README as test target
9. **Run Pi**: Start pi in the test repo, invoke `trellis_subagent({ agent: "trellis-implement", prompt: "Read README.md and summarize its content in one sentence." })`
   - Use pi command print mode: `pi -p "{PROMPT}"`
10. **Verify**: Check tool call success and returns subagent output

## Acceptance Criteria

### Core Verification
1. `pnpm build` succeeds with no errors
2. `npm link` installs trellis CLI globally
3. `trellis init --pi` creates valid `.pi/` extensions and agent configs
4. `trellis_subagent` tool is registered and invocable from Pi
5. Tool resolves with subagent output text

### Additional Verification

8. **Context injection** — Subagent received task directory path, workflow-state breadcrumb, and prd.md content in its injected context.

9. **Agent enum constraint** — `trellis_subagent` rejects `general-purpose` (schema-level enum validation). Only `trellis-implement`, `trellis-check`, `trellis-research` accepted.

10. **Non-Trellis agent routing** — `Agent` tool spawns `general-purpose` subagent, executes bash, writes file. Non-Trellis agents route correctly through tintinweb's Agent tool.

### Context Isolation

11. **Subagent context isolation** — Subagent confirmed "NO_CONTEXT" when asked about parent conversation secrets. Trellis subagents start with clean context (only injected task context + delegated prompt). No parent conversation leak.

12. **Parent receives subagent output** — `trellis_subagent` tool resolves with subagent's completion text. Parent agent can read, relay, or act on the result.

## Scope

Lightweight verification + one-line bug fix. All 12 acceptance criteria verified.

## Out of Scope

- Parallel/chain execution modes
- Model/thinking parameter testing
- Steering/resume
- Multi-platform testing
