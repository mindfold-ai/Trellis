# Issue #201 Local Analysis

## Summary

GitHub issue #201 reports that Trellis-generated Pi sub-agents cannot be launched on Windows because the project-local Pi extension calls `spawn("pi", ...)`, but Windows installs can expose Pi through an npm shim rather than a discoverable `pi.exe`.

The issue is open and has no linked PR, closing reference, or timeline reference.

## Current Code Shape

The shipped Pi extension template currently launches nested agents with:

```ts
const child = spawn(
  "pi",
  ["--mode", "json", "-p", "--no-session", toPiPromptArgument(prompt)],
```

This exists in both:

* `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
* `.pi/extensions/trellis/index.ts`

Tests currently assert this old argv-based launcher shape in:

* `packages/cli/test/templates/pi.test.ts`
* `packages/cli/test/configurators/platforms.test.ts`

## User Patch Signals

The issue body includes a patch script that addresses four concerns:

* Windows command resolution by finding `@mariozechner/pi-coding-agent/dist/cli.js` and invoking it through `process.execPath`.
* Prompt transport by writing the prompt to stdin instead of passing it as one large argv value.
* Memory safety by collecting stdout/stderr through bounded buffers.
* Cancellation and session behavior by passing `AbortSignal` into nested sub-agent launches and adopting an existing active Pi session context key when the current key has no task.

## Recommended Scope

Implement the root fix in the template, not as a user-side patch script:

* Resolve the Pi CLI JS entrypoint when available.
* Keep a fallback to `pi` for existing working environments.
* Add `TRELLIS_PI_CLI_JS` for explicit override.
* Switch nested Pi launch to text mode with stdin prompt input.
* Bound stdout/stderr.
* Thread cancellation through `runPi` and `runSubagent`.
* Update tests to lock the new behavior.

This keeps the fix limited to the generated Pi extension launcher and avoids changing the broader platform architecture.
