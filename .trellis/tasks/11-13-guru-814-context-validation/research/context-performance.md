# Research: native context performance and tools recovery

- Query: Find the smallest Fork prerequisite for Guru #814 that reduces repeated Git work while preserving current Task identity and original maintenance recovery.
- Scope: internal source and existing regression contracts; no implementation or benchmark execution.
- Date: 2026-11-13
- Baseline: `aa898d090fc27c9ce6145cfa3c787a6f400da4e2`, CLI/Core `0.7.0-castbox.6`.

## Findings

### Source and responsibility

This Task references `castbox/guru-trellis#814` as `reference_only`. It owns the Fork prerequisite, not Guru source-lock adoption, actual Guru transaction recovery, downstream acceptance, or Issue closure. The native workflow remains undeclared legacy; do not add a Delivery runtime declaration or convert this Task as part of performance work.

The historical report of 169 registered workspaces, about 509 Git processes, and a 10-second postvalidation timeout is an investigation clue. It is not a measurement of this candidate. The parent separately observed 353 Git calls and about 4.011 seconds in the Guru checkout before this Task was created. Those observations have different topology/session conditions and must remain distinct.

### Current native call graph

| Source | Behavior and consequence |
| --- | --- |
| `.trellis/scripts/get_context.py:24` | Resolves the active Task before dispatching any context mode. Phase, continuation, and runtime-contract may switch to the resolved Task workspace. This is necessary for correct workflow ownership. |
| `.trellis/scripts/common/active_task.py:586` | `resolve_active_task` resolves the actual context key and calls `repository_facts`. A known missing key never borrows another session. A contextless caller normally returns no Task; sole-session fallback is opt-in. |
| `.trellis/scripts/common/active_task.py:616` | A known key missing from common-dir storage searches obsolete checkout-local carriers through `unsupported_checkout_session_paths`. |
| `.trellis/scripts/common/session_storage.py:78` | `repository_facts` reads common-dir, toplevel, and one NUL-delimited registration list, filters only the precise prunable/absent-Git exception, then validates the invocation workspace again. |
| `.trellis/scripts/common/session_storage.py:118` | Every Git workspace validation launches separate toplevel and common-dir commands. It also checks containment, registration, nearest containing root, and `.trellis` availability. |
| `.trellis/scripts/common/session_storage.py:142` | `workspace_roots` enumerates the caller's repository-relative project suffix across all registered roots with `.trellis`, and strictly validates every eligible workspace. |
| `.trellis/scripts/common/session_storage.py:206` | Obsolete-carrier detection expands all workspace roots before checking whether each exact key file exists. A key miss therefore pays two Git processes per eligible peer. |
| `.trellis/scripts/common/session_storage.py:359` | `resolve_task_identity` expands all workspace roots first. With a binding, `_bound_task_workspace` then runs `branch --show-current` separately in every workspace before selecting one. Without a binding, native non-Guru resolution scans candidate ids and strictly reads only matching records. |
| `.trellis/scripts/common/active_task.py:685` | Explicit `task.py start` resolves the supplied path, exact immutable id/generation, and selected candidate before writing its session. It must not accept a nonlocal duplicate merely because the caller supplied a path. |

The repeated subprocess work is therefore visible in the actual native path. The exact before count must be measured under each exercised session shape. Do not infer that all modes or session shapes have the same count.

### Smallest behavior-preserving options

1. **Recommended first step: batch Git identity reads and reuse only this resolution's facts.** Read toplevel and common-dir with one Git invocation where supported by the existing Git contract. Reuse that checked observation for a repeated validation of the same physical root during the same resolver operation. Keep `workspace_roots` strict for every currently eligible workspace, including ordinary corrupt/foreign-Git refusal. Do not create a process-global, cross-command, disk, or Task cache. An explicit next operation must reread live facts.
2. **Optional local reduction for the bound branch lookup:** retain each registration's branch field from the already required porcelain read; match the binding against that complete topology, require one eligible workspace, then verify that selected workspace's actual branch and identity before returning it. This removes N independent branch processes without changing the binding schema or permitting an unverified target. Preserve duplicate/missing binding rejection and detached-worktree behavior. If implementation cannot establish equivalent error behavior for stale registration versus actual selected branch, retain the old branch probes and first measure the simpler batching change.
3. **Do not implement lazy peer skipping as the initial repair.** Checking only roots with a matching legacy carrier or selecting a bound Task before validating remaining roots would alter the current explicit `task-lifecycle.md` rejection contract. It is a larger semantic change and is not necessary to evaluate batching.
4. **Do not fast-path runtime-contract around active identity.** Its workflow can belong to another validated Task workspace. Skipping resolution would improve timing by changing the contract being tested.

A combined observation must not add a requirement that the repository has an existing HEAD: newly initialized/unborn repositories currently have valid discovery behavior. In particular, blindly adding `HEAD` to a combined `rev-parse` invocation could introduce that failure. Ordinary spaces, nested project suffixes, symlinked task roots, Git-free projects, and the existing precise prunable boundary remain applicable. Keep actual failures classified; no broad fallback to no-Task.

### Tools budget and executor state

`packages/cli/src/commands/maintenance/tools.ts:493` performs target version verification, then two real native probes. Delivery contract and context each have a fixed `spawnSync` `timeout: 10000` at lines 514 and 547. The context probe uses `--mode runtime-contract --json` only for a declared Delivery workflow; undeclared workflows run full `--json`. A known maintenance-required diagnostic is accepted only without a Python traceback.

The first repair should reduce native work and measure both normal branches before changing this budget. Keep a finite deadline. If the optimized supported 169-workspace path remains too close to 10 seconds or exceeds it, use the measured cause to select a bounded context-specific budget and document it. A generic large delay, a PATH override, a bypass of target-native probes, or the outer tool's wait duration does not fix native work. No arbitrary new timeout value is supported by this research.

`packages/cli/src/commands/maintenance/shared.ts:955` owns the original maintenance engine:

- `applyPlan` validates the candidate and plan, selects Python, saves the exact original plan with phase `applying`, then resumes it.
- `resumeOperation` validates the same stored plan and candidate, writes only still-pending source/target actions, postvalidates, and saves `applied` only after postvalidation succeeds (`:1018-1058`).
- If native postvalidation times out after all tools writes, the original ref still exists with `applying`. Original pending checks may already be empty; no new prepare is necessary.
- `recoverOperation` validates the same ref and, when target actions are complete, reruns native postvalidation before returning applied (`:984-1010`). It does not silently authorize a replacement candidate.
- Candidate identity covers executing CLI/Core source/build bytes and modes (`:296-347`, `:421`). Disposable Python bytecode is excluded. A new repaired package is a different candidate even at the same version.

**Consequential compatibility boundary:** replacing the executing CLI/Core of an old prepared transaction currently returns `candidate_mismatch`. The existing Guru frozen-source recovery profile preserves the original public pair; it does not itself migrate that public pair. A claim that a new Fork build can resume an original historical public transaction requires an explicit bounded public compatibility design and evidence. Do not edit its checkpoint, candidate fingerprint, operation id, or preimages to obtain success. For ordinary same-candidate tests, prepare once against the final fixed pair and retain that pair through apply/recover/resume. If #814 requires resuming a still-pending historical public operation using a changed pair, return that precise requirement to the original owner before implementing an adapter. Do not invent a second compatibility state machine.

### Waiting versus termination

An outer tool response containing a live process/session handle means only the caller's waiting window ended. Poll that original process until it actually exits; do not start `resume` while it still executes. A completed Node `spawnSync` timeout returns a real process error to the original executor and produces the maintenance failure after writes. The runner must record the actual exit/error and retained recovery ref. These are distinct events. Existing engine recovery can continue once executor termination is established; waiting longer cannot retroactively turn an actual ETIMEDOUT into success.

For evidence, preserve original failure output, then use the exact `recoverMaintenance`/`resumeMaintenance` ref with the original plan and candidate. Assert the same operation id/ref and unchanged preimages. A successful fresh prepare is not recovery evidence.

### Necessary diagnostic scope

Useful fields are entry/mode, eligible registration count, elapsed duration, Git command category and source call site/count, process exit/error classification, and original operation id/ref where the owner needs it. Keep body/config/environment dumps, session payloads, credentials, absolute peer inventories, and raw sensitive records out of human reports. A Python audit hook can observe real subprocesses without a PATH shim; use it only as a temporary diagnostic, not workflow authority or permanent telemetry.

## Files and reusable coverage

| File | Planned responsibility |
| --- | --- |
| `packages/cli/src/templates/trellis/scripts/common/session_storage.py` | Primary shipped identity batching and invocation-local observation change. |
| `.trellis/scripts/common/session_storage.py` | Byte-identical Fork dogfood twin. |
| `packages/cli/src/templates/trellis/scripts/common/active_task.py` and dogfood twin | Only if the minimal ownership of invocation-local observations actually needs a caller change; no routine entry rewrite. |
| `packages/cli/src/commands/maintenance/tools.ts` | Only a demonstrated budget/diagnostic gap; preserve public probes and finite waits. |
| `packages/cli/test/scripts/cross-worktree-session.integration.test.ts` | Real Git setup, exact Task/generation, key miss, explicit selection, stale binding/record, non-Git behavior, root symlink and Git-query failures. |
| `packages/cli/test/templates/cross-worktree-session.test.ts` | Real installed hook/context/continuation, current branch binding, missing/retired binding, local duplicate preference, explicit nonlocal duplicate rejection, no-key fallback isolation. |
| `packages/cli/test/scripts/delivery-prunable-worktree.integration.test.ts` | Precise prunable exception and strict corrupt/foreign Git, absent-marker, generation and Git failure regression. Reuse it; do not weaken it to permit optimization. |
| `packages/cli/test/commands/maintenance-tools.integration.test.ts` | Existing prepare/apply/recover/resume/rollback, exact candidate and interpreter freshness, real target/peer preservation, declared/undeclared workflows, sidecars. Extend one relevant combination rather than copy the suite. |
| `.trellis/spec/cli/backend/task-lifecycle.md` | Document invocation-local reuse without weakening strict remaining-workspace validation. |
| `.trellis/spec/cli/backend/commands-maintain.md` | Update only if budget/diagnostic or actual original-operation recovery semantics change. |

## Targeted validation plan

Use a fixture-owned ordinary real Git repository with 169 registered worktrees total, a lightweight committed runtime, and real `.trellis` per eligible peer. Include one normal space-containing path. Avoid reproducing the user's entire private repository. Build this topology once for the directed before/after comparison and retain the same Git executable and interpreter selection. A smaller fixture (one primary plus one linked workspace) establishes small-scale correctness. These are normal scale tests, not pressure or concurrent-race tests.

Exercise three relevant shapes on that topology:

1. A known context key with no shared or obsolete checkout-local record. Native context must report no current Task and retain peer validation.
2. A shared session bound to a Task in another registered branch with the canonical five-field Guru binding. Native runtime-contract/continuation must read the selected workspace and preserve unique identity. Do not treat a fixture semantic workflow as a live business approval.
3. The explicit Task path through native start/current or the original public explicit entry, preserving duplicate refusal. This path must not borrow another session.

Record before/after native entry elapsed time and actual Git call categories/counts. A time improvement alone does not prove validation preservation; process-count reduction plus the real identity results and unchanged failure cases supply complementary evidence. Keep timing as directed local evidence, not a universal latency guarantee. Existing broad boundary cases can supply regression evidence without adding all of them to the 169-workspace fixture.

Use the real built public `maintenance` export or `trellis maintain` bin to prepare once, apply tools, recover and resume the exact ref. Compare the original operation id/ref, target tool versions, actual target-native result, Task/session/peer bytes and rollback anchor. Add a same-operation output-loss readback case. Do not induce timeout by editing a checkpoint or installing a fake Git/Python executable. Reuse a genuinely failing before operation if it exists in a controlled supported scenario. If no natural internal timeout occurs, retain that non-reproduction and separately prove original same-ref recovery; do not claim a historical timeout recovery was observed.

Commands after implementation, from the Fork root:

```sh
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis test -- test/scripts/cross-worktree-session.integration.test.ts test/templates/cross-worktree-session.test.ts test/scripts/delivery-prunable-worktree.integration.test.ts test/commands/maintenance-tools.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm build
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
```

The scale benchmark and packed CLI/Core native proof need an explicit task-local harness/command when implemented. Existing native fixture setup in maintenance-tools tests is reusable. Use the repository's documented packing/install procedure for one matching pair; this is targeted maintenance proof and does not inherit a full Release/platform matrix.

## Related specifications and external references

The research follows native workflow Phase 1.1-1.4; Task Lifecycle session binding, Git inventory/prunable registrations, current-record and identity-only boundaries; Independent Maintenance source/target, CLI/SDK, plans/results/recovery and verification boundary; Script Conventions two-script-tree parity and internal helpers that avoid repeated reads; and unit-test conventions for test isolation and meaningful bug regression. These existing contracts determine the applicable checks above.

The source platform is Python 3.9+ with Git and Node child_process. The budget behavior is Node `spawnSync` in the actual baseline code. No external documentation or new dependency decision was required for this bounded source investigation. No claim is made about cross-OS timing, production behavior, package publication, or actual downstream recovery.

## Caveats / Not Found

- No production or test code was edited or run by this research.
- No current timing, optimized count, public installation pass, or timeout recovery pass is established here.
- The parent must resolve whether historical public transaction compatibility is part of this Fork prerequisite or remains a separately bounded original-owner dependency. Candidate mismatch must not be hidden.
- Batching alone can reduce current calls without changing peer membership. Branch-topology reuse is an additional optimization and needs equivalent selected-branch refusal tests before adoption.
- An exact finite replacement timeout is not yet justified. Measure the supported fixed candidate before selecting one.
