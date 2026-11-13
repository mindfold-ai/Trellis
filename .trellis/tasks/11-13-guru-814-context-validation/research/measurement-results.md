# Controlled native context measurements

## Method and source

Run from this Fork Task checkout:

```sh
/usr/bin/python3 .trellis/tasks/11-13-guru-814-context-validation/research/measure-context.py setup
/usr/bin/python3 .trellis/tasks/11-13-guru-814-context-validation/research/measure-context.py before
# Implement the approved source changes, then reuse the same fixtures.
/usr/bin/python3 .trellis/tasks/11-13-guru-814-context-validation/research/measure-context.py after
```

`setup` creates isolated temporary real Git repositories containing 2 and 169
registered worktrees. Both include ordinary spaces in paths. All eligible peers
have `.trellis`; the primary and selected linked checkout contain genuine native
scripts. The bundled `workflow-delivery-v1.md` provides the declaration. Distinct
valid `task_scope` owners distinguish invocation and selected workspace output.
Actual `task.py create --schema-version 2.0 --no-start` and `task.py start` create
and select the Task. The canonical five-field branch binding points at the real
selected branch. No lifecycle checkpoint is rewritten.

The runtime samples invoke the actual `get_context.py --mode runtime-contract
--json` entry through `runpy`, with a Python audit hook observing real Git child
processes. Explicit selection invokes actual `task.py start <absolute Task>`.
No fake executable, PATH shim, skipped peer validation or artificial delay is
used. Audit stack collection adds local measurement overhead to both versions.
The selected runtime reports Python 3.9.6 and Git 2.54.0 (Apple Git-157).

The complete `before.json` was captured before any production edit, at
`aa898d090fc27c9ce6145cfa3c787a6f400da4e2`. The initial optimized sample is retained
as `after-initial.json`. `after.json` captures final source bytes and additionally
asserts unchanged Task/session/peer bytes and modes around every measured entry.
Snapshot collection occurs outside the timed interval. Each JSON retains exit,
stdout, stderr, command families, call sources and the session-storage source
SHA-256. The ignored
`.trellis/.runtime/guru-814-context-validation/fixture.json` locates the retained
temporary fixtures for packed-pair verification. This local mapping is private
reproduction data, not a tracked handoff.

## Results

| Worktrees | Entry shape | Before Git calls | After Git calls | Before seconds | After seconds |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 | Known key miss | 9 | 3 | 0.2196 | 0.1832 |
| 2 | Remote Task with branch binding | 11 | 4 | 0.2396 | 0.1763 |
| 2 | Explicit Task selection | 25 | 10 | 0.3494 | 0.2348 |
| 169 | Known key miss | 343 | 170 | 3.5817 | 1.7617 |
| 169 | Remote Task with branch binding | 512 | 171 | 5.0813 | 1.9304 |
| 169 | Explicit Task selection | 526 | 177 | 5.6587 | 1.8981 |

Every entry returned exit 0. Runtime output selected the expected invocation
owner on key miss and the expected linked owner for a bound Task. Final samples
preserved the observed Task/session/peer files and modes. Each 169-worktree
runtime sample after the fix still made 169 combined workspace-identity queries
and one complete worktree-list query. The bound sample independently verified
its selected branch once. Explicit selection preserves three independent facts
contexts, hence three lists and 173 identity queries rather than a command-wide
or persistent cache.

The final session-storage SHA-256 is
`382a9e7cd2076f2fc38fca9c32e3e204f79bc185b754f590d181211bb48e5ecf`.
The original session-storage SHA-256 was
`07e0b45aff78a42217dedfecd5ea3af952b0b1b35797af539c64d0b04b26077b`.

## Interpretation and limits

The counts demonstrate removal of repeated process work while keeping all
eligible peers in validation. The local elapsed results leave margin inside the
unchanged 10000 ms context probe budget. They are single controlled samples,
not a universal latency guarantee. No natural internal timeout occurred before
or after; this does not reproduce or recover the historical #793 timeout.

The historical approximately 509-call/12-second Issue report and the parent's
separate 353-call/4.011-second Guru audit remain separate observations. Public
packed-pair installation, actual tools postvalidation and same-ref recovery are
owned by the parent's separate verification. This source benchmark alone does
not establish those results, downstream Guru adoption or #814 Completion.

## Engineering checks

- `pnpm --filter @mindfoldhq/trellis-core build`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm typecheck`: exit 0; includes a fresh Core build.
- `pnpm --filter @mindfoldhq/trellis lint:py`: exit 0, 0 errors and 48
  pre-existing unused-import warnings in unchanged `__init__.py` and
  `git_context.py` files.
- The real `/usr/bin/python3` (3.9.6) compiled all 121 tracked Python files
  from `git ls-files -z --recurse-submodules '*.py'`, using a temporary cache.
- `diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x
  __pycache__`: exit 0, no differences.
- `git diff --check`: exit 0.

The four planned Vitest files contain 68 tests after this change. The final
four-file round passed the 27 session tests, 15 hook tests and 8 prunable tests.
Its only failure was the new diagnostic test's expected message omitting the
existing `incomplete_operation:` prefix. After correcting only that assertion,
the full maintenance-tools file passed all 18 tests. An earlier new test also
failed because its embedded Python fixture needed a second string escape; that
fixture syntax was corrected and all 27 session tests subsequently passed.
Neither fixture/assertion failure was a product timeout or an identity defect.

The final assertions cover per-resolution reuse with fresh detection of a broken
peer on the next resolution, normalized symlink roots, nested project suffixes,
unborn repositories, bound-branch ambiguity and one real selected-branch query.
The diagnostic test uses a genuinely broken fixture Git entry, asserts the exact
safe `incomplete_operation` message and proves validation does not modify target
files. Existing stale/generation, missing binding, corrupt/foreign, prunable,
Git-free, session isolation and original-operation tests remain in use.

The parent owns the final full build, packed CLI/Core pair and independent
Check. No commit, push, PR, version change or downstream installation was made
by this implementer. No global package, installed package source or real peer
workspace was modified by the measurement fixtures.
