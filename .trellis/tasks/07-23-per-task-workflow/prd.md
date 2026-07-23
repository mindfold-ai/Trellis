# PRD: Per-task dynamic workflow selection

## Problem

Project-level workflow switching already shipped (05-15-workflow-marketplace-feature-flag:
`trellis workflow` command, marketplace `type:"workflow"` entries, `trellis init --workflow`).
But a project still has exactly **one** `.trellis/workflow.md`, and every runtime consumer
hardcodes that single path:

- SessionStart Phase Index extraction (`shared-hooks/session-start.py` `_build_workflow_overview`)
- Per-turn breadcrumbs (`shared-hooks/inject-workflow-state.py`, `root/.trellis/workflow.md`)
- Step detail (`get_context.py --mode phase` → `common/workflow_phase.py` `_workflow_md_path()`)
- OpenCode JS port (`opencode/plugins/inject-workflow-state.js`)

So all tasks and all sessions in a project share the same workflow. Teams want, e.g., the
TDD workflow for feature tasks, native for quick fixes, channel-driven for parallel efforts —
today switching flips the workflow **globally for everyone**, mid-flight tasks included.

"Dynamic workflow switching" = the workflow a session sees follows the **active task's**
choice, injected automatically at session start (and per-turn / on-demand), without the
user or other tasks being affected.

## Chosen dimension: per-task

Selection is stored on the task (`task.json`), because:

- Every runtime consumer already resolves the session-aware active task (for status/breadcrumbs);
  resolving its workflow choice adds one field read to an existing lookup.
- Task lifecycle bounds the state: archived task ⇒ selection leaves the active set with it.
  This respects the 05-15 non-goal of "no long-lived `workflow.variant` config key" —
  nothing global records a variant; the global file and its hash contract are untouched.
- Per-session or per-prompt switching stays out of scope (a session inherits its task's choice).

## Requirements

1. **Workflow library**: variants live as `.trellis/workflows/<id>.md` (new directory,
   plural — deliberately not colliding with PR #337's proposed `.trellis/workflow/`).
   Files there are user-managed: never hash-tracked, never touched by `trellis update`
   (same ownership rule as a non-native `.trellis/workflow.md`).
2. **Populate the library**: `trellis workflow --save <id>` resolves a template
   (native or marketplace, honoring `--marketplace <source>`) and writes
   `.trellis/workflows/<id>.md` **without** touching `.trellis/workflow.md` or
   `.trellis/.template-hashes.json`. `--list` additionally lists library entries.
3. **Per-task selection**: `task.py create --workflow <id>` stores `"workflow": "<id>"`
   in `task.json`; `task.py workflow <id>` sets/changes it on the current task;
   `task.py workflow --clear` removes it. Setting a workflow id that has no library file
   warns but is allowed (file may be saved later).
4. **Resolution rule** (all consumers, identical): active task has `workflow: <id>`
   AND `.trellis/workflows/<id>.md` exists → use it; otherwise → `.trellis/workflow.md`.
   Missing variant file degrades with a stderr warning, never breaks injection.
5. **Consumers updated**: session-start.py, inject-workflow-state.py, workflow_phase.py
   (`--mode phase`), and the OpenCode `inject-workflow-state.js` port all resolve
   per-task. Template AND live dogfood copies (`.claude/hooks/`, `.trellis/scripts/`)
   get the same patch.
6. **No behavior change without opt-in**: absent `workflow` field ⇒ byte-identical
   output to today on every consumer.
7. **Contract validation**: `--save` warns (never blocks) when the saved variant is
   missing required parser markers: `## Phase Index`, at least one `#### ` step heading,
   and the six `[workflow-state:*]` blocks.
8. **Spec updates**: `commands-workflow.md` (new `--save` + library ownership),
   `workflow-state-contract.md` (per-task resolution order).

## Non-goals

- No change to `trellis workflow --template` (global switch) semantics or the
  hash-ownership contract for `.trellis/workflow.md`.
- No YAML-manifest workflow format (PR #337's territory; this design stays on
  monolithic markdown and does not conflict with that migration).
- No per-session/per-prompt switching; no auto-selection by task type.
- Pi / OMP extension parity: their workflow reads live inside large TS extensions;
  they keep injecting the global workflow this iteration. Documented degradation +
  follow-up noted in PR description. (OpenCode IS covered — it is a direct port of
  inject-workflow-state.)
- No `trellis workflow --save` refresh/update semantics (re-run `--save` to refresh).

## Acceptance Criteria

- [ ] `trellis workflow --save tdd` creates `.trellis/workflows/tdd.md`; `workflow.md`
      and `.template-hashes.json` byte-unchanged; `--list` shows the library entry.
- [ ] `task.py create --workflow tdd` writes the field; `task.py workflow --clear` removes it.
- [ ] With active task selecting `tdd`: SessionStart `<trellis-workflow>` block, per-turn
      `<workflow-state>` breadcrumb, and `get_context.py --mode phase --step 1.1` all
      serve content from `workflows/tdd.md`.
- [ ] Same commands with no `workflow` field produce byte-identical output to current main.
- [ ] Task selects `tdd` but `workflows/tdd.md` missing: stderr warning + global fallback,
      exit code unchanged.
- [ ] `--save` of a file missing `[workflow-state:*]` blocks prints a marker warning.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass with no new failures vs the recorded
      baseline (5 pre-existing failures on clean main: 2× trellis.test.ts marketplace
      workflow mirror, 1× template-fetcher ref classification, 2× regression gitignore-trellis).
