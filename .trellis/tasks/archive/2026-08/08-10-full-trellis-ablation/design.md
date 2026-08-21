# Design: Full reversible Trellis ablation

## Components

```text
commands/ablate.ts
  ablate/restore orchestration, rendering, confirmation, verification

utils/managed-removal.ts
  shared plan types, structured scrubber dispatch, plan construction,
  post-state verification, managed-directory cleanup

utils/ablation-store.ts
  canonical project identity, external state paths, strict v1 schema,
  backup/fingerprint/conflict/restore primitives, atomic transitions

commands/uninstall.ts
  retains uninstall-specific permanent-removal behavior and consumes the
  shared managed-removal planner
```

`cli/index.ts` registers peer `ablate` and `restore` commands. The existing
platform registry and `getConfiguredPlatforms()` are read, not changed.

## External state

Default root:

```text
~/.trellis/ablations/v1/<sha256-project-key>/
  state.json
  backup/
```

The key derives from the canonical real project root. State also records the
full root and rejects mismatch. Tests may redirect the state root through a
dedicated environment override. POSIX directories/files use `0700`/`0600`.

State statuses are `preparing`, `applied`, `restoring`, and `conflict`.
Entries record relative POSIX path, pre-fingerprint, expected ablated
fingerprint, and backup path. Fingerprints distinguish absent, regular file,
directory, and symlink and include content/tree hash, link target, and relevant
mode metadata. Unknown schema/state fails closed.

## Planning and ownership

1. Canonicalize cwd and apply the existing home-directory guard.
2. Require `.trellis/` and a valid non-empty v2 manifest.
3. Detect configured platforms and prune orphan keys before planning.
4. Validate every manifest key: relative POSIX, no absolute/empty/dot/dotdot/NUL
   segment, and resolved containment under project root.
5. Build one removal plan from the shared structured-file registry.
6. Treat a symlink leaf as an opaque link; never scrub through it. Refuse a
   path whose parent traversal escapes through a symlink.
7. Include `.trellis/` as a non-dereferenced directory backup so task/workspace
   symlinks remain links and external targets are not copied.

Malformed structured content that cannot be proven scrubbed causes ablation
preflight to fail; it must not remain active behind a success message.

## Ablate transaction

1. Reject an existing active transaction.
2. Build/render the plan. `--dry-run` stops without state creation.
3. Require `--yes` in non-TTY mode or confirm interactively.
4. Acquire the shared atomic per-project ablate/restore reservation and recheck
   for a transaction published while planning or confirming.
5. Stage exact backups/metadata in a temporary external directory and verify
   them.
6. Atomically publish `preparing` state before project mutation.
7. Atomically rewrite mixed files, unlink opaque entries, remove `.trellis`,
   and prune only empty managed directories.
8. Verify every expected ablated fingerprint.
9. On failure, retain the reservation and attempt exact rollback.
   Delete the transaction after the pre-state verifies; if recovery or
   verification fails, retain the transaction in its crash-recoverable
   `preparing`/`restoring` status for a later retry rather than discarding the
   endpoint-fingerprint relaxation.
10. Mark `applied`, release the reservation on every exit, and instruct the
    user to start a fresh agent session.

The command never stages, commits, or hides Git changes.

## Restore transaction

1. Locate and strictly parse state from canonical cwd.
2. No state is a friendly no-op. `--dry-run` reports without writing.
3. Acquire a per-project external lock, then re-fingerprint every affected path
   while holding that lock.
4. Any mismatch reports conflict and restores zero paths. Preserve
   `preparing`/`restoring` on crash-recovery records; otherwise record
   `conflict`.
5. Otherwise, while still holding the lock, mark `restoring`, recreate exact
   pre-state content/link/modes, restore `.trellis`, and verify all
   pre-fingerprints. Regular files are prepared with their final mode in a
   same-directory temporary file, rechecked immediately before replacement,
   and installed by atomic rename; failure removes the temporary file while
   retaining the retryable `restoring` state. Deleted files and symlinks use
   exclusive publication, while directories are fully prepared beside the
   destination and atomically renamed so no partial tree is exposed.
6. Release the lock on every success and failure path. Delete the transaction
   only after complete verification; retain it on any failure.

PR 1 performs no three-way merge; conflict refusal protects user edits.

## Uninstall preservation

Move only reusable plan/dispatch mechanics out of uninstall. Permanent
uninstall keeps its dirty-data guard, confirmation, rendering, best-effort
execution order, summaries, and all observable outcomes. Run the existing
uninstall suites immediately after extraction and again in the full gate.

## Compatibility and limitations

- Current v2 manifests are supported. Missing/legacy/invalid manifests fail
  closed with update guidance.
- No migration/template change is needed; the command ships in the CLI and
  external state is versioned independently.
- The current agent may already know Trellis; comparison starts in a fresh
  session.
- User-authored references to Trellis outside managed surfaces remain because
  they are not Trellis-owned.
- Global CLI/channel/history data remains installed and explicitly callable.
- Git status can reveal Trellis deletions, so comparisons are exploratory.

## Validation strategy

- Pure unit tests: state parser, paths, project key, fingerprints, permissions,
  symlink rules, atomic state, conflict classification, backup cleanup.
- Integration tests: init -> ablate -> restore on opaque/mixed platforms,
  modified managed content, user neighbors, dry-run/cancel/non-TTY/no-op,
  partial failure/rollback, conflict, exact Git cleanliness.
- Regression: complete existing uninstall suites and representative init/update
  tests.
- Local: disposable CastForge mechanical round trip plus one sequential
  same-prompt Codex control/treatment comparison with deterministic checks.
