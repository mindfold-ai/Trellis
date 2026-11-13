# Execution plan: Independent installation and selected-task maintenance

## 1. State and delivery policy

Task `40-independent-install-maintenance`, generation 0, is **in_progress**. Base: `main@dde5f90903e9299236e3574d4dfab6441daec09d`; branch: `codex/40-independent-install-maintenance`. [prd.md](./prd.md) owns accepted requirements; [design.md](./design.md) owns the API, algorithms and compatibility decisions. Stage checkboxes and the execution evidence section distinguish implementation from verification and release.

One Task owns the complete upstream Issue #40. Implement in ordered stages with one final upstream acceptance; intermediate package candidates may be handed to Guru #566 when their declared subset is real and installable. Do not close the full Issue based on a partial tools-only candidate. No extra parent/child Tasks or new Delivery identities are needed under this repository's retained native workflow.

The main session owns planning, integration, spec updates and the final semantic check. After explicit artifact review and implementation approval, `task.py start` activates implementation and `trellis-implement`/`trellis-check` subagents perform their current workflow roles. Native hook task injection must match the upstream Task; when the calling chat injects the Guru Task, use the validated explicit upstream Task/workspace and documented child-side loading. Never let that mismatch select or write #566.

## 2. Stages and affected files

### S1 — Publish precise local contracts and reusable validation seams

Entry: planning reviewed; implementation approved; task started; current Issue/source reread; implementation/check context valid.

- [x] Add closed Core `/task/maintenance` source/projection/carrier validators with exact public types and export entry. Reuse existing `validateTaskV2Projection`, positive legacy/schema1 classifiers and immutable fact checks. Keep Core free of CLI/Zod/rendering dependencies.
- [x] Extract the per-task predecessor, planning and legacy-fact checks from Plan2 at their real owner boundary. Preserve full Plan2 inventory/version/disposition checks in its caller; do not accept omitted workspaces by changing its existing schema.
- [x] Add CLI `commands/maintenance/` and documented additive root `maintenance` namespace (preserving `VERSION`/`init` and existing CLI import resolution). Implement `contract`, read-only explicit-root inspection, three distinct preparation inputs/plans and structured errors. Fix operation identity at prepare; no apply-time identity allocation.
- [x] Wire `trellis maintain` in `packages/cli/src/cli/index.ts`. JSON stdout must stay one document, including when invoked from an old unrelated cwd. Keep global `upgrade`, ordinary `update`, normal archive and old migration commands unchanged.
- [x] Document exact TypeScript/JSON input/output/error examples and supported source/runtime/session table. Those definitions must be available before Guru depends on them; do not hand off internal `dist/commands` paths as stable SDK.

Primary files: `packages/core/src/task/maintenance/**` (new), `packages/core/package.json`, existing task migration modules, CLI `commands/maintenance/**` (new), `src/cli/index.ts`, `packages/cli/package.json`, necessary shared per-task migration helpers. Only extract actually shared logic; no general policy/transaction/plugin framework.

Exit: public imports resolve through built packages; pure validation/contract tests pass; existing Plan1/Plan2 callers keep their accepted shape and behavior. No claim of installed/native completion yet.

### S2 — Independent tools installation and bounded recovery

- [x] Extract prospective template collection and managed ownership/action preparation below current update and Plan2. Retain platform customization, config, skip-path, managed-block, workflow/provider ownership and raw-vs-normalized hash semantics.
- [x] Implement supported source-version checks, first Delivery-capable runtime cutover and exact one-target tool actions without Task/session conversion or target old-runtime startup.
- [x] Implement coherent-runtime conflict handling: preview/sidecar output alone cannot update successful installation identity or claim required runtime is installed. Preserve custom workflow by default unless an explicit selected custom/bundled workflow decision is provided.
- [x] Implement operation-private preimages, source/target state replay, complete-result recovery and scoped rollback. Use state-dir/operation_id; never recapture original backups on resume.
- [x] Implement positive restore compatibility against frozen source runtime/declaration and actual data/session shapes. An incompatible or unprovable restoration stops before writes. Keep later unrelated business files and all non-target tool/data bytes/modes unchanged.
- [x] Execute actual target contract/native diagnostics after apply; separate tools installed from Task pending maintenance.

Primary files: maintenance installation/operation modules, shared update-template helpers, `utils/delivery-workflow.ts` only for an explicit prospective maintenance boundary, workflow hash/provider helpers. Existing ordinary update/preflight behavior remains protected by regression tests.

Exit: PRD A1/A2 plus installation parts of A6 pass in controlled fixtures and through the actual candidate bin. This stage is not whole-Issue completion.

### S3 — Selected Task conversion, history closeout and native diagnostics

- [x] Implement explicit raw predecessor selection without current lifecycle bootstrap, with relevant inherited-copy/branch authority checks and no all-workspace conversion requirement. Preserve existing ownership; if no branch binding exists and native resolution needs one, validate only an explicit original-owner establish disposition against exact absence and the actual target branch, without current-parser bootstrap.
- [x] Prepare/apply the selected full projection, retained raw source, explicit planning/artifact maps, legacy-fact dispositions and exact session decisions. Current Task store APIs remain strict; migration gets its own validated writer.
- [x] Preserve supplied Delivery/result IDs on retry/recovery, and retain original TaskId/generation/source/accepted scope. Never synthesize gates, infer completion from old status or select a sole Delivery.
- [x] Implement positive classification/attribution of common identity sessions, supported old local/path carriers and exact branch binding. Unknown or unrelated data is not removed. List every same-Task peer-local carrier write explicitly; never enroll peer tools or Task copies.
- [x] Implement separate historical closeout: fixed archive destination, readable raw archive + original-owner note, then exact binding retirement, then remove active source. No normal archive call, new-model success, legacy completion/date rewrite, child mutation, hooks, commit or Git cleanup.
- [x] Implement same-operation closeout/conversion recovery and rollback, including interrupted archive-before-retirement and protection of later selection/business edits.
- [x] Add native `maintenance_required` error details for positively known old selected state, without usable current execution authority or silent no-task fallback. Preserve malformed-current/unsupported errors.
- [x] Synchronize any changed shipped Python files and their `.trellis/scripts` twins byte-for-byte. Exercise actual context/current/continuation consumers and one real next native owner for continuing/pending-acceptance fixtures; verify old-target native no-selection after history closeout without updating its tools.

Primary files: Core maintenance validation, CLI maintenance task/history/session modules; shipped Python `common/active_task.py`, `session_storage.py`, `runtime_contract.py`, context error rendering and exact dogfood twins as actually needed. Native wrapper/hook changes are transport only, never new workflow gates.

Exit: PRD A3–A7 pass through genuine built/installed public entries. Plan2, current writers and ordinary archive remain distinct and green.

### S4 — Integration, documentation and candidate handoff

- [x] Update repository README and relevant durable specs through the main session; add a focused maintenance contract spec and link it from the backend index. Update installed-version/update/migrate/workflow/delivery/Core SDK specs only where the new operation changes their documented boundary.
- [x] Verify CLI/Core exact version lock and packed dependency rewriting. Build/pack both packages without version publication, record source SHA plus artifact hashes/content identity, and install the exact pair into a throwaway environment.
- [x] Run focused installed/native scenarios and preserved-path snapshots. Keep upstream acceptance separate from Guru overlay/private-owner/joint evidence. Produce a concise candidate/API/example handoff for #566 without modifying its source lock, runtime or business checkouts.
- [x] Perform complete current-scope `trellis-check`, including design/code/test consistency, shared algorithm reuse, generated/dogfood parity and explicit unverified boundaries. Do not use green unit commands as whole acceptance.
- [x] Present actual results and remaining gates. Commit/push/PR/merge/release/cleanup and real business installation remain independent actions.

Exit: complete upstream scope demonstrated, with matching installable public candidate and actual native evidence. Guru joint validation and any software release remain separately reported.

## 3. Acceptance and test ownership

| Test layer | Planned coverage | Main acceptance |
| --- | --- | --- |
| Core pure tests | Known legacy vs schema1/source mismatch, Task identity/generation/tree/scope preservation, old fact dispositions, exact carrier attribution, no fabricated gate or current-reader weakening | A4, A7, A8 |
| CLI command/SDK tests | Closed inputs/outputs, explicit root, read-only inspection/prepare/preview, capability/pair mismatch, single JSON stdout, same operation/result recovery | A2, A6, A7, A9 |
| Tools integration | Real multi-worktree predecessor fixture; recursive old data/peer/shared-control snapshots; first cutover, custom/bundled workflow identity, local edits, required-asset conflicts/sidecars, reapply and ordinary partial-write replay | A1, A2, A6 |
| Task conversion integration | Exact selected Task only, relevant inherited peers unchanged, explicit planning map/history attribution, supported mixed neighbors, no full Plan2 reduction, actual target-native continuation and next owner | A3, A4, A7 |
| Historical closeout integration | Readable archive before retirement, common and obsolete local carriers, exact generations, unrelated sessions/children preserved, no hooks/commit/tools update, same fixed archive on retry, old native context no longer selecting Task | A5, A6 |
| Combined restore integration | Install → convert → tools-only rollback rejected before restore; compatible restore; data rollback reporting pending maintenance; later business/selection edits preserved | A6 |
| Existing regressions | Ordinary exact-version update/init, workflow preview/force/custom ownership, Plan1, complete Plan2/mixed/inherited copy, current Task/Delivery/archive/session behavior, Python template/dogfood parity | A8 |
| Packed/native proof | Exact built CLI/Core installed pair; actual public bin, SDK imports, generated target readers; candidate API/examples and provenance | A3, A5, A9 |

Reuse existing meaningful assertions and fixtures. Do not mirror every validator with redundant tests. Use normal source changes, actual bounded writer failures and output-loss recovery already present in supported flow patterns; no new adversarial corpus, lock/TOCTOU or crash-hardening matrix. One representative platform/installation family is sufficient for the combined installed fixture, with focused source-family tests as needed. This Task does not acquire the full release-platform matrix.

## 4. Planned validation commands

These are implementation-stage commands, not executed planning results. New focused test filenames below are planned locations and must be created with their modules; verify their final names before running.

```sh
pnpm --filter @mindfoldhq/trellis-core test -- test/task/maintenance.test.ts test/task/migration-v2.test.ts test/task/migration.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/commands/maintenance.integration.test.ts test/commands/update-current-version.test.ts test/commands/migrate.integration.test.ts test/commands/migrate2.integration.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/scripts/maintenance.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts test/scripts/delivery-context-boundary.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm build
pnpm test
```

Also compile shipped/changed Python with the repository's minimum supported Python 3.9 using its existing CI path, verify script-tree byte parity, and execute the installed fixture via the exact packed candidate bin. Dependency availability or a missing minimum interpreter is reported as unverified until actually supplied; it is not a passing result. No global npm upgrade or release command is needed.

Planning-only checks: JSONL schema/path consistency, source-to-acceptance coverage, absence of placeholder planning, changed-file scope, whitespace, current native task identity/status and preservation of the main checkout. Those checks cannot prove API or migration behavior.

## 5. Risk and rollback boundaries

- Required-runtime conflicts and genuine receipt advancement must be one coherent installation outcome. A `.new` file is not a new runnable installation.
- Public single-task helpers must be extracted below Plan2 completeness; do not regress existing full inventory validation to obtain narrow execution.
- Legacy-fact attribution and raw planning retention cannot be replaced by a permissive current parser or a fake completed phase.
- History archive is a separate operation because ordinary archive mutates lifecycle and may commit/run hooks. Its data/binding order and obsolete-carrier retirement are acceptance-critical.
- Restoring only tool bytes after data conversion can be incompatible. A later modification to an owned path stops rollback; an unrelated business path is not in the rollback set.
- Package versions may remain equal while source/API differs. Handoff names exact built artifacts and capability; package publication/source-lock advancement remain their original owners.

Native task activation is complete. Implementation, complete scope review and targeted upstream acceptance are complete. Task stays in_progress for the separate delivery boundary; no Git/GitHub publication or downstream business installation is implied.


## 6. Executed validation and candidate

Final implementation is based on `main@dde5f90903e9299236e3574d4dfab6441daec09d`
in `codex/40-independent-install-maintenance`; it is an uncommitted local candidate,
not a released version or an implementation identified by that base SHA alone.
CLI/Core remain `0.7.0-castbox.3`; equal labels do not identify these artifacts.

- Core full suite: 28 files, 478 passed, 1 existing skipped (479 total).
- Final CLI full suite: 104 files, 2321 passed, zero failures, using
  `pnpm --filter @mindfoldhq/trellis exec vitest run --maxWorkers=4`.
- `pnpm build`, `pnpm lint`, and both package `typecheck` commands passed.
- Python type check: zero errors, 48 existing warnings. Python 3.9.6 compiled all
  91 repository/shipped Python files; shipped/dogfood Python trees have zero byte differences.
- Independent whole-scope quality review found normal sequential stale branch,
  preserved-workflow freshness, rollback record-classification/alias, casefold
  reservation, typed-input and supported individual Task-alias gaps. All were fixed
  and reproduced through the built public SDK. Final review has no remaining
  accepted-scope findings; its final focused set was 35/35 passing.
- Existing Plan1/Plan2, ordinary update/init, current lifecycle, archive and platform
  regressions are included in the final whole CLI suite. Four old diagnostic
  assertions were updated to require maintenance_required and the real inspect
  entry, while preserving strict execution rejection/no-authority/no-write assertions.

The final CLI/Core pair was packed, installed together into an isolated npm project
with scripts disabled, and exercised through its actual bin and root public SDK.
The packed CLI dependency is the exact Core version, not workspace:*.

| Artifact | SHA-256 |
| --- | --- |
| mindfoldhq-trellis-0.7.0-castbox.3.tgz | eb6cdff3fac92079a174469c04366e0cc004fb670fc0fa26dd6a252dc0caef8f |
| mindfoldhq-trellis-core-0.7.0-castbox.3.tgz | 156ea541c68cf941ef1b11d3304031658276944e74db11b19423bccfdee28425 |

Executing source/build package fingerprints (include package.json, bin, src and dist,
where present): CLI `abf93dc545ab44b4a7ff779354bf6b8739171144abd7f55cf11c390d15db1d56`;
Core `5f831ee959dde17892ecd1784c801bc5bb5daae1732fa902dd33926dbf8992d0`.
The tar identities above identify the installable candidate, separately from this dirty source.

Packed/native Python 3.9.6 proof passed: first predecessor tools cutover; exact
peer/task/archive/common-control preservation; actionable native pending-maintenance;
selected conversion; native continuation and actual accept_scope next owner; original
operation lost-output recovery before the next owner; later-owner edits protected;
incompatible old-tools rollback blocked; exact historical archive and empty modes.
The retained-delivered fixture also loads the installed trellis-complete-task Skill,
real runtime owner declaration, current Task/noDelivery and retained Delivery list.
The original-owner pending-acceptance note yields evidence pending, not whole-scope
acceptance. No new Delivery, Completion or Closure is created. Its example PR is
fixture attribution, not live GitHub or business acceptance evidence.

A1-A9 are covered at this upstream fixture/package boundary. Guru #566 overlay and
original-owner joint validation, business repositories, external acceptance, complete
release-platform matrix, publication and software release remain unverified and
outside this execution. Neither the upstream Issue nor #566 is closed. The primary
Trellis checkout stays clean on the original main SHA; #566 still contains only its
existing planning task. No commit, push, PR, merge, source-lock update, real business
installation/migration, global CLI upgrade or resource cleanup was performed.

## Paired #566 original-writer carrier finding fix

The joint Guru rehearsal established an original 0.6.17 CLI installation and
0.6.17-guru.43 preset, then ran the real old `task.py start`. Its local session
contains `platform`, `last_seen_at`, `current_task` and `current_run: null`;
known session/conversation/transcript string aliases may also be supplied by
that old writer. The first packed #40 candidate accepted only singleton
`{current_task}` for an unversioned local carrier. Actual target-native tools
postvalidation therefore reported `unsupported_binding_schema`; the same old
classifier also blocked its rollback with `restore_compatibility_unknown`.
The original failed operation, package pair and session/Task bytes remain
unchanged. No cross-candidate replay or manually rewritten plan was attempted.

The bounded fix extends Core classification and its shipped/dogfood Python
diagnostic to the positively identified original-writer metadata shape. It
continues to return a predecessor/path carrier and maintenance-required
instruction, never current Task/Delivery execution authority. Other malformed
formats retain existing failures. The current session-storage reader already
called this diagnostic; its execution algorithm was not weakened.

Validation after the fix: Core complete suite 28 files / 479 passed / 1 skipped;
CLI affected maintenance tools/tasks/native, cross-worktree session and whole-tree
regression suites 5 files / 508 passed; build, both package lint and typechecks
passed. Python 3.9.6 compilation and shipped/dogfood byte parity passed.
The previous complete CLI suite remains earlier-candidate evidence; it was not
relabelled as a rerun of the repaired package.

The successor local pair is in `trellis40-carrierfix-candidate-3imxzayw`
(external temporary candidate), independently packed/installed without replacing
the first candidate. CLI tar SHA256
`dd82a1dae0e2b325edcc9f310e2b7619a9f1dd88f94125f9b9aec2b2239904e1`;
Core tar SHA256
`036e895a4f088cc48e90f01cde0b8db91379ffb105f4dd3f135c909d39601496`.
Installed candidate identities are CLI
`d51417e513d9f6f4469a0639d085e1a731a6672b4352977ab5be2708fa79e5e9`
and Core
`5e167afdc4c18809f7102e37af6737799d74e61096e3f6f8aa1d969b9093949f`.
Source/build identities are separately retained in that candidate.json.

A strict equivalent joint fixture retains the exact original-writer
Task/planning/session bytes/modes, original old tools and Guru receipt,
primary/peer topology, original common Python pointer content and dirty business
bytes. Only the absolute root/common-directory identity changes. The repaired
pair passed real public tools apply/native postvalidation and Guru installation
in this equivalent fixture. Its actual target resolver/installed validator,
native continuation (`maintenance_required`) and an isolated in-memory current
public `accept_scope` operation passed. Full Guru same-source resume/reapply and
whole-task owner proof remain #566-owned; parallel canonical changes correctly
blocked the first output-loss replay as source-stale. This does not establish
recovery of the original failed operation, business acceptance or release proof.

After the final Guru canonical freeze, the equivalent original-writer tools
fixture completed its full paired tools test (1 test, 64.751 seconds). This
includes success-before-exit target-native validation, exact same-ref/output-loss
recovery, real tools-only preset reapply and recursive original Task/session,
common-control and peer byte/mode preservation. The source-loaded target resolver
uses its primary checkout-local override; an isolated in-memory current public
operation proves target API capability without creating or migrating a Task.
The maintained external candidate.json now records this bounded paired tools
proof. Selected Task conversion/history/next Guru owner checks remain owned by
#566. The original failed candidate/ref remain blocked and untouched; this
successful equivalent instance does not turn them into a recovered operation.

## Final delivery quality refresh

An independent review reproduced one normal sequential closeout defect using
the actual v0.6.17 `task.py start` and built public maintenance SDK: a second
session created after preparation survived the original retirement list while
apply and recovery reported success. Closeout now freshly checks attributable
same-Task carriers before writes and result recovery. An unreviewed carrier
returns `stale_source`; it is never automatically enrolled. Already-retired
original carriers remain valid for same-operation recovery. The regression also
exercises an ordinary removal failure, a new native selection during partial
retirement, rejection without further writes, and successful original-operation
resume after normal native deselection.

The independent public-SDK reproduction after rebuilding confirmed zero target
byte/mode changes and no recovery-state creation on stale apply; a fresh plan
completed, the old native query returned no selection with `stale: false`, and
completed-result recovery succeeded. No remaining accepted-scope finding was
reported. This is upstream maintenance proof, not business acceptance.

Fresh checks for delivery preparation:

- Core full suite: 28 files, 479 passed and 1 existing skipped.
- First CLI full run: 2319 passed and 3 failures caused by test/subprocess
  timeouts. The exact affected cases passed in isolation (4 matching cases).
  After the closeout fix, the complete CLI suite with `--maxWorkers=1` passed:
  104 files, 2324 tests, zero failures.
- The commit hook's formatter required four CLI source files to be formatted.
  Their normalized TypeScript syntax trees were unchanged. After formatting,
  build, whole-repository lint, both package typechecks, Prettier checking and
  the affected maintenance tasks/engine suite (23/23) passed again.
- Python type checking: zero errors and 48 existing warnings. Python 3.9.6
  compiled the 78 repository/all-shipped-template Python files without writing
  bytecode; the repository/shipped script twins remain byte-identical.
- One focused development run overlapped a build and correctly rejected its
  changing candidate as `candidate_mismatch`; the complete focused set was
  rerun successfully after source/build freeze. That interrupted run is not
  passing evidence.

The newly packed CLI/Core pair was installed into another isolated npm project
with scripts disabled. Its actual public bin `maintain contract --json`, CLI
root `maintenance` namespace and Core `/task/maintenance` exports passed.
CLI tar SHA-256 is
`8ac0af26090b2b2313deb7a179b3a73115c7be765e45f73b8bb361cd098d86f8`;
Core tar SHA-256 remains
`036e895a4f088cc48e90f01cde0b8db91379ffb105f4dd3f135c909d39601496`.
Earlier tar identities retain their original evidence scope.

Guru #566 has since completed its own delivery/closure (paired PR #568); its
durable test contribution owns the later selected-Task/history/next-owner
joint evidence. This does not adopt a formal Guru source lock or complete the
upstream Git delivery. Task #40 remains in progress pending its independent
commit/PR/merge and native wrap-up. Business installations, software release
and the complete release-platform matrix remain outside this quality refresh.

## PR #41 cold-cache follow-up

The first delivery commit is `7fcbe647e1079bd8767a3a8de9f5578d5f47c893`.
Its [CI run](https://github.com/castbox/Trellis/actions/runs/38836372092)
passed Core (479 passed, 1 skipped) but failed two CLI tests with
`candidate_mismatch` (2322 passed, 2 failed). These were not timeouts.
The CI log did not capture file-level package changes, so it does not directly
identify which cache files changed in that run.

An independent isolated copy of the reviewed installed CLI/Core pair reproduced
the mechanism through its public SDK: cold prepare, then an ordinary Python
import of shipped `common.workflow_phase`, added eight `__pycache__/*.pyc`
files without changing any authoritative content or mode. Apply rejected the
candidate before target writes or recovery-state creation. Warm reprepare
passed; a separate cold copy using `-B` for that import also passed. These are
causal/counterfactual observations, not a bytecode-disable workaround. The
macOS system Python's external cache prefix and warm caches can mask the bug.

The bounded fix excludes only Python runtime cache directories and `.pyc/.pyo`
files from package fingerprints. Durable package/source/build bytes and modes
remain bound. A new isolated real-bin regression creates caches through actual
Python imports/compilation, executes and recovers the original plan, then proves
that real build-file byte changes and POSIX permission changes still reject
before writes. Windows retains the byte-change check without assuming POSIX
execute-bit behavior. No CI, environment or parallelism change implements the
fix. Spec and design now state the durable package-inventory boundary.

On the revised local candidate, build, full lint, both package typechecks,
targeted ESLint/Prettier and public/tools/engine tests (23/23) passed. After the
Windows-only assertion adjustment, public API tests passed again (4/4).
The original pre-commit script then passed with `VITEST_MAX_WORKERS=2`:
Core 28 files / 479 passed / 1 existing skipped; CLI 104 files / 2325 passed,
zero failures. Independent increment review has no remaining finding.

The revised exact pair was freshly packed and installed with scripts disabled;
actual public bin/SDK imports passed and neither archive contains bytecode or
sidecars. CLI tar SHA-256 is
`bf10061b73f68270a15eb5824e67abd4f146c87658afa58de986106778f4cec4`;
Core remains
`036e895a4f088cc48e90f01cde0b8db91379ffb105f4dd3f135c909d39601496`.
Earlier validation remains bound to its original candidate. The revised code
still needs its own commit/publication and fresh CI before merge; this local
result does not turn the failed PR CI into a pass or advance Guru source lock,
Issue closure, business acceptance or release readiness.

## Final upstream acceptance and delivery

The complete upstream R1-R12 / A1-A9 scope is accepted based on the targeted
maintenance/native/packed evidence above, the full independent branch review,
and the final exact-candidate CI. PR #41 merged into main as
`a57f2f915beade1b2d8db712815949c61b46dd1a`; its reviewed head is
`fa3fa1e78df8518e7a160e2b92315773e493a6e9`.
CI run 38838075120 passed: Core 479 passed / 1 existing skipped, CLI 2325 passed,
plus syntax/type/lint/build and build-output checks. This supersedes the
pre-publication status statements above, not their original evidence identities.

Guru #566 / PR #568 owns the separately reported joint evidence on its original
candidate. Formal Guru source-lock adoption, real business installation/migration
and acceptance, software publication and the complete release-platform matrix
remain outside this upstream Task. This closeout does not upgrade or clean any
business installation or remove branches/worktrees.
