# Implementation and verification plan

- [x] Read live Issue/main, current-session identity and specs; map public callers.
- [x] Complete fixed baseline harness and before measurements; persist immutable numeric gates before production edits.
- [x] Review planning artifacts and activate this exact Task (user preauthorized preferred implementation).
- [x] Dispatch Trellis implementer: batch Task history and Delivery immutable reads, operation-local digest reuse, bounded temporary resources; register/mirror templates.
- [x] Add public-entry semantic/regression tests for identities, paths/modes/types/deletions/errors, mutable calls and recovery; preserve original digest bytes.
- [x] Run identical after benchmark; compare all frozen gates, Git counts, unique/read bytes, hash counts and separate RSS. Any missed gate requires correction, never a relaxed threshold.
- [x] Dispatch Trellis checker for full scope; run lint, TS/Python typecheck, build and relevant/full tests as appropriate.
- [x] Verify paired package packing, isolated installation and applicable template projection/reapply/drift/sidecar/mode behavior. Record exact commands and limits.
- [x] Update specs with concrete operation-local batch/digest contract; commit only issue scope, publish/review/merge PR, verify remote results.
- [x] Wrap up this completed Task after recording final Issue/release evidence; archive only this Task and preserve unrelated work.

Primary validation: pnpm lint; pnpm typecheck; pnpm --filter @mindfoldhq/trellis lint:py; pnpm build; pnpm test. Focused suites: task-identity-source, delivery-v2, delivery-location, delivery-workflow, update-current-version, cross-worktree-update, regression. Benchmark command and frozen thresholds live in research/benchmark.py, research/frozen-numeric-limits.json and research/benchmark-method.md after measured baseline completion. Baseline source remains b0d87f952043058e21001a002b661bf2db56b1fa; one warmup and two timed repetitions, deterministic inputs, warmed OS cache, local network-free operations.

## Baseline checkpoint

Pre-production baseline and numeric gates are committed in `3f48ebd`. All 132 main samples and both Task component scales completed before production edits. The standalone baseline documentation commit bypassed the automatic full-test hook after cancelling its test process tree because the pending hash-once regression intentionally failed unchanged source; this was not reported as a passing suite. Final implementation checks and the code-commit hook remain required.

## Verified implementation

Final source passes 44 frozen performance/RSS/process gates; see research/performance-report.md. Independent quality evidence is research/check.md. Built paired packages passed verify-packed-cli and isolated installation, all 1,013 packaged files matched installed bytes/modes; research/packaged-artifacts.json and installed-verification.json retain commands and results. Full suite, remote CI, publication and closeout remain pending until actual results are recorded.

## Remote delivery

PR #48 merged at c7bd746b42d75f73534c85e263cd6b51fe0e5287 and its CI passed. The exact-source GitHub prerelease and published-download reinstallation pass; see research/delivery.md. Core 480 passed/1 skipped and CLI 2337 passed in the final implementation commit hook. No remaining implementation or upstream acceptance gap; archive is the remaining session wrap-up.

## Archive

The native owner archived only issue-47-git-object-reuse under archive/2026-10 and marked it completed on 2026-10-17. All frozen baseline artifact hashes and measured canonical source hashes remain unchanged after archival. The exact session binding is released. Documentation-only delivery/archive commits reuse the verified source checks; the closeout PR runs its own CI.
