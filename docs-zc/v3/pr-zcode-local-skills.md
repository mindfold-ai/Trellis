# PR: Generate ZCode skills and agents only under `.zcode`

## Summary

This PR fixes ZCode local skill invocation by moving ZCode-managed Trellis skills into ZCode's own project directory, `.zcode/skills`.

ZCode currently requires local manually-invoked project skills to live under `.zcode/skills`. Trellis previously generated `.agents/skills` for ZCode, which made ZCode maintain a shared compatibility directory instead of its own private project surface.

The PR also completes ZCode's native sub-agent set by adding the missing `trellis-research` agent and marking `.zcode` as a sub-agent-capable task platform for JSONL seed generation.

## Changes

- Stop writing `.agents/skills` from the ZCode configurator.
- Stop tracking `.agents/skills` in `collectZcodeTemplates()`.
- Remove `supportsAgentSkills` from the ZCode registry entry.
- Add `.zcode/skills` as the ZCode-owned skill root.
- Render ZCode private skills with `resolveSkills()` so `.zcode/skills` contains workflow skills only.
- Keep `trellis-start`, `trellis-continue`, and `trellis-finish-work` as `.zcode/commands/trellis` commands instead of duplicating them as skills.
- Add `.zcode/skills` to ZCode managed paths.
- Add `packages/cli/src/templates/zcode/agents/trellis-research.md`.
- Add `.zcode` to the Trellis task script's sub-agent platform detection so ZCode-only projects seed `implement.jsonl` and `check.jsonl`.
- Update configurator and init regression tests to assert:
  - ZCode does not create `.agents/skills`.
  - ZCode does not track `.agents/skills`.
  - ZCode does create and track `.zcode/skills`.
  - ZCode does not create command-as-skill entries under `.zcode/skills`.
  - ZCode creates `trellis-implement`, `trellis-check`, and `trellis-research` under `.zcode/agents`.
  - ZCode `trellis-research` stays free of the implement/check pull-based prelude.

## Compatibility

This change only affects ZCode platform generation. Other platforms that intentionally use `.agents/skills` continue to do so.

## Verification

- Focused ZCode configurator tests
- Focused init integration test coverage for `--zcode`
- TypeScript typecheck
- ESLint on changed TypeScript test/source files

## Notes

The repository instructions require GitNexus impact analysis before editing symbols. The GitNexus MCP tools were not available in this environment, `.gitnexus/run.cjs` was absent, and an escalated `npx gitnexus --help` attempt timed out without output. The change was therefore scoped through source-level dependency review and focused regression tests.
