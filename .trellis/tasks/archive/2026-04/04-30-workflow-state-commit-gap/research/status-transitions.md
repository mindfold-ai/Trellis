# Research: task.json.status state machine

- **Query**: Survey every code path that mutates `task.json.status` across the Trellis runtime + CLI; build a definitive transition map.
- **Scope**: internal
- **Date**: 2026-04-30
- **Repo root**: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis`

> Runtime sources at `.trellis/scripts/**` are byte-identical to the CLI templates at `packages/cli/src/templates/trellis/scripts/**` (verified `diff -q`). Line numbers below cite the CLI template tree (the source of truth shipped via `trellis init`).

---

## TL;DR — the answer to the closing question

Given a `task.json` in any state, the producing/consuming command is fully determined by `status`:

| `status` value | Last command that wrote it | Command that moves it forward |
|---|---|---|
| `planning` | `task.py create` *or* `trellis update --migrate` (migration task) *or* TS factory default | `task.py start <dir>` → `in_progress` |
| `in_progress` | `task.py start` *or* `trellis init` (bootstrap / joiner task) | `task.py archive <dir>` → `completed` (and dir moves to `archive/`) |
| `completed` | `task.py archive <dir>` (only writer) | None — the dir is `mv`'d into `tasks/archive/YYYY-MM/` in the same call |
| any other (`in-review`, `blocked-by-team`, …) | A human/script that hand-edited `task.json` | No code path; only `inject-workflow-state.py` parses the value via `[workflow-state:STATUS]` tags |

There is **no `completed` writer outside `cmd_archive`**, and `archive` couples the status flip with the directory move atomically — so a task is never observable as `completed` while still in the active `tasks/` dir for more than the few microseconds between `write_json` and `shutil.move`.

---

## 1. Writers of `task.json.status` (exhaustive)

Five production writers, plus one Linear-sync side writer that does not touch the `status` field.

| # | Writer | File:Line | Value written | Trigger |
|---|---|---|---|---|
| 1 | `cmd_create` | `packages/cli/src/templates/trellis/scripts/common/task_store.py:206` | `"planning"` (literal) | `python3 task.py create "<title>"` |
| 2 | `cmd_start` | `packages/cli/src/templates/trellis/scripts/task.py:109-111` | `"in_progress"` (only if previous was `"planning"`) | `python3 task.py start <dir>` |
| 3 | `cmd_archive` | `packages/cli/src/templates/trellis/scripts/common/task_store.py:319-323` | `"completed"` + sets `completedAt = today` | `python3 task.py archive <dir>` (also called from `/trellis:finish-work` step 3) |
| 4 | `emptyTaskJson` | `packages/cli/src/utils/task-json.ts:54` | `"planning"` (factory default) | TS callers; consumed by writers 5a / 5b below |
| 5a | `getBootstrapTaskJson` | `packages/cli/src/commands/init.ts:417` | `"in_progress"` (overrides factory default) | `trellis init` on a fresh repo (creator path) |
| 5b | `getJoinerTaskJson` | `packages/cli/src/commands/init.ts:460` | `"in_progress"` (overrides factory default) | `trellis init` joining an existing project (`.trellis/` exists, `.developer` missing) |
| 6 | migration-task block | `packages/cli/src/commands/update.ts:2215-2226` | `"planning"` | `trellis update` (when a breaking-change migration manifest exists for the version delta) |

All six writers go through `write_json` (Python) or `fs.writeFileSync` (TS) — there is no in-place patcher; every write rewrites the whole file.

### Snippet — `cmd_create` (the only place a brand-new task.json is born)

`packages/cli/src/templates/trellis/scripts/common/task_store.py:201-228`

```python
task_data = {
    "id": slug,
    ...
    "status": "planning",
    ...
}
write_json(task_json_path, task_data)
```

### Snippet — `cmd_start` (the only `planning -> in_progress` transition)

`packages/cli/src/templates/trellis/scripts/task.py:107-112`

```python
task_json_path = full_path / FILE_TASK_JSON
if task_json_path.is_file():
    data = read_json(task_json_path)
    if data and data.get("status") == "planning":
        data["status"] = "in_progress"
        if write_json(task_json_path, data):
            print(colored("✓ Status: planning → in_progress", Colors.GREEN))
```

Note: gated by `data.get("status") == "planning"`. If the task is already `in_progress`, `completed`, or any custom status, **`task.py start` does nothing to the field** (it still sets the session active-task pointer and runs `after_start` hooks).

### Snippet — `cmd_archive` (the only `* -> completed` writer)

`packages/cli/src/templates/trellis/scripts/common/task_store.py:316-345`

```python
# Update status before archiving
today = datetime.now().strftime("%Y-%m-%d")
if task_json_path.is_file():
    data = read_json(task_json_path)
    if data:
        data["status"] = "completed"
        data["completedAt"] = today
        write_json(task_json_path, data)
        ...
# Clear any session that still points at this task before the path moves.
clear_task_from_sessions(str(task_dir), repo_root)
# Archive
result = archive_task_complete(task_dir, repo_root)  # shutil.move
```

The status flip is **unconditional** — there is no guard like "only flip if previous was `in_progress`". An archive of a `planning` task will still write `completed` and immediately move the directory to `tasks/archive/YYYY-MM/`.

### TS factory + its two callers

The TS writers all funnel through `emptyTaskJson` (`packages/cli/src/utils/task-json.ts:47`), whose `status` default is `"planning"`. Callers override:

- **Bootstrap task** (`commands/init.ts:412-425`) overrides to `"in_progress"` (the user is already working on it — there is no separate `start` step in the bootstrap flow).
- **Joiner onboarding task** (`commands/init.ts:454-469`) overrides to `"in_progress"` for the same reason.
- **Migration task** (`commands/update.ts:2215-2226`) keeps `"planning"` — the user is expected to read the migration guide before running it, so a separate `task.py start` is appropriate.

### Hooks that DON'T write status (verified absence)

- `packages/cli/src/templates/shared-hooks/inject-subagent-context.py` — only reads (`grep` returned no `status` writes).
- `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js` — same.
- `packages/cli/src/templates/shared-hooks/session-start.py` — only reads.
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` — only reads.
- `packages/cli/src/templates/trellis/scripts/hooks/linear_sync.py` — writes `task["meta"]["linear_issue"]` (`linear_sync.py:154-157`) but never touches `task["status"]`. Linear's own status workflow is mirrored separately via `linearis issues update -s "In Progress"|"Done"`.

This was a confirmed concern from the spec at `cli/backend/quality-guidelines.md:264` ("Schema Deprecation: Audit ALL Writers, Not Just the Creator"): the old historical writer `inject-subagent-context.py:update_current_phase` *did* re-write a deprecated `current_phase` field, but that function was deleted in 0.5.0-beta. No writer of `task.json.status` exists in any hook today.

---

## 2. Readers of `task.json.status`

Readers fall into three buckets: data-access shim, list/filter UIs, and breadcrumb hooks.

### 2.a Data access (single source of truth)

| File:Line | Reader | What it does |
|---|---|---|
| `common/tasks.py:44` | `load_task` | `data.get("status", "unknown")` → returns `TaskInfo.status`. **All other Python code reads via this layer.** |
| `common/tasks.py:108-112` | `children_progress` | Counts a child as "done" if `status in ("completed", "done")` *or* the child dir is missing from active set (treated as archived). |

The `"done"` half of that tuple is dead code with respect to the writers above — no writer ever produces `"done"`. It survives as tolerance for hand-edited or externally-synced task files.

### 2.b List / filter UIs

| File:Line | Reader | Conditional behaviour |
|---|---|---|
| `task.py:175-202` | `cmd_list` | `--status <s>` flag filters; `t.status` printed inline as `({status})`. |
| `common/task_queue.py:67` | `list_tasks_by_status` | Filter helper used by `add_session.py` etc. |
| `common/task_queue.py:83` | `list_pending_tasks` | Hard-coded query for `"planning"`. |
| `common/task_queue.py:110` | `list_tasks_by_assignee` | Optional status filter. |
| `common/session_context.py:164, 320, 425, 443, 505` | session-start payload | Includes `t.status` in JSON / formatted output. |
| `common/session_context.py:340` | "my tasks" filter | Excludes tasks where `status == "done"` (again, never written by any code path). |
| `common/session_context.py:420` | parent progress aggregator | Same `("completed", "done")` tolerance. |

### 2.c Breadcrumb / session-start hooks (decision-makers)

| File:Line | Reader | Behaviour |
|---|---|---|
| `shared-hooks/session-start.py:268-321` | `_get_task_status` | Branches on `task_status == "completed"` (Case 3) → emits "load `trellis-update-spec`, then archive" prompt. Otherwise drops into PLANNING / READY decisions based on existence of `prd.md` and curated `implement.jsonl`. **Does not read `"in_progress"` directly** — uses the absence of `"completed"` and presence of artifacts. |
| `shared-hooks/inject-workflow-state.py:122-125` | `get_active_task` | Reads `data.get("status", "")`; returns `None` if status is empty/non-string. Otherwise feeds `(task_id, status, source)` to `build_breadcrumb`. |
| `shared-hooks/inject-workflow-state.py:144-200` | `_FALLBACK_BREADCRUMBS` | Hardcoded blocks for `"no_task" / "planning" / "in_progress" / "completed"`. Anything else falls through to the generic "Refer to workflow.md" body in `build_breadcrumb` (line 244). |
| `codex/hooks/session-start.py:166-169` | platform variant | Same `task_status == "completed"` branch. |
| `copilot/hooks/session-start.py:166` | platform variant | Same. |
| `opencode/plugins/session-start.js:81` | platform variant | Same. |

The breadcrumb design **explicitly accepts custom statuses**: `_TAG_RE` at `inject-workflow-state.py:134` is `[A-Za-z0-9_-]+`, and the regex matches `[workflow-state:STATUS]…[/workflow-state:STATUS]` blocks in `workflow.md`. That gives users a well-defined extension point — see §8.

---

## 3. State-transition table

Built from §1, in the canonical order an end-to-end task sees:

| From | To | Trigger (CLI) | Mechanism (file:line) | Notes |
|---|---|---|---|---|
| (no file) | `planning` | `task.py create "<title>"` | `task_store.py:206` (literal in initial `task_data` dict) | Fires `after_create` hook (`task_store.py:282`). |
| (no file) | `planning` | `trellis update` (when migration manifest exists) | `update.ts:2215` (TS factory call with `status: "planning"`) | One-time bootstrap of a `MM-DD-migrate-vX.Y.Z` task. |
| (no file) | `in_progress` | `trellis init` (creator) | `init.ts:412` (`getBootstrapTaskJson`, overrides factory default) | Bootstrap task is born in-progress because the user is already working it. |
| (no file) | `in_progress` | `trellis init` (joiner) | `init.ts:454` (`getJoinerTaskJson`) | Joiner onboarding task; same reasoning. |
| `planning` | `in_progress` | `task.py start <dir>` | `task.py:109-111` (guarded by `if status == "planning"`) | Fires `after_start` hook (`task.py:117`). |
| `in_progress` | `in_progress` | `task.py start <dir>` (re-run) | `task.py:109` short-circuits | Idempotent; only the session active-task pointer is updated. |
| `completed` | `completed` | `task.py start <dir>` | same | Idempotent. |
| `*` | `*` | `task.py finish` | (no status write) | Clears the **session active-task pointer** only (`active_task.py:556-557` deletes the per-session JSON). Fires `after_finish` hook (`task.py:141`). |
| `*` (any active) | `completed` | `task.py archive <dir>` | `task_store.py:319-323` (unconditional flip) | Then `clear_task_from_sessions` (line 345), then `shutil.move` to `archive/YYYY-MM/` (`task_utils.py:138`), then auto-`git commit` of the move (`task_store.py:369-387` `_auto_commit_archive`), then `after_archive` hook (`task_store.py:363`). |
| `completed` (in `archive/`) | — | (no further transitions) | dir lives in `archive/YYYY-MM/<task>` | Read-only as far as code is concerned. |

### Dead-letter cells (transitions code allows but no command produces)

- **`completed` → `in_progress`**: nothing prevents an external editor from writing this and then the task continuing. `task.py start` would not flip it back (the guard requires `"planning"`). The session would just hold the pointer.
- **Direct `planning` → `completed`** (skipping `in_progress`): `task.py archive` allows this. The status is set to `"completed"` regardless of prior value.
- **`in_progress` → `planning`**: no code path. `task.py start` will not regress.

---

## 4. Is `archive` a status transition or a directory move?

**Both, atomically.**

`cmd_archive` (`task_store.py:290-366`) is one command that performs four side effects in order:

1. Writes `data["status"] = "completed"` + `data["completedAt"] = today` → `write_json` (lines 319-323).
2. For each child in `data["children"]`, clears the child's `parent` field (lines 332-341). The child stays in `children` so parent progress doesn't regress.
3. `clear_task_from_sessions(str(task_dir), repo_root)` (line 345) — deletes any per-session JSON in `.trellis/.runtime/sessions/` that points at this task. See §6.
4. `archive_task_complete` → `archive_task_dir` → `shutil.move(task_dir, archive/YYYY-MM/<name>)` (`task_utils.py:138`).

Then optionally:

5. `_auto_commit_archive` — `git add -A .trellis/tasks` + commit `chore(task): archive <name>` (lines 369-387). Suppressed by `--no-commit`.
6. `run_task_hooks("after_archive", archived_json, repo_root)` (line 363) — note the path is the **post-move** path.

So "archived" is a status **and** a location:
- In active tree: status was `planning | in_progress | …`, dir at `.trellis/tasks/<name>/`.
- After archive: status is `completed`, dir at `.trellis/tasks/archive/YYYY-MM/<name>/`.
- There is no observable intermediate state where status is `completed` but the dir is still in the active tree, except for the few microseconds between step 1 and step 4. (Crash-window race, but no concurrent reader is supposed to write the file.)

`children_progress` in `tasks.py:108-111` papers over the rare case where a child has been archived but the parent's `children` list still contains the name — a missing dir is treated as "done", giving consistent `[N/M done]` output.

---

## 5. `run_task_hooks` events — the lifecycle taxonomy

### 5.a Dispatcher

`packages/cli/src/templates/trellis/scripts/common/task_utils.py:218-261`

```python
def run_task_hooks(event: str, task_json_path: Path, repo_root: Path) -> None:
    commands = get_hooks(event, repo_root)   # config.yaml -> hooks.<event>
    if not commands: return
    env = {**os.environ, "TASK_JSON_PATH": str(task_json_path)}
    for cmd in commands:
        subprocess.run(cmd, shell=True, cwd=repo_root, env=env, ...)
```

Hooks are user-configured shell commands listed under `hooks.<event>:` in `.trellis/config.yaml`. Each command receives:
- `cwd = repo_root`
- `TASK_JSON_PATH` env var = absolute path to the task's `task.json`
- All other env vars from the parent shell

Failure is non-blocking: a non-zero exit prints `[WARN]` to stderr but does not abort the parent operation.

### 5.b Event names emitted (the closed set)

Greppable across the runtime; only four events are ever fired:

| Event | Emitted at | Path passed |
|---|---|---|
| `after_create` | `task_store.py:282` (end of `cmd_create`) | new task's `task.json` |
| `after_start` | `task.py:117` (end of `cmd_start`, after status flip) | active-tree `task.json` |
| `after_finish` | `task.py:141` (end of `cmd_finish`, before pointer cleared on disk) | last active task's `task.json` (still in active tree) |
| `after_archive` | `task_store.py:363` (end of `cmd_archive`, after move) | **archived** path, i.e. `tasks/archive/YYYY-MM/<name>/task.json` |

Documented in `packages/cli/src/templates/trellis/config.yaml:25-33` (commented-out scaffold) and `common/bundled-skills/trellis-meta/references/customize-local/change-task-lifecycle.md:18-21`.

### 5.c Subscribers

The repo ships exactly one hook script that consumes these events: `linear_sync.py` (`packages/cli/src/templates/trellis/scripts/hooks/linear_sync.py`).

| `linear_sync.py` action | Suggested wiring | What it does |
|---|---|---|
| `create` (line 117) | `hooks.after_create: ["python3 .trellis/scripts/hooks/linear_sync.py create"]` | Creates a Linear issue, stores `meta.linear_issue` on `task.json`. |
| `start` (line 161) | `hooks.after_start` | Updates Linear issue status to `STATUS_IN_PROGRESS = "In Progress"` (line 44). |
| `archive` (line 171) | `hooks.after_archive` | Updates Linear issue status to `STATUS_DONE = "Done"` (line 45). |
| `sync` (line 180) | manual | Pushes `prd.md` content to Linear description. |

Note `linear_sync.py` reads `TASK_JSON_PATH` and writes `meta.linear_issue` back into `task.json` (line 156-157), but never touches `task["status"]`. Linear status is a parallel state machine maintained by the `linearis` CLI.

### 5.d Event-vs-status relation

The events are **lifecycle bookmarks**, not status transitions:

- `after_create` fires once; status is `planning` at that moment.
- `after_start` fires every time a task is set active; status was just flipped to `in_progress` *if it was* `planning` — but `after_start` also fires when re-starting an `in_progress` or `completed` task without any status change.
- `after_finish` does not change status at all (only clears the session pointer). The status stays whatever it was.
- `after_archive` fires after the status has already been forced to `completed`.

A user wiring `hooks.after_finish: linear_sync.py …` in hopes of marking the Linear issue done would be surprised: `task.py finish` does not mean "task is done", it means "the AI session is closing the active-task pointer". The Linear-archive symmetry is intentionally wired to `after_archive`, not `after_finish`.

---

## 6. `session_state` vs `task.json.status` — two parallel state systems

### 6.a What each tracks

| Concept | Where it lives | Scope | Read by |
|---|---|---|---|
| `task.json.status` | `.trellis/tasks/<task>/task.json` | Per-task lifecycle (created → in-flight → archived) | All consumers above |
| Session active-task pointer | `.trellis/.runtime/sessions/<context_key>.json` (`current_task` field) | Per-AI-session/window pointer to which task this conversation is working on | `inject-workflow-state.py`, `session-start.py`, `task.py current` |

### 6.b Active-task pointer mechanics

`active_task.py:515-541` (`set_active_task`) resolves a `context_key` (derived from `CLAUDE_SESSION_ID`, `CURSOR_CONVERSATION_ID`, etc., per `_ENV_SESSION_KEYS` at lines 48-60) and writes a per-session JSON:

```json
{
  "platform": "claude",
  "last_seen_at": "2026-04-30T...Z",
  "session_id": "...",
  "current_task": ".trellis/tasks/04-30-foo",
  "current_run": null
}
```

`resolve_active_task` (lines 466-486) reads it back. If the resolved task dir doesn't exist on disk, the active task is flagged `stale=True` and `inject-workflow-state.py` emits a `STALE POINTER` breadcrumb instructing the AI to run `task.py finish`.

### 6.c When the pointer changes (independent of status)

| Action | Pointer effect | Status effect |
|---|---|---|
| `task.py start <dir>` | sets pointer to `<dir>` | flips `planning → in_progress` if applicable |
| `task.py finish` | deletes the per-session JSON (`active_task.py:556-557`) | **none** — status is unchanged |
| `task.py archive <dir>` | calls `clear_task_from_sessions(<dir>, …)` (`task_store.py:344-345`) which scans **all** session files and deletes any pointing at `<dir>` (lines `active_task.py:561-583`) | flips to `completed` |

The asymmetry between `finish` and `archive` is deliberate:
- `finish` = "close my session window" — task is left as-is, possibly to be resumed later from a different session.
- `archive` = "this task is done forever" — status flipped + dir moved + every session pointing at it is cleaned up so no future session resumes a phantom.

### 6.d Consistency checks

There are no proactive cross-checks (e.g. "if task.json says completed, the pointer must be cleared"). The system relies on:
- `archive` always clearing pointers (so `completed` + active pointer should never coexist *unless* a user hand-edited `task.json`).
- `inject-workflow-state.py` and `session-start.py` re-validating on every prompt: stale pointer → emit warning, no `prd.md` → emit PLANNING breadcrumb, status `completed` → emit "archive me" breadcrumb.

The breadcrumb path is the only "consistency reconciler" — it's read-only on disk but tells the AI what corrective command to run.

---

## 7. Cross-platform parity (TS factory vs Python writer)

| Field | Python `cmd_create` (`task_store.py:201-226`) | TS `emptyTaskJson` (`task-json.ts:49-74`) | Aligned? |
|---|---|---|---|
| `status` default | `"planning"` | `"planning"` | yes |
| `priority` default | `args.priority` (CLI default `"P2"` per `task.py:378`) | `"P2"` | yes |
| `priority` for bootstrap | n/a | `"P1"` (override) | n/a |
| `completedAt` | `None` | `null` | yes |
| `dev_type` | `None` | `null` | yes (Python writes `None`, TS writes `null`; both serialize to JSON `null`) |
| field count | 24 fields | 24 fields | yes (per beta-9 unification — see migration manifest `0.5.0-beta.9.json`) |

The schema-deprecation guideline at `.trellis/spec/cli/backend/quality-guidelines.md:264-329` explicitly captured a previous drift (legacy `current_phase` / `next_action` fields) and the fix was to route every TS writer through `emptyTaskJson`. The current `init.ts` and `update.ts` writers do exactly that, with explicit overrides for `status`, `priority`, etc.

**Status defaults are aligned across all three writers.** No drift.

---

## 8. Custom statuses — defined extension point, no code path that creates them

### 8.a What's documented

`packages/cli/src/templates/trellis/workflow.md:504-512` (the comment block immediately above the `[workflow-state:…]` blocks):

```markdown
Tag STATUS matches task.json.status. Default statuses: planning /
in_progress / completed. Add custom status blocks as needed (hyphens
and underscores allowed). Hook falls back to built-in defaults when
a status has no tag block.
```

`inject-workflow-state.py:130-137`:

```python
# Supports STATUS values with letters, digits, underscores, hyphens
# (so "in-review" / "blocked-by-team" work alongside "in_progress").
_TAG_RE = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)
```

### 8.b What writes them

**Nothing.** Searched all writers (§1) plus the `--include="*.py"` and `--include="*.ts"` trees: the only string literals ever written to `task.json.status` are `"planning"`, `"in_progress"`, and `"completed"`.

A custom status appears in `task.json` only if:
1. A user manually edits `task.json` to set it (e.g. via `jq -i .status='"in-review"' task.json`), or
2. A custom `hooks.after_*` shell command writes it (theoretical — no shipped hook does this).

### 8.c What reads them

When a custom status is present:
- `inject-workflow-state.py:204-227` (`load_breadcrumbs`) parses any matching `[workflow-state:STATUS]` block from `workflow.md` and uses it.
- If no matching block exists, `build_breadcrumb` (line 242-244) emits `"Refer to workflow.md for current step."` as a generic body.
- `session-start.py:_get_task_status` falls into Case 5 (READY) for any non-`completed` status that has a `prd.md`, regardless of name.
- `task.py list --status <s>` honors arbitrary string values (no whitelist).

The takeaway from the task description ("if a user/script manually edits task.json.status, the breadcrumb falls through to the parser") is **correct and exact**. Custom statuses are a one-way extension: humans set them, the breadcrumb hook surfaces them, and only `task.py archive` will ever return the value to a known one.

---

## 9. Files cited

### Primary writers
- `packages/cli/src/templates/trellis/scripts/task.py` (lines 70-122 `cmd_start` / `cmd_finish`)
- `packages/cli/src/templates/trellis/scripts/common/task_store.py` (lines 139-283 `cmd_create`, 290-366 `cmd_archive`, 369-387 `_auto_commit_archive`)
- `packages/cli/src/utils/task-json.ts` (lines 47-76)
- `packages/cli/src/commands/init.ts` (lines 400-469)
- `packages/cli/src/commands/update.ts` (lines 2210-2230)

### Readers / breadcrumbs
- `packages/cli/src/templates/trellis/scripts/common/tasks.py` (lines 23-112)
- `packages/cli/src/templates/trellis/scripts/common/task_queue.py` (lines 47-114)
- `packages/cli/src/templates/trellis/scripts/common/session_context.py` (lines 164, 320, 340, 420, 425, 443, 505)
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` (lines 100-289)
- `packages/cli/src/templates/shared-hooks/session-start.py` (lines 220-321)
- `packages/cli/src/templates/codex/hooks/session-start.py` (line 169)
- `packages/cli/src/templates/copilot/hooks/session-start.py` (line 166)
- `packages/cli/src/templates/opencode/plugins/session-start.js` (line 81)

### Lifecycle / hooks
- `packages/cli/src/templates/trellis/scripts/common/task_utils.py` (lines 218-261 `run_task_hooks`, lines 106-167 archive helpers)
- `packages/cli/src/templates/trellis/scripts/common/active_task.py` (lines 466-583 active-task + `clear_task_from_sessions`)
- `packages/cli/src/templates/trellis/scripts/common/config.py` (lines 190-207 `get_hooks`)
- `packages/cli/src/templates/trellis/scripts/hooks/linear_sync.py` (lines 117-178)
- `packages/cli/src/templates/trellis/config.yaml` (lines 17-33 hooks scaffold)

### Workflow + spec
- `packages/cli/src/templates/trellis/workflow.md` (lines 500-541 `[workflow-state:*]` blocks)
- `.trellis/spec/cli/backend/quality-guidelines.md` (lines 264-329 Schema Deprecation guideline)
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-task-lifecycle.md` (lines 18-38 hook taxonomy)

### Skill that consumes the lifecycle
- `.claude/commands/trellis/finish-work.md` (drives `task.py archive` from the AI side)

---

## 10. Caveats / Not Found

- **No `"completed"` writer outside `cmd_archive`.** Confirmed by searching all `*.py`, `*.ts`, `*.js` files: the literal `"completed"` appears only in (a) the writer at `task_store.py:321`, (b) readers comparing to it, and (c) workflow.md / breadcrumb bodies. The user's reported observation holds.
- **No `"done"` writer.** The literal `"done"` appears only in tolerant readers (`tasks.py:110`, `session_context.py:340, 420`). Likely vestigial — possibly an early-version status name or a planned external-system import path. No code path produces it today.
- **No `"review" / "in-review"` writer.** Only mentioned as an example in workflow.md and the help text at `task.py:311` (`Filter by status (planning, in_progress, review, completed)` — that string is the *help text*, not a defined value).
- **`finish-work` skill does NOT directly mutate `task.json.status`.** It runs `task.py archive` (`finish-work.md:38`), which is the writer. No silent additional writes.
- The runtime tree at `.trellis/scripts/` and the source tree at `packages/cli/src/templates/trellis/scripts/` are byte-identical (verified `diff -q`). All line numbers are valid for both trees.
- I did not exhaustively audit every backup directory under `.trellis/.backup-*`. Those are stash dumps and not loaded at runtime.
- I did not audit `dist/` or `packages/cli/dist/` — those are built artifacts; sources above are authoritative.
