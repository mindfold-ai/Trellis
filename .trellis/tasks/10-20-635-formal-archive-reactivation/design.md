# Formal archive reactivation design

## 1. Ownership

`prd.md` owns requirements; `research/current-boundaries.md` records inspected evidence. This design adds one maintenance capability without changing the native planning workflow.

The calling AI owner reviews formal completion, history sufficiency, pending old transactions and the reason for new work. Core validates domain data. CLI validates exact Git/file facts and executes a frozen plan. Target-native owners establish new-generation environment binding and select the next semantic step. No authorization or semantic-pass field is recorded.

## 2. Public interfaces

Add `validateFormalArchiveReactivationProjection(source, projection, facts)` to Core `/task/maintenance`. It returns validated `TaskRecordV2` and uses existing `LegacyFactDisposition[]`. No Git, filesystem, CLI rendering or Guru interpretation occurs in this validator.

Add separate CLI maintenance SDK exports `inspectFormalArchiveReactivation` and `prepareFormalArchiveReactivation`, with their types. The latter returns a `PreparedMaintenancePlan` of new kind `formal_archive_reactivation`. Register `trellis maintain inspect-formal-archive --input <file> --json` and extend prepare's `{kind,input}` envelope. Retain existing preview/apply/recover/resume/rollback commands and `MaintenanceError` JSON conventions.

Use a separate closed `FormalArchiveReactivationInput`, without inheriting manual resume's sessions/binding fields:

| Field | Contract |
| --- | --- |
| `root` | Exact existing registered target checkout; maintenance creates no Git resources. |
| `key` | Predecessor `{task_id,lifecycle_generation:g}`, matching actual source. |
| `task_ref` | Exact monthly archive using the current finite path layout. |
| `original_task_ref` | Explicit original direct active locator; never inferred from basename. |
| `active_ref` | New direct active destination, absent on fresh preparation. |
| `archive` | `{commit,target_ref,target_head,evidence}`: exact archive commit, selected resolvable target, observed target commit, and repository-file AuthorityRefs for the reviewed historical content. Use existing Git OID/AuthorityRef contracts. |
| `projection` | Complete current Task v2 at exactly `g+1`, with actual accepted-scope authority. |
| `artifacts` | Existing retained-artifact dispositions. Preserve original bytes/modes; writes only project real planning files under current rules. |
| `legacy_facts` | Existing original-owner attribution type for commit/PR/completion-date fields. Unknown facts stay in raw history. |

Canonical schema1 is the only predecessor family; no caller-selected legacy family is needed. The input contains no session/binding retirement, ledger action, next-owner execution, authorization or semantic approval.

The inspection input contains only `root`, `key`, `task_ref`, `original_task_ref` and `archive`. It needs neither projection nor proposed active destination. Output reports inspected predecessor identity/locator and a discriminated successor observation: absent, one verified `{key,task_ref}`, or conflicting candidates with exact locators. It reports facts without choosing among ambiguous candidates. Malformed or mismatching inputs use existing diagnostics.

## 3. Pure projection and references

Require canonical schema1, completed status, safe nonnegative generation that can increment, matching key and valid complete Task v2 projection. Preserve immutable identity/source/metadata, `artifact_origin` and exact task tree. Require actual accepted scope. Retained Deliveries must be genuine historical delivered outcomes at the predecessor generation. Reject current-generation work, imported gate authority and manufactured Completion/Closure. Preserve raw source separately.

If shared logic is needed, extract a private identity/tree/history helper from `migration-v2.ts`. Ordinary `validateTaskV2Projection` keeps its public signature and preserve-generation rule. The new validator uses an explicit increment rule. Never modify source generation merely to pass the old validator.

CLI verifies accepted-scope, planning and evidence AuthorityRefs against retained files, readable exact history or real planned output. Reuse public artifact resolution and authority verification. Preserve explicit `artifact_origin` relocation ownership. File copies with unreadable old locators are insufficient; do not add a second resolver or initialize origin for convenience.

Source inspection during U1 showed that `resolveTaskArtifactLocator` and `verifyAuthority` with context load an existing Task v2. They cannot resolve an active projection before its tree exists. Additively expose the existing pure `authorityLocator(ref, context)` through `/task/v2`, keeping its mapping unchanged. Derive context from the validated projection and explicit destination, then independently verify actual/planned content. This reuses the existing resolver logic without relaxing live selected-Task checks or adding another mapping owner.

## 4. Git facts and bounded writes

Verify the archive commit's exact tree against selected source, its reachability from the selected target, and absence of the original active path in that archive result. Reject occupied destinations or ambiguous same-Task active ownership before fresh preparation.

Freeze archive commit and observed target head. On replay, normal target advancement is valid if both frozen commits remain reachable. If they are no longer reachable or source/destination changed normally, follow existing stale/conflict recovery. Do not chase the latest SHA or infer historical completion from its tree.

The write set contains one new active Task tree, retained artifacts/real planning projections, original `migration/source-task.json`, and new `migration/formal-archive-reactivation.json`. New provenance contains only predecessor key, archive ref, archive commit and original active ref. The current Task already exposes the new key. Provenance is not approval, authorization, resource ownership or a second lifecycle ledger.

The original archive, old-generation sessions/bindings/resources, other Tasks and other checkouts are read-only or outside scope. This operation does not require old local resources to exist.

## 5. Frozen operation and successor lookup

Reuse existing operation identity, candidate identity, preimages and ordinary partial replay. Add a distinct guard for predecessor `g` and output `g+1`; manual resume's single-generation projection is insufficient.

Retain existing operation/status/recovery result fields. Only the new kind's applied variant exposes `reactivated_task:{key,task_ref}`. Prepared/pending/rolled-back variants do not claim an active successor. Preserve existing results, including manual `resumed_task`. Repeat apply/recover/resume returns the original operation output once, even after later lifecycle advancement.

When private receipt is unavailable, inspection verifies public provenance against original source, archive commit and predecessor key. A uniquely verified accessible successor can be reused without new conversion or an empty transaction. Same TaskId alone is insufficient. Inspection makes no claim about inaccessible unpublished state in other clones.

For later `g+2` and higher successors, verify conversion provenance plus real public history required by each ordinary reopen transition. Use the existing matching Completion rule for intermediate generations; do not invent initial old Completion or add a Closure prerequisite. Missing history produces a concrete mismatch. The original operation result remains about `g+1`, while inspection reports current accessible identity.

### Registered shared successor snapshots

Inspection reports the successor in the explicitly selected `root`. It does not select environment ownership or reconcile business state between checkouts. Resolve the root's candidates first and validate its unique successor with the existing `successorAt` provenance, retained-source and intermediate-Completion checks.

Read registered sibling candidates through that same public parser and validation. A sibling that belongs to the same formal predecessor and has a generation no greater than the verified root successor is a shared or earlier snapshot. It does not make the root identity ambiguous. Normal Delivery, scope or lifecycle progress can make the records differ; do not require whole-record equality or merge their contents. Return only the root successor's actual key and locator.

A newer sibling, a different predecessor/provenance relationship or an invalid successor remains a concrete conflict. If the root has no successor but a sibling owns one, do not return the sibling locator as if it belonged to the root and do not prepare another conversion. Multiple candidates in the root retain the existing conflicting result. Inspection stays read-only and has no dependency on Guru-private branch bindings or receipts. Fresh preparation still requires an absent successor, so these shared-snapshot reads cannot create another generation.

## 6. Rollback and environment ownership

Check original actions/preimages and real output-generation Task/artifact changes, Deliveries, session selection and branch binding before rollback. Later work returns `later_work_conflict` and remains intact. Otherwise rollback removes only the tree created by this operation. Old-generation records, seals and resources remain untouched.

The original environment owners bind the new generation after conversion. Applied-result recovery and later successor inspection remain distinct; a native binding must never cause duplicate conversion.

## 7. Native runtime and distribution

CLI/Core remain the sole converter. Test existing native Task v2 readers first. Change only a demonstrated reader gap, with canonical template/dogfood parity and Python 3.9 support. Do not add a Python conversion state machine or weaken ordinary reopen/unknown-record eligibility.

The real native rename regression exposed one such gap: identity reservation treated the retained schema1 predecessor as an unrelated same-ID record. In the existing reservation owner, permit only relocation of the actual converted Task to exclude its positively matched predecessor using public provenance and the exact source snapshot. Create keeps global historical identity reservations; unrelated collisions still stop. This finite read exception does not change conversion or ordinary reopen writers.

Keep `maintenance_api:"1.0"`; add the operation kind and independent `formal_archive_reactivation` capability for schema1, `generation:"increment_once"`, `original_archive:"read_only"`. Callers require explicit capability plus matching source/build identity. Core/CLI build and pack at the same version. This Task does not select a future release version.

## 8. Validation and downstream adoption

`implement.md` owns ordered work and tests. Pure behavior belongs in Core; real Git, public CLI/executor, reference resolution and rollback belong in CLI. One actual packed-pair sample proves target-native identity/continuation and a real scope supplement through the declared task-scope owner without an empty Delivery.

This proves only provider acceptance. Guru adoption requires exact upstream source/CI/capability facts, its original source-lock owner and its own planning/activation gates. Original #635 Task/D1 retains all V1–V8. Local tests do not prove merge, publication, source-lock adoption or full release compatibility.
