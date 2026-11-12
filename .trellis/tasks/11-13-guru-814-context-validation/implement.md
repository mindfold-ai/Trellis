# Execution plan: Fork prerequisite for Guru #814

## 1. Execution state and policy

Task: `guru-814-context-validation`, generation 0. Branch: `codex/guru-814-context-validation`. Fixed development base: `aa898d090fc27c9ce6145cfa3c787a6f400da4e2`; eventual PR target: `main`.

Task status is **in_progress**. The implementation and local validation results
are recorded in `research/validation-results.md`. This Task uses the Fork's
retained native workflow; do not migrate it into Delivery mode. Local checks do
not establish commit, publication, merge or downstream acceptance.

This is one bounded Fork prerequisite. Preserve all unrelated checkouts/tasks/sessions, the Guru #814 checkout, global packages and shared journals. Do not create another Issue or chat. Do not contact other chats. Commit, push, PR, merge and cleanup retain their separate exact side-effect boundaries. Always stop before merge for coordinator review. No Release or version publication is in scope.

## 2. Context and investigation

1. Resolve this exact Task with native `task.py current --source` and read the sole continuation. Confirm branch, base and clean/dirty paths before writing. Never choose a Task from inventory.
2. Read the curated `implement.jsonl`/`check.jsonl`, all three planning bodies and `research/context-performance.md`. Read the applicable sections of the referenced specs before editing their source area. Read the actual existing source/test files before modification.
3. Inspect dependencies without borrowing another checkout's generated code. This new worktree currently has no `node_modules`. Available tools at planning time are Node `v26.13.0`, pnpm `10.32.1`, Python `3.12.8` and Git `2.54.0`; these facts do not prove minimum-Python or cross-platform compatibility.
4. After activation, use `pnpm install --frozen-lockfile` in this worktree if dependencies are still absent. Preserve the lockfile; report actual dependency/build failures. Do not copy another worktree's `dist`, hand-edit installed packages or change PATH as the fix.

Context validation accepts 11 real entries in each manifest. It warns that `script-conventions.md`, `commands-maintain.md` and `quality-guidelines.md` exceed the 32768-byte per-file injection cap. Keep the original spec locators. At dispatch, explicitly require the child to read necessary complete sections from disk in bounded consecutive ranges when injection is truncated; do not treat a truncated prefix as the complete contract or enlarge project-wide limits for this Task.

## 3. Directed before evidence

Before changing production source, build a Task-owned temporary real Git fixture with one primary and 168 linked registrations, including an ordinary space-containing path. Use a small primary-plus-linked fixture as a comparison. Keep the data minimal, with actual installed script files and matching synthetic workflow/Task/session facts written by supported fixture setup. No peer in the user's real repository is a benchmark mutation target.

Use the same topology, executable selections and session shapes for before/after. Exercise known-key miss, a bound remote-checkout Task and a real explicit Task selection. Run the actual native entry with its reported flags. Observe actual subprocesses using a temporary Python audit hook or equivalent direct instrumentation, without fake Git/Python or a PATH shim. Capture complete output before decoding and preserve command exit statuses.

Record safe baseline results under this Task's `research/`: source commit/tree or candidate identity, fixture cardinality, mode/identity shape, executable versions, elapsed time and Git command/call-source counts, and actual output/refusal. Keep original failed samples; do not relabel the historical 509-call report or earlier 353-call observation as this controlled before run. No fixed percentage improvement or arbitrary time target is added; the existing public 10-second limits and correct behavior are the acceptance boundary.

## 4. Implementation and engineering checks

After the approved plan is activated, dispatch `trellis-implement` with `Active task: <exact Task path>` first. It owns only the approved source/test changes and their necessary dogfood twins. It must implement directly, not recursively dispatch implement/check. Native Codex context injection is preferred; missing/truncated injection requires child-side full loading. Workers are not alone in the repository and must preserve others' changes.

Ordered work:

1. Implement the combined identity read and resolution-local reuse in existing `session_storage.py`. Retain all eligible-peer validation and exact prunable/Git-free conditions. Mirror changes byte-for-byte to the Fork dogfood tree.
2. Retain already observed branch topology, narrow the bound branch candidates, require uniqueness and independently verify the chosen live branch. Preserve supported errors. If equivalence fails, stop that change for design review.
3. Add only necessary safe probe diagnostics in `maintenance/tools.ts`; preserve public error/result shape and both 10000 ms probe budgets. Do not modify `shared.ts` recovery or any Core schema merely to ease testing.
4. Extend existing behavior tests for missing coverage. Use ordinary supported stale/mismatch inputs. Assert actual selected key/workflow and unchanged relevant Task/session/peer bytes, not only return code. Keep wall-clock comparisons in directed evidence; do not add brittle universal timing unit tests.
5. Rerun the directed topology, then public tools validation. If the optimized supported path cannot meet its finite budget with useful margin, report the remaining cause and return to planning before extending the budget or changing authority.
6. Update the actual spec sections for observation lifetime and any diagnostic change. Do not copy current source conclusions into unrelated historical evidence.

## 5. Targeted validation commands

From the Fork worktree, after dependencies and implementation are ready:

```sh
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis exec vitest run test/scripts/cross-worktree-session.integration.test.ts test/templates/cross-worktree-session.test.ts test/scripts/delivery-prunable-worktree.integration.test.ts test/commands/maintenance-tools.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm build
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
git diff --check
```

The implementer supplies the actual Task-local benchmark command when creating the harness, verifies it with the existing flags and records it alongside the results. It must run on controlled normal fixtures, not fabricate a timeout by sleeping, modifying checkpoints, or falsifying a candidate. Reuse the repository's Python 3.9 compile gate with an actual 3.9 interpreter if available; otherwise report that exact local gap and require the existing CI gate rather than claiming 3.12 proves 3.9.

Existing tests cover generation/identity conflicts, Guru binding loss and malformed binding, corrupt/foreign worktrees, prunable residuals and non-Git behavior. Retain those tests and add only gaps affected by the optimization. New tests must use the original real entry and relevant flag combination.

## 6. Public tools and packed-pair proof

Build Core before CLI. Follow the repository's documented pack/install procedure to install one matching CLI/Core pair in a temporary consumer with normal workspace dependency rewriting. Record actual package/source identities. Do not republish a package or tag.

Prepare one public tools operation against that fixed pair. Capture its frozen original plan and real recovery ref. Run apply, output-loss recovery, recover and resume through the public maintenance bin/SDK. Assert unchanged operation ID/ref and preimages, correct target-native contract/context, and preserved Task/session/peer bytes. Preserve candidate/interpreter/later-edit refusals from existing coverage.

If the outer tool yields a process handle, wait on that original handle; do not start another executor while it runs. If an actual native timeout occurs, preserve the failure and inspect/recover the same ref after executor termination. A changed candidate must still fail with `candidate_mismatch`. Do not edit the checkpoint, swap in a repaired package, or call prepare again to claim historical recovery.

If no natural internal timeout occurs, report that result and prove the same-ref normal recovery separately. The historical failure remains historical; it is not a current observed recovery. A still-pending downstream historical ref, if one is later selected, belongs to its original owner and may require a separate compatibility decision. This Task does not add a cross-candidate recovery adapter.

## 7. Review and stopping conditions

After implementation and engineering evidence, dispatch the Fork's `trellis-check` subagent with this exact Task and full actual diff. It must review the complete approved scope, actual test effectiveness, template/dogfood parity and affected consumers. Spec/type/lint failures within scope return to their original implementation owner; unsupported scope expansion returns to planning before edits or new tests.

Stop optional testing once the explicit requirements and concrete remaining risks have sufficient evidence. This ordinary fix does not inherit a full platform/install/upgrade/Release matrix. Do not add hostile-input, lock, race, crash or fault-injection hardening.

Before any future commit, review spec integration, complete staged/unstaged/untracked content and the exact commit plan under native Phase 3.4. Show precise paths/messages and obtain that operation's confirmation. No commit/push/PR/merge/archive is performed during this planning segment. A future fixed Fork commit/CI/build identity is the downstream adoption input; it is not Guru #814 acceptance or Completion.

## 8. Current evidence boundary

Implementation, controlled before/after samples, engineering checks, a matching
packed CLI/Core installation and normal same-reference recovery are recorded in
`research/validation-results.md`. No natural internal timeout was reproduced.
Remote CI, committed Fork source lock and downstream Guru adoption remain pending.
