# Issue 53: operation-scoped Python selection

## Goal and authority
Fix https://github.com/castbox/Trellis/issues/53 (live issue read 2026-10-19, no comments) against main 7bcbeaad31380e7a29c97898cb947c6120a61775. User explicitly authorizes current repository/Issue operations through production release, accepts preferred recommendations and requests no intermediate questions.

## Requirements and acceptance
- R1: Reuse existing Python >=3.9 selection for init, update, prospective tools rendering, workflow preview/application and tools postvalidation including recover/resume in separate CLI processes. Resolve before native preflight or managed writes.
- R2: Honor explicit TRELLIS_PYTHON_CMD, TRELLIS_SKIP_PYTHON_CHECK and existing restricted-probe behavior. Keep macOS/Linux python3 and supported fallback. Automatic detection failure must precede managed writes.
- R3: Distinguish shell command text from executable/argv: real py -3 native contract/context checks must execute py with -3. Same operation rendering/comparison/writes/hashes/validation use the same choice; preserve conflicts, user changes, .new/.bak and stale-plan semantics.
- R4: Native GitHub-hosted Windows regression controls only-python3 and only-py visibility with real Python/launcher; run built public CLI init/update/inspect-tools/prepare/preview/apply/workflow create-new and force/recover/resume as separate processes. No mock interpreter, simulated platform or cross-version update as evidence. Preserve raw exits/assertions and environment/tool identities.
- R5: Same driver against isolated baseline/candidate build and projects; expected baseline selection/argv assertion must fail, candidate must pass, infrastructure failure never counts as reproduction. Provide manual comparison/dispatch. PR/main CI includes native Windows; fail-fast false also retains targeted macOS/Linux results.
- R6: Add focused unit/projection coverage and public entry documentation. Separate source/rendering/native CLI evidence from actual Agent autoload (not claimed).
- R7: Full applicable checks, independent checker, paired package smoke, PR/main CI, immutable Castbox paired tarball release and published download verification precede Issue closure and Task archive.

## Boundaries
No Guru runtime/workflow logic, business task state, schema URI, LF/CRLF policy, new AI platforms, new persistent interpreter state, global install or business-repository changes. Guru #630 remains downstream integration owner. No crash/failure-matrix expansion. No unresolved product decisions.
