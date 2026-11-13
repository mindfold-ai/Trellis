# Final independent quality review

Scope: complete Issue47 residual change from base `0e3b23a3045357b76e69ca91e84b97b294dfb147`, baseline/planning/evidence checkpoints and current production diff. This is default quality verification. It records no formal lifecycle result and grants no Completion or closure.

## Findings (fixed by implementation owner)

- `common/git_objects.py` selected-path branch originally omitted `-t`. Selecting a directory and its descendant suppressed the directory row, so the public owner treated the directory as a deletion. Independent actual-repository reproduction with `packages` and `packages/cli/package.json` returned a digest. Implementation retained `-t`, removed recursive traversal, and filters decoded rows to exact requested paths. Independent reproduction now rejects with `invalid_git_fact`; helper returns the exact directory/file set. A regression covers the mixed input.
- The old-Git fallback initially matched English diagnostics without fixing locale. Implementation now sets `LC_ALL=C` only in the new public context. The inherited-locale regression checks this without including complete environment values in assertion output.

## Findings (not fixed / acceptance incomplete)

- Frozen residual performance acceptance is **FAIL**: the final prospective controlled paired cohort passes183/188 original absolute gates and21/24 strengthened paired checks. Remaining failures are128-path whole-wrapper timings. All10001-path, digest/object traffic and RSS checks pass. Faster owner components or apparent host variance do not satisfy the missing gates. Do not report whole Task complete, close Issue47 or claim downstream adoption/Completion.
- Full tests passed through the supervising owner's normal production commit hook; the checker independently read its log and matched the reviewed source fingerprints to the resulting commit. The checker did not run duplicate tests. Packaging, installation, publication and release remain separate supervising-session evidence; no publication or release is established by this report.

## Verification performed by checker

Commands ran sequentially. No build/dist-consuming operation ran concurrently.

| Check | Exit / result |
| --- | --- |
| `pnpm lint` |0 / PASS |
| `pnpm typecheck` |0 / PASS; includes core build followed by CLI tsc |
| `pnpm --filter @mindfoldhq/trellis lint:py` |0 / PASS;0 errors,48 warnings; neither changed Python module appears in diagnostics |
| `/usr/bin/python3` in-memory `compile` over `git ls-files -z -- '*.py'` |0 / PASS; Python3.9.6;103 tracked files; no bytecode or source writes |
| `pnpm build` |0 / PASS; core then CLI; template copy completed |
| `git diff --check` |0 / PASS |
| canonical/dogfood `delivery_store.py` and `git_objects.py` byte comparison |0 / PASS |
| actual public mixed-directory rejection and exact metadata selection |0 / PASS |
| full `pnpm test` via normal production commit hook |PASS; core28 files/480 passed/1 skipped; CLI106 files/2348 passed; total2828 passed/1 skipped. Checker verified existing hook log; no rerun |

Logs: `/tmp/issue47-final-lint.log`, `/tmp/issue47-final-typecheck.log`, `/tmp/issue47-final-lintpy.log`, `/tmp/issue47-final-build.log`.

The checker inspected the public owner, original filesystem serialization, exact commit/header validation before hashing, per-input cached-object checks,4096 control-inclusive batches, metadata-only control traffic, bounded blob streaming, old-Git narrow fallback, context/environment lifetime, literal selected paths and64KiB fixed-argument-inclusive budget. Default/scope tree calls and existing Task/local_commit128-request protocols remain unchanged. Mutable filesystem candidate checks remain independent. Tests exercise bare history, missing objects, SHA256 width, modes, deletion and invalid types. API1.0 shapes remain unchanged. Both package versions are0.7.0-castbox.4.

## Evidence integrity and limits

The checker read the current PRD/design/spec, public adoption contract, controlled-policy provenance/results and original-capability acceptance. Prospective paired cohorts retain the original188 caps and add paired improvements; changing process policy is explicitly qualified to that policy, applied to both before/after, and does not establish default-policy success. Failed cohorts remain failures. The final report preserves all failed checks without rounding or accepting the near miss. The checker verified all 32 compressed archive entries against both compressed and decompressed SHA256 values. This integrity check does not independently rerun every timing measurement. Original PR48 benchmark evidence reports44/44 PASS; that is distinct from residual performance acceptance.

The provider is a synthetic local protocol fixture with zero network calls. Isolated consumer adaptation is not downstream production adoption. Installation/release/merge evidence must remain separate.

## Normal production commit verification

Commit: `69033a662d68701610f09caa97f1d292bccd1076`. The normal hook executed root `pnpm test` and the log ends with a successful commit. Independent log verification found both complete Vitest summaries: core480 passed/1 skipped and CLI2348 passed. The existing skip remains a skip, not passing evidence. Log: `/tmp/trellis-47-residual-candidate-01a14785/production-commit.log`. The three fingerprints below match both committed bytes and the current working files. This adds full regression evidence; it does not change the residual performance FAIL.

## Reviewed source fingerprints

- `packages/cli/src/templates/trellis/scripts/common/delivery_store.py`: `038d98832a8359b697a5b3757589f9f1461b26d548fc04d29ad2b4e50d082171`
- `packages/cli/src/templates/trellis/scripts/common/git_objects.py`: `2ddaa8736bbca4ddcba07efc2443173f3df615c52d471001ba273b0f828847c8`
- `packages/cli/test/scripts/git-candidate-content.integration.test.ts`: `f5414338fc3ac7d562f1ee5df9a2807cfde1d14df32266bbcc327e0bc271cc3c`
