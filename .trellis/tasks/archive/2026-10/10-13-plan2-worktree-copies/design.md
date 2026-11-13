# Design: binding-validated inherited copies

## Boundary and input

Extend Plan2 preflight rather than Core transitions or the binding producer. Keep one projected authority per TaskId/generation; deferred peers never enter it. Follow the public Python binding reader.

Add optional `branch_bindings`, default `[]`, to the closed schema:

```ts
{ task_id: string; lifecycle_generation: number; source: RawSnapshot }[]
```

Strict rows require portable TaskId and nonnegative safe-integer generation. Derive only `<git-common-dir>/trellis/task-branches/<task_id>/<generation>.json`; no caller path/action/target/workspace override. Reject Git-free bindings, duplicate rows, unknown identities and unrelated histories. Use existing canonical Base64/raw SHA/mode validation.

Decoded binding keys are exactly `schema_version`, `task_id`, `lifecycle_generation`, `binding_revision`, `branch_name`: version `1.0`, matching identity/generation, nonnegative safe-integer revision, nonempty branch. Match actual current branches across the complete eligible registered project-root inventory using existing cleaned Git environment/timeout. Exactly one checkout must match and contain the selected active projected Task. Detached HEAD cannot match. Never create, normalize or rewrite bindings.

Require reviewed binding evidence for each duplicate group and any projected active Task with an existing binding, including unique-ID selections. Missing native bindings retain unique-ID behavior; preserve extension-specific missing-binding rules. No unrelated binding history scan or private writer API. Reject duplicate canonical workspace roots and aliased canonical Task directories, preserving established storage-root alias rules elsewhere.

For Git repositories with a common directory, the existing public missing-binding predicate is `(invocation_root / '.trellis/guru-team/extension.json').is_file()` (`session_storage.py:166`). Because accepted shared selections must resolve when invoked from either eligible workspace, preflight applies this predicate to every planned eligible root: if any has the marker, projected active Tasks require existing reviewed bindings. Do not interpret marker contents or call private writers. Missing-binding native compatibility requires no marker in those roots. Freeze/recheck the predicate outcome for those roots before mutation; unsafe paths remain containment errors. Git-free resolution returns before checking the marker (`session_storage.py:156`): it remains compatible without binding even with a marker, and supplied binding rows still reject.

## Group admission

1. Validate each original source/disposition under existing declared legacy/schema-1/current rules; derive ID, generation, location and immutable source. Only known legacy missing generation defaults to zero.
2. Group by existing case-insensitive portable-ID reservation. The exception requires exact spelling/generation and semantic immutable-source agreement, including source disposition. Present versus absent source does not establish equivalent provenance. Mutable metadata/planning may differ.
3. Require one active `convert_active` or active `current` authority and only active legacy `defer` peers in distinct roots/directories. Reject all-defer, archive/history duplicates and historical visible-name occupation.
4. Resolve reviewed binding to the authority; retain unique projected map for workflows, AuthorityRefs, Delivery artifacts and sessions. Group order must not affect acceptance.

Every retry uses frozen original snapshots. Live migrated targets are allowed target states, not new sources. `current` preserves schema-2 source raw; conversions independently validate owner-reviewed targets and retain original history. A legacy-source plan cannot combine absent-source legacy peers with a schema-2 current record carrying source; immutable-source agreement intentionally rejects that case. Schema-1 peers and matching current authority are supported.

## Preservation and preflight

Prepare each binding as a fixed common-root preserve action with equal preview pre/post SHA/mode through existing containment/preimage checks. Unsafe nested binding symlinks reject. Deferred descendants are preserve-only, including null-source absence decisions; existing artifacts require real snapshots. No new peer migration/Delivery targets. Selected root planning stays preserved; only its reviewed Delivery-owned copies may be added.

Immediately before first mutation, revalidate registrations/common-dir/suffix, bound checkout, binding bytes/modes and relevant no-binding absence, alongside entire-set source-or-target recheck. Recompute per invocation/retry. Ordinary filesystem failures can leave partial writes; no locking/concurrency guarantee during writing is claimed.

Projected common sessions preserve identity/generation and select the sole active authority/eligible Delivery. Any existing reviewed binding must select the same workspace. Preserve-only old/local sessions remain raw and gain no eligibility inference. Prove installed current-task/runtime-contract/continuation behavior from both workspaces; direct legacy peer selection still rejects.

## Compatibility and recovery

No Plan2 version/Task schema/Delivery API bump. Existing unique-ID/no-binding plans continue; affected plans omitting live binding evidence fail closed to align runtime. Older closed-schema executors cannot consume the new field: pin the new candidate. Plan1 is unchanged. No Python/Core edits expected; return to planning if necessary.

Caller rollback restores preview-owned paths/modes and removes only additions before new business writes. Binding preservation needs no rollback write. No Git reset, ID rename, inventory shrink or registration pruning.

Optional evidence plus existing `defer` avoids a new ledger/disposition. Equality of business planning is not a lifecycle gate. Authority relocation and later conversion of additional copies need their own reviewed operation; historical business gates and dirty planning remain owner responsibilities.
