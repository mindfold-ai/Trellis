# Plan2 explicit mixed-source migration

## Goal

Allow an owner-reviewed Plan2 inventory to contain strict schema-1 and positively
known legacy Tasks together. Convert selected Tasks while preserving neighbors
exactly and retaining existing migration safeguards. Acceptance belongs to this
independent upstream Task.

## Background

Planning base: `castbox/Trellis@fdb88e8e220b42df0f0b78f8b939e072d36b9be1`,
tree `b1967d4637e092c4db481705a838a40ff6a38a57`, clean before Task creation on
2026-10-13. This is a `no_issue` Task; #31 stays closed and its inherited-copy
follow-up stays archived.

Prior read-only classification found 28 strict schema-1, three known legacy and
zero schema-2 active Tasks in the designated sample. #406 itself is schema-1,
generation zero. This is input-shape evidence, not full-plan preview/execution.
See [source analysis](research/source-analysis.md) for provenance and limits.

The closed schema has only global `legacy|1.0` (`migration2-schema.ts:50`);
conversion and defer use that choice (`migration2.ts:548`, `:587`). Neither
validates a mixed inventory. Omission, split plans or misusing current/history
dispositions cannot bypass the complete inventory requirement legally.

## Requirements

| ID | Required behavior |
| --- | --- |
| R1 | Add global `source.task_schema: mixed` and row `source_task_schema: legacy|1.0`, required on every mixed convert_active/convert_archive/defer row. Keep Plan schema 2, Task schema 2, Delivery API 1, RawSnapshot and command flags. |
| R2 | Validate the declared predecessor with its existing strict public validator against the frozen original snapshot. Missing/invalid declarations, mismatch and malformed/unknown records fail before writes. Never infer or fall back to another parser. |
| R3 | Old homogeneous plans omit the row field and retain behavior; reject homogeneous row overrides. Mixed current remains strict schema2 with raw preservation and no target record; history_only retains existing location/absence/history constraints. Both reject row selectors. Mixed need not contain both predecessor types. |
| R4 | Keep projection/authority gates, identity, existing generation/source and business/tree metadata. Only the existing legacy default generation rule applies. Preserve converted original bytes/modes, including retired personnel/status, as migration history; no old outcome creates a gate or completion. |
| R5 | Deferred records and all descendants retain exact bytes/modes, whitespace, UTF-8 and planning variants. No serialization/defaults, peer migration/Delivery additions or preserve writes. Deferral grants no current-reader authority. |
| R6 | Retain complete workspace/installation/Task/artifact/session inventories, path safety, identity/provenance collisions, unique binding authority, final pre-write rechecks, third-state rejection, original-source partial recovery, completed replay and caller-owned exact rollback. Mixed grants no duplicate-ID exception. |
| R7 | Align public spec/code/tests and exact packed public-entry synthetic proof. Report real classification, preview, isolated execution and business recovery separately. Upstream acceptance never waits for #531 or joint acceptance. |

## Acceptance Criteria

| ID | Observable acceptance | Requirements |
| --- | --- | --- |
| AC1 | A complete synthetic 28-schema1/3-legacy inventory previews without writes, converts one schema1 Task and preserves 30 neighbors/descendants exactly. Reverse legacy conversion with schema1 neighbors deferred and valid mixed archive conversion also work. | R1, R2, R4, R5 |
| AC2 | Missing/bad/forbidden selectors, wrong source type, malformed/unknown records and homogeneous overrides fail before writes, with intended errors and full-tree equality assertions. | R2, R3 |
| AC3 | Original homogeneous Plan1/Plan2 regressions pass. Mixed current/history roots and single-kind mixed plans work; current target records and nonempty active history_only remain invalid. | R3 |
| AC4 | Converted source backups remain byte/mode exact; projection retains id/generation/source/tree/business facts. Deferred records/descendants are exact and preserve paths receive no writer calls. No fabricated lifecycle facts. | R4, R5 |
| AC5 | Mixed registered Git siblings preserve inherited peers and select the reviewed unique authority. Inventory/binding/identity/alias/path/drift/topology negatives remain zero-write failures. Installed Python resolves exact Task/Delivery from both roots; deferred direct selection rejects. | R6 |
| AC6 | Actual atomic-write failure permits same-plan recovery from original declared predecessors; completed replay has no writes, third states reject without writes and caller rollback restores the complete approved set and removes only added paths/directories. | R6 |
| AC7 | Spec/code/tests agree, required root checks and actual Python 3.9 validation pass with skips/warnings/failures disclosed. A new CLI tar and verified matching Core pair reproduce synthetic public-entry proof, tied to exact source, installed bytes/modes and template/plan hashes. | R7 |

## Scope and authorization

Exactly four planned product/spec paths are frozen in
[provenance.json](research/provenance.json). Core, Python/runtime templates,
Task/Delivery model, Guru product and package version changes are outside this
minimal revision. If needed, refresh planning and authorization before expansion.

The designated real sample and all existing samples stay read-only. Real #406
projection/history/topology/gate inputs remain with the original owner. No #406
completion, #531 Check pass or real cutover is claimed or required for upstream
acceptance. A future real rehearsal needs separate approval of a fresh isolated
copy, complete owner-reviewed plan, topology remapping, backup and rollback.

Approval on 2026-10-13 covers Task creation/binding, reviewed planning, activation,
four-file implementation and ordinary regression/quality build/tests. Offline
candidate build/pack/install and standalone synthetic rehearsal await approval. Branch/
worktree creation, commit/push/PR/merge, release, business installation switching,
cleanup and outbound messages remain separate actions.

## Decisions and risks

Use explicit row declarations, not inference, private preprocessing, omission or
version spoofing. The first candidate is offline at current `.3` if unchanged,
using existing same-version Plan2 cutover. Never publish a same-version npm
replacement. Hashes identify the new contract; old closed-schema CLIs reject it.

Main risks are inconsistent convert/defer dispatch and accidentally classifying
live partial targets. AC2/AC6 address them. Preserve existing ordinary recovery
and caller rollback; no transaction/locking hardening is proposed. No blocking
product decisions remain. Candidate identities and execution results are pending.

## Subsequent offline validation authorization

On 2026-10-13 the user replied `确认继续` to the exact proposal in
research/candidate-validation-plan.md. That subsequent approval covers the fresh
`/tmp/plan2-mixed-source-candidate-9981ff40b934` root, offline candidate
build/pack/install, complete synthetic rehearsal and independent audit. It does
not authorize commit/publication, Trellis branches/worktrees, existing or real
sample writes, release, outbound messages or old-resource cleanup. Original
planning/quality reviews retain their historical snapshots; current execution
facts belong in research/provenance.json and candidate-validation-results.md.
