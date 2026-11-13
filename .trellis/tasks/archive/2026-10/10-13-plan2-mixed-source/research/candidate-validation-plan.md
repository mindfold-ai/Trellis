# Offline candidate validation proposal (not executed)

Status: proposed next boundary only. Product implementation and normal quality
checks have their own approved scope. No candidate root, pack/install or
standalone rehearsal is created by this document.

## Exact destination and writes

Fresh root: `/tmp/plan2-mixed-source-candidate-9981ff40b934` (verified absent when this proposal was written).
Allowed owned children if approved: `packs/`, `installed/`, `npm-cache/`,
`fixtures/` (synthetic Git primary/registered siblings/common directories),
`plans/`, `backups/`, `logs/`, `harness/`, and source/package/install/result
manifests. Rehearsal writes only these synthetic descendants. Temporary package
cache lives within this root. Build may refresh the repository's ordinary
ignored CLI/Core dist outputs as part of quality/candidate build; tracked
product/spec preimages must remain equal to the reviewed four-file candidate.
Task research evidence/AC results are updated by the main owner.

The real sample and all old validation/candidate directories remain readonly.
No business install switch, npm publication, branch/worktree in this repository,
commit/push/PR/merge, Issue mutation, outbound task message or cleanup is included.
Synthetic fixture siblings are registrations only inside newly created synthetic
Git repositories under this root, not worktrees of the Trellis repository.

## Inputs and content identity

Base: `fdb88e8e220b42df0f0b78f8b939e072d36b9be1` plus reviewed four-file diff.
Before execution, freeze current source/diff and all four file hashes after
independent quality review; reject unexplained product drift. A commit is not
required: a complete dirty manifest/diff hash identifies this local candidate.
Package version stays `0.7.0-castbox.3` for this offline controlled artifact.

Build and pack a new CLI tar using pnpm's workspace dependency rewriting.
The new tar SHA must come from the actual file; it is presently unknown.
Read-only Core input:
`/tmp/plan2-worktree-copies-candidate-q9h3iZ/packs/mindfoldhq-trellis-core-0.7.0-castbox.3.tgz`,
SHA256 `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
Verify unchanged Core source/pin before reuse. If any Core/product scope change
is required, return to planning before expanding the pair.

Install both tar inputs using npm with ignored lifecycle scripts, no audit/fund,
and root-owned prefix/cache. Registry dependency reads/downloads may be needed
for ordinary third-party dependencies; there is no package publication or
business write. Verify packed manifest's exact Core pin and every CLI/Core
regular file's installed bytes/mode against its tar. Preserve source before/after
manifests and original package archives; fault injection never edits them.

## Ordered synthetic proof

1. Construct complete generated 28 schema1 / 3 known-legacy inventory and the
   reverse legacy-selection case, including all Task descendants, artifacts,
   installation/workflow/template/session inputs. No private raw data is copied.
2. Construct tracked inherited same-category groups with distinct-category
   distinct Task identities, registered synthetic branches and explicit bindings;
   include opposite unique execution copies and raw-preserved branch variants.
3. Record all source/plan/template/harness digests. Run exact installed
   `installed/node_modules/@mindfoldhq/trellis/bin/trellis.js migrate --from
   0.7.0-castbox.3 --plan <complete plan> --dry-run` from controlled roots.
   Full directory/symlink/file/mode manifests must remain unchanged.
4. Back up the exact clean preview's owned write set, including prior absence.
   Execute only that already-approved synthetic write set. Check peers/descendants
   remain raw, original history is lossless and only bound authorities convert.
5. Through an owned test-only Node fault shim, fail a real atomic replacement
   after at least one Task reaches schema2. Retain the actual failed output.
   Same unchanged frozen plan and unmodified public binary preview/resume must
   pass; completed replay must be unchanged. Test exact byte/mode third states
   with zero-write failures, then restore the synthetic injections.
6. Use verified `/usr/bin/python3` 3.9.6 on installed scripts in both checkouts
   with isolated explicit session keys. Verify exact Task/Delivery/workspace/
   generation, runtime declaration and continuation. Deferred direct selection
   must fail with unchanged manifests.
7. Restore only the approved backup paths, remove only new files/empty
   directories and verify full original primary/sibling/common-dir manifests.
   Keep all logs/failures/limits and map actual results to AC1–AC7.
8. Independent audit of the exact new pair, installed bytes/modes, plans,
   commands and complete candidate diff before upstream completion claims.

This is bounded upstream synthetic evidence. Real full-plan preview, isolated
business execution/recovery, #406 completion and #531 Check remain separately
owned and are not prerequisites. Approval for this proposal would authorize
only the destination, candidate operations and synthetic proof above.

## Reviewed local source snapshot

The implementation/check handoff is identified by these actual current bytes.
No product commit or new tar identity exists yet. A later source change requires
rechecking this snapshot before candidate build.

| Path | SHA256 |
| --- | --- |
| `packages/cli/src/commands/migration2-schema.ts` | `64b4be715920c020a7adb27fa03ee49e1c8bea5f04699b195b1b4f45a9728767` |
| `packages/cli/src/commands/migration2.ts` | `6302b38b813832b019df843b8645a6e0e4e97ad745a783d7a766094f3675a80b` |
| `packages/cli/test/commands/migrate2.integration.test.ts` | `29499492eae77ad93b3be114adfff94cd888d9bb1a27f1a606968561e4af24f0` |
| `.trellis/spec/cli/backend/commands-migrate.md` | `2271680d0455f66e9b096dbc2ad1ef8ed01dd479bcaf3f447072631adedfe13a` |
