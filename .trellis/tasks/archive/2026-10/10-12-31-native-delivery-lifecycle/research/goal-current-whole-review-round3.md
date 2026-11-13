# Whole-current-scope review, round 3

## Verdict

**Not a clean whole-Issue round; consecutive clean-round streak remains 0/2.**
At initial report issuance no additional actionable upstream defect was confirmed.
The subsequent normal commit hook exposed F9 test-fixture drift on actual fresh
dist initialization; the correction appendix below supersedes the initial
full-suite sufficiency assessment. F7/F8, missed in round 2 and explicitly corrected in that report's
appendix, are closed by this new source/package candidate. F1/F4/F5/F6 and the
bootstrap-guidance correction remain closed. F2 is remaining accepted global
current-SDK/normal legacy retirement work; F3 is missing exact-pair evidence.
Neither is waived or counted as passing because this upstream slice is green.

The independently deliverable upstream slice supports continuing its own
authorized commit/delivery preparation. This report is default quality evidence,
not formal Check, Review, readiness, Delivery, Task Completion, Closure, archive
or cleanup. The supervising owner records actual lifecycle outcomes. No Guru
#531 read, poll or message was performed. There were no product/spec/planning
edits, builds, packages or commits by this reviewer in this round.

## Exact scope and candidate

Accepted Task: `.trellis/tasks/10-12-31-native-delivery-lifecycle`, retained
legacy TaskId `31-native-delivery-lifecycle`, generation 0. Whole review includes
R1–R12 and AC1–AC12, cumulative baseline
`5c760463680ffc10a3f26957b330c57a4b0c3ff8` through HEAD
`a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2`, branch
`codex/31-native-delivery-lifecycle`, and all related dirty/untracked source,
tests, specs, platform carriers, planning and evidence. No dirty source increment
is hidden behind HEAD. The complete source manifest contains 1,156 paths;
Task research and retained task metadata are reviewed separately as evidence.

Authority is the full #31 source refreshed in round 2
(`/tmp/trellis31-round2-live-issue.json`, OPEN, zero comments, last updated
`2026-10-12T08:36:24Z`), accepted PRD, current design/implement and applicable
package/lifecycle/workflow/migration/filesystem/Python/platform/test specs.
This round reread the accepted scope and current plan corrections; root artifacts
are quality context for this legacy Task, not substitute Delivery planning.

Frozen manifest: `/tmp/trellis31-goal-candidate-ds325ye4/candidate.json`.

| Identity | Value |
| --- | --- |
| Source bytes/mode manifest | `b7364f186e9dec7ff8c2ed6889ed88252ca4b660ac719bbbc640c9ecb7dd6ad9` |
| CLI/Core package version | `0.7.0-castbox.3` |
| Delivery API / Task schema | `1.0` / `2.0` |
| CLI tar SHA-256 | `71ed2484dc4518c7fd19cd353334d90c7fe5a7ae70f6cf75adfb077a1ba21a5f` |
| Core tar SHA-256 | `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967` |

Reviewer independently verified all source bytes/full permission modes, actual
tar hashes, and installed regular-member bytes/modes: 713 CLI and 270 Core
members; zero mismatches. Source was checked again before report writing:
all 1,156 entries unchanged. `git diff --check` passed.
Evidence: `/tmp/trellis31-round3-candidate-verification.json`.

## Findings closed and not fixed

### F7/F8 closed: actual public rollout wording and durable descriptions

The current public contract now describes fresh no-flag native-delivery-v1,
schema2/API1, preservation of installed workflow/ownership on implicit reinit,
explicit native legacy compatibility, available reviewed plan-2 migration and
the still-gated global SDK/legacy retirement. It retains exact-candidate paired
acceptance and separates software publication/release from implementation.

The active workflow's title/opener now describes that same implemented default.
Canonical/dogfood Delivery docstrings, workflow resolver/init comments and the
commands-workflow/workflow-state durable specs agree. Current Skills preserve
owner routing, default quality versus formal work, read-only full Review,
producer-specific recovery and independent Completion/Closure. A focused search
found no remaining current claim that default native is legacy, this workflow
is D1 opt-in only, or D2 migration is still unavailable. Historical D1 planning
and accurate current legacy compatibility/retirement descriptions remain valid.

Reviewer inspected the actual fresh installed files at
`/private/tmp/trellis31-installed-defaults-sYAesS/fresh-default/.trellis/`:
both `delivery-contract.md` and `workflow.md` contain corrected wording.
`/tmp/trellis31-rollout-installed-wording.json` also verifies the runtime-contract
and continuation are unchanged semantically from b75. The corrected words are
not retroactively attributed to b75, whose shipped wording was defective.

### F1/F4/F5/F6 and bootstrap guidance remain closed

No implementation/test bytes changed since b75 for these corrections. Actual
new installed default create/start/bootstrap and custom initialization probes
confirm schema follows validated installed declaration, Task selection creates
no execution result, installed native bootstrap carries Delivery planning, and
custom ownership is preserved. Retained raw workflow bytes and original receipt
baseline remain intact; later update retains local edits. The objective Linear
start/archive guards retain their b75 source/installed fake-client proof with
its original provenance, rather than being called a fresh external Linear run.

### F2 — P1, not fixed: global current SDK/normal legacy retirement pending

`packages/core/src/task/index.ts:6` still exports legacy `TrellisTaskRecord`;
`:33` exports `TrellisTaskPhase`/`inferTaskPhase`. The legacy schema still
requires status and retains completedAt/commit/PR fields. Explicit `/task/v2`
is the new contract, while current `/task` and unmigrated execution remain the
declared finite compatibility authority. Fresh defaults and reviewed migration
close a substantial part of D2, but do not implement the accepted global
current API/factory/ordinary legacy consumer retirement (R9/R11, AC1).

Not fixed because this is a public-interface and staged compatibility decision,
not a local mechanical defect. Design section 8/implement P4 require actual
matching-consumer readiness, native migration evidence and public breaking-change
guidance before destructive retirement. Preserve that gate and single authority;
the implementation owner must complete retirement when its prerequisites exist.
User-directed upstream closeout does not remove this accepted scope.

### F3 — P1 evidence gap, not fixed: exact final upstream/Guru joint record absent

No joint record binds this b736 source/CLI71ed/Core45bb/API1/schema2 candidate
to an actual matching Guru candidate and the required installed semantic/profile/
private-history regressions. The old 077 handoff is not proof of the final pair.
Mapping fixtures, custom-owner probes and PR recovery simulations are useful
interface evidence, not actual Guru installed/remote transactions. AC12 and
the paired portions of AC2/5/6/9/10 remain incomplete.

Not fixed because evidence is externally owned, not editable implementation.
No #531 action was taken or awaited. Upstream may deliver independently, retain
the remaining evidence boundary, and later consume exact paired evidence without
inventing an extra Delivery/commit or original business-session recovery.

## Whole requirements matrix

| Requirement | Actual coverage and limit | Verdict |
| --- | --- | --- |
| R1 | Stable Task/generation and Delivery identities; retained slice planning; corrected creation/bootstrap guides | Upstream supported |
| R2 | One native closed owner chain; real manual/local outcomes; current fresh default and custom owner declarations | Native supported; paired F3 pending |
| R3 | Exact nullable read-only current query, stable selection/context/worktree identity, no reader-generated replacement/result | Upstream supported; ordinary retirement F2 pending |
| R4 | Exact candidate/applicability separate from phase; formal Check/full Review/readiness separate; default quality has no lifecycle writer | Upstream supported; actual Guru discovery F3 pending |
| R5 | Same-Delivery rework, clean integrated candidate without extra commit, original-producer/historical recovery without new approval | Native/interface supported; actual Guru transaction F3 pending |
| R6 | Stopped whole withdrawal releases execution binding; partial revision retains Delivery | Native supported |
| R7 | Independent whole-scope Completion sees unallocated evidence; evidence-only refresh; separate Closure/archive/cleanup | Native supported; fake Linear guard proof remains bounded |
| R8 | Reopen preserves g0 history, increments generation and rejects reuse of old gates/Closure | Native supported |
| R9 | Plan1/2 reviewed explicit migration, active/archive/session/resource dispositions, preview/replay/rollback and platform preparation | Upstream migration supported; F2 retirement incomplete |
| R10 | Real Git-free/manual/local profiles; bounded PR/profile/task-free interfaces; custom declared owner routing | Native/interface supported; actual Guru PR F3 pending |
| R11 | API1/schema2, declaration/version preflight, concrete mapping fixtures, single authority and measurable finite window | Contract supported; F2/F3 pending |
| R12 | Final installed defaults/custom/oldcopy migration/reapply/platform inventory; provenance distinctions retained | Scoped upstream supported; F3 pending; external hosts unverified |

## Whole acceptance matrix

| AC | Actual evidence and practical limit | Verdict |
| --- | --- | --- |
| AC1 | Final installed default bootstrap and ordinary Python Task-only create/start agree; native TS/Python/context lifecycle proof retained | Native supported; whole SDK F2 pending |
| AC2 | Real native D1/D2 distinct identities/plans and manual outcomes; immutable local commit sample separately retained | Native demonstrated; paired Guru F3 pending |
| AC3 | Same-slice solution/authority rework, whole withdrawal stopped, revised-scope Completion | Native supported |
| AC4 | Previously executed base-integrated clean exact range Check/full Review without another commit; unchanged implementation and real commit refs | Native supported with original provenance |
| AC5 | Actual local lost-projection recovery preserves producer result; PR simulations require zero repeated remote writes | Native/interface supported; actual Guru recovery F3 pending |
| AC6 | noDelivery scope/quality/Completion/reopen routes, stale fail-closed identity and worktree resolution | Native supported; business-shaped Guru F3 pending |
| AC7 | Actual missing unallocated evidence yields pending; later evidence-only Completion; failed cleanup does not revoke fact | Native observed; objective Linear guards bounded |
| AC8 | g0 historical outcomes preserved; g1 validation-only Completion uses applicable history without reusing g0 Closure | Native observed, original invocation provenance |
| AC9 | Final actual old native/custom copies: zero-write preview/stale refusal, history/session/modes, replay/third-state refusal, exact rollback/reapply | Representative upstream demonstrated; private Guru F3 pending |
| AC10 | Real native manual/local facts; executable declared owner/quality/formal/task-free routing | Upstream supported; actual Guru chain F3 pending |
| AC11 | Final registry22/1189 installed assets/receipts, init/reapply/shared queries; equivalent carrier regressions | Scoped upstream supported; external host dispatch unverified |
| AC12 | No exact final candidate pair and joint native/Guru record | Incomplete F3 |

## Verification and provenance

### Executable equivalence and current checks

Compared with b75, only nine source paths change: public contract twins,
Delivery docstring twins, two durable specs, init comment, workflow opener and
resolver comment. No implementation/test bytes or source modes change.
The Core tar is byte-identical. The CLI tar has exactly seven changed members:
init.js/init.js.map, contract Markdown, Delivery Python docstring, workflow
Markdown, resolver.js/resolver.d.ts. TypeScript printing with comments removed
verifies all JS/declaration changes are comments only; Python AST comparison
excluding the module docstring is equal. Source map changes track that comment.
No runtime contract/continuation change is hidden behind the wording repair.
Evidence: `/tmp/trellis31-round3-typescript-equivalence.json`,
`/tmp/trellis31-round3-typescript-delta-input.json`, independent candidate
verification above and main's `/tmp/trellis31-rollout-equivalence.json`.

- New related source tests: 3 files, 498/498 passed,
  `/tmp/trellis31-native-default-durable-wording-tests.log`.
- New both-package lint: pass, `/tmp/trellis31-rollout-lint.log`.
- New sequential Core/CLI builds including TypeScript compilation: pass,
  `/tmp/trellis31-goal-candidate-ds325ye4/build-core.log` and `build-cli.log`.
  This is fresh package build/type compilation, not a fresh root typecheck or
  full Python check. Pack/install logs are retained in that same candidate root.
- Inherited CLI full run from b75: 99 files, 2,169 passed,
  `/tmp/trellis31-current-cli-full-final.log`.
- Inherited Core full run from b75: 27 files, 475 passed, one existing optional
  SQLite skip; `/tmp/trellis31-current-core-full.log`. Skip is not pass.
- Inherited root Core build/CLI typecheck from b75: pass,
  `/tmp/trellis31-current-root-typecheck.log`.
- Inherited full Python 3.9 check from b75: 0 errors, 48 existing unused-import
  warnings; `/tmp/trellis31-current-python-full.log`.
- Reviewer independent round2 fix regressions: 76/76, raw-workflow 3/3 and
  seven correct fake Linear outcomes, retained with b75 provenance.

The unchanged executable/test proof permits bounded historical inheritance; these full runs are
not mislabeled as fresh b736 full-suite execution. New installed public wording
was checked afresh. Main separately built and froze the new installable package.
That equivalence does not prove a dist-backed integration test actually consumed
the current fresh default during the historical full run. The later hook result
demonstrates this gap; see the correction appendix.

### Final candidate actual installed observations

Index: `/tmp/trellis31-rollout-evidence.json`. Underlying result records and
current installed wording were inspected, not just top-level passing booleans.

| Artifact | Actual observation |
| --- | --- |
| `/private/tmp/trellis31-installed-defaults-sYAesS/result.json` | Fresh default schema2 versus explicit legacy; actual installed CLI/Python; raw workflow and receipt preservation, later update retaining edits |
| `/private/tmp/trellis31-closeout-installed-custom-7uVNDc/result.json` | Seven fresh/explicit/retained/force/skip/empty/bundled-transfer cases; custom owner and Task preservation; native-only bootstrap Delivery |
| `/tmp/trellis31-rollout-installed-oldcopy.json` | Final tar/plan-pinned actual native old copy; no-write dry-run/stale refusal, projected history/session/modes/model overrides, replay/third-state refusal, exact caller rollback and reapply |
| `/tmp/trellis31-rollout-installed-custom-migration.json` | Actual legacy installation converted through reviewed plan to custom schema2 owner; no-write preview/replay, absent receipt and preserved custom bytes under normal/forced reapply |
| `/tmp/trellis31-rollout-installed-platforms.json` | Registry22/1189 actual installed assets/receipts and shared queries; external host execution explicitly unverified |
| `/tmp/trellis31-rollout-installed-wording.json` | Actual fresh contract/workflow corrected; declaration/continuation semantically unchanged; all frozen source files stable |

Additional b75 installed Linear/prunable/native read-only probes remain
applicable by unchanged code with their exact original paths in round2. They
are not claimed to be newly run for b736. Both retained native aggregates and
29 Git-free/12 local authority/plan/evidence/manual refs plus actual immutable
commit were verified read-only in round2 using the same Core tar. Hashes:
`b44ca5d6aa7ab0293ca7d811eaabc3d291b2a00dc9824d62d6bbd4877097634c`
and `fc52d942a11b78cf0a840125c29cc60b2e026cad746eec2d0ac4eda67da9fda8`.

Original native AI-owner semantic invocation candidate remains
`85c2ec9171053563cbff01ed4402a73c8eb6528208595fb1333014cdbd01979f`
with later 077 package evidence. Reapply/read-only retention does not relabel
that historical Planning/Check/Review/Delivery/Completion/Closure as newly
executed semantic gates on b75 or b736. The controlled migration/default/platform
copies are not original business-worktree recovery, software release or joint
final-candidate acceptance.

## Required continuation

Continue upstream's own authorized exact-range commit/delivery workflow without
waiting on #531 closure. Preserve F2/P4 and F3/P5 as accepted remaining work,
not deferred-away defects or evidence passes. No source Issue closure or whole
goal completion follows from this quality report. After source/planning/candidate
changes refresh candidate-bound evidence; after evidence-only arrival reassess
whole scope without synthetic Delivery/commit. Two consecutive complete clean
rounds on a stable final candidate have not occurred.

## Correction appendix — F9: actual dist full-run exposed fixture drift

After this report's initial issuance, main attempted the user-authorized local
commit through normal hooks. The actual b736 dist-backed CLI full suite reported
2,167 passing and two failures. No commit completed on that failed attempt.
The preserved first-attempt artifact is
`/tmp/trellis31-commit-hook-first-result.json`, explicitly a summary of observed
tool output (session 55562), not a complete captured log. It also reports Core
475 passing and one existing skip. Do not cite it as a full raw log.

The cross-worktree-update integration failure was `unsupported_task_schema`,
not a timeout: its real no-flag CLI init now installs schema2 native workflow,
but `packages/cli/test/commands/cross-worktree-update.integration.test.ts`
still wrote the legacy `emptyTaskRecord` and expected selection to change status
to in_progress. This is F9, a concrete test-fixture/default-path mismatch. The
original regression goal remains important: actual fresh installation, linked
worktree identity resolution from primary, repeated same-version update repairing
managed runtime files while preserving Task bytes, and exact session clearing.
Switching init back to explicit legacy would avoid the current default path and
would not adequately close this newly exposed coverage gap.

The other failure was the omp schema2 first scenario's existing 10,000ms timeout
under concurrent full-suite execution. It is not counted as pass or dismissed
by retry alone. Main will run normal commit-hook full validation with
`VITEST_MAX_WORKERS=2`, preserving assertions/timeouts and without bypassing hooks.

The earlier CLI full green log is authentic historical evidence, but source/tar
comment equivalence alone was insufficient to inherit *actual current dist fresh
default coverage*. The initial sufficient-full-suite inference is withdrawn.
Packaged/default/custom/migration observations above retain their exact scope;
they do not erase this new full-run failure. The default owner is correcting only
the integration fixture/assertions to schema2, and this reviewer will inspect the
stable increment independently. Fix closure and normal-hook full success are
pending actual results; no fresh full-suite pass is asserted here.

Whole scope remains not clean, 0/2, with F2/F3 unchanged. A fixture change creates
a new source/test candidate increment; it must not be silently attributed to the
frozen b736 manifest or the old full-run provenance.

### F9 bounded closure: stable test increment independently reviewed

The original owner confirmed the single-file test correction stable. Reviewer
independently read its complete behavioral increment and preserved regression
goals. Test SHA-256:
`6b905f562901b78bca42a6868b079521ae4e098b617f948745590450a265afc3`.
It retains actual no-flag CLI initialization, real isolated Git worktrees and
installed Python/hooks, then creates the Task through actual installed task.py
without schema overrides. Selection preserves Task bytes and correctly exposes
noDelivery. It accepts reviewed fixture scope, creates and explicitly selects a
manual Delivery through installed declared owner inputs, rather than seeding a
phase or choosing the bootstrap Delivery from inventory. Primary-side current
Task/Delivery/context and Codex/Claude session/workflow/subagent context expose
that exact planning slice. No formal Check/Review/readiness/Completion result is
manufactured by this test.

The managed-file repair stimulus deletes `common/task_queue.py` instead of
`common/session_storage.py`: the latter is a required current Delivery runtime
capability, so deleting it correctly prevents preflight rather than exercising
ordinary managed-file repair. The test still corrupts a managed hook, proves
both checkout runtimes differ, updates both checkouts twice, verifies repaired
runtime equality, preserves Task bytes and clears only the exact session. It
does not weaken assertions, extend its original 180-second budget, switch back
to legacy or mock the runtime/update/Git behavior.

Actual installed-dist targeted test: 1/1 passed in 16.74 seconds,
`/tmp/trellis31-cross-worktree-update-schema2-green2.log`; scoped ESLint and
file diff check passed (owner reported command exit success; lint has no
diagnostics in `/tmp/trellis31-cross-worktree-update-schema2-lint2.log`). This
closes F9's identified fixture mismatch at the static/targeted level. Reviewer
did not build, run broad suites, stage or commit. The increment is a changed
test plus separately updated evidence and the research script's one-byte EOF
format correction; the frozen product tar identities above remain their original
identities, not rewritten source-manifest proof for this new test.

**Normal full commit-hook validation remains pending at this appendix freeze.**
Main will capture `/tmp/trellis31-approved-commit-hook.log` and independently
verify the actual resulting commit/check state. No fresh whole CLI pass or
successful commit is asserted here, and the omp timeout is not closed merely
by F9's targeted pass. Main's later actual results belong to subsequent evidence;
this report is frozen before the final normal hook to avoid editing its staged
content during commit. Whole-scope clean streak remains 0/2, F2/F3 pending.
