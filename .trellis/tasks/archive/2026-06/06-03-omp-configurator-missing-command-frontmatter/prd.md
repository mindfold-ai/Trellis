# OMP Configurator Missing Command Frontmatter

## Goal

`configureOmp()` and `collectOmpTemplates()` write command files without YAML frontmatter. OMP platform requires `---\ndescription: ...\n---` (and optionally `argument-hint:`) at the top for the `/` command picker to work. Fix the configurator so `trellis init`/`trellis update` produces correctly formatted OMP commands.

## Requirements

- Commands written to `.omp/commands/` must include YAML frontmatter with `description` field
- Commands that accept positional args should include `argument-hint` field (e.g. `finish-work` has `[task-name]`)
- The `# Title` H1 heading in source templates must be stripped (frontmatter replaces its role)
- The existing `COMMAND_DESCRIPTIONS` map in `shared.ts` should be the source of truth for `description` values
- Argument hints need a new data source (small map or extension of existing structure)

## Acceptance Criteria

- [ ] `collectOmpTemplates()` output for each command starts with valid YAML frontmatter
- [ ] `configureOmp()` writes commands with matching frontmatter
- [ ] Generated output matches the format user hand-fixed: `---\ndescription: ...\n[argument-hint: ...]\n---\n\n<body without H1>`
- [ ] Existing tests pass; new unit test covers OMP command frontmatter generation

## Technical Approach

Add an OMP-specific command wrapper (analogous to `wrapWithCommandFrontmatter` used by Qoder). Two sub-decisions:

1. **Strip H1**: Source templates start with `# Title\n\n<body>`. OMP format uses frontmatter instead of H1. Strip the first `# ...` line + trailing blank when wrapping.
2. **Argument hints**: Add an `ARGUMENT_HINTS` map (or extend `COMMAND_DESCRIPTIONS` to a richer object). Only `finish-work` currently needs one (`[task-name]`).

Implementation site: `packages/cli/src/configurators/omp.ts` (call wrapper) + `packages/cli/src/configurators/shared.ts` (new helper + data).

## Out of Scope

- Changing the source template format (stays as-is with `# Title` + `{{placeholders}}`)
- Touching other platforms' configurators
- Adding new commands

## Technical Notes

- `wrapWithCommandFrontmatter()` (line 275, shared.ts) is the Qoder/Claude-code variant — adds `name:` + `description:`. OMP doesn't need `name:` (filename is the name).
- `COMMAND_DESCRIPTIONS` (line 267, shared.ts) already has all 3 descriptions.
- OMP is `agentCapable: true` so `start` is filtered out — only `continue` and `finish-work` are emitted.
- User's hand-fix (reference): `trellis-continue.md` has `description:` only; `trellis-finish-work.md` has `description:` + `argument-hint: [task-name]`.
