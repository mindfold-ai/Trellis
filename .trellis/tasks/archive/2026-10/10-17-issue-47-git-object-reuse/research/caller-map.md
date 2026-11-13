# Research: Issue 47 caller map and verification boundaries

- Query: Map canonical Task create / Delivery public owners, actual callers, safe immutable reuse and installation validation.
- Scope: internal, plus live GitHub Issue requirements
- Date: 2026-10-17

## Findings

### Files found and actual caller graph

All Python paths below are relative to `packages/cli/src/templates/trellis/scripts/`; their `.trellis/scripts/` twins are managed projections, not extra hotspots.

- `task.py:58,774`: imports `cmd_create` and dispatches public `task.py create` to it. No additional production caller of this command was found.
- `common/task_store.py:351`: canonical create owner. Lines 513-540 first scan live registered workspaces, then enumerate unique heads from local/remote refs, run one recursive task-path ls-tree per head and one `git show HEAD:path` per metadata path. Historical JSON is deliberately a permissive ID-only occupation read: malformed JSON is ignored; object `id` is stringified and casefold compared. Do not replace this with strict current-record parsing. Non-Git ref enumeration failure currently skips history; ls-tree/show failures are not silently ignored.
- `delivery.py:26,129,147`: public `candidate --paths ... [--kind ...]` calls `candidate_content_ref`; `apply` and named aliases call `apply_to_store` directly. Alias table lines 33-39 covers create, begin-check, record-result, rework, record-publication, record-delivery, stop, accept-scope, complete, closeout, reopen. Existing public arguments and typed error JSON must remain compatible.
- `common/delivery_store.py:58`: candidate digest reads current filesystem files; it does **not** itself read each file with Git. Git detection is one fixed rev-parse when kind is omitted.
- `common/delivery_store.py:195`: store validates input/preimage/Task/declaration, runs the pure operation, then only changed operations verify facts. `begin_check`, candidate-bearing `record_gate`, `record_publication` and `record_delivery` call `verify_candidate` exactly once (254-259). Non-historical local_commit recording then calls `_verify_fact` -> `_verify_commit` (158-171). Historical success skips mutable candidate and current gate-authority checks but still checks the immutable actual result. Unchanged retry skips new verification and retains release recovery.
- `common/delivery_store.py:108`: `_verify_commit` is the installed hotspot: fixed commit-type/exact-full-OID checks, per-path ls-tree and show, SHA256 each path's content, then the aggregate digest.
- `common/task_artifacts.py:85,122`: imports `_checked_path` only; no hidden writer or digest wrapper.
- `packages/cli/src/utils/delivery-workflow.ts:79`: calls `delivery.py contract --json` during installation preflight, not a Delivery writer wrapper. Hook/current-context and maintenance capability probes likewise do not wrap candidate verification or apply.
- `packages/core/src/task/v2/store.ts:121,141,152,205`: public SDK counterparts `computeCandidateContentRef`, `verifyCandidate`, `verifyHistoricalCommit`, `applyTaskOperationToStore`. Core local_commit flow similarly verifies mutable candidate then immutable commit. `verifyHistoricalCommit` independently has per-path ls-tree/show. Exported through `task/v2/index.ts:5`. Current in-repo direct consumers of the Core store writer / historical verifier are tests; installed Python writer does not invoke Core. Make TS optimization/parity scope explicit rather than claiming this is an installed nested call.
- `packages/cli/test/scripts/delivery-v2.integration.test.ts:218-221`: explicit `verify_candidate` followed by `apply_to_store` exists **only in an environment-isolation test**. It is not proof of a supported production wrapper duplicate and does not justify a new caller-supplied digest injection API.

### Supported optimization and preserve lists

Eligible immutable reuse:

1. Task create: deduplicate unique task metadata blob reads across actual different branch heads; each head/path still contributes its identity occupation meaning and useful collision locator. One operation can snapshot tree entries and batch unique blob OIDs instead of spawning show per metadata path. Different heads may share identical blobs.
2. Delivery immutable commit: bulk tree lookup for candidate paths and batch unique blob contents; SHA256 a repeated blob once while retaining every path/mode entry in the aggregate. Use repository identity plus full immutable tree/blob identity, not movable ref spelling.
3. Same-rule aggregate serialization can be reused only when its exact ordered path/mode/content-hash entries are equal. Filesystem input cannot simply inherit committed contents because normal recording validates both independently.
4. Any operation-local resource must close on success and failure. Large blob bodies should stream/spool in bounded chunks; do not keep all contents resident or write large requests into a live stdout/stdin batch pipe without a deadlock-safe plan.

Required independent checks:

- All live workspace identity occupation scans and selected Task validation, canonical operation parsing, identity/generation/owner/scope/phase/applicability, expected-preimage and final raw-preimage checks.
- Each filesystem candidate's containment, reserved-path prohibition, file type, existence/deletion, current bytes and permission mode. Separate calls after changes must re-read HEAD/worktree/ref/index where relevant; no persistent cache.
- Commit type and exact full 40/64-hex OID verification (including SHA256 repo prefix rejection), candidate/base matching and each input's expected digest comparison. Fixed independent cat-file/rev-parse checks are not the path-multiplication hotspot.
- Git environment isolation in Delivery (`GIT_*` stripped), manual artifact checks and actual gh PR identity/head/target/state/body checks. Network waiting is separately measured, not removed.
- Existing digest bytes: sorted path list; UTF-8 JSON with no whitespace, ensure_ascii=False; entries `[path, mode, hexSHA256]`, deleted entries `[path,null,null]`; Git owner execute normalized to 0755/0644, git_free full 0777. Gitlink/tree/symlink commit entries remain errors under local_commit. `relative_path` allows UTF-8 whitespace/tab/newline but disallows backslash/NUL/empty/dot/dotdot components; batch parsers must preserve original accepted inputs/results rather than assume shell quoting.

### Tests and official projection

- `packages/cli/test/scripts/task-identity-source.integration.test.ts`: historical ID reservations, duplicate/casefold identities, source preservation, sibling worktrees. Extend actual public create with multiple different heads sharing metadata plus unique metadata; include malformed/ignored historical JSON semantics.
- `packages/cli/test/scripts/delivery-v2.integration.test.ts`: public apply, exact commits, SHA256 repo, mutable candidate modes, stale bytes, environment pollution, scope/plan changes, historical/lost-response recovery and publication refresh.
- `packages/cli/test/scripts/delivery-location.integration.test.ts`: relocatable authority locators, Task roots, nested symlink refusal and generation binding.
- `packages/core/test/task/v2.test.ts`, `v2-location.test.ts`, `v2-historical-commit.test.ts`: public SDK parity if touching Core.
- `packages/cli/test/regression.part-06.ts:268-323` (imported by regression.test.ts): dynamic whole-tree Python path-set and byte equality. Never count dogfood and template as two production hotspots. Existing script-conventions spec requires both trees match; do not hand-edit dist.
- `packages/cli/src/templates/trellis/index.ts:59,86,116,140,151`: template enumeration/export. A new shared Python module must be exported/enumerated here to reach installs.
- `packages/cli/scripts/copy-templates.js`: official build copies src/templates to dist/templates, excluding TS and runtime caches. `pnpm build` builds Core then CLI. Representative built CLI init/update should prove helper bytes exist and are usable, not merely compare source trees.
- `packages/cli/test/commands/delivery-workflow.integration.test.ts`: actual init of native-delivery-v1, Python hook/runtime execution, same-version reapply, old-runtime refusal and custom workflow handling.
- `packages/cli/test/commands/update-current-version.test.ts`: exact-version reapply; `cross-worktree-update.integration.test.ts`: installed linked worktrees across repeated reapply. Existing update suites should be selected for relevant drift/.new sidecar/mode behavior, and new assertions should verify new module registration if introduced.
- Suggested focused command: `pnpm --filter @mindfoldhq/trellis test test/scripts/task-identity-source.integration.test.ts test/scripts/delivery-v2.integration.test.ts test/scripts/delivery-location.integration.test.ts test/commands/delivery-workflow.integration.test.ts test/commands/update-current-version.test.ts test/commands/cross-worktree-update.integration.test.ts test/regression.test.ts`.
- Required package checks: root `pnpm lint`, `pnpm typecheck`; Python `pnpm --filter @mindfoldhq/trellis lint:py` as applicable. Run relevant Core tests if SDK changes. Tests do not substitute Issue's before/after public-operation performance evidence.

### Related specs / external references

Read `.trellis/workflow.md`, `.trellis/spec/cli/backend/index.md`, relevant Task Lifecycle, Delivery Lifecycle, Script Conventions, Filesystem Safety, CLI unit-test index, and Core backend index. Delivery Lifecycle exact Git facts section (230-294) owns normalized modes, full-OID verification and environment isolation. Script Conventions lines 45-119 own canonical/dogfood byte parity. Public shipped `.trellis/delivery-contract.md` owns lifecycle semantics.

Live external requirement: https://github.com/castbox/Trellis/issues/47 (read via `gh issue view`, no comments). Downstream https://github.com/castbox/guru-trellis/issues/589 remains its own owner and cannot be closed from upstream completion. CLI uses Python 3.10+ syntax, Node >=18.17, pnpm 10.32.1, Vitest 4.0.18 (current manifests).

## Caveats / Not Found

- No production precomputed-digest wrapper API found; do not invent one to optimize a test-only duplicate.
- This file is static caller/spec research, not baseline timing, RSS, subprocess-count evidence, successful test evidence or release proof.
- Performance baselines must precede implementation and freeze numerical thresholds before after measurements. Issue requires two scales, 10k+ affected Delivery paths, repeated and distinct content and large objects, Python/Git RSS separately, and full public operations.
- Source line numbers describe preimplementation checkout and will move during implementation.
