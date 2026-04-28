# fix: Pi subagent launcher on Windows

## Goal

Fix GitHub issue #201 so Trellis-generated Pi Agent sub-agents can launch reliably on Windows, while preserving the existing Pi extension behavior on macOS and Linux.

## What I already know

* Issue: https://github.com/mindfold-ai/Trellis/issues/201
* The issue is open and has no linked pull request or timeline reference.
* Reporter environment:
  * Trellis `0.5.0-beta.15`
  * Node.js `v22.19.0`
  * Windows
* Current generated Pi extension calls `spawn("pi", ["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)])`.
* On Windows, the installed Pi command may be an npm shim rather than `pi.exe`, so direct Node `spawn("pi", ...)` can fail with `ENOENT`.
* The issue body includes a user patch that also addresses prompt argv length limits, unbounded stdout/stderr buffering, cancellation wiring, and active session context-key adoption.
* The dogfood extension at `.pi/extensions/trellis/index.ts` and the CLI template at `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt` currently use the old launcher shape.
* Existing tests assert the old argv-based launcher shape, so regression tests must be updated with the implementation.

## Assumptions

* This task should fix the shipped Pi template and the dogfood generated `.pi` extension copy in this repo.
* The fix should avoid adding a runtime dependency.
* The Pi extension can stay self-contained TypeScript.
* `TRELLIS_PI_CLI_JS` is acceptable as an explicit override for unusual Windows or package-manager installs.
* Existing Pi sub-agent prompt construction, context injection, output extraction, and tool result shape must remain compatible unless directly required by the Windows launcher fix.

## Requirements

* Replace direct `spawn("pi", ...)` with a launcher that can resolve the Pi CLI JavaScript entrypoint and invoke it through `process.execPath`.
* Fall back to `spawn("pi", ...)` when no JS entrypoint can be resolved, so non-Windows and existing PATH-based installs continue working.
* Support `TRELLIS_PI_CLI_JS` as an explicit path override and fail with a clear error if it points to a missing file.
* Search practical npm install locations for `node_modules/@mariozechner/pi-coding-agent/dist/cli.js`, including:
  * current process argv entries
  * npm prefix locations
  * Windows `%APPDATA%/npm`
  * PATH entries and their parent/lib variants
* Send the sub-agent prompt through stdin in text mode instead of passing the full prompt as an argv value.
* Preserve current final assistant text formatting behavior, including stderr diagnostics when present.
* Add bounded stdout/stderr collection so child process output cannot grow without limit.
* Wire `AbortSignal` from the Pi tool execution path into spawned sub-agent processes.
* Keep Trellis context propagation through `TRELLIS_CONTEXT_ID`.
* Preserve or improve active session context-key adoption for Pi sub-agent sessions.
* Update tests that currently assert the old launcher shape.

## Acceptance Criteria

* Pi extension template no longer contains the argv prompt launcher:
  * `["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)]`
* Pi extension template contains a resolver for the Pi CLI JS entrypoint and invokes it via `process.execPath` when available.
* Pi extension template writes prompt content to child stdin and uses `--mode text -p --no-session`.
* Missing `TRELLIS_PI_CLI_JS` produces a clear error message naming the missing path.
* Output buffering is bounded for both stdout and stderr.
* Cancellation propagates to the spawned child process.
* Tests cover the new launcher behavior and continue covering:
  * Trellis sub-agent tool registration
  * Pi hook-equivalent events
  * runtime context resolution
  * Trellis context propagation
  * final output formatting
* Relevant package checks pass:
  * `pnpm lint`
  * `pnpm typecheck`
  * targeted Pi/template tests

## Definition of Done

* Implementation is reviewed against `.trellis/spec/cli/backend/` and `.trellis/spec/cli/unit-test/`.
* Tests are added or updated for the launcher change.
* The dogfood `.pi/extensions/trellis/index.ts` stays in sync with the CLI template.
* If this creates a durable Pi platform convention, update the relevant spec.

## Out of Scope

* Publishing a separate Pi package.
* Reworking the overall Pi platform integration.
* Changing Pi agent definitions or Trellis prompt/skill installation.
* Supporting every possible third-party package-manager layout beyond practical npm/global install discovery and explicit override.

## Technical Notes

* Main files likely affected:
  * `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
  * `.pi/extensions/trellis/index.ts`
  * `packages/cli/test/templates/pi.test.ts`
  * `packages/cli/test/configurators/platforms.test.ts`
* Relevant specs:
  * `.trellis/spec/cli/backend/index.md`
  * `.trellis/spec/cli/backend/platform-integration.md`
  * `.trellis/spec/cli/backend/quality-guidelines.md`
  * `.trellis/spec/cli/unit-test/index.md`
  * `.trellis/spec/cli/unit-test/conventions.md`
* Research artifact:
  * `.trellis/tasks/04-28-pi-windows-subagent-spawn/research/issue-201-local-analysis.md`
