# Execution plan: Castbox 0.7.0-castbox.6 local preparation

Status: local implementation and installation checks completed. Independent
whole-scope Check passed with no remaining finding; see check.md. No release-preparation commit, tag or Release exists.

## Resource acquisition and reviewed-plan activation

- Source: /Users/wumengye/Documents/GoProjects/Trellis.
- Base: main@f83c646a8498b6aac8e4973de4d4d66a5e786bd3.
- Branch: codex/release-castbox-0.7.0-castbox.6.
- Checkout: /Users/wumengye/Documents/GoProjects/Trellis-worktrees/release-castbox-0.7.0-castbox.6.
- TaskId: release-castbox-0.7.0-castbox.6, source no_issue.
- Task directory: .trellis/tasks/10-29-release-castbox-0.7.0-castbox.6/.

The checkout and Task exist at the identities above. The curated manifests
passed validation. The Task is branch-bound and in_progress under the native
undeclared legacy workflow. Original #59 resources retain their prior state.

## Ordered local implementation

1. Reread live main, version slot, source workflow and relevant release/package
   specs. Stop for an actual changed source or occupied version selection.
2. Activate the reviewed plan and dispatch trellis-implement with the exact
   Task. Assign version metadata/pack verification only; main owns evidence.
3. Set the two exact package versions, build the pair and run generic version
   and packed-dependency checks. Do not invoke an npm publication path.
4. Pack both tarballs to an isolated output directory; inspect actual package
   contents and verify canonical/built/packed implementations.
5. Install the pair in an isolated consumer, resolve Core from the installed
   CLI and run actual CLI/public Python entry checks, including #59's fixture.
6. Exercise fresh init and same-version update --dry-run; record native
   version, generated assets/hashes, sidecars and tested-platform boundary.
7. Write concise actual validation evidence and prepare release notes/record
   structure. Keep final SHA and public-download claims pending their real source.
8. Dispatch trellis-check over the whole candidate. Prepare the exact work
   commit/publication plan only after this Check passes.

## Existing checks

Use the pinned pnpm 10.32.1 toolchain:

```bash
pnpm build
node packages/cli/scripts/release-preflight.js check-versions
node packages/cli/scripts/release-preflight.js verify-packed-cli
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis-core exec vitest run test/task/v2.test.ts
pnpm --filter @mindfoldhq/trellis exec vitest run test/scripts/delivery-v2.integration.test.ts
```

Inspect existing release-preflight tests before selecting any additional
package/version regression tests. The ordinary full commit hook remains in
effect at the later commit boundary; VITEST_MAX_WORKERS=2 is a local runner
setting if needed, without changing tests or their timeouts.

Record exact pack/install/init/update/stop commands and observed outputs during
execution. Do not invent an installation success before running it. Local
artifact proof is distinct from candidate-version CI, release upload and fresh
published-download verification.

## Actual progress

- Steps 1-6 completed. Only the two package version fields changed in product
  source; the workspace dependency and lockfile remain unchanged.
- Step 7 completed locally: validation.md records package/install results.
  Release notes, provisional checksums and a non-final record template are
  outside the tracked package payload at the paths in validation.md.
- Step 8 completed: independent whole-scope Check passed; see check.md.
  Final source provenance, candidate CI, release publication and published-download
  checks remain later work.

## Spec-sync assessment

The existing Castbox Fixed-Version Delivery contract already defines paired
attachments, exact dependencies, isolated installation, immutable source
provenance and fresh published-download verification. This Task applies that
contract with a version-only product change. It introduces no new API, runtime,
schema or release convention, so no durable spec update is needed.
