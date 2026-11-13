# Research: Independent single-checkout tools installation

- Query: Existing CLI/Core boundaries for explicit tools-only cross-version installation, first Delivery cutover, reapply, ordinary partial resume and bounded rollback; packed downstream API and affected contracts.
- Scope: mixed (current source/spec inspection plus live Issue and official documentation).
- Date: 2026-10-15
- Workspace: `Trellis-worktrees/40-independent-install-maintenance`; assigned Task `40-independent-install-maintenance`, generation 0. The caller explicitly corrected the unrelated Guru #566 hook context; no #566 files were written.

## Findings

### Requirement authority and observed support

Live [castbox/Trellis#40](https://github.com/castbox/Trellis/issues/40) was read with `gh issue view 40 --repo castbox/Trellis --json title,body,comments`; no comments were returned. It requires a new independent tools boundary, not a weaker interpretation of the existing full Plan2 migration. Installation must name one checkout and preserve old Tasks, planning, archives, sessions, bindings and peers. Subsequent selected-Task conversion must not make an incompatible tools-only rollback appear successful. These are accepted requirements, not claims about existing APIs.

| Existing entry | Observed source support | Actual boundary |
| --- | --- | --- |
| `trellis update` | Installed `.version` must equal candidate `VERSION` exactly | Same-version managed-template reapply, rooted at `process.cwd()`; no explicit project option. |
| `trellis init` | Fresh install or accepted current-version reinitialization; older installation rejected | Not a cross-version escape hatch. |
| `trellis migrate`, plan 1.0 | Actual `0.6.x` stable or `0.7.0-castbox.N` (`N >= 1`), strictly below target | Reviewed predecessor-to-schema1 conversion plus templates; same-version resume may see target `.version`. |
| `trellis migrate`, plan 2.0 | Same version regex, source <= target; same-package schema cutover allowed | Complete registered-workspace installation/task/session/artifact/workflow inventory, target Task2/Delivery. |
| `trellis upgrade` | npm package tag/version selection | Global package installation; unrelated to checkout-scoped installation and excluded from this task. |

Evidence: `packages/cli/src/commands/update.ts:1035` checks exact version before collecting templates; `packages/cli/test/commands/update-current-version.test.ts:45` tests rejection of `0.2.15`, `0.6.15`, and unknown, and `:102` tests old reinit rejection. `packages/cli/src/commands/migrate.ts:180` dispatches schema2 plans before plan1 version policy; `:193` defines the exact predecessor regex and strict comparison. `packages/cli/src/commands/migration2.ts:364` allows source equal to target and rejects source greater than target. Neither regex admits upstream beta/rc versions, arbitrary `0.7.x`, missing versions, or source newer than target. Current CLI/Core package versions are both `0.7.0-castbox.3` (`packages/cli/package.json:3`, `packages/core/package.json:3`); version alone is not a source/build identity.

### Why the first tools-only switch is currently blocked

`preflightDeliveryWorkflow(cwd: string, content: string, options: { installingRuntime?: boolean } = {}): void` (`packages/cli/src/utils/delivery-workflow.ts:50`) checks installed version (`:66`), probes the *installed* `delivery.py contract --json` (`:78`), and scans active task identities/schema/profile compatibility (`:112`). `installingRuntime` suppresses only that runtime probe; it does not remove the installed-version or old-task switch checks.

At `:164`, `preservedHistory` accepts old schema1/undeclared records only when both the prospective and already-installed workflow declare Delivery. Therefore selecting a new declaration over a legacy installation is deliberately blocked by `delivery_migration_required` (`:169`). Existing reapply exception is not initial tools cutover. Archives are not enumerated by this preflight (`:119`).

`collectTemplateFiles(cwd: string, options: { registrySpecs?: boolean } = {}): Promise<Map<string,string>>` (`packages/cli/src/commands/update.ts:460`) calls this installed-runtime preflight whenever the existing workflow has a Delivery contract (`:495`). Removing the version guard alone cannot produce an independent installer, and merely passing `installingRuntime` cannot either.

Native selected-record diagnostics already exist: `packages/cli/src/templates/trellis/scripts/common/runtime_contract.py:78` rejects old Task selection under a schema2 declaration with `unsupported_task_schema: schema-2 workflow requires explicit migration before execution` (`:95`); `common/active_task.py:569` invokes that check against the selected Task's actual workspace. This is a useful diagnostic boundary to extend with an actionable maintenance entry, without treating old data as new-model authority.

### Existing helpers and safe extraction boundaries

1. **Prospective tools collection already exists internally.** `collectMigration2Templates(root: string, reviewedSources?: ReadonlyMap<string, RawSnapshot | null>): Map<string,string>` at `packages/cli/src/commands/migration2.ts:225` collects shipped scripts, runtime agents, Delivery contract and configured-platform assets without probing installed tools, downloading specs or mutating files. Its optional frozen source map reconstructs Codex model keys during resume (`:246`). `migration2TemplateCandidate(files: Map<string,string>): { candidate_sha256: string; files: {path:string;sha256:string;mode:number}[] }` at `:265` freezes sorted raw digests and executable modes. Extract/reuse these mechanics rather than copy the collector into Guru.
2. **Prospective collector is narrower than ordinary update.** `update.ts:477` includes config and `.gitignore`, `:490` handles workflow, `:514` AGENTS managed content, `:537` Codex model keys, `:541` Claude status line, `:543` optional registry specs, and `:549` configured skip paths. The migration collector does not automatically provide that entire update surface. A new tool plan must explicitly own the difference; calling it a drop-in replacement would be inaccurate.
3. **User-edit receipt behavior is established.** `utils/template-hash.ts:44` computes LF-normalized template hashes; `:78` loads schema2 receipts and treats flat legacy receipts as no known hashes. Raw backup/replay digests must remain separate from these normalized ownership hashes. `update.ts:1052` removes a user-modified workflow from ordinary reapply even with force; `:1138` writes applicable files and preserves executable script mode, `:1150` applies overwrite/skip/`.new` choices, `:1166` advances hashes only for written/repaired paths.
4. **Workflow marketplace remains a separate owner.** `commands/workflow.ts:145` preflights application, while explicit `--create-new` writes only `.trellis/workflow.md.new` (`:158`) and does not activate it or update receipt. Modified-file replacement requires explicit force or interactive choice (`:182`). `projectWorkflowHashes(hashes: TemplateHashes, templateId: string, content: string): TemplateHashes` at `utils/workflow-hash-contract.ts:7` records bundled workflow ownership and removes custom ownership. `utils/workflow-resolver.ts:226` exposes internal `resolveWorkflowTemplate(id, options)`; new installation must preserve explicit template/provider identity and never infer bundled ownership from matching bytes.
5. **Scoped backup and normal failure restore already exist, but not a durable maintenance API.** `update.ts:918` backs up only enumerated managed paths; `:1172` restores backed-up paths/modes and removes newly added files/sidecars on caught failure. These helpers are private and immediate-run behavior. They do not expose a frozen resumable tool transaction, explicit rollback after later work, or compatibility validation after Task conversion.
6. **Plan2 has useful replay mechanics, but its executor must stay whole-plan.** `migration2.ts:427` prepares exact source/target bytes/modes; `:1329` rejects states outside frozen source or target before execution, and `:1337` skips completed/preserve actions. However, `:413` requires all live installed roots, and `:998` inventories shared/common and local sessions. Reusing complete `migrate2()` would retain the bootstrapping loop and widen writes. Extract mechanically reusable preparation/replay pieces without changing Plan2 semantics.

### Packed CLI/Core surface that Guru can actually consume today

The packed CLI has `trellis` and `tl` bins (`packages/cli/package.json:9`), whose launcher imports `../dist/cli/index.js` (`packages/cli/bin/trellis.js:3`). A caller can execute that exact candidate launcher with target checkout as subprocess cwd; this requires neither editing a global installation nor dispatching through target old scripts. Current Commander public commands are `migrate --from <version> --plan <file> [--dry-run]` (`src/cli/index.ts:157`) and `update [--dry-run] [--force|--skip-all|--create-new]` (`:180`). Neither offers the required new single-checkout maintenance operation or tools rollback/resume commands.

CLI root JS exports are only `VERSION` and `init` (`packages/cli/src/index.ts:9`). Although compiled command files are included under package `files: [dist, bin, ...]`, internal source exports such as `collectMigration2Templates`, `migrate2`, `MigrationResult`, and workflow resolver are **not a declared stable root SDK**. Do not tell Guru to import internal CLI files as an already-supported maintenance API.

Core declares supported exports `/task`, `/task/v2`, `/task/legacy-migration`, `/task/migration-v2` (`packages/core/package.json:31`). `/task/migration-v2` currently exposes `validateTaskV2Projection(source: unknown, projection: unknown): TaskRecordV2` (`src/task/migration-v2.ts:8`), a pure validation contract, not an installation executor. `/task/v2` exports types, parsing, operations and store APIs (`src/task/v2/index.ts:1`), including `parseTaskRecordV2`, `validateWorkflowContract`, `applyTaskOperation`, `loadTaskRecordV2`, `writeTaskRecordV2`, and historical commit verification. None is a tools transaction model today.

`packages/cli/scripts/release-preflight.js:240` verifies the packed CLI depends on the exact matching Core version (`:265`), not `workspace:*`. Joint evidence must additionally identify source SHA/build/package artifacts and exercise their actual bin/runtime; the existing packaging version check alone cannot identify a later same-version API candidate. No pack, build, install or joint execution was performed by this research.

### Minimal candidate design options (not existing APIs)

- Add one explicit tools-maintenance CLI boundary accepting a target project checkout independently of session/task resolution. Keep existing ordinary `update` and whole Plan1/Plan2 contracts intact unless a separately documented compatibility extension is chosen. Final command/type names belong to design, not this research.
- Use a versioned tools-only plan/result with exact checkout identity, source/target installation identities, configured-platform/tool candidates, user file decisions, workflow selection/ownership, bounded write actions and ordinary replay/rollback inputs. These are private deterministic executor inputs/results; no authorization, lifecycle pass, or Guru semantic gate belongs in them.
- Share prospective collection, ownership/hash handling, source/target replay and scoped file restoration. Avoid old installed-runtime execution during planning. Initial Delivery declaration installation must be an explicitly supported path preserving old data, not a fake `.version` or manually prewritten declaration.
- Preview of conflicted required runtime files must distinguish sidecar-only output from a completed usable runtime. A version receipt must not falsely announce a coherent installed candidate when old required tools remain because the user selected skip/preview. This is a design obligation; current `.new` behavior alone is insufficient proof.
- Resume must retain frozen original model/config customization inputs and original receipts. Ordinary interruption may leave source/target mixtures; a changed third-state tool path requires renewed review. Output-loss recovery must reuse the same operation/candidate. Preserve all business paths outside the original tool write set, including subsequent business work.
- Rollback must evaluate the proposed restored runtime/declaration against current data before any restore. If selected Task migration has since produced Task2/Delivery or session/binding formats that the old tools cannot serve, block tools-only rollback or return a bounded incompatibility result for caller-reviewed combined recovery. Do not invoke conversion or restore task/session data automatically. Existing old preflight cannot be assumed to implement this reverse-compatibility predicate.

### Shared pointer scope

The observed shared state is session/binding storage, not a discovered shared installation-runtime pointer: `common/session_storage.py:186` selects `<git-common-dir>/trellis/sessions` for Git, otherwise `<root>/.trellis/.runtime/sessions`; `:165` resolves branch-bound Task checkout and `common/active_task.py:569` checks that checkout's runtime. Thus a single-checkout installer must not rewrite shared session/binding records merely to launch tooling. Read-only compatibility inspection can be justified for rollback. Search did not identify a generic shared CLI/Core runtime pointer that must be repointed by tool installation; downstream Guru-private runtime paths are outside this file's verified scope.

### Files, specs and tests affected by the candidate boundary

| Path | Role / reason to inspect or extend |
| --- | --- |
| `packages/cli/src/commands/update.ts` | Existing inventory, ownership, conflict, backup and exact-version contract; extract reusable mechanics without weakening ordinary update. |
| `packages/cli/src/commands/migration2.ts`, `migration2-schema.ts`, `migrate.ts` | Prospective collector and raw action types; retain complete Plan2 and original plan dispatch. |
| `packages/cli/src/utils/delivery-workflow.ts` | Initial cutover versus reapply compatibility; stop requiring old runtime startup in tools installation. |
| `packages/cli/src/utils/workflow-resolver.ts`, `workflow-hash-contract.ts`, `commands/workflow.ts` | Marketplace identity and preview/application ownership semantics. |
| `packages/cli/src/cli/index.ts`, `src/index.ts`, package manifests | New supported CLI entry, JSON result/error/versioned API exposure if required; packed dependency contract. |
| `packages/core/src/task/migration-v2.ts`, `task/v2/*` | Existing model APIs; no justification to move template/provider filesystem ownership into task model. |
| `packages/cli/src/templates/trellis/scripts/common/runtime_contract.py`, `active_task.py` | Existing legacy selected-record diagnostic and native continuation, actionable maintenance guidance. Sync dogfood only if implementation changes these templates. |
| `.trellis/spec/cli/backend/commands-update.md`, `installed-version.md`, `commands-migrate.md`, `commands-workflow.md`, `trellis-core-sdk.md`, `delivery-lifecycle.md` | Existing supported boundaries and explicit new maintenance contract; do not silently redefine Plan2. |
| `packages/cli/test/commands/update-current-version.test.ts:45` | Existing mismatch rejection and no-history-read regression should remain for ordinary update. |
| `packages/cli/test/commands/update-internals.test.ts:12` | Skip-path, backup exclusion and managed-root cleanup behavior. |
| `packages/cli/test/commands/cross-worktree-update.integration.test.ts:464` | Installed-bin cross-worktree reapply evidence; extend separately for one-target tools maintenance. |
| `packages/cli/test/commands/delivery-workflow.integration.test.ts:410` | Installed runtime rejection, legacy switch/preview (`:424`), custom workflow force preservation (`:445`). Keep workflow command protection while adding explicit install route. |
| `packages/cli/test/commands/migrate2.integration.test.ts:393` | Complete Plan2 preview/resume, partial write (`:462`), workflow ownership/output loss (`:988`), registered peers (`:1732`), actual atomic failure after conversion and exact rollback (`:3473`). Reuse patterns, not irrelevant adversarial cases. |

New focused acceptance should execute the packed candidate bin against synthetic predecessor copies with multiple registered checkouts and old active/archive/session records; compare recursive bytes/modes of data and peers; cover first Delivery cutover, new native operation, exact old-record diagnostic, configured customization/conflict/sidecar choices, repeated reapply, ordinary partial writes/output loss and same-operation recovery. Include install → selected conversion → incompatible tools rollback, and unrelated later business work survival. Keep original Plan1/Plan2 regression suites. This is targeted Issue acceptance, not a full platform release matrix.

### External references and related authority

- Official [Customizing the Workflow](https://docs.trytrellis.app/advanced/custom-workflow.md), read live: workflow phases/routing/reminders remain Markdown runtime behavior; installation work is deterministic CLI tooling, not embedded semantic migration decisions.
- Official documentation entry points: https://docs.trytrellis.app/index.md and https://docs.trytrellis.app/advanced/custom-spec-template-marketplace.md. Not fetched during this focused read; no new spec-marketplace claim depends on them.
- Local `.trellis/workflow.md` and `.codex/agents/trellis-research.toml` were read; research remains planning-only and writes only this assigned task research file.

## Caveats / Not Found

- No independent tools-maintenance API, explicit target-checkout CLI option, durable tools-only resume/rollback API or reverse runtime/data compatibility checker was found in the inspected current source. Proposed names/shapes must not be represented as implemented.
- Supported *existing* migration versions are exact above. The new tools-only source support set, unsupported-version diagnostic policy, required runtime file conflict completion rule and rollback compatibility predicate still require explicit design decisions. They cannot be inferred from the package version or historical release manifests.
- No actual old business checkout, global package, worktree registration, lifecycle record, task/session data or installed tool was modified. No tests or package build/install were run; test references identify existing coverage, not fresh passing results.
- Memory registry keyword search returned no relevant hits; findings use current source/live Issue evidence.
