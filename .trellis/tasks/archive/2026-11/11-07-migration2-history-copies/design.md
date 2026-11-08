# Plan2 Historical Copy Admission

## Architecture and Boundaries

The CLI migration executor remains the authority for complete workspace inventory, Task disposition, identity grouping, branch-binding validation, file preimages, and writes. This change is limited to the Plan2 identity-group validation in `packages/cli/src/commands/migration2.ts` and the matching migration contract and integration tests.

The plan schema does not change. `history_only` remains a preserve-only disposition. It never enters the projected active Task map, creates a Delivery, or supplies branch/session authority.

## Identity Group Rules

Group valid Task rows by case-insensitive Task ID as today. First validate exact Task ID spelling, lifecycle generation, source provenance, and workspace uniqueness across the group. Then separate active rows from archived/history-only rows.

- An archive-only group may contain multiple `history_only` rows when each row belongs to a distinct registered workspace and all identity facts match.
- A group with active rows must satisfy the existing active-copy rules: one `convert_active` or `current` authority, any remaining active copies use `defer`, and every active row has matching identity facts and a distinct workspace.
- Matching `history_only` archives may accompany that valid active group. They do not count toward the active-authority count.
- Same-workspace duplicate identities, mixed source/generation/case, malformed identities, multiple authorities, and all-deferred active groups remain errors.
- Add the duplicate-binding follow-up key only when multiple active copies require authority binding. Archive-only repetition does not create an active binding obligation.

The existing projected Task map and branch-binding validator remain unchanged. A single active Task with an installed workflow marker still requires its existing valid branch binding. This change does not create or infer one.

## Preservation and Recovery

Each archive row retains its own `task.json` snapshot and artifact file decisions. Preview checks every preimage. Execution preserves those bytes and modes. Same-plan replay continues to validate the original identity group and exact snapshots; third-state changes still fail before writes. Rollback remains owned by the caller's existing fixed preimages.

## Compatibility

There is no public schema, CLI option, or DTO change. Existing active-copy plans retain their behavior. The migration policy documentation must state that matching `history_only` archive copies may repeat across distinct registered workspaces while preserving active identity and binding restrictions.

## Risks

- Incorrectly admitting an active copy as history could hide an execution authority. The validator must rely on the already closed `disposition` and archive-path classification, and must keep active rows in the existing authority checks.
- Omitting workspace uniqueness or provenance checks could merge unrelated Task histories. Retain exact identity/generation/source checks and reject duplicates within one workspace.
- A current active Task without its required branch binding remains blocked. This feature does not repair that separate target-state issue.
