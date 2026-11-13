# Local candidate validation

## Candidate identity

- Baseline: f83c646a8498b6aac8e4973de4d4d66a5e786bd3.
- Branch: codex/release-castbox-0.7.0-castbox.6.
- Product diff: only Core and CLI package.json version fields changed to
  0.7.0-castbox.6. Source dependency remains workspace:*; lockfile is unchanged.
- These tarballs contain uncommitted version metadata. The baseline commit
  declares version .5, so it is not their final version-.6 source provenance.
  Rebuild and verify from the later reviewed fixed source before publication.

## Build and source checks

| Check | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Passed; lockfile unchanged |
| pnpm build | Passed for Core and CLI |
| node packages/cli/scripts/release-preflight.js check-versions | Passed |
| node packages/cli/scripts/release-preflight.js verify-packed-cli | Passed |
| pnpm lint | Passed |
| pnpm typecheck | Passed |
| Core vitest run test/task/v2.test.ts | 59 passed |
| CLI vitest run test/scripts/delivery-v2.integration.test.ts | 30 passed |
| git diff --check | Passed |

The pinned toolchain is pnpm 10.32.1. Both package directories used
`pnpm pack --pack-destination /tmp/trellis-castbox6-local-5Zz5Td`.
Packed metadata has matching .6 versions and an exact .6 CLI/Core dependency.
Core built/packed operations.js bytes match and contain the stop exception.
Python canonical, built, packed and dogfood delivery_operations.py bytes match:
9393dad5102a115a3e00037d35b2ff26abb9f13938685224e84c3d18c0a32558.
The CLI bin mode is 0755. Neither tarball contains active Task records or
Task evidence. The CLI includes an empty installer scaffold at
package/dist/templates/trellis/tasks/.gitkeep.

## Provisional artifacts

Directory: /tmp/trellis-castbox6-local-5Zz5Td.

| Filename | Bytes | SHA256 |
| --- | ---: | --- |
| mindfoldhq-trellis-core-0.7.0-castbox.6.tgz | 231628 | 966c442de5ea037e5e0dd936ffc5d88037c1be931f671c473823a55072f779f7 |
| mindfoldhq-trellis-0.7.0-castbox.6.tgz | 871658 | 03861f819257fb95155252a97f23ed08a6b242b20e50a55292254514bdb783a5 |

These hashes identify the local candidates only. They do not identify assets
from a published Release.

## Actual isolated installation

Local evidence root:
/var/folders/0b/2nwc70fx509_v4spgzcmsjkh0000gn/T/trellis-castbox6-planning-mvzci5nv.
In the commands below, PLAN_DIR denotes that exact directory.

```bash
npm install --prefix "$PLAN_DIR/consumer" --ignore-scripts --no-audit --no-fund \
  --registry=https://registry.npmjs.org \
  /tmp/trellis-castbox6-local-5Zz5Td/mindfoldhq-trellis-core-0.7.0-castbox.6.tgz \
  /tmp/trellis-castbox6-local-5Zz5Td/mindfoldhq-trellis-0.7.0-castbox.6.tgz
node "$PLAN_DIR/consumer/core-smoke.mjs"
/usr/bin/python3 -B "$PLAN_DIR/installed-python-smoke.py"
```

The paired npm install succeeded. Core resolved from the installed CLI into
that same isolated prefix. Both installed package versions are .6; the CLI's
Core dependency is exact. The Core driver imports the installed public
@mindfoldhq/trellis-core/task/v2 entry, with no source-tree fallback.

Both manual and local_commit retained fixtures stop under a PR-only workflow.
The installed Python driver uses the actual scripts emitted by installed init,
copied unchanged into a separate controlled fixture. Python 3.9.6 completed
26 public entry calls. Checks cover persisted stop, other slice and peer-session
selection preservation, affected-selection release, empty-evidence refusal
without writes and identical retry without byte changes. Completion/Closure
remain empty. Unsupported-profile creation still fails in the installed Core.
These fixtures model retained migrated data, not a supported workflow switch.

Evidence: smoke-evidence/installed-core-summary.json,
smoke-evidence/installed-python-summary.json and installed-python-log.json.
The external drivers retain exact call inputs and assertions for independent Check.

## Fresh installed CLI

From PLAN_DIR/fresh-project, used the installed binary at
PLAN_DIR/consumer/node_modules/@mindfoldhq/trellis/bin/trellis.js:

```bash
node <installed-bin> --version
node <installed-bin> init --yes --codex
node <installed-bin> update --dry-run
```

All three commands exited 0. The CLI and emitted .trellis/.version report .6.
The managed hash manifest uses schema __version 2 and has 99 hash entries.
The generated delivery_operations.py matches its manifest and packaged bytes.
Update reported unchanged files, preserved user data and no dry-run writes.
No .new/.bak sidecars appeared. Logs and exact commands are in
smoke-evidence/init-update-summary.json, version.log, fresh-init.log and
same-version-update-dry-run.log.

## Release material and remaining boundaries

External local files under PLAN_DIR:

- release-notes.draft.md: cumulative notes since .5.
- candidate-SHA256SUMS and local-candidate.json: provisional candidate bytes.
- release-record.template.json: record structure only; final source SHA,
  timestamp, checks and artifact values are unset. It is not a release record.

Baseline main CI run 40874753131 passed all five jobs. This proves the baseline,
not the uncommitted .6 version candidate. No new commit, tag, Release upload,
public-download verification or downstream Guru/business installation exists.
macOS/Codex/Python 3.9.6 is the actual local installation coverage; this Task
has not run a new Windows/Linux or full platform installer matrix.
The existing release/package specs already cover this version-only change;
no durable spec update is needed. Independent whole-scope Check passed with
no remaining finding; see check.md. The checker reran the installed Core smoke
and confirmed update --dry-run preserved the bytes and modes of all 119
project files outside .git.
