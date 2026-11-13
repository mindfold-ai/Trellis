# Design

## Boundary and ownership
The smallest gap is repeated immutable object reads and same-rule digests inside cmd_create and apply_to_store, not missing lifecycle policy. Change common/task_store.py and common/delivery_store.py at their original owner steps. A narrowly scoped common Git-object batch utility is justified by these two independent owners; register it in templates/trellis/index.ts and mirror all Python changes into .trellis/scripts. Tests and specs document preserved contracts.

## Immutable observations
Use recursive NUL-delimited ls-tree snapshots keyed by the actual repository and exact head/commit object identity. Deduplicate blob OIDs across historical heads without eliminating each head/path occupation check. Keep historical permissive JSON identity-only semantics separate from strict live-record validation. Delivery uses one immutable tree lookup and unique blob batch reads, retaining literal paths, mode and missing entries. Reject unsupported commit entry types as before.

Read cat-file batches using regular temporary request/output files, fixed bounded request count, and bounded chunk parsing; do not connect two potentially blocking pipes. Consume one body/chunk at a time, retain only object metadata/parsed identity or SHA256, release resources at operation end. Do not use a tree OID as a replacement for candidate content_ref.

## Digest reuse and mutable boundaries
Every mutable candidate observation rechecks containment, reserved paths, type, existence, mode and bytes. Within normal local-commit apply, establish raw Git blob identity while hashing candidate bytes and reuse the resulting content SHA256 only when the immutable commit blob identity matches. Cache aggregate digest only for exactly identical ordered path/mode/content-digest entries; compare each input expected digest independently. No filesystem/ref/index pass result is cached. Standalone candidate/verify calls get fresh operation-local state; historical success verifies immutable actual outcome without treating current worktree as authoritative.

Fixed exact-commit type/full-OID, current HEAD/base, authorities, operation/generation/owner/phase and preimage checks stay in place. Actual GitHub PR checks remain independent and are not performance targets. Existing public functions retain compatibility; internal context does not create a caller-provided trust shortcut.

## Validation and rollout
Freeze measured before results and numeric gates before production implementation. Functional tests compare original digest bytes and typed exits through public operations; include lost-output retry preserving task bytes and a single fact. Build/package via official CLI flow, install paired local tarballs in an isolated prefix and run representative init/reapply/drift checks. Source commit plus packaged exact dependency provenance supplies installable delivery; no global install changes.

Rollback is a focused revert of this commit and its managed projection; no persisted schema or migration changes. Downstream guru-trellis#589 retains its matching-install/integration/Completion responsibility. Full cross-platform release proof is explicitly separate.

## Review correction: object availability

Normal local_commit digest reuse retains a batch128 Git metadata readability/type check for each seeded unique blob. A real offline blob:none partial clone with independently reconstructed worktree bytes must still fail with invalid_git_fact and preserve Task bytes when Git cannot resolve the referenced blob. The initial provisional after candidate skipped this check; its measurements are not final evidence. The corrected source reruns the unchanged frozen after benchmark and limits. Standalone candidates/gates retain direct streaming SHA256 without raw-object/spool work.
