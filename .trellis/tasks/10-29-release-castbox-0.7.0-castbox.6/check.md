# Independent quality Check: local Castbox .6 preparation

## Scope and conclusion

Reviewed the complete local release-preparation candidate at baseline
`f83c646a8498b6aac8e4973de4d4d66a5e786bd3`: the two package version fields,
Task requirements/design/plan/evidence, actual provisional tarballs, installed
package paths and external smoke drivers/results. No actionable finding remains.
This is a pass for local preparation, not final-source CI or release publication.

## Requirement coverage

| Requirement | Evidence and disposition |
| --- | --- |
| R1 | Both source and actual tar metadata are .6. Source CLI dependency stays workspace:*; packed and installed dependency is exact .6. |
| R2 | Actual tar hashes/sizes match validation.md and candidate-SHA256SUMS. Core built/packed operations bytes match; canonical/built/packed/dogfood/emitted Python bytes match. The CLI bin retains mode 0755. |
| R3 | Independently reran the installed Core smoke driver. Resolution from the installed CLI reaches the isolated consumer's Core public entry; both actual installed versions are .6. Installed binary reports .6. |
| R4 | Installed Core smoke passes for both retained profiles, peer preservation and retry; unsupported creation still rejects. Reviewed the Python driver and its 26 public calls: 24 succeed and two required-evidence refusals occur as intended. Persisted state, selection release, peer preservation and retry assertions match the report. |
| R5 | Fresh installed Codex init has successful command evidence. Independently reran installed update --dry-run with a before/after snapshot: all 119 project files outside .git retain bytes and modes. Manifest schema is 2 with 99 entries; emitted stop script matches its managed SHA256. No .new/.bak sidecars appear. |
| R6 | Notes/checksums identify provisional local bytes. local-candidate.json labels the uncommitted candidate and keeps final_source_sha null. release-record.template.json leaves final source, timestamp, checks and artifact values unset. Cumulative notes match the relevant changes since .5. |
| R7 | Product diff contains only the two version fields. No runtime, schema, workflow, lockfile, migration policy, CI, existing asset or Guru/business installation changes are present. |

## Checks and corrected wording

Consumed the implementation owner's build, generic version/packed-dependency,
Core 59-test and CLI 30-test results, plus the main session's successful root
lint/typecheck. No code changed after those checks. Independently checked
actual package contents/bytes, installed resolution/behavior, managed hashes,
dry-run no-write behavior, diff cleanliness and Task manifest validation.

One evidence sentence was corrected by the main owner during Check: the CLI
tar includes the empty `dist/templates/trellis/tasks/.gitkeep` installer scaffold.
It contains no active Task records or Task evidence. This was an overbroad
description, not package contamination or a runtime defect. No product self-fix
was needed.

## Remaining boundaries

The baseline still declares .5. The .6 tarballs were prepared with uncommitted
metadata, so baseline f83c646a is not their final versioned source provenance.
After the later reviewed fixed source exists, rebuild and verify artifacts
and create their actual final release record. Candidate-version CI, tag/Release
operations, fresh public-download checksum/pair installation and fork npm-job
skip verification remain later operations.

Actual local platform coverage is macOS/Codex/Python 3.9.6. A new Linux/Windows
or full installer/update/platform matrix was not performed. Guru source-lock
adoption, business checkout upgrade, original Task retirement, AWS/media/capacity
evidence and Backend whole-Task completion remain separate boundaries.
