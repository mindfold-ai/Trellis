# Add unit tests for `trellis mem` command

## Goal

`packages/cli/src/commands/mem.ts` is **1461 LoC with zero unit tests**. The command was integrated from a POC (`nb_project/mem-poc`, commit `e1b368d`) without going through the standard Trellis Plan→Execute→Finish flow, so it shipped to `feat/v0.6.0-beta` with no spec or test coverage. Add reasonable coverage before 0.6 GA so platform-specific parsing edge cases (Claude Code / Codex / OpenCode session formats) and dialogue-cleaning logic don't silently break when upstream session schemas evolve.

## Scope (what to test)

### Tier 1 — Pure helpers (easy, high-value)

| Function | Why test |
|---|---|
| `relevanceScore(h)` | Scoring formula — wrong weights → search ranks broken |
| `parseArgv(argv)` | Flag parser; CLI surface, easy to regress on flag aliases |
| `buildFilter(flags)` | Date / cwd / platform filter construction |
| `inRange(iso, f)` | Date filter logic; off-by-one on UTC |
| `sameProject(a, b)` | Path-equivalence (Windows / symlink quirks) |
| `isBootstrapTurn(cleaned, originalLength)` | Hook-injection vs real turn detection |
| `stripInjectionTags(text)` | Cleans `<workflow-state>` / `<session-context>` / etc. — wrong regex → leaks injection text into search hits |
| `chunkAround(turns, hitIdx, ctxBefore, ctxAfter)` | Surrounding-context window math |
| `searchInDialogue(turns, kw)` | The actual search; substring vs regex; case sensitivity |
| `shortDate(iso)` / `shortPath(p)` | Display formatters |

### Tier 2 — Per-platform parsers (fixture-based)

For each platform: synthesize 1–2 minimal **fixture session files** under `test/fixtures/mem/{claude,codex,opencode}/` and assert the parser returns expected `SessionInfo` / `DialogueTurn[]`.

| Function | Fixture format |
|---|---|
| `claudeListSessions` / `claudeExtractDialogue` / `claudeSearch` | `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` shape |
| `codexListSessions` / `codexExtractDialogue` / `codexSearch` | Codex session JSON shape |
| `opencodeListSessions` / `opencodeExtractDialogue` | `<storage>/messages/<session-id>/*.json` shape |

Cover at least:
- Empty session file (no dialogue turns)
- Bootstrap-only turns (should be filtered as `isBootstrapTurn`)
- Mix of user / assistant turns with injection tags (verify cleaning)
- Date / cwd filter behavior

### Tier 3 — Integration smoke (light)

One end-to-end test per command (`list`, `search`, `context`, `extract`) using fixture trees, asserting:
- Non-zero exit code for missing args / typos
- Output contains expected session ids
- `--json` mode returns parseable JSON

CLI command tests use Vitest's process-level subprocess pattern (already used elsewhere in `test/commands/`).

## Out of scope

- `cmdProjects` exhaustive coverage — list-style command, low risk
- Performance / large-fixture stress tests
- Live filesystem tests against real `~/.claude/` / `~/.codex/` (use fixtures only)
- Reorganizing `mem.ts` (touch only what's needed to export internal helpers for testing)

## Required `mem.ts` changes

To make pure helpers testable from the test file, **export** these names without changing behavior:

```typescript
export {
  relevanceScore,
  parseArgv,
  buildFilter,
  inRange,
  sameProject,
  isBootstrapTurn,
  stripInjectionTags,
  chunkAround,
  searchInDialogue,
  shortDate,
  shortPath,
  // platform parsers
  claudeListSessions,
  claudeExtractDialogue,
  claudeSearch,
  codexListSessions,
  codexExtractDialogue,
  codexSearch,
  opencodeListSessions,
  opencodeExtractDialogue,
};
```

No logic changes. Just export annotations.

## Acceptance Criteria

- [ ] New file `packages/cli/test/commands/mem.test.ts` (or split into `mem-helpers.test.ts` + `mem-platforms.test.ts` if it gets large)
- [ ] Tier-1 helpers each have ≥3 test cases covering happy path + edge cases
- [ ] Tier-2 platform parsers each have ≥2 fixture-driven tests
- [ ] Tier-3 integration smoke covers all 5 subcommands (`list`, `search`, `context`, `extract`, `projects`)
- [ ] Coverage: aim ≥70% statement coverage on `mem.ts` (run `pnpm test:coverage` to verify)
- [ ] All tests pass; lint + typecheck green
- [ ] mem.ts changes limited to adding `export` keywords (no logic edits)

## Definition of Done

- Tests added; lint / typecheck / vitest green
- Test fixtures committed under `test/fixtures/mem/`
- No new runtime deps (use existing `vitest`, `zod`)
- Spec sync: if any non-obvious mem behavior is documented, add a brief note to `spec/cli/backend/` (probably not needed for this task)

## Technical Notes

- mem.ts uses `zod ^4` for schema parsing (added by `e1b368d`); test fixture data should pass these schemas.
- Platform-specific session-file paths come from env vars (`CLAUDE_PROJECT_DIR`, etc.) and OS-specific defaults. Tests should override these via env or by passing explicit roots — do NOT touch real user `~/.claude/` etc.
- `walkDir` is a generator; test with a small synthesized tree.
- Keep tests vitest-idiomatic; use `describe` / `it`; no snapshot tests for parser output (brittle); assert specific fields instead.
