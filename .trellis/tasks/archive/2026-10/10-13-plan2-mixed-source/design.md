# Design: explicit predecessor type per mixed Plan2 row

## Status and authority

Planning only. [prd.md](prd.md) owns requirements and acceptance;
[provenance.json](research/provenance.json) freezes base and four-file write set.
No candidate has been built for this Task.

## Closed input contract

Keep Plan schema 2, target Task 2/API 1, source delivery_api null, RawSnapshot
and command flags. Add global source enum `mixed` and optional Task row
`source_task_schema: legacy|1.0`. Enforce cross-field constraints in the closed
schema before repository processing, with an error path at the offending row.

| Global source | Row disposition | Selector |
| --- | --- | --- |
| legacy / 1.0 | Any | Forbidden; global declaration remains sole predecessor authority. |
| mixed | convert_active / convert_archive / defer | Required, exactly legacy or 1.0. |
| mixed | current / history_only | Forbidden; existing disposition-specific schema remains authoritative. |

Keep strict unknown-field rejection. Mixed describes explicit per-row review;
it does not require both predecessor types. Missing-record history roots and
schema2 current rows cannot declare predecessor selectors. Existing target
record restrictions apply unchanged.
An inventory containing only current/history-only rows is also legal in mixed
mode when all existing inventory and disposition constraints hold.

Illustrative row fragment only, not an executable full plan:

```json
{"workspace":"controlled","task_ref":".trellis/tasks/10-13-deferred","disposition":"defer","source_task_schema":"legacy","source":{"content_base64":"<original bytes>","sha256":"<raw hash>","mode":384}}
```

The full plan supplies every installation, Task/archive/artifact/session root,
workflow/template decision and required binding. Version checks are unchanged;
use actual source `.3` and supported same-version cutover, not a fabricated older
`--from` or rewritten `.version`.

## Data flow

1. Parse plan and selector constraints, then discover/validate full topology.
2. Decode/check the original row RawSnapshot, including canonical bytes/hash.
3. For predecessor dispositions, resolve the declared type from global
   homogeneous source or mixed row selector. Use one small CLI-local validation
   path shared by convert/defer, not another classifier.
4. Call public `taskRecordSchema.parse` for 1.0 or positive
   `isKnownLegacyTaskRecord` for legacy. Reject negatives; no fallback. Errors
   identify the row/disposition/declaration using existing exception handling.
5. Conversion proceeds through unchanged `validateTaskV2Projection`, identity
   and authority gates and existing prepare write. Store exact original
   bytes/mode at `migration/source-task.json`. Defer uses existing prepare
   preserve with original snapshot.
6. Current uses strict `parseTaskRecordV2` and raw preserve; history-only retains
   existing valid/unknown/missing-record semantics. No new dispatch applies.
7. Remaining inventory/ownership/session/gate validations, final pre-write
   topology/binding/source-or-target rechecks and execution stay unchanged.

Never classify from a live partially converted file, target record, package
version, invocation checkout or projected status. Existing Core public exports
provide validators/projection; no Core/API change is expected.

## Preservation and identity

Original identity grouping remains authoritative. It compares exact id,
generation and immutable provenance, using only current legacy generation zero
rules. Mixed distinct-format records with different identities are legal;
same-ID differing generation/provenance cannot bypass collisions. A legal
inherited group still requires one convert/current authority, deferred peers
in distinct canonical roots and one reviewed live checkout binding.

Projection retains existing business/tree metadata and legacy-fact dispositions.
Retired status/personnel survive in original source history, not schema2
development authority. Historical delivery never supplies current gates.
Deferred/current JSON, planning files and all descendants retain raw hashes and
modes. Inventory each descendant; preserve grants no write ownership. No peer
migration/Delivery paths are added. Prior absence remains absent. Rehearsal
snapshots include directories and symlinks as well as files and modes.

## Recovery and rollback

Original selector/snapshot remains authoritative after partial failure. Live
schema2 targets are handled by existing prepared source-or-target comparison,
not reclassified as predecessors. Preserve and completed targets never invoke
writers; third states reject before mutation. All final topology, checkout,
binding and marker predicates remain in place.

Keep ordinary sequential atomic writes. Caller backs up exact preview paths
outside tracked files, restores bytes/modes/prior absence and removes only
newly added paths/empty directories. Include common sessions/bindings in the
full manifest. No lock, stress testing, global transaction or production
rollback command is added.

## Candidate and public proof

After approval, produce a fresh offline CLI tar from a reviewed source commit
or complete dirty manifest/diff hash. Retain `.3` package version if unchanged;
record new CLI SHA, exact Core dependency, template/full plan hashes and
Node/Python versions. Old executors reject extended fields; old homogeneous
plans continue to work in the new executor.

Reuse fixed Core tar only after unchanged-source/pin verification and installed
regular-file bytes/modes matching. If Core changes are necessary, return to
planning and review a new pair. Install into a fresh recorded temporary root;
do not replace business or predecessor installations. Exercise actual
`bin/trellis.js`, installed Python 3.9 readers from both registered synthetic
checkouts and explicit isolated session identity. Fault injection stays in the
synthetic harness, never shipped code. Preserve failed/skip/warning outputs.

The earlier 28/3 classification informs synthetic fixtures, not cutover proof.
Future real rehearsal requires original-owner projection/history/scope/topology/
workflow/session inputs, approval of a fresh target and explicit topology mapping,
complete plan/preview hashes, backup and rollback. Existing samples stay read-only.
Missing real inputs are evidence_pending and do not block upstream acceptance.

## Trade-offs

Explicit selectors keep supported validators strict with a small closed-schema
extension. Inference hides invalid declarations; preprocessing violates raw
preservation; split plans violate complete inventory; broad model/Core changes
exceed the defect. The four-file design is the minimum current boundary.
