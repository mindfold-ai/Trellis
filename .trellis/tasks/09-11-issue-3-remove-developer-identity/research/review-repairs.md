# Thorough Review Repairs

## Latest Workflow Compatibility Repair

Narrowed retirement classification so generic workspace/journal wording does
not classify unrelated package-manager commands or database diagnostics as old
Trellis behavior. Explicit historical paths, retired APIs, Trellis-specific
references and direct legacy journal-recording actions remain rejected.
No init/update routing or overwrite policy was changed.

Regression coverage verifies pnpm and SQLite instructions through re-init and
force upgrade, preserving exact custom workflow bytes and the previous ownership
receipt while advancing the version. Imported workflows also retain this content.
Positive retirement cases and mixed unrelated/retired instructions stay blocked.

Verification: targeted 3 files / 100 tests passed; root build and lint plus CLI
typecheck passed. Full tests: core 395 passed / 1 skipped, CLI 2179 passed.
No historical data, external repositories, commits or publication were changed.
Previously documented live-platform and fixed-version delivery gates remain open.

## Latest Native Adapter and Update Reminder Repairs

The confirmed runtime gaps in Pi, Snow, StatusLine and optional update reminders
are addressed without changing session protocols or introducing another store.

- Pi guards text/binary inputs, workflow, configuration, session/task metadata,
  manifests, referenced artifacts and agent definitions using the same retired
  path rules. Existing containment behavior is retained.
- Snow reuses the Python history guard before source reads, summaries, runtime
  session lookup, artifact probes and log writes. Its fail-open JSON protocol
  and normal active-source output are preserved. Test fixtures now install the
  actual common runtime helpers alongside the existing fake task.py.
- StatusLine protects its metadata reader and count probes while retaining the
  old lightweight parsing behavior, including nullable legacy task fields.
- Update reminders skip historical version/marker paths before access or
  external version probing. Historical session-key resolution failures also
  leave this optional feature inactive rather than breaking primary context.

Regression tests run actual Pi event handlers, the Snow hook, StatusLine main,
and update-reminder calls. Each source alias is tested separately, with recorded
forbidden reads, unchanged historical bytes and positive active replacements.
Snow also checks the log destination; reminder tests retain once-per-session
throttling. These are source/runtime fixtures, not live vendor-CLI validation.

Verification:

- Root build and lint: PASS; final CLI build refreshed the Python templates.
- CLI typecheck: PASS.
- Targeted Python basedpyright: 0 errors, 0 warnings.
- Full tests: core 395 passed / 1 skipped (21 files), CLI 2165 passed (96 files).
- `git diff --check`: PASS; no tracked historical workspace/archive or external
  docs-site/marketplace changes.

Pi dogfood scope note: `.pi/extensions/trellis/index.ts` already differed from
the baseline template in cwd/cache routing before this repair. Only the history
protection changes were applied there; those unrelated differences were not
overwritten. No claim of whole-file Pi source/dogfood byte parity is made.

No commit, push, publication or historical cleanup occurred. Actual Python 3.9,
other OS/vendor runtimes, OS-level filesystem observation and fixed release
delivery remain unverified. Task status remains in_progress.

## Latest Environment and Spec Discovery Repairs

The two confirmed gaps were the optional Bash env-file bridge and spec discovery.
Both reuse the shared historical-path classification; no environment format,
scope-selection rule, index schema or new scanning framework was introduced.

- SessionStart checks the actual CLAUDE_ENV_FILE destination before reading the
  last export or appending. Relative paths retain process-cwd semantics. Invalid
  historical destinations are skipped without consuming their content; normal
  last-assignment deduplication remains unchanged.
- Python package/spec discovery and shared/Codex/Copilot hook index collection
  validate roots, layers, nested directories and final indexes before probing.
  Legacy-layout detection applies the same checks. OpenCode uses its existing
  guarded path predicate for the equivalent discovery paths.
- The shared guard exposes a boolean query for skip-style discovery while its
  throwing access guard retains the existing contract. Six changed source and
  dogfood pairs were verified byte-identical.

`env-spec-history` verifies direct, aliased and relative env-file destinations,
missing/existing historical exports, unchanged historical bytes, normal
one/one/two/one export behavior, and root/child/index/nested/guides spec aliases.
Tests include external workflow backing stores, independent forbidden-access
auditing, absent historical index suggestions and positive active indexes.
Existing full SessionStart env-dedup regressions remain passing.

Final verification:

- Root build, root lint and CLI typecheck: PASS.
- Targeted Python basedpyright: 0 errors, 0 warnings.
- Full tests: core 395 passed / 1 skipped (21 files), CLI 2145 passed (95 files).
- `git diff --check`: PASS.
- Historical workspace/archive and external docs-site/marketplace have no tracked changes.

No commit, push, publication or historical cleanup occurred. Python 3.9 runtime,
other OS/vendor runtimes, OS-level filesystem observation and fixed release
delivery remain unverified. The task remains in_progress.

## Latest Framework Source Repairs

The two confirmed gaps were configuration-source and workflow-source reads.
No configuration format, workflow selection rule or parser was replaced.

- CLI channel trust validates config.yaml before existence/content access.
- OpenCode injection limits use its existing guarded byte reader.
- OMP trust, limit, skip-keyword and workflow readers reuse its historical path
  predicate through one text reader. Historical config does not enter cache
  signatures; active configuration still invalidates task-context caches.
- Python phase queries validate the workflow source before reading it.
  Shared/Codex/Copilot SessionStart summaries and per-turn breadcrumbs use the
  same path boundary. Manifest readiness reads in those hooks also reuse the
  guarded reader. Eight changed source/dogfood pairs were verified identical.

Regression evidence covers direct and external workflow stores, zero forbidden
content reads, denied historical trust configuration, default limits for
historical sources, absent historical workflow text, and positive behavior after
replacing each alias with a normal active source. OMP event tests retain active
skip-keyword behavior, workflow injection and configurable context limits.

Final verification:

- Root build, lint and CLI typecheck: PASS.
- Targeted Python basedpyright: 0 errors, 0 warnings.
- Full tests: core 395 passed / 1 skipped (21 files), CLI 2129 passed (94 files).
- `git diff --check`: PASS.
- No tracked historical workspace/archive or external docs-site/marketplace changes.

No commit, push, publication or historical cleanup occurred. Actual Python 3.9,
other OS/vendor runtimes, OS-level filesystem observation and fixed release
delivery remain unverified. Task status remains in_progress.

## Latest Shell-Ticket Producer Repair

Scope is limited to the confirmed pre-shell producer/cleanup gap. The shared
hook now uses the existing historical path guard for its ticket directory,
every cleanup candidate and the new ticket path. All cleanup candidates are
validated before any expired file is deleted. Historical storage returns a
nonzero diagnostic before writes or an allow response. The Cursor dogfood copy
is synchronized; other declaring platforms obtain the shared template normally.

`shell-ticket-history.integration` drives the real hook main function with
tool-call and shell-event payloads. It covers ticket-directory, runtime-root
and file aliases, direct/external workflow stores, missing/expired/fresh
historical targets, zero forbidden IO attempts, and preserved history bytes.
The active-path cases retain expiry cleanup, a 30-second TTL, ticket fields and
host response shapes. Existing registry-derived per-platform bridge tests pass.

Verification:

- Root build, root lint and CLI typecheck: PASS.
- Targeted Python basedpyright: 0 errors, 0 warnings.
- Final full tests: core 395 passed / 1 skipped (21 files), CLI 2114 passed (93 files).
- Shared source and Cursor hook are byte-identical.
- `git diff --check`: PASS; no tracked historical workspace/archive or external
  docs-site/marketplace changes.

No ticket schema, TTL, session-key or fallback redesign was performed. No
commit, push, publication or historical cleanup occurred. Python 3.9 runtime,
other OS/vendor runtimes, OS-level filesystem observation and fixed release
delivery remain unverified; the task stays in_progress.

## Latest Two-Finding Repairs

Scope remains the two confirmed gaps: historical session authority/storage and
OpenCode compact task counts. Session-key derivation, active-data fallback
cardinality, task schema and channel protocol are unchanged.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Session pointers consume or write history | Python validates runtime/session paths, pointer reads/writes and scanned session files. Historical task-reference targets resolve as invalid/stale regardless of existence. Archive/rename preflight the session store before task mutations. OpenCode/OMP readers apply the same history classification without changing normal fallback selection. | `session-history.integration` audits file/directory/runtime aliases with missing and different historical values, direct/external workflow roots, start/current/finish and archive/rename, clear/repoint, unchanged history and task bytes. Normal lifecycle and zero/one/two-session fallback cases pass. OpenCode/OMP tests cover keyed and fallback readers, stable stale refs and active recovery. |
| OpenCode counts historical metadata | Validate the tasks root and final metadata paths before directory enumeration/existence-based counting. Use the existing shared predicate through TrellisContext. | `session-runtime-history` fixes active files and links while varying historical target absence/content; the active count stays constant. A historical tasks-root alias is never enumerated. |

Final verification:

- Root build: PASS; CLI build rerun after the final Python lifecycle preflight.
- Root lint: PASS; final changed test files also passed scoped ESLint.
- CLI `tsc --noEmit`: PASS.
- Targeted Python basedpyright: 0 errors, 0 warnings.
- Final `pnpm test`: core 395 passed / 1 skipped (21 files), CLI 2106 passed (92 files).
- Source/dogfood parity is preserved for Python and standalone platform readers.
- `git diff --check`: PASS; historical workspace/archive and external
  docs-site/marketplace have no tracked changes.

Two partial OpenCode test contexts now use/extend the real TrellisContext so
the new guard is exercised rather than stubbed out. Type checking caught a
temporary helper/local-variable name collision during lifecycle preflight work;
it was corrected before the final passing checks. No failure is included in
the passing counts above.

No commit, push, publication, downstream modification or historical cleanup
occurred. Python 3.9 runtime, other OS/vendor runtimes, OS-level filesystem
observation and fixed release delivery remain unverified gates. Task status
remains in_progress.

## Latest Three-Finding Repairs

Only the three confirmed findings and their existing call paths were changed.
No channel protocol, task schema, publication, historical cleanup or downstream
modification is included.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Platform hooks bypass task metadata protection | Shared/Codex/Copilot Python hooks and workflow-state reuse load_task. Compact counts forward the explicit project root. OpenCode reads task metadata and status manifests through its guarded reader; OMP validates the final task.json path. Active dogfood copies are synchronized. | Historical context tests audit actual file accesses, reject historical titles/statuses and retain positive active-task output, including external Python workflow storage. OMP has a metadata-alias regression with a positive task document. |
| Historical ablation recovery storage | The shared recovery-root preflight rejects retired lexical/resolved roots. Derived transaction, state, backup and lock paths are also checked before access. | Utility tests cover all retired root names, external-root aliases, missing descendants and transaction-file aliases. Command tests verify ablate/restore perform no mkdir/open and retain project receipts/history. |
| Worker starts before storage rejection | Spawn validates event, sequence and lock paths before calling runtime.start, using the existing path helpers and explicit cwd. No new compensation or runtime protocol was introduced. | Each historical leaf case asserts zero start/stop calls and unchanged history; restoring the active path allows one normal start. |

Final verification:

- `pnpm build`: PASS.
- `pnpm lint`: PASS; final test-stub edit also passed scoped ESLint.
- CLI `tsc --noEmit`: PASS.
- Targeted Python hook basedpyright: 0 errors, 0 warnings.
- Core full suite: 395 passed / 1 skipped across 21 files.
- CLI final full suite: 2087 passed across 90 files.
- Seven changed source/dogfood hook and extension pairs are byte-identical.
- `git diff --check`: PASS; historical workspace/archive and external
  docs-site/marketplace have no tracked changes.

The new access audit initially caught the compact task-count branch dropping
repo_root; that call chain was fixed rather than weakening the audit. The OMP
positive fixture was completed with a task document. Three older compact-state
tests still mocked the one-argument iterator; their stub now verifies the
forwarded project root, with the original history-isolation assertions retained.
All final counts above come from subsequent passing runs.

No commit, push, package publication or historical cleanup occurred. Actual
Python 3.9, other OS/vendor runtimes, OS-level filesystem observation and fixed
release delivery remain unverified. Task status remains in_progress.

## Latest Five-Finding Repairs

Scope is limited to the five confirmed findings and the existing call paths
needed to enforce them. No task schema or channel event protocol changes, new
identity/state store, unrelated cleanup, publication or downstream changes.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Historical task children and metadata | Validate concrete task paths before creation/force overwrite, name resolution, metadata access, rename references and archive destinations. Inventory skips protected aliases and still returns active tasks. Explicit repo roots reach shared task readers. | `task-manifest-history.integration` covers child-directory and task.json aliases, direct/external workflow stores, recorded forbidden IO, unchanged historical bytes and positive active-task output. |
| SDK cwd lost at storage boundary | Forward the existing optional cwd through core event, path, forum/context, inbox/watch and worker operations. Omitted cwd retains the process default; no persistent schema changes. | Core `retired-storage` now uses distinct process/SDK roots with an external .trellis backing store. Event/sequence/lock, send/read/forum/context/inbox/watch and worker PID cases reject history; ordinary SDK create/send/read still work. |
| Unguarded alternate config reader | `read_trellis_config` applies the same shared path guard before file reads. Pure YAML parsing stays standalone and unchanged. | The existing true/false historical config matrix also calls this reader, alongside archive/hook config getters, and records zero forbidden content reads. Existing hook/phase regressions remain passing. |
| Init enumerates a historical tasks root | Guard tasksDirEarly before its exists/readdir empty-state probe. | Init integration records no historical enumeration and preserves both history and receipt. |
| Incompatible statusLine survives update | Check a preserved statusLine command before constructing the replacement template; incompatible commands block even under force. Valid custom statusLine remains intact. | Update integration tests non-force/force rejection before settings, version, receipt or backup changes, plus compatible statusLine preservation. |

Final verification:

- Root build and lint: PASS.
- CLI `tsc --noEmit`: PASS; core compilation passed in the root build.
- Python basedpyright over dogfood scripts: 0 errors, 24 unused-export warnings.
- Core full suite: 392 passed / 1 skipped across 21 files.
- CLI final full suite: 2071 passed across 90 files, rerun after adding metadata-leaf cases.
- Python source/dogfood parity: included in the passing regression suite.
- `git diff --check`: PASS.
- No tracked changes under historical workspace/archive or external docs-site/marketplace.

No package publication, commit, push or historical cleanup occurred. Previous
packed artifacts are not evidence for this repair set. Actual Python 3.9,
other OS/vendor runtimes, OS-level filesystem observation and release delivery
remain unverified gates. Task status remains in_progress.

## Scoped Four-Finding Repairs (Local Date 2026-09-12)

Authority: fix only the four findings confirmed in the latest review and their
regressions. No protocol/schema change, archive-default change, unrelated storage
refactor, publication, downstream modification or historical cleanup.

| Finding | Correction | Verification |
| --- | --- | --- |
| Channel file aliases | Core/CLI final event, sequence, lock and worker paths use the existing shared history guard. Marker discovery/migration and force-clean PID reads obey the same boundary. | Core `retired-storage` covers event/sequence/lock aliases, external backing roots, rejected reads/appends, worker aliases and force-clean; CLI wrapper paths are covered separately. |
| Task-root aliases | `get_tasks_dir` rejects historical targets before callers can create or enumerate them. The task CLI renders the typed retirement error as a nonzero diagnostic. | Real task command dispatch tests cover set-meta by path/name, list, list-archive, create and archive, with recorded forbidden IO attempts and unchanged history. An ordinary active linked task store remains usable. |
| Python configuration aliases | Shared config loading rejects retired paths before reading, without silently substituting defaults. Ordinary read/parse error compatibility remains unchanged. | Both historical true/false archive values are rejected without reads; direct/external workflow roots and all retired root names are covered. Active true/false values and normal task operations remain effective. |
| Deprecated comments masking commands | Fenced code and recognizable shell command lines cannot use explanatory comments to bypass retired-instruction detection. | Unit tests cover fenced/raw commands and harmless explanations; update skip rejects before mutation, while explicit force reapply replaces the incompatible managed workflow. Unrelated package-manager workspace syntax remains accepted. |

Final verification for this repair set:

- `pnpm build`: PASS; final CLI build also rerun after classifier refinement.
- `pnpm lint`: PASS; final classifier/test edit also passed scoped ESLint.
- CLI `tsc --noEmit`: PASS.
- Targeted Python basedpyright: 0 errors, 0 warnings.
- `pnpm test`: core 388 passed / 1 skipped (21 files); CLI 2063 passed (90 files).
- Python template/dogfood parity is included in the passing regression suite.
- `git diff --check`: PASS; tracked historical workspace/archive and external
  docs-site/marketplace have no changes.

During verification, two CLI suites initially could not load core while its
build was cleaning dist; they passed after waiting for the build. A positive
create fixture omitted required --description; it was corrected in all new
create cases before the final passing run. Neither initial run is counted as
passing evidence.

No new packed/install or publication evidence was produced. Python 3.9 runtime,
other OS/vendor runtimes and OS-level filesystem observation remain unverified.
The task remains in_progress; no commit, push or release was performed.

## Follow-up Repairs — 2026-09-12

The following supersedes the test counts below for the latest repair set.

| Finding | Repair and regression evidence |
| --- | --- |
| Historical JSONL manifest aliases | Shared Python metadata-only guard runs before manifest operations and rename mutation; `task-manifest-history.integration` covers direct/external roots, aliases, forbidden IO and ordinary operations. Template/dogfood helper and distribution map are synchronized. |
| Historical configuration aliases | Core owns the shared Node path guard, re-exported by CLI. Update/init, config/registry, receipts, managed removal and writers check before target IO. Update/uninstall regressions preserve linked history. |
| Historical channel storage override | Core and CLI share root/project/channel validation, including missing alias descendants and explicit SDK cwd. Discovery skips protected aliases. Migration validates `_legacy` and its destination before mutation; regression verifies no rename/write and preserved active channel. |
| Receiptless legacy commands | Known retired runtime inventory participates in upgrade compatibility checks independently of receipt ownership; unowned/custom commands block and remain, including force mode. |
| Misclassified negative prose | `Never forget to run` and `Do not forget to export` remain actionable retired instructions; actual prohibitions remain allowed. Migration classifier tests cover both. |

Current verification:

- `pnpm build`: PASS, rerun after final migration destination guard.
- `pnpm lint`: PASS; final core edit also passed scoped ESLint.
- `pnpm --filter @mindfoldhq/trellis typecheck`: PASS.
- CLI full suite: 2043 passed across 90 files.
- Core full suite after final edit: 381 passed / 1 skipped across 21 files.
- `git diff --check`: PASS.
- No tracked changes under historical workspace/archive or external docs-site/marketplace.

The earlier packed artifacts below predate this repair set and are not evidence
for it. No new package installation/publication was performed in this follow-up.
Actual Python 3.9, other OS/vendor runtimes and OS-level filesystem observation
remain unverified. No commit, push, release or historical cleanup was performed;
the task remains in_progress.

Date: 2026-09-11. Scope: the six findings from the latest thorough review, plus
the supported external-root alias variant discovered while checking the first
fix. Changes remain uncommitted; no release or downstream action was performed.

## Finding Disposition

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Historical context bypass | Protected roots are checked before Python/OpenCode JSONL file, directory and manifest access; OMP and Node channel readers apply the same boundary. Git probes/finish-work exclude backups. Resolved aliases are also classified relative to the resolved project `.trellis` root. | `historical-context-boundary`, `task-only-context`, `omp`, `channel-context-trust`; recorded IO attempts must be empty and active spec context must still materialize. |
| Lost symlink on rollback | Backups preserve link targets as metadata; rollback restores the original link. Unsupported symlink parents fail preflight. Additive config writes use atomic replacement rather than modifying a linked target in place. | `update-retirement` real EACCES/rollback/retry and parent-link cases; `update-internals` linked config target remains unchanged. |
| Missed retired owner syntax | Compatibility detection includes the retired environment variable and camelCase API forms, while allowing harmless retirement explanations. | `migrations/retirement` and `update-retirement`; the previous environment-based custom workflow is rejected before version/content mutation. |
| Repeated uninstall guidance | Empty/history-only `.trellis` is a no-op identified from parent names. Missing ownership with active entries remains an error, without whole-tree deletion advice. | `uninstall.integration` repeats actual uninstall with retained history, both normal and dry-run modes, without history reads/removals. |
| Broken Quick Start | Both README platform examples now pass explicit creator/assignee. | `readme-init.integration` executes documented arguments with `--yes` only to avoid interactive prompts, then verifies task ownership and absent identity/workspace. |
| Ineffective downgrade flag | `retirementGuide(from, target, allowDowngrade = false)` honors explicit opt-in. It refreshes the running identity-free runtime without reverse migrations, historical restoration or a downgrade migration task. | Update integration and migration tests cover refused implicit and permitted explicit downgrade; descriptions/contracts are synchronized. |

The final supported-root fixtures include `.trellis -> backing-store` and
spec/manifest aliases into the backing store's historical directories. These
do not rely on the backing path containing a literal `.trellis` component.
Historical content remains byte-identical. Existing containment restrictions
and legitimate task/spec inputs remain effective.

## Final Verification

- `pnpm build`: PASS, core/CLI and generated templates.
- `pnpm lint`: PASS.
- CLI `tsc --noEmit`: PASS (core compilation also passed during build).
- `pnpm test`: PASS; core 372 passed / 1 skipped; CLI 2014 passed across 88 files.
- Python type checking: 0 errors / 48 unused-re-export warnings.
- `git diff --check`: PASS.
- Historical workspace, archived tasks and external submodules: no changes.

## Packed Verification

Packed with publishing lifecycle hooks disabled and installed both local
tarballs into `/tmp/trellis-review-fixes.kLqvFR/consumer` using `--ignore-scripts`.
The package pair retains version **0.6.16**: this is a local test build, not a
published or assigned `0.7.0-castbox.N` release. Exact CLI/core dependency verified.

| Artifact | SHA256 |
| --- | --- |
| `/tmp/trellis-review-fixes.kLqvFR/core.tgz` | `5a62c765e93e6f4fa952e21fc55c5e9c2cac96b50b2bff97c201cf0966f1426b` |
| `/tmp/trellis-review-fixes.kLqvFR/cli.tgz` | `65e3cf6a165c36130ff9025532cc0ea4261784bc3fb2b2941fb23ed7e2dcd474` |

Actual installed-CLI probes passed: incompatible environment-based workflow is
rejected without changing its version/content; real permission failure restores
the original settings link and retry succeeds; repeated history-only uninstall
succeeds without deletion advice; explicit downgrade succeeds without creating
identity. Packaged Python/OpenCode/OMP context templates are byte-identical to
the tested source templates.

## Remaining Gates

Actual Python 3.9 execution, Windows/Linux/vendor live runtimes and OS-level
filesystem observation remain unverified; language-level IO auditing is not a
substitute for those results. Fixed-version assignment/manifest, commit, tag,
publication and downstream adoption still require their separate authorization
and evidence. Task remains in_progress; history was not cleaned or rewritten.
