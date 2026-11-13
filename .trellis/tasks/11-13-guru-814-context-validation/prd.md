# Native context worktree cost and tools validation

## 1. Goal and source

Provide the Fork prerequisite for [castbox/guru-trellis#814](https://github.com/castbox/guru-trellis/issues/814): reduce repeated Git process work in native context identity resolution while preserving identity correctness, bounded tools validation and original-operation recovery.

The Issue is a `reference_only` source. This Task owns the Fork prerequisite only. Guru source-lock adoption, actual Guru installation, downstream acceptance, Issue closure and downstream Task Completion remain with #814. The prerequisite is independent of a product release, version bump or release schedule.

Development baseline: `castbox/Trellis main@aa898d090fc27c9ce6145cfa3c787a6f400da4e2`. The source CLI/Core version is `0.7.0-castbox.6`. The current checkout uses its retained native workflow without a Delivery runtime declaration; this Task remains in that workflow and is not a schema migration.

## 2. Background and evidence limits

- The Issue reports a tools-only postvalidation timeout at the 10-second `get_context.py --mode runtime-contract --json` probe during #793. Its source observation was 169 registered workspaces, approximately 509 Git subprocesses and approximately 12 seconds for direct execution. A temporary same-version Git PATH change reduced that historical run to approximately 5.2 seconds. These are historical observations, not a current root-cause proof or a source fix.
- Before this Task, a read-only audit of the downstream native entry at Guru `ce4644392d1ed9815d59071388b9bff9978d1cee` recorded 353 Git calls and 4.011 seconds: 176 common-dir queries, 176 toplevel queries and one worktree-list query. It returned valid JSON. That run did not reproduce a timeout and is not the controlled Fork before/after comparison.
- Current Fork `session_storage.py` validates workspace membership through repeated Git queries. The public tools owner in `maintenance/tools.ts` independently limits its native contract and context probes to 10000 ms.
- Existing recovery saves the original plan before writes. A failed postvalidation does not establish an applied terminal result. Real recover/resume must use the original operation reference and candidate rules.

## 3. Supported scenarios

| ID | Caller and trigger | Required observable result |
| --- | --- | --- |
| S1 | A normal caller starts native context in a repository with about 169 registered worktrees. | Resolve the same current session and workflow with less repeated Git process work; complete real tools postvalidation within its finite supported budget. |
| S2 | A caller has no matching session, a bound session in another checkout, or a deliberately supplied Task. | Preserve each entry's existing no-task, selected identity and unique-checkout behavior. Do not borrow another session or choose from inventory. |
| S3 | A normal selected identity becomes stale, missing, conflicting or unsupported. | Return its existing refusal rather than treating it as no-task. Preserve registered-workspace validation, including the exact supported prunable exception. |
| S4 | A tool invocation's outer wait ends, or native postvalidation actually fails after original writes. | Distinguish those observations. Wait for the original running executor when still running; otherwise inspect/recover/resume its exact operation. Do not prepare a replacement or rewrite its checkpoint. |
| S5 | The same entries run in a small repository. | Preserve results and avoid an optimization that shifts material unnecessary work to the common case. |

## 4. Requirements

- **R1 — Remove repeated work.** Investigate the current native entry and its direct identity consumers. Reduce repeated Git subprocess discovery on the supported normal topology. Record command families and call sources, not only elapsed time.
- **R2 — Preserve correctness.** Preserve current-session and explicit-Task identity, TaskId/generation, unique checkout, registered-root/common-dir validation, stale/conflict refusals, Git-free behavior and the precise prunable-with-absent-Git-entry rule. Do not repair peer metadata or weaken errors to obtain speed.
- **R3 — Bounded real validation.** Keep actual installed contract/context validation. Remove the cause of the budget mismatch first. A finite budget adjustment requires measured evidence and an explicit reason; PATH changes, skipped probes and unlimited waits cannot satisfy this requirement.
- **R4 — Same operation.** Preserve the original operation ID, recovery reference, frozen plan, candidate/source rules, preimages and later-work checks through public apply/recover/resume. No new prepare, second operation, source substitution or checkpoint editing may masquerade as recovery.
- **R5 — Necessary diagnostics.** Report only the stage, outcome, finite budget/elapsed time and necessary call-count/source facts. Do not expose environment/configuration dumps, secrets or raw sensitive output. Keep the original failure record when a later recovery succeeds.
- **R6 — Distribution and compatibility.** Keep shipped Python and Fork dogfood bytes equal. Preserve public signatures, schemas, persisted session/binding/operation formats and result meaning. Verify the actual built/installed candidate; source behavior alone does not establish downstream adoption.

## 5. Acceptance criteria

| ID | Requirements | Proof to collect after activation |
| --- | --- | --- |
| AC1 | R1, R2, R3 | Before/after native `runtime-contract --json` runs on equivalent real Git topologies at small scale and about 169 worktrees, with the same interpreter/Git selection and identity modes. Record elapsed time, Git command families, call sources and correct output/refusals. Demonstrate fewer repeated calls and public tools validation within its retained or explicitly justified finite budget. |
| AC2 | R2 | Reuse applicable cross-worktree/session regressions and cover actual affected stale generation, missing branch binding/checkout, ambiguity, corrupt/foreign Git and prunable conditions. Verify no peer/session/Task changes from reads. New negative cases must represent ordinary supported errors. |
| AC3 | R3, R4, R5 | Run public tools apply and recover/resume against the same original reference; prove target-native validation and operation/preimage continuity. Preserve the historical timeout record and any current failure. If reproducing a real timeout requires an unavailable original fixture/source, state the exact missing evidence rather than injecting sleep or modifying state. |
| AC4 | R6 | Run targeted CLI tests, Python compatibility/static checks, template/dogfood parity, and one matching CLI/Core packed installation with native output and same-ref recovery. Report platform and source/installed boundaries separately. |
| AC5 | R5, R6 | Review safe diagnostics and durable spec changes. Record the eventual fixed source/build identities for the downstream owner without claiming Guru adoption, full multi-platform compatibility or #814 Completion. |

## 6. Exclusions and open decisions

No hostile inputs, forged artifacts, stress/concurrency/locking, crash/fault-injection matrix, new resolver service, persistent performance cache, telemetry framework, authorization storage or audit ledger. No modification of Guru installation copies, unrelated tasks, shared workspace journals, global packages or `node_modules` source. No automatic Issue, chat, release or cleanup creation.

The requested behavior has no unresolved product choice. The exact subprocess grouping and need for any tools budget change are technical decisions owned by the design and measured implementation. A change to identity semantics, persistence, source migration or recovery authority must return to planning before implementation.

## 7. Current status

Implementation and local validation are recorded in `research/validation-results.md`.
This Task remains `in_progress`. No committed source lock, remote CI, PR, merge,
downstream adoption or #814 Completion is established by these local results.
