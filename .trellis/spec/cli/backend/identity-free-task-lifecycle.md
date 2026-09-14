# Identity-Free Task Lifecycle

## 1. Scope / Trigger

Current contract for identity/workspace retirement (#3): installation, update,
task factories, session context, archive, context trust, and managed storage.
This supersedes historical identity/journal contracts, not platform session
keys, Git worktrees, package-manager workspaces, or raw `trellis mem` stores.

## 2. Signatures

```sh
python3 .trellis/scripts/task.py create "Example" --description "Example task" --creator alice --assignee bob
python3 .trellis/scripts/task.py list --assignee bob --status in_progress --json
python3 .trellis/scripts/task.py current --source
python3 .trellis/scripts/get_context.py --mode default --json
trellis init --yes --codex --creator alice --assignee bob
trellis update --migrate --assignee bob
```

- Python `common.config.get_task_auto_commit(repo_root: Path | None = None) -> bool`.
- `common.safe_commit.safe_archive_paths_to_add(repo_root: Path,
  archive_dest: Path, modified_children: list[str] | None = None) -> list[str]`
  receives the exact archive destination; `safe_trellis_paths_to_add` is removed.
- `common.task_queue.list_tasks_by_assignee(assignee: str,
  filter_status: str | None = None, repo_root: Path | None = None) -> list[dict]`;
  `list_my_tasks` is removed.
- Storage guards: `isRetiredDataPath(filePath: string, trellisRoot?: string): boolean`,
  `resolveTrellisDataRoot(cwd: string): string`,
  `activeTrellisChildren(trellisDir: string): string[]`, and
  `removeActiveTrellisData(trellisDir: string): void` in `utils/retired-data.ts`.
- Node access classification is owned by core and re-exported by CLI:
  `assertActiveDataPath(filePath: string, cwd: string): string` returns the
  metadata-resolved active path or throws. Python uses
  `common.history_paths.require_active_path(path: Path, repo_root: Path) -> None`.
- `--mine/-m`, init `--user/-u`, context `--mode record`, and legacy identity/
  recording entry scripts are retirement errors, not aliases or successful no-ops.

## 3. Contracts

### Ownership and routing

| Creator of a new task | Creator input | Assignee input |
| --- | --- | --- |
| `task.py create` / automated factory | Explicit caller field | Explicit caller field |
| Init bootstrap | `--creator` or invocation-local interactive answer | `--assignee` or invocation-local interactive answer |
| Update migration task | Fixed actor `trellis-update` | `--assignee` or invocation-local interactive answer |

Both fields must be nonempty before task writes. Do not copy assignee to creator,
infer either from Git configuration, environment identity, another task or main
worktree. Init/update that create no task need no ownership input. Reuse existing
task metadata without rewriting owners. Bootstrap follows install/spec state;
there is no automatic per-developer joiner task.

Task selection uses explicit task arguments or validated session bindings plus
checkout/Git facts, never personal ownership. `list --assignee` is an exact filter
in text/tree and JSON, composable with status. Default context distinguishes the
current-session task from project task inventory; it removes identity, workspace,
index, journal and inferred personal-task fields without historical fallbacks.
Default JSON removes `developer` and `journal` (including `file`, `lines`,
`nearLimit`). It retains `git`, `tasks.active`, `tasks.directory`, optional
`packageGit`, and adds `currentTask: {path, source, contextKey} | null`.
`tasks.active` is project inventory, not a personal or current-session selection.

### Data, archive and upgrade

`.trellis/.developer`, `.trellis/workspace/**`, `.trellis/agent-traces/**`, and
existing `.trellis/.backup-*` snapshots
are protected historical data, including arbitrary files and symlinks. Prune
them before descent, content reads, hashes, copies, scans, mutation or indexing.
A parent listing needed to exclude a name is allowed; inspecting descendants
to prove preservation is not product behavior. Reject retired context paths even
when explicitly trusted. Only task-root symlinks qualify for Trellis auto-trust.
Apply this boundary before JSONL file/directory materialization in both shared
subagent hooks and OpenCode, and in OMP event handlers. Git context probes also
exclude historical backup roots. Missing injected history alone is insufficient:
tests must verify no forbidden IO was attempted and valid context still loads.
When `.trellis` points to an external store, classify resolved aliases relative
to that resolved store root too; a literal `.trellis` path-component check alone
does not protect its history. Boundary resolution is metadata-only.

Apply the boundary to manifests themselves before add/list/validate/count and
rename preflight, not only to referenced context. Settings, registry, receipt
and managed-file aliases must be checked before reading or rewriting targets.
Channel storage overrides, bucket/channel aliases and migration destinations
must reject historical roots, including nonexistent descendants of aliases;
the workflow container itself is not a channel storage root.
Directory validation does not validate child files: guard the final event,
sequence, lock, worker and bucket-marker paths before using them. Python's
shared task-root lookup must reject historical aliases before lookup, listing
or creation, and configuration reads must reject historical aliases instead of
parsing their values or silently falling back. Ordinary active task links and
configuration defaults remain supported.
Task inventories skip historical child-directory or task.json aliases before
reading their contents; explicit mutations reject them, including create with
force. Name resolution, creation targets, rename references and archive targets
must validate their actual paths rather than inheriting trust from tasks/.
Both config readers (`common.config` and `common.trellis_config`) apply the
shared boundary. The YAML parser remains independently loadable.

SDK-supplied cwd is operation-local authority for channel path checks. Forward
it through event reads/writes, sequence/lock paths, inbox/watch and worker PID
operations; only omitted cwd defaults to process.cwd(). Do not introduce a
global cwd cache or persist a replacement identity. Init checks tasks/ before
its empty-directory probe. Update may preserve a custom statusLine only when
its command is compatible; force does not bypass that reconciliation gate.

Platform task-status/breadcrumb readers and compact task counts obey the same
task boundary, including metadata aliases. Python hooks reuse load_task and
forward the project root to inventory reads; standalone platform readers use
their existing guarded file resolver. Retired metadata must not enter prompts.
The ablation recovery root and derived transaction, state, backup and lock paths
are also active storage: reject historical aliases before any lock, mkdir,
content read or permission change, even when storage is outside the project.
Worker spawn preflights event/sequence/lock paths before runtime.start; a
predictable historical-path rejection must not leave a started worker behind.

Session storage is subject to the same boundary: validate runtime/session
directories and pointer files before enumeration, reads, creation, deletion or
repointing. Historical task-reference targets are always invalid/stale,
independent of their existence. Retain session-key and active-data fallback
rules; historical storage cannot supply a binding. Standalone platform readers
apply equivalent checks. Archive and rename validate session storage before
changing task status or moving task directories. OpenCode compact counts exclude
historical roots and
metadata aliases before existence probes, so adding historical target bytes
cannot change the count of active tasks.
The pre-shell ticket producer must apply the same boundary before creating its
directory, scanning or reading tickets, deleting expired tickets, or writing a
new ticket. Validate all cleanup candidates before deleting any. A consumer-side
rejection is too late to protect producer writes. Normal ticket TTL and host
response formats remain unchanged; historical storage produces a nonzero
retirement diagnostic before an allow response or mutation.
Configuration and workflow source files are subject to this boundary before
parsing, not just the paths they reference. Channel trust, injection limits,
prompt-skip settings, phase queries, SessionStart summaries and per-turn
breadcrumbs must not consume historical source aliases. Standalone platform
readers reuse their guarded file helpers; historical config is also excluded
from context-cache signatures. Active sources retain their existing parsing,
defaults and cache invalidation behavior.
The optional Bash environment bridge validates the actual CLAUDE_ENV_FILE target
before reading its last export or appending. Relative env-file paths retain
their process-cwd meaning. Historical targets are skipped without consumption;
normal last-assignment deduplication is unchanged.
Spec discovery uses the same predicate before probing roots, layers, guide
indexes and nested indexes, including legacy-layout checks. Historical aliases
must not appear as current spec layers or recommended index paths. Keep active
layout/scope rules and legitimate nonhistorical links unchanged.
Native adapters are part of the same boundary, including Pi's text/binary and
manifest readers, Snow's source summaries and log destination, and StatusLine's
task metadata/count probes. Verify their real callbacks or hook entrypoints;
platform-template text scans alone do not establish runtime isolation.
Optional update reminders validate both the project version source and their
runtime marker before access. A historical path rejection, including one during
session-key resolution, skips the optional reminder without probing versions,
writing a marker or failing the primary context operation.

Known legacy recording commands without stock receipt evidence block update
and remain intact, even with force. Prose such as `Never forget to run` or
`Do not forget to export` is an instruction, not a retirement prohibition.
An executable code line or shell command is not a retirement explanation just
because its comment says `deprecated`. Preserve harmless prose and unrelated
package-manager workspace references.
Generic workspace/journal nouns are not retirement evidence: pnpm/Cargo workspace
commands and database journal diagnostics remain valid in imported and customized
workflows. Match explicit Trellis paths/APIs or direct legacy recording actions;
force update must preserve these compatible custom workflows too.

No workspace/index creation, inherited identity, trace rename, journal rotation,
recording, merge-rule provisioning, or replacement global journal/index remains.
Existing historical data and user `.gitattributes` rules remain untouched.
Uninstall removes active data only. Ablation snapshots/restores active data only;
incompatible old whole-tree transactions fail before mutation or historical reads.
Repeated uninstall with only historical entries is a no-op based on parent names
only. If active entries remain without a readable ownership manifest, fail with
reconciliation guidance, never a suggestion to delete all of `.trellis/`.

Archive keeps its task-scoped commit policy: `task_auto_commit`, then deprecated
archive-only `session_auto_commit` with warning, then `true`. Use the shared bool
parser (including quoted aliases and inline comments); invalid explicit values
warn and use the default. Explicit opt-outs remain effective. Never stage other
tasks, retired data or unrelated staged files. Finish-work uses task evidence,
scoped Git checks and selected-task archive, with no recording step.

Git status/diff subprocesses exclude retired paths in their arguments, not after
reading them. Do not confuse Git's index with the retired Markdown index.

Update preflights task ownership, required managed-file conflicts and workflow
compatibility before writes/backups/receipts. A skipped required runtime file or
`.new`-only result blocks convergence; force never overrides historical protection.
Postcheck enabled assets and generated instructions before version/hash completion.
On failure report nonzero, preserve the previous version, restore only this run's
managed changes where possible, and report rollback gaps. Retry must reconcile
receipts without duplicating tasks. Dry-run writes nothing.
Original symlinks are not new files simply because content backup skipped them;
restore their metadata or reject unsupported link boundaries during preflight.

Migration instructions are target-owned cumulative guidance for supported source
intervals, not concatenated historical manifest prose. Preserve published manifests
and existing custom migration tasks; incompatible reused instructions block before
mutation. Unknown source intervals fail explicitly. External workflow owners are
not edited; incompatible selections are rejected, never silently switched.
The explicit `--allow-downgrade` escape hatch refreshes the running identity-free
templates without reverse migration or historical-data restoration. It is not
authorization for implicit downgrades, and does not generate a migration task.

## 4. Validation & Error Matrix

| Input / condition | Required result |
| --- | --- |
| Missing creator or assignee on task creation | Exit 2 before task writes; name missing input |
| Noninteractive init/update needs unresolved ownership | Exit 2 before installation/update mutation; never prompt |
| Existing task operation | No new ownership gate or owner backfill |
| `--mine`, record mode, retired init flag/script | Nonzero retirement diagnostic; no historical access |
| Explicit assignee has no matches | Empty result, never broaden to all tasks |
| Retired context/trust path | Reject before content access |
| Required customized runtime cannot converge | Nonzero before writes; files/tasks/hashes/version unchanged |
| Old recovery transaction includes retired data | Refuse before historical access or mutation |
| Tracked archive commit fails while enabled | Nonzero; report remaining task move, no false completion |

## 5. Good/Base/Bad Cases

- Good: caller supplies distinct creator/assignee; task creation and resume behave
  identically with absent or different historical data.
- Base: existing task is resumed and archived without any new person input.
- Bad: resolve `.developer` from the main worktree, use Git user.name as hidden
  authority, read journals to reconstruct current context, or mark a partial
  runtime upgrade successful because files were copied.

## 6. Tests Required

- `task-meta`, `task-list-tree`, and `task-archive` integration suites: missing
  input/no writes, exact text/JSON filters, stable ownership, parallel-task staging,
  default/legacy/new config precedence, explicit opt-out and archive failures.
- Init/update/workflow suites: fresh/repeated init, both init paths, no joiner,
  customized required conflicts, same-version retry, and cumulative instructions
  crossing 0.3.0-beta.0 plus the immediate predecessor. Old manifests stay identical.
- Context, channel trust, template hash, ablate/restore and uninstall suites:
  retired paths pruned before access, including symlinks and generic tree operations.
- Registry-derived platform collection/install/update and runnable hook smoke;
  Python source/dogfood parity. Text absence alone is not runtime evidence.
- External fixture verifier compares every historical filename, byte and symlink
  target before/after. Separately observe product IO and subprocess arguments;
  missing OS-level read evidence is a reported gap, not a passing zero-read claim.
- Fix HEAD, task, caller and non-retired files; vary historical trees/environment
  and tracked/untracked history. Normalize timestamps/fixture roots only. Compare
  exits, selected task, owners, context, scoped dirty status and finish decisions.

## 7. Cross-Worktree Session Contract

### Scope / Trigger

Session resolution, lifecycle and context readers distinguish invocation checkout
from task workspace. Git worktrees are not the retired workspace mechanism.

### Signatures and Storage

`resolve_active_task` returns `ActiveTask` retaining `task_path`, `source_type`,
`context_key`, `stale`, plus `invocation_root`, `repository_common_dir`,
`task_workspace_root`, `resolved_task_path` and `error`. Consumers use validated
absolute paths, not caller-root joins. Git storage is
`<git-common-dir>/trellis/sessions/<key>.json`, schema version 1, containing
`repository_common_dir`, `task_workspace_root` and relative `current_task`.
Non-Git projects keep checkout-local storage.

### Contracts

Live Git common-dir and registered-worktree checks establish membership; stored
claims and remote URLs do not. Task containment uses the effective task root
and preserves existing nonhistorical symlink rules. Missing new records may
read one valid legacy match for the same key in live registered worktrees.
Reads do not promote. A known key miss/error cannot select another session.
Identity-less compatibility never becomes repository-wide task inference.

Finish clears the session including legacy state that could resurrect it.
Archive clears every binding to the exact workspace-qualified task. Rename
repoints them. Equal relative refs in different worktrees are distinct tasks.
Preflight storage before moves; run lifecycle hooks in task workspace and report
partial cleanup/repoint failures explicitly.

### Validation and Error Matrix

| State | Result |
| --- | --- |
| No identity or binding | No active task, no inference |
| One valid common/legacy binding | Validated workspace and absolute task path |
| Malformed binding or unreadable/missing task.json | Explicit error/stale, nonzero CLI |
| Wrong common-dir or unregistered worktree | Explicit error/stale, no task mutation |
| Multiple legacy matches | Conflict, no selection |
| Valid new plus legacy records | New binding wins |
| Outside tasks root or retired target | Rejected, no historical consumption |

### Good / Base / Bad Cases

Good: linked start, primary resolve. Base: non-Git local binding. Bad: caller
root joined with task ref, newest legacy record selection, corrupt JSON as {}.

### Required Tests

Use real Git/worktrees for CLI and actual hook entrypoints, multiple sessions
and repositories, equal task names, lifecycle, legacy conflicts, corruption,
unregistration, non-Git and installation/update. Text snapshots are insufficient.

### Wrong vs Correct

Wrong: `task_dir = invocation_root / active.task_path`.
Correct: reject error/stale, use `active.resolved_task_path` and
`active.task_workspace_root` for task reads.

## 8. Identity-Free Usage Examples

```sh
# Wrong: implicit personal selection and removed recording workflow.
python3 .trellis/scripts/task.py list --mine

# Correct: operation-local filtering; no identity is persisted.
python3 .trellis/scripts/task.py list --assignee bob --json
```

Use [Release Process](./release-process.md) for fixed-version fork delivery.
Local implementation/test evidence is not package publication or downstream adoption.
