# Candidate validation

Baseline: `cc5f9a30652be29cffee9acc7e14d5dc5daaf04c`.
Candidate: current uncommitted Issue #29 checkout, 2026-10-08.

Independent Trellis check found no remaining semantic defect in code or current
contract wording. Reservation reads only validated identity; matching lifecycle
targets retain strict schema checks. Migration classification is unchanged.
Rename/archive retain strict selected-record validation before uniqueness checks.

| Check | Observed result |
| --- | --- |
| Targeted CLI/session/meta/archive/migration tests | 67 PASS |
| Regression | 449 PASS |
| Core | 411 PASS, 1 existing SKIP |
| Complete CLI suite | 1888 PASS, all 84 test files passed |
| Lint / TypeCheck / Build | PASS |
| Python type check | 0 errors; 48 warnings in unchanged modules |
| Python 3.9 syntax / Python twin parity / diff check | PASS |
| Built clean-project installation | PASS, reproduced independently |

The initial complete CLI run had one environment failure because the marketplace
submodule was uninitialized. After checking out the exact existing gitlink
`7d5298d16e07c328c09493eed1f0652571744b17`, independent check reran complete
`pnpm test`: Core 411 PASS/1 existing SKIP and CLI 1888 PASS. The formerly missing
TDD fixture test passed. Submodule HEAD is pinned, its worktree is clean and the
gitlink is unchanged. Final twin parity and diff check passed.

The installed probe is `research/validate-built-install.py`, run after build.
It initializes a clean project with the built CLI, creates beside an actual
registered sibling worktree's mixed header, verifies source/generation and
start/current identity, and checks exact/casefold rejection plus historical
bytes/modes, task/session and Git-ref preservation. Independent review corrected
the fixture to preserve caller HOME and assert current identity/path, then reran
it successfully.

Implementation log snapshots: `/tmp/trellis29-targeted-final.log` and
`/tmp/trellis29-regression-final.log`; full independent final run:
`/tmp/trellis29-check-full-final.log`. These logs do not replace live reruns after
candidate changes. No Guru #503 integration, Backend installation/recovery,
remote CI or release evidence is claimed.
