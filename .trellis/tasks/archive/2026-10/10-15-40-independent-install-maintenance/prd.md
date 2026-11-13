# Issue #40: Independent installation and selected-task maintenance

## Authority and goal

Direct source: https://github.com/castbox/Trellis/issues/40, source revision `2026-10-15T08:04:48Z`. This Task owns the complete upstream scope of that Issue. The paired Guru consumer is https://github.com/castbox/guru-trellis/issues/566; its team policies and private artifacts remain outside this Task's implementation ownership.

Allow a user or workflow to update one checkout's tools, convert one selected old Task, or retain one old Task as historical archive independently. An old Task that cannot enter its normal parser, Identity, Continuation or Reconcile must still be maintainable from a complete matching new CLI/Core installation. Installation success, data conversion, native continuation and business completion are distinct results.

## Confirmed starting facts

- Baseline source is `dde5f90903e9299236e3574d4dfab6441daec09d`. Ordinary `update` requires an exact installed-version match. The existing Delivery preflight only preserves old records as history after a Delivery declaration is already installed.
- Existing Plan2 validates a complete registered workspace/task/session inventory. It remains a separate supported operation; omitting roots is not a selected-task maintenance implementation.
- CLI and Core are version-locked packages. Equal version strings do not establish equal source, build, or public capability. No global CLI update is part of this Task.
- This repository currently uses its retained native legacy workflow. This work uses the retained native legacy Task workflow, not schema-2 Delivery activation or production migration.

## Requirements

| ID | Required outcome |
| --- | --- |
| R1 | A tools-only operation takes an explicit existing project checkout. It changes only that checkout's public tool/template assets and their actual version/receipt state. It neither creates nor switches a branch/worktree and does not update peer checkouts. Guru owns omitted-target/base inference, outside this upstream operation. |
| R2 | A supported legacy installation can make its first explicit tool/runtime cutover through the public operation. The caller does not first falsify the installed version or workflow declaration. Existing managed-file, custom-workflow, local-edit, preview and sidecar semantics remain supported. |
| R3 | Installation does not convert or clear Task records, planning, archives, sessions or branch bindings. Old data, shared business control state and peer checkouts retain bytes/modes. Incompatible selected old state receives a classified maintenance-required diagnostic and an actually callable entry; it is not a current schema-2 authority or a fabricated gate. Legal new-model operations remain usable. |
| R4 | Installation preview is write-free. Reapply and ordinary partial-write recovery use the original operation and bounded tool write set; rollback preserves later business work. Every restored tool/data combination is supported. If subsequent Task conversion makes tool-only rollback incompatible, stop that rollback or return the need for a separately reviewed combined restoration scope; do not silently add data writes. |
| R5 | Complete matching new tools can inspect and maintain an explicitly selected old checkout/TaskId/generation without the target's old dispatcher or prior successful parser/Identity/Continuation/Reconcile. The tools need not be merged into the target branch before maintenance preparation starts. |
| R6 | Conversion changes only the selected Task, necessary planning projections and explicitly associated session/binding data. Preserve immutable identity, source, generation, accepted scope, real delivery history and pending responsibilities. Read inherited copies only as needed to establish authority; do not convert other Tasks or update all registered workspaces. |
| R7 | Public validators/executors do not infer semantic success from old status, a merged PR or an old gate. The original workflow owners supply and verify historical attribution and future execution intent. Unsupported old formats have a concrete diagnostic and do not trigger a permissive parser fallback. |
| R8 | When continued execution needs newer target tools, installation is an independent operation within an explicitly reviewed combined scope. Conversion success requires the target checkout's own normal native entry and the next real consumer under a compatible tool/data combination. External execution, JSON parsing or printed context alone is insufficient. Business baseline effects still belong to the original Reconcile semantic owner. |
| R9 | Historical closeout can persist a readable old archive without inventing schema-2 Delivery, Completion, Closure or Finish success. Only after that archive exists and is readable, retire the exact selected Task's active session/binding references so normal context no longer selects it. Preserve TaskId/history, external unfinished obligations and all other Tasks/sessions. No target-tool upgrade, worktree/branch cleanup or remote Issue disposition is implied. |
| R10 | Retry and output-loss recovery reuse the original operation, projections and generated identities. Do not create another Delivery or reimport a historical result. Task-maintenance backup, recovery and rollback are bounded to the reviewed write set, reject incompatible tool/data restoration, and preserve subsequent business work. |
| R11 | Expose documented, versioned public CLI/Core contracts with supported predecessor formats, exact input/output/write scope and error semantics. Provide an installable matching candidate and actual packed/native evidence. Guru consumes these contracts; neither repository waits for the other Issue to be CLOSED. |
| R12 | Existing Plan1/Plan2 and ordinary init/update retain their explicit contracts. New maintenance capabilities do not silently redefine them or add a second Task/Delivery lifecycle authority. Workflow semantics remain in Markdown and owner judgments; scripts execute and validate deterministic facts. |

## Acceptance criteria

| ID | Observable result | Requirements |
| --- | --- | --- |
| A1 | A representative installation with multiple real worktrees and valid old active/archive Tasks/sessions upgrades only the explicit checkout's tools. Recursive bytes/modes of preserved old data and peer checkouts, plus shared business controls, remain unchanged. Reapply is stable. | R1–R3 |
| A2 | First predecessor-to-new-runtime installation succeeds through the real public entry without a prewritten declaration/version. Local user edits receive the declared conflict/sidecar behavior. Legal new-model operations work; selected old state returns maintenance-required rather than internal error or silent no-task. | R2–R3 |
| A3 | An upgraded baseline and an old tools/old Task checkout can enter read-only maintenance preparation even when normal continuation/Reconcile fails on format. After bounded conversion and any independently reviewed tools installation, the target's own native entry and next consumer work. Use a conflict-free Git candidate to isolate the original startup dependency. | R5–R8 |
| A4 | A historically delivered Task with pending acceptance retains identity, planning and owner-verified delivery. Current gates remain unapproved; the next native consumer reaches pending acceptance without manufacturing another Delivery. | R6–R8 |
| A5 | A history-only closeout persists a readable archive and retires exact old bindings. Normal native context no longer selects the old Task. Other Tasks/sessions and external obligations remain; no target-tools update, resource cleanup or new-model success occurs. | R9 |
| A6 | Same-operation retry, lost stdout and ordinary partial writes preserve identities and bounded preimages. Later business work is not overwritten. In the sequence tools install → Task conversion → request tool rollback, an incompatible one-sided rollback is explicitly blocked. | R4, R10 |
| A7 | Unsupported source/candidate mismatches produce specific diagnostics before unsupported writes. Inherited copies can establish the selected authority without becoming additional migration targets. | R5–R7, R11 |
| A8 | Existing Plan1/Plan2, exact-version ordinary update, managed/custom workflow behavior, and generated Python/dogfood parity remain covered by their applicable regressions. | R12 |
| A9 | CLI/Core source/build/package identities and actual packed CLI/native-reader results are reported separately from Guru joint validation, business regression, external acceptance and software release. | R8, R11 |

## Scope and exclusions

In scope: CLI tools-only installation execution, selected-task conversion/history maintenance, reusable Core validation/model helpers, native Python selection diagnostics and exact binding operations, canonical/dogfood synchronization, documentation and focused tests.

Out of scope: applying installation/migration to real business repositories, upgrading the global CLI, changing Guru's source lock or private workflow packages, updating all worktrees, business acceptance, Git/GitHub delivery, version publication, Issue closure and resource cleanup. No new hostile-input model, locks/TOCTOU protocol, stress testing, fault-injection campaign or exceptional crash-hardening is introduced. Existing path/secret/ownership constraints remain applicable.

## Execution status

Implementation is active under the native legacy workflow. Design and execution planning cover source formats, public entries, native consumers, recovery and compatibility. Test and candidate results are recorded in implement.md; Task activation does not itself establish acceptance.
