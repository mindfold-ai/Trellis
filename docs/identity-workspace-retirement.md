# Identity and Workspace Retirement

This is breaking migration guidance for the identity-free target. It is not a
release announcement: a verified fixed-version artifact bundle and separately
authorized publication are still required for downstream installation.

## Command Migration

| Previous surface | Current action |
| --- | --- |
| Init `--user/-u` | Remove it; provide `--creator` and `--assignee` only when init creates a bootstrap task |
| Task create with implicit owner | Supply both explicit fields; neither is inferred from Git or copied from the other |
| Task list `--mine/-m` | Use `--assignee <name>`; exact filtering also works with `--json` and `--status` |
| Identity initialization/read scripts | Retired; no replacement global identity store |
| Record context and session-recording commands | Retired; use default context and task-only finish/archive |
| Automatic per-developer joiner task | Retired; explicitly create an onboarding task when needed |
| `session_auto_commit` | Deprecated archive-only compatibility; use `task_auto_commit` |

```sh
python3 .trellis/scripts/task.py create "Example" --description "Example task" --creator alice --assignee bob
python3 .trellis/scripts/task.py list --assignee bob --status in_progress --json
python3 .trellis/scripts/get_context.py --json
trellis init --yes --codex --creator alice --assignee bob
trellis update --migrate --assignee bob
```

Use the configured Python executable on Windows. Missing ownership on a new task
fails before writes; noninteractive calls do not prompt. Existing task ownership
is preserved and reading/resuming an existing task requires no new person input.
Task archive defaults to auto-commit as before. Explicit `task_auto_commit` wins
over legacy `session_auto_commit`; absent both, the default is true. Explicit
false remains an opt-out. Neither setting enables recording.

## Custom Integrations

Remove imports of `common.developer`, `get_developer`, workspace/index/journal
path helpers, and personal-task helpers. Replace `list_my_tasks` with
`common.task_queue.list_tasks_by_assignee(assignee, filter_status=None,
repo_root=None)` using explicit caller input. Archive configuration consumers use
`common.config.get_task_auto_commit(repo_root=None)`.
`safe_trellis_paths_to_add` is removed. Archive callers provide the exact
destination Path to `safe_archive_paths_to_add(repo_root, archive_dest,
modified_children=None)`; do not stage the whole archive tree.

Default context JSON removes `developer` and `journal` (`file`, `lines`,
`nearLimit`). Use `currentTask: {path, source, contextKey} | null` for the validated
session binding. `tasks.active` and `tasks.directory` describe project inventory,
not tasks assigned to the current person. `git` and optional `packageGit` remain.
Record-specific Python context functions are removed.

Remove active workflow/hook actions that initialize identity, record sessions,
scan historical workspace, or provision journal merge attributes. Review only
the active managed paths in the update plan and explicitly selected automation,
not recursive history scans. Required customized runtime conflicts must be
reconciled before update can succeed; skip and `.new` alone cannot complete the
retirement. Force may replace approved managed code, never historical data.
Incompatible external workflows are rejected, not silently replaced.

## Historical Data

Leave `.trellis/.developer`, all `.trellis/workspace/**`, and
`.trellis/agent-traces/**` and existing `.trellis/.backup-*` snapshots untouched,
including arbitrary files, indexes and
symlinks. New runtime does not read, index, copy, migrate, restore or delete them.
Historical tasks/journals are evidence, not instructions to replay. Existing user
merge attributes remain untouched. No replacement global journal/index is created.

Uninstall preserves retired roots in place while removing active data. Ablation
backs up active data only and writes schema-2 transactions. Its `v1` storage path
is retained for discovery; schema-1 recovery records are rejected before backup
reads or mutation. Ablation/removal of a symlinked `.trellis` root is refused;
task-root symlinks are supported. Read-only context supports an external `.trellis`
store, with history checks relative to its resolved root, including aliases.
Workspace paths cannot be used as context even via explicit trust.
This restriction also applies to task JSONL entries and subagent context, including
backup snapshots. Repeated uninstall leaves a history-only directory alone;
missing ownership for remaining active files requires reconciliation, not deletion
of the historical directory.

## Upgrade and Delivery

The target-owned cumulative guide supports 0.0.x/0.1.x predecessors, 0.2.x through
0.6.x and their prereleases, earlier `0.7.0-castbox.N` targets, and same-target
reapply; unsupported upgrade sources fail explicitly. An explicit
`--allow-downgrade` retains the existing best-effort template refresh behavior in
this identity-free CLI; it does not run reverse migrations or restore retired
data. Without that flag, downgrades remain refused. Follow the resolved
current migration plan for surviving shell-to-Python, skill and platform changes.
Do not concatenate obsolete historical manifest instructions. Reused migration
tasks retain their custom text and ownership; incompatible instructions block
until explicitly reconciled.

Updates preserve leaf-link metadata for rollback. Unsupported symlink parents
on affected managed paths are rejected before writes; an omitted backup entry
must never be interpreted as permission to delete a pre-existing link.

Use the verified paired fork tarballs, exact SHA/tag and SHA256SUMS from the
authorized release handoff. Install both artifacts together in an isolated prefix
and verify the resolved core matches the supplied artifact. No floating branch,
upstream npm publication, global install or downstream adoption is implied here.

Executable contracts and validation assertions:
[Identity-Free Task Lifecycle](../.trellis/spec/cli/backend/identity-free-task-lifecycle.md)
and [Release Process](../.trellis/spec/cli/backend/release-process.md).
