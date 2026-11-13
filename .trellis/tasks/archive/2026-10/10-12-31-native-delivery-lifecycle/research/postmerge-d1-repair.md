# Post-merge D1 review repair scope

Source: human-authorized delegation from independent PR #32 review chat.
Fixed reviewed range: 5c760463680ffc10a3f26957b330c57a4b0c3ff8 through
ce36314b1ef5b44230883af9c1139a6244c13155 (204 paths), merged as
6e3ccc8d6d9e71dbcd77fbe6d945599e5f4f9b7f. Fresh main still equals that merge;
local source HEAD ce36314b has the same tree, with a clean starting worktree.
Repair proceeds in this exact legacy Task; no source history rewrite or
Task/workflow migration is performed. Authorization is for implementation,
regression Check and independent Review, not another push/merge/release/cleanup.

## Gaps and ownership

1. custom workflow without hash is re-adopted during forced full/add-platform
   reinit; init must preserve actual ownership and subsequent update behavior.
   Owner custom_workflow_reinit: init and dedicated integration regressions.
2. historical local_commit stores mutable refs; require exact commit OID and
   objective commit-object validation. Owner publication_rework_fix.
3. Core Git verifiers inherit repository redirects; both runtimes strip GIT_*
   for all probes and binary blob reads. Owner publication_rework_fix.
4. raw workspace permission mode differs from Git tree mode; explicit kind
   chooses Git owner-execute normalization vs full git_free permissions.
   Owner publication_rework_fix: Core/Python/CLI API and meaningful real-Git
   regressions. Parent synchronizes public contract, spec and design.
5. OpenCode rejects accepted storage-root aliases; validate Delivery descendants
   below the strictly resolved real Task root, rejecting nested symlinks.
   Owner native_delivery: actual carrier/lib, dogfood twins and execution tests.
6. Continuous actual custom-v2 reinit regression also exposed D1 continuation
   extraction rejecting valid sibling runtime-contract markers. The same init
   owner narrowly permits those exact markers outside the continuation block
   and preserves all malformed/nested marker diagnostics. This is required to
   verify actual custom/native D1 continuation after the reported fix.

No new Task data model, private Guru policy, Git transactions or compatibility
cutover is introduced. Default legacy behavior remains D1-scoped. Tests must
reproduce actual init/update flags, real repository refs and permissions,
polluted environment and actual carrier alias injection; old CI is not proof
of these newly discovered paths. Final full checks, build and independent
complete candidate Review follow source stabilization.

## Actual validation and independent Review

Sources and tests are frozen against local HEAD
`ce36314b1ef5b44230883af9c1139a6244c13155`. Independent carrier
`committed_review` reviewed the original complete D1 context plus the entire
repair increment. Its additional P2 found real SHA-256 repositories accepting
40-hex commit prefixes. Both runtimes now require the resolved full commit OID
to equal the input as well as a commit object type. Real-repository regressions
first failed, then passed, with Task raw bytes unchanged on rejection.
Red/green logs: `/tmp/trellis-31-sha256-prefix-{core,python}-{red,green}.log`.
The carrier independently reran the Python 3.9 boundary probe and accepted the
correction. Final complete source Review: PASS, no remaining actionable finding.

| Verification | Actual result | Evidence |
| --- | --- | --- |
| Custom legacy/v2 reinit and continuous update | 533 targeted PASS; old init reproduced 4 failures, old continuation 3 | original implementation owner tool history |
| OpenCode actual alias injection / nested links / zero writes | 83 PASS, five initial failing cases | `/tmp/issue31-opencode-alias-{red,green}.log` |
| Core immutable commits / isolated Git / permission semantics | 40 targeted PASS | `/tmp/trellis-31-sha256-prefix-core-green.log` |
| Shipped Python 3.9 corresponding integration | 20 targeted PASS | `/tmp/trellis-31-sha256-prefix-python-green.log` |
| Complete Core suite | 451 PASS, 1 existing SQLite SKIP | `/tmp/trellis-31-postmerge-core-test.log` |
| Complete CLI suite | 1949 PASS, 87 files | `/tmp/trellis-31-postmerge-cli-test.log` |
| Centralized Core + CLI build | PASS | `/tmp/trellis-31-postmerge-build.log` |
| Final Core + CLI lint | PASS | `/tmp/trellis-31-postmerge-lint-final.log` |
| Both package typechecks | PASS | `/tmp/trellis-31-postmerge-{core,cli}-typecheck.log` |
| Python static check | 0 errors, 48 existing warnings | `/tmp/trellis-31-postmerge-pyright-final.log` |
| Actual Python 3.9.6 compilation, 33 runtime twins, public contract and OpenCode twins | PASS | parent tool observations |
| Installed Core export and Python regression suites | 60 PASS (40 + 20), including exact SHA-256, environment pollution, modes and manual Git-root cases | `/tmp/trellis-31-postmerge-installed-regressions.log` |
| Actual installed schema-2 continuation extraction | both native projects match their exact workflow block | candidate `continuation-validation.json` |

## Corrected local package provenance

A fresh corrected candidate was packed and installed at
`/tmp/trellis-31-postmerge-candidate-m8HYFR`. Both packages remain
`0.7.0-castbox.3`; this is an uncommitted local validation candidate.
`candidate.json` binds the exact reviewed package/test/spec increment with SHA256
`233118577c8f9bfa972e0ded01a7ac5c339b94fa844fab13aa1af1341d3a4046`;
Task-local design/evidence edits are excluded from that package fingerprint.

| Package | Tarball SHA256 | Installed files verified against tarball |
| --- | --- | --- |
| Core | `6d45a41e70ab4740645d2b5e609359b9c340cfdf1148eff1a3d843e9766da059` | 258 |
| CLI | `79fb267df04db6d574aeee45665b797970e6a5cffb01f59c4109bff85fcab1d7` | 700 |

The temporary harness copies the existing regression cases and changes only
runtime import/script and fixture paths to point at the actual installed
packages. Product source is unchanged by that validation.
Fresh manual-single and local-multi samples have three new slice identities
and real local commits. Independent installed full Review returned three PASS,
no findings, after reading every applicable scope/plan/Check hash, actual
artifact/mode and complete base-to-head Git range. It independently verified
all installed package and sample runtime provenance. Parent then accepted
readiness for these exact scopes and ran the controlled executor. All three
slices reached delivered, identical-result retries changed no bytes, and each
sample Task separately has one whole-scope Completion and no-mutation Closure.
D1 forward writes restored its exact reviewed HEAD before recording results;
both actual commits and D2 retained content remain present. Prior sample
results were not rebound to these identities.

| Sample | DeliveryId | Actual complete range / outcome |
| --- | --- | --- |
| manual AC1 | `fc419cc0-fa45-46c2-ad03-130345fdda35` | Git-free report1.txt exact UTF-8 / 0644; delivered |
| local AC1 | `f1099241-2595-40ec-8a53-3715bd97d7ff` | `cd7744c45670a72849cc87b86f1148b8480b98d5..a148ff2cca7ed2fe13092928195684b3abf89a58`; delivered |
| local AC2 | `68abe46c-bfab-4eb3-9896-48d461758970` | `a148ff2cca7ed2fe13092928195684b3abf89a58..446f048f37d269a57d7f968c6b7bc52131e5da78`; delivered, D1 retained |

Actual prepare/finish logs: `/tmp/trellis-31-postmerge-samples-{prepare,finish}.log`.
Per-slice reports and exact refs remain under candidate `samples/`; these are
controlled install validation outcomes, not this repository Task Completion.

## Remaining boundaries

At the validation snapshot before this authorized local commit, no new commit,
remote publication, merge, version release, main synchronization,
Task migration/archive or cleanup has occurred. These repairs close the D1
review findings, not the whole Issue #31 scope. D2 default cutover and Guru joint
installed evidence remain pending under the matching consumer owner. The exact
repository Task remains legacy `in_progress` and unmigrated.

## Authorized local commit boundary

Branch: `codex/31-native-delivery-lifecycle`. Parent HEAD:
`ce36314b1ef5b44230883af9c1139a6244c13155`.
Message: `fix(delivery): close D1 review boundary defects`.
Scope: the exact 28 files listed below, including this actual evidence note.
Human authorization: `同意提交`, for this exact local commit.
No push/PR/merge is included.

```text
.opencode/lib/trellis-context.js
.opencode/plugins/inject-subagent-context.js
.trellis/delivery-contract.md
.trellis/scripts/common/continuation_contract.py
.trellis/scripts/common/delivery_schema.py
.trellis/scripts/common/delivery_store.py
.trellis/scripts/delivery.py
.trellis/spec/cli/backend/commands-workflow.md
.trellis/spec/cli/backend/delivery-lifecycle.md
.trellis/spec/cli/backend/script-conventions.md
.trellis/tasks/10-12-31-native-delivery-lifecycle/design.md
.trellis/tasks/10-12-31-native-delivery-lifecycle/research/postmerge-d1-repair.md
packages/cli/src/commands/init.ts
packages/cli/src/templates/opencode/lib/trellis-context.js
packages/cli/src/templates/opencode/plugins/inject-subagent-context.js
packages/cli/src/templates/trellis/delivery-contract.md
packages/cli/src/templates/trellis/scripts/common/continuation_contract.py
packages/cli/src/templates/trellis/scripts/common/delivery_schema.py
packages/cli/src/templates/trellis/scripts/common/delivery_store.py
packages/cli/src/templates/trellis/scripts/delivery.py
packages/cli/test/commands/custom-workflow-reinit.integration.test.ts
packages/cli/test/regression.part-04.ts
packages/cli/test/scripts/delivery-v2.integration.test.ts
packages/cli/test/templates/opencode.test.ts
packages/core/src/task/v2/schema.ts
packages/core/src/task/v2/store.ts
packages/core/test/fixtures/task-v2/git-candidate-boundaries.json
packages/core/test/task/v2.test.ts
```
