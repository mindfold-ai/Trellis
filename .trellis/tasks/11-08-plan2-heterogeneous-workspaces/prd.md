# Support heterogeneous Plan2 workspace migrations

## Goal

Extend Plan2 migration so one reviewed repository can migrate registered workspaces with different supported source Core versions while preserving current Task records, historical copies, and existing session/branch authority. Deliver the public source fixes through a reviewed main merge and identify a clean matching CLI/Core source build; downstream Guru and business installations remain with their original owners.

## Requirements

- **R1 Per-workspace Core predecessors:** Plan2 must support a complete registered-workspace inventory whose `.trellis/.version` files contain different supported predecessor versions. Each original version and mode remains frozen per workspace. The invocation `--from` value continues to identify the invocation workspace, and every workspace version must be an accepted predecessor of the same target CLI.
- **R2 Existing current v2 inheritance:** Reuse merged PR #66; do not reimplement or weaken its parsed-record equality, unique authority, raw-byte preservation, or reviewed binding requirements.
- **R3 Generation-aware identity:** Group by exact lifecycle generation and case-folded TaskId; retain exact TaskId spelling within the group. Default generation zero only for positively recognized preidentity legacy records. Missing generation in unknown history must not confer active membership.
- **R4 Honest historical and invocation disposition:** Positively validated completed legacy/schema1 records may remain entirely raw `defer` history in any workspace without projected lifecycle authority, provided no valid source session in effective native storage or reviewed target session selects the identity. Incomplete all-defer identity groups remain invalid. A unique unselected invocation-workspace `current` record may stay raw and unbound; an existing omitted binding, a session selection, inherited current-v2 peers, or a sibling execution authority still requires the original valid binding. Never create binding, reopen a completed Task, or merge differing v2 records to pass migration.
- **R5 Complete inventory and isolation:** Continue to require every eligible registered workspace, Task, artifact, session, workflow, template, and retired-path disposition. Per-workspace version support must not reduce inventory, path-safety, preimage, replay, or rollback checks.
- **R6 Compatibility:** Keep the existing `trellis migrate --from <version> --plan <file> [--dry-run]` command. Homogeneous Plan2 inventories and Plan1 migrations retain their current behavior.
- **R7 Large preservation inventories:** A reviewed `preserve` decision for a Task artifact may carry only its SHA-256 and permission mode. The executor must compare both values with the live preimage before mutation. Content-free snapshots must not authorize a write, removal, template, workflow, Task, binding, session, or file outside Task storage.
- **R8 Known legacy Guru extensions:** Plan2 may recognize the closed historical Guru extension field set through Core's legacy predecessor classifier. Preserve those fields in the raw source snapshot; do not make them current schema or lifecycle authority. Other unknown top-level legacy fields remain unsupported.
- **R9 Missing-record evidence alias:** Preserve a recordless active evidence root beside a record-bearing `history_only` archive in the same workspace only when the archive TaskId matches the existing visible-name normalization. The exception must create no active identity or lifecycle authority.
- **R10 Same-workspace active/history copies:** Within one TaskId/generation group, allow one active copy and one matching `history_only` copy in the same workspace. Across the full group, any execution authority remains unique; the bounded unselected completed predecessor history exception may have no authority. Active peers remain valid `defer` rows. Reject multiple active copies or multiple history copies in one workspace.
- **R11 Unasserted non-authority provenance:** A positively recognized legacy record without `source` may remain in an identity group only as an explicit `defer` or `history_only` row. It asserts no provenance and grants no authority. All asserted provenance must match across the group independently of row order.

## Constraints

- Keep active Task projections, branch/session identity, source provenance, lifecycle generations, and historical artifacts lossless.
- Do not infer branch bindings, current session selection, delivery results, approvals, or completion from branch names, PR state, or task paths.
- Do not rewrite or merge current/archived Task records to make an identity group pass.
- The migration caller remains responsible for semantic dispositions, exact preimages, backup, recovery, and rollback.

## Acceptance Criteria

- [ ] A Plan2 inventory with supported mixed Core predecessor versions previews and migrates to one target version; each workspace's exact original version is reported in the action set.
- [ ] Existing homogeneous-version Plan2 and Plan1 behavior remains unchanged.
- [ ] An active current v2 Task with matching v2 peers across distinct workspaces accepts exactly one `current` authority and `defer` peers, preserving all raw Task bytes/modes and artifacts.
- [ ] Completed predecessor groups preserve all raw copies without authority, regardless of invocation location; incomplete all-defer groups reject. A unique unselected invocation current record stays raw/unbound; v2 peers retain PR #66 requirements.
- [ ] A session-selected Task without its existing valid C4 binding rejects before writes. A current v2 Task with no selecting session and no binding remains unbound and unchanged.
- [ ] Earlier archived generations and a later active generation of the same TaskId remain separate groups. Same-generation active duplicates retain the one-authority rule.
- [ ] Case, provenance, generation, multiple active/history copies in one workspace, multiple authorities, incomplete all-deferred, source/target-session-selected missing binding, stale-preimage, omitted-workspace/Task/session, and malformed-version cases reject before writes.
- [ ] One active copy and one matching `history_only` copy in a workspace preserve both raw artifact sets while any execution authority stays unique; unselected completed predecessor history may have none.
- [ ] Same-plan replay, partial-failure recovery, and caller rollback preserve each workspace's source version, Task bytes/modes, sessions, and bindings.
- [ ] Hash/mode-only preserved Task artifact snapshots keep exact preimage checks and reject byte or mode drift before any write.
- [ ] Known legacy Guru extensions classify as predecessors with exact value-type checks; unknown extension names remain rejected and source bytes remain unchanged.
- [ ] A recordless active evidence root and matching archived Task preserve both artifact sets without an active identity; malformed identity or alias matches and unrelated visible-name collisions still reject before writes; ordinary raw history-only content remains preservable.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- This is a cross-layer migration change. Add `design.md` and `implement.md` before `task.py start`.

## Current authorized boundary (2026-11-08)

- Original owner remains this Task and `codex/plan2-workspace-version-and-bindings`; incorporate original `06cffb30` repeated-history work and current main containing PR #66.
- Validate large preserved artifacts with a real approximately 925 MiB fixture without embedding bytes in Plan2 JSON; exact digest and mode remain mandatory.
- Distinguish nested snapshot `task.json` artifacts from this workspace's explicit Task root records.
- Historical Guru package path fields may legitimately be null; original metadata stays in raw migration history and never becomes native gate authority.
- Exclude Guru sibling preset diagnostics, downstream nested-artifact diagnostics, workspace-4 business snapshot mismatch, attacks, races/locks, and crash hardening.
- Report actual merge parents/tree, package versions, clean source/build/CI identity, limits, and legal installation source contract. No same-version npm replacement or downstream installation is authorized here.
