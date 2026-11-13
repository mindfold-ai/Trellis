# Task / Delivery public contract

Task schema **2.0**, Delivery API **1.0**. The explicit SDK entry is
`@mindfoldhq/trellis-core/task/v2`. This document owns the public lifecycle;
the active `.trellis/workflow.md` owns semantic decisions and declares its
unique operation owners. A workflow's private transaction is not a public phase.

## Rollout boundary

Fresh no-flag installation defaults to bundled `native-delivery-v1`, using
Task schema 2.0 / Delivery API 1.0. Existing installations retain their actual
workflow and ownership on implicit reinitialization; explicit `native` is the
named temporary legacy compatibility workflow. Current SDK `/task` exports and
unmigrated legacy execution remain compatibility authority during this finite
window. A Task has one authority: legacy or schema 2, never both. Omitted
`task.py create --schema-version` follows the validated actual installed
declaration; it does not accept scope, create a Delivery or supply gate success.
Unsupported API/workflow combinations fail before use.

Reviewed plan-2.0 migration is available through `trellis migrate`; it requires
explicit caller-owned projections and file decisions, with read-only preview
and caller-owned backup, resume and rollback. Init, update and readers never
convert old records, recreate gates or migrate another workflow's private data.
Issue #31 accepts upstream native/runtime, versioned API, reviewed migration,
controlled custom-workflow contracts and platform evidence independently. It has
no prerequisite relationship with Guru #531 and requires no joint acceptance.
Actual downstream integration and private migration are separate owner work.
Global current-SDK replacement and destructive legacy-execution retirement are
future breaking-release work outside #31; they require published replacements,
version guidance and their own migration/affected-consumer cutover evidence.
Legacy and schema-2 authority remain isolated with no dual writes. Core and CLI
remain version locked; package publication and release qualification are separate.

## Identity and artifacts

- `TaskKey = {task_id, lifecycle_generation}` identifies the whole Task.
- `DeliveryKey = {task_id, lifecycle_generation, delivery_id}` identifies a
  slice. Allocate its opaque UUID before its first Planning. Rework, commits,
  PR updates and a publisher's private cycle never change that identity.
- The Task's `accepted_scope` identifies overall requirements and acceptance
  by a locator and exact revision. Task root `prd.md` owns that whole scope.
- Every Delivery retains `deliveries/<delivery_id>/` for its slice PRD,
  design, implementation plan, context manifests and research. D2 must not
  overwrite D1's only recoverable plan. `plan_ref` identifies accepted content.
- `task.json` is one atomic aggregate: metadata, accepted scope, Deliveries,
  completion results and closure results. There is no event ledger or second
  writable phase authority. New records have no writable Task `status`,
  `commit`, `pr_url` or `completedAt`.

Historical Delivery generation remains its creation generation. Reopening a
Task preserves identity/history, increments the Task generation and establishes
current accepted scope. Current execution can select only a current-generation
nonterminal Delivery. Historical results cannot act as new-generation passes.

## Closed phases and owners

| Operation | From → to | Semantic owner |
| --- | --- | --- |
| Create an explicitly selected slice | none → planning | Delivery creation |
| Record actual accepted Planning | planning → implementing | Planning acceptance |
| Hand exact candidate to formal Check | implementing → checking | Implementation |
| Record actual Check pass | checking → reviewing | Formal Check |
| Record independent full Review pass | reviewing → reviewing | Full Review |
| Record actual slice/profile readiness | reviewing → publishing | Readiness |
| Record publication fact | publishing → publishing | Publication |
| Record applicable delivery fact | publishing → delivered | Delivery |
| Return to earliest affected same/earlier owner | nonterminal → planning / implementing / checking / reviewing | Current semantic owner |
| Stop a wholly withdrawn/superseded slice | nonterminal → stopped | Scope decision and current stage owner |

`delivered` and `stopped` are terminal execution phases. Blocking is an owner
response, not another stored phase. Commit is an independent fact. Check pass
does not imply full Review, readiness, publication, delivery or Task completion.

The single `[trellis-runtime-contract]` declaration in the active workflow
states API/schema versions, supported profiles, and unique owners for Task
scope, Delivery creation, Planning acceptance, implementation, formal Check,
full Review, readiness, publication, delivery, Completion and source disposition.
Missing/duplicate/unsupported declarations are concrete errors. No native
fallback may compete with a custom workflow's owners. The one
`[trellis-continuation]` block routes the AI; runtime does not choose scope,
affected stages, approval, evidence sufficiency or whole-Task completion.

The current stage owner may stop an existing schema-valid Delivery even when
its retained profile is no longer enabled by the workflow. This exception
applies only to `stop`; current-profile execution restrictions and explicit
historical-success recovery retain their existing behavior. Identity,
generation, expected phase, owner, result-conflict, terminal-state and existing
stop payload/evidence checks still apply. An identical original stop result can
be retried through the existing recovery path. Stopping preserves the retained profile
and historical facts and creates no delivery, Completion or Closure success.

## Candidate, gates and result recovery

### Operation envelope

Closed operation names are `accept_scope`, `create_delivery`, `begin_check`,
`record_gate`, `rework`, `record_publication`, `record_delivery`, `stop`,
`complete_task`, `close_task` and `reopen_task`. Every input has
`api_version:"1.0"`, `operation`, exact `key`, `owner_role` and `owner_id`.
Delivery operations also have `expected_phase`; creation supplies a new UUID.
The SDK's exported `TaskOperation` union defines each operation's required
payload, and the same JSON is accepted by the Python runtime. No operation
performs GitHub publication, merge or source closure.

For example, the native creation owner submits a chosen slice:

```json
{
  "api_version": "1.0",
  "operation": "create_delivery",
  "key": {
    "task_id": "example-task",
    "lifecycle_generation": 0,
    "delivery_id": "9f6b4800-ef7e-4bc9-b161-1c55ec052b77"
  },
  "owner_role": "creation",
  "owner_id": "trellis-start",
  "scope_ref": {
    "authority": {"locator": "prd.md", "revision": "exact-content-revision"},
    "anchors": ["AC1"]
  },
  "profile": "manual"
}
```

The containing Task must already have that accepted scope. This creates
Planning with empty gates; it does not approve Planning. Native owner IDs in
this example are valid only under that workflow's actual declaration.

In store-backed execution, a local authority revision must be
`sha256:<actual 64-hex content digest>` or an exact immutable Git revision;
the illustrative `exact-content-revision` above must be replaced accordingly.
External URI authorities keep their producer-authored revisions. Evidence and
obligations are producer inputs, not automatic sufficiency judgments.

Gate payload `result` contains `result_id`, `owner_role`, `owner_id`,
`outcome`, `scope_ref`, `plan_ref`, `candidate`, `predecessor_result_id`,
`obligations` and `evidence`. Planning has outcome `accepted` and no
candidate/predecessor; Check and full Review have `passed`; readiness has
`ready`. The predecessor binds the actual preceding gate result. Candidate
shape is `{kind, content_ref, paths, head_ref, base_ref}`, with explicit
`git`/`git_free` kind and nullable commit/base refs. `AuthorityRef` is
`{locator,revision}`; evidence and obligations are arrays of those refs.

The pure operation output contains `record`, `key`, nullable `phase`, nullable
`result_id` and `changed`. File-store execution verifies preimages and objective
content facts before storing that validated result. Use the SDK exported types
for profile-specific publication/delivery/Completion/Closure payloads; do not
reinterpret arbitrary `meta` fields as those results.

`getGateApplicability(record,key)` reports the four fixed gate slots as
`missing`, `applicable` or `not_applicable`, with result identity/diagnostic.
It compares recorded scope, plan, candidate and predecessor refs independently
of phase. It does not prove external evidence freshness or actual current file
bytes. Store-backed forward writes perform the objective local-byte checks;
semantic/external applicability still belongs to the original producer.

Content identity, commit identity, baseline and applicable scope/plan/obligation
refs are independent. Producers bind only inputs relevant to their gate. A
reader reports availability/applicability and defers judgment to the producer;
it never restores somebody else's pass from a phase.

Candidate hashing covers the explicitly selected content paths, bytes and
modes. Lifecycle, session and private-result files are excluded so recording a
result cannot invalidate itself. The owner chooses the complete intended
change. A full Review covers the entire delivery candidate/range, including
already committed work, rather than only a recent chunk. A clean committed
candidate can receive fresh Check and full Review without another commit.

Hash serialization is compact UTF-8 JSON in UTF-8 byte path order:
`[relative_path, candidate_mode, sha256(file_bytes)]`. For `kind:"git"`,
`candidate_mode` is `0o755` when the owner execute bit (`mode & 0o100`) is set,
and `0o644` otherwise, matching Git's regular/executable tree modes. For
`kind:"git_free"`, it is the full `mode & 0o777`; permission changes remain
part of retained-artifact identity. An explicitly selected deleted path is
`[relative_path,null,null]`. Runtimes reject lifecycle/session
paths and checked symlink components; a deletion has no mutation side effect.
Custom owners exclude their own private-result files from candidate paths.
Existing owned aliases at `.trellis`, `.trellis/tasks` and a selected Task
directory retain their canonical-root containment boundary. Nested/file or
dangling symlinks do not become additional owned roots. Candidate business
paths and per-Delivery artifact descendants remain checked at each boundary.

Task rename/archive/reopen preserve retained Delivery, stopped, Completion and
Closure results. The optional schema-2 `artifact_origin` stores the original
managed Task root, initialized only by explicit relocation and immutable after
that. Existing records need no eager rewrite. In the selected Task's store
context, SHA references under that exact origin prefix resolve to its current
Task root; new operation SHA references under the current root normalize to the
origin before identity/retry comparison. Revisions and retained result objects
are unchanged. Fixed Git references keep their original locator and read the
exact Git object even when the current file is absent. Candidate paths/hashes
never relocate: affected candidate producers must refresh their results.

SDK `relocateTaskRecordV2({root,taskDir,destination,expected_preimage,name?})`
is a Task-local move primitive. Callers own mutable Task-tree name backrefs;
Python `task.py rename` maintains those through its existing rename planner.
`resolveTaskArtifactLocator({root,taskDir},ref)` is the read-only SDK locator
resolver for that exact selected record; SHA addresses resolve to the current
root, while Git-object and external locators retain their original meaning.
Both runtimes rewrite only parsed context-manifest `file` fields under the
source Task root, preserving free text and permissions. Explicit archive paths
are legal for history queries and formal reopen, never execution selection.
Reopen retains identity/history, establishes the new generation/authority and
returns the Task to active storage without selecting or creating a Delivery.

Archive preflight refuses a direct Task-leaf symlink with `invalid_locator`
before modifying metadata, manifests, sessions or directories. The active alias
remains readable; the runtime never moves that link or copies its external Task.
Supported `.trellis` and tasks-store root aliases remain compatible.

Reopen validates the complete session-release plan before aggregate/location
writes. If an ordinary session writer later fails, the new generation and some
released bindings may already exist. The original operation can recover only
when its TaskId is exact, current generation is old+1, canonical authority equals
the current accepted scope, old generation has actual Completion, and the current
generation has no Delivery/Completion/Closure. The current declared `task_scope`
owner must validate; authority content is verified again. Recovery returns
`changed: false` and the current TaskKey, retaining the aggregate bytes and
releasing remaining old-generation bindings without another increment or
automatic selection. Changed authority, wrong owner/key and subsequent business
facts reject without writes. No reopen receipt ledger exists: this contract
proves equivalent current state, not a past transient scope or invoking owner.

SDK callers must reread the exact current active Task locator and raw preimage,
then resubmit the original operation; disappeared archive StoreOptions do not
resolve automatically. Python `delivery.py reopen --task <original-archive>
--input <original-operation>` can recover a disappeared explicit archive locator
only via the operation's exact TaskId/generation+1 lookup in registered workspace
facts, followed by the same validation. No sole-item inventory or session fallback
selects a recovery Task. A stale explicit preimage remains a refusal; reread it
before retrying when using the optional preimage guard.

`computeCandidateContentRef(root,paths,kind?)` and Python
`candidate_content_ref(root,paths,kind=None)` accept an explicit `git` or
`git_free` kind. The two-argument form detects whether the root belongs to a
Git worktree. `delivery.py candidate --paths <paths...> [--kind git|git_free]`
exposes the same choice. Candidate verification always uses the recorded kind;
a manual artifact in a Git repository can select `git_free` to retain full
permission identity. Readers never silently rewrite existing candidate hashes;
if an older noncanonical Git-mode hash is inapplicable, return to its original
producer to refresh the candidate and affected gates.

Git-mode gitlinks are atomic parent-repository entries. Candidate capture reads
selected stage-0 index mode `160000` and its full OID; commit verification and
`GitCandidateContent` read the corresponding parent commit tree. The ordered JSON
content triples use `[path,57344,OID]` for gitlinks (`57344` is octal `160000`),
`[path,null,null]` for absence, and the existing byte-hash/permission triples for
ordinary files. The enclosing SHA256 format is unchanged. Selected unresolved
index entries reject as `invalid_candidate`. Staged deletion of a HEAD gitlink
remains absence even with a leftover directory; an ordinary-file replacement
retains ordinary workspace-byte semantics. Gitlink handling never enters the
child checkout or requires its HEAD, cleanliness, initialization, internal files
or target object availability. No submodule init/update/fetch is performed.

Regular-file candidates still observe workspace bytes and executable bits, even
when the index differs; explicit `git` mode for ordinary files remains usable
outside Git. `git_free` behavior and ordinary directory/symlink exclusions are
unchanged. The distinct gitlink mode identifies this additive encoding without
changing existing ordinary-file hashes. Old unexecuted candidates which mistook
an absent gitlink checkout for deletion require original-owner preparation and
affected gate refresh when their identity no longer verifies. Already-produced
commit/publication/delivery outcomes use original-owner historical recovery;
upgrading never authorizes repeating those actions or rewriting their facts.

A `local_commit` fact requires a complete lowercase 40- or 64-hex commit OID,
matching `candidate.head_ref`. Store verification resolves that exact object
and requires its type to be `commit` and its resolved full OID to equal the
input, including historical-success recovery. A 40-hex prefix in a SHA-256
repository is an abbreviated hash and fails objective verification.
`HEAD`, branch/tag names and abbreviated hashes are not immutable facts;
commit-looking blob or tag object IDs also fail objective verification. All
Git subprocesses, including binary blob reads and kind detection, discard
inherited `GIT_*` variables so the validated root owns the verified repository.
These verifiers read actual facts and perform no Git mutation.

Formal writes validate exact identity, declared owner, expected phase and
preimage, predecessor results and objective profile facts. They use atomic
replacement and reject stale preimages. They cannot set arbitrary phases.
Same-result identical retries return the recorded result without rewriting;
changed content under a retained result ID is `result_identity_conflict`.
Producers use a new result ID for each real revised/formal gate invocation;
an ID is immutable within its recoverable result. Only current gate slots are
retained, so the runtime does not remember IDs of cleared/replaced gates. If a
gate result is absent, invoke its original semantic owner and record a fresh
result; do not rebind an old ID to changed inputs. Terminal delivery and
Completion/Closure facts remain retained and immutable across generations.

After actual delivery succeeds but public projection/output is lost, the
original delivery owner can restore the same real fact with
`historical_success`. This records the terminal fact even if original gates
are missing or obsolete; it does not invent passes or repeat remote actions.
Applicable ongoing gates still belong to their original semantic owners.

## Publication refresh after rework

`recordPublicationFact` / `record-publication` updates the current publication
slot of an undelivered PR Delivery. Rework retains the prior actual publication;
it does not erase a remote success. A revised publication uses a new result ID,
the same `repo_ref`, `pr_number` and original `owner_id`. The verified target may
change when fresh readiness covers the actual new target obligations. Normal
refresh requires `publishing`, applicable readiness and the current candidate.

If actual P2 publication succeeded but projection/output was lost, the original
publication owner may restore verified live P2 with `historical_success`, even
with missing or obsolete gates. The store verifies live PR head, body and target;
it refuses stale P1 facts after P2. Recovery records facts only and neither
creates gate passes nor repeats publication. The pure transition API trusts the
original producer assertion; callers performing I/O use the store verifier.

| Condition | Result |
| --- | --- |
| Identical retained publication ID and content | Idempotent no-write retry. |
| Changed content under retained ID | `result_identity_conflict`. |
| Refresh changes repo, PR or original producer | `publication_identity_mismatch`. |
| Undelivered normal P1 → rework → fresh gates → verified P2 | Replace current slot with P2 and a new ID. |
| Historical P2 success with lost gates/output | Restore verified P2; do not manufacture passes. |
| Different publication after `delivered` | `publication_already_recorded`; retained terminal facts are immutable. |
| Empty publication after historical PR delivery | Recover only matching repo/PR/head/target/candidate; mismatch is `publication_identity_mismatch`. |

The current slot has no retired-ID ledger. The original producer owns replaced
historical results. Tests cover same-PR target changes, normal and historical
refresh, stale live fact rejection, retained-ID conflicts and terminal recovery
in the shared TS/Python corpus and real-store verifier simulations. A recovery
that clears P1 before P2 is verified is wrong; retain P1 until the verified P2
projection succeeds atomically.

## Native profiles

| Profile | Objective outcome after semantic gates |
| --- | --- |
| `local_commit` | Exact reviewed local commit contains the accepted candidate. No PR required. |
| `manual` | Accepted retained/exported artifact has immutable locator/content identity. Git is optional. |
| `pull_request` | Exact reviewed PR actually merged, with repository/PR/head/merge facts. Ready-for-merge alone is insufficient. |

All profiles require actual Planning, Check, independent full Review and
readiness. Runtime verifies facts, not acceptance sufficiency. Native
`trellis-check` has a `quality` profile with no lifecycle writes and a distinct
formal `delivery_check` profile. A read-only `delivery_review` carrier supplies
findings to the full Review owner; it does not self-fix or write another
owner's result. `trellis-review-delivery`, `trellis-deliver` and
`trellis-complete-task` supply the native semantic owners.

Git/GitHub actions follow their actual user-authorized scope. Local/manual
acceptance makes no claim of deployment or remote success. PR policy is
repository specific; Guru trailers and private transaction steps are not
global native requirements.

## Session and continuation

Session schema 3 preserves exact Task selection and adds nullable Delivery
selection. Binding a Task does not accept Planning or begin implementation.
Creating a Task does not implicitly create D1. Explicitly create/select the
first or next slice before its Planning.

For a registered linked worktree, the validated Task workspace owns its Task
facts, planning artifacts and active workflow declaration/continuation. The
invocation checkout supplies exact session identity and resolver facts; its
unrelated workflow must not override the selected Task's semantic owners.
Never use an unregistered path or display-only inventory as that authority.

Current query distinguishes `current`, `terminal_delivery` awaiting selection
release, `no_current_delivery`, `no_current_task`, and concrete binding errors.
Do not choose the sole inventory Delivery, repair selection on read, or treat
an error as no Task. A no-Delivery Task can legitimately await scope definition,
next-slice Planning, evidence-only Completion or closeout. Task-free manual
work remains Task-free. Execution-mode hints such as `*-inline` are not phases.

Terminal writers release matching execution selections while retaining Task
binding for Completion. If that secondary write is interrupted, the terminal
selection remains identifiable; the same owner can release it without another
Delivery or repeated side effect.

## Whole-Task completion and closeout

Completion reviews the entire current accepted scope, including unallocated
work, applicable historical outcomes and outstanding evidence. Delivering all
known slices alone is insufficient. Native exits are `completed`,
`remaining_work`, `evidence_pending`, `additional_delivery_required`,
`requirements_revision_required`, `implementation_revision_required` and
`blocked`. Only the actual `completed` result is recorded as Task completion.

Closure records actual source disposition tied to that exact completion
result. Native default is `no_mutation`; an exact-source Issue is not
automatically closed. Archive consumes current Completion and Closure and
preserves content/history. It never manufactures completion. Cleanup is a
separate optional owner/action; failure does not revoke completion. Missing
child data is unknown, never completed; child outcomes are evidence for parent
Completion, not an automatic parent pass.

## Guru interface mapping and limits

These mappings use the canonical Guru contracts at
`a653c90b064e2435bc147f1bda0e1b7ab632f797`. Guru #531 owns adapters, private
migration and installed validation; upstream never parses private checkpoints.

| Guru producer | Public projection | Continuing consumer |
| --- | --- | --- |
| TaskArtifact/checkout TaskId + generation | Explicit TaskKey and stable DeliveryKey | Current workflow owner resolution |
| Planning Approval | Planning result bound to slice/plan/scope | Same Delivery implementation |
| Check / full Branch Review | Separate candidate-bound check/full_review results | Delivery Review |
| Delivery Review `ready` with head and exact PR payload | Readiness bound to full Review and payload obligations | Original Publish input remains authoritative |
| Publish `ready_for_merge` with repo/PR/head/body hash | Publication facts; not delivered | Original Merge transaction |
| Merge `delivered` with task identity/head/merge/result ID | PR delivery fact, or historical-success recovery | Existing completion_seed plus public Delivery identity |
| Completion `completed` | Current generation/scope completion result | Closure then archive |

Guru `delivery_cycle_ref` changes with HEAD/payload; it cannot identify the
stable pre-Planning Delivery. Publish's `push_content → bind_pr →
converge_metadata → mark_ready → ready` remains private. Completion's evidence
refresh and reactivation validation do not create another Delivery. Guru #292
and #530 remain their own capabilities; no unmerged fix is assumed here.

Upstream acceptance binds its own exact source/package/API to native and
controlled custom-workflow evidence. Public mappings and fixtures prove the
upstream interface behavior only; they do not claim actual Guru installation,
private migration or original business-worktree recovery. Those integrations
remain their designated owners' work and require no joint acceptance for #31.
The full release/platform matrix remains the release owner's evidence.
