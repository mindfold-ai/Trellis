# Local Verification and Delivery Evidence

## Identity and Scope

Date: 2026-09-14, Asia/Shanghai. Repository: castbox/Trellis.
Base HEAD and rechecked remote main:
f08ed655d800e6580e5fe950308ac1edfe74b10e.
Branch: codex/fix-cross-worktree-session-binding.
Checkout: /Users/wumengye/Documents/GoProjects/Trellis-session-binding-repro.

Results bind the implemented working-tree source, not an already-created commit.
No source-repository commit, push, PR or merge has been executed. The proposed
file set is commit-files.txt; it excludes the separate reproduction fixture,
all session runtime state, node_modules, dist, package metadata and submodules.
The index was empty before evidence preparation.

Commit preflight: core.hooksPath is .husky/_, but this repair checkout has no
.husky/_/pre-commit launcher (dependencies were installed with --ignore-scripts).
The tracked .husky/pre-commit would otherwise run lint-staged, submodule update
and pnpm test. No hook configuration was changed or hook disabled by this task;
normal git commit will honor the existing setup, and the checks above were run
explicitly. Installing hook launchers or additional hook side effects is not
part of the proposed commit operation.

## Environment and Build

- Node: v26.8.2; pnpm: 10.32.1.
- Node-spawned python3: /Library/Frameworks/Python.framework/Versions/3.12/bin/python3,
  Python 3.12.8. Node-spawned python also reported 3.12.8.
- The interactive shell's python3 reported 3.14.7 from /opt/homebrew/bin/python3.
  Do not confuse this shell probe with the interpreter selected by test children.
- Dependency command: pnpm install --frozen-lockfile --ignore-scripts, exit 0;
  249 packages reused, 0 downloaded. Lifecycle installation scripts disabled.
- pnpm build: exit 0; core then CLI TypeScript build and template copy completed.
- marketplace initialized with git submodule update --init --checkout marketplace
  at recorded gitlink 7d5298d16e07c328c09493eed1f0652571744b17. No gitlink change.
  docs-site was not initialized for this task.

## Final Local Checks

| Command | Result |
| --- | --- |
| pnpm --filter @mindfoldhq/trellis test | Exit 0; 99 files, 2275 tests passed; final run started 19:12:24, duration 53.15s |
| pnpm --filter @mindfoldhq/trellis-core test | Exit 0; 22 files, 422 passed, 1 skipped; run started 19:07:11 |
| pnpm --filter @mindfoldhq/trellis typecheck | Exit 0 |
| pnpm --filter @mindfoldhq/trellis-core typecheck | Exit 0 |
| pnpm lint | Exit 0 |
| pnpm --filter @mindfoldhq/trellis lint:py | Exit 0; 0 errors, 48 unused-import warnings |
| git diff --check | Exit 0 |
| Python AST with Python 3.9 grammar | 25 changed Python files parsed; not a Python 3.9 runtime run |
| Python source/dogfood byte comparison | 9 changed pairs identical |
| Native .ts.txt template syntax parsing | Pi and OMP parsed successfully |

The last two edits before the final CLI rerun touched only OMP and Snow tests;
their ESLint checks passed. Product source and build inputs were unchanged from
the successful build, type/lint checks and Core run above.
The single Core skip is the explicit no-Python placeholder test in
sqlite-readonly.test.ts; the actual SQLite cases ran with Python available.

The CLI suite includes source resolver/CLI lifecycle tests, actual stdin hooks,
OpenCode message transforms, Pi/OMP callback fixtures, and built-CLI fresh and
legacy-storage installation/repeated-update smoke. New Git tests use real
temporary repositories/worktrees, including same-name tasks, multiple sessions,
separate repositories, unregister-with-readable-task, corrupt/unknown-schema
records, supported task symlinks, missing Git discovery, non-Git storage,
archive/rename/finish, lifecycle hook cwd and task-relative context contents.
Updated historical tests continue checking forbidden IO and byte preservation.

## Failure History and Reviews

- Original main manually reproduced the same context key resolving only from
  the linked task checkout; primary returned no_task. See reproduction.md.
- Initial targeted run: 24 passed / 3 failed. Fixed missing installation map
  registration for session_storage.py and fixture shell quoting. Then 27/27 passed.
- Initial full CLI run: 2181 passed / 46 failed. Fixed missed Pi/OMP .ts.txt
  consumers, text/prelude workspace identity, OpenCode empty metadata validation,
  type/lint errors, invalid fixtures and obsolete silent-error expectations;
  initialized the missing marketplace test dependency with separate approval.
- Subsequent CLI runs: 2243/13, then 2273/2. Fixed Pi/OMP status inference and OMP
  bounded-context workspace disclosure, then corrected two fixture/diagnostic
  assertions without changing product logic. Final CLI result: 2275/0.
- Independent read-only reviews found the native-adapter/prelude/metadata gaps
  and later the two status/path-base defects. They were addressed. The final
  bounded review reported no actionable findings in those repaired surfaces.
  Review is not a substitute for tests, nor proof of absence of all bugs.
- No automated run of the entire new suite against an untouched pre-fix checkout
  was performed. The original manual red reproduction and subsequent failing
  integration runs are the recorded negative evidence.

## Version and Publication Boundary

Both package versions remain 0.6.17. git diff against HEAD was empty for root
package.json, both package package.json files, pnpm-lock.yaml, .gitmodules and
the marketplace gitlink.

SHA-256 of unchanged inputs:

```text
965d22c8b8799f826e5b5893f6f9a4fe814654e993894ad1a23d89cd809bf257  pnpm-lock.yaml
d633be814eb5f5a06a8bf53d9ff4c351e17fa719003db8ff5206a69396bf868d  packages/cli/package.json
2c106bc93ce7287c6cbd8528e24b9649ee97ffe311d29685be5f04bea9b2afef  packages/core/package.json
```

During evidence preparation, git ls-remote upstream refs/heads/main refs/tags/*
returned only main, with no tag refs. gh release list --repo castbox/Trellis
--limit 20 --json tagName,name,isPrerelease,publishedAt returned [].
This session ran no source tag creation, GitHub Release, npm publish, dist-tag,
release manifest or changelog creation command. Fixture-local commits from
approved tests are not source-repository commits or releases. No guru-trellis
files were changed. These statements do not audit unrelated actors' npm accounts.

## Downstream Source Build Route

No Nightly artifact/build ID was verified or published. After the independently
authorized source commit/push (and merge if required), downstream must substitute
the exact approved fix SHA for SOURCE_SHA, never use the base SHA above as the fix.
The source build and local CLI invocation used by smoke tests provide this route:

```sh
git clone https://github.com/castbox/Trellis.git trellis-source
git -C trellis-source checkout --detach "$SOURCE_SHA"
cd trellis-source
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node packages/cli/bin/trellis.js --version
```

Invoke that absolute bin path from the intended downstream project for its
separately authorized init/update procedure. Do not use npm install github: as
an assumed equivalent for this workspace monorepo. Record source SHA, lockfile
hash, Node/pnpm versions and any produced artifact hash. Version 0.6.17 alone
does not identify this unpublished fix. No clean clone of a final committed
candidate was built yet; there is no candidate or merged SHA until authorized.

## Unverified Boundaries / Remaining Gates

- Tests ran locally on macOS. Linux/Windows execution and minimum Python 3.9
  runtime execution were not performed; grammar parsing is weaker evidence.
- Platform callbacks/hooks were exercised through fixtures, not manual sessions
  in every vendor's live IDE/client. CI and final candidate clean-build proof
  remain pending.
- Read-only legacy fallback does not synchronize mixed old/new runtime writers.
  Rollback to an old runtime requires explicit rebinding, not hidden migration.
- Legacy discovery includes registered roots and the caller's nested-project
  suffix; arbitrary differently located nested Trellis projects were not covered.
- Commit, push, PR creation, CI inspection, merge and cleanup each require the
  next displayed scope and explicit approval. Preserve the reproduction worktree
  and fixture until separately authorized cleanup.
