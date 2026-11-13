# Implementation Plan

- [x] Core resume intent/projection validation and finite carrier support; preserve formal reopen/migration.
- [x] Public CLI/SDK archived inspect/resume using bounded archive-to-active actions, provenance, sessions/bindings and existing engine.
- [x] Tests: retained history, schema2 rejection, missing/unsupported/mismatch/ambiguity, stale tree/carrier/candidate (including new rollback sessions and all-generation active identity conflicts), retry/lost output/partial writes and later-work-safe rollback.
- [x] Target-native identity/continuation plus next real public consumer, historical delivered facts and noDelivery supplement routing.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; maintain affected twins.
- [x] Pack/install matching CLI/Core in isolation; record source/build/API/native evidence separately from Guru integration.
- [x] Independent whole-scope Trellis check; update public maintenance spec and handoff.
- [ ] Commit/push PR, inspect CI/review, merge on success, verify Issue state and archive task through native workflow. No release/business writes.

## Recovery boundaries
Original recovery ref only; no regenerated identities, overwritten later work or expanded operation. Update planning on evidence-driven design changes. Tests use throwaways; main workspace stays preserved.

## Evidence
Actual verification is appended after execution. Guru #577 owns private joint acceptance.

## Author validation
- Source implementation completed; Core maintenance 9/9 and selected CLI maintenance suites 40/40 passed (resume 21, previous task maintenance 15, public bin 4).
- Build, lint and typecheck passed. No Python or native template changes were necessary: existing target-native identity resolution already excludes archive.
- Independent review/full validation is in progress. First default-concurrency full test passed Core 484 with 1 existing skip; CLI had 2366 passes and 3 environment-like failures (two 10s timeouts, one temporary-directory ENOTEMPTY). Full CLI rerun at reduced workers is pending; do not treat the first run as pass.
- First packed install/native consumer verification passed, but final author build changed tasks/shared bytes after packing. That first pair is not final candidate evidence; final repack plus byte equivalence and native rerun are required after checker freeze.

## Final local acceptance
Independent review, complete tests and final paired installation are complete;
see research/acceptance.md. Default-concurrency complete tests also passed in
the source commit hook. The final pair was rebuilt from the committed source and
all installed dist bytes match. Remote delivery follows with CI and merge facts.
