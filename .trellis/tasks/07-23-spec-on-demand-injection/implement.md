# Implementation Plan: Path-scoped on-demand spec injection

Baseline note: with the marketplace submodule initialized and `LC_ALL=C LANG=C`,
the full suite is green on main (1552 tests). Pre-commit runs the full suite —
commit with that env.

## Stage A — Matching engine (templates)

- [x] A1. New `packages/cli/src/templates/trellis/scripts/common/spec_match.py`:
      frontmatter head-parser + glob→regex translation + `match_specs_for_file`
      per design.md §1–2. Unit-testable pure functions.
- [x] A2. `get_context.py --mode spec --file <path>` wired through
      `common/git_context.py` dispatch per design.md §5.

Validation: `pnpm lint:py` (packages/cli); direct interpreter checks of glob
translation edge cases (`*` vs `**`, `?`, trailing `/`, invalid globs).

## Stage B — Injection hook (templates)

- [x] B1. New `packages/cli/src/templates/shared-hooks/inject-spec-context.py`
      per design.md §3–4: stdin parse, kill switches, config gate, match,
      session dedup (+mtime re-arm, 48 h prune), budget assembly
      (8192/9000 defaults, UTF-8-safe truncation, overflow → `<spec-index>`
      lines), `hookSpecificOutput.additionalContext` emit, top-level
      try/except → exit 0.
- [x] B2. `templates/claude/settings.json`: PostToolUse entries (Edit, Write,
      MultiEdit) → the new hook, timeout 15.
- [x] B3. `templates/shared-hooks/index.ts` SHARED_HOOKS_BY_PLATFORM: add the
      script for claude only (comment the follow-up posture).
- [x] B4. `templates/trellis/config.yaml`: commented `spec_injection:` section
      (enabled / max_spec_bytes / max_total_bytes) following the
      `context_injection:` section's comment style.

Validation: fixture-driven stdin runs — match/no-match/dedup/mtime-rearm/
truncation/malformed-frontmatter/disabled-config; assert exit 0 + valid JSON
or empty output in every case.

## Stage C — Tests

- [x] C1. Python-behavior tests in the existing vitest python-harness style
      (see how regression.test.ts drives task.py/hooks): spec_match glob
      semantics, hook E2E matrix from B validation, pull mode output.
- [x] C2. Template-shape tests: settings.json gains PostToolUse block
      (wherever claude settings template is asserted, e.g. platforms/templates
      tests); SHARED_HOOKS registry test if one exists for hook distribution.

## Stage D — Dogfood

- [x] D1. Frontmatter on `.trellis/spec/cli/backend/*.md` translating the
      index.md Pre-Development Checklist mapping (no invented mappings).
- [x] D2. Live mirrors: `.claude/settings.json` PostToolUse block,
      `.claude/hooks/inject-spec-context.py`,
      `.trellis/scripts/common/spec_match.py`, live get_context dispatch
      (surgical patches; live copies carry drift).

Validation: edit a scratch file matching a dogfood glob via fabricated
PostToolUse stdin against this repo; confirm injection then dedup.

## Stage E — Spec docs

- [x] E1. New `.trellis/spec/cli/backend/spec-injection.md` (frontmatter
      contract, matching, budget, dedup, platform matrix incl. degradations).
- [x] E2. `.trellis/spec/cli/backend/index.md`: Guidelines Index row +
      Pre-Development Checklist row for the new spec.

## Stage F — Full gate

- [x] F1. `pnpm lint && pnpm typecheck && (packages/cli) pnpm lint:py` clean;
      `LC_ALL=C LANG=C pnpm test` fully green.
- [x] F2. trellis-check quality pass over the diff.

## Rollback points

Hook + registration are additive; reverting the PR restores prior behavior.
Frontmatter left behind is inert (verify §Rollback claim in design.md during
implementation: grep spec consumers for leading-`---` sensitivity).


---

# Implement v2 (ticket-refresh upgrade)

- [x] V1. Rewrite decision engine + identity ladder + global JSONL state + GC in
      `packages/cli/src/templates/shared-hooks/inject-spec-context.py`; add Read
      matcher to `templates/claude/settings.json`; add refresh_window_* keys to
      `templates/trellis/config.yaml` (per design.md v2 — formats are frozen).
- [x] V2. Tests: rework `test/scripts/spec-injection.integration.test.ts` to the
      v2 state machine (PRD v2 acceptance list, incl. agent_id separation,
      TRELLIS_SPEC_STATE_DIR hermeticity, Read trigger, GC prune);
      `test/templates/claude.test.ts` Read matcher assertions.
- [x] V3. Mirrors + docs: live `.claude/hooks/inject-spec-context.py`,
      `.claude/settings.json`, live `.trellis/config.yaml` comment block;
      `spec-injection.md` contract doc v2 rewrite (ticket model, ladder, state,
      windows); config comment style consistent.
- [ ] V4. Full gate (lint/typecheck/lint:py/full suite LC_ALL=C) + trellis-check
      + commit + push (updates draft PR #468) + PR body refresh.
