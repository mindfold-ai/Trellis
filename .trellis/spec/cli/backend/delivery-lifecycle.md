# Versioned Task / Delivery lifecycle

## Scope and authority

Issue #31 introduces Task schema 2.0 / Delivery API 1.0 and reviewed
plan-2.0 installation migration. The shipped
public contract is `packages/cli/src/templates/trellis/delivery-contract.md`;
that document owns the lifecycle, ownership, result and recovery semantics.
Do not duplicate the transition table in platform hooks or route code.

Fresh no-flag native initialization uses bundled `native-delivery-v1`. Existing
legacy installs and the current legacy `/task` retain their contract until
explicit reviewed installation migration. The older task-lifecycle and workflow-state specs
describe that compatibility path. A Task must never receive both legacy status
and Delivery phase writes. Global legacy retirement is future breaking-release
work outside #31, with public replacement/version guidance and its own cutover
proof. Upstream schema-2 acceptance has no downstream adoption or joint gate.

First-install onboarding under the exact bundled `native-delivery-v1` workflow
creates its explicit guideline scope and a `manual` Delivery before Planning;
it records no Planning or subsequent gate approval. A custom schema-2 workflow
creates a Task only, with no accepted scope or Delivery. Its declared owners
choose those semantics; init must not select the first supported profile.
Bootstrap eligibility requires the selected bundled template identity and
effective managed native workflow, not byte equality alone. A custom ID or
preserved user-owned workflow remains Task-only even when its bytes match the
native bundle. Test both fresh custom installation and retained-content reinit.

No-explicit-workflow reinit preserves the actual installed workflow and receipt
ownership for legacy, declared native and custom installations. A changed fresh
default never authorizes migration of an existing installation. Omitted
`task.py create --schema-version` follows the actual validated installed runtime
declaration: schema 2 for Delivery workflows and legacy only for retained
undeclared compatibility workflows. Explicit schema mismatches and malformed or
unsupported declarations reject before Task/session writes. This only selects
the record format; it cannot approve scope, create a Delivery or pass a gate.

Schema-2 Task creation instructions and generated root PRD describe whole Task
scope/acceptance only. Planning design, implementation plan and context manifests
belong to the explicitly created/selected Delivery and its PlanningRoot. Consult
the active workflow's declared owners/continuation; do not prescribe a native
owner for a custom workflow. `task.py start` binds a Task and cannot activate
implementation. Keep legacy root-planning prose only in its explicit
compatibility branch. Regressions inspect actual create output and PRD bytes,
not only the aggregate schema. Schema-2 bootstrap guidance uses the same
Delivery-scoped planning and declared owner chain through Check, complete
Review, readiness and actual delivery, followed by separate whole-Task
Completion and Closure. It must not prescribe legacy finish-to-archive as
Completion or hard-code native owners for a custom declaration.

No-explicit-workflow reinit passes an explicit preserve decision to the actual
workflow writer, skipping its write and Python-command rendering entirely.
Retained bytes, mode and exact original workflow receipt hash stay unchanged
even when they contain raw Python commands or local edits. Recomputing the
receipt from retained edited bytes falsely marks those edits as pristine and
can let a later update overwrite them; verify reinit followed by update. Fresh/explicitly selected templates still render for the selected
platform. Do not write then restore an owned workflow to simulate preservation.

The optional bundled Linear hook validates Task shape/path before any client
call. For schema 2, Task start is selection only and performs zero external calls,
including description synchronization. Archive-to-Done mapping requires actual
current Completion matching generation and accepted scope, using the existing
inventory projection; missing or stale Completion fails before calls. Metadata
linking uses canonical atomic metadata-only IO and preserves lifecycle facts.
Explicit legacy mappings remain compatibility behavior. Tests use a fake client
for configured actual start, manual archive, invalid records and metadata linking;
they never contact a real external service or manufacture Completion results.

Workflow replacement preflight inspects supported direct Task-directory aliases
through the same containment and actual-directory checks as ordinary Task roots.
It rejects incompatible schema or unsupported nonterminal Delivery profiles
before writes. Delivered/stopped history remains eligible for owner recovery.

## Interfaces

- SDK: `@mindfoldhq/trellis-core/task/v2` only; keep the root and legacy Task
  exports stable during D1.
- Python: shipped `delivery.py` and common deterministic record module. Resolve
  the active workflow contract before formal writes; declare exact owner roles.
- Session: schema 3 has exact TaskId/generation plus explicit nullable Delivery
  identity. Keep registered-worktree resolution, identity reservations and
  selected-record strict validation. Read-only consumers never repair binding.
- Candidate/result APIs must use the same JSON shape and behavior in TS/Python.
  Shared fixture corpus belongs to Core; CLI owns executable integration and
  install/context/argv verification.

## Validation and error cases

| Case | Required behavior |
| --- | --- |
| Missing/duplicate owner or API mismatch | Explicit contract error; no native fallback. |
| No Delivery selection | `no_current_delivery`; no sole-item inference. |
| Stale or ambiguous Task/Delivery selection | Concrete error, distinct from no Task. |
| Check pass | Record only Check; independent full Review still required. |
| Identical same-result retry | Read back identical result; no rewrite. |
| Changed content under retained result ID | `result_identity_conflict`; a revised formal gate uses a new producer ID. |
| Stale raw preimage or immutable identity change | Reject before replacement. |
| Actual success with missing/obsolete gates | Original owner records historical success; no fabricated gates or repeated remote action. |
| Archive without current Completion/Closure | Reject; archive must not create completed facts. |

### Retained profiles and stop (#59)

#### 1. Scope / trigger

A Task can retain a schema-valid Delivery whose profile is no longer enabled
by its current workflow. Keep its current-stage withdrawal path available.
The public delivery contract owns the transition and owner semantics.

#### 2. Signatures

Use existing `applyTaskOperation` / `apply_operation` with `operation: "stop"`,
the exact DeliveryKey, current declared owner, expected_phase and StopResult.
There is no new payload, schema or operation.

#### 3. Contract

Exempt only stop from the retained-profile guard in both runtimes. Keep every
other validation and the existing historical-success exceptions. Store-backed
stop preserves historical facts; the Python store also releases the affected
selection through its existing retry-capable path.

#### 4. Validation / error matrix

| Case | Required behavior |
| --- | --- |
| Legal stop of retained unsupported manual/local_commit | Record stopped and preserve the original profile. |
| Identical original stop retry | Recover unchanged result; finish applicable selection release. |
| Ordinary identity, phase, generation, owner or result mismatch | Retain the existing rejection; no new result. |
| Unsupported-profile creation or forward execution | Retain unsupported_delivery_profile. |
| Stop | Never synthesize delivery, Completion or Closure. |

#### 5. Good / base / bad cases

Good: Planning owner withdraws a retained manual slice under a PR-only workflow.
Base: stop of a currently enabled profile keeps its existing behavior.
Bad: enable an old profile globally or relabel its record merely to retire it.

#### 6. Tests required

Use the shared Core fixture corpus for TS/Python transition parity, plus the
existing Core and shipped-Python Delivery integration suites for complete
aggregate preservation, public store persistence, selection release and retry.
Cover both retained profiles and existing legal nonterminal stage owners.

#### 7. Wrong / correct

Wrong: reject every operation on a retained profile before reaching stop.
Correct: allow the existing stop path to validate and record withdrawal while
keeping the profile guard on operations that still require current support.

Task-local relocation uses an optional immutable `artifact_origin`, initialized
only by the closed move helper. SHA AuthorityRefs normalize to that origin for
new operations and resolve against the selected Task's current root; fixed Git
refs keep their original object locator, and candidate paths never remap.
Retained result objects stay unchanged through rename/archive/reopen. Context
JSONL relocation changes parsed `file` fields only, including Delivery manifests,
and preserves modes. Ordinary metadata writers cannot initialize/change origin.
Explicit archive queries read history; formal reopen moves the same Task to
active storage and records a new generation without selecting a Delivery.

Archive refuses a direct Task-leaf symlink before any writes; legal active
aliases and `.trellis`/tasks-store root aliases remain available. Reopen fully
prevalidates session releases before aggregate/location mutation. A late writer
failure is recoverable with the original operation by the current declared
task_scope owner only at generation old+1, with matching canonical authority,
old Completion and no current-generation Delivery/Completion/Closure. Retry
verifies authority, returns changed=false/current key, and completes remaining
old-generation session releases. New business facts or mismatching inputs reject
without writes. Equivalent current state is the boundary; no reopen ledger or
historical invoking-owner claim is introduced. SDK callers reread the current
exact active locator/raw preimage; Python CLI recovers a missing explicit archive
locator via the operation key's exact identity resolver, never inventory inference.

Task context add/list/validate share one selected-record boundary. Checked reads
distinguish genuinely missing task.json (existing evidence-only handling) from
invalid, unreadable, unsupported or undecodable metadata, which fail with a
concrete reason before reading/writing root manifests. Existing valid records
must match the workspace's declared runtime before context routing: retained
legacy Tasks cannot execute under schema 2, and schema-2 Tasks require a valid
Delivery declaration and exact selected/explicit Delivery planning root. Legacy
undeclared workflows retain their context handling; no malformed Task becomes
an evidence-only directory or supplies a root-planning fallback.

Actual hook/SDK/installed regressions cover two renames, formal Check after a
move, archive queries by relative/absolute path, validation-only reopen, intact
retained history and no-write refusal on occupied destinations/invalid refs.

## Required evidence

Meaningful tests cover transitions, rework, stop, result identity/applicability,
clean candidates, historical-success recovery, completion/closure/reopen,
explicit session selection and cross-runtime parity. Native installed samples
must exercise both Git and Git-free profiles and two slices of one Task.
Use controlled temporary installations; do not migrate dogfood or business
Task records merely to satisfy tests. Template and dogfood script twins stay
synchronized while the repository itself may remain on its legacy workflow.

For one formally completed schema1 archive, use the separate public
[formal predecessor maintenance operation](./commands-maintain.md#formal-predecessor-archive-reactivation).
It converts the selected predecessor directly to Task v2 generation `g+1` with
raw history retained. It creates no old Completion/Closure or current empty
Delivery and changes no old-generation environment resources. This finite
conversion does not relax current Task v2 reopen's matching Completion rule.
Manual archive resume still preserves generation. Existing target-native v2
owners consume the converted identity and establish new-generation binding;
provider conversion alone does not prove their semantic continuation.

Candidate hashing excludes lifecycle/session/private-result files; writing a
result must not invalidate the content it describes. Owner-selected business
docs and tests remain part of the intended candidate. Runtime validates
objective facts and containment; AI owners decide sufficiency and earliest
affected stage. A read-only Review carrier cannot self-fix.

Default checker `quality` is whole-Task/code/evidence verification, not a formal
Delivery gate. With exact validated Task identity and no selected Delivery,
hooks may inject TaskKey, accepted scope references/local scope contents and an
explicit `task_scope_only` limitation. Do not load root design/implement or
manifests as Delivery planning, guess a slice, or write lifecycle results.
External authority remains a reference for the owner to verify; hooks make no
remote request. Actual `delivery_check`/`delivery_review` dispatches and all
implementation still require exact Delivery/candidate/PlanningRoot/owner inputs.
Known formal missing selection fails closed; binding/runtime/stale errors never
downgrade. Codex SubagentStart normally carries no prompt/profile, so its hook
envelope cannot assert formal dispatch. Carrier instructions enforce the actual
dispatch profile; hook recognition uses only explicit profile fields/whole lines.

Native delivery has separate normal-forward and original-producer recovery
routes. Publishing and applicable current gates constrain forward work. They
must not block read-only verification and `historical_success` projection of
already-successful exact Task/Delivery/generation/candidate/result facts by the
original declared producer. Recovery never invents gates or repeats remote
actions; mismatched identity or retained result content is a concrete error.

Current gate slots do not retain cleared/replaced gate identity history. The
producer must allocate a new ID for a revised invocation and cannot reinterpret
an absent old gate as pass. Collision detection covers retained results;
immutable Delivery/Completion/Closure history remains recoverable. Do not add
a ledger merely to retain every historical Check retry.

Guru installed/private migration evidence, external marketplace workflow
changes and the release matrix are separate owner boundaries. Report tests,
controlled installation evidence, remote integration and release evidence
independently. Actual downstream integration is outside #31 acceptance; it is
neither required nor claimed by upstream controlled interface tests.

## Rework publication and carrier regressions

The public contract's "Publication refresh after rework" section owns the
`recordPublicationFact` / `record-publication` signature, identity constraints,
normal/historical error matrix and examples. Keep prior PR publication during
rework; replace the undelivered current slot only with a new producer ID for the
same PR/owner and verified actual facts. Targets can change with fresh applicable
obligations. Delivered facts remain immutable. Shared `publication-rework.json`
and real-store regressions must cover P2 success with lost gates/output and
reject stale P1 without remote mutation. No retired publication ledger is added.

Schema-2 subagent context requires exact session identity. If strict Delivery
resolution returns `no_current_task` after legacy Task fallback found a v2
record, stop instead of reading root PRD/manifests. Legacy sole-session fallback
remains compatible. Regressions assert no root sentinel or selected-Delivery
sentinel leaks on the missing-identity path, and explicit identity loads the
selected slice. Actual Droid carriers under `droid/droids/` must have the same
exact-selection and read-only `delivery_review` guards as other agent carriers;
registry tests inspect the collector's real files, not only skill availability.

The Task and Delivery queries within a hook reuse the same detected platform.
Native `session_id` payloads are sufficient without `TRELLIS_CONTEXT_ID`; never
drop the platform on a second query and accidentally search `session_probe`
instead of the host's binding. Preserve explicit override precedence and Codex
SubagentStart's refusal of inherited parent overrides. Test same session IDs on
different hosts, multiple sessions, registered sibling worktrees, unknown/absent
identity and zero writes through actual SessionStart and implement/check hooks.

Schema-2 inventory exposes Task scope/current Completion and separate current-
generation Delivery records. `TaskInfo.status` is null for schema 2 and for
historical-only legacy data under a schema-2 declaration; no `task_scope` or
`task_completed` development status is fabricated. Pending Task inventory means
whole-Task acceptance remains outstanding, never automatic implementation.
Delivery-phase filters inspect current-generation records only. Parent progress
counts actual matching child Completion, including archive history; unknown or
missing children are not complete.

OpenCode SessionStart and Pi/OMP extensions consume the exact public query and
actual selected-workspace continuation. They do not derive schema-2 routes from
legacy status tags or read root planning when no Delivery is selected. A legacy
binding in an already declared schema-2 workspace is historical-only and cannot
execute. Preserve concrete structured runtime errors even when the Python query
exits nonzero; read-only carriers disable Python bytecode writes.

## Scenario: exact Git facts, permission modes and context roots

### 1. Scope / Trigger

D1 post-merge review exposed mutable historical commit refs, inherited Git
repository redirects and incompatible workspace/Git-tree permission hashing.
OpenCode also rejected already accepted storage-root aliases. These corrections
change objective verification, not semantic ownership or D2 migration.

### 2. Signatures

- `computeCandidateContentRef(root, paths, kind?: CandidateRef["kind"]): string`.
- `candidate_content_ref(root, paths, kind: str | None = None) -> str`.
- `delivery.py candidate --paths <paths...> [--kind git|git_free]`.
- Existing `record_delivery` input/output and lifecycle edges remain unchanged.

### 3. Contracts

The public contract owns hash serialization: Git mode normalizes owner execute
bit to 0644/0755; git_free keeps all 0777 permissions. Explicit recorded kind
controls verification. Two-argument computation infers Git-worktree membership;
manual artifacts in a Git root can explicitly request git_free. All verifier
Git subprocesses strip inherited GIT_* values, including binary reads.
local_commit.commit is a complete lowercase 40/64-hex OID matching candidate
head; the store requires a commit object whose resolved full OID exactly
matches the input, so a 40-hex prefix in a SHA-256 repository is rejected.

OpenCode may consume the real Task root returned by the strict active resolver.
Delivery context is exactly that Task's deliveries/UUID descendant. The
validated .trellis/tasks/selected-Task root alias remains valid; every nested
Delivery component must be a directory without a symlink. Unvalidated hints
cannot create another trusted root or override exact selection.

### 4. Validation & Error Matrix

| Input | Required result |
| --- | --- |
| local_commit HEAD/branch/tag-name/short SHA | invalid_record before write |
| SHA-256 repository receives a 40-hex commit prefix | invalid_git_fact; no write |
| Full OID points to blob/tag/nonexistent object | invalid_git_fact; no stored fact |
| Exact commit tree differs from selected content | candidate_mismatch |
| Git file permissions 0600/0640, regular committed file | Same normalized mode as 100644; normal/historical delivery may verify |
| Owner execute bit changes | Different Git content ref; old candidate rejected |
| git_free permission change | Different content ref; old candidate rejected |
| Inherited Git redirect selects another repo | Ignore redirect; verify supplied root |
| Legal validated storage-root alias | Inject exact selected Delivery plans/manifests |
| Nested deliveries/UUID symlink or stale selection | Fail closed; no Task-root fallback |

### 5. Good/Base/Bad Cases

Good: historical exact commit survives current HEAD movement. Base: ordinary
0644 Git candidates keep their digest. Bad: persist HEAD as a terminal fact,
hash a Git regular file's private 0600 permissions as a Git tree mode, or let
another repository's GIT_DIR supply the candidate HEAD.

### 6. Tests Required

Use two real controlled Git repositories for environment pollution, covering
HEAD validation and binary historical blob reads. Verify branch/tag/HEAD/short
ref rejection plus exact-commit recovery and non-commit OID rejection in both
runtimes, including a real SHA-256 repository rejecting a 40-hex prefix with
unchanged record bytes. Cover 0600, 0640 and executable modes, explicit git_free in a Git
root, permission drift, and hash parity. Run actual OpenCode injection through
validated root aliases and nested-symlink rejection with zero-write snapshots.
Workflow ownership regressions live in commands-workflow: custom legacy/v2
forced and add-platform reinit followed by normal/forced update.

### 7. Wrong vs Correct

Wrong: compute a manual git_free hash with automatic Git normalization or rely
on cwd while passing inherited repository-redirect environment to Git.
Correct: verify with candidate.kind, and invoke Git in the validated root with
clean repository environment; store immutable commit OIDs only.

## Operation-local immutable content observations

The installed Python Delivery owner preserves the existing content_ref format:
sorted path entries, UTF-8 compact JSON with ensure_ascii=False, Git-normalized
0755/0644 modes (git_free retains full permission bits), SHA256 of raw file bytes,
and explicit [path,null,null] deletion entries. Regular-file tree OIDs are not
substitutes for byte hashes. Gitlinks use the atomic pointer representation below.

A normal local_commit operation verifies both the mutable candidate and immutable
commit. Each mutable path must be independently observed on every invocation;
HEAD/base, authorities, identity/owner/phase and preimage checks remain independent.
Raw Git blob identity established from those observed bytes may seed an
operation-local content digest fact. The immutable commit may reuse that SHA256
only for the same exact blob identity in the same repository/hash context.
Repeated immutable blobs are read/hashed once. Reused content hashes do not
prove that the referenced Git object is readable: batch-check seeded object
availability/type through Git so ordinary offline partial-clone failures retain
invalid_git_fact and do not write a delivered result. Identical ordered path/mode/hash
entries may share the aggregate digest computation, but each input's expected
digest is compared independently. Never cache a previous validation conclusion.

Immutable tree lookup preserves literal accepted paths, including UTF-8,
whitespace, tabs and newlines. Trees and symlinks retain their existing
invalid_git_fact outcome; gitlinks use parent-tree pointer identity and genuine
missing entries retain deletion semantics.
Exact full commit object checks and isolated Git environment remain required.
Historical success still verifies the actual immutable outcome; exact unchanged
retry still recovers the original fact without writing a second fact.

Use bounded batches and streamed/spooled object bodies. Regular temporary input
and output files avoid a cat-file stdin/stdout duplex pipe deadlock. Close
operation-local resources on success/failure. There is no cross-invocation cache,
public precomputed-digest trust input, schema change, or persistent Git service.
Performance evidence must exercise complete supported public operations and
report all Git subprocesses, unique/requested objects, actual bytes, timings and
Python/Git RSS scope separately. Freeze numerical gates after before measurement
and before production changes; never relax them using after results.

### Public immutable Git candidates

The installed `common.delivery_store.GitCandidateContent(root, *,
no_lazy_fetch=False)` exposes the same digest owner to historical pull-request
consumers. Use `with GitCandidateContent(actual_root, no_lazy_fetch=True) as
content:` and `content.content_ref(exact_commit, paths)`. The input must name a
full lowercase actual commit OID. Branch names, tags, abbreviations, non-commit
objects and a 40-hex prefix in a SHA-256 repository fail with `invalid_git_fact`.
The context resolves and fixes one actual repository root, including a bare
history repository. It strips inherited `GIT_*` redirects and sets `LC_ALL=C` for stable Git
diagnostics in the old-Git compatibility fallback. Explicit
`no_lazy_fetch=True` sets `GIT_NO_LAZY_FETCH=1` on every Git subprocess.

The public context reads only selected literal tree paths in argument batches
bounded to 64 KiB including fixed arguments. It retains directory and other
non-regular entries for type validation. Existing full-tree/scope helper calls
retain their behavior. Each call validates its own nonempty unique relative path list, private-path
exclusions, actual commit, tree entry type/mode and object availability. Each
consumer compares its expected candidate independently. Repeated blob identities
share raw-content SHA256 facts within that context. Identical serialized entries
may share an aggregate SHA256 only after current-input validation. A cached hash
does not bypass the Git availability/type check. Missing paths retain deletion
entries; directories and symlinks fail. Gitlinks emit the parent-tree pointer
without requiring the referenced child commit object. Literal path lookup and the
original compact UTF-8 digest serialization remain unchanged. There are no
caller-supplied hash facts or persistent cache files.

`close()` clears reduced facts and rejects later use with `invalid_git_fact`.
Context exit closes on ordinary success and consumer failure. Blob bodies use
the existing bounded, spooled object reader. This public context uses finite
4096-request batches to amortize process startup for broad candidates. The
first batch includes an exact commit OID/type control request within that
limit. A content batch uses `cat-file --batch-command` with `info` for the
commit and `contents` for blobs. The commit control request transports no body
and computes no blob hash. Git versions that explicitly reject that option use
a separate commit metadata check followed by the original blob batch protocol.
Other failures do not trigger fallback. A metadata batch validates commit identity/type even when
all selected paths are deleted or all content hashes are cached. This replaces
a separate commit-check subprocess while retaining validation on every call. Shared
reader defaults remain 128 requests for Task and local-commit consumers. Neither
setting keeps blob bodies resident across calls. Metadata may scale with
selected paths and unique objects.

A supported historical consumer replaces snapshot materialization plus
`candidate_content_ref(snapshot, paths, "git")` with this public context. A
standalone recovery owns one context. A history query owns one context for its
actual repository and closes/recreates it when preparation switches to an
isolated scratch root. Historical preparation remains the fetch/recovery owner;
the digest owner does not prepare history. Preserve that owner's explicit
no-lazy-fetch policy and independent recorded-fact comparisons. Capability
checks may select the additive class through the existing module projection.
An old filesystem fallback remains compatible, but does not prove immutable
reuse. Ordinary `candidate_content_ref` Path values remain mutable observations,
including files originally materialized from Git. The API-1.0 contract shape and
normal local-commit verification remain unchanged.

Regression coverage uses real Git repositories for filesystem-oracle parity,
literal paths, deletion/empty/executable entries, per-operation unique blob
observations, fresh/closed context boundaries, independent invalid inputs,
HEAD/index/worktree movement, missing cached objects, bare repositories,
repository environment isolation, explicit no-lazy-fetch and exact SHA-256
commit width. Full recovery/query wrappers and installed projection evidence
must accompany performance claims; direct digest tests alone are insufficient.


## Scenario: parent-repository gitlink atomic identity (#62)

### 1. Scope / Trigger

A selected Git gitlink is an atomic parent-repository entry. Checkout presence,
submodule HEAD, initialization and internal dirtiness cannot define Delivery
content or block candidate, commit or historical verification.

### 2. Signatures

Existing `candidate_content_ref(root, paths, kind=None)`,
`verify_candidate(root, value)`, SDK `computeCandidateContentRef` /
`verifyCandidate`, `delivery.py candidate`, commit verification, and
`GitCandidateContent.content_ref(exact_commit, paths)` retain their signatures.

### 3. Contracts

The sorted compact UTF-8 JSON entry for a gitlink is `[path,57344,OID]`:
57344 is octal 160000 and OID is the full parent entry's lowercase Git OID.
Candidates use the parent index stage-0 entry; commit/historical reads use the
parent commit tree's mode 160000/type commit entry. Never read that OID as a
parent blob or require its object to be present. Do not enter, initialize,
fetch or update the submodule. Gitlink recognition precedes filesystem reads.

Staged deletion of a HEAD gitlink emits `[path,null,null]` even if a directory
remains. Stage-0 regular-file replacements retain workspace byte/executable-bit
semantics. Selected unmerged index entries are invalid candidates, not deletions.
Ordinary-file bytes, permissions, deletion, git_free and explicit Git mode for
ordinary files outside repositories retain their existing behavior. Do not add
index, clean or commit preconditions to ordinary files. Strip inherited GIT_*
redirects on parent Git queries; preserve literal path and object-format support.
Read selected parent index/tree metadata with literal path queries in bounded
64 KiB argument batches; a single selected file must not require transporting
the entire parent index/tree or hit an unrelated repository-size output limit.

The distinct mode disambiguates the added representation without changing
regular-file fingerprints or schema/API versions. An old unexecuted candidate
that conflated a missing gitlink checkout with deletion must be prepared again
when verification differs. Already produced commit/publication/delivery facts
remain under original-owner recovery and must not be re-executed on upgrade.

### 4. Validation & Error Matrix

| Input | Result |
| --- | --- |
| Same stage-0 gitlink, checkout absent/dirty/different HEAD | Same content_ref |
| Parent pointer added/updated/deleted or type changed | Updated identity |
| Captured pointer differs at verification | candidate_mismatch |
| Selected unresolved index stages | invalid_candidate |
| Exact parent commit has a different pointer | candidate_mismatch |
| Gitlink references an unavailable child commit | Accepted without child object access |
| Selected ordinary directory/symlink | Existing rejection boundary |

### 5. Good/Base/Bad Cases

Good: a parent commit with the reviewed gitlink OID passes even without a child
checkout or child object. Base: regular-file workspace mutation still changes
its candidate hash. Bad: use a submodule HEAD, ignore a gitlink path, or treat
an unmerged entry as deletion because no stage-0 row exists.

### 6. Tests Required

Use a real parent fixture through candidate and Delivery commit gates; assert
actual committed mode/OID and rejection of an incorrect pointer. Compare Python
and SDK hashes on that fixture. Cover staged add/update/delete/type transitions,
a post-capture change, one internal-state change, selected conflicts and matching
historical reads without child objects. Reuse ordinary file, git_free, literal
path, supported object-format, immutable-blob reuse and recovery regressions;
do not multiply full entrypoint/platform/submodule-state matrices.

### 7. Wrong vs Correct

Wrong: `git -C submodule rev-parse HEAD`, read the gitlink OID with cat-file as
a blob, or derive deletion solely from a missing directory.
Correct: observe selected parent index/tree mode and OID, serialize the atomic
triple, and compare every input independently through the existing owner.
