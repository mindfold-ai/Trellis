---
name: commands-platforms
description: "Machine-readable report of configured AI platforms: --json shape, registry sourcing, failure behavior"
paths:
  - packages/cli/src/cli/index.ts
---
# `trellis platforms` Command

Machine-readable report of which AI platforms are configured (active) in the
current project. Downstream tooling (docs, dashboards, other CLIs) can read
this instead of hand-maintaining a per-platform marker-file table that drifts
as the platform count grows or a `configDir` is renamed.

---

## User-facing contract

```text
trellis platforms [--json]
```

Behavior:

- Reads `getConfiguredPlatforms(cwd)` (`configurators/index.ts`) to find every
  platform whose `configDir` exists at the repo root, then looks up each
  platform's `displayName` (`AI_TOOLS[id].name`) and `configDir`
  (`AI_TOOLS[id].configDir`) from the `AI_TOOLS` registry
  (`types/ai-tools.ts`).
- `--json` prints `{"platforms": [{id, displayName, configDir}, ...]}` via
  `JSON.stringify(..., null, 2)`.
- Without `--json`, prints a human list: `  <displayName> (<id>) — <configDir>`
  per line, or `No platforms configured in this project.` when none are
  configured.
- Both output modes exit 0, including the empty-list case — an empty result
  is not an error.

## Failure behavior

- On any thrown error, print `Error: <message>` and exit 1.
- When `DEBUG` or `TRELLIS_DEBUG` is set, also print the error stack.
- No special-casing per platform: this command is a thin read over the same
  registry data `init`/`update` already use, so a new platform only needs its
  Step 1 registry entry (see
  [platform-integration.md](./platform-integration.md)) to show up here.

## Test requirements

- `--json` reports `id`/`displayName`/`configDir` for each configured
  platform, sourced from the real `AI_TOOLS` registry (not hardcoded).
- `--json` reports an empty `platforms` array (not an error) when no platform
  is configured.
- Human output (no `--json`) lists `displayName` and `configDir` per
  configured platform.
- See `test/commands/platforms.integration.test.ts` (#396) — spawns the built
  CLI binary because `src/cli/index.ts` has import-time side effects that
  make direct unit import brittle.
