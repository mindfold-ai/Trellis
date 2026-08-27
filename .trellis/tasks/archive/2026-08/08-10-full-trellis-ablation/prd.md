# Implement full reversible Trellis ablation

## Goal

Add `trellis ablate` and `trellis restore` so a user can temporarily remove all
supported Trellis-owned activation surfaces from a project, start a fresh agent
session without Trellis, and later recover the exact pre-ablation project state.

Related proposal: [#530](https://github.com/mindfold-ai/Trellis/issues/530).

## Requirements

### Full-only command scope

- Bare `trellis ablate` performs complete supported project-level ablation.
- `trellis restore` restores the active ablation transaction.
- Both commands support `--dry-run` and `-y` / `--yes` consistent with existing
  destructive command UX.
- Named capability selection and release baselines are not shipped in this PR.
- The command does not launch agents, manage worktrees, dispatch prompts, score
  results, or downgrade Trellis.

### Owned activation surfaces

- Use the v2 template hash manifest, configured-platform registry, and orphan
  manifest pruning as the ownership boundary.
- Remove opaque managed files, scrub Trellis fields from mixed settings, and
  remove only Trellis-managed Markdown blocks.
- Remove `.trellis/` from the visible project tree while preserving it in the
  recovery transaction.
- Preserve user-owned neighboring files and non-Trellis mixed-file content.
- Refuse to claim complete ablation when a path, mixed surface, or symlink
  condition cannot be handled safely.

### Reversible external transaction

- Store recovery state outside the project under the user's Trellis data root,
  keyed by a collision-resistant identity derived from the canonical project
  root.
- Strictly version the schema and record transaction status, project identity,
  CLI version, stable capability ID `trellis.full`, configured platforms,
  pruned manifest, exact backups, hashes, path types, modes, and expected
  ablated state.
- Complete and verify the snapshot before project mutation. Persist transaction
  transitions atomically and use restrictive permissions where supported.
- Support one active transaction per project. Repeated ablate must not stack.
- Reserve the project atomically before snapshot creation and hold the shared
  ablate/restore reservation through staging, mutation/rollback, verification,
  and state transition so concurrent invocations cannot overlap.
- Limit the recovery payload to exact manifest-owned paths and the complete
  `.trellis/` tree required for restoration. Because user-authored
  task/spec/workspace files can themselves contain prompts, responses, or
  credentials, disclose that risk, protect the state root with restrictive
  permissions, and retain it only until verified restore. Do not separately
  collect host transcripts, browser/session state, global channel logs, or
  unrelated application files.

### Apply and restore safety

- Validate manifest keys and containment before `path.join`-driven mutation.
- Use lstat semantics, preserve leaf symlinks without dereferencing them, and
  refuse parent-symlink traversal outside the project.
- Rewrite mixed files atomically.
- Verify the complete post-ablation state; on failure attempt rollback and keep
  recoverable state if rollback is incomplete.
- Restore preflights every affected path before writing anything. Any edit or
  recreation while ablated causes a zero-write conflict refusal.
- Recheck each restore target immediately before replacement. Restore regular
  files through a same-directory prepared temporary file and atomic rename;
  injected failures must clean temporary files and remain retryable.
- Require affected managed paths to remain quiescent during restore: the
  project reservation serializes Trellis commands but cannot lock arbitrary
  external editors. Use exclusive publication for absent file/symlink targets,
  prepared-directory rename, and final verification to avoid partial state and
  detect boundary violations.
- With no conflicts, restore exact bytes/link identity/relevant modes and
  verify all pre-state fingerprints before deleting the external backup.
- Missing install prints `Trellis is not installed in this project.` and exits
  successfully without project or recovery writes. Missing recovery state and
  repeated restore print `No Trellis ablation transaction exists for this
  project.` and likewise exit successfully without writes.

### Behavioral boundary

- Tell users to start a fresh agent session because the current session may
  already contain Trellis context.
- Do not disable host security/permission rules or non-Trellis project
  instructions.
- Do not remove the global CLI, channel store, or host transcripts.
- Do not touch the Git index or hide managed-file deletions. Document that this
  is a diagnostic subtraction mechanism, not a blinded benchmark runner.

### Shared ownership and compatibility

- Extract/reuse one managed-removal planner and structured-file registry for
  uninstall and ablate; do not duplicate the table.
- Preserve uninstall's existing public behavior and full regression suite.
- Consume `getConfiguredPlatforms()` unchanged.
- Follow filesystem safety, atomic state, unit/integration testing, bilingual
  docs, and GitNexus impact/detect-changes contracts.

### Local validation

- Mechanically validate ablate/restore against disposable worktrees of the
  public CastForge project without touching its canonical checkout.
- Prove dry-run immutability, complete owned-surface removal, unchanged
  application files, exact restore, clean Git state, and conflict refusal.
- Run one sequential same-prompt fresh-session Codex comparison with identical
  model/effort/tools/permissions/source/budget and deterministic offline checks.
- Do not merge either result; report it as a one-task exploratory comparison.

## Acceptance Criteria

- [x] `trellis ablate` removes every supported manifest-owned Trellis surface
  and leaves all non-Trellis content intact.
- [x] A complete verified external transaction exists before the first project
  mutation and recovers a simulated interrupted apply.
- [x] `trellis restore` reproduces the exact pre-state and deletes its backup
  only after verification.
- [x] Intervening changes yield a complete preflight conflict with no partial
  restoration.
- [x] Preview, cancel, non-TTY, no-install/no-state, already-ablated, malformed
  state/surface, symlink escape, repeated command, and apply-failure paths are
  tested and safe.
- [x] Existing uninstall behavior and tests are unchanged after shared planner
  extraction.
- [x] CLI help, backend spec, and relevant English/Chinese docs distinguish
  ablate/restore from uninstall, hook disable, and `no-trellis`.
- [x] Lint, typecheck, focused tests, full CLI tests, build, diff checks,
  GitNexus change detection, and secret/path review pass.
- [x] Disposable CastForge validation proves round-trip integrity and reports
  the sequential on/off comparison with limitations.

## Out of Scope

- Selective hooks/specs/workflow/subagent/check/memory/channel ablation.
- Capability dependency closure or `--baseline <version>` provenance.
- Old CLI/schema execution.
- Product-managed comparison worktrees or benchmark orchestration.
- Disabling host-native safety controls or publishing private run data.
