# Canonical source anchors

Baseline: `5c760463680ffc10a3f26957b330c57a4b0c3ff8`. Read-only inspection on 2026-10-12. Line anchors refer to this baseline; refresh before implementation.

## packages/core/src/task/schema.ts

- `packages/core/src/task/schema.ts:20`: `lifecycle_generation: number;`
- `packages/core/src/task/schema.ts:24`: `status: string;`
- `packages/core/src/task/schema.ts:30`: `completedAt: string | null;`
- `packages/core/src/task/schema.ts:34`: `commit: string | null;`
- `packages/core/src/task/schema.ts:35`: `pr_url: string | null;`
- `packages/core/src/task/schema.ts:50`: `"lifecycle_generation",`
- `packages/core/src/task/schema.ts:54`: `"status",`
- `packages/core/src/task/schema.ts:60`: `"completedAt",`
- `packages/core/src/task/schema.ts:79`: `"status",`
- `packages/core/src/task/schema.ts:89`: `"completedAt",`
- `packages/core/src/task/schema.ts:169`: `if (field === "lifecycle_generation") {`
- `packages/core/src/task/schema.ts:171`: `throw new Error("task.lifecycle_generation must be a non-negative integer");`
- `packages/core/src/task/schema.ts:173`: `record.lifecycle_generation = value;`
- `packages/core/src/task/schema.ts:242`: `lifecycle_generation: 0,`
- `packages/core/src/task/schema.ts:246`: `status: "planning",`
- `packages/core/src/task/schema.ts:252`: `completedAt: null,`
- `packages/core/src/task/schema.ts:255`: `commit: null,`
- `packages/core/src/task/schema.ts:256`: `pr_url: null,`

## packages/core/src/task/phase.ts

- `packages/core/src/task/phase.ts:4`: `* Coarse-grained Trellis task phase derived from task status.`
- `packages/core/src/task/phase.ts:6`: `* Phase is a projection of {@link TrellisTaskRecord.status} only. There is`
- `packages/core/src/task/phase.ts:7`: `* no separate `current_phase` field stored on disk — `inferTaskPhase``
- `packages/core/src/task/phase.ts:13`: `*   status              | phase`
- `packages/core/src/task/phase.ts:30`: `* status string. Accepts a record so callers that already have one don't`
- `packages/core/src/task/phase.ts:31`: `* need to re-pluck `status` first.`
- `packages/core/src/task/phase.ts:33`: `export function inferTaskPhase(`
- `packages/core/src/task/phase.ts:36`: `const status =`
- `packages/core/src/task/phase.ts:39`: `: recordOrStatus?.status;`
- `packages/core/src/task/phase.ts:40`: `switch (status) {`

## packages/core/src/task/records.ts


## packages/core/src/task/migration.ts

- `packages/core/src/task/migration.ts:14`: `(field) => field !== "source" && field !== "lifecycle_generation",`
- `packages/core/src/task/migration.ts:23`: `!["id", "name", "title", "status", "creator", "assignee"].every(`
- `packages/core/src/task/migration.ts:34`: `"completedAt",`
- `packages/core/src/task/migration.ts:81`: `if ("lifecycle_generation" in old) {`
- `packages/core/src/task/migration.ts:82`: `if (old.lifecycle_generation !== record.lifecycle_generation) {`
- `packages/core/src/task/migration.ts:83`: `throw new Error("Migration must retain lifecycle_generation");`
- `packages/core/src/task/migration.ts:85`: `} else if (record.lifecycle_generation !== 0) {`
- `packages/core/src/task/migration.ts:107`: `"status",`
- `packages/core/src/task/migration.ts:115`: `"completedAt",`

## packages/cli/src/templates/trellis/scripts/task.py

- `packages/cli/src/templates/trellis/scripts/task.py:54`: `from common.task_utils import TaskIdentityError, read_task_identity, resolve_lifecycle_target, run_task_hooks`
- `packages/cli/src/templates/trellis/scripts/task.py:91`: `absent status line looks like the task simply was not in planning.`
- `packages/cli/src/templates/trellis/scripts/task.py:106`: `if data.get("status") == "planning":`
- `packages/cli/src/templates/trellis/scripts/task.py:107`: `data["status"] = "in_progress"`
- `packages/cli/src/templates/trellis/scripts/task.py:117`: `"status is unchanged.",`
- `packages/cli/src/templates/trellis/scripts/task.py:128`: `def cmd_start(args: argparse.Namespace) -> int:`
- `packages/cli/src/templates/trellis/scripts/task.py:196`: `read_task_identity(task_json_path, repo_root)`
- `packages/cli/src/templates/trellis/scripts/task.py:217`: `# Still flip task.json status: planning → in_progress so downstream phases proceed.`
- `packages/cli/src/templates/trellis/scripts/task.py:241`: `def cmd_finish(args: argparse.Namespace) -> int:`
- `packages/cli/src/templates/trellis/scripts/task.py:266`: `def cmd_current(args: argparse.Namespace) -> int:`
- `packages/cli/src/templates/trellis/scripts/task.py:292`: `"status": data.get("status"),`
- `packages/cli/src/templates/trellis/scripts/task.py:344`: `def _display_status(t, all_statuses: dict) -> str:`
- `packages/cli/src/templates/trellis/scripts/task.py:345`: `"""Return the status label to show for a task in `list` output.`
- `packages/cli/src/templates/trellis/scripts/task.py:347`: `A parent task's stored status stays "planning" until someone runs`
- `packages/cli/src/templates/trellis/scripts/task.py:351`: `past planning; the stored status.json value is left untouched.`
- `packages/cli/src/templates/trellis/scripts/task.py:353`: `if t.status == "planning" and t.children:`
- `packages/cli/src/templates/trellis/scripts/task.py:355`: `all_statuses.get(c) not in (None, "planning") for c in t.children`
- `packages/cli/src/templates/trellis/scripts/task.py:359`: `return t.status`
- `packages/cli/src/templates/trellis/scripts/task.py:367`: `filter_status = args.status`
- `packages/cli/src/templates/trellis/scripts/task.py:372`: `all_statuses = {name: t.status for name, t in all_tasks.items()}`
- `packages/cli/src/templates/trellis/scripts/task.py:378`: `if filter_status and t.status != filter_status:`
- `packages/cli/src/templates/trellis/scripts/task.py:384`: `"status": t.status,`
- `packages/cli/src/templates/trellis/scripts/task.py:385`: `"display_status": _display_status(t, all_statuses),`
- `packages/cli/src/templates/trellis/scripts/task.py:398`: `if not filter_status or task.status == filter_status`
- `packages/cli/src/templates/trellis/scripts/task.py:410`: `# Apply --status filter`
- `packages/cli/src/templates/trellis/scripts/task.py:411`: `if filter_status and t.status != filter_status:`
- `packages/cli/src/templates/trellis/scripts/task.py:420`: `progress = children_progress(t.children, all_statuses)`
- `packages/cli/src/templates/trellis/scripts/task.py:421`: `status_label = _display_status(t, all_statuses)`
- `packages/cli/src/templates/trellis/scripts/task.py:428`: `print(f"{prefix}{dir_name}/ ({status_label}){pkg_tag}{progress}{marker}")`
- `packages/cli/src/templates/trellis/scripts/task.py:514`: `python3 task.py list [--status <status>] [--json]  List tasks`
- `packages/cli/src/templates/trellis/scripts/task.py:527`: `--status, -s <s>     Filter by status (planning, in_progress, review, completed)`
- `packages/cli/src/templates/trellis/scripts/task.py:547`: `python3 task.py list --status in_progress   # List in-progress tasks`
- `packages/cli/src/templates/trellis/scripts/task.py:703`: `p_list.add_argument("--status", "-s", help="Filter by status")`

## packages/cli/src/templates/trellis/scripts/common/task_store.py

- `packages/cli/src/templates/trellis/scripts/common/task_store.py:69`: `require_unique_task_id,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:70`: `task_identity_from_data,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:468`: `explicit_task_id = getattr(args, "task_id", None)`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:469`: `task_id = explicit_task_id if explicit_task_id is not None else slug`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:470`: `if not TASK_ID_PATTERN.fullmatch(task_id):`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:471`: `source = "--task-id" if explicit_task_id is not None else "derived task id"`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:479`: `print(colored(f"Error: task_id_collision: --force cannot replace an existing task: {dir_name}", Colors.RED), file=sys.stderr)`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:484`: `require_unique_task_id(task_id, get_tasks_dir(workspace), workspace)`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:505`: `if isinstance(existing, dict) and str(existing.get("id", "")).casefold() == task_id.casefold():`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:506`: `raise TaskIdentityError(f"task_id_collision: {task_id!r}: {path} at {head}")`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:519`: `# would rewrite the existing task.json below — resetting status, children,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:560`: `"id": task_id,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:562`: `"lifecycle_generation": 0,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:566`: `"status": "planning",`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:572`: `"completedAt": None,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1143`: `identity = task_identity_from_data(task_data, task_json_path)`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1144`: `require_unique_task_id(`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1145`: `identity.task_id, tasks_dir, repo_root, exclude=task_dir`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1217`: `def cmd_archive(args: argparse.Namespace) -> int:`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1269`: `identity = task_identity_from_data(task_data, task_json_path)`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1270`: `require_unique_task_id(`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1271`: `identity.task_id, tasks_dir, repo_root, exclude=task_dir`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1297`: `identity.task_id, identity.lifecycle_generation, repo_root`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1305`: `# Update status before archiving`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1313`: `data["status"] = "completed"`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1314`: `data["completedAt"] = today`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1320`: `"with the wrong status.",`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1393`: `identity.task_id,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1394`: `identity.lifecycle_generation,`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1415`: `"Resolve `git status` before continuing.",`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1449`: `and points users at ``task_auto_commit: false``.`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1457`: `"[OK] task_auto_commit: false — skipping git stage/commit.",`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py:1566`: `"[WARN] Close whatever holds the lock (an IDE git integration, a status",`

## packages/cli/src/templates/trellis/scripts/common/tasks.py

- `packages/cli/src/templates/trellis/scripts/common/tasks.py:10`: `get_all_statuses   — Get {dir_name: status} map for children progress`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:60`: `status=data.get("status", "unknown"),`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:100`: `def get_all_statuses(tasks_dir: Path) -> dict[str, str]:`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:101`: `"""Get a {dir_name: status} mapping for all active tasks.`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:109`: `Dict mapping directory names to status strings.`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:111`: `return {t.dir_name: t.status for t in iter_active_tasks(tasks_dir)}`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:116`: `all_statuses: dict[str, str],`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:122`: `all_statuses: Status map from get_all_statuses().`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:129`: `# A child missing from active statuses has been archived (cmd_archive`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:130`: `# sets status=completed before moving the dir). Count it as done so`
- `packages/cli/src/templates/trellis/scripts/common/tasks.py:134`: `if c not in all_statuses or all_statuses.get(c) in ("completed", "done")`

## packages/cli/src/templates/trellis/scripts/common/task_queue.py

- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:6`: `list_tasks_by_status   - List tasks by status`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:7`: `list_pending_tasks     - List tasks with pending status`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:32`: `"status": t.status,`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:43`: `def list_tasks_by_status(`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:44`: `filter_status: str | None = None,`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:47`: `"""List tasks by status.`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:50`: `filter_status: Optional status filter.`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:54`: `List of task info dicts with keys: priority, id, title, status.`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:63`: `if filter_status and t.status != filter_status:`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:79`: `return list_tasks_by_status("planning", repo_root)`
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py:127`: `print(f"  {task['priority']}|{task['id']}|{task['title']}|{task['status']}")`

## packages/cli/src/templates/trellis/scripts/common/session_storage.py

- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:15`: `read_json_checked, read_task_id_reservation, write_json,`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:17`: `from .task_utils import TASK_ID_PATTERN, TaskIdentityError, lifecycle_generation`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:36`: `task_id: str`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:37`: `lifecycle_generation: int`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:142`: `facts: RepositoryFacts, task_id: str, generation: int,`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:147`: `path = facts.common_dir / "trellis" / "task-branches" / task_id / f"{generation}.json"`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:152`: `raise SessionBindingError(f"binding_required: {task_id!r}")`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:155`: `"schema_version", "task_id", "lifecycle_generation", "binding_revision", "branch_name",`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:156`: `} or (binding["schema_version"] != "1.0" or binding["task_id"] != task_id`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:157`: `or type(binding["lifecycle_generation"]) is not int`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:158`: `or binding["lifecycle_generation"] != generation`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:265`: `if type(data.get("schema_version")) is not int or data["schema_version"] != 2:`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:269`: `expected = {"schema_version", "task_id", "lifecycle_generation"}`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:272`: `task_id = data.get("task_id")`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:273`: `if not isinstance(task_id, str) or not TASK_ID_PATTERN.fullmatch(task_id):`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:274`: `raise SessionBindingError(f"invalid_task_id: {path}")`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:276`: `generation = lifecycle_generation(data, path)`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:279`: `return SessionRecord(path, root.resolve(), task_id, generation, data)`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:318`: `def resolve_task_identity(`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:319`: `facts: RepositoryFacts, task_id: str, generation: int,`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:323`: `folded = task_id.casefold()`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:328`: `bound_workspace = _bound_task_workspace(facts, task_id, generation, workspaces)`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:353`: `candidate_id, reason = read_task_id_reservation(task_json)`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:362`: `if candidate_id != task_id:`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:369`: `candidate_generation = lifecycle_generation(data, task_json)`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:383`: `f"task_id_casefold_collision: {task_id!r}: {detail}"`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:390`: `raise SessionBindingError(f"ambiguous_task_identity: {task_id!r}")`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:399`: `f"stale_lifecycle_generation: {task_id!r} expected {generation}: "`
- `packages/cli/src/templates/trellis/scripts/common/session_storage.py:402`: `raise SessionBindingError(f"stale_task_identity: {task_id!r}")`

## packages/cli/src/templates/shared-hooks/inject-workflow-state.py

- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:34`: `or missing a usable status, the hook emits a task_error breadcrumb instead of`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:166`: ```(task_id, "task_error", source)`` is distinct from ``None``: a session`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:174`: `task_id = Path(active.task_path).name if active.task_path else "session binding"`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:175`: `return task_id, "task_error", active.source`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:189`: `task_id = data.get("id") or task_dir.name`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:190`: `status = data.get("status", "")`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:191`: `if not isinstance(status, str) or not status:`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:193`: `return task_id, status, active.source`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:210`: `Returns {status: body_text}. workflow.md is the single source of`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:235`: `status = match.group(1)`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:238`: `result[status] = body`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:328`: `body which is per-status. Mode tells AI which dispatch protocol to follow;`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:347`: `status: str, platform: str | None, config: dict`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:351`: `Codex defaults to ``auto`` and therefore uses the ordinary ``<status>```
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:354`: `the parallel ``<status>-inline`` tag; ``sub-agent`` remains an alias for`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:358`: `Non-codex platforms return the plain status unchanged.`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:362`: `return f"{status}-inline" if mode == "inline" else status`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:363`: `return status`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:367`: `task_id: Optional[str],`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:368`: `status: str,`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:375`: `- Known status (tag present in workflow.md) → detailed template body`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:376`: `- Unknown status (no tag, or workflow.md missing) → generic`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:378`: `- `no_task` pseudo-status (task_id is None) → header omits task info`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:380`: `lookup_key = breadcrumb_key or status`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:382`: `if body is None and lookup_key != status:`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:383`: `body = templates.get(status)`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:386`: `header = f"Status: {status}" if task_id is None else f"Task: {task_id} ({status})"`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:457`: `task_id, status, source = task`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:458`: `status_key = resolve_breadcrumb_key(status, platform, config)`
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:461`: `task_id, status, templates, source_for_breadcrumb, breadcrumb_key=status_key`

## packages/cli/src/templates/opencode/plugins/inject-workflow-state.js

- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:21`: `*   - task.json malformed or missing status`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:118`: `* Returns {status: body}. workflow.md is the single source of truth —`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:136`: `const status = match[1]`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:138`: `if (body) result[status] = body`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:144`: `* Get (taskId, status) from active task, or null if no active task.`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:147`: `if (active.error || active.stale) return { id: "session binding", status: "task_error", source: active.source, error: active.error || "stale binding" }`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:153`: `return { id: taskRef.split("/").pop(), status: "stale", source: active.source }`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:156`: `if (!ctx.isActivePath(taskJsonPath) || !existsSync(taskJsonPath)) return { id: taskRef, status: "task_error", source: active.source }`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:159`: `const status = typeof data.status === "string" ? data.status : ""`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:160`: `if (!status) return { id: taskRef, status: "task_error", source: active.source }`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:162`: `return { id, status, source: active.source }`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:164`: `return { id: taskRef, status: "task_error", source: active.source }`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:170`: `* - Known status (tag present in workflow.md) → detailed body`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:171`: `* - Unknown status (no tag, or workflow.md missing) → generic`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:173`: `* - no_task pseudo-status (id === null) → header omits task info`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:175`: `function buildBreadcrumb(id, status, templates) {`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:176`: `let body = templates[status]`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:180`: `let header = id === null ? `Status: ${status}` : `Task: ${id} (${status})``
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:225`: `? buildBreadcrumb(task.id, task.status, templates, task.source)`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:235`: `"status",`
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:236`: `task ? task.status : "no_task",`

## packages/cli/src/commands/init.ts

- `packages/cli/src/commands/init.ts:561`: `status: "in_progress",`
- `packages/cli/src/commands/init.ts:667`: `// Opt-in Claude Code statusLine: only for platforms actually being added`
- `packages/cli/src/commands/init.ts:698`: `"   ↳ Trellis statusLine installed (--with-statusline)",`
- `packages/cli/src/commands/init.ts:726`: `* Interactive opt-in for the Claude Code statusLine when `--with-statusline``
- `packages/cli/src/commands/init.ts:744`: `"Install Trellis statusLine for Claude Code? (status bar: model, context, branch, rate limits)",`
- `packages/cli/src/commands/init.ts:784`: `/** Claude Code only: install the opt-in Trellis statusLine (--with-statusline) */`
- `packages/cli/src/commands/init.ts:1192`: `// Opt-in Claude Code statusLine: confirm interactively when the flag wasn't passed`
- `packages/cli/src/commands/init.ts:1664`: `chalk.gray("   ↳ Trellis statusLine installed (--with-statusline)"),`

## packages/cli/src/commands/migrate.ts

- `packages/cli/src/commands/migrate.ts:25`: `schema_version: z.literal("1.0"),`
- `packages/cli/src/commands/migrate.ts:85`: `status: "preview" | "migrated";`
- `packages/cli/src/commands/migrate.ts:387`: `status: options.dryRun ? "preview" : "migrated",`

## packages/cli/src/types/ai-tools.ts


