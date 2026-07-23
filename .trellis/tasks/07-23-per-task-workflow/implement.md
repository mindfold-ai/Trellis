# Implementation Plan: Per-task dynamic workflow selection

Baseline note: clean main has 5 pre-existing test failures (2× trellis.test.ts
marketplace workflow mirror, 1× template-fetcher ref classification, 2× regression
gitignore-trellis). "Green" below means no NEW failures beyond these.

## Stage A — Python core (templates)

- [x] A1. New `packages/cli/src/templates/trellis/scripts/common/workflow_selection.py`
      implementing `workflow_md_for_task` + `resolve_workflow_md` per design.md §1.
- [x] A2. `templates/trellis/scripts/task.py`: `create --workflow <id>` flag +
      `workflow` subcommand (`<id>` / `--clear`) per design.md §3.
- [x] A3. `templates/trellis/scripts/common/workflow_phase.py`:
      `_workflow_md_path()` → resolver call.

Validation: `pnpm lint:py` (basedpyright); manual smoke:
`python3 .trellis/scripts/task.py workflow tdd && python3 .trellis/scripts/get_context.py --mode phase | head`.

## Stage B — Hook consumers (templates)

- [x] B1. `templates/shared-hooks/session-start.py`: resolve workflow path via
      workflow_selection (sys.path import pattern; fallback to global on any failure).
- [x] B2. `templates/shared-hooks/inject-workflow-state.py`: `load_breadcrumbs`
      resolves per-task path (thread input_data through).

Validation: run each hook with fabricated stdin JSON against a temp project fixture
(with and without `workflow` field) — assert content switches / stays identical.

## Stage C — TS CLI

- [x] C1. `packages/cli/src/commands/workflow.ts`: `--save <id>` (+`--force`
      overwrite gate), library section in `--list`, marker validation warnings
      per design.md §4. Register flags in `src/cli/index.ts`.
- [x] C2. Tests in `packages/cli/test/commands/workflow.integration.test.ts`:
      save happy path (no workflow.md/hash mutation), save-existing requires
      --force, marker warnings, list shows library.
- [x] C3. Regression guard: `trellis update` leaves `.trellis/workflows/*` intact
      (extend existing update test file where update fixtures live).

Validation: `pnpm --filter @mindfoldhq/trellis test -- workflow` + `pnpm typecheck`.

## Stage D — OpenCode JS port

- [x] D1. `templates/opencode/plugins/inject-workflow-state.js`: same resolution rule.

Validation: node-level smoke (require the plugin's resolver in isolation if
structured for it; otherwise fixture-driven manual run) + existing opencode tests.

## Stage E — Dogfood mirrors (after A–D verified)

- [x] E1. Live `.trellis/scripts/common/workflow_selection.py` (copy of A1),
      `.trellis/scripts/common/workflow_phase.py` (A3 patch),
      `.trellis/scripts/task.py` (A2 patch).
- [x] E2. Live `.claude/hooks/session-start.py` + `.claude/hooks/inject-workflow-state.py`:
      apply B1/B2 as surgical patches (do NOT wholesale-copy; live files carry
      unrelated local drift).
- [x] E3. Live `.opencode/plugins/inject-workflow-state.js`: D1 patch.

Validation: run live session-start hook with echo-JSON stdin; confirm output
unchanged (no active workflow selection in this repo's tasks yet).

## Stage F — Specs & docs

- [x] F1. `.trellis/spec/cli/backend/commands-workflow.md`: `--save`, library
      ownership rule, marker validation.
- [x] F2. `.trellis/spec/cli/backend/workflow-state-contract.md`: per-task
      resolution order ahead of the global file.

## Stage G — Full check gate

- [x] G1. `pnpm lint && pnpm lint:py && pnpm typecheck && pnpm test` — green
      (vs baseline).
- [x] G2. End-to-end manual scenario in a scratch project: init → save tdd →
      create task --workflow tdd → session-start output serves tdd Phase Index;
      clear → native output returns.

## Review gates

- After Stage C and before Stage E: self-review diff for surgical-changes
  discipline (no adjacent refactors).
- After G: trellis-check quality pass over the full diff.

## Rollback points

- Each stage is an isolated commit candidate; revert order E→A safe at any point
  (consumers fall back to global path when the module is absent only in the sense
  of try/except import guards in hooks — workflow_phase imports directly, so A1+A3
  must revert together).
