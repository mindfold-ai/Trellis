# Reproduction Evidence

## Baseline

2026-09-14: git ls-remote upstream refs/heads/main and GitHub commits/main matched
local HEAD f08ed655d800e6580e5fe950308ac1edfe74b10e. CLI/core versions: 0.6.17.
Issue #3 and merged PR #4 establish developer/workspace retirement. No matching
open fix Issue/PR was found in repository lists. These are timestamped facts.

Primary: /Users/wumengye/Documents/GoProjects/Trellis
Linked: /Users/wumengye/Documents/GoProjects/Trellis-session-binding-repro
Common: /Users/wumengye/Documents/GoProjects/Trellis/.git
Both were registered in git worktree list --porcelain.

Each resource creation/start had separate user authorization. Fixture
.trellis/tasks/09-14-session-binding-repro uses creator/assignee codex-repro.
First create failed for missing --description without writes; corrected create
succeeded. Fixture start uses --allow-empty-context, not a formal planning bypass.

## Executed Commands

From linked checkout:

```sh
env -u TRELLIS_CONTEXT_ID PYTHONDONTWRITEBYTECODE=1 CODEX_THREAD_ID=trellis-worktree-repro-20260914 python3 .trellis/scripts/task.py start .trellis/tasks/09-14-session-binding-repro --allow-empty-context
```

Exit 0, status in_progress. Only linked local runtime contained
codex_trellis-worktree-repro-20260914.json:

```json
{"platform":"codex","last_seen_at":"2026-09-14T09:33:12Z","current_task":".trellis/tasks/09-14-session-binding-repro","current_run":null}
```

Run separately in both checkouts:

```sh
env -u TRELLIS_CONTEXT_ID PYTHONDONTWRITEBYTECODE=1 CODEX_THREAD_ID=trellis-worktree-repro-20260914 python3 .trellis/scripts/task.py current --json
env -u TRELLIS_CONTEXT_ID PYTHONDONTWRITEBYTECODE=1 CODEX_THREAD_ID=trellis-worktree-repro-20260914 python3 .trellis/scripts/get_context.py --json
```

| Probe | Linked | Primary |
| --- | --- | --- |
| current CLI | exit 0, correct task | exit 1, null task, source none, stale false |
| get_context CLI | exit 0, correct currentTask | exit 0, currentTask null |
| resolve_active_task | correct task | task_path null, source_type none |
| Codex _get_task_status | IN_PROGRESS, fixture title | NO ACTIVE TASK |
| Shared SessionStart _resolve_active_task | correct task | none |
| Workflow-state get_active_task | fixture/in_progress/session:key | null |

Hook functions were imported from real shipped modules using importlib.util.
Each was passed the caller root and hook input containing session_id, platform
codex and caller cwd. Environment and hook context keys both resolved to
codex_trellis-worktree-repro-20260914. No membership/path functions were mocked.
These hook probes were NOT complete stdin entrypoint tests. The session was
first activated in linked checkout; automated A1 must additionally establish
identity in primary before creating its temporary worktree.

## Source Anchors

Python common paths below are under packages/cli/src/templates/trellis/scripts/.

- common/active_task.py:165: ActiveTask lacks caller/common/task-root fields.
- common/active_task.py:255: checkout-local session storage.
- common/active_task.py:693: corrupt binding becomes {}, losing error evidence.
- common/active_task.py:775: persisted task ref lacks workspace identity.
- task.py:305 and common/session_context.py:618: joins against caller root.
- common/paths.py:220: task directory helper uses caller root.
- common/packages_context.py:49: task-derived package selection consumer.
- common/task_store.py:1008,1334,1461: rename/archive preflight and clearing.
- shared-hooks/inject-subagent-context.py:970,1158: injection consumers.
- opencode/lib/trellis-context.js:378: independent local reader and fallback.
- snow/hooks/write-trellis-context.py:420: additional local runtime reader.

Platform paths are under packages/cli/src/templates/. Anchors bind the observed
baseline; recheck after edits. Moving storage alone does not fix caller joins.

## Remaining Gaps

No implementation, complete tests, install/update smoke, failed-state matrix or
cross-checkout finish/archive has run. No tag/Release/npm publication was
performed by this session. Inspected workflows were ci.yml and publish.yml;
publish.yml is tag/Release-triggered and gated to mindfold-ai/trellis. No usable
Nightly artifact has been verified. Main remained clean; fixture bytes and
test binding are retained, not authorized for cleanup.
