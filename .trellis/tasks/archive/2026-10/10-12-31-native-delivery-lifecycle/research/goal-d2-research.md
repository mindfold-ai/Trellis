# Research: #31 D2 migration and normal-consumer retirement

- Query: Locate every concrete P3/P4 implementation surface, prerequisites, migration invariants, tests and parallel ownership; assess actual matching Guru #531 readiness without changing that repository.
- Scope: mixed; upstream code/spec/plans and read-only paired-consumer source/evidence inspection.
- Date: 2026-10-12
- Task: `.trellis/tasks/10-12-31-native-delivery-lifecycle` (supplied dispatch; no task selection, migration or lifecycle write).
- Baseline: caller supplied `a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2`; other workers are actively repairing hooks and rename/archive. Code anchors below describe the inspected source snapshot and may move during that work.

## Findings

### 1. Accepted scope and exact cutover boundary

`prd.md` R9/R11, AC9/AC11/AC12 require an explicit migration and complete retirement of the *normal* Task development status contract. D1 test green cannot satisfy them. `design.md:194-201` distinguishes an additive `/task/v2` interface/native capability from destructive `/task` and old execution-path retirement. `implement.md:55-80` leaves P3/P4/P5 pending.

The latest Issue read from `/tmp/trellis-31-whole-review-issue.json` is OPEN, updated `2026-10-12T08:36:24Z`, and explicitly permits upstream interface delivery before the consumer Issue closes. `/tmp/trellis-31-whole-review-matrix.md` provides the previous full R1–R12/AC1–AC12 audit; use that matrix rather than reducing the goal to three D1 bugs.

Can implement while consumer readiness is pending:

1. Pure versioned plan-2.0 schema/projection validation, full prospective-write preview, exact preimages, and private-plan executor exercised only in controlled old-install copies.
2. Explicit legacy migration/history reader modules, active/archive/deferred dispositions, session-2→3 conversion and public history access.
3. Complete schema-2 inventory/context/carrier behavior behind the existing explicit native-delivery-v1 workflow/API, with meaningful installed fixtures.
4. Source helpers/tests for future normal factory/export/bootstrap replacement, version-diagnosis and public breaking guidance.
5. Native fresh installation's v2 capability (already permitted by design independently of Guru) and controlled native old-install migration.

Must not claim or perform early compatibility retirement:

- Removing the normal old API/runtime path and publishing it as current before actual consumer readiness and reviewed migration are proven.
- Replacing an existing custom/marketplace workflow with native fallback or treating a `.new` sidecar as the active declaration.
- Reapplying newly retired consumers to an unmigrated old installation, migrating this Task, or bulk rewriting unrelated tasks merely to green tests.
- Counting uncommitted Guru tests or matching API version text as joint installed evidence.

Implement source mechanisms now; keep the installation writer capable of rejecting incompatible custom/old combinations before its first replacement. The staging decision must remain explicit and finite. A perpetual status/Delivery dual-write mode is not the solution.

### 2. File map: migration executor and compatibility preflight

| File | Current behavior / necessary change |
| --- | --- |
| `packages/cli/src/commands/migrate.ts:25` | Closed plan1.0 only. Keep original parser/executor semantics and route a discriminated 2.0 plan to its own narrowly scoped implementation. |
| `packages/cli/src/commands/migrate.ts:5-10` | Imports old shape/serializer from current `/task`; must stop depending on that mutable endpoint before `/task` switches to v2. |
| `packages/cli/src/commands/migrate.ts:117-135` | `filePath(cwd,name)` confines writes to one project. Cannot represent common-dir session paths or sibling worktree tasks by adding `../` strings; need typed target roots validated from live registered facts. |
| `packages/cli/src/commands/migrate.ts:137-170` | `describe` computes *raw* SHA and full mode, but write targets force Python/shell 0755. Plan2 must honor reviewed mode explicitly; do not silently inherit plan1 behavior for raw artifact/session preservation. |
| `packages/cli/src/commands/migrate.ts:203-216` | Supports only predecessors earlier than VERSION; same candidate's schema migration is currently rejected. Plan2 needs explicitly specified source install/schema/API identities independently from package upgrade ordering. |
| `packages/cli/src/commands/migrate.ts:223-231` | Calls ordinary `collectTemplateFiles`, removes workflow/config/gitignore. Plan2 needs a prospective target-runtime collection path rather than calling an old-installed runtime preflight that rejects the selected projection before it can migrate. |
| `packages/cli/src/commands/migrate.ts:328-383` | Only active refs. Current/deferred records preserved; archived records excluded; omitted active records checked as current. Plan2 must inventory all exact active/archive dispositions across selected registered roots. |
| `packages/cli/src/utils/delivery-workflow.ts:48-149` | Checks exact installed VERSION, invokes installed `delivery.py contract`, scans every active Task and rejects mixed authority. Extend with reviewed prospective records and explicit deferred/history-only dispositions; do not simply skip invalid old records. |
| `packages/cli/src/commands/init.ts:974-1024` | Default native selection and preflight occur before write. Preserve this sequencing and forced-reinit ownership fix. |
| `packages/cli/src/commands/update.ts:460-514` | Template collector calls old installed preflight before producing maps; managed workflow picks legacy/delivery template from active declaration, custom absence of hash preserves ownership. Future migration path must preserve ownership and avoid collector/preflight dependency deadlock. |
| `packages/cli/src/commands/workflow.ts:167` | Selected template preflight precedes replacement. Full v2 combination validation must remain here, not only in migrate/init. |
| `packages/cli/src/cli/index.ts` | Public migrate argv/help and errors must distinguish plan versions, preview and owner-managed rollback. |
| `packages/core/src/task/migration.ts` | Current predecessor→legacy schema semantic preservation. Needs explicit legacy namespace; retain original business field preservation for plan1. Add pure Task→v2 projection validator elsewhere rather than repurpose this function. |
| `packages/cli/test/commands/migrate.integration.test.ts` | Existing 1.0 behaviors are regression obligations. Add separate 2.0 file with real registered sibling worktrees, source bytes/modes, preview/resume/rollback. |
| `packages/cli/test/commands/{delivery-workflow.integration,custom-workflow-reinit.integration,cross-worktree-update.integration,workflow.integration}.test.ts` | Exact install/version, custom ownership, no-write preflight and reapply scenarios. Extend for migrated/deferred records and prospective contract. |

#### Proposed minimal plan-2.0 shape (design proposal, not a published interface)

Use `schema_version` as top-level discriminant. Each plan includes source/target package/schema/API identities; explicit workspace selections; complete per-task v2 projection or defer/history-only disposition; exact session projection; owned template/workflow decisions; exact raw expected SHA and mode for every source and prospective write. No approvals, business gates fabricated from status, or resource cleanup actions.

Target selectors must be closed typed variants: project-relative target under one live registered workspace; common-dir session target by exact session filename/key; non-Git checkout-local session. Resolve common-dir and registered roots via known repository facts, never accept arbitrary external absolute write paths. Include repository-relative package suffix when working in nested monorepo projects. Expected branch/worktree facts are preflight locators, not new branch/worktree creation instructions.

A task disposition should explicitly distinguish projected active, converted archive, current-v2-preserved, deferred active and history-only archive. Require each known old active record to have an explicit disposition. Archives can remain exact raw history by default but must be inventoried by stable ID, not silently omitted. Selected conversion requires proper owner authority/slice attribution; unknown archived identities still reserve names/IDs without becoming executable.

For unsupported or incomplete selected source: concrete conflict identifying path and responsible owner; no universal D1, planning or completed mapping. Legacy status is only a diagnostic hint. A reviewed projection may produce an unapproved planning Delivery when genuine new Planning is required; historical successful results need actual original-owner provenance and exact applicability inputs.

#### Exact preservation and replay rules

- Task stable ID/source/generation: existing exact values retained; only absent old generation maps to zero under existing migration rule. Preserve metadata/tree/createdAt/related files/resources.
- `status`, `commit`, `pr_url`, `completedAt`: retired from new current schema. Preserve original raw source snapshot and owner-selected normalized historical outcome mappings. Unknown attribution blocks selected conversion. Snapshot must remain data, not a second current authority, and is not an invented Task completion result.
- Root `prd/design/implement/JSONL`: preserve original bytes/modes. Copy or map owner-selected slice artifacts into `deliveries/<UUID>` through explicit content/mode actions; do not move/overwrite whole Task scope. `AuthorityRef` revisions must reference the actual projected content. Root and slice planning ownership remain distinct.
- Session2→3: preserve TaskId/generation and exact context key; `delivery_id:null` unless selected owner explicitly supplies a valid current-generation, nonterminal Delivery. No first-Delivery inference from status/files. Retain sessions for unrelated deferred old tasks unchanged with explicit unsupported-on-v2 diagnosis.
- Common-dir sessions: inspect actual declared records and registered worktrees, reuse identity resolution rather than path guessing. Corrupt or unregistered selected session is a conflict before all writes. Unrelated sessions retain bytes/modes.
- Dry-run: snapshot file contents, modes and path existence including sessions/hashes/version; no `.pyc` or temporary cache writes (`PYTHONDONTWRITEBYTECODE=1` for Python probes).
- Preflight: verify **all** expected raw bytes and modes, ownership, source/version and live target roots before writing any action. Template receipt normalized hash is not a substitute for a raw plan preimage.
- Same-plan resume: each exact reviewed write may be source state or exact target state (including mode). Unexpected third state blocks before writes and preserves user edits. Preserve-only items require exact expected state. Recompute receipt target from the frozen plan/template candidate, not current partial receipt bytes plus uncontrolled edits.
- Ordinary failure: return exact pending/finished facts or reuse source/target recognition; no success phase fabricated. Tests can inject an ordinary writer exception after N actions in a controlled copy, then verify same-plan completion.
- Rollback: caller's exact preview backup is authority; restore only written/replaced/removed paths, remove only reviewed new paths, restore full modes. Never `git reset`, delete resources, touch Guru private data or reverse business work made after migration. If new business work started, stop rollback and use forward owner reconciliation.

### 3. Core SDK/current default export retirement

| File | Change / test |
| --- | --- |
| `packages/core/src/task/index.ts:33-34` | Remove phase type/inference from the **new current** endpoint; export v2 type/factory/schema/store/operations explicitly or documented stable-name aliases. Keep `/task/v2` an identical version-identifying alias. |
| `packages/core/src/task/schema.ts:24-45` | Old required status/commit/pr_url/completedAt cannot remain normal record type. Isolate legacy implementation under explicit migration/history module; no ordinary fallback parser. |
| `packages/core/src/task/records.ts` | Existing writer is old-schema, normal writeFile and does no v2 domain immutability checks; current endpoint must reuse existing v2 store protections instead of wrapping this old writer around v2 type. |
| `packages/core/src/task/v2/{schema,types,operations,store,index}.ts` | Reuse already implemented new authority, validators, modes and objective facts; no second Task aggregate. |
| `packages/core/src/task/migration.ts` | Expose only at explicit migration endpoint; preserve plan1.0 operation. Old schema recognition is not normal writer authority. |
| `packages/core/package.json` | Explicit `/task`, `/task/v2` and migration/history export declarations with types/import/default. No wildcard deep import. |
| `packages/cli/src/utils/task-json.ts:10-19` | Legacy `TaskJson/emptyTaskJson` aliases point at current old API. Either make normal aliases v2 and update all callers, or clearly separate legacy bootstrap helpers during compatibility window. |
| `packages/core/test/task/{schema,records,phase,migration}.test.ts` and `test/task/v2/*` | Existing old tests become explicit migration/history tests; current endpoint rejects old status-based records and supports all v2 flows. Don't erase old migration obligations to make renamed tests pass. |

Required SDK tests: current `/task` and `/task/v2` create/load/write same exact v2 record and shared fixture behaviors; legacy record rejected from ordinary current read/write; no `inferTaskPhase`/`TrellisTaskPhase` emitted in normal `.d.ts`; no alias bypass of immutable Task/Delivery/domain writes; supported migration endpoint remains importable in packed package; root barrel remains small (`trellis-core-sdk.md` forbids leaking all subpath APIs).

Lockstep Core/CLI versions must be chosen by release owner. Current package source version is `0.7.0-castbox.3`; do not invent or publish a candidate tag. Breaking guidance must say exact endpoint replacements, Task/Delivery schema/API identity, how old pinned installations migrate, where legacy history recognition remains, session conversion, and unsupported custom declaration diagnostics. `design.md:199` requires actual public guidance before retirement. Changing export names under the same package artifact without documentation is not acceptable.

### 4. Python runtime: normal consumers, historical boundary and concrete tests

All source paths below are under `packages/cli/src/templates/trellis/scripts/`, with owned `.trellis/scripts/` runtime twins. New modules must enter `templates/trellis/index.ts:getAllScripts`, directory-copy paths, package copy-templates and twin parity checks.

| File / anchor | Required normal v2 behavior |
| --- | --- |
| `task.py:627`, `common/task_store.py:343-598` | Current create flag defaults legacy and builds old record then removes four fields. New ordinary create must construct v2 directly (no implicit Delivery); explicit owner creates/selects real slice before Planning. Preserve description/source/meta/tree and no-session creation semantics with concrete binding diagnostics. |
| `task.py:81-120,131-259` | `_record_start_state` mutates legacy planning→in_progress. Current start should only bind exact Task; no manifest gate or phase flip masquerading as planning approval. Explicit delivery selection/Planning owns execution. Legacy start confined to pinned old runtime, not normal new reader fallback. |
| `task.py:261-365` | Finish clears selected exact binding and hooks; current JSON carries v2 TaskKey + structured currentDelivery. Missing current Task/Delivery are legal distinct values, errors explicit. Never inventory-select a Task/Delivery. |
| `task.py:369-475,737` | List/text/tree currently render pseudo Task statuses and `--status`; JSON strips them for v2. Replace normal status filter with actual documented inventory acceptance/generation/profile/phase fields as needed; inventory selection must never mutate sessions. Parent completed count requires real accepted completion, not missing/archived child. |
| `common/tasks.py:22-29,67-79,133-164` | Current v2 lifecycle summary exists; TaskInfo still injects fake status `task_scope/task_completed`. Separate accepted-scope/completion inventory from phase; ordinary loader rejects old execution data while explicit history reader reserves/exposes old identity. Do not map legacy completed to actual new completion. |
| `common/task_queue.py:26-39,47-83` | Normal queue shape drops status for v2, but filter remains status and `list_pending_tasks` selects planning, excluding all v2 Tasks. Replace with explicit incomplete-scope/known-Delivery inventory. Don't call absence of Delivery phase pending implementation. |
| `common/types.py:27-44,62-79` | Old TaskData/TaskInfo status assumptions must move behind legacy/history boundary; add type-first v2 inventory shape rather than scattering `.get()` fallbacks. |
| `common/io.py:27-116,141-177,248-278` | Old and v2 validated by field inspection in ordinary readers. At final retirement normal `task.json` read/write only v2; historical raw/object reader separated and explicit. Keep exact ID reservation projection shallow for #29 collision safety and immutable domain write guards. |
| `common/task_context.py:37-56,195-240` | v2 planning root already uses selected Delivery. Keep Task scope inspection distinct from execution manifests; explicit history queries can read past generation without selecting execution. Rename/archive worker owns current fixes. |
| `common/task_store.py:1233-1453` | Legacy archive writes completedAt/status; v2 checks matching Completion/Closure. Normal archive must retain accepted result and not manufacture completion or resource cleanup. Coordinate rename/archive worker before modifying. |
| `common/task_utils.py`, `session_storage.py:217-256` | Active-only path resolution currently rejects archive history/reopen. Another worker owns repair. Keep execution binding active-only; history query/explicit formal reopen use their validated separate paths. |
| `common/session_storage.py:265-294`, `active_task.py:696-705` | Schemas2/3 coexist; normal v2 Task requires schema3. At retirement no implicit session repair/read-time conversion. Migration converts exact reviewed Task binding. Reader errors cannot become no_task. |
| `common/session_context.py:529-574,642-675` | v2 currentDelivery exists but legacy status fallback and fake status text remain. Every context format should carry structured TaskKey/currentDelivery plus active continuation; no second route graph. |
| `common/delivery_session.py:23-65,133-162` | Reuse exact resolver identity/platform and explicit selected Delivery; history query differs from selection. Preserve generation-specific eligibility and read-only query. |
| `common/workflow_phase.py`, `runtime_contract.py`, `continuation_contract.py` | Parse actual current workflow; return contract/owner/version diagnostics. Do not synthesize a native fallback if custom workflow lacks declaration. Sibling runtime markers accepted; malformed/nested continuation still rejected. |
| `delivery.py`, `common/delivery_{schema,operations,store}.py` | Keep API1 actual transition/result semantics and kind-aware hash/object validation; migration must not manufacture producer passes. |

Tests must exercise shipped scripts, not just textual mentions:

- `test/scripts/task-identity-source.integration.test.ts`: ordinary create produces v2, preserves source/stable identity and collisions including history-only archives; no D1 inferred; malformed selected record rejects with zero writes.
- `task-list-tree.integration.test.ts`, `task-children-normalization.integration.test.ts`: v2 incomplete/completed parent/child inventory, archived child with actual result, deferred old record surfaced only as history/deferred; queue doesn't lose v2 Tasks.
- `task-archive.integration.test.ts` + active rename/archive worker's tests: archive cannot create Completion, history and formal reopen reachable, generation unchanged except explicit reopen, archive auto-commit not approval.
- `cross-worktree-session.integration.test.ts`: real registered sibling selected task, common-dir schema3, same key unchanged, duplicate/stale/casefold conflicts and invalid selected bindings remain explicit; no external unregistered writes or global pointer fallback.
- `delivery-v2.integration.test.ts`: null Delivery, task scope/completion/closeout, fresh/reopened validation-only path, historical delivered refs preserved, stop/no new success, active task binding unchanged on read.
- `task-meta.integration.test.ts`: meta cannot smuggle authoritative phases/results; normal metadata writes retain domain preimage.

### 5. Platform/Skill/template carriers: actual coverage map

Registry source is `packages/cli/src/types/ai-tools.ts` plus `configurators/index.ts`; use every registry key, not a maintained platform subset. Current declared keys: claude, cursor, opencode, codex, kilo, kiro, gemini, antigravity, devin, qoder, codebuddy, copilot, droid, dsh, pi, reasonix, zcode, trae, omp, grok, kimi, snow.

| Class and targets | Concrete changes / meaningful validation |
| --- | --- |
| Shared Python hooks: `templates/shared-hooks/{session-start,inject-workflow-state,inject-subagent-context,inject-shell-session-context}.py` | All actual selected identity/platform hops must agree; reject old normal record after retirement; current query/continuation are authority; Delivery-specific artifacts only for execution. Hook worker owns immediate identity repair; coordinate after stabilization. Test envelope and argv from actual configurator registry, including no environment override. |
| Codex/Copilot bespoke SessionStart: `templates/{codex,copilot}/hooks/session-start.py` | Same query identity/platform with supported stdout shape and structured noDelivery; don't copy old status/artifact router into new runtime. Existing `codex.test`, `copilot.test`, `task-only-context.test`, hook identity tests. |
| Claude opt-in `templates/claude/hooks/statusline.py:143-147` | Already v2-aware, keep exact platform query and no legacy normal fallback at final retirement. Display only; count inventory safely; never bind/transition. Shared-hooks tests cover actual stdin. |
| OpenCode `templates/opencode/lib/{trellis-context,session-utils}.js`, `plugins/{session-start,inject-workflow-state,inject-subagent-context}.js` | Context/breadcrumb/subagent paths partially v2. **Session-utils:75 and :318 still direct `taskData.status`**, gives unknown/root Planning for v2. Implement getTaskStatus/session snapshot from getCurrentDelivery without losing invocation platformInput. Preserve legal resolved-root alias validation/ephemeral injections. `opencode.test.ts` must invoke SessionStart and subagent, not only grep source. |
| Pi `templates/pi/extensions/trellis/index.ts.txt:1121-1133` | Existing current_task.current_delivery parsing; finish removing old normal fallback, ensure current phase/declared workflow not task status controls breadcrumb and planningDir. Registry tests compile/execute extension with v2 current JSON and noDelivery/error. |
| OMP `templates/omp/extensions/trellis/index.ts.txt:241-253` | Same projection; keep native host prompt mutation/event payload semantics; actual same query field and null planningDir on noDelivery. `omp.test.ts` executable extension tests. |
| Snow `templates/snow/hooks/write-trellis-context.py` | Delegates shared Python hook/Python context; test generated `.snow/hooks` paths, format/identity and no side effects with v2/non-Git and noDelivery. |
| Pull/prelude agent paths: Kiro, DSH, Grok, Kimi, Reasonix and registry-driven inline hosts | Must load exact supplied Task/Delivery context or current query with runtime continuation; manifest→PRD→design→implement ordering is per Delivery. No old `task.py start` permission/activation assumption. `templates/common/agent-preludes` and platform agents checked through their collector outputs and executable mock host readers where available. |
| Non-agent inline/workflow platforms: Kilo, Antigravity, Devin and others per registry | Inline is host execution hint, never stored phase or Task status. Entry templates consume active continuation and proper workflow owner, not pretend formal subagent gate. |
| Channel agents `templates/trellis/agents/*` | `getAllAgents()` populates `.trellis/agents`; implement/check/research roles must consume the same Delivery root and separate formal_check/review/quality-only profile. Tests inspect generated runtime agents, not merely common Skill markdown. |

Other owned sources: `templates/common/skills/{brainstorm,check,review-delivery,deliver,complete-task,before-dev}.md`; entry templates are actually under `templates/common` subdirectories (discover with rg --files, don't assume common/start.md); `templates/common/bundled-skills/trellis-meta/references/{local-architecture,customize-local,platform-files}/` contains multiple status-based examples and writer tables requiring coherent updates. Generated `.agents/skills/`, `.codex/agents`, `.claude`, `.opencode`, etc. need registry-derived parity for installed platforms, with known frontmatter/host adaptation differences respected.

Important historical consumer: `packages/core/src/mem/phase.ts` and `packages/cli/src/commands/mem.ts:470` define brainstorm `[task.py create, task.py start)` based on old command history. This is historical transcript slicing, not current workflow authority. Keep old recorded sessions readable, document old historical meaning, and ensure it is not presented as the new current Delivery phase. If adding new Delivery slicing, explicitly parse recorded Delivery owner/operation boundaries rather than silently reinterpreting Task start; don't add a competing runtime phase authority.

Registry test matrix per platform: generate/create in controlled root; verify current contract/Skill/direct owner handoff; current selected Delivery; no_current_task; no_current_delivery; stopped/delivered stale selection; missing/invalid binding; unsupported schema/API/custom owner; legal workspace aliases and nested-link refusal. For representative Python/JS/extension/pull classes execute carriers and snapshot *all* writes. Preserve host-specific output envelopes. External host application tests remain UNVERIFIED when host unavailable; registry-generated test green is not full release-matrix proof.

### 6. Default bootstrap and workflow retirement

`init.ts:567-588` constructs a legacy bootstrap with in_progress; `:601-666` strips old fields for explicit v2 and creates native manual planning Delivery only for exact bundled native-delivery-v1 content. `workflow-resolver.ts:43-47,226-236` defines two bundled IDs; `configurators/workflow.ts:100` defaults `workflowMdTemplate`; `update.ts:503-514` chooses template by active contract.

Before final switch, specify one actual native ID/template mapping and test `init` (no flag), `init --workflow native`, explicit native-delivery-v1 alias, direct create, `workflow --template native`, default configurator and `update` on migrated native install. They must agree. Existing native ID cannot point at retired legacy template while new no-flag defaults v2 and docs claim native current contract. Keep alias/version meaning explicit.

Bootstrap must retain onboarding guideline authority and concrete sample planning files, without Planning/Check/fullReview/readiness pass. Custom owner declaration receives only Task scope work until that owner supplies accepted_scope/profile/slice; supporting manual profile does not authorize native bootstrap semantic acceptance for Guru. Fresh default native can create known onboarding Delivery in planning under its own actual native contract, exactly as current opt-in does.

Normal reinit/update cannot silently convert legacy Task records. Different package install version retains installed-version strictness. Migration uses explicit source/target schema/API identities; ordinary update may apply only an already matching installation. Forced update/reinit must preserve custom workflow raw bytes and absent ownership hash unless bundled transfer selected explicitly (the D1 custom-workflow ownership repair already covers this, and must remain green).

### 7. Fresh paired Guru #531 evidence (read-only)

Actual inspected checkout: `/Users/wumengye/Documents/GoProjects/guru-trellis-worktrees/531-task-delivery-lifecycle`.

`docs/requirements-design-test-contributions/531-task-delivery-lifecycle/test.md:3-5` says draft, sole actual result authority, binds `ce36314b1ef5b44230883af9c1139a6244c13155`, Guru candidate uncommitted. `:9-16` marks T531-01..08 not executed, including complete D1/D2, #444, private publication/merge recovery, whole Completion/reopen, installed/reapply/old migration and #149/#155.

Actual implementation exists: `trellis/skills/guru-team/runtime/delivery_projection/adapter.py:21-39` imports installed target common modules under per-checkout namespace; `:82-118` uses public planning/current/apply/select/release/scope/check operations. It does not own another aggregate. Source existence is stronger than merely a plan, but does not prove installed consumer readiness.

Concrete latest-candidate incompatibility to send to its owner: `adapter.py:121-123` accepts candidate `kind` but calls `candidate_content_ref(self.root, paths)` without forwarding it. Upstream corrected function supports explicit kind so git_free artifacts *inside a Git worktree* retain full `mode & 0777`; inference chooses git and canonical 0644/0755. Example artifact 0600 with kind git_free produces wrong hash through this adapter and verification will fail on new upstream candidate. Consumer must pass recorded kind and verify git_free-in-Git permission scenarios. No Guru write was performed here.

`delivery_projection/tests/test_installed_projection.py:44-52` requires supplied upstream assets and copies scripts into a controlled test root; planning/check inputs are fixtures and D1 stop/D2 create is not full semantic D1/D2 delivery. This proves callable interface projections, not complete Guru preset install, native Skill auto-discovery, real private Publish/Merge or migrated business-shaped scenarios.

Matching retirement readiness is **not present in the inspected authority**. Required actual reference: exact new upstream candidate/package/API/schema + frozen Guru candidate + actual installed/reapply/migration results and required semantic recovery scenarios from Guru's authoritative test record. A source declaration of API1.0, Issue OPEN/CLOSED, uncommitted suite green or old ce36314b binding cannot substitute. Do not edit/message Guru from this research task. Parent owns cross-repository handoff separately.

### 8. Parallel ownership and dependency order

Existing workers: hook identity carrier repairs and Task rename/archive/history access. Do not overwrite/revert their files; serialize task_store/task_utils/session_storage changes after their fixes or assign continuing changes to the same owner.

| Owner | Exclusive responsibility / files | Dependencies |
| --- | --- | --- |
| A — Core migration/API | Explicit legacy export module, pure plan2 task projection validator, current-export retirement source seam; core task files/tests/package export. | Freeze schema/projection/error interface with B; actual normal export activation waits retirement prerequisites. |
| B — CLI migration/preflight | Separate migration2 executor, plan schemas, migration argv, typed workspace/session write targets, raw previews/replay; migrate.ts/new files and migrate2 tests. | A legacy + v2 exports; C session target rules. Avoid init/update mutation until D parent integrates prospective target preflight. |
| C — Python current inventory | task.py, tasks/task_queue/types/io/session_context, Task create/default source seam and tests/twins. | Coordinate existing rename/archive worker owning task_store/task_utils/session_storage. No simultaneous edits to their files. A canonical field/API interface. |
| D — install/carriers/docs | init/update/workflow/configurator resolver defaults, carrier/Skill/agent/meta changes and registry test set; preserve exact custom ownership. | Hook worker stability; B prospective-plan preflight; C current JSON query. Parent can own defaults/specs after workers finish. |
| Parent — integration/evidence | Public contract/breaking docs/specs, centralized build/full suites, packed install/native AC scenarios, exact review and consumer readiness boundary. | Sources frozen, independent reviewers and actual matching Guru evidence. |

Recommended sequence: (1) A/B contract freeze and migration pure validation in parallel with C v2 inventory/carrier correction; (2) B controlled migration/session/worktree executor and replay tests; (3) install prospective preflight + custom/defer handling integrated; (4) packed native migrated/install/reapply evidence and registry carrier execution; (5) exact candidate handed to Guru owner for matching consumption; (6) after actual readiness, final `/task` and default native retirement with public guidance and no old normal readers; (7) whole-scope independent review/fix cycles, two consecutive clean *whole #31* reviews only after AC evidence is genuinely complete.

Do not count repeated D1-only review as the user's two clean full-goal rounds. Missing AC12 is still an acceptance finding even when no local code defect is found. Source fixes and controlled tests can progress without cross-repository writes; reporting a real external blocker is preferable to fabricating joint acceptance.

### 9. Related specs and external references

Read `.trellis/workflow.md` (workflow-owned phases/continuation; no mutation), task `prd.md/design.md/implement.md`, and these actual specs:

- `.trellis/spec/cli/backend/{delivery-lifecycle,commands-migrate,commands-workflow,task-lifecycle,script-conventions,workflow-state-contract,platform-integration,trellis-core-sdk,installed-version}.md`.
- `.trellis/spec/core/backend/index.md` and package-wide guidelines it identifies.
- `.agents/skills/python-design/SKILL.md`: type-first discriminants, deep modules, explicit errors and centralized schema ownership. New migration/history boundaries should absorb complexity instead of spreading raw dict/version fallbacks into every caller.

Public sources: https://github.com/castbox/Trellis/issues/31; https://github.com/castbox/guru-trellis/issues/531. Current task schema2 / Delivery API1; migration plan2 proposed; old plan1 retained for its original explicit migration operation. Core/CLI engines currently Node>=18.17, tests must preserve installed Python3.9 supported code behavior. No release version was assigned by this research.

## Caveats / Not Found

- There is no `research.jsonl` in this Task (read attempted; absent). Research role did not load implement/check manifests. Task PRD/design/implement and relevant specs supplied sufficient role context.
- This is source/evidence research; no new semantic gates, full suites, install/migration execution, Task lifecycle changes, commits, pushes or Git operations occurred.
- Memory quick search produced broad unrelated Trellis/Guru records; no prior memory facts were used to form findings.
- Paths may move due to the concurrent owned hook/rename/archive fixes. Re-read exact affected files before implementation.
- Guru private state mapping and #149/#444/#155 installed evidence remain its owner boundary. No statement here means original business sessions recovered.
- Full multi-host release matrix, unavailable platform hosts and software release are not proven by this research. Relevant targeted consumer tests still need actual execution after implementation.
