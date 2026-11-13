# Plan2 registered worktree copies

## Goal

Migrate the one branch-bound execution copy of an active Task while preserving inherited legacy copies in other registered worktrees. Callers must not omit occupied Tasks, erase branch planning, or invent multiple authorities to make migration succeed.

## Background

`migration2.ts:496` rejects repeated TaskIds before considering `defer`. The sibling test at `migrate2.integration.test.ts:1532` uses different IDs and misses tracked inheritance. Incoming installed preview rejected Task149 despite convert-current/defer-peers; 13,347 snapshot paths remained unchanged. Public Python already resolves shared bindings to one checkout (`session_storage.py:152`). Provenance and limits: `research/source-analysis.md` and `research/registered-copy-review.md`.

## Requirements

- **R1 — Reviewed copy group.** Permit exact TaskId/generation across distinct active registered workspaces only with one `convert_active` or active `current` authority, valid declared-predecessor `defer` peers, and a reviewed existing binding selecting the authority. Validate every source independently. Mutable branch variants may differ; immutable source identity must agree. Only positively known legacy absence defaults generation to zero.
- **R2 — Collision safety.** Reject case variants, generation/source mismatch, multiple authorities, same-workspace/canonical-directory duplicates, archive/history occupation, missing/invalid binding, unresolved/detached checkout and binding to a deferred peer. No invocation-root, first-match, status or planning-equality inference.
- **R3 — Preservation.** Keep complete workspace/Task/session/artifact inventories. Preserve deferred records and artifacts as raw bytes/modes, with no new Delivery/migration artifacts. Preserve selected root planning and retain its raw source history. Bindings remain unchanged.
- **R4 — Preflight/replay.** Freeze binding bytes/modes and expose preserve actions. Detect binding/path/checkout/topology drift before writes in preview, execution and retry. Recheck authority before the first mutation. Retain source-or-target replay and third-state rejection; no new transactional guarantee during writing.
- **R5 — Runtime selection.** Convert common schema-2 sessions to schema 3 against only the unique active projected Task/eligible Delivery, aligned with existing reviewed bindings and the public extension-marker missing-binding rule. Installed Python from either controlled checkout resolves that Task and valid continuation. Preserved sessions gain no inferred authority.
- **R6 — Compatibility/proof.** Keep Plan2 schema/API identities, Plan1 behavior and valid unique-ID/no-binding plans. Verify synthetic inherited registered worktrees and an installed exact candidate without original business-tree writes.

## Acceptance Criteria

| ID | Observable result | Requirements |
| --- | --- | --- |
| AC1 | Two tracked Tasks inherited by two worktrees, bound to different branches, preview with complete inventory and zero writes. | R1, R3 |
| AC2 | Only bound copies convert; opposite copies, branch-specific five planning files, raw modes and bindings stay intact; no peer artifacts appear. | R1, R3 |
| AC3 | Installed current-task/common-session/continuation select the exact bound converted Task from either checkout. | R5 |
| AC4 | R2 negatives, omitted inventories and binding/checkout/topology drift reject before mutation with zero writes. | R2, R4 |
| AC5 | Completed/partial same-plan replay converges; preserved files are not rewritten; third states reject; caller rollback restores preview-owned bytes/modes and removes only additions. | R3, R4, R6 |
| AC6 | Existing Plan1/Plan2 regressions, lint/typecheck/build and applicable installed checks pass; source/package/plan digests identify evidence. | R6 |

## Scope and constraints

CLI migration, public contract documentation and targeted integration tests are in scope. Issue #31 stays closed and independently accepted. No new/reopened Issue, #531 prerequisite, joint acceptance, business lifecycle recovery/installation switch, release, binding writer, plan generator, disposition ledger or arbitrary common-dir write API.

Planning is authorized; implementation needs artifact approval before activation. No unresolved product decision blocks this plan. Invalidated technical assumptions return the task to planning.
