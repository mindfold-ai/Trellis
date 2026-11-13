# Design: native context identity observations

## 1. Baseline and ownership

This design implements R1-R6 in `prd.md` within the Fork CLI. The complete source is `aa898d090fc27c9ce6145cfa3c787a6f400da4e2`. Read `research/context-performance.md` for the actual call graph and existing tests. Planning is not an implementation, performance or installation pass.

The native entry first resolves the current session, then reads the selected workspace's workflow. `common/session_storage.py` owns objective repository and Task identity facts. `maintenance/tools.ts` owns actual installed native probes; `maintenance/shared.ts` owns the existing original-operation executor. Markdown and the caller own scope, sufficiency and recovery choices.

The retained native Task workflow has no Delivery declaration. The observed `missing_runtime_contract` is its declared legacy condition, not a reason to install Guru workflow, migrate the Task or invent a public Delivery.

## 2. Smallest behavior gap

`repository_facts` starts with separate common-dir/toplevel calls and a worktree list, then validates the invocation again. `workspace_roots` launches two identity calls for each eligible peer. Bound Task lookup launches another branch query per peer. A known context-key miss pays the peer-validation cost before finding no obsolete local record. Different call shapes therefore have different counts.

The gap is repeated process work for the same necessary facts. The design retains the facts and their error conditions. It does not introduce a mode that ignores unrelated eligible peers or bypasses active-task resolution for runtime-contract.

## 3. Proposed observation design

### 3.1 Combine identity queries

Use one Git `rev-parse` invocation to obtain toplevel and common-dir for a workspace instead of two independent invocations. Normalize returned paths with the existing path/common-dir rules and retain exact project-suffix and nearest-containing-root checks. Keep `.trellis` containment and existence validation.

Do not include a required `HEAD` argument: newly initialized/unborn repositories must retain their current discovery behavior. Keep the actual non-repository diagnostic and lexical `.git` checks before Git-free fallback. Malformed/incomplete query output remains an identity error; it is not an empty repository.

Implementation must confirm the combined flags are supported by the repository's existing Git assumptions and preserve ordinary space-containing paths and nested project roots. If a Git-version or output-format difference requires a new compatibility contract, stop and return to this design rather than silently adding a fallback.

### 3.2 Reuse within one resolution only

Keep checked observations on the current `RepositoryFacts` resolution context, with backward-compatible defaults if its internal dataclass needs additional private fields. Reuse a successful observation only for the same normalized root under that context. Repeated `workspace_roots` calls may reuse successful observations from that same context; each new `repository_facts` call creates fresh state.

Do not use a module/global cache, timestamp, disk file, Task artifact, session field or cross-command token. Do not cache a selected Task record as current authority. Writers retain their own live preconditions. Failed reads still fail immediately. This is bounded read reuse within one synchronous discovery operation, not concurrency or crash consistency work.

Every eligible peer is still validated. The existing prunable filter remains exact: a non-invocation registered root is skipped only when Git marks it prunable and its lexical `.git` entry is absent. Extant, dangling, corrupt or foreign entries retain ordinary refusal. No cleanup/prune operation runs during reads.

### 3.3 Reuse the existing branch topology

Retain branch fields from the already required complete NUL-delimited `git worktree list --porcelain -z` output. After validating all eligible peer roots, match the five-field binding's branch name against eligible registrations and require exactly one candidate. Independently query and compare the selected workspace's actual branch before returning it. Retain detached/unborn behavior for callers that do not require a matching bound branch.

This removes branch subprocesses for peers that cannot be the bound checkout. It does not make porcelain alone sufficient for selected execution authority. Missing/invalid binding, no matching branch, duplicate identity, stale generation and selected branch mismatch remain errors under their existing contracts. Keep existing error meanings and public session/binding formats.

Tests must compare the former supported success and refusal paths. If equivalence cannot be established, stop this branch-lookup change for planning review; do not substitute lazy validation. The combined-query and call-local-reuse changes remain independently investigable.

## 4. Tools validation and safe failure

Retain both real installed probes and their initial **10000 ms per-probe** limits. The declared-workflow path still invokes `get_context.py --mode runtime-contract --json`; undeclared workflow still invokes normal `--json`. Retain actual Python command/argv selection, version/contract checks and the existing supported maintenance-required handling.

Measure optimized small/169-workspace paths before changing a budget. If normal supported execution still exceeds or approaches the deadline without adequate margin, stop with the measured remaining cause and return to planning. This plan does not authorize an arbitrary timeout increase.

If a diagnostic change is needed, keep the existing public error/result shape and `incomplete_operation` meaning. A concise probe-stage/timeout-or-exit message can identify the failed observation without echoing raw native stderr, environment, configuration or peer paths. Never convert a failed probe into `applied`. No new diagnostic ledger or runtime performance recorder is introduced.

## 5. Original-operation recovery

The current engine saves the fixed plan in phase `applying` before writes and saves `applied` only after postvalidation succeeds. Recovery reads that original ref and reruns necessary validation. Resume writes only pending source/target actions. Preserve those algorithms, original preimages and later-work refusals; no new state machine is proposed.

Evidence collection distinguishes:

1. The outer caller yields a process/session handle: the executor may still run. Continue waiting on that handle until its actual exit. Do not launch a second invocation or recovery concurrently.
2. The executor returns a real timeout/error: preserve its exit and original ref, inspect the existing operation through public recovery, then resume only that original operation when its prerequisites hold.
3. The operation completed but output was lost: recover the original result/ref without preparing another operation.

One final fixed candidate is prepared once and retained through public apply/recover/resume tests. `candidate_mismatch` remains required for changed CLI/Core source/builds, even at the same version. The Guru frozen-source profile also retains the original public pair; it does not authorize substituting a new Fork candidate into an old operation.

Historical #793 had a reported successful original recovery after a temporary Git selection change. It is not an unfinished operation selected by this Fork Task. Any actual downstream historical ref must be inspected by its original owner. If it needs cross-candidate recovery, that is a concrete compatibility gap to return to planning, not permission to rewrite its checkpoint or prepare a replacement.

## 6. Files and boundaries

| File | Planned responsibility |
| --- | --- |
| `packages/cli/src/templates/trellis/scripts/common/session_storage.py` | Combined identity read, operation-local observation reuse and branch-topology consumption. |
| `.trellis/scripts/common/session_storage.py` | Byte-identical Fork dogfood twin. |
| `common/active_task.py` in both trees | Change only if call-local observation ownership requires it; preserve entry semantics. |
| `packages/cli/src/commands/maintenance/tools.ts` | Necessary concise diagnostics; retain probes and initial deadlines. |
| Existing cross-worktree, prunable and maintenance-tools test files | Add only missing behavior assertions; retain actual entry flags and ordinary refusal coverage. |
| Task-local `research/` harness and results | Directed normal-scale measurements and one matching packed-pair proof, with safe summaries. |
| `.trellis/spec/cli/backend/task-lifecycle.md` and, when needed, `commands-maintain.md` | Durable observation-lifetime and recovery/diagnostic contract updates. |

No Core API/schema change, native hook/platform routing change, upstream version bump, Guru source-lock edit or change to unrelated Task metadata is planned. New shipped Python files would require original template registration and parity, so prefer the existing owner module.

## 7. Alternatives and trade-offs

| Option | Decision and reason |
| --- | --- |
| Batched identity reads plus invocation-local reuse | Selected: reduces process startup cost while retaining peer validation. Costs a small internal observation context and lifetime rules. |
| Reuse branch topology plus selected live verification | Selected for the bound branch loop, subject to existing refusal equivalence. Avoids per-peer branch processes while still verifying selected authority. |
| Validate only the selected or carrier-bearing root | Rejected for this plan: changes current strict eligible-peer errors. |
| Fast-path runtime-contract around active identity | Rejected: could read the wrong Task workspace workflow. |
| Persistent cache or a new resolver service | Rejected: no direct requirement justifies new state, invalidation or lifecycle cost. |
| Only increase waits or change PATH | Rejected: does not eliminate repeated native work. |

## 8. Verification, adoption and residual risk

Follow the acceptance table and concrete commands in `implement.md`. Reuse existing identity refusals rather than adding a full scale-by-error matrix. Directed counts provide evidence that work was removed; correct output and refusal behavior provide independent evidence that validation was retained. Wall time is local evidence, not a universal latency guarantee.

A single matching packed CLI/Core installation exercises the public bin/SDK, installed native entry and original recovery ref. Separate source, installed and downstream results. A future committed Fork result and matching CI/build identity can be adopted through Guru's original source-lock/tools owners; this planning Task does not perform that adoption or assert #814 Completion.

Remaining technical risks are combined-query compatibility, accidental stale reuse outside its intended lifetime, binding behavior drift and environment-dependent process startup cost. The checks target those risks. See `research/validation-results.md` for completed local evidence and unverified platform, CI and downstream boundaries.
