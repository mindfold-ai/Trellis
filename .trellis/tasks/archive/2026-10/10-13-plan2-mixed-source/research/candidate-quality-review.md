# Independent complete-candidate quality and evidence review

Date: 2026-10-13. Profile: `quality` / explicit evidence refresh. Exact legacy
Task: `plan2-mixed-source`, generation 0, source `no_issue`, under the undeclared
root workflow. This report supplies independent quality evidence only; it does
not select a Delivery or record Check, Review, readiness, Completion or Closure.

## Verdict and scope

No unresolved implementation, specification, regression or candidate-evidence
finding remains in the accepted scope. R1–R7 and AC1–AC7 have sufficient source
and fresh installed synthetic evidence. The complete four-file diff against
`fdb88e8e220b42df0f0b78f8b939e072d36b9be1` was inspected, together with current
PRD/design/implement, both context manifests, their applicable specs and source
research. The full quality guideline was read from disk despite injection caps.
The exact final candidate and every requirement were reviewed independently of
the implementer and candidate-harness worker.

Only this report was written by this reviewer. Product, test, harness, installed
package, lifecycle and other Task files were read-only. No broad suite rerun was
needed: the exact source remains unchanged from the source-quality review and
its final checks. This is one complete candidate-review round, not a claim of
two new review rounds or completed delivery/closeout. Issue #31 remains closed;
no #531 gate, joint acceptance or business cutover is required or asserted.

## Findings (fixed)

None in this review. Earlier source-review test fixes and candidate harness
corrections are attributed to their original owners, not counted as fixes by
this reviewer. Their unsuccessful runs remain retained.

## Findings (not fixed)

None within the accepted implementation and synthetic-verification scope.
Product commit, remote CI/publication/release, real sample rehearsal, business
recovery, outbound handoff and Task closeout are separate remaining actions,
not satisfied or authorized by this review. They are not blockers to upstream
synthetic quality acceptance.

## Requirement and acceptance trace

| Requirement / AC | Independently inspected evidence | Assessment |
| --- | --- | --- |
| R1–R2 / AC1–AC2 | Closed global `mixed` enum, row enum and cross-field refinement run at plan parsing before repository processing. Convert-active, convert-archive and defer all require the selector and share one strict public-validator helper over the original decoded snapshot. Wrong source, malformed/unknown input, missing/bad/forbidden selectors and homogeneous overrides have intended-error and whole-tree/zero-writer source regressions. There is no parser fallback. | verified |
| R3 / AC2–AC3 | Homogeneous plan/error behavior is retained. Mixed current/history forbids selectors and keeps strict current, target-record, location and missing/history semantics. Single-kind and current/history-only inventories have no artificial requirement to contain both predecessors. Original Plan1 and all original Plan2 cases remain covered. | verified |
| R4–R5 / AC1, AC4 | Public Core projection, immutable facts, generation/source/business/tree checks and legacy-fact obligations remain unchanged. Source tests assert nonzero generation and structured Issue/tree/meta preservation. Fresh full 28/3 public-bin variants select schema1, legacy or archive and defer 30 neighbors. Raw source history, UTF-8/whitespace, planning/binary descendants and modes are exact; deferred peers gain no migration/Delivery artifacts or writer calls. No old status fabricates gates. | verified |
| R6 / AC5 | Complete inventories, path/alias, original identity/provenance/case/generation, unique binding, marker and final topology/drift guards remain on actual code paths. Source negatives retain zero-write/full-tree proof. Both fresh registered-sibling plan orders have opposite bound schema1/legacy authorities and preserved inherited copies. Eight sibling plus two single-root Python3.9 routes resolve exact Task, generation, workspace and Delivery. Eight deferred direct selections return strict predecessor errors, rather than unrelated missing-Delivery failures. | verified |
| R6 / AC6 | Scoped actual source-history atomic rename fails only after its associated live Task is schema2. Frozen original plan and declarations survive fault/preview/resume. Recorded writer traces prove preserve/completed-target no-write; plain public-bin replay uses no import shim. Exact source/target/binding byte/mode third states reject with the injected path. Clean-preview backups include prior absence; rollback restores only those non-preserve paths and removes only added empty directories. Full primary/sibling/common trees are restored exactly. | verified |
| R7 / AC7 | Public spec/code/test truth tables agree. Required recorded source quality/minimum-Python checks pass with historical failures, skip and warnings disclosed. Fresh CLI/fixed Core pair, source/installed identity, full plan/template/harness hashes, public entry and Python evidence were independently rehashed and audited as detailed below. | verified within stated environment |

The optional-chain owner check is equivalent: `owner_id` is a required nonempty
string, so missing outcome and different owner still reject. No Core, Python,
runtime-template, command/version or Task/Delivery model change was introduced.
The existing legacy-generation identity classifier does not choose a fallback
predecessor parser; explicit acceptance remains separate and strict.

## Independently verified identities

Approved candidate root: `/tmp/plan2-mixed-source-candidate-9981ff40b934`
(macOS canonical `/private/tmp/...`). No product commit exists yet.

| Identity | SHA256 |
| --- | --- |
| Four-file binary diff against the exact base | `dd98725f2a3d6e4d3d888d5ca21e8dc1ae9da69a1dc4f6d132255348fa42f2e0` |
| Complete 1257-entry source manifest, excluding Task evidence | `2dd21f6287f0b4ee5d3ed7e8734feeaacdf2df5ca07106a0e261e46b4d3aac68` |
| New CLI tar | `5aeeb81ca72508081b7dd94ddb7a19f69444714f78b3a38858d908196cc77916` |
| Fixed Core tar | `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967` |
| Final synthetic-proof-attempt5.json | `867e15a18d779880d35a1b49b4eded999aa6dcee4993f374dcc472c14e990f48` |
| 6450-entry retained artifact index | `a988d4d686e1b02ad8f158e587031b90a97b08abecf77813175a4a30ede661ff` |

All four current product/spec file hashes match source-quality review. The live
source and before-build/after-pack/after-proof manifests agree. The frozen diff
matches the current Git binary diff. Independently read each tar member and
installed counterpart: all 713 CLI and 270 Core files match bytes and permission
bits, no extra installed package files exist, and CLI pins exact Core `.3`.
Build/install command-log hashes and successful exit records also agree. The
Core source remains unchanged from its fixed predecessor; fixed input was not
modified. Same package version is explicitly not a content identity or npm
replacement permission.

All final harness hashes match actual files. All 6450 indexed retained artifact
bytes/modes match. The Task-local candidate-evidence.json proof equals the raw
final proof; its package/source/proof/index identities agree. Current result,
handoff, provenance and execution checkpoint accurately separate actual proof,
historical pending checkpoints and remaining authorization boundaries.

## Fresh public-entry evidence audit

| Variant | Full plan SHA256 | Actual subprocesses | Current restored tree entries |
| --- | --- | --- | --- |
| inventory-schema1 | `cd8c34df217fd444a9549838f8b56aa7d6e3e54052834a8786d3ddf4112fb607` | 21 | 645 |
| inventory-legacy | `12f5785b41cec176349179d182a3e7217c0a36a0f16e2e327d020ccebb79c828` | 21 | 645 |
| inventory-archive | `a3757fbf58f0f7bb572d3cb939e394d63ee90ab3d714a097bf055235a77178bd` | 15 | 648 |
| siblings | `b4b9fc0c9b95c95e53c9b49854b459359c6b1cfbbdf94bf555ca2a97fdbbcda4` | 47 | 160 |
| siblings-reverse | `77285a6b1a8158c745037ea615355d294da8386436b9a0226869e74ab0a151a2` | 47 | 160 |

Independently parsed all five complete plans, template entry/digest sets, actual
151 argv/cwd/environment/status records, raw preview/fault/recovery/replay and
reader outputs. Template bytes/modes in file decisions match declared hashes.
Clean-preview backup sets exactly equal non-preserve action sets (48, 48, 47,
96, 96 paths respectively); original bytes/modes/prior absence agree with the
original manifests. Partial live manifests and raw fault events prove schema2
was reached before failure. Exact plan hashes remain frozen across recovery.

Preserve paths never appear in fault/resume writer calls; preview, partial
preview and completed replay traces are empty. Plain replay has no `--import`.
Source/target/binding third-state preview and execution manifests agree, and
their intended path-specific conflicts and zero writer traces are present.
Ten minimum-Python raw outputs agree on exact Task/workspace/Delivery/generation;
all eight direct deferred errors identify schema1 or knownlegacy rejection.
Archive conversion is deliberately not counted as a current-reader route.

Beyond trusting saved rollback assertions, this reviewer recursively rescanned
the current restored primary/sibling trees, including common Git storage,
indices, modes, empty directories and symlinks. Every final tree equals its
original manifest. No directory/symlink/Git-index exclusion was introduced.

## Verification and limits

- Lint: pass; inspected final root `quality-lint-final-2.log`.
- TypeCheck: pass; inspected final root `quality-typecheck-final-2.log`.
- Source tests: complete Core 475 pass / 1 inactive no-Python-placeholder skip;
  complete CLI 2283 pass before two localized reviewer-only test fixes; final
  whole migrate2 file 163 pass under actual Python3.9.6. These are separate
  actual runs, not an invented combined total or new broad rerun here.
- Python: actual `/usr/bin/python3`3.9.6 reader proof; recorded tracked syntax
  inventory 89 pass and typecheck 0 errors / 48 existing warnings. No Python
  product bytes changed. Source-quality review documents minimum-interpreter
  selection and the earlier affected-test timeout/resolution.
- Candidate: fresh CLI build/pack/install pass; all five installed synthetic
  variants and read-only evidence rehash/rescan checks pass.

Actual local Node is v26.9.0, not Node20 CI proof. Whole-Git zero-write reader
and rollback evidence is scoped to explicit `GIT_OPTIONAL_LOCKS=0` and
`PYTHONDONTWRITEBYTECODE=1`, recorded on every command. Ordinary Git status may
refresh its optional index cache outside this environment. Attempt4 exposed
that exact index change and remains failed; it was not hidden by exclusion.

Attempts1–4 remain unsuccessful whole attempts: canonical-path harness mismatch,
branch-source title fixture mismatch, exact error-space assertion mismatch and
optional Git index refresh. Final attempt5 is the sole successful whole proof.
Their raw outputs and explanations are retained in harness/README.md and logs;
no product/package edit or relabeling converted failures into passes. Earlier
source baseline, fixture, lint, dist-race and timeout failures also remain.

No existing/real sample, #406 full preview/execution/completion, #531 acceptance,
business installation switch, release, remote CI, Git commit/branch/worktree or
outbound message was performed by this reviewer. Candidate handoff is local
and explicitly uncommitted. The accepted upstream scope is independently
verified; the supervising owner retains actual lifecycle/delivery authority.
