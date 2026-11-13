# Final local verification

Implementation commit: `2f0a634a` (full SHA in committed-source-verification.json). Frozen baseline checkpoint: `3f48ebd9`. The committed canonical files match every measured final-source SHA256; the paired packed/installed owner files match those source bytes.

- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm --filter @mindfoldhq/trellis lint:py`: pass, zero errors and 48 existing unused-import warnings in unchanged modules.
- Focused suites: all 539 pass across completed runs; one initial missing dist module during concurrent build cleanup passed stable-dist rerun. No source change was needed.
- Final normal implementation commit hook ran root `pnpm test`: Core 28 files, 480 passed / 1 skipped; CLI 105 files, 2337 passed. Total 2817 passed / 1 skipped. The skipped Core SQLite case is not reported as passing.
- Python minimum 3.9.6 executes affected tests; explicit minimum-grammar parsing also passed.
- `pnpm build`, paired `pnpm pack`, version alignment and `verify-packed-cli`: pass.
- Isolated paired local-tarball installation: all 1013 packaged files match installed bytes/modes; installed public normal delivery/retry, same-version reapply, drift preview, sidecar/custom bytes/mode preservation and managed helper inventory pass.
- All 44 frozen performance/RSS/process gates pass. See performance-report.md for complete times, object/metadata/body counters, resource scopes and limitations.

Source/runtime checks are distinct from remote CI, release publication and downstream adoption. At this local checkpoint remote CI/publication remain to be performed. A source-unchanged documentation evidence commit does not rerun the completed full suite.
