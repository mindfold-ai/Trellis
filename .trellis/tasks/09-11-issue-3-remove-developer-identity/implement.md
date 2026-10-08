# Identity and Workspace Retirement Implementation Plan

## State

Revision 4 was activated on 2026-09-11. The user's subsequent material scope
addition was reconciled in revision 5: the user excludes historical records and
confirms all other traces must be removed. Implementation resumes. The old
code-graph gate is revoked; no installation/repair is required.
Commit/push/publication authority is unchanged.

## Superseded Execution Checkpoint

The previously required external analysis tool failed on the installed Node
runtimes before indexing. No product edits or dependency installations resulted.
The user has now removed that dependency from scope requirements; no retry,
installation, rebuild or graph-analysis result is required going forward.

## Ordered Work

1. [x] Re-read Issue/comments, HEAD, worktree status and planning approval.
2. [x] Apply the confirmed historical-text boundary for R8, remove owned code-graph
   instructions/skills/template recommendations and inspect direct source,
   callers, imports and generation paths for impact. Do not install the tool.
3. [x] Load trellis-before-dev, Python, filesystem, update/migration, platform
   and core boundary specs. Inventory active references and source/dogfood twins.
4. [x] Inventory workspace/index/API/config consumers, recursive scans, trust,
   merge rules and backup/restore/removal. Establish path pruning before reads.
   Add explicit-caller, identity/workspace-equivalence and preservation regressions
   using existing Vitest/Python subprocess fixture patterns.
5. [x] Implement ownership/filtering/context changes, preserving session
   routing and old task records. Remove journal paths from archive staging.
6. [x] Retire all identity/workspace/index/journal primitives and configuration,
   including archive-only configuration compatibility preserving current defaults
   and opt-outs. Update every runtime consumer,
   hook, workflow, skill and template export together.
7. [x] Update both init paths, onboarding, worktree-copy config and configurator.
8. [x] Update/reapply: preflight explicit ownership, disable historical data
   reads/mutation/reindexing, handle stock/modified obsolete assets and reject
   incompatible workflows. Implement preflight conflict rejection, postchecks,
   delayed version/receipt completion and ordinary failure/retry handling from
   design.md. Remove workspace trust/reference scans. Apply the
   same exclusion to backup/ablate/uninstall/restore without broad redesign.
9. [x] Synchronize scoped dogfood copies, current specs/docs and migration
   guide; preserve external submodules and historical tasks/journals. Replace
   raw historical guide concatenation with target-owned cumulative guidance;
   enumerate supported source intervals and retain surviving migration steps.
   Validate reused migration tasks without rewriting incompatible custom text.
10. [ ] Run targeted checks, full suite, package inspection and installation
    matrix. Capture command, exit status, candidate/fixture version and OS.
11. [x] Run trellis-check, full-diff/caller review and comparison against main.
    Include untracked/new files explicitly; do not require external graph tools.
12. [ ] After commit/version authorization, prepare paired 0.7.0-castbox.N
    release assets, dependency checks, SHA256SUMS, release manifest and exact
    isolated install command. Verify castbox-v tag workflow triggers before
    any tag operation. PR/merge/publication/downstream validation stay separate.

Required before step 12: implement the exact-repository npm job guard for both
push and release events, fail-closed publication preflight and unknown-track
rejection described in design.md. Add side-effect-free tests; include workflow
and release-script symbols in scope/impact review. This is implementation work,
not a release-time manual check. No original upstream repository is edited.

Steps 1-9 and local review are implemented and locally verified. Step 10 has
passed the full host test suites and real packed installation; it remains open
for actual Python 3.9, Linux/Windows runtime and OS-level no-read evidence.
Step 12 remains unapproved/unexecuted: no version bump, release manifest at a
selected fork version, commit, tag, publication or downstream adoption occurred.
See `research/implementation-evidence.md` for the latest verification snapshot.
The subsequent thorough-review repairs and their current verification are
recorded in `research/review-repairs.md`; those results supersede the earlier
snapshot for the corrected code paths.

## Validation Matrix

| Requirements | Cases and assertions |
| --- | --- |
| R1/R2 | Identity absent/local A/B/env A/B/conflicting main-worktree; independently workspace absent/empty/populated A/populated B, root index and nested arbitrary data. Fixed task/Git/caller authority; explicit owner, missing owner, existing metadata. No Git/assignee-to-creator fallback. Compare outputs, selection and ownership. |
| R1/R3 | create/start/current/finish/archive, resume, multiple sessions, absent session key; no cross-session task selection. Explicit assignee/status/tree/JSON and retired --mine/record diagnostics. |
| R4/R5 | External verifier compares the WHOLE retired tree. Observe forbidden content access/descent separately from allowed boundary exclusion per design.md. Audit Python/Node calls AND Git/other subprocesses; record OS observation gaps. Unrelated staged files never enter archive commits. |
| R1/R5 | Fresh/repeated init, add platform, bootstrap/resume, linked worktree, reapply/repeated update and older migration chains; stock/modified assets, force/skip/dry-run. No workspace/index directory creation, no merge rule provisioning, no history migration. |
| R6 | Every live platform registry entry: collect/build/install/update and runnable installed hook/context smoke. Native plus incompatible external/custom workflow diagnostics; no silent switching. |
| R7 | Paired local tarball installation resolves exact supplied core; no upstream npm publication. Verify version/manifest/checksums and repeat download/install after authorized release publication. |
| R4/R6 | No workspace APIs/record modes/journal configuration. Archive defaults true as before; old false/true remain effective with deprecation notice, new explicit key wins, and no configuration route enables journals. Cover absent/invalid settings and both keys. |
| R5/R6 | Ablate/uninstall/restore preserve retired data in place and never snapshot/replay it; incompatible old recovery transactions fail before mutation. No claim of full-directory removal when historical data remains. |
| R1/R6 | Required custom-runtime conflict with skip/.new leaves files, tasks, hashes and version unchanged. Approved managed-code replacement converges; postcheck failure does not claim success; retry repairs receipts without duplicating tasks. Same-version reapply is idempotent. |
| R2/R3 | Entry-point ownership matrix: task create needs both fields, init without task needs neither, migration task has fixed creator and explicit assignee; no-input noninteractive calls exit 2 without writes. |
| R1/R4/R5 | Same HEAD with tracked dirty versus untracked retired files: scoped context/Git/finish-work results remain equivalent; non-retired dirty files are still reported. Task-only finish-work succeeds without record/add-session APIs. |
| R6/R7 | castbox push/release.published cannot execute npm publication, including standard v tags and simulated available credentials. Missing/unapproved repository or unknown prerelease fails closed. Generic local pack/version checks still work. |
| R1/R6 | Upgrade crossing 0.3.0-beta.0, immediate predecessor and same-version reapply: inspect generated migration PRD, AI instructions and actionable terminal output. No retired initialization/recording/recursive-history scan, while surviving required migration actions remain. Old manifests retain identical bytes. |
| R1/R2/R6 | Reused migration task with incompatible historical guidance blocks before mutation, preserving ownership/custom bytes. Compatible task is reused without duplication. Unsupported source interval fails explicitly rather than replaying historical prose. |
| R8 | Scan owned current instructions/source/templates/config/filenames and packed/generated files case-insensitively; verify no dependency/recommendation or obsolete skill regeneration. Run spec-bootstrap/workflow smoke without the removed tool. Report historical/removal-evidence exceptions according to the user's scope decision. |

## R8 Execution Evidence (2026-09-11)

- Removed root managed instruction blocks, six dedicated skills and their empty
  directories, ignore entries, and architect integration instructions.
- Updated the four bundled-skill source documents and their existing platform
  copies. Retained unrelated ABCoder/native source inspection and pre-existing
  platform-specific prose; no historical files were rewritten.
- Case-insensitive content scan of the nonhistorical maintained tree, including
  ignored build output, found no retired integration references. Filename scan
  also found no nonhistorical matches. Active local Git config/hooks had none.
  Scans excluded Git history, historical task/workspace records, external
  submodules and dependencies outside the maintained source scope.
- Built `collectPlatformTemplates` output was scanned for every live registry
  entry: 22 platforms, no matching paths or content.
- `pnpm build`: PASS; rebuilt CLI/core and dist template assets.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm --filter @mindfoldhq/trellis exec vitest run
  test/configurators/platforms.test.ts test/templates/trellis.test.ts
  test/commands/init.integration.test.ts test/commands/update.integration.test.ts`:
  PASS, 4 files / 189 tests. Includes configure/collect parity for every platform
  and Windows Python rendering.
- `git diff --check`: PASS.
- Tracked historical task/workspace records and external submodules compare
  unchanged to HEAD. The current task directory is new/untracked evidence,
  distinct from preserved historical records.
- At this earlier R8-only checkpoint the remaining runtime work was incomplete.
  The later implementation evidence supersedes that progress snapshot. No commit,
  push, tag, global uninstall or release was performed.

Normalize only timestamps and fixture roots; fix session bindings, never normalize creator,
assignee, selected task or diagnostic differences. Preservation means original
paths/content, not aggregate counts. Replace positive retired-feature tests
with retirement/preservation assertions rather than deleting regressions.
The byte verifier is test-only: it is not permission for product runtime to
read retired files. No adversarial-input or extra fault-injection test program.

## Existing Test Locations

- `packages/cli/test/commands/init.integration.test.ts`,
  `init-joiner.integration.test.ts`, `init-internals.test.ts`.
- `packages/cli/test/commands/update.integration.test.ts`,
  `update-internals.test.ts`, `workflow.integration.test.ts`.
- `packages/cli/test/scripts/task-meta.integration.test.ts`,
  `task-list-tree.integration.test.ts`, `task-archive.integration.test.ts`,
  `add-session.integration.test.ts`, `add-session-worktree-warning.integration.test.ts`,
  `gitattributes-journal-merge.integration.test.ts`.
- `packages/cli/test/templates/`, `test/registry-invariants.test.ts`,
  `test/configurators/python-rewrite-parity.test.ts`, `test/constants/paths.test.ts`,
  `test/migrations/index.test.ts` (test paths relative to packages/cli).

Discover any additional Python/session tests before editing those consumers.
Also include `packages/cli/test/commands/channel-context-trust.test.ts` and
discover task-rename, ablation, uninstall, restore and context-loader tests for
the newly confirmed indirect consumers. Cover deprecated parameters and
workspace API/config removal independently of developer identity removal.
Add release workflow/preflight guard tests and migration-output regressions to
the concrete existing test suites discovered for those modules. Tests evaluate
event predicates and publication command eligibility without registry writes.

## Commands

Run separately and record results. Build precedes CLI integration tests, which
load dist. These commands have not been run as implementation validation.

```sh
pnpm build
pnpm --filter @mindfoldhq/trellis exec vitest run test/commands/init.integration.test.ts test/commands/init-joiner.integration.test.ts test/commands/update.integration.test.ts test/scripts/task-meta.integration.test.ts test/scripts/task-list-tree.integration.test.ts test/scripts/task-archive.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm test
node packages/cli/scripts/release-preflight.js check-versions
node packages/cli/scripts/release-preflight.js verify-packed-cli
git diff --check
```

Read and run the exact existing CI minimum-Python parse check. Inspect pack
dry-run output in each package directory. Use built CLI only in isolated
fixtures for init/update smoke, never update this working checkout/global
installation as a test. Registry tests must assert installed runtime behavior,
not merely source absence.

Host is macOS. Linux/Windows/minimum-Python, vendor live applications and
publication checks need separate evidence. Unavailable cases are SKIP/BLOCKED,
not PASS; generated asset tests do not prove every vendor live runtime.

## Remaining Gates

- Implementation and historical boundary confirmed. No separate commit or
  release approval. No code-graph gate.
- Context validation passed with truncation warnings for script-conventions,
  commands-update, platform-integration and commands-channel specs. Implementers must read the
  relevant full sections directly; injected excerpts are not complete guidance.
- Verify implemented/tested npm isolation, the next unused fork version and release-asset access
  before separately authorized publication. Distribution route is fixed in
  design.md; external docs/workflow ownership remains separate. Local candidate
  artifacts alone do not close R7 or establish downstream #329 acceptance.

## Self-Review Finding Disposition

| Finding | Planning correction | Implementation proof still required |
| --- | --- | --- |
| P1 upgrade convergence | Preflight/apply/postcheck/receipt and failure/retry contract in design.md | Customized-file modes, failed postcheck and repeat-update tests |
| P1 fixed-version delivery | Paired castbox release assets and version/tag/install policy selected | Pack resolution and authorized downloadable-release smoke |
| P2 archive default drift | Preserve true default and legacy explicit opt-outs, archive-only compatibility | Configuration precedence and task-only finish tests |
| P2 unspecified caller | Per-entry ownership matrix and noninteractive examples | Missing-input no-write and existing-task regressions |
| P2 zero-read/equivalence ambiguity | Product/test/Git boundary and exact comparison fields | Separate filesystem, subprocess and byte-equality evidence |
| Round 2 P1 fork publication | Exact repository guard for both event types; closed publication preflight; attachment-only release route | Event matrix, unknown-track rejection, npm job skipped on authorized fork release |
| Round 2 P1 obsolete migration instructions | Target-version cumulative guide; no raw historical instruction replay; compatible reuse gate | Cross-old-version PRD/AI/terminal assertions and historical manifest byte equality |

This table records document corrections, not passed implementation tests or
publication. Re-read all three documents for consistency before presenting the
revised planning summary.

Task start previously succeeded; revision 5 resumes implementation after
historical-boundary confirmation. No publication has occurred.
Preserve unrelated files/worktrees; do not use archive/journal
automation as implicit commit authority. Material design changes need review.
