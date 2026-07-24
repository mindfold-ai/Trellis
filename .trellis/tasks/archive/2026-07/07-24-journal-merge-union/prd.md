# PRD: Journal merge=union + index.md conflict guidance (#415 quick-fix tier)

Fixes the immediate pain of #415 without the structural rework (per-session
files, index.md as derived cache) — that stays a separate future task.

## Problem

Parallel Trellis sessions across git worktrees (or `trellis archive` racing
with other workspace writes) hit two distinct file conflicts on merge:

1. `journal-N.md` — append-only. Conflicts here are pure noise: each side just
   added a different session block, nothing overlaps semantically.
2. `index.md` — fully rewritten every session (current-status counters,
   active-documents table, session-history table). Conflicts here are
   structurally real (both sides regenerated the same marker blocks with
   different data) and cannot be auto-merged safely.

Confirmed by production usage (internal team, 2026-07-24): `trellis archive`
across parallel tasks produces exactly this — an `index.md` conflict in the
`current-status` block (`Last Active` line) blocking an automated workflow.

## Requirements

1. Ship `.gitattributes` (template + dogfood) with
   `.trellis/workspace/*/journal-*.md merge=union`. Applies to fresh init and
   `trellis update` for existing projects (add if absent; do not overwrite a
   user-customized `.gitattributes`).
2. Do NOT apply any merge attribute to `index.md` — it must keep git's default
   3-way conflict behavior (union would produce structurally broken output).
3. Documentation (spec + a short section in `.trellis/spec/cli/backend/
   directory-structure.md` or the workspace conventions doc): state explicitly
   that (a) journal conflicts should now auto-resolve via union merge, (b)
   `index.md` conflicts ARE EXPECTED when multiple sessions ran in parallel
   worktrees/branches — picking either side is safe because `index.md` is a
   derived summary, not source of truth (task state lives in `task.json`).
4. Runtime warning: when `add_session.py` detects it is running inside a git
   worktree (not the main working tree) AND `session_auto_commit` resolves
   true, print a one-time-per-session yellow note pointing at the above
   documentation. Non-blocking, does not change any write behavior.

## Non-goals

- No per-worktree/per-session journal file namespacing (that's the structural
  follow-up task).
- No change to `Total Sessions` counter semantics — it stays a best-effort
  advisory number, duplicate session numbers across worktrees remain possible
  and are documented as harmless.
- No custom merge driver — `merge=union` is git-builtin, no driver config needed.

## Acceptance criteria

- Fresh `trellis init` produces a `.gitattributes` with the journal union rule.
- `trellis update` on an existing project without `.gitattributes` adds it;
  on a project with a user-modified `.gitattributes` that already has journal
  entries, does not duplicate/clobber.
- A simulated two-branch scenario (both append different sessions to the same
  journal-N.md from a common base) merges cleanly with `git merge -X ours`
  behavior replaced by real union merge — both session blocks present, no
  conflict markers.
- The same simulated scenario on `index.md` still produces a normal git
  conflict (proves we did NOT accidentally apply union there).
- `add_session.py` run inside a `git worktree add`-created tree with
  `session_auto_commit` true prints the warning once; run in the main
  worktree, or with auto-commit false, prints nothing.
- Full suite/lint/typecheck green.
