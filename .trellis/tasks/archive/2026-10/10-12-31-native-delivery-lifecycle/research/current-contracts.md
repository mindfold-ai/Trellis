# Current contract research

Read-only evidence collected on 2026-10-12 (Asia/Shanghai). Refresh source Issues and affected contracts before implementation and each cutover. No implementation or installed lifecycle proof was produced in this planning session.

## Provenance

| Source | Observed identity | Meaning |
| --- | --- | --- |
| Trellis local HEAD and GitHub main | `5c760463680ffc10a3f26957b330c57a4b0c3ff8` | Current upstream baseline; local `main` was clean before task creation. |
| Core and CLI package.json | `0.7.0-castbox.3` | Versions in source; not proof of the globally installed CLI or published package. |
| Guru GitHub HEAD | `a653c90b064e2435bc147f1bda0e1b7ab632f797` | Same as #31's startup snapshot at this read; not a permanent implementation pin. |
| Trellis #31 | OPEN, updated `2026-10-12T08:36:24Z`, no comments | Direct Source. Snapshot in `source-issue.md`. |
| Guru #531 | OPEN, updated `2026-10-12T08:36:04Z`, no comments | Paired semantic/integration owner. |
| Guru #530 | OPEN, updated `2026-10-12T06:34:39Z`, no comments | Clean post-Reconcile candidate cannot reach first full Review; no delivered fix assumed. |
| Guru #292 | OPEN, updated `2026-10-10T13:31:55Z`, no comments | Unique Planning Author proposal; no delivered Author interface assumed. |

`task.py create` completed after identity reservation scans. The created task is `31-native-delivery-lifecycle`, generation 0, source `castbox/Trellis#31/exact_source`, status `planning`, base `main`. It is bound only to this session. The existing #23 task and historical invalid-schema tasks were not changed.

## Mandatory Guru sources read

The following paths are under `castbox/guru-trellis` at the observed SHA. Use canonical source paths when refreshing, not dogfood copies.

| Source path | Git blob | Findings |
| --- | --- | --- |
| `trellis/workflows/guru-team/workflow.md` | `7d41f0184f3d9492706f35a1f19d80f30fe7c31d` | Multi-Delivery routing, private-result recovery, pair guards, Reconcile, independent Completion/Closure/Finish/Cleanup; currently dispatches Task status and activate/resume_execution. |
| `trellis/skills/guru-team/packages/guru-review-task-delivery/SKILL.md` | `1d9fa9eb64fba02d49a68154cdcd6c24746016c6` | Sole slice readiness owner; remaining work may coexist with `ready`; Refs-only payload; no completion claim. |
| `trellis/skills/guru-team/packages/guru-publish-task-delivery/references/contract.md` | `80f0e22ba2b4d0599d23f73badd6d32b0839dbd5` | `push_content -> bind_pr -> converge_metadata -> mark_ready -> ready` is owner-private recovery state; exact postimages prevent repeated mutation. |
| `trellis/skills/guru-team/packages/guru-merge-task-delivery/SKILL.md` | `3bdda9a0b837131dda182d9a25dc685c68b9ed9b` | Expected-head merge, trailers, read-only lost-result recovery and first-parent history discovery. |
| `trellis/skills/guru-team/packages/guru-review-task-completion/SKILL.md` | `6db892da42d7c12b07218fb020b27926251b8fd9` | Whole accepted scope, causal evidence, evidence_refresh and reactivation_validation; only completed enters Closure. |

Also inspected the Delivery Review and Merge reference contracts, the four public `interface.json` files, and `contracts/task-lifecycle/task-lifecycle-dtos.schema.json` (blob `09d64d6c0202b072c41126784cb6d66ccc3969fd`). Their public shapes establish the mapping examples in `design.md`; private implementation files do not define the proposed public interface.

Important: `delivery_cycle_ref` is a deterministic transport reference derived from task, reviewed HEAD and exact payload. It changes with the reviewed candidate/payload and is not a stable pre-Planning Delivery identity. The new identity cannot be an alias of it.

## Upstream consumer inventory

Precise baseline anchors are recorded in `source-anchors.md`. This is the affected surface inventory, not a list of files authorized for immediate edits.

| Surface | Current coupling / required change |
| --- | --- |
| `packages/core/src/task/{schema,records,index,phase,migration}.ts` | Required `status`, default planning, inferTaskPhase export, Task-level commit/pr_url/completedAt, preservation checks for old status; new versioned contract and explicit projection needed. |
| `packages/cli/src/utils/task-json.ts` | CLI aliases Core type/factory; must follow the same version boundary. |
| `packages/cli/src/templates/trellis/scripts/common/{io,task_store,task_utils,tasks,task_queue}.py` | Python canonical read/write, create/archive, child progress and planning queue use old shape/status. Archive writes completed; missing child currently counts as done. Both assumptions must retire. |
| `packages/cli/src/templates/trellis/scripts/task.py` | start changes planning to in_progress; current/list expose status. Session binding and formal execution must separate. |
| `common/{active_task,session_storage,session_context,git_context,workflow_phase}.py`, `get_context.py` | Session schema 2 contains TaskId/generation only; registered-worktree resolution and branch identity must survive Delivery selection. Readers remain read-only. |
| `packages/cli/src/commands/init.ts` | Bootstrap Task is created in_progress, no Delivery/gates. Bootstrap and joiner ingress need explicit adoption rather than synthetic approval. |
| `packages/cli/src/commands/{migrate,update,workflow}.ts` and template collectors | Existing migration plan 1.0 handles active tasks only and preserves archives; current-only normal update. New migration must explicitly address Delivery/session/workflow compatibility and historical archive disposition. |
| Native workflow and common `commands/{start,continue,finish-work}.md`, `skills/{brainstorm,check}.md`, agent prompts and bundled meta references | No formal standalone Delivery Review/Completion owner today. Start/continue already delegate to one workflow continuation block; preserve that ownership while replacing phase inputs. |
| Shared hooks, Codex/Copilot SessionStart, OpenCode JS SessionStart/workflow/subagent context | Read status and sometimes infer next action from artifact presence; replace with one Task/Delivery projection and active-workflow delegation. Preserve OpenCode ephemeral injection and subagent exclusion. |
| Pi/OMP extensions, Snow hooks, pull preludes, platform configurators | Audit all actual collectors and generated skill/command entries; do not assume editing shared Python reaches extension-backed paths. |
| `.trellis/scripts/`, `.trellis/workflow.md`, `.agents/skills/`, platform dogfood trees | Project projections must stay aligned with owned templates. Do not migrate unrelated Task records as a side effect of template edits. |
| `marketplace/workflows/{native,tdd,channel-driven-subagent-dispatch}/workflow.md` | Same public phases and distinct workflow methods. Marketplace is a submodule: its owner/commit boundary must be explicit before changes. |
| Core task tests; CLI script, regression, hook, template, platform, migrate/init/update/workflow tests | Preserve identity/source/path guarantees while replacing status-based expectations with semantic-result and explicit historical projections. |

Declared `AITool` union currently has 22 entries: claude-code, cursor, opencode, codex, kilo, kiro, gemini, antigravity, devin, qoder, codebuddy, copilot, droid, dsh, pi, reasonix, zcode, trae, omp, grok, kimi, snow. Inventory must be regenerated from the live registry at implementation. This is an entry/contract coverage set, not a promise to run every external host.

## Native and external supported paths

Current native finish follows code/spec verification and local commits, then archive; it does not require a GitHub PR, merge commit or Guru trailers. Git-free projects are supported by invocation-local task/session storage. A new manual/no-PR delivery result must therefore have explicit acceptance evidence and a candidate locator, without making Git mandatory.

Start and continue currently distinguish exact current session from display-only project inventory. Continue returns `no_current_task` and stops. Guru's caller consumes that return for task-free work; an injection/helper failure is not proof of no Task. Preserve these boundaries.

Guru is a confirmed external lifecycle consumer from its canonical contracts, even without an SDK import. GitHub indexed code search for `inferTaskPhase` in owner `castbox` returned no hits in this read. This does not prove absence of private, unindexed or other external SDK consumers. The public breaking-change notes and explicit API/version diagnosis remain necessary.

## Evidence limits

No new native lifecycle, migration executor, schema or API exists yet. No full suite, real install/reapply, remote Delivery, Guru integration, business-session recovery or release matrix was run. All future commands and types in the plan are proposals until implemented. #292 and #530 may change before #31 execution; refresh and reuse their actual contracts through #531 rather than freezing today's implementation or creating parallel Guru fixes.
