# D1 Core API implementation

Implementation location: `packages/core/src/task/v2/`. Package version remains
`0.7.0-castbox.3`; this is source evidence, not a published version. The explicit
public import is `@mindfoldhq/trellis-core/task/v2`. The legacy `/task` endpoint
and its status contract remain unchanged during D1. No old Task is rewritten.

## Exact public surface

`types.ts` defines the exact JSON input/output types. `schema.ts` validates the
schema-2 aggregate, metadata/source, authority locators, UUID identity, result
slots and profile facts. `operations.ts` exports `applyTaskOperation(record,
request, workflow)` and `parseTaskOperation`. The closed `operation` values are:

`accept_scope`, `create_delivery`, `begin_check`, `record_gate`, `rework`,
`record_publication`, `record_delivery`, `stop`, `complete_task`, `close_task`,
`reopen_task`.

All requests contain `api_version:"1.0"`, `operation`, exact `key`,
`owner_role`, `owner_id`. Delivery mutations other than creation require
`expected_phase`. Creation requires an explicit canonical UUID in its key,
`scope_ref`, and `profile`; the CLI may allocate the UUID before sending the
request. Runtime does not choose a slice or create a Task automatically.

`WorkflowContract` contains `delivery_api:"1.0"`, `task_schema:"2.0"`, the
supported `profiles` and exactly one declared owner for each role in
`OWNER_ROLES`. Multiple roles can deliberately share one Skill/carrier ID;
each role still has one owner. Core receives the validated active declaration;
Markdown extraction/semantic execution remain CLI/Python owners.

Successful output is `{record,key,phase,result_id,changed}`. `record` is the
updated complete aggregate; `phase` is null for Task-only operations. Exact
same producer/result replay returns `changed:false` before stale phase and
current-generation checks, while still checking the result's original exact
Delivery generation and owner. Normal execution/replay also requires the
stored profile to be supported by the active workflow; actual historical
publication/delivery recovery is the narrow exception. Changed content under an occupied result ID
fails `result_identity_conflict`. Reopen returns the new TaskKey and preserves
historical Deliveries, completion and closure results. Changed accepted scope
after current Completion requires formal reopen.

`getCurrentDelivery(record,selection)` returns `no_current_task`,
`no_current_delivery`, `current`, `terminal_delivery`, or an explicit `error`.
It never chooses the only known Delivery. Session storage/binding/release is
Python-owned and uses the same identity/query semantics.

`getGateApplicability(record,DeliveryKey)` reports each fixed gate slot as
`{kind:"missing"|"applicable"|"not_applicable",result_id,code}` using exact
stored scope/plan/candidate/predecessor inputs. Phase never supplies a pass.
Historical-generation gates are explicitly not current. This read does not
mutate/rebind results or choose a recovery route. Actual file/external drift
still needs original-producer observation through objective verification;
the projection is not a semantic sufficiency judgment.

## Store and objective facts

`loadTaskRecordV2({root,taskDir})` returns `{record,preimage}`. `root` is explicit;
the store does not infer the current working directory. `writeTaskRecordV2`
initializes an empty lifecycle or updates metadata against exact previous
bytes. Existing lifecycle fields cannot be edited through this writer;
formal changes require `applyTaskOperationToStore`.

Store application requires `{root,taskDir,operation,workflow,
expected_preimage}`. Paths are contained managed Task paths and every existing
component, including dangling symlinks, is checked before IO. Identity
reservation scans active/archive headers without accepting their old lifecycle
metadata; historical invalid records retain #29's visible-name fallback. New
collisions fail before directories are created. Existing identities and
terminal facts are immutable. Writes use an exclusive same-directory temp file
and atomic rename, preserve existing permission mode, and compare the preimage
again after fact verification. These checks do not introduce a lock or claim
cross-process transactions.

Current gate/candidate application verifies actual local scope/plan bytes or
immutable Git objects. A local `AuthorityRef.revision` must be
`sha256:<64-lowercase-hex>` or an exact 40/64-hex Git revision. External URI
revisions are the original producer's authority; Core validates their shape
and does not retrieve external requirements/evidence. Evidence and obligations
remain producer-authored applicability inputs; Core does not decide whether
they prove enough work.

`computeCandidateContentRef(root,paths)` hashes compact UTF-8 JSON entries in
UTF-8 byte path order: `[relative_path, mode & 0o777, sha256(file_bytes)]`.
An explicitly selected absent file is `[relative_path,null,null]`, supporting
real deleted content in full-range candidates. Nested path components remain
checked when a leaf is absent. Canonical lifecycle/session/private runtime
paths are rejected. Extension owners must omit their owner-private files from
the declared candidate; upstream does not parse or guess private Guru layouts.
Ordinary candidate verification checks actual content/modes, exact current HEAD
when present, and the exact Git base object. A commit remains separate from
content identity.

Local delivery verification reconstructs the exact commit's selected file
bytes/modes, including deleted paths. Manual verification checks an existing
retained artifact's content hash. PR/external artifact facts require an injected
read-only original-producer `verifyFact(fact):boolean`; absent/false verification
fails `fact_verification_required`. Core performs no GitHub mutation. The
Python CLI owns its concrete read-only GitHub postcondition adapter.

`historical_success:true` bypasses current gate freshness and current-file
comparison, while still verifying the original outcome's objective commit,
artifact or PR facts. It records no missing gate passes. Existing actual
publication may be recovered independently, including after delivery, without
repeating publication. Stopped deliveries cannot be relabeled delivered.

## Shared corpus and producer mappings

`packages/core/test/fixtures/task-v2/` is shared with Python:

- `native-multi.json`: Task scope, two distinct slices, four independent gates,
  terminal replay/conflict, stopped slice, independent Completion/Closure,
  reopen and validation-only new-generation Completion.
- `guru-public-mapping.json`: observed public Review `ready` seed,
  Publish `ready_for_merge`, complete nine-field `merge_result`, and the actual
  `task_artifact`/`merge_result` Completion seed. `merge_commit_sha` maps to the
  new public `merge_commit`; the original private cycle remains an upstream
  fixture provenance field and never becomes the Delivery UUID. The exact
  authored PR body hash binds readiness obligations and publication. Current
  authority drift followed by actual historical success restores the same
  delivery result twice without manufacturing approvals.
- `invalid-inputs.json`: closed operation/owner/API/key errors and shared
  strict-schema inputs, including boolean generation and legacy writable data.
- `hash-cases.json`: independently generated UTF-8/astral/Chinese path and
  explicit-deletion content digest.
- `profile-recovery.json`: normal execution/replay rejects profiles removed
  from the active workflow; actual historical-success recovery retains the
  original objective outcome without manufacturing current approval.

These are interface/behavior fixtures, not actual Guru installed execution,
original business-session recovery or real remote publication/merge. Guru #531
owns the concrete adapter and paired installed evidence. No private Guru file
is parsed or modified.

## Validation

Final Core lint and typecheck passed. Full Core suite passed: 24 files, 437 tests
passed and one existing SQLite capability test skipped. The 26 new tests also
exercise real temporary Git repositories, stale raw bytes, content/authority
drift, dangling/contained symlinks, archived casefold reservation, whole-record
bypass refusal, verification-time edits and failed atomic rename preservation.
Parent owns package build/install, CLI/Python checks, native owner samples,
independent full Review, D2 migration/cutover and joint evidence. No commit,
push, PR, release, cleanup, submodule or business migration occurred here.
