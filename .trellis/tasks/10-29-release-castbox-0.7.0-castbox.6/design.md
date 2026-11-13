# Design: paired local Castbox release preparation

## Source and version change

Acquire an isolated checkout at main@f83c646a8498b6aac8e4973de4d4d66a5e786bd3.
Change only the version fields in packages/core/package.json and
packages/cli/package.json to 0.7.0-castbox.6. Keep workspace:* in source. Do
not stamp the repository's installed .trellis/.version as a new installation.
A lockfile change is permitted only if the actual package tooling requires it;
record and review its exact reason instead of generating unrelated churn.

The release includes the reviewed main tree, not only PR #60's last commit.
Final public provenance must describe the actual versioned source selected
after its own commit, PR review and CI. Main's current CI proves the baseline;
it does not prove a future version commit or public package download.

## Package boundary

Use the existing Core/CLI build and pack paths. Expected asset names:

- mindfoldhq-trellis-core-0.7.0-castbox.6.tgz
- mindfoldhq-trellis-0.7.0-castbox.6.tgz
- SHA256SUMS
- release-record.json

The package names remain @mindfoldhq/trellis-core and @mindfoldhq/trellis.
Inspect the packed package.json, distribution files and shipped public Python
API. The final record owns repository, full source SHA, tag, exact version,
actual filenames/checksums and the CLI/Core dependency. Keep draft preparation
results outside the tracked package payload. Never reuse a prior version's
checksums or make a provisional source SHA look final.

## Installed verification

Install both local tarballs in one npm install --prefix <isolated-prefix>
--ignore-scripts invocation. Resolve the CLI's Core dependency from that
installed CLI and check exact version and local package location. Run the
actual installed binary; source-tree execution is not package installation proof.

Use a temporary Git project for fresh init and update --dry-run. Check current
installed version, actual emitted scripts, managed hashes and sidecars.
Separately use controlled retained-data fixtures for the #59 regression. These
represent schema-valid records from supported migration; they are not a
workflow-switch bypass or an instruction to edit real business state. Test
both manual and local_commit, original declared owner, persisted stop, other
slice preservation, selection release and retry through the installed API.

Reuse existing fixture/test logic where possible. Do not add tests that merely
assert the two version strings or mirror an implementation regex. Run the
existing release-preflight package checks. Exact-candidate cross-platform
source jobs and published-download verification remain later evidence levels.

## Preparation writes

Expected tracked writes are the two package metadata files plus the new
release Task's planning, context and validation documents. Temporary package
builds, consumer prefixes and notes are local artifacts. Do not change Guru
source locks, original backend Tasks, installed tools in business checkouts,
external docs-site/marketplace or CI workflows.

## Later publication boundary

After separately reviewed commit/push/PR/merge, build and verify the paired
artifacts from the final fixed versioned source. Present exact tag, full SHA,
asset names/checksums and release notes for publication confirmation. Publish
the fork's attachment-only prerelease, then download public assets afresh and
repeat checksum/pair-install verification. Inspect the npm publish workflow's
fork skip without requesting npm credentials or local npm publication.
