# Independent Trellis quality review — Issue 64

## Reviewed scope

Default quality verification for the exact legacy-native task
`issue-64-legacy-formal-reactivation`, generation 0; no formal Delivery gate or
lifecycle result was created. Reviewed the complete intended worktree change
against `origin/main@3c37c75897f530c3ae8c5c4d85f6c1f3455b2e5f`, including the new
ten-field fixture, planning/research, public contract documentation and installed
candidate driver. The implementation/test/fixture byte-set SHA256 at review is
`eb863c1f2f2d5d92cb51400f9cdc40cda867ff4d4df524fc329dbe60e04b4300` (ordered paths listed below, each encoded as path + NUL + bytes + NUL).

## Findings fixed

- `.trellis/spec/cli/backend/commands-maintain.md`: the formal-operation scope
  still said all known preidentity legacy was excluded after adding the supported
  family. Replaced that stale sentence with the precise unsupported-family
  boundary. This was a documentation-only correction; no product code changed.

## Findings not fixed

No remaining actionable product-code or contract findings. No scope expansion
or design decision is required.

## Behavior review

- Positive legacy recognition owns generation 0. Current Task readers remain
  strict; exact-locator discovery is limited to maintenance inspection and every
  mutation/formal inspection still requires an explicit key.
- Formal projection, archive verification, receiptless successor validation and
  TS relocation share public Core family/source rules. Native Python reads raw
  legacy only inside the retained-predecessor relation and reuses its existing
  positive predicate. Exact original/copy bytes and provenance remain required.
- The canonical old Issue scope constrains successor repository/number. A valid
  source disposition remains caller-authored; no semantic completion, delivered
  extent, source closure authority or personnel identity is inferred.
- Formal conversion retains TaskId, increments once and retains historical
  scope/metadata. Existing fact attribution and no-inherited-gate/Completion/
  Closure/current-Delivery rules remain active. Manual archive resume and native
  schema2 reopen retain their existing contracts.
- Existing frozen-operation machinery remains unchanged. Pending exposes no
  applied key; repeated apply/recover/resume retain operation identity. Receiptless
  discovery checks actual source/provenance and returns the current active or
  archived locator. Ordinary mismatches preserve originals and unrelated work.
- Public capability and actual support now agree on schema1 plus the documented
  known-legacy Issue-scope subset. No alternate converter or broad reader rewrite.

## Verification

- Main-session gates passed: `pnpm lint`, `pnpm typecheck`, and CLI `lint:py`
  (zero errors, 48 existing warnings). Inspected their saved logs in `/tmp`.
- Main reports the stable public formal suite passed 42/42 across schema1 and
  untouched legacy fixtures; other targeted CLI/native regressions passed 68/68
  across five files and Core regressions 49/49 across four files. The additional
  exact-final-newline Core regression and final build are owned by implementation
  and the main session; final delivery evidence records their current totals.
- Independent extra proof: `node <task>/evidence/independent-parity.mjs` passed
  16 finite cases comparing built Core interpretation/source checks with the
  actual shipped retained-predecessor reader under `/usr/bin/python3` 3.9.6.
  Cases cover every valid disposition, exact scope, terminal newline, noncanonical
  and unsafe Issue numbers, missing scope/personnel, unknown fields, incomplete
  status, explicit generation and successor source mismatches. Isolated directories
  were removed afterward. `independent-parity-result.json` records the observed run.
- Independently checked `node --check` for the installed-candidate driver,
  `git diff --check`, and shipped/dogfood `task_utils.py` byte equality: passed.
- Actual packed installation/public-bin proof was pending at this review. The
  reviewed driver covers public subprocesses, installed SDK relocation, native
  completion/archive and pending resume; this review does not claim it already ran.

## Readiness

Implementation is ready to commit and produce the fixed matching candidate.
Whole-task completion still requires the planned installed-pair execution,
immutable source/package identity, delivery/CI and Issue closeout evidence.
Guru qualification, target installation and joint acceptance remain excluded.

## Reviewed byte-set paths

- `packages/core/src/task/maintenance.ts`
- `packages/core/src/task/v2/store.ts`
- `packages/cli/src/commands/maintenance/api.ts`
- `packages/cli/src/commands/maintenance/command.ts`
- `packages/cli/src/commands/maintenance/tasks.ts`
- `packages/cli/src/templates/trellis/scripts/common/task_utils.py`
- `.trellis/scripts/common/task_utils.py`
- `packages/core/test/task/formal-archive-reactivation.test.ts`
- `packages/cli/test/commands/maintenance-formal-reactivation.integration.test.ts`
- `packages/cli/test/fixtures/legacy-formal/task.json`
