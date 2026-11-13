# Design: closed schema-1 predecessor compatibility

## Boundary and data flow

Core `/task/maintenance` remains the single positive classifier. CLI `inspectBindings` continues to enumerate common and checkout-local session stores, classify records, and include only `matches=true` carriers. Existing inspect/prepare/preview/apply/recover/rollback APIs and native execution readers retain their contracts.

The defect is the Core schema-1 shape predicate, not CLI enumeration order. Skipping failed classifications before matching would hide unsupported data. Instead, extend only the recognized predecessor shape and leave the CLI algorithm unchanged unless a regression demonstrates a required correction.

## Supported shapes

Retain the exact minimal schema-1 shape: integer `schema_version: 1`, `repository_common_dir`, `task_workspace_root`, `current_task`.

Additionally accept the original writer shape with those four fields plus required nonempty string `platform` and `last_seen_at`, and required `current_run: null`. Optional metadata is restricted to the original writer's nonempty string aliases: `session_id`, `sessionId`, `sessionID`, `conversation_id`, `conversationId`, `conversationID`, `transcript_path`, `transcriptPath`, `transcript`. Do not accept partial metadata shapes or arbitrary extra keys. Reuse the existing finite metadata list/validation where it keeps the two predecessor shapes explicit; avoid a second independent allowlist.

Keep the existing absolute workspace/common-dir validation and selected resolved Task/common-dir comparison. This Issue does not change path matching, generation semantics, Git-free schema-1 rules, timestamp parsing, active-run representations or current identity2/identity3 readers. The historical writer initializes the run slot to null; no additional run model is introduced.

## Regression design

Core owns format recognition and ownership comparisons. Use the actual writer-derived seven-field record, representative optional aliases, original minimal shape and bounded invalid metadata/unknown-field cases. Test a different Task, workspace and common directory without turning this compatibility fix into adversarial hardening.

CLI owns real Git orchestration proof. Extend the existing `maintenance-tasks.integration.test.ts` fixtures with selected and unselected metadata-bearing schema-1 sessions in shared storage, including an unselected session visited before the selected one. Preserve original formatting and POSIX modes via existing byte/mode snapshots. Exercise inspection, read-only preparation, selected conversion, historical closeout, same-operation recovery and exact rollback. Keep existing unversioned/current carrier regressions intact. Use exported maintenance namespace/bin for candidate smoke evidence in addition to internal function-level integration tests.

No copying of Python writer implementation into production TS is needed. Record the historical writer revision beside fixtures/research so future maintainers can trace the supported field set.

## Compatibility and rollback

No package-version bump or export/API signature change is required. Both packages are built from the same checkout (baseline labels are `0.7.0-castbox.3`); labels alone are not build identity. Source revision/diff and build identity accompany results. Plans prepared against different package fingerprints must be freshly prepared under the existing contract.

Rollback uses existing maintenance recovery preimages only. Tests run in disposable repositories, never against the real shared sessions. Code rollback is the scoped classifier/spec/test diff; do not remove real sessions or worktrees. Guru #575 adoption remains downstream-owned.

## Execution workspace gate

Planning files are currently in the original checkout. Before implementation, obtain approval for an isolated worktree at `/Users/wumengye/Documents/GoProjects/Trellis-worktrees/43-schema1-session-metadata`, branch `codex/43-schema1-session-metadata`, based on the reviewed `138961cbcac8367d15abe3d9d2f06101fa921cf6` (recheck freshness first). Transfer this exact planning Task with the supported workflow and verify the session's resulting workspace binding before activation. Do not start implementation in the stale original `main`, duplicate the Task identity, or alter other worktrees. If new baseline code changes the design, refresh planning before activation.

Implementation workspace approved and created on 2026-10-16 at the exact path/branch/base above. The Task directory was moved once (not copied); `task.py start` rebound the exact session to this workspace and set `in_progress`. No baseline drift was observed.
