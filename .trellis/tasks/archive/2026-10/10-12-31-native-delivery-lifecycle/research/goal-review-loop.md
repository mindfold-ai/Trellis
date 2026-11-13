# Whole-Issue review and repair goal

Human instruction on 2026-10-12: review all Issue #31 implementation against the
complete requirement; revise confirmed findings, verify, and repeat independent
whole-scope Review. Two consecutive no-finding rounds complete the goal.

## Completion contract

The candidate must satisfy the entire current #31 scope, not just opt-in D1.
Every R1–R12 and AC1–AC12 has actual applicable evidence at its declared layer.
Unimplemented explicit migration/default retirement or missing matching Guru
installed/joint evidence is an open finding. A green runtime test cannot replace
an AI semantic-owner scenario or original consumer's actual result.

Two consecutive independent reviews must cover the complete intended range and
all accepted scope on the same stable source/test/public-contract/package
candidate. Confirmed defects, unresolved evidence, or a candidate change reset
the consecutive clean-round count. No reader/reviewer manufactures formal
lifecycle results. No Issue closure, release, production/business migration,
resource cleanup or other repository write follows automatically from this goal.

## Starting facts

- Current branch: codex/31-native-delivery-lifecycle.
- Starting HEAD: a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2.
- Complete intended baseline: 5c760463680ffc10a3f26957b330c57a4b0c3ff8.
- Starting worktree clean; current Task remains legacy in_progress/unmigrated.
- Fresh whole-scope review matrix: /tmp/trellis-31-whole-review-matrix.md.
- Whole-scope Review zero found three new D1 defects and three completion gaps.
- Consecutive clean rounds: 0. Goal status: active.

## Current repair ownership

| Gap | Implementation owner | Required observation |
| --- | --- | --- |
| Hook second query loses exact platform identity | goal31_hook_fix | Native SessionStart/PreToolUse without environment override; multiple exact bindings; no writes |
| Task rename breaks Delivery manifests/authority/plan locators | goal31_location_fix | Same Task/Delivery identity, intact immutable history, fresh applicable continuation after actual rename |
| Archived schema-2 Task rejects history/reopen | goal31_location_fix | Complete/close/archive then read history and formally reopen same Task into new generation |
| Explicit plan-2.0 migration | D2 research then bounded implementation | Reviewed old/current/archive/session/template projection; raw bytes/modes; zero-write preview/stale; resume/rollback |
| Normal default Task phase consumers remain legacy | D2 research then bounded implementation | Actual matching consumer readiness before destructive cutover; normal SDK/CLI/Python/platforms follow one authority |
| Guru exact-candidate installed/joint evidence | Guru #531's existing owner | Read actual matching candidate/API results; upstream references rather than executing another owner's private gates |

Cross-repository implementation and private lifecycle facts remain under their
actual owner. Their checkout may be edited concurrently; refresh actual evidence
before every compatibility conclusion. An open Issue is not itself a readiness
gate and an uncommitted adapter is not itself installed/joint proof.

## Latest review and verification

The initial hook identity, relocation and archive/reopen findings have been
repaired and independently rechecked within their respective source ranges.
This is not a complete clean round. Original probes remain available:
/tmp/trellis-31-whole-carrier-probe.json;
/tmp/trellis31-domain-rename-result.json;
/tmp/trellis31-domain-archive-result.json;
/tmp/trellis-31-whole-review-6fnkn26m/observations.json.

Previous exact source full suites remain scoped evidence: Core451 PASS plus one
existing SQLite SKIP; CLI1949 PASS; installed60 PASS. They do not validate the
new repair or unimplemented D2 paths. New source stabilization requires fresh
applicable checks, centralized build, corrected install and full Review.

Hook identity repair is locally verified, pending the stable whole-candidate
independent Review. The previous implementation failed five new regressions;
the repaired six-file targeted suite passes 88 tests. The new 16-case suite also
passes on installed Python 3.9.6, including a real registered sibling worktree,
same host/session keys, override precedence, Codex inherited-override isolation
and zero-write snapshots. Logs: `/tmp/trellis31-hook-identity-{red,green,python39,
pyright,eslint}.log`. No whole-scope clean round is earned by this local result.

Design corrections are accepted in design.md sections 10.2–10.3. Location owner
also owns the narrow Core/Python artifact-origin parity changes. Migration owner
owns a separate plan-2 executor and explicit legacy SDK migration boundary.
Carrier owner prepares schema-2 inventory/OpenCode/extension behavior without
prematurely activating destructive legacy/default retirement. Actual matching
Guru evidence remains missing in its inspected test authority; adapter kind
forwarding is a concrete consumer compatibility gap to retain in the final
paired finding, not an upstream repository mutation.

## Subsequent complete-range pre-review

Confirmed source defects discovered after the initial repairs:

- Invalid selected Task metadata could fall back to root context manifests.
  The common context chokepoint now validates existing records and runtime
  compatibility before loading or changing context; missing task.json retains
  the explicit evidence-only behavior. The actual three commands reject the
  old invalid probe without changing bytes; targeted suites pass 60 tests.
- Deliver Skill incorrectly required current gates for original-producer
  historical success recovery. Default checker carriers also required a
  Delivery for whole-Task quality refresh. Skills, all checker carriers and
  actual Python/OpenCode injection now distinguish these routes. Actual
  profile tests pass 34 cases on both default Python and Python 3.9.6.
  Semantic native owner acceptance remains a separate installed obligation.
- Migration recursively confused business metadata with typed authority refs,
  omitted missing-record archive leaves, lost supported Codex overrides, and
  disagreed with Python on malformed declarations. These were repaired and
  independently rechecked. Raw inventory, byte/mode replay and caller-owned
  rollback remain the governing boundaries.
- Historical local commits were accepted without matching their immutable tree
  to candidate content. CLI now reuses the public closed Core verifier;
  independent probes reject wrong content/modes and permit real historical
  recovery after current HEAD and working-tree changes.
- A fixed Git authority incorrectly depended on the current same-name path.
  Independent probes showed legal historical refs rejected after a current
  symlink change. Repair is in progress; SHA refs and write targets retain
  containment validation.
- Unlisted live sessions were silently resnapshotted and preserved during
  migration. New/corrupt schema-2 records could survive cutover and break current
  resolution. Repair requires explicit raw-source session dispositions and
  zero-write refusal of unexpected inventory. This finding is still open until
  independent recheck of the final source.

Core has been rebuilt for the new historical verifier; full tests are 475 PASS
and one existing optional SQLite SKIP. Core/CLI lint, root typecheck and Python
checking pass (Python full check has 48 existing unused-import warnings).
The first fresh CLI full run produced 2083 PASS and three stale-fixture/literal
failures. Their original assertions are being preserved with valid record and
hook-call fixtures; a complete rerun is required after source freeze.

The stable packed candidate, controlled actual old-installation migration,
native A-D semantic samples and complete-range independent Review are still
pending. The native plan now includes two genuinely delivered independent
artifacts in one Task, a third withdrawn slice and unallocated whole-scope
verification. Its previous D1-delivered/D2-stopped design did not satisfy AC2.

Consecutive complete clean rounds remain **0**. Default legacy retirement and
matching Guru exact-candidate installed/joint evidence remain whole-scope
findings; source/local test passes cannot close either boundary.

## Stable candidate and completed installed evidence refresh

Candidate `/tmp/trellis31-goal-candidate-slmnvfq2/candidate.json` freezes 1,144
source/test/spec/owned-carrier files at source fingerprint
`077bb02966156b10f5d7477fedd9d6f8c2953dcd113434cf2ff48393307f2c25`.
It identifies HEAD plus uncommitted repairs; HEAD alone is not the candidate.
API 1.0, Task schema 2.0 and package 0.7.0-castbox.3 remain explicit.

The fixed-Git locator and exact-session inventory findings above are repaired
and independently verified. A subsequent custom-workflow ownership finding was
also repaired: plan-2 workflow entries require explicit `template_id`; only
verified rendered bundled bytes receive native workflow receipt ownership.
Custom write/preserve removes old native workflow receipt keys, including when
custom bytes happen to match a bundled workflow. The shared workflow hash
projection is used by migration and workflow switching. Actual default, normal
and forced update preserve custom bytes and its declared owner.

Fresh complete CLI suite passes 2,103 tests in 96 files. Core passes 475 tests
with one existing optional SQLite SKIP. Applicable lint/typecheck, Python 3.9,
template parity and diff checks pass; full Python checking retains 48 existing
unused-import warnings. Task manifest validation passes with the disclosed
existing large-context truncation warning. Reports:
`/tmp/trellis31-goal-cli-final-test-v3.log`,
`/tmp/trellis31-goal-core-final-test-v2.log`,
`/tmp/trellis31-goal-cli-final-lint-v3.log` and
`/tmp/trellis31-goal-cli-final-type-v3.log`.

Actual packed CLI/Core install matches 713/270 files byte-for-byte. The native
old-copy migration result is `/tmp/trellis31-packed-oldcopy-v5-result.json`
(plan `74dde9124e7b2b3fab1c52fdff8c8d3e6c55a5aa0fbb7bdfb6f238cb7ec1d228`),
and custom old-copy result is `/tmp/trellis31-packed-custom-result.json`
(plan `6124c5193cb650974aa6b9b03068e8f7fbb679a67661e52fbfaa1d2690f6ee79`).
These are controlled actual prior D1 installations, not released-0.6 or
business-worktree migration proof. Native execution covers zero-write preview
and stale-source refusal, same-plan retry, third-state rejection preserving a
user edit, exact caller-owned rollback, re-execution and ordinary reapply.
Custom execution adds actual default and forced reapply ownership preservation.
Registry-derived installed platform evidence is
`/tmp/trellis31-packed-platform-result-v2.json`: 22 platforms and 1,045 receipt
assets, with shared current/continuation and reapply. External host AI execution
and the release matrix are not claimed.

Migration independent final review has no new findings:
`/tmp/trellis31-v5-migration-independent-review.json` (46/46 regression and 8/8
independent probes). Its first temporary query generated pycache and its root
typecheck rebuilt Core dist; both are disclosed, source/tar/installed candidates
remain unchanged, and corrected read-only queries have zero changes.

Native actual semantic execution inputs:
`/tmp/trellis-31-native-owner-HDwXIv/native-final-review-inputs.json`.
The same Git-free Task has actual D1 and D2 manual delivery, stopped D3 after
withdrawal, whole-scope evidence-only verification, separate g0 Completion and
Closure, and real cleanup failure preserving Completion. After two relocations
and archive/reopen, g1 retains history and completes current validation without
new Delivery or g1 Closure. The real local-Git sample covers integrated clean
candidate full-range Check/Review and original-producer historical commit
recovery after current scope/gates become stale; no new commit or replacement
gate is manufactured. That Task has no Completion/Closure. Original runtime
actions used intermediate `85c2ec91`; actual final `077bb029` reapply and Core
history resolution are recorded without relabelling earlier actions.

The final complete-range reviewer is finishing the same stable candidate's
matrix. Complete consecutive clean rounds remain **0**: P4 normal-default
retirement and P5 matching Guru installed/joint evidence are open. Accepted
design Section 8.1 prevents premature destructive retirement before actual
consumer readiness. The reviewed candidate handoff is in
`research/goal-guru-candidate-handoff.md`; it has not been sent. Messaging the
existing Guru owner requires the human authorization requested through the
async input tool, and no answer has yet been received. No Guru source/gate,
product Task migration/completion, commit, push, PR, Issue closure or cleanup
was performed by this evidence refresh.

## Final stable-candidate complete-range independent conclusion

Final report: `/tmp/trellis31-final077-whole-independent-review.md`, with complete
R1–R12/AC1–AC12 matrices. Result **FINDINGS_PRESENT**. No new source, migration or
native sample defect was found. The reviewer independently verified all 1,144
source inputs, 983 installed package files, native historical objects across
five snapshots, current evidence/candidate hashes, 34 direct installed SDK
plan/evidence resolutions, and underlying final077 native/custom migration
invocations. Main-session post-document-refresh manifest verification also
reports zero mismatches; research is outside the frozen candidate inventory.

The two P1 whole-scope findings remain:

1. Current SDK `/task` still exports `TrellisTaskPhase`/`inferTaskPhase` in
   `packages/core/src/task/index.ts:33–34`, its schema still uses legacy status
   and single commit/PR fields, and default init remains legacy in
   `packages/cli/src/commands/init.ts:974–978`. Accepted P4 implementation must
   retire those normal paths after design Section 8.1 consumer prerequisites.
2. Guru's sole `test.md` still binds old `ce36314b` rather than final077. Its
   actual partial results do not supply the missing exact-pair installed/joint
   record, actual remote success/recovery or old #149/#444/#155 continuity.
   Only the original Guru owner can provide those facts. The old B05 bug is
   fixed in final077 and is not reclassified as a new source finding.

Consecutive complete clean reviews remain **0**; the goal remains active.
Next dependent action is the previously requested authorized handoff to the
existing Guru #531 chat, followed by consumer-owned matching validation,
accepted normal-path retirement, a fresh frozen/build/checked candidate and
two complete independent no-finding reviews on that same candidate. No second
partial review will be counted merely to increase the counter.

## Blocked audit after complete-range review

The same consumer-readiness/authorized-handoff blocker persisted through the
complete-range report turn and two automatic goal continuations. No new human
message granted cross-chat messaging. Latest manifest check verifies all 1,144
source hashes/modes with zero drift. Guru's sole test authority remains draft,
pins `ce36314b`, and has no final077 matching joint record. Live `list_threads`
confirms the existing Guru owner chat is `idle` with unchanged update time;
there is no live job to wait on. The `wait_threads` snapshot tool failed
transiently; the independent live inventory, not that failure, establishes idle.

No safe independent source action remains before accepted design Section 8.1's
actual consumer readiness. The handoff is concrete and reviewable, but
`send_message_to_thread` requires direct human authorization. The parent goal is
therefore marked **blocked**, not complete or paused, after the three-turn
audit. Complete clean rounds remain **0/2**. Resume after that authorization or
arrival of matching consumer-owned evidence; retain the entire original scope
and restart the blocked audit on a user resume. Normal retirement, final
candidate checks, and two complete no-finding rounds remain required.

## Authorized consumer handoff and goal resume

The human explicitly answered the pending question with
`授权发送候选并继续受控验证`. Before sending, all 1,144 frozen inputs and both
tarball SHAs were freshly checked and matched. The concrete reviewed handoff,
candidate locators, fixed B05, explicit template ownership/migration obligations,
consumer-kind finding, evidence boundaries and controlled-copy authorization
were sent once to existing local Guru #531 chat
`01a12f44-4042-7780-bfa5-dc0bb53746a7`. The tool acknowledged the exact target.
The parent goal is active again; the prior blocker audit is reset. Live compact
`wait_threads` confirms an in-progress turn, cursor
`da6918ac-c5a5-4f45-b0c5-b25c531bf90f:1`; this is a specific live process to
observe, not an inferred wait from intent. No remote Publish/Merge, product
Task mutation, new commit/publication, Guru write or resource cleanup authority
was added. Complete clean-round count remains 0/2 while awaiting actual matching
consumer evidence and accepted P4 retirement.

## Human steering: perform upstream closeout first

The human then instructed upstream to follow its own finishing flow without
waiting for #531 acceptance. The already-authorized handoff remains delivered;
this session stops using consumer progress as a prerequisite for closing out
the independently usable upstream repair/migration candidate. It does not
infer whole-Task Completion, source Issue closure, P4 readiness or two complete
clean rounds from that candidate delivery. Remaining paired acceptance stays
explicit in the accepted scope and evidence matrix.

Fresh upstream checks found a new source defect before closeout: registered Git
inventory contains explicitly `prunable` temporary worktrees whose `.trellis`
directory remains but whose Git entry is absent. `workspace_roots` attempted to
validate that residual path, causing current and continuation to fail before
resolving this session's still-intact `31-native-delivery-lifecycle/g0` binding.
The chosen repair preserves resources/metadata and strict selected-binding
errors; no worktree cleanup is performed. A bounded implementation worker owns
the canonical/shipped session storage twins and meaningful real-Git regressions.
An independent quality worker covers all upstream dirty implementation/spec/
tests before the parent freezes, checks and packages a new candidate.

Task `implement.md` now marks the five actually validated upstream P3 rows
complete and retains consumer readiness/P4/P5 as pending. This plan refresh
and the new binding repair invalidate final077 as the exact new source
candidate; old execution provenance and tests stay explicitly labelled.
Remote `main` is `6e3ccc8d6d9e71dbcd77fbe6d945599e5f4f9b7f`, PR #32 is merged
at the old `ce36314b` feature head, and the current remote feature branch still
points to that head. Main and ce36314b trees have no differences; no automatic
branch synchronization, push or new PR was performed.

The independent upstream finish Check confirmed two further boundaries:

- Plan-2 migration also included explicitly prunable residual worktrees in its
  required workspace set. A real controlled original plan preview passes on the
  valid repo but fails after an unrelated obsolete sibling appears; both
  snapshots are zero-write. Evidence:
  `/private/tmp/trellis31-migration-prunable-eniih28c/report.json`. The same repair
  owner now applies the shared closed live-root rule to CLI discovery, and
  restricts Git-free fallback to an actual not-a-repository diagnostic without
  any lexical ancestor Git entry. Other Git failures stay errors.
- Native bootstrap inferred policy from workflow byte equality. A custom ID
  with byte-identical native content retained user receipt ownership but still
  acquired accepted scope and an implicit Delivery. Actual packed reproduction:
  `/private/tmp/trellis31-custom-byte-identical-A2UQLJ/report.json`. A separate
  implementation owner repairs `init.ts` and meaningful regression cases using
  selected bundled identity/effective ownership, preserving Task-only custom
  onboarding. No actual remote request or Guru write was involved.

Main spec sync also corrects `script-conventions.md`'s outdated typed API and
parent-child completion table: legacy compatibility is explicit, schema-2
status is nullable, inventory is typed, and only a matching current Completion
counts. Missing/archived legacy child data is not schema-2 completion evidence.
The spec changes, source repairs and controlled new observations belong to the
upstream finishing candidate; exact freeze/full tests/pack and independent
final Check are required before proposing its local commit.

## Upstream finish candidate after independent repair and check

The upstream-only finish batch is ready for Phase 3.4 commit-plan review. Three
findings have been corrected and independently reverified: Python/CLI explicitly
prunable live-root discovery, typed Python lifecycle documentation, and custom
byte-identical native bootstrap ownership. Independent quality evidence is
`/tmp/trellis31-upstream-finish-quality-review.md`. This is a quality profile,
not a formal lifecycle gate, whole Task Completion or Issue closure.

Final source fingerprint:
`6905b5e050e963692b246c3b947a8c772426e0aef3b8a583834ea23a261e6b5d`.
Candidate: `/tmp/trellis31-goal-candidate-h_q0dl1k/candidate.json`, baseline
`5c760463680ffc10a3f26957b330c57a4b0c3ff8`, current HEAD
`a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2` plus related working-tree changes.
The manifest freezes 1154 source/test/spec/planning/carrier file hashes and modes,
including the nine cumulative dogfood carriers missing from the earlier broad
snapshot. Task research and lifecycle metadata remain separate evidence inputs.
Package version is `0.7.0-castbox.3`, Delivery API `1.0`, Task schema `2.0`.
CLI tar SHA256:
`ca87a98dfaf4a511cbb77081c54fd7853fe67fb8dead2a9ca613f0f651fe606b`;
Core tar SHA256:
`45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
713 CLI plus 270 Core installed files match their tar bytes; independent reviewer
also checks modes. Core tar remains identical to the old 077 candidate.

Fresh complete checks before the final whitespace-only hook-format correction:

- CLI: 2128 PASS / 97 files, `/tmp/trellis31-upstream-closeout-cli-test.log`.
- Core: 475 PASS / one existing optional SQLite SKIP,
  `/tmp/trellis31-upstream-closeout-core-test.log`.
- Root lint and root declaration typecheck: exit 0,
  `/tmp/trellis31-upstream-closeout-{lint,root-typecheck}.log`.
- Python basedpyright: zero errors / 48 existing unused-import warnings,
  `/tmp/trellis31-upstream-closeout-pyright.log`; 34 canonical Python twins match
  and parse under Python 3.9 grammar; independent source/spec review and diff
  checks passed.
- Hook-format precheck found one long `requiredOption` line in CLI index.
  The quality owner formatted only that line, reconstructed the old bytes to
  the 99ef hash and reran scoped ESLint, direct CLI typecheck, Prettier and diff
  checks. `/tmp/trellis31-upstream-finish-format-{lint,type,prettier}.log`.
  Final rebuild changed only the CLI source map; all 712 remaining CLI files,
  including executable JS, and all Core files match the 99ef package exactly.
  `/tmp/trellis31-upstream-closeout-package-delta.json`. No repeated full suite
  is required for a source-map-only package delta; commit hooks still apply.

Controlled installed validation first executed against 99ef after both actual
behavior repairs. Those reports retain 99ef provenance. Final-package bootstrap,
prunable and native-history probes run separately against 6905; exact logs are
`/tmp/trellis31-closeout-final-{custom,prunable,native}-result.log`.

- Seven custom/native onboarding paths verify Task-only custom ownership,
  bundled positive controls and existing bootstrap bytes preserved on reinit.
- Actual same-plan migration previews with and without an explicitly prunable
  sibling match exactly and write nothing; an existing corrupt Git marker is
  still refused with zero writes.
- Both existing native manual/Git samples reapply and query history under the
  new package without changing Task aggregate bytes. Original D1/D2/withdrawn
  slice, Completion/reopen and historical commit owner execution retains its
  intermediate85/077 provenance; these new runs are package/history validation,
  not newly performed semantic outcomes.
- 22-platform installed registry/reapply validates 1189 platform assets and
  executable shared runtime; external host dispatch remains unverified.
  `/tmp/trellis31-closeout-installed-platform-result.json`.
- A fresh controlled copy restored from the actual legacy source snapshot
  verifies plan-2 zero-write preview, stale-source refusal, metadata/session/
  historical file/mode preservation, same-plan replay, third-state user-edit
  refusal, exact write-set rollback, reapply and actual runtime queries.
  `/tmp/trellis31-closeout-installed-oldcopy-result.json`.
- A fresh actual legacy init followed by explicit custom migration verifies
  selected Task/session projection and ordinary/forced reapply preserving custom
  bytes, absent managed receipt and custom scope owner.
  `/tmp/trellis31-closeout-installed-custom-migration-result.json`.

The 99ef installed platform/migration evidence remains applicable to identical
runtime/template bytes in 6905, as shown by the package delta. Neither record is
relabeled as new execution. Final frozen-package independent verification is
recorded in the quality report. No Guru private integration, original business
worktree recovery, source publication, default cutover or release is claimed.
The real repository Task/session remains unchanged legacy g0/schema2;
missing_runtime_contract is the expected undeclared legacy workflow, not a
schema2 lifecycle fallback or authority to manufacture formal outcomes.

P4 normal-default retirement and P5 paired compatibility/whole acceptance remain
pending. Whole-goal clean-round count is still 0/2. The human's upstream-first
instruction removes waiting on #531 from this batch's closeout prerequisite; it
does not reduce accepted scope or automatically complete/archive/close #31.
The next action is a concrete single-batch local commit plan, subject to the
repository workflow Phase 3.4 one-shot confirmation. No old approval is reused.

## Renewed whole-worktree and branch goal

The human explicitly renewed the same whole-Issue review/fix goal after the
upstream commit proposal. That request is not commit approval. The active goal
is retained; the former 150-path commit plan and frozen6905 are historical once
planning/spec/native-default implementation changes begin. No staging/commit
or external message is performed.

Round 1 covers cumulative baseline5c760463 through HEADa85ce75c plus related
working-tree assets, using live #31, all PRD requirements/ACs and current plans.
The independent whole reviewer confirms default/current contract retirement is
an unimplemented requirement, not merely missing external evidence. The review
therefore cannot count as clean while P4/P5 remain pending.

A reviewed safe correction proceeds without waiting on #531: fresh no-flag
init uses native-delivery-v1; existing no-explicit workflow reinit preserves
actual legacy/custom/native content and ownership; omitted Python create schema
follows the installed validated declaration, with explicit mismatches and
malformed/unsupported declarations rejected before writes. Custom schema2
bootstrap remains Task-only. The main session records this design8.1/planP4
refinement and durable specs; an implementation sub-agent owns CLI/Python
sources/twins and meaningful regressions. Current /task SDK and undeclared
legacy execution remain compatibility-bound until the accepted destructive
retirement readiness gate is satisfied. No Task/data/session or external
marketplace repository is migrated to manufacture progress.

V2's internal legacy metadata parser/factory dependency is inventoried for the
actual SDK retirement. Independent review confirms it currently creates no
competing Task-status authority or demonstrated product bug, so no unrelated
preparatory refactor is added merely to raise the review count. Complete clean
rounds remain 0/2. Only a stable complete candidate with all required scope and
evidence satisfied can begin the consecutive-clean count.

## Renewed goal repair stabilization

The native default owner reports final source stability after schema-aware
bootstrap guidance, raw workflow preservation and exact original receipt
baseline preservation. Reviewer independently reproduced the receipt defect
with two red managed-workflow cases; later update must continue recognizing
local edits. The Linear owner reports checked runtime/path/Task IO, schema-2
start zero calls, archive current-Completion binding and atomic metadata
linking, with fake clients exclusively. Root is running fresh complete
package suites before new candidate packaging. Whole accepted-scope streak
remains 0/2; P4 retirement and P5 exact-pair evidence remain separate unmet
obligations. No commit plan or old package evidence is promoted to current.

## Fresh stabilized upstream verification

Final local candidate: `/tmp/trellis31-goal-candidate-nfa57d6g/candidate.json`,
source `b75fb6acc04e7f7309dd590175a7f1209de05b1812a319b636f0c0a54073ac77`,
1156 frozen source/test/spec/planning/carrier byte hashes and modes, no drift.
CLI/Core remain 0.7.0-castbox.3, API 1.0/schema 2.0. CLI tar
`7ee5e7c88d9dc422686cc8ffcc138d44ec58b7f7da187dafd6ccc4108059e1d5`;
Core tar `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
Actual tar-to-installed CLI713/Core270 files match bytes and modes.
Source dist mode normalization is not asserted identical to package tar modes.

Fresh quality evidence, after all fixes:

- CLI 99 files, 2169/2169 PASS:
  `/tmp/trellis31-current-cli-full-final.log` (maxWorkers 2).
  The first full run exposed one incomplete child_process mock and five
  contention timeouts. The mock now retains real spawnSync, without switching
  the new-default fixture back to legacy. The timeout cases separately passed
  133/133 and then the complete suite passed without timeout/semantic changes.
- Core 475 PASS, one existing optional SQLite SKIP:
  `/tmp/trellis31-current-core-full.log`.
- Whole lint, exact root `pnpm typecheck`, configured Python3.9 static checks,
  Python twins and diff checks PASS. Python has 0 errors and 48 pre-existing
  unused-import warnings. Logs and installed evidence index:
  `/tmp/trellis31-current-upstream-evidence.json`.

Actual installed controlled probes all passed: fresh no-flag plus named legacy
init/create/bind and raw workflow bytes/mode/exact receipt/later update;
8 fake-client Linear cases; 7 custom bootstrap/reinit cases; prunable Git
registration same-preview and strict marker zero-write refusal; actual old-copy
migration preview/stale preimage refusal/same-plan retry/user edit refusal/exact
rollback and reapply; custom old-copy migration preserving declaration/receipt;
2 retained native samples reapply/read-only history; 22 platforms/1189 actual
installed assets and receipt coverage. The prunable migration fixture explicitly
requests legacy native because its purpose is old-install migration; default
adoption has its own actual no-flag probe. Linear current-Completion fixture
probes check objective guards only, never claim semantic owner Completion or
real service evidence. Retained native outcomes preserve original execution
candidate provenance; reapply does not make them new semantic invocations.

Independent complete Round2 review is being finalized against this exact
candidate. P4 current SDK/normal legacy retirement and P5 exact-pair evidence
remain unsatisfied. Upstream local candidate/quality closeout can proceed
separately; whole accepted scope is not complete, streak remains 0/2. No new
Task lifecycle results, Task migration, commit or external publication occurred.

## Complete round2 conclusion

Independent complete-range review is final in
`research/goal-current-whole-review-round2.md`. It closes F1/F4/F5/F6 and the
bootstrap guidance gap on b75 source plus actual installed evidence, and finds
no new actionable product defect. It independently verifies all source bytes
and modes, both package hashes, tar-to-install equality and retained native
refs without changing aggregate hashes. R1–R12/AC1–AC12 remain the complete
review scope. F2 current SDK/normal legacy retirement is unimplemented work
under its explicit cutover gate; F3 exact-candidate paired evidence is missing.
Consequently the whole-goal streak remains 0/2. The corrected upstream slice
may continue its own commit/delivery closeout without waiting for #531 to
close, but this does not complete the Task or authorize Issue closure. No
new commit approval was obtained for the enlarged batch.

## Post-round2 public contract finding

Root continuation read found a current shipped documentation defect in
`packages/cli/src/templates/trellis/delivery-contract.md` Rollout boundary
(and dogfood twin): it still describes default legacy workflow and migration
as future D2 work despite implemented fresh native default and reviewed plan2.
This is current public guidance, not an immutable historical D1 record.
The native owner is correcting both files without waiving current SDK/global
legacy retirement or exact-pair evidence. The reviewer is appending the finding
to round2 and scanning current public/spec/help contracts for similar stale
rollout wording. b75 implementation/package evidence stays historical; the
161-file commit plan is superseded, its pending approval cannot execute it.
No staging/commit occurred. Whole-goal clean streak remains 0/2.

## Fresh public rollout correction candidate

Stable candidate `/tmp/trellis31-goal-candidate-ds325ye4/candidate.json`, source
`b7364f186e9dec7ff8c2ed6889ed88252ca4b660ac719bbbc640c9ecb7dd6ad9`.
Current public Rollout boundary, active bundled Delivery workflow header,
current supporting specs and source explanations are corrected. Actual fresh
installed contract/workflow have current wording; runtime declaration and
continuation are identical to b75. All 1156 frozen source files match.
CLI tar `71ed2484dc4518c7fd19cd353334d90c7fe5a7ae70f6cf75adfb077a1ba21a5f`;
Core tar unchanged `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.

Compared with b75, nine source paths change and seven CLI tar members change;
Core has zero changes. Python AST excluding module docstring is identical.
JavaScript after comment removal and type declarations after comment removal
are identical. The seventh non-runtime differences include actual Markdown and
source map. Thus b75 full CLI2169/Core475+optionalSKIP/Python quality provenance
is retained with explicit equivalence, not falsely labeled as a new full run.
498 current targeted regressions, whole lint and sequential builds pass.
New actual package probes pass for freshdefault/legacy and raw receipt/update,
custom bootstrap/reinit, old-install preview/retry/rollback/reapply, custom
migration/reapply, and 22 declared platforms. Actual wording and the evidence
index are in `/tmp/trellis31-rollout-installed-wording.json` and
`/tmp/trellis31-rollout-evidence.json`.

Independent complete round3 is pending. F2/F3 remain incomplete, whole-goal
streak remains 0/2. Old 161-file proposal remains superseded; no staging or
commit is authorized by a reply to that obsolete plan. No #531 operations,
Task migration, lifecycle success record, archive or cleanup were performed.

## Complete round3 conclusion and upstream closeout boundary

Independent complete round3 is final in
`research/goal-current-whole-review-round3.md`. It closes F7/F8 against b736
source and actual installed wording, independently verifies source hashes/modes,
packages, comment/doc-only equivalence and installed migration/platform records,
and reports no new actionable upstream finding. Fresh 498-case and lint/build
runs are explicitly separate from inherited b75 complete CLI2169/Core475+
optionalSQLiteSKIP/Python results. Whole R1–R12/AC1–AC12 scope still has F2/P4
current SDK/ordinary legacy retirement and F3/P5 exact joint evidence pending,
so streak remains 0/2. The earlier pending 161-file plan is superseded. A new
exact upstream local-commit plan includes these repairs and round3 evidence;
Phase3.4 confirmation is required before staging/commit. Current Task remains
unmigrated/active; this quality candidate does not establish Completion, Closure,
archive, source disposition, cleanup or release authority.

## Approved local closeout and current-build test correction

The human explicitly approved the replacement 164-file local commit plan,
branch `codex/31-native-delivery-lifecycle`, parent `a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2`,
message `feat(delivery): add reviewed migration and native default adoption`.
The obsolete 161-file plan remains superseded. All approved paths/hash/modes,
the 1156-file source candidate and the empty index were revalidated before
exact staging. A staged whitespace check found one extra EOF newline in
`research/goal-native-samples.py`; removing that byte preserves its AST and
all nontrailing bytes. This is evidence-script formatting, not runtime change.

The normal commit hook then passed lint-staged and Core475+1optionalSKIP but
failed CLI2167passed/2failed. F9 is an actual current-build regression-test
fixture mismatch: the installed cross-worktree update smoke uses noflag fresh
init (now schema2) but seeds a legacy Task and expects execution-status writes.
The public runtime correctly refuses this incompatible execution. The remaining
OMP failure is a 10000ms timeout during the fully parallel run; it is not called
a pass. Observed tool-output excerpt is `/tmp/trellis31-commit-hook-first-result.json`.
This invalidates the prior inference that inherited b75 full checks alone prove
the cross-worktree smoke against b736's actual built fresh default. It does not
change the recorded historical b75 observations. The correction owner preserves
real schema2 noflag initialization and the repeated same-version update/hook
regression; reverting this smoke to legacy would conceal the new default.

No commit completed in the failed attempt. A normal final hook with Vitest's
`VITEST_MAX_WORKERS=2` will retain all checks and timeouts while bounding
contention; no hook bypass or semantic weakening is authorized. The approved
local closeout continues with this necessary regression correction, its
independent review and corrected evidence. Whole accepted scope still has
F2/P4 retirement and F3/P5 paired evidence pending; clean streak remains0/2.
No #531 operation or Task Completion/Closure/archive/cleanup is performed.

The updated smoke also replaces its deleted managed-file repair target:
`session_storage.py` is now a required Delivery preflight import, so deleting
it intentionally makes normal update refuse an unsupported installation.
Deleting unrelated managed `task_queue.py` still proves real update repair
without defeating required preflight. Separate fail-closed tests remain intact.
