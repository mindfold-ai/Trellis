# Retire Developer Identity and Trellis Workspace (#3)

## Goal

Completely retire developer identity AND the Trellis workspace mechanism.
Installation, sessions and tasks must use explicit task/caller authority,
checkout/Git/worktree facts and explicit parameters, never workspace, journal,
index or hidden identity fallbacks. Preserve historical data without reading,
indexing or consuming it. Provide a fixed-version handoff for Guru Team.

## Source and Authorization

- Planning revision 5 adds the user's local scope expansion and supersedes
  prior summaries. The user confirmed historical records are excluded and all
  other maintained references must be removed; implementation is resumed.
- Source: https://github.com/castbox/Trellis/issues/3, re-read live on 2026-09-11;
  body updated at `2026-09-11T12:31:53Z`, plus comment `5634476213` explicitly
  requiring complete workspace retirement. Related castbox/guru-trellis#329
  waits for the framework version and is not an edit target.
- Additional authority: the user explicitly requested removal of the code-graph
  dependencies and traces in this task. This local addition has not been posted
  to the GitHub Issue; do not claim the remote Issue contains it.
- Inspected base: `ad332e3fe5a19d7274cb03e7c2f3e2128f8de291`.
- Branch: `codex/issue-3-remove-developer-identity`, base `main`.
- Authorized: local implementation and verification. No commit, push, PR,
  publication or downstream modification is authorized.

## Confirmed Background

| Evidence at inspected base | Current behavior |
| --- | --- |
| `packages/cli/src/templates/trellis/scripts/common/paths.py:100` | Resolves environment, local identity file, then main-worktree identity. |
| `packages/cli/src/templates/trellis/scripts/common/task_store.py:344` | Defaults task ownership from identity; explicit assignee permits creation without initialization. |
| `packages/cli/src/templates/trellis/scripts/common/session_context.py:596` | Missing identity blocks text context; JSON/record modes also consume identity/journals. |
| `packages/cli/src/templates/trellis/scripts/task.py:374` | Supports identity-dependent `--mine`; explicit list `--assignee` is not implemented. |
| `packages/cli/src/commands/init.ts:931` and `:1997` | Both init paths initialize identity and use its presence for onboarding. |
| `packages/cli/src/commands/update.ts:2579` and `:2794` | Renames historical traces and reads identity to assign migration tasks. |
| `packages/cli/src/templates/trellis/scripts/common/safe_commit.py:94` | Shared staging allowlist includes developer journals. |
| `packages/cli/src/templates/trellis/scripts/common/active_task.py:1` | Active tasks already use session-scoped runtime pointers. |
| `.gitmodules:1` and `:4` | Docs/marketplace belong to independent mindfold-ai repositories. |
| `packages/cli/src/configurators/workflow.ts:176` | Creates workspace/index.md independently of developer initialization. |
| `packages/cli/src/commands/channel/context-trust.ts:21` | Automatically trusts the workspace symlink as a context root. |
| `packages/cli/src/templates/trellis/scripts/common/task_store.py:857` | Task rename recursively scans .trellis prose, including historical workspace content. |
| `packages/cli/src/utils/ablation-store.ts:361` and `packages/cli/src/commands/uninstall.ts:17` | Whole-tree copy/removal paths need a historical-data preservation boundary. |
| `.github/workflows/publish.yml:7`, `packages/cli/scripts/release-preflight.js:74` | Release publication triggers npm workflow independently of tag-push filters; castbox-v suffix matches current version parser and castbox prerelease maps to latest. |
| `packages/cli/src/commands/update.ts:2841`, `packages/cli/src/migrations/manifests/0.3.0-beta.0.json` | New migration tasks concatenate historical guides containing retired script instructions and recursive .trellis scans. |

## Requirements and Acceptance

| ID | Requirement | Observable acceptance |
| --- | --- | --- |
| R1 | Remove identity AND the entire workspace mechanism from runtime/install/update. | Fresh/repeated init, update/reapply, linked worktree, bootstrap/resume and normal task lifecycle never create/read/write/restore/migrate/index/consume identity, workspace, index or journal. |
| R2 | Resolve ownership from explicit task/caller input; no replacement store or implicit fallback. | Fixed task/Git/caller inputs produce identical creator/assignee with absent/different identity/workspace. Unresolved ownership requires explicit input before task writes; existing ownership is not rewritten. |
| R3 | Retire implicit personal task selection with migration guidance. | `--mine/-m` cannot silently return broader results. Explicit assignee filtering works in text/JSON. Context clearly distinguishes current-session task and project task inventory. |
| R4 | Retire all workspace APIs, configuration, templates, indexing and workflow behavior. | No workspace directory/index generation, journal rotation, add-session/finish writes, bootstrap/resume lookup, automatic trust, rename reference scan or merge-attribute provisioning. Archive remains task-scoped; no replacement global journal/index. |
| R5 | Preserve the entire historical identity/workspace tree, not just recognized journals. | File names, bytes and symlink targets remain unchanged, including root index, per-developer indexes, arbitrary files and legacy traces. No traversal, migration, deletion, rewrite, re-indexing or consumption by the new runtime. |
| R6 | Source, shipped assets, dogfood and platforms agree. | Registry-derived generation/update matrix covers every platform and installed runnable hook/context path. All remaining legacy references are classified; stale workflows cannot reactivate identity. |
| R7 | Explicit breaking compatibility and fixed-version release handoff. | Guide covers flags, workspace APIs/JSON/config removal, onboarding and customized files. Handoff records paired package version, exact SHA/checksums, installation source and remaining publication gates. A source patch or floating branch is not final downstream delivery. |
| R8 | Remove the code-graph integration, its mandatory and optional instructions, skills, configuration and distribution references. | No active dependence or recommendation remains in maintained source, current guidance, templates, generated assets or fresh installs; updates do not reintroduce it. Historical records are excluded and preserved. |

Additional completion constraints from self-review:

- Required customized-runtime conflicts stop update before mutations; only a
  fully converged installed runtime may advance version and report success.
- Task archive auto-commit keeps its existing default and explicit opt-outs;
  workspace retirement is not authorization to change task commit policy.
- Every task-creating entry point specifies explicit ownership and noninteractive
  missing-input behavior; existing tasks do not gain new identity prerequisites.
- Equivalence includes scoped Git/finish-work decisions; byte preservation and
  absence of runtime consumption are separate proofs with defined boundaries.
- Fixed-version delivery uses a paired castbox/Trellis release bundle, as
  specified in design.md; actual publication remains separately authorized.
- Fork push/release events cannot reach npm publication. Tag naming alone is
  not isolation; the fork's publication guards require executable verification.
- New migration PRDs, AI instructions and actionable terminal guidance reflect
  the target version only. Historical guides remain unchanged as evidence but
  are not replayed as current instructions or used to restore retired behavior.

## Scope

CLI/core contracts where affected; Python runtime and tracked dogfood twins;
template exports, configurators, hooks, commands, shared/bundled skills, native
workflow, configuration and worktree-copy examples, migrations, tests and current
in-repository documentation. Include generic recursive readers, context trust,
template indexing, backup/restore/removal paths insofar as they otherwise consume
or mutate retired data. Derive platforms from live `AI_TOOLS` (22 entries at
inspection), not a manually maintained platform subset.

## Non-Goals

- No modifications to original mindfold-ai upstream, docs-site/marketplace
  owners, global npm, node_modules or Guru Team.
- No rewriting historical tasks/journals or raw platform conversations.
- No unrelated session identity, shell-ticket, channel protocol or `trellis mem`
  redesign; workspace-specific consumers in those surfaces are in scope.
  API developer-role instructions are unrelated to this identity mechanism.
- No adversarial-input, TOCTOU, distributed-lock or extra fault-injection work.
- No release/tag/publication or Issue closure in this phase.

## Planning Status

Requirements and historical-data boundary confirmed; implementation resumed.
The distribution route is selected: castbox/Trellis release assets containing
paired `0.7.0-castbox.N` packages. Exact unused N, artifact verification and
publication permission are release-execution gates, not an unresolved choice of
distribution mechanism. Local candidates are not completed fixed-version delivery.
The former code-graph prerequisite is revoked by the user's expanded scope;
do not install, repair or invoke it. Use direct source/caller inspection,
Git diff review and regression tests instead. The user's boundary confirmation
resolves the material scope addition; no tooling installation is required.

## Confirmed Historical Boundary

The inventory found references in archived task evidence and at least one
historical workspace journal, in addition to active instructions/templates.
The user explicitly excludes historical records from removal. Remove all active
and distributable references, preserve historical records without consuming
them, and report those exclusions explicitly. Historical task directories
(including previous tasks not moved to archive), workspace journals, and Git
commit history stay unchanged. This task's current instructions are not exempt
from removal of executable dependencies. Do not assert repository-wide zero
matches when preserved historical records still match.
Global installation, external repositories and Git commit-history rewriting
are not included in this local scope expansion.
