# Independent PR38 CI fix quality review

Date: 2026-10-13. Profile: quality; no formal Delivery or lifecycle authority.
Reviewed base/HEAD: `98075f3af510c250508fc5ca62df172610048083`.
Scope: the new fixture correction relative to that commit, within accepted
Task `plan2-mixed-source` (generation 0, no_issue). The reviewer changed only
this report; implementation, tests and the implementer report were read-only.

## Findings (fixed)

None in this review. The implementer had already added the correction.

## Findings (not fixed)

No unresolved code, assertion, scope or evidence finding in the reviewed fix.
It is ready for the main owner's exact commit/publication approval process,
subject to a fresh remote CI run after publication. This is a local quality
conclusion, not merge readiness, Task Completion or a formal Check result.

## Complete change inspection

The entire code diff adds six lines only to the failing test's setup:
`packages/cli/test/commands/migrate2.integration.test.ts:1692`. The two lines
of comment explain detached maintenance; the four argument lines add command-local
`-c maintenance.auto=false -c gc.auto=0` to both root/other fixture commits.
No product/schema/Core/template/workflow/spec/package file changes in the
new diff. No test count, timeout, skip rule or assertion changes.

Both fixtures still use real `git init` and empty commits. The subsequent
`GIT_DIR`, `GIT_WORK_TREE`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and
`GIT_CONFIG_VALUE_0` redirects remain active during actual migration. The
unrelated repository is still recursively checked by the unchanged snapshot
helper for every regular file's raw digest and permission mode, including
`.git`; no maintenance path is filtered. The migrated Task must still become
schema2. Environment restoration and synthetic-repository cleanup remain in
`finally`. The helper is not changed for any other test.

The configuration is supplied only to fixture commit subprocesses, before the
redirect variables are installed. It does not persist Git configuration or
propagate through the Node process into the migration. The production
`gitBytes` path continues to strip ambient `GIT_*` variables when discovering
the live topology. Disabling autonomous setup maintenance therefore removes an
unrelated asynchronous fixture writer without weakening the intended isolation
guard or mocking production discovery. `gc.auto=0` also covers the automatic GC
fallback in Git versions predating the maintenance configuration.

The snapshot helper does not include directory/symlink entries; this unchanged
case proves regular-file bytes/modes, not the stronger packed-proof full-tree
contract. The existing independent packed proof supplies that separate contract.
This test-only delta leaves the previously accepted product/tar bytes unchanged;
it maps earlier acceptance evidence by that identity, rather than claiming a
new packed rehearsal or a complete requirements recertification here.

## Failure mechanism and limits

Retained PR38 CI run `38407261720` is failed: Core 475 pass/1 existing
placeholder skip; CLI 2284 pass/1 fail. Its sole reported snapshot delta is
the disappearance of the empty `.git/objects/maintenance.lock` at the unrelated
fixture. The failure occurs at the snapshot assertion (old line 1716), not at
Task conversion.

The read-only Trace2 evidence shows the original fixture commit spawning
`git maintenance run --auto --no-quiet --detach`, with a final child event
after the parent exit. The configured commit starts no maintenance child.
The host probe's two lock observations were both false: it did not reproduce
the transient Ubuntu lock. Consequently the mechanism is supported by CI's
actual lock delta plus the probe's child-process evidence, not a claimed local
race reproduction. Host Node v26.9.0/Git 2.54.0 are not an Ubuntu/Node20 rerun.

## Exact reviewed identities

| Artifact | SHA-256 |
| --- | --- |
| Final test file | `80b1fe237dadf2cf791cf0f3416be2c9e65d04a36a099459d8faa6044d3ba7e6` |
| One-file binary diff against base | `d9f00fcb843b4dbc9bc7eeaf2bc55566b8815a021283384a3e6d74de9abc7edb` |
| Implementer report `pr38-ci-fix.md` | `cfa6c07ac8697c4eef6c79ddadc1c0f2c0e048751ea3f8da24d18284b7cdc27b` |
| Failed CI log | `1cee9049c15ebc1a99cf15d9d348f03cf1a160c65c08bdfaf402f9ec5b681fa0` |
| Maintenance probe log | `75615687c26ae7a44d17636ef78863dba9dbaeff7266414fbe23eeea04aa9f59` |
| Targeted-test log | `83dd1bff9bb182263867addc8482d74698ec5192913db684dfcac1367354d2fa` |
| Root lint log | `a18bf655d8ecc39a1c596e142a35df41724442f01fcf4ef7929b3de8e8b8fce9` |
| Root typecheck log | `98337fa79f57c96078a2ebf7570664680c8cf661013af2c2418deec420ebf9a8` |
| Failed scheduling-attempt log | `409abfcf206dd00bdd8f600a4c3b7bcf2caec17b0f7ff8dccc0d81cf2da4a5bb` |
| Final affected-file log | `99d13598574adb75872ff815ea392a971a027b6d4b1eefff8db3a029dbbb843c` |

Log paths are `/tmp/plan2-mixed-source-pr38-ci-{failed,maintenance-probe,targeted,lint,typecheck,affected,affected-final}.log`.
The reviewer recomputed these hashes and the complete code diff after the
implementer finalized the report. Accepted Task PRD/design/implement/check
manifest, applicable CLI quality/isolation/filesystem/Core guidelines and the
current continuation contract were read. The full on-disk quality spec was
read despite injection limits. No memory-derived task fact was used.

## Verification

- Lint: pass; root Core/CLI lint exit0, verified retained worker log.
- TypeCheck: pass; root Core build followed by CLI typecheck exit0, verified
  retained worker log.
- Targeted regression: 1 pass/162 name-filter skips, exit0. These skips are
  explicit filtering, not a complete-file result.
- Final affected file: 163 pass/no skips, exit0, 51.00s; verified the complete
  final log and exact final file. It ran after the Core rebuild completed.
- Reviewer `git diff --check`: pass, exit0.

The initial affected-file attempt failed import before any tests because it
ran concurrently with root typecheck, whose Core build deletes dist. Its
`migration-v2.js` missing error, exit1 and zero tests remain recorded; this is
an execution scheduling failure and is not counted as a passing run. The final
sequential rerun resolves that environment condition. No additional broad
suite was run by this reviewer, and no current whole-suite pass is constructed
by adding targeted/affected counts to earlier results.

Fresh CI for a new published head is still pending. The original failed PR38
run remains failed; earlier packed acceptance and local checks do not replace
that remote result. This review performs no Git mutation, publication,
real-sample write, outbound task message or lifecycle recording. Issue #31
remains closed and this upstream fix does not depend on #531.
