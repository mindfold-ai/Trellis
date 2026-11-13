# Prepare Castbox 0.7.0-castbox.6 paired artifacts

## Goal

Prepare a version-locked Core/CLI release candidate containing the merged
unsupported-profile stop repair. Provide reviewable local artifacts and
installation evidence before any tag or GitHub Release operation.

## Authority and confirmed baseline

- Repository: castbox/Trellis.
- Source baseline: main@f83c646a8498b6aac8e4973de4d4d66a5e786bd3.
- Source main CI: Run 40874753131, all five jobs passed.
- Last published fixed version: 0.7.0-castbox.5, GitHub Release
  castbox-v0.7.0-castbox.5. Existing public assets must remain unchanged.
- Proposed next version: 0.7.0-castbox.6. No matching published/draft release
  or remote tag was found during preparation; recheck before publication.
- Release authority: .trellis/spec/cli/backend/release-process.md,
  Castbox Fixed-Version Delivery. Use GitHub Release attachments, not npm.

## Requirements

| ID | Required outcome |
| --- | --- |
| R1 | Core and CLI declare exactly 0.7.0-castbox.6. Source CLI keeps workspace:*; its packed dependency pins Core to that exact version. |
| R2 | Build and pack both packages using the pinned pnpm toolchain. Include the shipped Python stop repair and matching Core runtime in the actual tarballs. |
| R3 | Install both local tarballs together in an isolated consumer prefix and verify CLI/Core resolution, versions and real public entry behavior. |
| R4 | Exercise the retained unsupported-profile stop regression through the installed public API with controlled, schema-valid retained-data fixtures. Preserve other slices, historical facts, required payload checks, selection release and exact-result retry. |
| R5 | Run fresh installed init and same-version update --dry-run; inspect generated assets and template hashes. Report actual platforms and any sidecars. |
| R6 | Prepare release notes, checksums and the release-record structure. Final release-record source SHA and asset hashes must come from the later reviewed immutable release candidate, not a prospective or uncommitted source. |
| R7 | Existing code, schema, workflows, migration policy, CI/CD, package names and published assets retain their current behavior. No business Task or Guru installation is changed in this preparation. |

## Acceptance criteria

- Both package versions and the exact packed CLI/Core dependency are verified.
- Canonical source, built distributions and packaged stop implementations match.
- A paired local consumer resolves the selected local Core and executes the CLI.
- Both old profiles can be stopped in the installed retained-data fixture; the
  stop result does not create delivery, Completion or Closure success.
- Fresh init and same-version update --dry-run have actual observed results.
- Relevant source/pack/install checks pass; missing environments are reported
  as unavailable, not passed. Candidate-version CI follows commit/publication.
- Artifact filenames and local install commands are concrete. Draft records do
  not claim a final release SHA, public download or target adoption result.

## Scope boundaries

This Task prepares local version/artifact candidates. Git commit/push/PR,
merge, tag, GitHub Release, published download verification and cleanup are
separate later operations. Do not call release.js, publish-plan, npm publish
or spoof upstream publication context.

Guru adoption requires a separately reviewed complete Guru/Fork source-locked
combination. The current Guru lock selects 79a97ed6 / 0.7.0-castbox.5 and does
not include the repair. Preparation does not change that lock or claim that a
business checkout is upgraded. Original Task retirement, actual AWS, media
builds and capacity remain with the Backend owner.

## Planning convergence

The release track, proposed version, artifact pair and local-only preparation
scope are explicit. There are no unresolved product choices. The version slot
must be reread before any later publication.
