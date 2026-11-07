# Preserve repeated historical Tasks during worktree migration

## Goal

Allow a complete Plan2 migration to retain historical copies of one Task identity that appear in multiple registered worktrees. Historical copies must not become execution authorities or weaken validation for active Tasks.

## Background

Plan2 inventories every registered worktree that contains Trellis data. A Task archive can therefore appear in several roots when its tracked history was inherited across branches. The current identity-group check rejects every repeated Task ID because every member must be active. This blocks otherwise valid migrations even when the duplicate records are historical-only and the plan preserves their raw bytes.

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Permit repeated `history_only` Task identities only across distinct registered workspaces when Task ID casing, lifecycle generation, and source provenance agree. |
| R2 | Permit one reviewed active authority to coexist with matching `history_only` archive copies in other workspaces. History-only rows do not count as active authorities and do not select a binding. |
| R3 | Preserve every Task record and artifact at its original path with its original bytes and mode. Do not merge, convert, rename, or delete archive copies. |
| R4 | Keep active-copy validation unchanged: repeated active identities still require one authority, valid deferred peers, matching identity/generation/source, distinct workspaces, and existing branch-binding checks. |
| R5 | Reject same-workspace duplicate identities, case changes, generation changes, source-provenance changes, multiple authorities, all-deferred active groups, and incomplete inventories before writes. |
| R6 | Keep Plan2 schema and public migration API unchanged. Make retries and rollback use the same reviewed identity group and raw preimages. |
| R7 | Update the migration contract and regression coverage to describe and verify these rules. |

## Acceptance Criteria

| ID | Observable result | Requirement |
| --- | --- | --- |
| AC1 | A Plan2 inventory with matching archive-only copies in distinct workspaces previews and migrates without changing their raw bytes or modes. | R1, R3 |
| AC2 | One valid active authority plus matching archive-only copies is accepted; existing active branch-binding validation still applies to that authority. | R2, R4 |
| AC3 | Existing active inherited-copy cases and their ambiguous-authority failures retain their current results. | R4, R5 |
| AC4 | Same-workspace, case, generation, provenance, multiple-authority, all-deferred, and omitted-inventory cases reject before writes. | R5 |
| AC5 | The CLI migration contract accurately describes the allowed archive-copy case and its boundaries. | R6, R7 |
| AC6 | Focused migration integration coverage and applicable CLI quality checks pass. | R7 |

## Out of Scope

- Changing Task identity, Task schema, or Delivery API.
- Creating, repairing, or inferring branch bindings.
- Converting, merging, renaming, or deleting historical Task data.
- Publishing a new Trellis package or Guru extension release, or applying the migration to `k8s-infra`; those remain follow-on operations after this source change is reviewed and available as a complete source.

## Constraints

- Keep all registered workspace and Task/artifact inventory checks complete.
- Do not change the existing active authority or branch-binding contract.
- Keep migration execution and rollback bounded to the reviewed Plan2 paths.
