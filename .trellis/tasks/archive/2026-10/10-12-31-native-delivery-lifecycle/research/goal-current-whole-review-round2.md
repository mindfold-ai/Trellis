# Whole-current-scope review, round 2

## Verdict

**Not a clean whole-Issue round; clean-round streak remains 0/2.**
The source and installed candidate close the actionable F1/F4/F5/F6 and
bootstrap-guidance defects from round 1. No additional actionable product
defect was confirmed during this round. F2's remaining global current-SDK and
normal legacy retirement is still unimplemented accepted work; F3's exact-pair
joint evidence is still missing. Neither is relabeled as a regression, waived,
or passed because the independently deliverable upstream slice is green.

The corrected upstream candidate is suitable to continue its own commit and
delivery preparation, subject to the main owner's normal exact-range gates and
authority. This report is quality evidence only: it records no Check/Review,
readiness, Delivery, Task Completion, Closure, archive or cleanup result.
No Guru #531 reads, polls or messages were performed during this round.

## Exact scope and candidate

Accepted Task: `.trellis/tasks/10-12-31-native-delivery-lifecycle`, TaskId
`31-native-delivery-lifecycle`, generation 0, retained legacy task. Review
covers the cumulative baseline
`5c760463680ffc10a3f26957b330c57a4b0c3ff8` through HEAD
`a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2`, branch
`codex/31-native-delivery-lifecycle`, plus all related dirty/untracked source,
tests, specs, planning and evidence. The changed/untracked inventory has 264
paths before this report: all product/code/test/spec/carrier paths are in the
source manifest; excluded paths are Task research evidence and its retained
task.json, not an unreviewed product surface. Evidence is inspected separately.

Live #31 was refreshed read-only to `/tmp/trellis31-round2-live-issue.json`:
OPEN, zero comments, updated `2026-10-12T08:36:24Z`. The full Issue, accepted
R1–R12/AC1–AC12, current design/implementation plan and applicable package,
lifecycle, workflow, migration, filesystem, Python, platform and test specs
remain the review authority. Root planning is quality context for this retained
legacy Task, never replacement formal Delivery planning.

Frozen candidate:
`/tmp/trellis31-goal-candidate-nfa57d6g/candidate.json`.

| Identity | Value |
| --- | --- |
| Source bytes/mode manifest | `b75fb6acc04e7f7309dd590175a7f1209de05b1812a319b636f0c0a54073ac77` |
| Package version, CLI and Core | `0.7.0-castbox.3` |
| Delivery API / Task schema | `1.0` / `2.0` |
| CLI tar SHA-256 | `7ee5e7c88d9dc422686cc8ffcc138d44ec58b7f7da187dafd6ccc4108059e1d5` |
| Core tar SHA-256 | `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967` |

Reviewer independently compared all 1,156 manifest entries with current source
bytes/full permission modes: zero drift. Both actual tar hashes match. Every
regular tar member matches installed bytes and modes: CLI 713, Core 270.
Evidence: `/tmp/trellis31-round2-candidate-verification.json`.
Compared with the earlier 6905 source manifest, 23 paths change, covering the
native default, Task creation/selection guidance, Linear hook, receipts, tests,
durable specs and accepted plan refinements. Core source and tar remain unchanged.

The tar-to-install equality is not incorrectly described as workspace-dist
mode equality: npm packaging normalizes `scripts/task.py` and
`scripts/common/cli_adapter.py` from workspace 0755 to installed 0644, while
their bytes match. Packaged package.json and LICENSE are normal packaging
outputs. Installed template writers set executable script modes; actual
installed Python entry invocation passed.

## Findings closed by this candidate

### F1: schema2 creation directed users to root Planning

Canonical and dogfood `common/task_store.py` now select schema from the actual
validated installed workflow declaration when the flag is omitted. Explicit
schema mismatches, malformed/unsupported declarations and unreadable workflow
content fail before creation/session writes. Prospective workflow.md.new is
not authority. Creation remains Task-only: null accepted_scope, no Delivery,
no gate or Completion result. Root PRD/next steps identify whole-Task scope,
declared owners and the exact Delivery planning_root; Task start is selection.

Independent source tests and actual installed default creation/start verify
the generated PRD/output, aggregate bytes and no_current_delivery query. F1 is
closed for the candidate; named undeclared legacy compatibility stays explicit.

### F4: optional Linear hook crossed schema2 boundaries

The two hook copies now use canonical validated Task reads, runtime checks and
protected atomic metadata writes. Parent resolution uses common validated
metadata/path helpers. Schema2 start returns before status or description calls.
Direct archive requires matching current Completion through the existing
inventory projection; it is not another Completion recorder. Legacy execution
under a declared schema2 runtime fails before calls; undeclared legacy behavior
remains compatible. Normal Task archive already has Completion/Closure guards.

The reviewer reran the exact earlier fake-client harness, yielding seven correct
scenarios: configured Task start and manual start each zero calls; absent,
old-generation and stale-scope Completion each exit 1/zero calls; matching
Completion yields one Done projection; invalid Task create exits 1/zero calls
and preserves bytes. Source probe evidence:
`/tmp/trellis31-round2-linear-source-probe.log` and
`/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis31-round1-linear-hfyqe0wx/report.json`.

Actual installed evidence additionally verifies metadata linking preserves
domain fields and file mode:
`/private/tmp/trellis31-installed-linear-7gqtt7mp/result.json`, eight scenarios.
All client calls are fake; matching Completion is a fixture for the objective
guard, not a new semantic Completion or real Linear service proof. F4 is closed.

### F5/F6: retained raw workflow and original receipt

No-explicit reinit passes preserveExistingWorkflow to the actual writer, skipping
both writing and Python-literal rendering. Init retains the exact original
workflow receipt after recursive hash initialization; custom absence stays
absent. This preserves local edited bytes/mode and their modification baseline.
An explicit bundled selection alone can transfer ownership. Missing installed
workflow does not silently become fresh default authority.

Reviewer reran the same previously red temporary source probe:
`/tmp/trellis31-native-source-probe-tykazr9y/native-review.test.ts`.
Managed legacy, managed native and custom all pass ordinary, force,
skip-existing and empty-Task recovery with exact bytes/mode/hash checks:
3/3 passed, 19 unrelated inherited cases intentionally unselected.
Log: `/tmp/trellis31-round2-raw-workflow-source-probe.log`.
The committed test changes also verify subsequent update still detects edits.

Actual installed CLI default/explicit-legacy scenarios cover the same raw
Python text, changed Python command, modes, exact receipt and later update:
`/private/tmp/trellis31-installed-defaults-XcXv50/result.json`.
Custom install/reinit/recovery/transfer observations are independently labeled
at `/private/tmp/trellis31-closeout-installed-custom-ytk4il/result.json` (7).
F5 and F6 are closed. No general hash-system redesign was introduced.

### Bootstrap guidance gap

Schema2 generated bootstrap PRD now describes whole Task requirements, exact
Delivery plans/manifests, declared Check/full Review/readiness/delivery owners,
independent Completion and Closure, and finish as selection release only.
Custom declaration never receives hard-coded native approval/creation.
Actual bundled onboarding creates only its declared bootstrap scope and a
planning-phase manual Delivery, with all formal gate slots null; custom/native-
identical content remains Task-only unless ownership is explicitly transferred.
Source regressions and actual installed fresh/native/custom PRDs support closure
of this gap. Retained native histories were not rewritten to use the new prose.

## Remaining accepted work and evidence

### F2, P1: global current SDK and normal legacy retirement remains pending

The independently usable fresh-default slice is now implemented and validated.
It does not perform full P4. `packages/core/src/task/index.ts:6` still exports
the legacy record API and `:33` exports TrellisTaskPhase/inferTaskPhase.
`task/schema.ts:24` requires status; `:30/:34` retain completedAt/commit, and
the factory at `:246` defaults to planning. Ordinary `/task` still points to
that namespace in package.json. Explicit native compatibility and undeclared
legacy execution remain alive. The v2 metadata reuse seam itself remains valid;
it is not an additional product defect or a reason for a speculative refactor.

Design section 8 and implement P4 explicitly keep destructive global retirement
behind actual matching-consumer/migration readiness. Their unchecked work is
honest evidence of scope not yet implemented. Do not flip the SDK without the
accepted gate, silently widen this review into Guru implementation, or claim
R9/R11 retirement because a new project defaults to schema2. The upstream
candidate can proceed independently; the complete accepted goal cannot pass.

### F3, P1 evidence gap: matching final upstream/Guru record absent

No supplied evidence names this b75 final candidate/API and an actual matching
Guru candidate with its installed semantic/migration outcomes. The 077 handoff
is historical and cannot stand in for b75. Generic mapping fixtures/custom
owner routing are public interface proof, not actual Guru #149/#444/#155
installed semantics or private Publish/Merge recovery. AC12 remains incomplete.

Per the user's upstream-first instruction, this reviewer neither contacts nor
waits for #531. Its owner boundary and accepted evidence requirement remain
visible. No original business session recovery, remote merge success or release
matrix is claimed. These are external pending obligations, not a new source bug.

## Whole requirement matrix

| Requirement | Complete current-source/evidence assessment | Whole-scope verdict |
| --- | --- | --- |
| R1 | Closed Task/Delivery keys, slice planning roots and retained D1/D2 identity; corrected creator/bootstrap instructions; relocation retains results | Native supported; no new defect |
| R2 | Native closed owner/phase chain, manual/local profiles; fresh default now adopts it; custom declarations preserve owners | Native supported; paired owner evidence F3 pending |
| R3 | Exact nullable session query, platform continuity and cross-worktree resolution; no inference or reader writes; Task start leaves phase/Linear unchanged | Upstream supported; normal legacy retirement F2 remains |
| R4 | Candidate/gate applicability distinct; Check/full Review/readiness separate; quality has no lifecycle authority, read-only Review carrier has no writer | Upstream supported; actual Guru discovery F3 pending |
| R5 | Same-Delivery rework, clean integrated candidate, producer-specific idempotence/historical fact recovery without fabricated gates | Native/interface supported; actual Guru remote transaction F3 pending |
| R6 | Whole withdrawal stopped, same identity/history and released binding; partial scope returns to proper owner | Observed native; no new defect |
| R7 | Independent whole-scope evidence-only Completion; unallocated evidence blocks known delivered slices; Closure/archive/cleanup separate; Linear consumes current Completion | Observed native and objective guard; no new defect |
| R8 | Explicit generation reopen and exact recovery; old results retained, old Closure not reused; history readers distinct from execution | Observed native; no new defect |
| R9 | Explicit plan1/plan2 migration, reviewed active/archive/session/resource dispositions, no-write stale preview/replay/rollback, inventory/carrier preparation | Upstream migration supported; global normal consumer/SDK retirement F2 incomplete |
| R10 | Real Git-free manual and immutable local commit facts; bounded PR profile and task-free boundary, no Guru policy imposed upstream | Native/interface supported; actual Guru PR profile F3 pending |
| R11 | API1/schema2 declaration, mapping fixtures/version preflight, single authority, exact receipts; finite retirement conditions stated | Contract supported; full retirement and joint consumer evidence F2/F3 pending |
| R12 | Candidate-bound packaged defaults/custom/migration/reapply, registry22 installed assets, executable hook/JS/extension regressions | Scoped upstream supported; joint F3 pending, external hosts explicitly unverified |

## Whole acceptance matrix

| AC | Actual evidence and practical limit | Verdict |
| --- | --- | --- |
| AC1 | Fresh no-flag installed native schema2 bootstrap and ordinary Task-only Python create/start now agree; retained native lifecycle/Core/Python verified | Native upstream demonstrated; whole SDK cutover F2 pending |
| AC2 | Retained Task has D1/D2 real manual outcomes with different IDs/plans and same owner chain; actual immutable local commit sample separate | Native demonstrated; paired Guru sample F3 pending |
| AC3 | Same D1 solution/authority rework; D3 whole withdrawal stopped; current-scope Completion and owner-qualified partial return | Supported native |
| AC4 | Actual base-integrated clean HEAD and full intended range previously checked/reviewed without another commit; frozen unchanged Core code and real commit refs verified | Supported native with original execution provenance |
| AC5 | Original local producer recovery retains real commit/result despite stale gates; objective PR simulations require zero mutation | Native/interface demonstrated; actual Guru remote recovery F3 pending |
| AC6 | Exact noDelivery quality/scope/Completion/reopen routes and stale fail-closed context; registered worktrees and actual native read-only query | Native supported; #149/#155-shaped Guru semantics F3 pending |
| AC7 | Actual missing unallocated evidence yields pending despite delivered slices; later evidence-only Completion; Closure separate and failed cleanup preserves result | Observed native; Linear matching/current guards also verified |
| AC8 | g0 history survives moves/archive/reopen, g1 validation-only Completion uses applicable history and does not reuse g0 Closure | Observed native; no new invocation relabeling |
| AC9 | Actual packaged old native/custom copies: no-write preview/stale failure, projected history/session/modes, replay, third-state refusal, exact rollback and reapply | Representative upstream demonstrated; Guru private migration F3 pending |
| AC10 | Native real manual/local outcomes; custom owner declaration/quality/formal/task-free code and executable routing regressions | Upstream demonstrated; actual Guru installed chain F3 pending |
| AC11 | Installed registry22/1189 platform assets, runtime queries and reapply; shared hook/JS/extension regressions; repaired defaults/workflow bytes/receipts | Scoped upstream demonstrated; actual external host execution unverified |
| AC12 | No actual matching b75/API1/schema2 plus Guru candidate joint record; original business session recovery remains unclaimed | Incomplete F3 |

## Verification and provenance

Reviewer independently ran source-focused fixes: 5 files, 76/76 passed,
`/tmp/trellis31-round2-fix-source-tests.log`; unchanged old raw workflow probe
3/3 passed; unchanged Linear controlled harness seven correct outcomes; full
git diff --check passed. Canonical/dogfood affected scripts match. Source,
tarball and installed manifest checks are described above.

Main's complete current-source logs were inspected, not unnecessarily repeated:

- CLI full: 99 files, 2,169 passed,
  `/tmp/trellis31-current-cli-full-final.log`.
- Core full: 27 files, 475 passed; one existing optional SQLite test skipped,
  `/tmp/trellis31-current-core-full.log`. The skip is not a pass.
- Both package lint: pass, `/tmp/trellis31-current-lint-final.log`.
- Root typecheck path: pass, `/tmp/trellis31-current-root-typecheck.log`.
- Full configured Python 3.9 check: 0 errors, 48 existing unused-import
  warnings, `/tmp/trellis31-current-python-full.log`.

The initial full CLI attempt had one partial-mock omission and timeout failures;
the mock was corrected without weakening assertions. Targeted timeout cases
were rerun under lower concurrency, then the entire current suite passed with
maxWorkers 2. Neither a timeout nor its retry alone is counted as full success.

Candidate-bound installed evidence index:
`/tmp/trellis31-current-upstream-evidence.json`. Its underlying result/log
records were inspected for actual observation boundaries:

| Evidence | Actual observation |
| --- | --- |
| `...installed-defaults-XcXv50/result.json` | Real CLI/bin and installed Python default/explicit legacy, guidance, selection and raw workflow/receipt/later-update behavior |
| `...installed-linear-7gqtt7mp/result.json` | Eight fake-client guard/link scenarios, preserved Task domain and mode; no external Linear |
| `...installed-custom-ytk4il/result.json` | Seven fresh/custom/retained/native-transfer bootstrap ownership scenarios |
| `/private/tmp/trellis31-migration-prunable-lh5h3y4v/report.json` | Prunable stale sibling excluded; unchanged same preview; extant dangling .git still fails strict inventory without writes |
| `/tmp/trellis31-current-installed-oldcopy.json` | Candidate/package/plan-pinned native old copy dry-run, stale refusal, actual migration/replay, third-state refusal, rollback/reapply |
| `/tmp/trellis31-current-installed-custom-migration.json` | Actual legacy copy to custom schema2 owners, frozen plan, no-write/replay and absent receipt across normal/forced reapply |
| `...installed-native-8bYo7Y/result.json` | New package reapply/read-only query preserves old native Task histories, creates no new semantic facts |
| `/tmp/trellis31-current-installed-platforms.json` | Registry-derived 22 platforms, 1,189 installed assets/receipts, init/reapply/shared runtime query; external hosts unverified |

The ellipsized table paths above have exact directory roots in their detailed
finding sections and the evidence index; they are not separate artifacts.

Reviewer used the new installed Core read-only against both actual retained
native Tasks, verified 29 Git-free and 12 local-Git authority/plan/evidence/
manual-artifact refs, and verified the immutable actual local commit. Evidence:
`/tmp/trellis31-round2-native-readonly.mjs` and
`/tmp/trellis31-round2-native-readonly-result.json`.
Both aggregate hashes remain byte-identical:
`b44ca5d6aa7ab0293ca7d811eaabc3d291b2a00dc9824d62d6bbd4877097634c`
and `fc52d942a11b78cf0a840125c29cc60b2e026cad746eec2d0ac4eda67da9fda8`.
Git-free retains two g0 delivered slices, one g0 stopped slice, g0/g1 Completion
and only g0 Closure. Local Git retains one delivered slice, no Completion or
Closure. Queries return exact no_current_delivery for both current Tasks.

Original native AI-owner semantic invocations are attributed to candidate
`85c2ec9171053563cbff01ed4402a73c8eb6528208595fb1333014cdbd01979f`
and its later 077 package evidence. New b75 reapply/read-only verification
does not relabel them as newly executed Planning, Check, full Review, Delivery,
Completion or Closure. Unchanged Core bytes and verified retained refs support
continued upstream behavior; they do not manufacture joint final-candidate proof.

## Required continuation

Proceed with this upstream candidate's own authorized exact-range commit and
delivery workflow. Keep F2/P4 retirement and F3/P5 exact paired evidence visible
as remaining accepted scope. Do not wait for another Issue to close, but do
not close #31 or mark the whole review goal complete on this slice's behalf.
After any source/planning/candidate change, refresh the candidate and review
against its actual identity; after evidence-only arrival, reassess the unchanged
whole scope without inventing another Delivery or commit. Two consecutive
whole-scope clean rounds are still required and have not occurred.

## Correction appendix — F7/F8: current public rollout wording was missed

The supervising owner subsequently confirmed a current public-document defect
missed by this round. The earlier statement that no additional actionable
product defect was confirmed must **not** be read as a clean b75 documentation
verdict. This appendix corrects that conclusion without rewriting the b75 source,
package or installed evidence above. The whole-scope streak was already 0/2 and
remains 0/2.

### F7 — P2: shipped public contract contradicts implemented rollout

At b75, `packages/cli/src/templates/trellis/delivery-contract.md:10–18` and its
dogfood twin say the interface is opt-in, the default workflow is legacy and
"D2 will provide reviewed migration and default cutover." This is current
public authority, not an immutable historical D1 report. Fresh no-flag native
initialization and reviewed plan-2.0 migration are implemented in the very
candidate that ships those statements.

Reviewer independently reread the installed b75 contract at
`/tmp/trellis31-goal-candidate-nfa57d6g/installed/node_modules/@mindfoldhq/trellis/dist/templates/trellis/delivery-contract.md`:
the conflicting text is actually shipped. Its existence does not invalidate
the objective test/byte/installation observations, but b75 is not a final
documentation-complete upstream candidate.

Minimum correction: state fresh no-flag native-delivery-v1/schema2/API1,
preserved existing workflow/ownership, explicit native legacy compatibility,
available caller-reviewed plan2 preview/backup/resume/rollback, and continued
current `/task`/unmigrated legacy authority during the finite global-retirement
window. Preserve single authority and required matching-consumer/joint gates;
init/update/readers must still never implicitly migrate. Main has dispatched
the original owner to synchronize the two Markdown copies. Their correction
requires a new frozen packaged candidate; it cannot be attributed retroactively
to the b75 artifact.

### F8 — P2/P3: installed active workflow and current supporting descriptions

The follow-up reviewer search found the same rollout drift at
`packages/cli/src/templates/trellis/workflow-delivery-v1.md:1–6`: title
"opt-in API 1.0", "D1 opt-in workflow", and "Default native stays on the
legacy contract." This body becomes the actual active workflow in a fresh
default install and incorrectly tells its reader what that installation did.
The installed b75 workflow at the corresponding `dist/templates/trellis/`
path independently confirms the text. Correct the current default narrative;
retain explicit legacy selection and reviewed old-Task migration requirements.

Supporting current prose should be synchronized without changing behavior:

- `.trellis/spec/cli/backend/commands-workflow.md:162–165` still calls the
  current bundled Delivery source opt-in, despite its required-built-in section
  already identifying the fresh default.
- `.trellis/spec/cli/backend/workflow-state-contract.md:3–5` presents schema2
  only as opt-in. Describe retained legacy compatibility and declared schema2,
  including the fresh default, instead.
- `delivery.py:2` canonical/dogfood docstrings still call the current API opt-in.
  Its actual argparse help already correctly says "Explicit Delivery API 1.0";
  this is source-description drift, not an observed help/runtime failure.
- `workflow-resolver.ts:34–41` says every ID other than native is user-managed,
  while `isBundledWorkflow` correctly treats native-delivery-v1 as managed too.
  Clarify both bundled identities; preserve the correct ownership implementation.

These were sent to main for the existing owner's bounded wording correction.
This reviewer edited only the designated report and temporary verification
artifacts, not source/spec/template files. The current CLI init/workflow help,
Python creation help and Delivery argparse description already agree with the
implemented default/declaration behavior; no additional executable help defect
was confirmed.

The expanded search covers current public contract/workflow, source docstrings,
resolver/install help, common and platform command/agent/Skill templates,
relevant durable specs and SDK descriptions. Historical D1 task planning/research
records are immutable provenance, not current rollout authority. The SDK spec's
legacy `/task` pinned migration window and future global retirement are still
accurate. Statements that selection does not migrate, the dogfood Task remains
legacy, old installations require reviewed migration, or final consumer cutover
is pending must not be rewritten into false completion. Unrelated channel/status-
line opt-ins are outside this defect. No other confirmed rollout contradiction
was found in this scan beyond the listed correction set.

F2/F3 remain unwaived accepted scope. Main will freeze/repack after wording
stabilizes and verify the actual packaged text. Existing implementation test
evidence may be inherited only with explicit unchanged implementation/test-byte
proof; current public/workflow text must receive fresh review and installed
validation. This correction is not another clean round or lifecycle result.
