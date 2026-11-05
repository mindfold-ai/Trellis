# Research: legacy formal archive recovery boundaries

- Query: Minimal extension for Issue #64 across public CLI/Core and retained-predecessor consumers.
- Scope: internal; Issue #64 and existing public candidate delivery conventions.
- Date: 2026-11-05

## Findings

### Existing positive recognition and strict-reader boundary

- `packages/core/src/task/migration.ts:11` defines `isKnownLegacyTaskRecord`: no generation or structured source; requires id/name/title/status/creator/assignee strings, a valid TaskId, allowed fields and typed optional metadata. The ten-field sample is already positive legacy; do not normalize it before inspection.
- `packages/core/src/task/maintenance.ts:18` already returns `{kind:"legacy",task_id,generation:0}` only after positive recognition. Schema1 and schema2 use their strict parsers.
- `packages/cli/src/templates/trellis/scripts/common/maintenance.py:13` mirrors the known legacy predicate. Reuse it in narrow Python retained-relation interpretation rather than admitting legacy through current `read_json_checked`/`read_task_identity`.
- `packages/core/src/task/schema.ts:128` and Python `task_utils.py:72` remain strict ordinary current readers. Identity reservation deliberately reserves older IDs without accepting their lifecycle.

### Actual formal operation path

| File / function | Current role / gap |
| --- | --- |
| `packages/core/src/task/maintenance.ts:167`, `validateFormalArchiveReactivationProjection` | Explicitly rejects everything except completed schema1. Already enforces one increment, accepted scope, historical-only deliveries, no imported gates/Completion/Closure and exact legacy-fact dispositions. |
| `packages/core/src/task/migration-projection.ts:5`, `validateProjectionIdentity` | Shared metadata/tree/artifact/source equality when fields exist. Missing structured source currently has no legacy-scope consistency contract. Keep ordinary migration behavior intact. |
| `packages/cli/src/commands/maintenance/tasks.ts:297`, `inspectTaskTargetDetails` | Reads raw snapshot, positive classification and exact key, then enumerates original bytes/modes. Formal path uses detached-history mode. No current schema reader required here. |
| Same file:1162, `verifyFormalArchive` | Explicit schema1-only gate. Beyond it checks exact monthly archive/original paths, full OIDs, reachable Git facts, absent original active tree, exact committed archive files/modes/bytes, evidence. Retain all of these. |
| Same file:1276, `successorAt` | Checks strict v2 record, exact provenance, retained source hash, same ID and higher generation; validates intermediate Completion history. It currently does **not** compare successor source to predecessor source. Add the same public source relationship validation here. |
| Same file:1353, `inspectFormalArchiveReactivation` | Scans active and archived v2 successors, validates selected root first, then registered siblings; returns absent/verified/conflicting. Archived `task_ref` already expresses actual archive location, with no active-key claim. |
| Same file:1478, `validateAppliedFormalArchive` | Original receipt recovery finds unique public v2 successor and calls `successorAt`; shared relationship fix therefore also covers lost caller output/replay. |
| `packages/cli/src/commands/maintenance/api.ts:140,170` | Capability type and value say only `["schema1"]`. Extend together with actual formal support. API remains 1.0 additive. |

Recommended design: export one small Core formal-predecessor interpreter/source relationship validator on existing `/task/maintenance`; share it among formal projection, CLI archive verification, CLI successor checks and Core retained-predecessor relation. Existing `classifyMaintenanceTask` remains broad diagnostic family recognition. Formal support is completed schema1 plus positively known legacy whose absent structured source can be matched to canonical old `GitHub issue: https://github.com/OWNER/REPO/issues/N` scope. Legacy generation is 0, source bytes unchanged. The projection must contain a valid `issue` source with matching `repo_ref`/number. Its valid disposition stays explicitly caller-authored; scope cannot establish `exact_source`, closure authority or delivered business extent. Unsupported/missing/noncanonical scope must yield a concrete source diagnostic rather than invent `no_issue`. Preserve any present schema1 source exactly.

Existing exact-locator inspection still requires caller key: `InspectTaskTargetInput` and `InspectFormalArchiveReactivationInput` both require it; `maintain inspect-task` requires `--task-id` and `--generation` (`command.ts:89`). For the requirement to obtain identity from exact archive location, consider a minimal additive locator-only inspection path or optional expected key on existing inspect API, with returned positive family/identity. Do not require a downstream copied parser. Prepare/execute continue requiring the explicit exact key.

### Retained predecessor identity reservation

- `packages/core/src/task/v2/store.ts:90`, `formalPredecessorForRelocation`: reads public provenance, checks key/path/OID shape and higher current generation, then forcibly calls schema1 `taskRecordSchema.parse` on original archive. Replace only this boundary with shared formal-family and source consistency interpretation; retain exact source-copy equality and ordinary create reservation.
- `packages/cli/src/templates/trellis/scripts/common/task_utils.py:134`, `_formal_predecessor_for_relocation`: same relation, currently reads original through `read_json_checked`, requires explicit generation and structured source equality. Read raw JSON positively for supported legacy; reuse maintenance legacy predicate; validate generation/source equivalently. Keep ordinary current reader strict.
- Dogfood twin `.trellis/scripts/common/task_utils.py` must remain byte-identical. Any change to native `common/maintenance.py` also needs its `.trellis/scripts/common/maintenance.py` twin.
- No general identity-reader rewrite is necessary. Current successor readers and operations remain v2 strict; old archive exclusion only happens when the selected Task carries valid formal provenance.

### Tests and public execution evidence

- `packages/core/test/task/formal-archive-reactivation.test.ts`: existing pure projection cases and no-manufactured-history rules. Add direct ten-field fixture recognition, source mismatch and exact g0→g1 cases.
- `packages/cli/test/commands/maintenance-formal-reactivation.integration.test.ts`: existing real-Git/public API fixture. Existing tests cover no-write inspect/prepare/preview and bounded apply (:217), lost-output recovery (:258), sibling snapshot progression (:306), native scope/completion/reopen/rename (:393), actually archived successor and next original-entry inspection (:475), SDK relocation with duplicate create reservation (:549), partial same-operation replay (:586), public command envelope/capability (:751).
- Extend/reuse these patterns for unmodified ten-field legacy source; filter creator/assignee out of successor metadata and author complete v2 projection. Keep raw predecessor fixture untouched. Legacy `completedAt` requires existing explicit `source_snapshot` attribution.
- Cover original archive bytes/modes/tree equality, pending no successor result, actual apply one increment, deleted caller/public receipt discovery active and archived, original recover/resume, source/locator/provenance mismatch errors and no writes. Real native completion/archive and SDK relocation exercise actual TS/Python collision consumers. No second full lifecycle required.
- Relevant regressions: Core maintenance/migration-v2/formal tests; CLI maintenance task/resume/engine tests; native task identity/archive/delivery location tests. Schema1 formal, schema2 native reopen, manual preserve-generation archive resume must retain semantics.

### Packaging / fixed candidate

- CLI and Core are both `0.7.0-castbox.6` and are required to match (`packages/{cli,core}/package.json`). Package version alone cannot distinguish same-version changed builds.
- `packages/cli/scripts/release-preflight.js` documents `verify-packed-cli` and exact workspace dependency rewriting. Existing Task `10-20-635-formal-archive-reactivation/implement.md` U-T8 uses `pnpm build`, packs actual CLI and Core tarballs and installs both together in one isolated prefix, avoiding registry Core substitution.
- Record exact source commit, matching package versions, API 1.0 capability, tarball SHA256 and reproducible build/pack/install commands. Exercise the installed public SDK/bin against the same legacy fixture. Git source pin plus build provenance is required; no npm release or Guru installation is needed for this Issue.

## Related specs

- `.trellis/spec/core/backend/index.md`
- `.trellis/spec/cli/backend/{index,trellis-core-sdk,commands-maintain,task-lifecycle,delivery-lifecycle,filesystem-safety,script-conventions,quality-guidelines}.md`
- `.trellis/spec/cli/unit-test/{conventions,integration-patterns,mock-strategies}.md`

## Caveats / Not Found

- Research only: no product changes or validation runs performed; existing source examples are not evidence that legacy formal recovery works.
- No real business archive recovery or Guru Finish/PR semantic review is in scope.
- Source disposition is caller authority; do not infer its value solely from the old scope URL.
- Existing archived `task_ref` accurately reports archive location; no state field is required unless implementation finds a consumer that cannot distinguish it.
