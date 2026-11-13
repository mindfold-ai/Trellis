# Implementation and verification plan

Status: Completed under the retained legacy workflow on 2026-10-13. Revised upstream scope passed two consecutive complete independent reviews on one exact candidate; the final increment merged in PR #34 after actual Ubuntu/Python 3.9 CI. Issue #31 is closed as completed. Downstream adoption/joint acceptance, global legacy retirement and software release remain outside this completed scope.

## 1. Delivery policy and ownership

Use a staged policy with two substantive upstream Deliveries under this one Issue-scoped Task. The independently accepted upstream schema-2 introduction and reviewed migration have one coherent scope; do not create dozens of narrow lifecycle tasks. If a later product or owner boundary genuinely becomes an independent deliverable, review that split first.

| Slice | Entry | Independent output / exit | Remaining work |
| --- | --- | --- | --- |
| D1: public contract, runnable runtime and opt-in native adoption | Reviewed plan, fresh canonical baseline and applicable implementation authorization. Existing public path remains usable. | Versioned `/task/v2`, deterministic TS/Python runtime, native owners and actual native single/multi-Delivery evidence; delivered in PR #32. | Upstream migration, fresh default and carrier repairs delivered by D2. |
| D2: reviewed migration and fresh native default | Upstream-owned native/custom migration facts and explicit installed version declarations; no downstream adoption prerequisite. | Plan-2.0 migration/rollback/reapply, native default, schema-2 consumers and platform/context ownership; delivered in PR #33. Legacy `/task` and explicit legacy workflow remain isolated. | Final revised-scope review and Completion judgment. |

Final Task Completion requires the revised PRD ACs and upstream D1/D2 facts. Downstream adoption, joint evidence and future destructive SDK/legacy retirement are outside this acceptance. Neither merges nor scope revision automatically complete the Task or close #31. Software publishing, source disposition, archive and cleanup retain separate owners/authorization.

Trellis #31 owns Core/CLI/Python schema-2 runtime, native owners/platform context, upstream migration and public compatibility diagnostics. Guru owns its adapters/gates/private migration/installed scenarios independently; #531 is a reference, not an execution or acceptance dependency. Original business owners retain #149/#444/#155 recovery and provider work. Marketplace/docs-site maintainers own their repositories/gitlinks; the release owner retains the full release matrix.

## 2. Ordered implementation checklist

### P0 — Fresh baseline and public contract gate

- [x] Re-read live Trellis #31 and comments, Guru #531/#292/#530 and the five canonical Guru sources plus current public interfaces. Record actual candidate/API identities; compare new source commitments with design Section 1. See `research/execution.md`.
- [x] Inspect Git status, current task/session, attached worktrees and repository topology; preserve unrelated files and the #23 task. Implementation uses local branch `codex/31-native-delivery-lifecycle`; no new worktree or unrelated migration.
- [x] Read package specs and `trellis-before-dev` context. Implementation/check uses Trellis subagents per current workflow after activation; each dispatch begins `Active task: .trellis/tasks/10-12-31-native-delivery-lifecycle` and respects native context injection/child-side loading. The validated manifests reference large `platform-integration.md`, `script-conventions.md` and `quality-guidelines.md`; automatic injection can truncate them and hit the total payload cap. Each child must explicitly read the complete matching sections from the canonical files, and read any deferred artifact/index entry from disk. Do not enlarge global injection settings or treat truncated injection as complete guideline loading.
- [x] Promote reviewed design contracts into one upstream-owned durable public document and versioned schema/API definitions, including Task/Delivery/candidate/result identity, legal transitions, owner roles, query union, native profile conditions, result recovery and migration errors.
- [x] Validate upstream-owned producer -> public input -> output -> consumer mapping fixtures in both runtimes against observed public schemas. Fixtures establish interface behavior only; actual downstream owner review/consumption is out of scope and is not a cutover gate. Do not message or mutate Guru.
- [x] Verify finite compatibility and package/API-version declarations against the actual source/installed candidates. Decide the actual candidate package version with the release/implementation owner without publishing it.

Exit: contract is reviewable, backward incompatibility is explicit, and no unknown owner or unmapped required result blocks D1 design. Scope/design changes return to the relevant plan owner; do not use an old generic confirmation for a changed plan.

### P1 — D1 domain/storage/runtime

- [x] Implement schema-2 Task aggregate and Delivery API 1.0 behind explicit versioned entry `/task/v2`. Keep old writable authority only for un-migrated records during the compatibility window; no dual writes.
- [x] Implement canonical Core schema/read/write/factory exports and closed transition/result APIs. Ordinary store writes validate existing bytes, shape, immutable identities and contained paths; use atomic-write conventions. Do not export arbitrary set-phase.
- [x] Implement Python equivalents in new/affected common modules and `delivery.py`; wire template collection, package copy and owned dogfood runtime. Both implementations use the same data/transition/error fixture corpus.
- [x] Add Task authority and per-Delivery artifact resolution, scoped candidate refs, minimal formal result storage/recovery and history-only outcomes. Verify result writes do not recursively change candidate identity.
- [x] Upgrade exact session projection to schema 3 for v2 installations, preserving TaskKey and explicit nullable Delivery selection. Keep registered-worktree/source/generation/path and identity-reservation contracts. Readers never infer or repair selections.
- [x] Implement completion/closure/reopen record APIs and explicit stop/binding release. Archival execution accepts actual current completion/closeout results and never creates them; child progress never treats missing data as done.

Exit: Core and Python agree on valid/invalid records, legal edges and recovery. D1 runtime is callable independently of Guru and all new files ship in the package.

### P2 — D1 native owners and real entry adoption

- [x] Introduce the single active-workflow runtime-contract declaration and preserve one continuation block. Markdown owners judge scope, applicability, plan acceptance, full review/readiness, delivery conditions and Completion; runtime only validates/records.
- [x] Update native workflow and common start/continue/planning/check/finish entry templates. Task create has no implicit D1; the explicit workflow creates D1 before Planning. Task start selects only; Planning acceptance moves Delivery into execution.
- [x] Add native full-review/readiness, deliver and complete-task entries with real direct consumers. Separate quality-only Check, formal Check and independent read-only full Review profiles in agents/preludes/entry routing. Do not implement competing Guru gate logic.
- [x] Implement native local_commit and manual/Git-free paths, and the bounded PR-based path with profile-specific actual postconditions. Required commit and actual already-committed candidate are distinct; no dummy commit to advance phase.
- [x] Preserve independent manual/task-free boundaries and real no_current_task/no_current_delivery/error distinctions. Direct/auto-discovered skills defer to the active workflow's owner, including native Skills in a custom/Guru workflow.
- [x] Adapt bootstrap and existing-project/joiner entry: create or select appropriate Task/Delivery without manufacturing Planning/Check/Review success. Keep bootstrap-onboarding meaning and project-local guideline authority.
- [x] Run a real native single Delivery plus a same-Task D1/D2 local/manual sample. Record actual owner results, plan paths, candidate facts and whole-task acceptance separately from test assertions.
- [x] Package D1 candidate and verify installability in a controlled checkout. Any push/PR/release/merge needed for candidate delivery is separately displayed and authorized; test artifacts are not permission.

Exit: D1 is an independent usable upstream interface/runtime/native candidate, with actual non-Guru execution evidence. Report old-default compatibility and remaining migration/Guru boundaries accurately.

### P3 — D2 explicit migration and install preflight

- [x] Extend migrate with explicit plan 2.0; preserve 1.0's original semantics during the finite window. Cover schema/API declarations, whole reviewed Task/Delivery projection, exact raw preimages, owned session/workflow/template changes and active/archive disposition.
- [x] Inventory old active/archived records and exact session/branch/worktree/commit/PR facts in controlled fixtures/copies. Do not assign every old outcome to D1 or derive pass from status. Original owner resolves missing semantic facts.
- [x] Make init/update/workflow-switch/migrate preflights diagnose incompatible API/workflow combinations before writes. Existing custom content remains preserved; a `.new` sidecar is never active runtime input. Guru apply/upgrade preflight is #531-owned and must consume the same declared contract.
- [x] Add explicit historical archive and deferred-record handling without changing identity reservations or allowing old records as new lifecycle candidates. Reopen requires reviewed migration/current authority and preserves history.
- [x] Verify preview zero writes; raw-byte/mode preservation, stale preflight, exact same-plan resume, ordinary failure recovery and caller-owned rollback. Use exact backup/write sets; no reset, resource deletion or private Guru parsing.
- Compatibility boundary: retain the explicit legacy paths and reject unsupported declared combinations. Global destructive retirement and actual Guru compatibility are outside this Task; no downstream result is requested or required.

Exit: selected old installation can be migrated with reviewable preconditions and restored before new business writes; unsupported marketplace combinations fail before replacement. New projects remain usable independently.

Actual P3 evidence is indexed in `research/goal-review-loop.md`: full CLI 2103
PASS, Core 475 PASS / one existing optional SQLite SKIP, independent migration
46/46 and custom ownership 8/8, packed native/custom prior-install cutover,
caller-owned exact rollback/retry, and 22-platform installed asset/reapply
coverage. These are upstream/controlled-copy results, not Guru private
migration, released-0.6, external host AI execution or the full release matrix.
The current upstream finish pass also repairs a freshly observed session
resolution failure caused by explicitly prunable Git entries with residual
`.trellis` directories; new source/check/package identities supersede the
previous `077bb029` candidate for that repair and this plan refresh.
The same finish pass corrects byte-identical custom workflow onboarding:
bootstrap consumes the effective installed workflow and requires explicit
bundled native identity or retained managed ownership before creating native
scope/Delivery. Custom workflow ownership remains Task-only even when template
bytes match. Red/green regression and independent source Check are recorded in
`research/goal-review-loop.md`; the refreshed package must reproduce the fix.

### P4 — D2 native default and schema-2 consumer adoption

- [x] Fresh no-flag init uses `native-delivery-v1`; implicit reinit preserves actual legacy/custom/native ownership. Omitted create schema follows the validated installed declaration. Explicit `native` remains an isolated legacy compatibility entry; `/task/v2` remains the schema-2 SDK endpoint.
- [x] Schema-2 Task create/current/list/queue/tree/archive/start, shared Python/JS/extension/pull carriers, common Skills, agents and bundled references consume Delivery projections and current workflow ownership. Retained legacy readers/writers are compatibility-specific; they never execute schema-2 records or double-write authority.
- [x] Native/custom workflow preservation and plan-2.0 migration prove preview, raw bytes/modes, stale refusal, resume, rollback/reapply and representative packaged carrier behavior; registry-derived coverage covers all 22 declared platforms at the documented asset/executable layers.
- [x] The optional Linear example uses schema-2 selection/current Completion, no automatic external start write and protected metadata IO. Its actual Ubuntu 22-case fake-client suite passes after the interpreter fix in PR #33; external Linear service behavior is not claimed.
- [x] Upstream public contract/specs document versioned SDK replacements, API/schema diagnosis, single authority and migration. Scope revision removes downstream/joint completion gates from active docs/templates while preserving isolated compatibility.
- Deferred/out of scope: global current `/task` replacement, inferTaskPhase removal from the legacy SDK, destructive legacy execution retirement, external marketplace repository conversion and self-hosting migration of this retained Task. A future breaking release must inventory affected consumers and prove its own cutover; no #531 progress gate is attached here.

Exit: fresh/default schema-2 runtime uses Delivery, and controlled old-install migration plus unsupported-version diagnostics are demonstrated. Compatibility paths are explicitly separated and are not falsely claimed retired.

### P5 — Independent upstream acceptance and whole-task finish

- [x] Verify every revised AC against exact upstream source/API/schema/package identities and actual observation layers. External integrations and software release remain disclosed out-of-scope boundaries, not required missing evidence.
- [x] Complete two consecutive independent whole-scope clean reviews on the same final candidate. A finding resets the streak; fixes require fresh review. Scope removal is recorded as a human decision, never relabeled as implementation of a removed obligation.
- [x] Apply actual whole-task Completion/finish judgment under the retained workflow after required work is complete. Source disposition, archive/bookkeeping and cleanup require their own later authority; a delivery PR keyword never closes #31.

## 3. Verification matrix

| Scenario / AC | Upstream evidence owner / method | External owner or limits |
| --- | --- | --- |
| Identity/schema parity and fixed transitions, AC1/AC8 | Core schema/operation unit tests and shipped-Python integration using one valid/invalid fixture corpus; repeated same-result and mismatched-result assertions. | No gate sufficiency is inferred by fixtures. |
| Native single/multi Delivery, AC1/AC2 | Controlled native installation executes real local/manual outcomes, D1/D2 plan paths, explicit selection, formal gates and Completion. Record actual Git/file/result facts. | Guru installed sample is separately #531-owned. |
| Rework, scope revision and stopped slice, AC3 | Same D1 ID preserved; owner-specific return; stopped outcome and cleared execution selection; revised-scope Completion includes unrelated work. | Guru owner alone validates its private author/approval chain. |
| Clean/dirty candidate, AC4 | Real local Git repo with base integration and clean committed candidate; fresh Check/full Review without new commit, plus dirty exact-commit path. | #531 consumes actual #530 delivery and owns old #444-shaped installed regression. |
| Output loss/applicability, AC5 | Suppress original output/reject public projection after a known actual local result; producer recovers same result. Stub remote API only in upstream objective integration tests to assert mutation counts. | Guru #531 proves actual installed Publish/Merge transaction and lost-output behavior. PR/native real remote sample only under applicable authorization; stub assertions are not remote proof. |
| No-Delivery / wrong binding / local dependency, AC6 | Real registered sibling worktrees and non-Git repo; stale/ambiguous/old schema selection errors; Completion-only and closeout ingress without empty Delivery. | #531 owns #149/#155 business-shaped semantic cases and task-free caller routes. |
| Completion vs archive/cleanup, AC7/AC8 | AI-owner native acceptance sample plus executor tests refusing archive without matching result, preserving success after cleanup failure and generation reopen history. | Guru causal Completion/Closure/Finish/Cleanup stays its owner. |
| Migration, AC9 | Old active+archive+session+multi-PR-shaped public facts; dry-run snapshot, stale bytes, same-plan resume, modes and exact rollback. Include current/deferred/invalid selected records and partial/missing artifacts. | Guru private migration and original business worktrees are outside upstream execution. |
| Native/custom profile dispatch, AC10 | Actual native local/manual/Git-free sample; generated direct Skill ingress against custom owner declaration; quality Check no phase mutation; current API mismatch fails closed. | Representative Guru installed gate routing owned by #531. |
| Platform/init/update/reapply, AC11 | Registry-generated source/template/argv/envelope contract coverage; executable shared Python + OpenCode JS + Pi/OMP/pull/Snow representative carriers as applicable; controlled packaged init/migrate/reapply for native and custom workflow. | Missing external host/session is UNVERIFIED, not PASS. Full multi-host release matrix remains release-owner work. |
| Upstream provenance/compatibility, AC12 | Bind exact source/package/API/schema to native and controlled custom samples; verify isolated legacy replacements/migration/version diagnosis. | Actual Guru/private business integration and joint evidence are outside #31. |

Every acceptance evidence entry records owner, candidate/API identity, scenario, actual observation layer (code/test, static, installed, external), result, evidence locator and any unverified boundary. Use the existing task evidence/artifacts, not a new product ledger or tracked authorization/gate report. Downstream evidence is not required or relabeled as upstream proof. Historical reports retain their then-current scope; fresh reviews use the revised PRD.

## 4. Concrete check commands

These existing commands are the required package/build baseline once code is implemented:

```sh
pnpm --filter @mindfoldhq/trellis-core lint
pnpm --filter @mindfoldhq/trellis-core typecheck
pnpm --filter @mindfoldhq/trellis-core test
pnpm --filter @mindfoldhq/trellis lint
pnpm --filter @mindfoldhq/trellis lint:py
pnpm typecheck
pnpm build
pnpm test
```

Targeted tests initially live beside `packages/core/test/task/` and CLI `test/scripts/`, `test/templates/`, `test/configurators/`, `test/commands/{init,migrate,workflow,update}*` and relevant regression files. Add new meaningful cases there; do not create tests that merely mirror field assignments or constants. Root full-suite results must be reported independently of targeted results. CI Python 3.9 compile/type checks remain required; an unavailable interpreter/dependency is unverified, not passing.

Existing planning/context structural checks:

```sh
python3 .trellis/scripts/task.py validate .trellis/tasks/10-12-31-native-delivery-lifecycle
python3 .trellis/scripts/task.py current --source
python3 .trellis/scripts/get_context.py --mode continuation
```

After implementation, execute the proposed `delivery.py`/v2 operations from design Section 3 in a controlled installed project, not just import-level tests. Pin the actual built/packed package and install context in the evidence. Checks during an implementation-authorized session must report actual observations; planning alone never claims future behavior was verified.

For schema-2 consumer auditing, use focused `rg` queries for inferTaskPhase, Task phase exports, Task status access/default/writes, commit/pr_url/completedAt and root-only artifact loading across canonical code, templates, platform carriers and specs. Classify every remaining hit: explicit predecessor migration, historical-only reader, an unrelated process/HTTP status, explicit isolated legacy compatibility, or a defect in schema-2 execution. Global retirement is not this audit's exit. A zero broad `status` search is neither expected nor evidence of success.

## 5. Risk points and rollback

| Point | Risk / gate | Rollback or stop |
| --- | --- | --- |
| New schema/API entry | Core/Python drift or incomplete public exports | Keep existing version pinned; fix fixtures and packaging before candidate use. |
| Formal native ownership | Quality Check or automatic Skill discovery changes phase / bypasses custom owner | Stop affected formal ingress; repair active-workflow delegation before install activation. |
| Candidate freshness | Result recording creates artificial content drift; base integration loses full-review requirement | Fix content projection and producer applicability; retain actual commits/outcomes; no dummy commit. |
| Install cutover | New readers with old writer/workflow/extension | Preflight all declared schema/API/profile inputs; block before writes. |
| Migration execute | Stale raw bytes, wrong Delivery attribution or custom file loss | No preflight writes; caller reviews projection. Same-plan failure recovery accepts only exact old/target bytes; restore backed-up exact paths before new business work. |
| Archive/reopen | Archive forges completion or prior generation masquerades as current | Require actual bound completion/source disposition; preserve historical bytes/refs and stop on ambiguity. |
| External workflow version | A declared custom workflow/API combination is unsupported | Diagnose before upstream writes and preserve content; downstream adapter changes belong to their owner and never gate this Task. |
| Self-hosting/submodules | Broad task migration or unrelated repo/gitlink changes | Inventory exact targets and stop outside owned boundaries; no reset, cleanup or unapproved mutation. |

## 6. Documentation and review status

Docs strategy: update upstream public contract and affected executable specs before final code Check; task-local plan remains the implementation design source until reviewed changes are promoted. No second Guru contract copy. Include API migration notes, supported/unsupported combinations, finite old-contract exit and evidence ownership in durable upstream docs. External docs-site/marketplace changes are handed to their owner or explicitly scoped before editing.

Planning readiness requires: requirement convergence; all source design commitments mapped; concrete types/closed APIs/phases/native owner conditions; upstream interface mapping examples; explicit version/migration/rollback; scenario AC/owner coverage; valid spec/research manifests; and a final artifact presentation. Implementation begins only after reviewed plan acceptance and task activation under the current workflow. Planning authorization alone does not authorize that activation.

## 7. Final upstream acceptance and closeout — 2026-10-13

The main-session retained legacy workflow owner accepts the entire revised Task scope, not merely the known D1/D2 outcomes. All R1–R12 and AC1–AC12 were supported at their stated observation layers in two consecutive complete independent quality reviews, with no remaining accepted or unallocated requirement. The candidate stayed unchanged between reviews. This acceptance does not create schema-2 formal gate, Completion or Closure records for this retained legacy Task.

- Accepted source digest: `5181ab6671cc2ed441feaa33e080f830e57c4f8266d927355cf69d272b85d77f`; 1,158 source/spec/carrier/planning files and 20 local increment files checked for exact bytes/modes.
- Local implementation commit: `fdc831e78a6e9bf60b6702557ac78b952bc47d61`; main-based equivalent: `82610126d11f556b59055548a17cc1444b18bf92`. Both complete Git trees were identical.
- Historical D1/D2 delivery: [PR #32](https://github.com/castbox/Trellis/pull/32) and [PR #33](https://github.com/castbox/Trellis/pull/33). Final independently accepted scope and quality-entry correction: [PR #34](https://github.com/castbox/Trellis/pull/34).
- Actual PR #34 merge: `bd18d5c91ffb10e3ee9e783f04dadc5cb3fccd14`, parent `ad56d40863ce1032278e4e1fca677eb14b08cc5f`, tree `f56ef8b149f3784cf8e07a1b21915e9c4afe37dd`; actual merge tree equals the two-review candidate tree.
- Actual [Ubuntu/Python 3.9 CI run 38323886406](https://github.com/castbox/Trellis/actions/runs/38323886406) passed Python syntax/type checks, TypeScript checks, lint, build and complete tests: CLI 99 files/2,178 passed; Core 27 files/475 passed and one existing optional SQLite skip. Normal local commit hooks independently passed those suites.
- Regression for shared checker ingress was demonstrated red (8 failures) then green (160 relevant tests). Final generated Gemini/Qoder/Copilot preludes support noDelivery quality while formal profiles and implementation retain selected Delivery requirements. Actual Codex uses its own native fallback; the shared TOML insertion helper is separate test coverage.
- Actual offline install matched 983 regular package files in bytes/modes. CLI tar SHA256 `6763278a436c754e9d97e85d9ae953983541b97041e0f0d167a9b8cde0434c16`; Core `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`. Fresh native default, schema-2 create/no implicit Delivery and custom reinit preservation passed.
- Review evidence: `/tmp/trellis31-independent-round3.md` and `/tmp/trellis31-independent-round4.md`, with corresponding JSON reports; exact candidate/package/merge proofs retained separately. The reports are quality evidence, never fabricated native lifecycle outcomes.
- Human instruction on 2026-10-13 was to continue completing #31. After live merge/tree verification, Issue #31 was separately closed with reason `COMPLETED` at `2026-10-12T23:51:04Z` (2026-10-13 07:51:04 Asia/Shanghai); the PR used `Refs #31`, so closure was not a keyword side effect.

Completion is limited to the human-revised upstream scope. Actual remote schema-2 owner execution, external AI-host dispatch, Guru/private/business migration, joint acceptance, destructive global legacy retirement and release publication remain unclaimed/out of scope. Historical F2/F3 findings retain their original scope; they are not relabeled implemented or passed. Task archive is subsequent bookkeeping, and worktree/branch deletion or main-checkout synchronization is not part of this closeout.
