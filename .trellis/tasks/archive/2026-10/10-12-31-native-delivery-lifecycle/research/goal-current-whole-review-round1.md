# Current whole-Task review — round 1

Date: 2026-10-13. Profile: independent quality / whole accepted Task scope;
not a formal Delivery gate. Verdict: **not clean; complete-goal count 0/2**.

## Reviewed identity and scope

Live `castbox/Trellis#31` is OPEN with zero comments. The complete live body
was reread and retained in `/tmp/trellis31-current-whole-live-issue.json`.
The exact accepted Task is `.trellis/tasks/10-12-31-native-delivery-lifecycle`,
TaskId `31-native-delivery-lifecycle`, generation 0, legacy `in_progress`.
The current continuation resolves normally and grants no schema-2 lifecycle
writer for this source Task.

Review range: baseline `5c760463680ffc10a3f26957b330c57a4b0c3ff8` to branch
HEAD `a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2`, plus the related working-tree
and untracked implementation, tests, specs, planning and evidence. This is a
whole-scope review, not an assessment of the latest patch or commit alone.
Scope includes Core, Python/template twins, CLI defaults and migration,
workflow/Skill/agent ownership, actual platform collectors and native evidence.
No Guru tree, business tree, gitlink, session binding or lifecycle record was
modified by this reviewer.

Product candidate at entry: source
`6905b5e050e963692b246c3b947a8c772426e0aef3b8a583834ea23a261e6b5d`, manifest
`/tmp/trellis31-goal-candidate-h_q0dl1k/candidate.json`, API 1.0 / schema 2.0,
CLI and Core package version `0.7.0-castbox.3`. Independently compared all
1,154 manifest paths and modes with the working tree: only `design.md` and
`implement.md` had already changed when the comparison ran; product source,
tests, specs and carriers matched. Thus this review covers frozen 6905 product
with live revised planning; it does not assert the whole working-tree snapshot
still equals 6905. The main owner subsequently dispatched the new-native
default correction. Its new source is outside this frozen round and requires
fresh verification/candidate evidence. A changing candidate cannot earn a
clean round.

CLI tar SHA:
`ca87a98dfaf4a511cbb77081c54fd7853fe67fb8dead2a9ca613f0f651fe606b`.
Core tar SHA:
`45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
Prior reports were used as evidence indexes, not as automatic no-finding
conclusions. Primary code paths, live defaults, actual retained records,
owner observations and current package queries were inspected independently.

## Findings — product defect, not fixed here

### F1 — schema-2 create still instructs Task-root Planning

Severity: P2. Frozen canonical source:
`packages/cli/src/templates/trellis/scripts/common/task_store.py:313-335` and
the unconditional next-step output beginning at line 729; owned dogfood twin
has the same content. `_default_prd_content` is used for both schemas, and
successful explicit schema-2 creation writes a root PRD instructing users to
put `design.md` and `implement.md` beside it before `task.py start`. The
command's next steps repeat the same Task activation/Planning sequence.

Actual installed reproduction uses 6905, not the changing source tree:
`/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis31-round1-installed-default-qx0dkxu4/explicit-v2-create-guidance.json`.
`task.py create ... --schema-version 2.0` exits 0, creates a schema-2 Task,
and emits that legacy guidance. This is inconsistent with R1/R2/R3/R9,
design 2.3/3.2 and the active schema-2 workflow, where root PRD owns overall
scope and each Delivery owns the only Planning entry. Task selection cannot
stand in for Planning acceptance.

Recommended correction: schema-2 skeleton/output describes whole Task scope,
explicit accepted authority, creation/selection of a real Delivery before its
Planning, Delivery-local artifacts, and Task start as binding only. Preserve
legacy wording for the explicitly retained legacy installation contract.
This is a semantic user-flow change in the implementation owner's files, so
the read-only reviewer did not edit it. Main was notified with the exact
installed reproduction and included the touchpoint in its implementation
handoff. Closing F1 requires a source regression and actual corrected-package
observation, not just a prose note in this report.

## Findings — incomplete accepted requirements

### F2 — normal default and current SDK retirement remain incomplete

Severity: P1 for complete #31 acceptance. This is remaining implementation,
not an accidental second writer on an already selected schema-2 Task.

Live/frozen anchors:

- `packages/core/src/task/index.ts:33-34` still exports `TrellisTaskPhase` and
  `inferTaskPhase`; `phase.ts` derives development phase from Task status.
- `packages/core/src/task/schema.ts:24,30,34` requires Task `status`,
  `completedAt`, `commit` and `pr_url`; the current factory still writes
  `status: "planning"` at line 246. Current `/task` has not become schema 2.
- `packages/core/src/task/v2/types.ts:1,76`, `v2/operations.ts:1,6-8` and
  `v2/schema.ts:1,95-96` still reuse the legacy metadata type/factory/parser
  by omitting or injecting old lifecycle fields. This does not presently
  write legacy authority through v2, but final retirement must separate the
  unchanged metadata boundary from the retired lifecycle implementation.
- `packages/cli/src/commands/init.ts:978-989` defaults to `native`, resolving
  the bundled legacy workflow. Its bootstrap is legacy `in_progress`.
- Frozen Python `task.py` argparse defaults creation to `legacy`;
  `common/task_store.py:347-356` rejects a no-schema create even under an
  actual declared schema-2 workflow.
- Ordinary undeclared legacy readers/writers, hook status routes and bundled
  meta guidance remain deliberately active during compatibility. Their
  inventory is `research/goal-p4-retirement-inventory.md`; broad `status`
  matches alone are not defects. Historical transcript readers and the
  explicit `/task/legacy-migration` endpoint must stay distinguishable from
  ordinary execution authority.

Independent installed observation:
`/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis31-round1-installed-default-qx0dkxu4/report.json`.
6905 no-flag `init --yes --codex` exits 0 with legacy `in_progress` bootstrap;
ordinary Task create exits 0 with legacy `planning`. Explicit
`native-delivery-v1` init creates schema 2, but an otherwise valid no-schema
Task create exits 1 with `incompatible_task_schema`. These results are exact
installed behavior, not just string-search evidence.

A safe independent correction is available now: fresh no-flag native install
can select the complete Delivery workflow; omitted creation schema can follow
the actual validated installed workflow declaration. Existing no-explicit-
workflow reinit must preserve actual native/legacy/custom bytes and receipt
ownership, including forced and empty-task recovery paths. Explicit
schema/declaration mismatch, malformed/unsupported declaration and API errors
must still refuse before writes. Custom schema-2 ownership selects data
format only; it does not accept bootstrap scope, choose a profile or create a
Delivery. An explicitly retained legacy workflow entry needs clear finite
compatibility wording. This split introduces no second authority for one Task.

The accepted design permits new native installation before Guru integration,
while global removal of old execution/current SDK APIs retains its actual
matching-consumer readiness condition. Main updated design 8.1/implement P4
and assigned the new-native correction; that action does not complete all of
P4 or authorize destructive legacy retirement. Current `/task` export/schema
switch, all remaining normal consumers and public breaking guidance still
require the accepted retirement boundary. No user authorization to waive it
was assumed.

The internal v2 metadata seam can technically be prepared without changing
`/task`, but it is not a confirmed current v2 correctness bug or a useful
standalone substitute for retirement. Recommendation: extract the shared
metadata factory/validator as part of actual current-SDK cutover, keeping
explicit legacy migration independent, rather than add an unrelated refactor
merely to advance review count.

### F3 — exact-pair required evidence remains pending

Severity: P1 whole-scope evidence gap. R11/R12 and AC12 explicitly require a
joint record binding the same upstream candidate/API and actual Guru
candidate across native and installed Guru scenarios. The Task's current
implementation plan still marks those P5 obligations pending. No matching
6905 joint result was supplied to this review. The prior candidate handoff is
077, and neither its successful delivery nor private/partial older evidence
can be relabeled 6905 whole-pair acceptance.

This reviewer did not poll, message or run Guru #531, respecting the human's
upstream-first direction. The evidence gap prevents complete #31 acceptance;
it does not prevent the upstream owner from correcting and delivering its
own independently reviewable capability. Later the existing Guru owner
supplies its exact candidate-bound installed D1/D2, rework, clean Review,
Publish/Merge original-producer recovery and closeout evidence. Upstream
references the result without duplicate private gate execution. Neither
Issue CLOSED, a software release nor original business deployment is the
readiness test. Original business sessions remain unclaimed without their
own actual worktree evidence.

## Requirement matrix

“Observed native” below means actual supported upstream behavior at the
recorded candidate/component identities, not all-host AI execution or Guru
semantics. The complete source Issue remains the goal boundary.

| Requirement | Actual code/evidence assessment | Complete-scope status |
| --- | --- | --- |
| R1 | Schema2 closed identities/artifacts; actual native D1/D2 distinct IDs and retained plans; same-D1 revision | Supported native; F1 guidance correction open |
| R2 | Closed phase/role operations, actual native owner gates/manual and local commit; active custom owners preserved | Supported opt-in; default adoption F2 and paired evidence F3 open |
| R3 | Exact current/session resolution, cross-worktree tests, noDelivery quality/Completion/reopen; Task binding does not record Planning | Supported v2; schema2 creator guidance/default F1/F2 open |
| R4 | Candidate/gate/applicability independent, quality/formal/carrier split, complete-range Review/readiness; no quality lifecycle write | Supported upstream; actual Guru discovery evidence F3 pending |
| R5 | Same-ID qualified rework; real base-integrated clean candidate without new commit; original local outcome recovery with stale gates | Supported upstream; actual Guru remote recovery F3 pending |
| R6 | Explicit stopped exit, current owner/scope decision, actual D3 withdrawal and binding release; no fabricated delivery | Observed native |
| R7 | Separate Completion/Closure; unallocated evidence blocks known delivered slices; actual evidence-only completion and real cleanup failure | Observed native |
| R8 | Generation-specific facts, archive/rename/reopen; fresh g1 validation-only Completion and no g0 Closure reuse | Observed native |
| R9 | Reviewed plan2, sessions/archive/metadata/historical facts, actual old-install native/custom migration and replay/rollback | Migration supported; normal consumer/current SDK retirement F2 incomplete |
| R10 | Actual Git-free/manual and local_commit outcomes; PR profile remains separate with objective verifier; task-free/manual boundary | Upstream supported; real Guru PR policy evidence F3 pending |
| R11 | Single API1/schema2 declaration, public fixtures/mappings, preflight, exact raw/session/template obligations and finite window | Interface supported; global retirement/matching consumer/joint F2/F3 pending |
| R12 | Registry22 collectors, actual installed source/receipt assets and representative executable hook/JS/extension evidence; custom bytes/owners retained | Scoped upstream supported; default F2 and paired F3 pending; external hosts explicitly unverified |

## Acceptance matrix

| AC | Concrete observation and implementation | Verdict |
| --- | --- | --- |
| AC1 | Explicit installed native schema2 bootstrap and real native lifecycle agree with Python/Core; no-flag package remains legacy; creator still emits root Planning | Incomplete F1/F2 |
| AC2 | Native retained Task has two real manual outcomes with independent plans/IDs and same gate chain; local real commit profile separately observed | Native demonstrated; paired Guru half F3 pending |
| AC3 | D1 solution/whole authority rework keeps identity; D3 whole withdrawal is stopped; fresh Completion evaluates revised scope; partial rework uses closed operations | Supported native |
| AC4 | Actual real Git integrated clean HEAD `794a215153fcef33a554fe8e9546b69f96f20b38`, original baseline-to-HEAD complete Review and fresh Check without another commit | Supported native; exact original execution provenance retained |
| AC5 | Real local original-producer omitted-projection recovery keeps commit/result; stale gates remain stale; same-PR objective verifier simulations test zero mutations | Native controlled proof; real Guru remote recovery F3 pending |
| AC6 | NoDelivery Task-only quality, evidence-only Completion, archive/noTask/reopen routes; exact invalid/stale resolver tests; independent slices supported | Native supported; Guru #149/#155-shaped installed semantic obligations F3 pending |
| AC7 | Both native outcomes delivered yet missing unallocated V1 yields evidence_pending; read-only V1 refresh creates no Delivery; separate Closure and real failing rmdir retain Completion | Observed native |
| AC8 | Original TaskId retained through relocation/archive/reopen; g0 facts retained, no g1 Delivery/old approval, fresh g1 Completion reuses applicable historical artifacts | Observed native |
| AC9 | Plan2 raw inventory, active/archive facts/session projection, preview/stale zero-write, same-plan replay, third-state refusal and caller-owned exact rollback; custom receipt ownership | Representative upstream old copies demonstrated; private Guru migration F3 pending |
| AC10 | Real manual/Git-free/local_commit semantic owners; formal/quality profile and custom declaration routing tests; custom bootstrap has no native authority | Supported upstream; actual Guru PR/installed owner chain F3 pending |
| AC11 | Registry22 collected assets; actual package native/custom migration/update/reapply; shared-hook/JS/extension executable paths; final custom/prunable repeated probes | Scoped upstream evidence; normal default F2 pending; external AI hosts unverified |
| AC12 | No exact final-candidate/API plus Guru-candidate joint record supplied; old candidate handoff stays historical | Incomplete F3 |

## Independent verification and evidence provenance

This reviewer ran, without build/pack or source edits:

- Core lint: pass, `/tmp/trellis31-round1-core-lint.log`.
- Core typecheck: pass, `/tmp/trellis31-round1-core-type.log`.
- CLI lint: pass, `/tmp/trellis31-round1-cli-lint.log`.
- CLI direct `tsc --noEmit`: pass, `/tmp/trellis31-round1-cli-type.log`.
- `git diff --check`: pass at inspection.
- Installed 6905 defaults and explicit schema2 creator probes: actual exits,
  records and generated guidance retained in the controlled root named above.
- Final installed Core read-only native query:
  `/tmp/trellis31-round1-native-readonly.mjs` and
  `/tmp/trellis31-round1-native-readonly-result.json`. Current authority,
  plan/evidence/manual-artifact refs verified: 29 Git-free and 12 local-Git
  refs; actual immutable local commit verified. Both aggregates remained byte
  identical to independently recorded hashes
  `b44ca5d6aa7ab0293ca7d811eaabc3d291b2a00dc9824d62d6bbd4877097634c` and
  `fc52d942a11b78cf0a840125c29cc60b2e026cad746eec2d0ac4eda67da9fda8`.

Main's recent full logs were read rather than needlessly rerun: CLI 2,128
passed / 97 files; Core 475 passed / one existing optional SQLite skip;
Python 0 errors / 48 existing unused-import warnings. Logs are
`/tmp/trellis31-upstream-closeout-{cli-test,core-test,pyright}.log`.
These full tests originally ran against 99ef. The independently reviewed
6905 packaging delta changes only `dist/cli/index.js.map`; 712 remaining CLI
files and all 270 Core files/modes are identical. The source difference is
the previously verified CLI option whitespace formatting. Runtime-equivalent
evidence remains usable with that disclosed provenance; it is not claimed
as a newly run full suite against changing native-default source.

Actual 6905 package repeated evidence was inspected:
`/private/tmp/trellis31-closeout-installed-custom-4knYrV/result.json`,
`/private/tmp/trellis31-migration-prunable-qc2c2u3c/report.json`, and
`/private/tmp/trellis31-closeout-installed-native-ADhXQL/result.json`.
These close the earlier byte-identical custom bootstrap and prunable
registration defects. The extant dangling `.git` negative control still
refuses. Native reapply preserves historical outcomes without claiming new
semantic gate execution.

Earlier actual native semantic invocations used 85 and then 077. Their
unchanged retained records/refs are verified by the final Core reader above;
their original AI-owner execution is still attributed to those original
candidates. The actual 6905 reapply/read-only observations do not silently
relabel past Planning, Check, full Review, Delivery or Completion calls.
The local Task has no Completion/Closure; only the Git-free Task has g0/g1
Completion and g0 Closure. No actual remote Publish/Merge success is claimed.

## Required next action

Return F1 and the independently actionable new-native portion of F2 to the
main owner's existing implementation worker. After its correction, update
affected durable docs, run meaningful changed-path checks and actual installed
default/custom/legacy-preservation scenarios, freeze a new candidate, and
restart the complete review against it. Keep the remaining current SDK/
normal legacy retirement and exact-pair evidence obligations visible.
Do not perform another nominal “clean” round over unchanged known gaps.
No stage, commit, publish, Task Completion, Issue closure, archive, cleanup or
external message was performed by this reviewer.

## Supplemental F4 — P2: optional Linear hook bypasses schema2 boundaries

This focused follow-up checks the shipped optional hook, not Guru or a real
Linear account. Both copies were identical at inspection:
`.trellis/scripts/hooks/linear_sync.py` and
`packages/cli/src/templates/trellis/scripts/hooks/linear_sync.py`.
The inspected hook SHA-256 is
`29e51e3812065b476e33f9ab97a3830fb98dbd4f49701471fdd5d164234569a7`.

Concrete product findings:

- `cmd_start` at canonical template lines 152–159 unconditionally projects
  Task selection as Linear `In Progress`, then syncs the description. A
  configured `after_start` hook reaches this through the real schema2
  `task.py start` command. Selection is not a lifecycle transition; schema2
  start must perform zero Linear calls, including description synchronization.
- `_read_task` at lines 71–77 and `_write_task` at lines 80–83 use raw JSON
  read/truncating write. An invalid schema2 record containing the forbidden
  legacy `status` field still creates a Linear issue and writes its link.
  Parent lookup at lines 194–215 independently bypasses common validation.
  These paths must use the existing validated common reader and protected
  atomic metadata writer so linking cannot bypass the Task aggregate contract.
- `cmd_archive` at lines 162–168 projects `Done` without checking actual
  current Completion. Direct invocation does so with no Completion, an old
  generation Completion, or a same-generation stale-scope Completion. The
  normal `task.py archive` command already guards Completion/Closure; this
  finding concerns the independently executable hook entry point, not a
  demonstrated bypass of that command's guard.

Controlled executable probe:
`/tmp/trellis31-round1-linear-probe.py`. It copies the scripts into
`/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis31-round1-linear-dd5w_dis`,
sets up a valid schema2 workflow and Task, and substitutes a fake `linearis`
executable that records arguments. Evidence is that root's `report.json`.
No real external calls occurred and product source was not changed.

| Scenario | Exit | Fake Linear calls | Result |
| --- | --- | --- | --- |
| Configured real schema2 `task.py start` | 0 | In Progress + description, 2 | Incorrect selection projection |
| Direct schema2 hook start | 0 | In Progress + description, 2 | Incorrect selection projection |
| Direct archive, no Completion | 0 | Done, 1 | Incorrect completion projection |
| Direct archive, old generation Completion | 0 | Done, 1 | Incorrect completion projection |
| Direct archive, same generation stale scope | 0 | Done, 1 | Incorrect completion projection |
| Direct archive, matching current Completion | 0 | Done, 1 | Positive control |
| Create, invalid schema2 Task | 0 | Create, 1; metadata written | Validation/write boundary bypass |

The six start/archive cases preserve Task bytes; the defect is their external
projection. The invalid-create case changes only metadata but accepts and
rewrites an aggregate the common reader rejects.

Minimum correction scope: the two hook copies plus focused integration
coverage. Schema2 start returns before all Linear calls; linking and parent
reads use common validated IO, and metadata linking uses the existing atomic
protected writer. Schema2 archive consumes
`task_lifecycle_inventory(task).completion_result_id` and sends Done only
when that current scope/generation projection is present. It must not become
another Completion recorder or gate owner. Explicit legacy compatibility
retains its existing start/archive behavior. Main owns durable spec updates
and implementation dispatch. No new Linear client, receipt ledger, or
external verification is required for this local correction.

F4 adds a product correction to R3/R7/R8/R12 and their applicable acceptance
paths. It does not change F1–F3 or waive the remaining accepted retirement
and paired-evidence obligations. This round remains **0/2 clean rounds**;
a new stable candidate must be reviewed after correction.

## Supplemental F5 — owner-reported workflow preservation correction

Main reports that the native-default implementation owner reproduced an
existing workflow byte-preservation failure: Python command literal
replacement changed a pre-existing raw workflow even where reinitialization
must preserve its bytes and ownership. Main reports a correction at the
actual configurator writer using `preserveExistingWorkflow`, with 117/117
focused checks passing. This reviewer has not independently verified that
correction or its installed-package behavior yet; the report is a pending
verification input, not a new pass. Recheck existing legacy/custom/native raw
Python workflow bytes under no-explicit reinitialization, force and empty
recovery against the next frozen candidate. No clean round is counted.

## First-fix source verification and F6 — P2: preserved workflow receipt reset

The native-default owner stopped the initial implementation edits for a
focused source review. This reviewer independently ran 83/83 tests across
`task-create-runtime-default.integration.test.ts`,
`custom-workflow-reinit.integration.test.ts`, and `init.integration.test.ts`.
Log: `/tmp/trellis31-round1-native-fix-source-tests.log`.
The focused fresh-default Delivery authority/reapply case also passed 1/1;
its 16 unselected cases were intentionally skipped, not counted as passes.
Log: `/tmp/trellis31-round1-native-default-authority.log`.

Source inspection confirms the actual installed declaration determines Python
creation format, rejected mismatches fail before writes, schema2 PRD/next-step
guidance points to declared owners and Delivery planning_root, and selection
creates no Delivery. Fresh no-flag init selects Delivery workflow; retained
custom matching bytes alone do not grant native bootstrap scope acceptance.
The configurator skips rewriting retained workflow files. These are source
observations, not newly built or installed package claims.

An independent temporary probe exposed a remaining receipt defect. It uses
the source test's mocked dependency setup in
`/tmp/trellis31-native-source-probe-tykazr9y/native-review.test.ts`, adding
raw `python3` text and mode 0640 to managed legacy/native and custom Delivery
workflows, changing the configured Python command, then exercising implicit
ordinary/force/skip-existing reinit and empty-Task recovery. It compares the
exact existing workflow hash, not merely the presence of ownership.

- Managed legacy and native retain actual workflow bytes/mode but fail at
  implicit `{force: true}` reinit: `initializeHashes` recomputes the stored
  workflow hash from edited local content. Ordinary no-force control passed
  before that failure. Both runs fail on the same receipt assertion; custom
  retains an absent hash and passes all modes including empty-Task recovery.
- Source cause: `init.ts` calls `initializeHashes` after the preserved workflow
  writer is skipped, while `template-hash.ts:395–401` recursively hashes the
  retained file. The resulting hash replaces its previous pristine baseline.
- Consequence is concrete: `update.ts:622–630` classifies a differing workflow
  as automatically replaceable when current bytes match that new stored hash.
  Thus the reinit can turn local workflow edits into an apparent pristine
  template even though the bytes were preserved during reinit itself.
- Minimal correction: capture and restore the exact retained workflow receipt
  after hash initialization (including prior absence for custom ownership),
  with exact-hash and subsequent normal-update regression coverage. Preserve
  existing metadata/mode/bytes; do not redesign the general hash subsystem.

Logs: `/tmp/trellis31-round1-raw-workflow-source-probe.log` and
`/tmp/trellis31-round1-raw-workflow-source-probe-labelled.log`, each reporting
2 failures / 1 pass with 19 inherited unselected tests skipped. The second
log labels the exact failing force invocation. No product source was changed
by this reviewer; the temporary harness adds verification only.

Relevant source hashes at the start of focused verification:

| Path | SHA-256 |
| --- | --- |
| `packages/cli/src/commands/init.ts` | `5bc615b71b576f87903d04d452185737a05edd4c60a93513b31c709ae8ed940f` |
| `packages/cli/src/configurators/workflow.ts` | `029ab8a6432c83806d0c1e4dd34e6e927797dde625ac1c816d3d0a26b00b6335` |
| `packages/cli/src/templates/trellis/scripts/common/task_store.py` | `7edb4a62ca9e48864a70d220def7d9b8228a371dae88e49e6a3b386f5797447a` |
| `packages/cli/src/templates/trellis/scripts/task.py` | `5602e3f1fff5f9debd478860344ab04614626973c8076df29b49848c065c6943` |

At post-probe inspection `init.ts` changed to
`9d9553521f2ecd0b7b0b05e6f503a48324c52f546efbef384228f29c6c07ae60`;
the other three remained identical. Canonical and dogfood Python copies
matched. These changing source snapshots do not establish a stable whole
candidate or installed-package pass. Main has returned F6 to the original
owner and is also refining bootstrap guidance. The reviewer stops further
verification of changing source until combined fixes stabilize and a new
candidate is frozen. **Clean-round count remains 0/2.**
