# Task/Delivery contract design

Status: Upstream D1/D2 increments delivered in PR #32/#33; acceptance scope revised by the human on 2026-10-13 to independent upstream delivery without downstream or joint gates. Requirement authority is `prd.md` / Trellis #31. Evidence and baseline anchors are under `research/`. This document records the accepted design; the shipped `packages/cli/src/templates/trellis/delivery-contract.md` and versioned SDK types define the implemented public interface. Legacy global SDK/execution retirement is separately scoped future breaking-release work. This revision changes acceptance ownership, not public runtime types or transition semantics.

## 1. Source design disposition

| Source section / current capability | Disposition | Proposed landing and rationale |
| --- | --- | --- |
| #31 “first establish Delivery”, “three responsibilities”, identity/artifacts | retain | Sections 2-4: distinct Task authority, stable Delivery identity and one lifecycle for D1/D2. No Task Planning. |
| #31 Markdown control plane and deterministic runtime | retain | Sections 3-5: closed operation APIs validate objective facts; AI owners decide scope, applicability, route and sufficient evidence. |
| Guru global workflow multi-Delivery, pair guards, Reconcile, Completion returns | generalize / keep-in-Guru / migrate | Sections 4-6: generic phase/rework/result rules; keep pair classification and actual integration/review semantics in Guru; replace status/activate-vs-resume routing through #531. |
| Guru Delivery Review independent slice, remaining work and Refs-only | generalize / keep-in-Guru | Reviewing has independent full-review and readiness results. Native readiness assesses its profile; Chinese payload/Refs policy stays Guru-owned. |
| Guru Publish private cycle and transaction | keep-in-Guru / migrate | Section 6: private cycle-to-Delivery projection; transaction substeps never become public phases. Stable Delivery identity cannot reuse a HEAD/payload-derived cycle. |
| Guru Merge expected head, trailers, delivered/completion_seed and history | keep-in-Guru / generalize / migrate | Sections 5-7: typed delivery facts and history query; actual remote discovery and old identity mapping remain Guru-owned. |
| Guru Completion whole scope, causal evidence and validation-only reopen | generalize / keep-in-Guru | Section 7: minimal current-scope completion result; Guru retains causal judgment and exit graph. Native has its own real whole-task owner. |
| #31 local/manual/no-PR completion; task-free/manual boundary | retain | Sections 5 and 7: three explicit outcome profiles; no GitHub condition in the universal terminal phase. |
| #31 withdrawal, generation, historical success versus current gate | retain | Sections 4 and 7-8: stopped exit, immutable delivery facts, generation-specific result applicability. |
| #31 interface-first, version diagnosis and compatibility exit | retain | Section 8: staged API candidate, explicit install cutover, single authority per Task and finite retirement conditions. |
| Guru #292 unique Author and pre/final Architecture purposes | migrate via #531 | Section 6: capability follows each Delivery; do not implement or freeze its still-proposed profiles upstream. Actual fresh #292 contract controls Guru mapping. |
| Guru #530 clean post_commit candidate | retain behavior / reuse actual delivered fix | Sections 4 and 6: commit is an independent fact, never a compulsory transition or another pass; #531 owns Guru adoption. |

No accepted source design is rejected or changed. The phase names, aggregate storage and typed native profiles below are technical proposals within the source constraints, subject to this plan's review.

## 2. Identity, schema and artifact ownership

### 2.1 One canonical aggregate

Use one versioned `task.json` aggregate per Task, containing Task metadata, Delivery relationships/records and the minimal current/historical completion facts needed by continuation. This keeps a phase/result update within one atomic file write and reuses Task identity/path boundaries. It avoids a second ledger, event log, per-stage audit file or synchronization between Task and Delivery stores. Trade-off: the file grows with real Deliveries and completed Task generations; it does not grow with every check, retry or command. Only the current result per gate is stored; prior planning versions resolve through Git or the existing task artifacts.

The new Task schema is `schema_version: "2.0"`; Delivery API is `1.0`. Keep `id`, mutable `name`, `lifecycle_generation`, `source`, title/description, scope/package/dev_type, priority, creation time, branch/base/worktree context, children/parent, relatedFiles/notes and JSON `meta`. Remove `status`, Task-level `commit`, `pr_url` and `completedAt` from the new writable schema. Branch/worktree remain context locators, not identity or delivery success. `meta` cannot carry authoritative phase, candidate, gate or completion state.

Add exactly these domain fields:

| Field | Type / purpose / direct consumer |
| --- | --- |
| `accepted_scope` | `AuthorityRef | null`; current whole-Task requirements/acceptance authority. Null is legal just after creation; execution and Completion require a resolved authority. |
| `deliveries` | `DeliveryRecord[]`; Task-owned relationships, phase and minimum recoverable results. Readers, formal owners, Completion and migration consume it. |
| `completion_results` | `TaskCompletionResult[]`; actual completed facts keyed by generation and accepted scope. Completion/Closure/reopen consume them. No per-invocation review history. |
| `closure_results` | `TaskClosureResult[]`; completed/no-mutation source dispositions tied to an exact completion result; archive/closure recovery consume them. No cleanup plan or authorization data. |

`TaskKey = {task_id, lifecycle_generation}`. `DeliveryKey = {task_id, lifecycle_generation, delivery_id}`. Delivery IDs are portable opaque UUID strings allocated before Planning; never derived from directory, commit, PR or scope text. Exact/casefold identity checks and selected-record strict validation retain #29's separate reservation projection.

`AuthorityRef = {locator, revision}` identifies accepted content, using a repo-relative path with an immutable Git revision, an exact external authority revision, or a deterministic content SHA-256 for non-Git material. It is a freshness locator, not approval. A `SliceScopeRef` references that authority and its selected requirement/acceptance anchors; AI chooses the anchors. Runtime verifies shape, identity and locators, not scope adequacy.

### 2.2 Delivery record

| Field | Contract |
| --- | --- |
| `id`, `lifecycle_generation` | Stable identity and creation generation; immutable through rework. Task ID comes from the containing aggregate. |
| `scope_ref` | Slice scope and its current relation to accepted Task authority; set by the workflow scope/planning owner. |
| `planning_root` | Contained relative directory `deliveries/<delivery_id>/`; no path derived from user prose. |
| `phase` | Closed enum from Section 4. |
| `plan_ref` | Current Delivery plan/artifact revision, or null before planning. |
| `candidate` | `CandidateRef | null`, with committed/uncommitted/Git-free content explicitly distinguished. |
| `results` | Nullable fixed slots `planning`, `check`, `full_review`, `readiness`; each holds the actual producer's minimal semantic result and applicability inputs. |
| `publication_result` | Null or minimal published facts bound to Delivery/candidate/result, without the publisher's private transaction. |
| `delivery_result` | Null or actual profile-specific delivery facts; immutable after success. |
| `stop_result` | Null or scoped withdrawal/supersession result; not delivery/acceptance. |

The generation on a Delivery records where it originated. On formal Task reopen, historical Deliveries retain their original generation; current execution can select only current-generation nonterminal Deliveries. A cross-generation history query is explicitly different from current execution selection.

### 2.3 Planning files

Task root `prd.md` holds the entire Task requirements and acceptance. Each Delivery owns `deliveries/<id>/{prd.md,design.md,implement.md,implement.jsonl,check.jsonl,research/}`; its PRD refers to the Task scope and defines this slice's behavior/acceptance. Task requirement revisions are not a Task Planning state. D1 uses the same paths as D2. JSONL readers and artifact display resolve the selected Delivery and also load the Task requirement authority; no fixed root-file fallback after migration.

Delivery plan revisions keep the same identity and current paths. For Git projects, record a fixed plan revision at the accepted candidate; later plans do not destroy D1 recovery. For non-Git projects, each real Delivery has a distinct retained directory; revision within one undelivered Delivery updates its own files, and accepted final artifacts remain retained. Do not clone artifacts on every gate invocation. Old root design/implement/JSONL are preserved and explicitly mapped/copied once into the reviewed migrated Delivery; root PRD becomes or references the overall Task authority without silently rewriting its business content.

## 3. Public API and ownership

### 3.1 Package/runtime boundary

Core exports types, schemas, pure transition/result validation and file-store operations through the public Task subpath, with no terminal, argv or process-exit behavior. Python implements equivalent deterministic record behavior and session/path operations in shipped templates. A shared fixture corpus verifies schema/transition/result parity; Python never shells out to an optional Node install. CLI installation/migration and rendered context remain CLI-owned.

Proposed closed operations (both languages consume equivalent JSON input/output):

| API / Python command | Responsible caller and deterministic boundary |
| --- | --- |
| `createDelivery` / `delivery.py create --input` | Current workflow Delivery-creation owner supplies TaskKey and selected slice; allocate or replay the exact supplied creation identity and initialize planning with empty results. No automatic scope splitting or task creation. |
| `bindTask` / `task.py start` | Explicit task selection only. It neither verifies plan sufficiency nor changes Delivery phase. |
| `bindDelivery` / `delivery.py select --input` | Bind an exact current-generation Delivery to this session; verify Task relation and eligible nonterminal identity. |
| `getCurrentDelivery` / `delivery.py current --json` | Return `current`, `terminal_delivery` awaiting owner selection release, `no_current_delivery`, `no_current_task`, or a concrete resolver error. Never pick the sole inventory item. |
| `listDeliveries` / `delivery.py list --json` | Task-related public records; historical outcome refs are distinct from current results. No remote/private-state discovery in Core. |
| `beginCheck` / `delivery.py begin-check --input` | Implementation owner hands the exact candidate to formal Check. Only implementing -> checking. |
| `recordGateResult` / `delivery.py record-result --input` | One declared role records its actual result. Allowed phase effects and objective required predecessor slots are fixed in Section 4. |
| `returnToOwner` / `delivery.py rework --input` | Current semantic owner supplies the qualified target role, reason refs and affected results. Validate legal backwards edge and identity; do not choose the affected owner in code. |
| `recordPublicationFact`, `recordDeliveryFact` / `delivery.py record-publication`, `record-delivery` | Publication/delivery owner normalizes actual profile facts; distinct current-execution and historical-success recovery inputs. No remote action in these APIs. |
| `stopDelivery` / `delivery.py stop --input` | Scope withdrawal/supersession decision and current stage owner stop an undelivered slice. Terminal outcome is stopped, with no fabricated delivery. |
| `recordTaskCompletion`, `recordTaskClosure` / `task.py complete`, `closeout` with structured input | Completion/source-disposition owners record their actual minimal result. Neither command judges scope or calls GitHub. |
| `reopenTask` / `task.py reopen --input` | Explicit whole-Task reopen; preserve identity/history, increment generation and set current authority. Clear stale execution selections through existing session ownership; no automatic Delivery. |

Input common fields are `api_version`, exact key, `owner_role`, `owner_id`, and the operation's expected phase/identity/content inputs. A gate result includes `result_id`, closed role/outcome, producer identity, its applicable scope/plan/candidate/base/obligation refs and minimum evidence locators. Only applicable refs belong in that role's input: Planning need not bind unrelated candidate/base clocks. Full review binds the exact complete reviewed diff; readiness binds its full-review result and payload/target obligations. Do not transport a full review report, private checkpoint, authorizations or a universal digest bundle.

A successful write returns the exact key, current public phase and recorded result ref. Same key/role/retained result with identical input returns the same result without rewriting; a retained result ID with different content is `result_identity_conflict`. A revised formal gate invocation gets a new producer ID. Cleared/replaced gate IDs are not retained by the minimal current-slot model; missing-result recovery re-enters the original semantic owner and cannot rebind an old ID to new inputs. Terminal/completion/closure results remain retained. Normal writes validate the expected record/raw preimage and use the existing atomic-write conventions; stale preimages stop rather than overwrite unrelated edits. No new distributed locks or cross-owner atomic transaction protocol is introduced.

Do not expose `set-status` or arbitrary phase strings. The full-record serialization helper validates complete shape and immutable identities; formal writers use the closed operations, not a wholesale record overwrite to bypass predecessors.

### 3.2 Workflow owner declaration

Add one structurally checked `[trellis-runtime-contract]` block to the active Markdown workflow. It declares `delivery_api=1.0`, `task_schema=2.0`, supported delivery profiles and exactly one owner for each closed role: Task scope, Delivery creation, Planning acceptance, implementation, formal Check, full Review, readiness, publication, delivery, Completion and source disposition. The declaration does not define a new state graph or embed semantic policy in JSON. The Markdown body defines each role's semantic gates, routes and supported-profile completion conditions. Fixed public transitions remain the upstream contract.

Runtime validates that a submitted role/owner pair belongs to this active workflow. This is contract ownership validation, not user authorization or an attack model. Missing/duplicate/unsupported roles or API versions are explicit errors; there is no fallback to native semantics. The sole continuation block reads this projection and selects the correct AI owner. Skills discovered directly load/defer to the active workflow before doing formal work.

Native owners use existing main-session planning/implementation control and `trellis-brainstorm`; formal Check is an explicit profile of `trellis-check`. Add narrowly scoped native `trellis-review-delivery`, `trellis-deliver` and `trellis-complete-task` entries because the current native flow lacks full Review/readiness, profile-specific delivery and whole-task Completion. `trellis-finish-work` becomes the closeout/archive launcher consuming Completion/source disposition; it no longer decides a Task is complete from a commit or archive readiness. No duplicate native Planning Author is added.

`trellis-check` profiles: `quality` runs ordinary checks and produces no phase mutation; `delivery_check` is formal Check owned by the selected workflow. Independent full Review can dispatch the existing checker carrier with a dedicated read-only `delivery_review` profile and fresh full-range context; it reports findings to the formal review owner and performs no self-fixes or nested implementation. Carrier identity is not another semantic writer. Templates/preludes must preserve these distinctions on subagent and inline hosts.

## 4. Closed phases, gate facts and recovery

The public phase enum is `planning | implementing | checking | reviewing | publishing | delivered | stopped`. It is intentionally coarse. `blocked` is an operation/owner response, not a durable phase. Commit and Publish transaction substeps are not phases.

| From | Operation / actual result | To | Unique semantic role / objective checks |
| --- | --- | --- | --- |
| none | Create Delivery | planning | Creation owner; valid TaskKey, slice refs and new stable ID. |
| planning | Planning accepted | implementing | Planning acceptance owner after current artifacts and applicable review/acceptance; real planning result, current plan/scope. No activation of Task. |
| implementing | Begin formal Check | checking | Implementation owner; actual candidate and applicable plan. A commit is optional for the native manual path. |
| checking | Check passed | reviewing | Formal Check owner; actual required checks and bound candidate. Check result alone never means full review. |
| reviewing | Full Review passed | reviewing | Full Review owner; exact full candidate/range and current formal Check. Store full-review result; readiness remains independent. |
| reviewing | Readiness ready | publishing | Readiness owner; current full Review, applicable slice/profile/payload and remaining work assessment. |
| publishing | Publication succeeded | publishing | Publication owner; record actual publication facts. A PR Ready result does not mean delivered. |
| publishing | Applicable delivery succeeded | delivered | Delivery owner; current normal gate chain and exact profile outcome. |
| any nonterminal | Qualified rework | earliest affected same/earlier planning/implementing/checking/reviewing | Current semantic owner chooses a legal same/earlier role, affected results and reason. This cannot advance a phase. Retain valid facts/results; require new applicable gate results before forward use. |
| any nonterminal | Whole scope withdrawn/superseded | stopped | Proper scope decision plus current stage owner. Keep candidate/publication/PR facts and stop reason. |

Delivered/stopped identities never return to execution. New implementation after actual delivery uses a new Delivery; evidence-only work can remain Task Completion. History recording can recover actual delivered facts even when public phase is behind or the original gates are no longer available/current. This is the separate `historical_success` input of the original delivery role, not the normal forward transition and not an artificial gate pass. It records the terminal delivery fact and leaves missing/obsolete gate slots missing/obsolete. Continued actions and Completion still require current semantic judgment.

### Candidate and evidence applicability

`CandidateRef` separates content from commit: `{content_ref, head_ref?, base_ref?}` plus the exact covered content/range locators needed by that profile. A Git SHA is a commit fact; content identity can be a deterministic SHA-256 of the owner's explicit candidate path set (bytes, relative path and mode), excluding canonical lifecycle/session/private-result files. Include actual business docs and tests in the candidate where relevant. Planning artifacts are bound separately through `plan_ref`. Computing a result must not invalidate itself merely because the result was written to task.json.

Git-free/manual candidate refs use retained files or immutable exported artifacts plus their content hashes. Git candidate modes normalize the owner execute bit to 0644/0755, while git_free keeps full 0777 permissions; explicit candidate kind controls verification and optional hashing arguments. Manual artifacts in Git worktrees may choose git_free. Git verifiers discard inherited GIT_* repository overrides. local_commit facts require full immutable lowercase 40/64-hex OIDs and actual commit objects, including historical recovery; mutable refs are not facts. Lifecycle APIs validate locators/content matches; the workflow owner chooses the candidate and relevant obligations. Runtime never decides “these files suffice.” Independent Review binds the entire intended delivery change, not just a most recent chunk or a changed-path whitelist.

A changed token is a reason to obtain a producer applicability judgment, not automatic full-chain replay. The original owner may rematerialize an applicable same-result outcome against semantically equivalent updated refs after actual review of the change. Results affected by content, applicable authority, baseline or gate obligations require that owner's fresh gate. Continue/hook/renderers cannot perform this rebinding. Base integration preserves old commits; Check/Review bind the new exact candidate/range. If no real delta remains, use existing commit facts and perform the necessary gates without `git commit`.

### Result recovery

A minimal public result contains enough role/outcome and exact applicability inputs for its producer to read back its own recorded result. It is not inferred from `phase`. If that result is absent or cannot be shown current, re-enter the producer's formal semantic invocation. Native result recovery and Guru private checkpoint/transaction recovery remain producer-owned. A reader does not call `recordGateResult` on another producer's behalf.

When a terminal outcome is recorded, existing session APIs release matching execution selections. A stale selected terminal Delivery remains recognizable as `terminal_delivery` until the owner clears selection; it is never converted to no-Task or another Delivery. Task binding can remain for Completion. An interrupted secondary session-clear write is recovered by the same operation owner; no file deletion or cross-repository transaction is necessary.

## 5. Native delivery profiles

The native workflow supports these closed profiles with explicit Markdown conditions:

| Profile | Delivery condition and recoverable outcome | Limits |
| --- | --- | --- |
| `local_commit` | Current plan, Check, complete Review and slice readiness; actual reviewed content exists in the exact local commit. Record commit/content identity after the deliver owner reviews acceptance. | No PR/merge is required. Existence of a commit alone is not delivery. Real dirty work follows the existing exact commit/confirmation owner. |
| `manual` | Same semantic gates; actual accepted retained/exported artifact with immutable locator/content identity. Record acceptance result and artifact fact through the deliver owner. | Supports Git-free projects and manual/no-PR outcomes. No synthetic commit, PR, merge or claim of remote deployment. |
| `pull_request` | Same public gates and current native PR publication owner; delivery requires live merged PR and exact reviewed content/merge identity under the explicitly chosen repository-supported merge policy. | Actual remote confirmation remains separate. Upstream does not universally require Guru merge method/trailers. |

Profile is selected in Delivery Planning based on the current intended outcome, not guessed from whether a repository has a remote. Native PR-based publication is a bounded implementation within `trellis-deliver`: preview the exact action, execute only authorized remote operations, reread exact postconditions, and recover via live facts/original plan. Do not add a new generic transaction engine; reuse current Git/GitHub mechanisms. Local/manual acceptance never implies deployment, external success or source Issue closure.

`publication_result`/`delivery_result` are discriminated profile outcomes. For PR outcomes store repo/PR, reviewed head, actual merge/target facts and producer result ref. For local outcomes store commit/content refs; for manual outcomes store artifact/content refs. Result identity is producer-stable across stdout/projection recovery. Extra Guru payloads and private stages stay in Guru.

## 6. Concrete Guru producer -> public input -> public output -> consumer mappings

These examples use actual observed public contracts. New upstream JSON shape is proposed; #531 owns its adapter and actual producer invocation. TaskRef is a locator resolved to a validated TaskKey, never an identity inferred from path. Upstream does not parse another Skill's private artifact.

| Existing producer / observed fields | New input and additional fact authoring | New output | Existing/new Guru consumer |
| --- | --- | --- | --- |
| Task binding/checkout: TaskArtifactDTO `{task_id,task_ref,lifecycle_generation}` and CheckoutResolution/BranchBinding | Exact TaskKey through the existing checked checkout; explicit stable DeliveryKey created before Planning and selected in session schema 3. Slice/policy is provided by its semantic owner. | `current` with key, scope/plan refs, phase and result refs | Current Guru workflow owner resolution; no second Delivery storage. |
| Planning Approval and activate/resume_execution | Original Planning/Architecture/Wording/Approval chain supplies actual accepted planning result to `recordGateResult(role=planning)`. | Same Delivery moves planning -> implementing; stable key/result ref | #531 migrates first activation and replan resumption into one Delivery entry. #292 still owns Author capability; native brainstorm defers. |
| `guru-check-task:passed` and complete `guru-review-branch:passed` | Original owners bind their actual candidate/full-range refs; Check records `check`, Branch Review records `full_review`. Reconcile and TaskCommit remain original owners. | checking -> reviewing, then full_review result in reviewing | Existing pair guards and Delivery Review; no clean-candidate compulsory commit. |
| Delivery Review `ready`: `{task_ref,delivery_cycle_ref,reviewed_head,pr_title,pr_body,remaining_work_state}` (public schema 1.0) | Readiness owner normalizes actual ready result to `{key,role:"readiness",outcome:"ready",result_id,inputs}`. Inputs bind current full Review, slice and exact payload obligations. The selected DeliveryKey comes from the formal invocation, not cycle text. | phase publishing, readiness result ref | `guru-publish-task-delivery` retains its original `review_ready` input/profile and payload. Public phase is an added projection, not substitute evidence. |
| Publish `ready_for_merge`: `{task_ref,delivery_cycle_ref,repo_ref,pr_number,expected_head_sha,publication_body_sha256}` (schema 1.0) | Publisher calls `recordPublicationFact` with the same DeliveryKey and actual PR/head/body/result facts. Private cycle remains in its transaction/adapter. | Publication fact; phase remains publishing unless a current earlier affected owner is pending | `guru-merge-task-delivery:ready_for_merge`; private recovery still uses same_plan_resume, never new remote mutation from phase. |
| Merge `delivered` (schema 2.0): `task_artifact` plus `merge_result` containing TaskId/ref/generation, cycle, repo, PR, reviewed head, merge commit and result_id | Original Merge owner calls `recordDeliveryFact` with `profile=pull_request`, exact key and live normalized merge facts; `historical_success` when recovering already-completed mutation. | Immutable DeliveryResultRef and delivered fact | Original `completion_seed` still projects task_artifact + merge_result to Completion; #531 extends identity/input compatibly using upstream ref. Merge never completes Task. |
| Completion `completed` (schema 2.0): ResultRefDTO `{task_id,lifecycle_generation,result_id}` | Completion owner authors current accepted_scope and actual applicable evidence refs, then `recordTaskCompletion`. A bare old ResultRef is insufficient without its producer's live binding. | TaskCompletionRef keyed to current generation/scope and producer result | `guru-complete-task-closure:completion_approved`; Closure projects its actual disposition through public closeout. |

Completion `remaining_work`, `evidence_pending`, `additional_delivery_required`, `requirements_revision_required`, `implementation_revision_required` and `blocked` keep their actual declared Guru consumers. Evidence refresh retains its same-generation merge result, or the Reactivate-only archive/current evidence anchor. It does not create a Delivery. No runtime route inferred from those result names replaces the semantic owner.

### Worked projection/recovery

Assume selected Task `T`, generation 0, stable Delivery `D1`. Review produces cycle `C1` for head `H1`/payload `P1`; Publish recovers one PR 42 and emits ready_for_merge; Merge actually produces commit `M1` with result `R1`. Public recording is delayed. The adapter invokes the original Merge recovery against PR 42/H1/M1, then writes `{key:{T,0,D1}, result_id:R1, profile:pull_request, repo_ref, pr_number:42, reviewed_head:H1, merge_commit:M1}`. The output is the same Delivery result on every identical retry; there is no push/create/merge action in the public API.

If authority changes while projection is delayed, retain the actual M1 outcome as historical success. Original owners judge which current gates are affected; the public fact neither creates their passes nor demands repeating M1. If a pre-delivery rework changes H1/P1 to H2/P2, cycle C2 differs but D1 remains stable. The undelivered current publication slot retains P1 until verified P2 replaces it under a new result ID, the same PR/repository/original producer, and normal fresh readiness or historical-success recovery. Target changes require actual target verification and fresh applicable obligations for normal forward use. Historical P2 recovery never invents missing gates; store verification rejects stale P1 after live P2. Delivered facts remain immutable, and empty terminal publication recovery must match the delivered repo/PR/head/target/candidate. Replaced IDs stay with the original producer rather than a new upstream ledger. A next independent slice is D2. Historical C1/C2/PR mapping is authored by the Guru history/migration owner only where its recovery consumer needs it; do not persist an upstream cycle ledger.

## 7. Whole Task completion, closure and reopen

`TaskCompletionResult = {TaskKey, accepted_scope, result_id, owner_id, outcome:"completed", evidence_refs}`. It is recorded only after the AI Completion owner reviews the entire current scope, unallocated/remaining work, applicable historical outcomes and required evidence. The runtime checks identities and objective refs, not sufficiency. Task display derives “in progress/completed” from a matching actual result; there is no separate writable Task status.

The native `trellis-complete-task` has closed semantic exits matching the needed responsibilities: completed, remaining_work, evidence_pending, additional_delivery_required, requirements_revision_required, implementation_revision_required, blocked. They are native workflow routes, not a new Task state enum. If required evidence is absent, wait for a concrete refresh condition; no constant polling, synthetic Delivery or unsafe production replay.

Closure consumes exact TaskCompletionRef and current structured source. Native default is `no_mutation`: completion does not auto-close even an exact-source Issue. A user-requested Issue disposition uses the existing independent manual/GitHub boundary, then the source-disposition owner records actual closed/no-mutation facts tied to Completion. Guru retains its own reviewed disposition/confirmation owner and projects the result. Archive accepts current Completion and current source disposition; it moves data/clears bindings and does not write success or completedAt. An explicit archive recovery can move the same already-completed generation without repeating judgment. Cleanup is a separate, optional exact-resource action; only its existing owner records resource recovery state, outside formal Delivery gates. No new generic cleanup result field is needed for phase routing.

Parent/child progress derives each child's current completion authority, including archived history lookup. A missing child is unknown/missing, not done. A child's completion is evidence for parent Completion, never an automatic parent pass.

Reopen requires explicit owner action for the same Task identity and its unique historical archive/current generation. It increments generation, retains Delivery/completion/closure history and establishes current accepted_scope. No old current phase or gate is projected into new generation. Reopen can route directly to validation-only Completion; new implementation uses a new Delivery. Previous archive content can be located by fixed Git revision; no in-place erasure of historical completion or artificial redelivery.

## 8. Versioned rollout and explicit migration

### 8.1 Compatibility window

The two substantive upstream increments under this Issue (see `implement.md`) are:

1. Interface/runtime candidate: expose the new contract at explicit `/task/v2` and ship Delivery-aware opt-in native runtime/templates. Existing `/task` and existing un-migrated installed records remain version-1 authority during the finite window. Each Task is either old or new; it is never dual-written. No current workflow is silently replaced.
2. Reviewed migration/native default: provide plan-2.0 old-install migration and make fresh native installations use schema 2 / Delivery API 1.0. Schema-2 consumers query Delivery and reject old selected records. Preserve legacy `/task`, plan 1.0 and explicit legacy workflow as isolated compatibility paths. Global `/task` replacement and inferTaskPhase/TaskPhase/legacy execution retirement belong to a separate future breaking-release scope, not this D2 or #31 acceptance.

Package versions remain Core/CLI lockstep. Actual candidate version/commit is assigned by the implementation/release owner; do not freeze an uncreated release number in this plan. During the window, schemas are explicitly selected by versioned API/installation declaration, not best-effort field inspection or a reader fallback. Old installed clients stay pinned until their owner migrates them.

New native installations can use the complete new model before Guru integration completes. An installation with a custom/marketplace workflow can switch only when its owner supplies a matching runtime declaration and migration consumer. `init`, `update`, workflow switch/apply and migration preflight must reject incompatible combinations before replacing files. For an old user-managed workflow, preserve content and emit an explicit incompatibility diagnosis rather than activate an unreachable native fallback. Upstream cannot promise to change Guru's installer; #531 owns its preflight/apply side, while Trellis supplies queryable version/contract facts.

Fresh no-flag initialization adopts bundled `native-delivery-v1` independently of
future global breaking retirement. During this staged window, explicit
`native` identifies the named legacy compatibility workflow; it is not the new
installation default. Existing no-explicit-workflow reinitialization preserves
the actual installed workflow and its managed/user ownership, including managed
legacy installs. Omitted `task.py create --schema-version` follows the validated
installed declaration: schema 2 for a declared Delivery owner, legacy only for
the retained undeclared compatibility installation. Explicit mismatches and
malformed/unsupported declarations fail before writes. Declaration-based format
selection never supplies scope acceptance, a Delivery or semantic gate success;
custom declared workflows continue to receive a Task-only bootstrap. Current
SDK/legacy global retirement is outside #31, with the separate obligations below.

The bundled optional Linear hook follows the same schema-2 boundary: a Task
start is selection only and performs no external state or description mutation.
Direct archive synchronization requires an actual current-generation Completion
matching accepted scope before mapping the configured external issue to Done;
it never creates that result. Read and metadata linking use canonical checked
Task IO before external calls, rejecting invalid aggregates without side effects.
Legacy mappings remain explicit compatibility behavior. Controlled verification
uses a fake client exclusively; this Task authorizes no real external messages.

For #31, accept the schema-2 native default, versioned `/task/v2` API, reviewed old-install migration, controlled custom-workflow ownership and version diagnosis using upstream-owned evidence. No Guru candidate, downstream readiness or joint evidence is a completion prerequisite. Retain `/task`, plan 1.0 and explicit legacy workflow as isolated compatibility paths; schema-2 installations cannot execute their old records or double-write authority. Global SDK replacement and destructive legacy retirement belong to a future breaking-release scope that must independently publish replacements/version incompatibilities and prove native migration plus affected-consumer cutover. No dependency on #531 is created.

### 8.2 Migration plan 2.0

Extend `trellis migrate` with an explicitly discriminated plan 2.0; retain plan 1.0 only for its original predecessor-to-current-schema operation during the compatibility window. Do not silently change 1.0 projection semantics. New plan includes source/target schema+API identities, complete reviewed Task/Delivery projections, raw expected preimages, exact session projection/write decisions, owned template/workflow decisions and explicit historical archive dispositions. No authorization or business review history belongs in the plan. It remains caller-private outside tracked files.

| Old fact | Required reviewed disposition |
| --- | --- |
| Stable TaskId/source/generation, task-tree relations and metadata | Preserve exactly; absent old generation may become zero under existing migration rules. Task scope is supplied by the proper authority owner. |
| planning/in_progress/completed/done | Old diagnostic hint only. It cannot prove Planning approval, Check, Review, publication or Completion. Recover actual original-owner results or enter the earliest unproven owner. |
| Root planning/JSONL | Preserve bytes and map to the actual selected Delivery; do not guess current slice or overwrite whole Task scope. |
| Task commit/pr_url/completedAt | Preserve as reviewed historical fact locators in the applicable Delivery/Task result or historical source snapshot. Missing ownership is a preflight conflict for that selected projection; do not attach everything to D1. |
| Existing PR/cycle/merge history | Upstream receives public normalized facts. Guru owns private discovery and mapping; old merge/gate data never supplies new-generation pass. |
| Session schema 2 TaskKey | Preserve exact Task selection; add `delivery_id:null` or an explicitly reviewed selection in session schema 3. Do not infer D1 from status or file presence. |
| Archived Task | Inventory and preserve history-only source by default. Ordinary history readers may expose identity/locators without using status for phase/Completion. Reopen or explicit archive conversion requires owner-reviewed schema-2 projection against exact bytes. |
| Unrelated old active record | Explicit defer/history-only disposition can preserve it without making it usable in the new lifecycle or blocking a different valid target (#29). |

If an owner cannot establish scope/Delivery attribution or gate input, preflight reports the exact unresolved selected record and owner requirement; it does not create a fake phase/result or rewrite Task identity. A reviewed migration can establish a planning Delivery when fresh Planning is actually required; otherwise the original producer restores still-applicable real results. No universal downgrade from old status and no new arbitrary recovery state are needed.

Preview enumerates all prospective writes/removals/preserves, expected bytes/modes and compatibility conflicts before the first write. It covers registered sibling worktrees and exact owned common-dir and workspace-local session records; every live `.json` session, including preserve-only data, requires an explicit frozen source snapshot in `plan.sessions`. Omitted or newly appeared sessions reject before writes; execution never adopts their live bytes into a reviewed plan. No unregistered path scanning or global pointer fallback. Caller backs up the exact write set. Existing atomic writes and old/target byte recognition support same-plan ordinary-failure resume; unexpected edits require review. Restore only backup paths/newly-added paths before new business writes; after new business work, use forward reconciliation or owner-reviewed rollback, not git reset. No upstream migration parses Guru private state or cleans resources.

## 9. Integration footprint and trade-offs

Implement through the canonical Core Task API, shipped Python common modules/delivery.py/task.py/context, template collectors, native/common Skill/agent templates, shared/JS/extension platform carriers, init/update/migrate/workflow preflights and owned dogfood copies. Specs `task-lifecycle`, `workflow-state-contract`, `commands-migrate`, `commands-workflow`, `platform-integration`, `trellis-core-sdk` and bundled meta references must converge with the public contract. New runtime files must actually be included by template collectors and package builds.

The owner block and continuation remain Markdown authority; hooks provide one structured Task/Delivery/result-availability projection with invalid-binding/API diagnostics, plus the active workflow content. `*-inline` is an execution-mode hint only and never stored as a phase. No second route matrix in SessionStart, statusline, commands or SDK phase inference.

Marketplace/workflow mirrors and docs-site are separate Git repositories (submodule refs observed in research). Upstream does not advance a gitlink to pretend another repository implemented migration. Their edits/commits or upstream handoff require explicit ownership and applicable authorization before mutation; all outstanding profile-template compatibility is reported. If an external template lacks a v2 contract, the old version remains pinned and migration stops for that installation.

The aggregate is simpler than separate Task/Delivery ledgers; closed APIs are narrower than arbitrary transitions; bounded native profiles preserve real support without hardcoding Guru. Added native owner entries have actual direct consumers and missing semantic responsibilities. The accepted design does not add background automation, release-only stages, audit state, persisted user consent or a general workflow policy engine.

## 10. Whole-scope review-loop corrections

The human-authorized completion goal requires two consecutive independent whole
Issue reviews without confirmed defects or missing required evidence on the
same stable candidate. The 2026-10-13 revision accepts upstream native/default/migration and interface
behavior only. Global legacy retirement and actual Guru installed evidence are
outside this scope; they cannot invalidate an otherwise complete upstream round. Review records remain evidence, not
another lifecycle authority; current source Task is not silently migrated.

### 10.1 Hook identity continuity

A hook must use the same detected platform for the exact Task and Delivery
queries. Native platform session input remains sufficient when no environment
context override exists. Override precedence and Codex SubagentStart's explicit
`allow_environment_context=False` contract remain intact. Multiple bindings do
not authorize inventory fallback for schema-2 context. SessionStart and dispatched
implementation/check carriers verify the same identity before reading a plan.

### 10.2 Relocatable Task artifacts and immutable results

Task moves retain all Delivery, stopped, Completion and Closure facts byte-for-byte
as JSON values. Schema 2 gains an optional `artifact_origin`, an immutable original
repo-relative managed Task directory. Existing D1 records remain readable without
this field; the first explicit rename/archive initializes it to the source root.
Only the closed relocation helper may initialize it, with exact source Task
identity/preimage and validated source/target boundaries. Ordinary metadata
writers cannot set or change it. No list of old paths or relocation ledger exists.

Within this exact Task's store context, SHA authority/plan/evidence/manual-artifact
refs under the exact origin prefix resolve to the current Task directory. New SHA
operation refs under the current physical directory canonicalize to the original
prefix before domain equality and retry checks. This changes addresses, never
content revisions or existing results. Other Task roots never match. Fixed Git
refs use their unchanged locator in the immutable Git object and need not exist
in the current tree. Candidate paths/hashes remain physical and are never mapped;
moving a candidate-owned file requires its original producer to refresh affected
results. Core and Python implement the same context and normalization rules.

Context manifests are live readers rather than retained lifecycle results. Moves
rewrite only parsed JSONL `file` fields within the exact source Task root, including
per-Delivery manifests; preserve free text and file modes. Explicit archive queries
may read historical records, while execution selection remains active-only. An
explicit reopen validates authority, operation and target occupation before any
write, moves the same Task back to active storage, increments generation through
the existing owner operation and preserves all history. It creates no Delivery or
execution binding. Failures remain explicit and resumable under the same operation.

Archive preflight rejects a direct Task-leaf symlink before metadata, manifests,
sessions or directories change. The legal active alias remains usable; archival
never moves the alias itself or copies its external target. Supported `.trellis`
and tasks-store root aliases retain their existing behavior.

Reopen first reads and validates the complete session-release plan, including
supported binding schemas, before writing the aggregate or moving the Task.
A later ordinary session-writer failure may leave the new generation and some
updated bindings committed. Recovery uses the original TaskKey/authority and
the currently declared `task_scope` owner: only immediately preceding generation
Completion, equal canonical authority, and no Delivery/Completion/Closure in the
new generation permit `changed=false` with the current key. Retry re-verifies
authority content and completes only the old-generation release set; no second
increment or automatic selection. Wrong key/owner/authority or new-generation
business facts reject without writes. No ledger is added, so equivalent current
state is recoverable; past transient scope edits and past invoking owners are
not asserted as retained facts.

Core SDK recovery requires rereading the exact current active Task locator and
raw preimage, then submitting the original operation. Old archive StoreOptions
do not auto-resolve. Python CLI may recover a disappeared explicit archive path
only through the original operation's exact TaskId/generation+1 lookup in the
registered workspace resolver, followed by the same full owner/state/authority
validation; no sole-inventory or current-session inference chooses the Task.

### 10.3 Implementable migration and consumer preparation

Plan 2.0 is a separate executor selected by the plan discriminant, not a changed
plan-1.0 projection. Its source/target package versions, Task schemas and Delivery
API are explicit; schema cutover may occur at the same package version. Task
projections preserve exact stable identity, source, generation and business/tree
metadata, and retain the exact original source bytes/mode as historical data.
Status never supplies a gate, result or automatic first Delivery. Original facts
require reviewed outcome attribution; incomplete selected attribution is an
explicit conflict. Archives default to inventoried raw history; active deferral
and current-v2 preservation are explicit dispositions, never execution authority.

Write targets are typed project/workspace/common-session selectors whose roots
come from live registered repository/worktree facts. No arbitrary absolute target
or parent traversal is accepted. Every write/preserve/removal has a raw source
SHA and full mode, exact target bytes/mode, ownership and scope. Sessions preserve
context/Task/generation and receive null or an explicitly reviewed valid Delivery
selection. Planning artifacts preserve source bytes and map only to their reviewed
Delivery. Workflow/template decisions reference the exact prospective contract;
custom content cannot be replaced by a native fallback. Each `workflows` entry
requires an explicit `template_id`; bundled identity requires exact rendered
bundled bytes. The shared pure workflow hash contract tracks only bundled IDs
and removes old native receipt entries for custom write or preserve decisions.
A valid runtime declaration does not imply bundled ownership. Preflight covers
the entire write set before mutation. Replay accepts only exact source or target
states, including modes; third states fail before writes. Caller-owned exact
backup/rollback does not reset Git or touch resources or Guru-private state.

The explicit legacy SDK migration endpoint retains plan-1.0 schemas and behavior
independently of future current `/task` exports. Schema-2 inventory and carriers
must read real Task/Delivery projections, including OpenCode SessionStart and
queue/child progress; no pseudo Task development status for schema 2. This work
can be prepared and validated in controlled native installations now. Global SDK/legacy
retirement is future breaking-release work outside #31 as specified in section 8;
actual Guru integration is neither claimed nor required by this upstream scope.

Under an already installed valid schema-2 workflow declaration, retained old
active data is historical-only for ordinary reapply: reserve its valid portable
identity and preserve bytes, but never accept its status or other fields as
current execution authority. Exact selection/binding/start diagnoses the old
schema before any write. Invalid identity/JSON remains a concrete error. Initial
legacy-to-schema-2 workflow switching still requires explicit reviewed migration
and inventory dispositions; this rule does not let a prospective declaration
bypass that preflight. The installed declaration and strict selection boundary
provide this distinction; no new per-Task disposition ledger is introduced.

### 10.4 Native quality and original-producer recovery routes

Default checker quality/evidence refresh can operate on a verified exact Task
without a selected Delivery. Hook injection supplies TaskKey, accepted scope
references/local scope contents and explicit `task_scope_only` limitations;
root design/implement/manifests are not replacement slice planning. Explicit
caller quality/evidence inputs and applicable specs supply the verification
scope. No lifecycle result or automatic Delivery selection follows. External
scope authorities remain refs, verified by their actual semantic owner.

Formal delivery_check/delivery_review and implementation still require exact
Delivery identity, generation, candidate, validated PlanningRoot and applicable
active-workflow owner inputs. Missing selection and all binding/runtime/stale
errors fail closed. Only explicit dispatch profile fields/whole lines identify
formal carrier profiles; incidental prose cannot. A Codex SubagentStart envelope
without prompt/profile can supply exact Task scope but does not assert a formal
gate. Carrier instructions enforce the actual dispatch profile even when that
hook envelope cannot observe it.

Normal native publication/delivery requires publishing and applicable current
gates. Original-producer recovery instead verifies already-successful exact
Task/Delivery/generation/original candidate/result facts read-only and records
only their historical_success projection. Lost selection/gates do not justify
repeating commit/push/PR/merge or manufacturing fresh gate approvals. Explicit
historical identity is required; mismatched producers/facts or changed retained
result content stop recovery. This changes the native owner entry instructions,
not the public lifecycle operation/state machine or another workflow's owner.
