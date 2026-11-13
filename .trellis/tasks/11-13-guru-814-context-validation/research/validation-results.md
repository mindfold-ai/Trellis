# Fork prerequisite validation and proposed commit

## Result and source boundary

Local quality Check passed for this bounded Fork prerequisite. The Task remains
`in_progress`; the checkout has no new commit or staged files.

- Repository: `castbox/Trellis`.
- Checkout: `Trellis-worktrees/guru-814-context-validation`.
- Branch: `codex/guru-814-context-validation`; eventual PR base: `main`.
- Fixed base and current HEAD: `aa898d090fc27c9ce6145cfa3c787a6f400da4e2`.
- Source relation: `castbox/guru-trellis#814`, `reference_only`.
- Runtime: retained undeclared native workflow with the original legacy Task.
  Check did not create a Delivery or record a lifecycle result.

The original Guru checkout and the Fork main working checkout remain clean at
their original heads. No commit, push, PR, merge, tag, publication, downstream
installation or Task archive occurred.

## Implementation

The shipped and dogfood `session_storage.py` combine toplevel/common-dir queries
and reuse checked observations within one `RepositoryFacts` instance. Every
eligible peer is still validated. The exact prunable exception remains intact.
Bound checkout lookup uses the existing branch topology, requires uniqueness and
independently verifies the selected live branch. No global or disk cache was
added.

`maintenance/tools.ts` retains both actual native probes and their 10000 ms
budgets. Failure messages identify the failed probe and outcome without echoing
native stderr. Public schemas, persisted state and original-operation recovery
rules are unchanged. Two existing test files add directed regressions; two
durable spec sections document the affected contracts.

## Controlled measurements

See `measurement-results.md`, `before.json` and `after.json` for the method,
command families, call sources, exact entry flags and output assertions.

| Worktrees | Entry | Git calls before → after | Seconds before → after |
| --- | --- | ---: | ---: |
| 2 | Known key miss | 9 → 3 | 0.2196 → 0.1832 |
| 2 | Bound remote Task | 11 → 4 | 0.2396 → 0.1763 |
| 2 | Explicit Task | 25 → 10 | 0.3494 → 0.2348 |
| 169 | Known key miss | 343 → 170 | 3.5817 → 1.7617 |
| 169 | Bound remote Task | 512 → 171 | 5.0813 → 1.9304 |
| 169 | Explicit Task | 526 → 177 | 5.6587 → 1.8981 |

The final runtime samples returned the expected invocation or selected-workspace
owner. Task/session/peer bytes and modes were unchanged. The 169-worktree bound
sample retained 169 workspace identity calls, one topology call and one selected
branch call. These are local controlled samples, not universal latency bounds.

## Engineering and independent Check

| Check | Result |
| --- | --- |
| Frozen dependency install | `pnpm install --frozen-lockfile`: pass; lockfile unchanged. |
| Lint | `pnpm lint`: pass; independently repeated by Check. |
| TypeScript | `pnpm typecheck`: pass; Check repeated Core/CLI checks without rebuilding. |
| Python types | `pnpm --filter @mindfoldhq/trellis lint:py`: 0 errors, 48 existing warnings in unchanged files. |
| Minimum Python | Actual Python 3.9.6 compiled all 121 tracked Python files; directed native measurements and installed maintenance used Python 3.9.6. |
| Targeted behavior | Four planned Vitest files: 68/68 passed in the independent final Check run. |
| Build | `pnpm build`: pass, Core before CLI. |
| Pair manifest | `verify-packed-cli`: pass; packed CLI pins the exact paired Core version. |
| Script distribution | Complete shipped/dogfood script-tree parity: pass. |
| Diff formatting | `git diff --check`: pass. |
| Semantic Check | No actionable findings in accepted scope; no Check self-fixes. |

The four Vitest files cover cross-worktree session and hook identity, prunable
registrations and tools maintenance. New assertions cover observation lifetime,
fresh peer errors, nested/unborn roots, normalized aliases, branch ambiguity,
selected live-branch querying and safe failure diagnostics. Existing generation,
binding, corrupt/foreign, Git-free, session-isolation, candidate and later-work
refusals remain in use. Earlier fixture escaping and expected-message errors
were corrected before the final 68-test pass; they were not product failures.

## Installed public tools proof

One fixed local CLI/Core pair at `0.7.0-castbox.6` was packed and installed into a
private prefix. The installed CLI resolves the paired Core and declares its
exact version. The tarball/installed comparison verified all **1021 files**:
278 Core files and 743 CLI files, with no byte, mode or inventory mismatch.
The portable package summary is `packed-bytes.json`.

| Package | Tarball SHA-256 |
| --- | --- |
| Core | `6528f26f23dc78763737fff28f12d80900b2ffe56558598b4b4a0469048044de` |
| CLI | `d59a3725348d95a8969ce59eccbf201c68536120758f3abafb8294857a5d8ba4` |

The final proof invoked fresh installed public-bin processes for prepare,
preview, apply, recover and resume on the real 169-worktree fixture. It prepared
one executed operation and retained its original ref, plan, candidate and
preimages throughout. Apply took 2364 ms, recover 2213 ms and resume 2225 ms.
Each returned `applied` with no pending paths. Both retained native probes ran
during postvalidation. Separate installed native calls confirmed API/schema,
the selected linked-workspace workflow owner and the selected Task. All peer
files, shared controls and relevant Task data were preserved.

The first harness attempt stopped while receiving the large prepare JSON with
its default stdout buffer. It did not execute apply or create an executor
recovery record. Its original raw report and concise failure summary remain
private. After increasing only the Task harness capture buffer, the final proof
used the same installed pair successfully. This harness failure was not a native
timeout or a recovered failed apply.

Private fixture paths, operation refs and complete file inventory remain under
ignored runtime or temporary proof directories. They are not tracked handoff
fields. The reusable scripts are `measure-context.py` and
`verify-packed-tools.mjs`; the latter accepts the installed prefix, ignored
fixture mapping and a new private output path.

The final package-source diff SHA-256 is
`1064eb46aee5400bfc14ee34e2ec25e5524c227f506b14a5a98af5a78272edee`.
The production-only package diff SHA-256 is
`878562631c491e4da410e86db3200cdf26147928c7c468ced529cdcdabde816b`.
Production inputs were unchanged between build/pack and the final source check.
Only a test assertion changed after the first source snapshot; tests are absent
from the packed package. These identities describe dirty local source and local
tarballs. They do not establish a committed Fork source lock.

## Unverified boundaries

No natural internal timeout occurred in either controlled before/after samples
or the installed proof. The historical #793 timeout and recovery remain
historical evidence. This result proves normal same-candidate recovery and does
not add cross-candidate recovery.

Remote CI, Node 20 execution, Windows/Linux runtime behavior, full platform,
upgrade/update and release matrices were not run. This ordinary targeted fix
does not claim those gates. Guru's source-lock adoption, installed tools update,
independent downstream acceptance and #814 Completion remain with the downstream
owner after an eventual fixed Fork commit/CI result.

## Exact proposed commit scope

Proposed message: `fix(cli): reduce worktree identity discovery cost`.

The proposed commit contains exactly these seven existing tracked paths:

```text
.trellis/scripts/common/session_storage.py
.trellis/spec/cli/backend/commands-maintain.md
.trellis/spec/cli/backend/task-lifecycle.md
packages/cli/src/commands/maintenance/tools.ts
packages/cli/src/templates/trellis/scripts/common/session_storage.py
packages/cli/test/commands/maintenance-tools.integration.test.ts
packages/cli/test/scripts/cross-worktree-session.integration.test.ts
```

It also contains these new files below
`.trellis/tasks/11-13-guru-814-context-validation/`:

```text
task.json
prd.md
design.md
implement.md
implement.jsonl
check.jsonl
research/context-performance.md
research/packed-pair-procedure.md
research/measure-context.py
research/verify-packed-tools.mjs
research/before.json
research/after-initial.json
research/after.json
research/measurement-results.md
research/packed-bytes.json
research/validation-results.md
```

At a later commit step, stage only the listed paths, inspect the complete staged
diff, then create one local commit with the proposed message. No push, PR,
Issue-closing trailer, merge, archive or downstream source-lock write is included
in that operation. No command from this proposed step has been executed.

Proposed commands from the exact Fork checkout, after rereading the path inventory:

```sh
git add -- \
  .trellis/scripts/common/session_storage.py \
  .trellis/spec/cli/backend/commands-maintain.md \
  .trellis/spec/cli/backend/task-lifecycle.md \
  packages/cli/src/commands/maintenance/tools.ts \
  packages/cli/src/templates/trellis/scripts/common/session_storage.py \
  packages/cli/test/commands/maintenance-tools.integration.test.ts \
  packages/cli/test/scripts/cross-worktree-session.integration.test.ts \
  .trellis/tasks/11-13-guru-814-context-validation/{task.json,prd.md,design.md,implement.md,implement.jsonl,check.jsonl} \
  .trellis/tasks/11-13-guru-814-context-validation/research/{context-performance.md,packed-pair-procedure.md,measure-context.py,verify-packed-tools.mjs,before.json,after-initial.json,after.json,measurement-results.md,packed-bytes.json,validation-results.md}
git diff --cached --check
git diff --cached
git commit -m 'fix(cli): reduce worktree identity discovery cost'
```
