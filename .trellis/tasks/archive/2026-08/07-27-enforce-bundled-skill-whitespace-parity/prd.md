# Enforce bundled skill whitespace parity

## Goal

Clean current trailing whitespace in shipped bundled skill markdown and add validation so source templates and generated platform mirrors stay whitespace-clean and parity-safe.

## Background

The expanded active-session review found a Trellis-generated whitespace defect
while people-profiles was adopting the latest command pack and newly tracked
Claude/Trellis assets. The consumer PR removed two trailing-space lines and an
extra EOF blank from Trellis skill copies to satisfy repository diff hygiene.

Current Trellis source still has the trailing-space part of that issue:

- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/workspace-memory.md`
- `.agents/skills/trellis-meta/references/local-architecture/workspace-memory.md`
- `.claude/skills/trellis-meta/references/local-architecture/workspace-memory.md`

`git diff --check` only catches whitespace introduced by the current diff, so
the existing shipped-template defect needs an explicit cleanup and regression
guard.

## Requirements

- Remove existing trailing whitespace from the authoritative bundled skill
  template and dogfood platform mirrors.
- Audit the bundled skill markdown tree for the same class of trailing
  whitespace and excess final blank-line defects.
- Add validation that scans shipped markdown templates, bundled skill
  references, and dogfood mirrors for trailing whitespace so this does not rely
  on files being touched in a diff.
- Preserve intentional Markdown semantics. If a hard line break is intended,
  replace trailing spaces with an explicit, style-approved alternative.
- Keep source templates, generated dogfood copies, and template-hash tracking
  aligned after the cleanup.
- Keep the implementation scoped to whitespace/parity hygiene; do not rewrite
  bundled skill content unrelated to the defect.

## Acceptance Criteria

- [ ] No trailing whitespace remains in bundled skill markdown source files or
  dogfood `.agents` / `.claude` skill mirrors.
- [ ] The `workspace-memory.md` lines currently ending in two spaces are cleaned
  in the source template and dogfood copies.
- [ ] Regression coverage scans the relevant shipped markdown/template surfaces
  and fails on trailing whitespace even if the file is otherwise unchanged.
- [ ] Template parity or hash-tracking coverage remains green after the cleanup.
- [ ] The chosen replacement preserves readable Markdown output without relying
  on invisible trailing spaces.
- [ ] Relevant focused tests and `git diff --check` pass.

## Notes

- Evidence source: people-profiles PR #3 fixed the same defect locally while
  preserving `.agents` / `.claude` Trellis mirror parity.
- Keep this PRD-only unless implementation needs a reusable template-lint helper
  that warrants a short design note.
