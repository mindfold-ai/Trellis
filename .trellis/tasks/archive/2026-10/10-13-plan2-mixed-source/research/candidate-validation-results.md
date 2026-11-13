# Offline candidate validation results

Date: 2026-10-13. Independent upstream no-issue Task `plan2-mixed-source`.
Final synthetic attempt5 passed all five variants. Independent complete-candidate
audit passed with no unresolved finding; see candidate-quality-review.md. No
formal Completion/Delivery gate is recorded.
Issue #31 remains closed and no downstream acceptance is required.

## Exact candidate and execution

Approved root: `/tmp/plan2-mixed-source-candidate-9981ff40b934`, macOS canonical
`/private/tmp/plan2-mixed-source-candidate-9981ff40b934`. Base is
`fdb88e8e220b42df0f0b78f8b939e072d36b9be1` plus the reviewed four-file diff
`dd98725f2a3d6e4d3d888d5ca21e8dc1ae9da69a1dc4f6d132255348fa42f2e0`.
No product commit exists yet. Product/spec hashes remain those in provenance.
The 1257-entry source manifests before build, after pack and after all proof are
identical, digest `2dd21f6287f0b4ee5d3ed7e8734feeaacdf2df5ca07106a0e261e46b4d3aac68`.

Fresh CLI build/pack and npm install completed with ignored lifecycle scripts,
no audit/fund, owned prefix/cache. CLI tar SHA256 is
`5aeeb81ca72508081b7dd94ddb7a19f69444714f78b3a38858d908196cc77916`;
fixed Core is `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
Core source is unchanged; the CLI package pins exact `.3`. All 713 CLI and
270 Core package files matched tar bytes/modes with no extra files, independently
rechecked after the proof. Absolute paths and retained manifests/commands are in
`candidate-evidence.json` and `candidate-handoff.md`.

Actual tools: Node v26.9.0, pnpm10.32.1, npm11.19.1, `/usr/bin/python3`3.9.6,
Apple Git2.54.0. This does not establish Node20 CI or release proof.

## Successful public-entry proof

| Final variant | Task rows / predecessors | Convert / defer | Commands | Complete plan SHA256 |
| --- | --- | --- | --- | --- |
| inventory-schema1 | 31 / 28 schema1 +3 legacy | 1 /30 | 21 | `cd8c34df217fd444a9549838f8b56aa7d6e3e54052834a8786d3ddf4112fb607` |
| inventory-legacy | 31 / 28 schema1 +3 legacy | 1 /30 | 21 | `12f5785b41cec176349179d182a3e7217c0a36a0f16e2e327d020ccebb79c828` |
| inventory-archive | 31 / 28 schema1 +3 legacy | 1 /30 | 15 | `a3757fbf58f0f7bb572d3cb939e394d63ee90ab3d714a097bf055235a77178bd` |
| siblings | 4 /2 schema1 +2 legacy copies | 2 /2 | 47 | `b4b9fc0c9b95c95e53c9b49854b459359c6b1cfbbdf94bf555ca2a97fdbbcda4` |
| siblings-reverse | 4 /2 schema1 +2 legacy copies | 2 /2 | 47 | `77285a6b1a8158c745037ea615355d294da8386436b9a0226869e74ab0a151a2` |

All migration commands use the actual installed `bin/trellis.js`; installed APIs
only construct generated fixtures/plans. No private raw data is copied. There
are 151 retained subprocess calls with exact argv/cwd/environment/exit and raw
stdout/stderr. Every variant proves clean preview zero writes, scoped actual
atomic source-history rename failure after the associated Task reached schema2,
unchanged frozen-plan preview/resume, preservation with zero writer calls,
completed zero-writer replay and an extra plain `node <bin>` replay without any
import shim. Source/target byte/mode third states require the exact injected
path in `third_state: <path>` and reject execution with zero writers.

Sibling variants additionally prove preserved binding bytes/modes, opposite
unique execution authorities, deferred schema1 and legacy exact source errors,
and binding byte/mode third-state zero-write rejection. Ten actual Python3.9.6
routes (eight sibling plus two single-root inventory) verify exact Task, Delivery,
generation, workspace, runtime/contract and continuation from both roots.
Archive conversion is not claimed as a current-reader route.

Whole manifests include file bytes/modes, directories/empty directories, symlinks,
primary Git common storage and sibling metadata. Each rollback restores only
the backed-up clean-preview non-preserve write paths, respecting prior absence,
then removes only added empty directories. All five final trees exactly equal
their originals. No snapshot exclusion hides a changed Git index.

The final proof manifest is `synthetic-proof-attempt5.json`, SHA256
`867e15a18d779880d35a1b49b4eded999aa6dcee4993f374dcc472c14e990f48`.
It records harness and template hashes plus complete plan identities. The
candidate artifact index binds 6450 retained files outside installed/cache;
installed package bytes are separately bound by the package manifest. A durable
Task-local summary is `candidate-evidence.json`. Raw artifacts remain at the
approved root and are not publication artifacts.

## Failed attempts and proof limits

Attempts1–4 are retained and not counted as whole-run passes. The harness fixes
were canonical `/tmp` versus `/private/tmp` ownership, projecting the actual
right-branch source title, including the literal space in an exact third-state
assertion, and Git optional index refresh during Python context reads. The first
three are synthetic harness/fixture errors. Attempt4 reader assertions passed
but full-tree equality detected `.git/worktrees/right/index` changed.

Final proof explicitly uses `PYTHONDONTWRITEBYTECODE=1` and
`GIT_OPTIONAL_LOCKS=0`; its full Git manifest equality applies under that declared
isolation environment. Ordinary Git may refresh caches outside it. The product,
package inputs and installed bytes were never edited to accommodate these
failures. The test-only writer/fault shim is outside every installed package and
fixture runtime; recovery has no fault, and plain replay confirms public binary
behavior without a shim. See `harness/README.md` and all prior attempt logs.

## AC trace and remaining boundary

| AC | Actual evidence |
| --- | --- |
| AC1 | Final full28/3 schema1/legacy/archive variants convert selected records and preserve30 neighbors; source regression matrix agrees. |
| AC2–AC3 | Final source suite covers all closed-selector, wrong-source, malformed, homogeneous/current/history/single-kind and original compatibility cases with intended diagnostics/full-tree assertions; see quality-review.md. Packed proof does not claim to rerun this entire source-negative matrix. |
| AC4 | Frozen original history bytes/modes, exact targets, planning/binary descendants, no preserved writers and raw deferred peers verified source and installed. |
| AC5 | Both inherited-copy plan orders, unique bindings, exact minimum-Python route and strict deferred source rejection verified installed; full safety negatives/final drift are source evidence. |
| AC6 | Actual fault after schema2, same-plan recovery, zero-writer/plain replay, source/target/binding byte/mode conflicts and exact whole-tree rollback verified installed. |
| AC7 | Spec/code/tests, required source checks/minimum-Python plus exact new CLI/fixed Core provenance, installed byte/mode equality and public-bin evidence verified. Final independent complete-candidate audit passes; see candidate-quality-review.md. |

Core complete source suite ran475 pass/1 inactive-placeholder skip; CLI complete
suite ran2283 pass before localized reviewer-only test fixes, then final whole
migrate2 file ran163 pass. Root lint/typecheck pass; Python types0 errors/48
existing warnings and actual3.9 syntax inventory89 pass. These are separate
executions, not a combined newly run suite total.

No real full Plan2 preview/execution, #406 completion, #531 Check, business
cutover, Node20 CI or release is claimed. Upstream acceptance stays independent.
Commit, publication, branch/worktree, existing-sample writes, outbound messages
and old-resource cleanup remain outside this approval. Task stays in_progress
until its workflow's delivery/closeout boundaries are fulfilled.
