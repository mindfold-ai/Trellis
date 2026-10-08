# Developer Identity and Workspace Retirement Design

## Status

Revision 5 adds the user's code-graph retirement scope to both review rounds,
including publication isolation and
historical migration instruction replay. Based on the amended Issue
and scope-expansion comment. Supersedes
the previous design; no prior planning confirmation authorizes implementation.
Work only in castbox/Trellis. Preserve historical data and external pointers.

## Authority Contract

Keep task metadata, invocation caller and session routing separate. Remove the
previous proposal to silently infer Git user.name or copy assignee into creator.
New task creation requires explicit creator and assignee, or a documented
caller contract that supplies both values. CLI uses `--creator`/`--assignee`;
automated callers pass these from their own explicit authority. Missing values
fail before task-directory writes. Existing task metadata remains authoritative
for operations on that task. Git is a checkout/branch fact, not a hidden person
identity source. A caller may deliberately pass a Git-derived value explicitly.
Do not persist a global identity or use ownership to select the active task.
Reading existing tasks does not require a caller or rewrite old metadata.

Apply equivalent operation-local ownership to bootstrap and migration tasks.
Migration creator can remain the explicit system actor `trellis-update`, but
assignee must come from explicit caller input, not Git fallback, identity or
`unknown`. Init/update expose ownership inputs for tasks they create.
Preflight automatic task ownership before installation/update mutation so an
unresolved owner does not leave a partially successful migration task.
Use existing Git/IO/task factories; keep CLI process concerns out of core.

### Entry-Point Ownership Matrix

The caller contract means fields passed directly to the operation, not an
ambient environment value, inherited parent task or newly discovered identity.

| Entry point | Creator | Assignee | Missing input / existing task |
| --- | --- | --- | --- |
| `task.py create` | Required `--creator` | Required `--assignee` | Exit 2 before writes; identify each missing flag. No copying one field to the other. |
| First init creating bootstrap | Explicit `--creator` | Explicit `--assignee` | Interactive prompt may collect missing fields for this invocation; `--yes` exits 2 without writes. |
| Update creating migration task | Fixed operation actor `trellis-update` | Explicit `--assignee` | Prompt before mutation, or exit 2 in noninteractive mode. Never read .developer. |
| Init/update not creating a task | Not required | Not required | No ownership prompt or identity gate. Existing bootstrap/migration task is reused without overwriting its ownership. |
| Automated task factory/caller | Required creator field | Required assignee field | Same validation before persistence; caller forwards supplied fields, with no global resolver. |
| start/current/finish/archive/rename | Existing task metadata | Existing task metadata | Do not require new owner input or backfill old records; explicit task/current binding determines target. |

Proposed noninteractive examples (new interfaces, not commands executed now):

```sh
python3 .trellis/scripts/task.py create "Example" --description "Example task" --creator alice --assignee bob
trellis init --yes --codex --creator alice --assignee bob
trellis update --migrate --assignee bob
```

For update, redirected/noninteractive stdin must never wait for a prompt;
supplied ownership flags are accepted independently of file-conflict flags.
Retired `--user` is an error, not an alias. List `--assignee` is a filter only,
never persisted identity. Diagnostics do not include historical identity values.

Preserve `.runtime/sessions`, shell tickets and platform session keys. The
inspected active-task resolver does not require a developer namespace migration.
Audit other runtime namespaces and remove confirmed identity/workspace consumers.
No new global state, aggregate task index or journal replaces the retired system.
Task selection uses explicit task parameters/metadata and verified checkout,
Git/worktree/branch facts; existing session pointers are validated bindings, not
personal task-selection authority or a fallback to legacy workspace state.

## Compatibility Decisions for Approval

| Surface | Proposed target |
| --- | --- |
| `task.py create` | Explicit creator and assignee; missing ownership is an error, never a hidden fallback. |
| `task.py list --mine/-m` | Nonzero retirement diagnostic directing users to explicit `--assignee <name>`; no successful no-op or broadened list. |
| List `--assignee` | Exact filter in text/tree and JSON, composable with existing status filter. |
| `list_my_tasks` | Remove identity-dependent helper; migrate callers to existing `list_tasks_by_assignee`; document import break. |
| Context text/JSON | Remove developer/workspace/index/journal and inferred personal-task fields; retain validated session task and project tasks. Document removed fields without deriving replacements from historical data. |
| Record context/record-session | Retire journal-specific mode/prompts with explicit diagnostics. |
| `init -u/--user` | Reject with migration guidance to operation-local task ownership (proposed `--assignee`), not silently reinterpret the old identity option. |
| Identity/workspace scripts | Remove functional implementations and exports, including get_workspace_dir/get_active_journal_file and workspace index aliases. Old command retirement diagnostics perform no retired-data access. |
| Workspace config | Remove journal/workspace options and examples. Preserve old user config physically but do not consume retired settings. |
| `session_auto_commit` | Separate task archive control without changing its default: new `task_auto_commit` defaults true. Existing `session_auto_commit` is a deprecated archive-only compatibility setting with a notice; it never activates journal/workspace code. Explicit new key takes precedence, then explicit legacy key, then existing true default. Preserve existing boolean parsing semantics. |
| Workspace merge attributes | Stop generating/updating workspace merge rules. Existing user .gitattributes stays intact; no new Trellis code consults the rule to operate on workspace. |

Bootstrap depends on installation/spec state, not identity-file existence.
Remove automatic per-developer joiner tasks; explicit onboarding task creation
remains available. Repeated init must not overwrite an existing bootstrap task.

## Source Responsibilities

Paths in this table are under `packages/cli/src/` unless stated otherwise.

| Area | Main targets | Responsibility |
| --- | --- | --- |
| Primitives | `templates/trellis/scripts/common/paths.py`, `developer.py`, `__init__.py`; identity and add-session entry points | Remove identity and workspace/index/journal runtime APIs, constants and exports. |
| Tasks | `scripts/task.py`, `common/task_store.py`, `task_queue.py`, `safe_commit.py`, `config.py` under templates/trellis | Explicit ownership/filtering; archive cannot stage workspace data. |
| Context | `common/session_context.py`, `get_context.py`, shared/Codex/copilot hooks, OpenCode plugin | Remove identity gates/journal reads in every output mode. |
| Init | `commands/init.ts`, `cli/index.ts`, `configurators/workflow.ts`, `constants/paths.ts` | Remove setup menu, identity-presence onboarding and workspace/merge-rule generation. |
| Update | `commands/update.ts`, `migrations`, `utils/template-hash.ts` | Protect legacy data, preflight ownership and converge obsolete runtime assets. |
| Delivery | `templates/trellis/index.ts`, `templates/markdown/index.ts`, platform collectors, common/bundled skills | Source/export/generated/dogfood parity. |
| Core | `packages/core/src/task` and proven consumers | Preserve record shape where possible; no unrelated channel/mem refactor. |
| Recursive readers | `templates/trellis/scripts/common/task_store.py`, template hash/index walkers, context loaders | Prune retired paths before recursion/content reads, including task rename reports. |
| Channel trust | `commands/channel/context-trust.ts` and context/agent loaders | Remove workspace auto-trust and implicit context sourcing; preserve task symlink support. |
| Whole-tree operations | `commands/uninstall.ts`, `commands/ablate.ts`, `utils/ablation-store.ts` and actual executors | No copy/hash/delete/restore of retired subtrees via a generic .trellis operation. |
| Migration guidance | `commands/update.ts`, `migrations/index.ts` and target-release guide metadata | Generate target-valid actions rather than replay obsolete historical instructions. |
| Fork publication | Repository `.github/workflows/publish.yml`, `packages/cli/scripts/release-preflight.js` and release guard tests | Block upstream npm publishing from fork events; keep artifact distribution separate. |

Refresh current in-repository docs/specs alongside runtime changes. Do not
rewrite historical task/journal evidence. Keep API developer-role terminology,
package-manager workspaces and raw platform memory unrelated to this mechanism.

## Data-Preserving Upgrade

Keep legacy `.developer`, ALL `.trellis/workspace/**` and predecessor paths
protected and unconsumed, including workspace/index.md and arbitrary contents,
not only journal patterns. Prune by path before recursion, reads, content hashes,
copying or indexing. New runtime cannot enumerate history just to report it was
preserved. Only external test fixtures inspect bytes for verification.
Protection-only exclusions and legacy gitignore entries are allowed; no active
public workspace API is retained merely to support these path guards.

Root-wide backup, ablate, uninstall and restore must not bypass these guards.
Preserve legacy data in place while operating on active managed assets. Do not
copy it into recovery transactions or restore it from old transactions. If an
old transaction cannot satisfy the narrowed contract without historical-data
access, fail before mutation with an explicit compatibility diagnostic. Do not
redesign the transaction engine beyond the preservation boundary. Update public
claims of full-tree deletion/restoration accordingly.

Channel and generic context entry points must not treat workspace as an allowed
implicit source, including explicit trust configuration pointing at the retired
path. Reject requests naming retired paths before content access with migration
guidance; preserve legitimate task/spec and unrelated caller-selected context.
Use existing containment rules, not extra adversarial or alias-finding machinery.

Disable historical trace rename paths and selected old migrations that mutate
identity/journal data for upgrades to the retirement release. Inspect the whole
selected migration chain, including ancestor-directory renames, not only the
latest manifest. Do not rewrite published manifest history.

### Target-Version Migration Instructions

Historical migration metadata is evidence, not a runnable plan for the new
target. The current `update.ts` concatenates every intervening guide and
aiInstructions into a new PRD. In particular, the 0.3.0-beta.0 guide directs
users to get_developer.py/init_developer.py/add_session.py and recursive scans
of .trellis. Merely removing file-migration actions does not retire this path.

For the retirement target, provide a target-owned cumulative migration guide
covering the supported source-version intervals. Generate new migration PRDs,
AI instruction sections and actionable terminal guidance from that guide and
the resolved current migration plan, not raw historical prose concatenation.
Retain applicable non-retired migration work (for example shell-to-Python task
entry points and current directory contracts); do not discard earlier necessary
steps simply because the final retirement guide is present.

The target guide maps legacy references to either a current supported action or
an explicit retirement diagnostic. It must never instruct identity/workspace
initialization, journal recording, historical directory traversal or restoration
of retired APIs. Search instructions use active managed paths with explicit
retired-data exclusions. Historical version IDs may appear as provenance, but
their full obsolete commands/aiInstructions are not embedded as executable
steps. Do not implement this as ad hoc keyword replacement of arbitrary prose.

Keep all published historical manifests and historical task records unchanged.
If an existing migration task for this target is reused, preserve its metadata
and custom text; check its actionable instructions against the target contract
before treating it as usable. If incompatible, block preflight and identify the
task needing explicit reconciliation; do not silently rewrite or resume it.
For a source interval not covered by the target guide, fail preflight with an
unsupported migration diagnostic rather than inventing actions or replaying old
guidance. The accepted source intervals must be enumerated from the existing
supported migration chain during implementation, not narrowed silently.

Postchecks inspect all newly generated instructions, not just installed scripts.
Regression fixtures include an upgrade crossing 0.3.0-beta.0, the immediate
pre-retirement version, and same-version reapply. Assert both absence of retired
actionable instructions and presence of required surviving migration steps.

Managed retired scripts are not user identity/journal data. Use existing
hash/ownership-aware migration to remove stock obsolete scripts/prompts. Never
delete whole user directories. Modified enabled runtime files need explicit
conflict diagnostics and reconciliation; do not mark the installation converged
while a legacy hook/workflow remains active. Test normal/force/skip/dry-run.
Force is not authorization to mutate historical identity/journal data.

### Upgrade Completion and Recovery

1. Preflight the complete retirement-related write/delete set, selected workflow,
   enabled entry points and required task ownership before managed-file writes,
   migrations, backup creation, task creation or version/hash receipt changes.
   Read managed code/config only, never retired user data. Resolve all stock
   asset replacements and custom-file decisions in this phase.
2. A required old hook/skill/runtime file skipped by user choice, `--skip` or
   `.new`-only handling is a blocking conflict. Exit nonzero with exact managed
   paths and corrective action; leave files, hashes, tasks and `.version`
   unchanged. The installed old runtime remains old and is not advertised as
   retirement-compliant. No half-new installation for a predictable conflict.
   Force may approve managed-code replacement under existing backup rules,
   but never override retired-data exclusions. Dry-run performs no writes.
3. On a fully resolved plan, apply the coherent script/template/hook set using
   existing scoped backups and atomic file writes. Validate installed enabled
   entry points, removed APIs and workflow compatibility before final receipts.
   An optional unrelated custom file may remain only when it cannot reactivate
   retired behavior; list it distinctly from a required retirement conflict.
4. Advance `.version` and successful template receipts only after postchecks and
   any required migration task succeed. Exit 0 means retirement convergence,
   not merely that copying completed. Same-version reapply uses the same gate.
5. For an ordinary apply/postcheck failure, exit nonzero without advancing the
   version; restore changed managed assets from this run's scoped backup where
   possible. Report rollback failures and forbid a success claim or continuation
   into task workflows until repaired. Never restore retired user data. Retry
   recomputes the plan from current files and the unchanged version, safely
   completes/reconciles receipts, and does not overwrite an existing task.

Review corrections: absence from a content backup is not proof that a path was
absent before the operation. Preserve supported symlink metadata during rollback,
or refuse an affected unsupported symlink boundary before any mutation. Never
delete an original link and claim restoration succeeded. Explicit
`--allow-downgrade` remains a best-effort refresh to the running identity-free
CLI's templates; it does not reverse old migrations or restore retired data.
Without that explicit flag, the existing downgrade refusal remains in effect.

This is a bounded update failure contract, not a new transaction service or an
arbitrary process-crash atomicity guarantee. Use ordinary deterministic failure
cases and existing IO tests, not extra fault-injection infrastructure. If receipt
writes fail, report incomplete update and repair them on retry even if some
managed files already match the new template. Successful reapply is idempotent.

Finish-work retains a positive task-only flow: inspect validated current task
and scoped Git facts, check quality/commit prerequisites, archive only the
selected/confirmed tasks under the archive policy, then report completion.
It does not call record mode, add-session, update an index, or create a journal
commit. Explicit task-auto-commit opt-outs remain effective after upgrade.

## Platform and External Workflow Boundary

Derive the matrix from `AI_TOOLS`/`PLATFORM_IDS`: claude-code, cursor, opencode,
codex, kilo, kiro, gemini, antigravity, devin, qoder, codebuddy, copilot, droid,
dsh, pi, reasonix, zcode, trae, omp, grok, kimi, snow at the inspected base.
Cover generated settings, hooks, pull preludes and skills, not only text scans.

`utils/workflow-resolver.ts:197` resolves native from the bundled workflow;
other workflows can come from external marketplace. Existing external
native/tdd/channel-driven copies contain legacy instructions, but their
mindfold-ai owners are out of scope. Proposed compatibility behavior: reject
clearly incompatible imported/selected workflows with migration guidance;
offer bundled native without silently changing workflow choice. Apply at
init/update/reselection and check executable legacy instructions rather than
the generic word developer. External adaptations remain owner handoffs.

Compatibility classification must not infer retired behavior from the generic
words workspace or journal. Require a Trellis historical path/API, an explicit
Trellis workspace/journal reference, or a direct legacy journal-recording action.
Package-manager workspace commands and database journal diagnostics remain valid
custom workflow instructions, including during force update.

## Release Handoff

Both package files currently say `0.6.16` and `@mindfoldhq/*`; tag-triggered CI
publishes those names. This does not prove castbox publication authority.
Do not invoke release scripts or push `v*` tags.

Selected planning route: paired package tarballs attached to a release in
`castbox/Trellis`, not publication to upstream npm names and not a floating Git
branch dependency. Keep existing package/import names inside the artifacts to
avoid an unrelated namespace refactor. Both packages use the same fork-specific
version `0.7.0-castbox.N`; proposed first candidate is `0.7.0-castbox.0`.
This is a proposed identifier, not a claim that the tag is available or published.
Before assigning it, verify repository tags/assets and select the next unused N.
Never replace released asset bytes; changed code requires a new N and checksums.

Use a `castbox-v<VERSION>` tag bound to the reviewed full SHA. This is a naming
convention, NOT a publication safety barrier: release.published currently
triggers the npm workflow for any tag, the current suffix regex accepts
castbox-v, and computeNpmTag currently maps castbox prereleases to latest.
Paired versions, CLI's exact core dependency and the breaking manifest all
match VERSION; implement the publication isolation below before any release.

### Fork Publication Isolation

Add a job-level exact repository allowlist to the npm workflow: it may run only
in its original authorized repository `mindfold-ai/trellis`, never in
`castbox/Trellis`. This condition applies to BOTH push and release.published
events and must precede checkout, package lifecycle execution and access to
publishing credentials. This edits the maintained fork's workflow only; do not
change the original upstream repository. A user-confirmed castbox release is
authorization for attachments, not an override of this npm guard.

Harden the npm publication preflight independently: exact anchored `v` tag
parsing, explicit supported npm release tracks, and rejection of castbox or any
unknown prerelease track rather than defaulting it to latest. Publication
commands fail closed on a missing/unapproved repository context. Keep generic
check-versions/verify-packed-cli usable for local fork artifact validation;
they must not require npm publication authority or compute a publish plan.

The selected attachment route is separately authorized upload of already-built,
verified tarballs/manifest/checksums to the castbox release. It does not invoke
the existing release.js, publish-plan, npm publish, or upstream package
prepublish scripts. Build/test/pack using the repository package tooling in an
isolated preparation directory, explicitly avoiding publish lifecycle hooks.
Do not introduce an automated publishing pipeline as part of this route.

Add side-effect-free event/guard tests for castbox and upstream repository
contexts, push versus release.published, standard v tags versus castbox-v tags,
and missing repository context. Prove castbox events cannot reach any npm
publish step even if credentials are present; never use real credentials or
registry writes in these tests. Verify unknown prereleases cannot map to latest.
Before the authorized release, ensure guards are committed in the default
branch and selected release revision as applicable to event workflow loading.
After publication, inspect the run result to confirm the npm job was skipped;
artifact download/install checks remain separate from that isolation evidence.

Required assets: CLI `.tgz`, core `.tgz`, `SHA256SUMS`, migration guide and a
release manifest containing repository, full SHA, tag, version, both filenames,
checksums and expected CLI-to-core dependency. Download and verify both assets
before installation. In a temporary consumer prefix, install BOTH local tarballs
in one operation and assert the resolved core is the supplied matching artifact,
not the registry copy. Record an exact repeatable install command in the handoff
using the actual packed filenames; execute the prefix's local CLI for fresh
init/update/reapply tests. Never install into the user's global npm or existing
node_modules. Isolated generated test dependencies are not implementation patches.

After separate publication authorization, verify the downloadable assets and
repeat installation from that download. Guru #329 receives the release/tag/SHA,
paired artifact checksums, exact install command and migration evidence; its
own adoption/verification is separately owned. Local pack tests prove only a
candidate. R7 delivery requires the retrievable fixed-version bundle; no
downstream edit/closure or publication occurs as part of planning approval.

## Verification Boundary

The same protected roots apply to default/compact context, JSONL file and
directory materialization, subagent dispatch and OMP events, not just channel
loaders. This includes historical `.backup-*` boundaries. Regression tests must
record attempted reads/enumeration independently of exceptions: swallowed guard
errors plus an empty output are not proof of no access. Valid task/spec context
must continue to materialize.

Forbidden product operations: open/read/hash/index/copy retired file contents,
enumerate within retired directories, follow them as context roots, mutate them,
or use their presence/values for task/owner selection. A parent-directory listing
and lexical path exclusion needed to skip a protected name are not content
consumption; do not descend or branch business behavior on that name. Existing
containment checks may inspect a boundary path without reading its descendants.

Git subprocesses are part of the audit, not exempt runtime readers. Scope
worktree status/diff probes with retired-path exclusions at invocation, not just
filtering stdout after a full scan. Inspect tracked and untracked fixture cases
and verify subprocess arguments and relevant filesystem activity. Do not claim
process-wide zero-read proof from Python/Node monkeypatching alone. Historical
Git commit metadata can remain a Git fact; it must not trigger blob/journal
retrieval or be interpreted as current workspace identity. Git may read its own
index to implement exclusion; this is not the retired workspace index.md.

Equivalence comparisons fix checkout/branch/HEAD, active task metadata, explicit
caller inputs and all non-retired files. Vary retired on-disk trees/environment
independently. Compare exit status, selected task, ownership, lifecycle result,
scoped dirty status, structured context and enabled generated assets. Normalize
timestamps and fixture roots only, not differences in business decisions.
Tracked dirty history and untracked history must not alter scoped status or
finish-work decisions. Preserve unrelated non-retired dirty-file reporting.

The external fixture verifier may enumerate/hash historical files before and
after the tested process; it is never imported by product code. Separate evidence
rows cover product-language filesystem calls, subprocess commands, OS-level read
observation where available, and verifier byte equality. Missing OS-level proof
is reported explicitly, not promoted from a source scan to a passing claim.

## Risks and Recovery

Main risks: recursive workspace reads/indexing, whole-tree backup/removal,
old-update mutations, stale generated workflows, journal staging during archive,
caller authority drift and incomplete platform coverage.
The former external code-graph prerequisite is revoked. Assess impact through
source references, callers, import/template consumers and focused tests, and
review the full Git diff. Do not manufacture a tool risk rating or replace the
retired integration with another mandatory external tool.

## Code-Graph Integration Removal

The user's scope addition supersedes the root instructions requiring this tool
before symbol edits or commits. No installation or repair work remains needed.
Confirmed active targets: root AGENTS.md/CLAUDE.md managed blocks; the six
dedicated skills under .claude/skills; root ignore entries; architect prompt;
spec-bootstrap and meta bundled-skill source plus their generated platform
copies under .agents/.claude/.cursor/.omp/.opencode/.pi. Inspect any other
configured platform collector output, package/config references and test
fixtures before declaring scope complete. Preserve unrelated guidance and tools.

Remove recommendations as well as mandatory calls and obsolete setup sections.
Retain source/AST exploration and regression-based impact checks without a
specific code-graph dependency. Synchronize templates and installed dogfood
copies; test fresh generation and upgrade/reapply so old blocks or dedicated
skills cannot be restored. Only retire provably owned installed assets using
existing customization protections; don't wipe an arbitrary user's tool data.

Acceptance uses case-insensitive text and filename scans over the selected
owned scope, packed outputs and newly generated installations, plus positive
spec-bootstrap and workflow checks. Scan definitions must explicitly separate
active/distributable files, the removal task's own requirement/evidence text,
historical tasks/journals, external submodules and Git history. Do not hide
matches with split spellings or claim zero traces with undeclared exclusions.

Historical-text treatment is confirmed: archived and prior task documents, an
old research filename and workspace journals are excluded by the user and must
remain unchanged. Remove every nonhistorical reference in the maintained scope.
No original
upstream, global npm, existing node_modules or Git history rewrite is authorized.

Use isolated fixture repos for migration trials. Roll back code via reviewed
changes, not by restoring legacy identity into active use. Preserve unrelated
workspace changes and all historical data.
