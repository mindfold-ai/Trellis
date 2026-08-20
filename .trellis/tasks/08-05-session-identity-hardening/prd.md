# Session identity: structural hardening

## Goal

Fix the three concrete defects that the session-identity audit exposed, in the
order that stops the bleeding first. These are the mechanical fixes. The two
larger structural convergences (unify the five bridging mechanisms; derive
`collectTemplates` from `configure`) are deliberately **not** in this task —
they need design, and doing them on top of an unguarded duplicate tree would be
reckless.

## Background: what the audit found

The session-identity code is textbook tactical programming. The same problem —
"get the session id into the bash child" — has five unrelated implementations
(Claude appends to `CLAUDE_ENV_FILE`; Cursor writes a 30s ticket file; OpenCode
and Pi each rewrite the command string; OMP sets `input.env`; Snow's vendor
exports it). Nothing states, in one place, how a given platform carries
identity. The measurable consequence: 12 of 14 declared env var names were
invented and nobody noticed for months, and an audit of "which platforms already
bridge this" got the answer wrong twice because the platform list is
hand-maintained.

Two duplication seams make every change a shotgun:

1. `.trellis/scripts/**/*.py` and `packages/cli/src/templates/trellis/scripts/**/*.py`
   are 28 files that must stay byte-identical, with **no test enforcing it**.
   They have already drifted.
2. Every platform's template output is expressed twice — `configure` in
   `configurators/<platform>.ts` and `collectTemplates` in
   `PLATFORM_FUNCTIONS` — 21 platforms, 338 lines, ~8 hand-rolled duplicates.
   (Out of scope here; recorded so it is not forgotten.)

## Fix 1 — guard the live/template duplication

`.trellis/scripts/` (Trellis's own dogfood copy) and
`packages/cli/src/templates/trellis/scripts/` (what ships to users) must be
byte-identical. Nothing checks this today.

Add a test that walks both trees and asserts: same set of relative `.py` paths,
and byte-identical content for each. Ignore `__pycache__`.

This is the highest-leverage item in the task: it converts a whole class of
silent drift into a build failure, and it makes Fix 3 safe to do.

## Fix 2 — the drift that already exists

The new test will fail immediately on `common/session_context.py`. The live copy
says `run trellis upgrade`; the template says `run trellis update`. PR #390
(2026-07-06) changed the template only.

**The template is correct.** The message compares `.trellis/.version` (the
project's config version) against the version parsed from `trellis --version`
(the installed CLI). When the project config is behind the installed CLI, the
fix is `trellis update` — `trellis upgrade` upgrades the global CLI package,
which is a different action. So bring the **live** copy in line with the
template, not the reverse.

Record but do not fix: `_extract_available_update_version` has two branches. If
the CLI printed its own "update available" notice, the extracted version is a
newer **npm package** version, for which the right action really is
`trellis upgrade`. One sentence serving both branches is wrong for one of them.
That needs a product decision, not a patch here.

## Fix 3 — unbounded append to a user-owned file

`_persist_context_key_for_bash` in `shared-hooks/session-start.py` appends
`export TRELLIS_CONTEXT_ID=<key>` to `$CLAUDE_ENV_FILE` on **every** SessionStart,
with no dedup and no bound.

Measured on the maintainer's machine: `~/.claude-env-setup.sh` holds **3884**
such lines for **27** distinct values — 169 KB, 99.3% redundant — in a file the
user owns and populated themselves (conda init, proxy settings), and which the
host shell sources for every command.

Fix: skip the write when the **last** `export TRELLIS_CONTEXT_ID=` line already
equals the line we are about to write. Last-line semantics matter — the host
applies later assignments over earlier ones, so "value appears somewhere in the
file" is not a safe reason to skip. Growth then becomes one line per session
switch instead of one per SessionStart.

Not in scope: rewriting or truncating the user's file. We stop adding to the
problem; we do not take ownership of their file.

## Requirements

- Fix 1's test must fail if either tree gains, loses, or edits a file
  one-sidedly — verify by mutation, not by assertion-reading.
- Fix 2 changes exactly one line in the live copy.
- Fix 3 must be applied to **both** copies of `session-start.py` (Fix 1's test
  enforces this).
- Fix 3 must stay non-fatal: a failure to read or write the env file must not
  break SessionStart, matching the existing `except OSError: pass` contract.
- No refactoring beyond these three fixes.

## Acceptance Criteria

- [ ] A parity test covers all `.py` files in both script trees, ignoring
      `__pycache__`, asserting identical path sets and identical bytes.
- [ ] Mutation-proven: editing one copy of any script makes the test fail; the
      proof is stated in the report, then reverted.
- [ ] `common/session_context.py` is identical across both trees, with the live
      copy adopting `run trellis update`.
- [ ] `_persist_context_key_for_bash` does not append when the last existing
      `TRELLIS_CONTEXT_ID` export already matches, in both copies.
- [ ] A test covers the dedup: repeated calls with the same key append once;
      a changed key appends again; an unreadable/missing env file is a no-op and
      does not raise.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass, and
      `pnpm lint:py` reports 0 errors.

## Out of Scope

- Removing the 12 invented env var names — next task, and it wants Fix 1 landed
  first so a one-sided edit cannot slip through.
- Unifying the five identity-bridging mechanisms.
- Deriving `collectTemplates` from `configure`.
- Cleaning the maintainer's polluted `~/.claude-env-setup.sh` — a local chore,
  not a code change.

---

## Fix 4 — the built-in update reminder never fires on the main platform

Added after Fixes 1-3 landed, from a maintainer report that they "keep forgetting
to run the dogfood update".

It is not a memory problem. Trellis already computes the reminder —
`_get_update_hint()` in `common/session_context.py` returns
`"Trellis update available: <project> -> <latest>, run trellis update"`. But its
only caller is `output_text()`, which is only reached from `git_context.py:102`,
i.e. the `get_context.py` text-mode CLI path. **The SessionStart hook builds its
own payload and never goes through it.**

Evidence:

- This repo's `.trellis/.version` is `0.6.2`; the globally installed CLI is
  `0.6.7`; the tree builds `0.6.12`. The reminder should have been firing for
  months.
- The SessionStart context delivered to a live Claude Code session in this repo
  contains no update notice.
- `.trellis/.runtime/` holds 7 `update-check-*.marker` files: six `codex_*` and
  one `ppid-*`. Not one `claude_*` — the code path has never executed there.
- `trellis --version` measured at 0.23s, well inside the 1s timeout, so latency
  is not the cause.

So on the maintainer's primary platform the mechanism that should prompt the
update is silent, while Codex sessions do see it. That is the whole reason the
dogfood step gets skipped, and it makes every downstream drift worse.

### Requirements

- SessionStart emits the update hint when one exists.
- It must reach the **user**, not just sit in the model's context. Follow the
  existing `<first-reply-notice>` pattern in the payload — that block already
  exists precisely to make the assistant say something in its first visible
  reply. Do not invent a second mechanism.
- Keep `_get_update_hint`'s once-per-session marker throttling intact; a
  SessionStart must not re-run `trellis --version` on every compact/clear.
- Non-fatal, matching the surrounding hook contract: any failure to compute the
  hint leaves the rest of the payload unchanged.
- No behavior change when the project is up to date — no empty block, no
  placeholder line.
- Template is the source of truth; do **not** hand-edit `.claude/hooks/` or
  `.cursor/hooks/` dogfood copies. They are regenerated by `trellis update`.

### Acceptance Criteria

- [ ] With a stale `.trellis/.version`, the SessionStart payload carries the
      hint and instructs the assistant to surface it in its first reply.
- [ ] With a current version, the payload is byte-identical to today's output.
- [ ] The marker still suppresses repeat checks within one session.
- [ ] A failure inside the hint path (unreadable version file, `trellis` absent,
      subprocess timeout) leaves SessionStart working and silent.
- [ ] Tests cover stale / current / failure, driving the real hook rather than
      asserting on a mocked string.
- [ ] `pnpm build`, `lint`, `typecheck`, `test` pass; `lint:py` reports 0 errors;
      the two script trees stay byte-identical (Fix 1's guard).

## Rescope (2026-08-08, sd-ai-command-pack cross-repo review)

Fix 1 LANDED: `packages/cli/test/regression.test.ts:9528` now asserts
`.trellis/scripts` stays byte-identical to the templates. Remaining scope is
the rest of the hardening set only.
