# Research: workflow-state breadcrumb subsystem — state machine, sources, and gaps

- **Query**: Survey the `<workflow-state>` breadcrumb subsystem. Identify all statuses, what triggers transitions, drift between the three text sources, dead branches, and gaps where a breadcrumb's "next step" hint is not produced by any code path.
- **Scope**: internal (Trellis codebase: `packages/cli/src/templates/...`)
- **Date**: 2026-04-30
- **Repo root**: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis`

---

## TL;DR

| Question | Answer |
|---|---|
| Defined statuses (in any source) | `no_task`, `planning`, `in_progress`, `completed` |
| Statuses written into `task.json` by code | `planning` (cmd_create), `in_progress` (cmd_start), `completed` (cmd_archive) |
| Statuses produced by the hook **without** matching `task.json.status` | `no_task` (no active task), `stale_<source_type>` (active task points at deleted dir) |
| Pseudo / synthetic statuses (regex-allowed but never persisted) | any custom tag the user adds; `stale_*` family |
| Dead transitions | **`completed` is unreachable while a task is active.** `cmd_archive` writes `status="completed"` and then the same call moves the task directory under `archive/<YYYY-MM>/`. The breadcrumb hook only inspects active tasks under `.trellis/tasks/`, so the `completed` branch of `_FALLBACK_BREADCRUMBS` is never injected in normal flow. |
| Drift between the three text sources | `_FALLBACK_BREADCRUMBS` (py) and `FALLBACK_BREADCRUMBS` (js) are **byte-identical** for all four statuses. `workflow.md` has drifted from both for `no_task` and `in_progress` (minor wording polish was applied to the markdown but never propagated to the Python/JS fallbacks). |
| User-flagged commit gap | Confirmed. The `in_progress` breadcrumb says `Flow: trellis-implement → trellis-check → trellis-update-spec → finish` but no command transitions `in_progress → completed`, no command runs Phase 3.4 (commit), and the `completed` breadcrumb that *would* have nagged about the dirty tree is never reachable. |

---

## 1. The three text sources

Three files must stay in sync. All three carry the same four status keys (`no_task`, `planning`, `in_progress`, `completed`); the layout differs.

### 1.1 `packages/cli/src/templates/shared-hooks/inject-workflow-state.py`

- `_TAG_RE` defined at line 134 — accepts STATUS over `[A-Za-z0-9_-]+`, so any `letters/digits/underscores/hyphens` tag is parseable.
- `_FALLBACK_BREADCRUMBS` defined at line 144 — hardcoded fallback bodies for the four built-in statuses.
- `load_breadcrumbs(root)` at line 204 — copies `_FALLBACK_BREADCRUMBS` into a result dict, then overrides any key whose tag is found in `.trellis/workflow.md`.
- `build_breadcrumb(...)` at line 230 — looks up the status in the merged `templates` dict; if missing, prints `"Refer to workflow.md for current step."`.

This file is shared across all hook-capable platforms. It is written into each platform's hooks directory at `init`/`update` time (per the docstring at lines 11-14).

### 1.2 `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js`

- `TAG_RE` at line 30 — same regex as Python.
- `FALLBACK_BREADCRUMBS` at line 37 — JS version of the same dict.
- `loadBreadcrumbs(directory)` at line 96 — same merge-with-fallback logic.
- `buildBreadcrumb(...)` at line 144 — same template-or-generic logic.

This is the per-turn `chat.message` plugin for the OpenCode platform, which uses a JS plugin model rather than the shared Python hook.

### 1.3 `packages/cli/src/templates/trellis/workflow.md`

Live `[workflow-state:STATUS]…[/workflow-state:STATUS]` blocks at lines 514-540 (`no_task`, `planning`, `in_progress`, `completed`, in that order). The HTML comment at lines 504-512 explains the contract:

> "Tag STATUS matches task.json.status. Default statuses: planning / in_progress / completed. Add custom status blocks as needed (hyphens and underscores allowed). Hook falls back to built-in defaults when a status has no tag block."

The walkthrough section above (Phases 1-4, lines 99-498) is human-prose and does not auto-feed the breadcrumbs.

### 1.4 Precedence at runtime

`load_breadcrumbs` / `loadBreadcrumbs`:

```python
result = dict(_FALLBACK_BREADCRUMBS)         # py: line 212
... for match in _TAG_RE.finditer(content):
        if body: result[status] = body       # workflow.md overrides fallback
```

So the precedence is **`workflow.md` wins over the hardcoded fallback whenever a tag block exists and is non-empty**. Custom statuses defined only in `workflow.md` (no fallback entry) come through verbatim. Custom statuses with neither tag nor fallback fall back to the generic line in `build_breadcrumb`:

> `"Refer to workflow.md for current step."` (py: line 244, js: line 147)

### 1.5 Cross-source drift

Programmatic comparison (concat `+`-joined JS strings, `ast.literal_eval` of the Python dict, regex extract of the markdown blocks):

| status | py == js | py == md | js == md | drift summary |
|---|:-:|:-:|:-:|---|
| `no_task` | ✅ | ❌ | ❌ | Two sentences in `workflow.md` were polished ("none of the override phrases below apply" vs "no override below applies"; "honor it for this turn — briefly acknowledge … then proceed" vs "honor it for this turn — briefly acknowledge … and proceed") but the same edits were not applied to either fallback. |
| `planning` | ✅ | ✅ | ✅ | All three identical. |
| `in_progress` | ✅ | ❌ | ❌ | Last sentence: workflow.md says `"Per-turn only; do not carry forward; do NOT invent…"` while the fallbacks say `"Per-turn only; does not carry forward; do NOT invent…"`. Single-word grammar drift. |
| `completed` | ✅ | ✅ | ✅ | All three identical. |

**Net**: the Python and JS fallbacks are kept in lockstep but the markdown is edited out-of-band — the polish edits never propagate down. Operationally the user always sees the markdown text (because workflow.md exists in any initialized project, so its tag wins over the fallback), so the fallbacks are stale only for users whose `workflow.md` has been deleted.

---

## 2. All known statuses

### 2.1 What the parser allows

`_TAG_RE` (`inject-workflow-state.py:134`):

```python
_TAG_RE = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)
```

Any STATUS made of letters, digits, underscores, or hyphens is parseable. Examples in the comment block of workflow.md (line 511): `"in-review"`, `"blocked-by-team"`. None of those custom tags appear in the bundled `workflow.md` — only the four defaults.

### 2.2 Statuses produced by the hook

| Status string | Where it comes from | Header rendered |
|---|---|---|
| `planning` / `in_progress` / `completed` | `task.json.status` field, read in `get_active_task()` (`inject-workflow-state.py:122`) | `Task: <id> (<status>)\nSource: <session source>` |
| `no_task` | Synthesized when `get_active_task()` returns `None` (main: line 273) | `Status: no_task` |
| `stale_<source_type>` | When the resolver flags `active.stale=True` (line 110-111). `<source_type>` comes from `resolve_active_task`'s ActiveTask data — typical values are session/window/branch/git source ids. | `Task: <id> (stale_<source_type>)` — the matching breadcrumb body always falls through to the generic `"Refer to workflow.md for current step."` because no fallback or tag exists for `stale_*`. |
| Any custom tag in workflow.md (e.g. `in-review`) | Merged into `templates` by `load_breadcrumbs` | Renders normally if `task.json.status` matches |

### 2.3 Statuses persisted in `task.json`

Three writes only — they are the only places where `data["status"] = ...` happens in the bundled scripts:

| File:line | Mutation |
|---|---|
| `packages/cli/src/templates/trellis/scripts/common/task_store.py:206` | `cmd_create` initializes `"status": "planning"` |
| `packages/cli/src/templates/trellis/scripts/task.py:110` | `cmd_start` flips `planning → in_progress` (only if currently `planning`) |
| `packages/cli/src/templates/trellis/scripts/common/task_store.py:321` | `cmd_archive` writes `"status": "completed"` then moves the task directory under `archive/` |

There are zero other writers of `data["status"]` anywhere in `packages/cli/src/templates/trellis/scripts/` (verified by `grep -rn '"status"\|''status''' …`).

`packages/cli/src/templates/trellis/scripts/task.py` and `.trellis/scripts/task.py` (the runtime copy in this repo) are byte-identical (`diff` returns empty) — confirming that the runtime script is the same file documented above.

---

## 3. State transition map

Compact form. Each row is a `task.json.status` value; "Entry" = command/code that *writes* that status; "Exit" = command/code that *moves out* of that status; "Reachability" = whether any code path actually puts a task there.

| Status | Entry trigger | Exact mutation site | Breadcrumb hint (current md text) | Exit trigger | Reachability |
|---|---|---|---|---|---|
| `(no row in task.json)` → `planning` | `task.py create` | `task_store.py:206` `"status": "planning"` (in `task_data` literal) | "Complete prd.md via trellis-brainstorm skill; then run task.py start." | `task.py start` (when `data["status"] == "planning"`, `task.py:110`) | Always reachable; created on every new task. |
| `planning` → `in_progress` | `task.py start` | `task.py:110` `data["status"] = "in_progress"` (gated on `data.get("status") == "planning"` at line 109) | "Flow: trellis-implement → trellis-check → trellis-update-spec → finish. Next required action: inspect conversation history + git status, then execute the next uncompleted step in that sequence. …" | **No command writes `in_progress → completed` while the task is active.** Only `task.py archive` advances out of `in_progress`, and it goes straight to `completed` *and simultaneously* relocates the task directory under `archive/`. | Always reachable. |
| `in_progress` → `completed` | `task.py archive` | `task_store.py:321` `data["status"] = "completed"` followed by `archive_task_complete(task_dir, repo_root)` at line 348 | "Code committed via Phase 3.4; run `/trellis:finish-work` to wrap up (archive task + record session). If you reach this state with uncommitted code, return to Phase 3.4 first — `/finish-work` refuses to run on a dirty working tree. `task.py archive` deletes runtime session files that point at the archived task." | Terminal — no exit transition; archived. | **The status value is reachable on disk, but only inside `archive/<YYYY-MM>/<task>/task.json`.** The breadcrumb hook never reads from `archive/`; the active-task resolver only walks `.trellis/tasks/`. |
| Pseudo: `no_task` | Hook synthesizes when `get_active_task() is None` (`inject-workflow-state.py:273`) | Not persisted | "No active task. Trigger words …" | Setting an active task via `task.py start` | Always reachable when no session is active. |
| Pseudo: `stale_<src>` | Hook synthesizes when `active.stale` (`inject-workflow-state.py:110-111`) | Not persisted | Generic fallback (`"Refer to workflow.md for current step."`) | `task.py finish` (clears session) or re-creating the missing task dir | Reachable when session-runtime points at a deleted task dir. |

### 3.1 Quoted mutation sites

`packages/cli/src/templates/trellis/scripts/common/task_store.py:201-207` (cmd_create):

```python
task_data = {
    "id": slug,
    "name": slug,
    "title": args.title,
    "description": args.description or "",
    "status": "planning",
    ...
```

`packages/cli/src/templates/trellis/scripts/task.py:106-112` (cmd_start):

```python
task_json_path = full_path / FILE_TASK_JSON
if task_json_path.is_file():
    data = read_json(task_json_path)
    if data and data.get("status") == "planning":
        data["status"] = "in_progress"
        if write_json(task_json_path, data):
            print(colored("✓ Status: planning → in_progress", Colors.GREEN))
```

Note the gate at line 109: only `planning` flips. If a task is already `in_progress` and you re-run `task.py start`, the status is left alone — re-`start` is idempotent w.r.t. status.

`packages/cli/src/templates/trellis/scripts/common/task_store.py:316-323` (cmd_archive):

```python
# Update status before archiving
today = datetime.now().strftime("%Y-%m-%d")
if task_json_path.is_file():
    data = read_json(task_json_path)
    if data:
        data["status"] = "completed"
        data["completedAt"] = today
        write_json(task_json_path, data)
```

Then at `task_store.py:343-348` the directory is physically moved to archive:

```python
# Clear any session that still points at this task before the path moves.
from .active_task import clear_task_from_sessions
clear_task_from_sessions(str(task_dir), repo_root)

# Archive
result = archive_task_complete(task_dir, repo_root)
```

So `status="completed"` and "directory under `archive/`" land in the same call — there is no observable in-between state where an active task carries `status=completed`.

---

## 4. Dead branches — confirmed and refuted

### 4.1 `completed` breadcrumb is effectively unreachable

**Confirmed.** The user's observation holds.

- The hook's resolver (`inject-workflow-state.py:101-125`) walks `task_dir = root / active.task_path` (where `active.task_path` comes from session/git/branch resolvers) and reads `task.json.status`.
- After `task.py archive`, the task path is moved to `archive/<YYYY-MM>/<dir>/`. Even though the JSON inside that path now contains `status: "completed"`, the resolver never points at `archive/` (sessions referencing the task are explicitly cleared at `task_store.py:343-345`'s `clear_task_from_sessions` call before the move).
- Therefore the only way to see `status: "completed"` rendered is to either:
  1. Manually edit a non-archived `task.json` to set status to `completed` and have a session pointing at it. (Off-spec; nothing in the codebase does this.)
  2. Add a custom hook (`hooks.after_*`) that flips status. (Possible, but no bundled hook does this.)

**The `completed` breadcrumb's wording assumes Phase 3.4 (commit) and Phase 3.5 (finish-work) are both still pending.** That contradicts the actual code: by the time `cmd_archive` writes `status="completed"`, the user has already invoked `/finish-work`, which itself only runs after Phase 3.4 (workflow.md:497-498). So the breadcrumb describes a moment that does not exist in the bundled flow.

### 4.2 `stale_*` and any custom tag

The regex permits arbitrary `[A-Za-z0-9_-]+`. The bundled `workflow.md` ships only the four defaults. Custom tags require either:
- a `[workflow-state:custom]` block in `workflow.md`, or
- a custom `task.py` patch / external hook that writes the status into `task.json`.

Neither is shipped. So custom statuses are a fork-friendly extension point, not an active code path.

### 4.3 Status field defaults

`packages/cli/src/templates/trellis/scripts/common/tasks.py:44`:

```python
status=data.get("status", "unknown"),
```

This default (`"unknown"`) is used by the listing iterator (`iter_active_tasks`). The breadcrumb hook does **not** go through this iterator; it reads `task.json` directly via `json.loads(...)` and silently exits if `status` is missing or non-str (lines 122-124). So `"unknown"` cannot appear as a breadcrumb status — it only surfaces in `task.py list` output.

---

## 5. Gap analysis

For each status, what does the breadcrumb say vs what code actually delivers.

### 5.1 `no_task` → user-described work

Breadcrumb says: load `trellis-brainstorm` skill, which "creates the task via `python3 ./.trellis/scripts/task.py create`".

Reality: matches. `cmd_create` in `task_store.py:147+` writes the new task and prints a relative path. The brainstorm skill is responsible for invoking it. No gap.

### 5.2 `planning` → `in_progress`

Breadcrumb says: "Complete prd.md via trellis-brainstorm skill; then run task.py start."

Reality: matches `cmd_start` (line 110: gated transition `planning → in_progress`).

**Soft gap**: the breadcrumb does not mention any pre-condition for `task.py start`. In particular it does not mention:

- session identity required (`task.py:93-99` requires `resolve_context_key()` to succeed; otherwise `start` fails with a hint about `TRELLIS_CONTEXT_ID`).
- working tree cleanliness — `task.py start` does NOT actually require a clean working tree (no `git status --porcelain` check anywhere in `cmd_start`). This is consistent with the breadcrumb's silence on the topic, but may be worth noting because the user's question hinted at it. **There is no enforcement of "clean tree before start"** — only `/finish-work` enforces clean-tree (`finish-work.md:19-31`).

### 5.3 `in_progress` → ??? (the central commit gap)

Breadcrumb says: "Flow: trellis-implement → trellis-check → trellis-update-spec → finish. Next required action: inspect conversation history + git status, then execute the next uncompleted step in that sequence."

Reality: there is no command that:

- watches whether implement/check/update-spec actually completed,
- transitions `in_progress → completed`, or
- runs the Phase 3.4 commit step automatically.

Phase 3.4 (workflow.md:446-494) is *prose* describing a procedure the AI is supposed to execute manually:

> "The AI drives a batched commit of this task's code changes so `/finish-work` can run cleanly afterwards." (workflow.md:448)

It is a checklist, not a script. Nothing in `task.py`, `add_session.py`, or any hook calls `git commit`. The only `git commit` invocation in the bundled scripts is `_auto_commit_archive` (`task_store.py:369-387`), which commits the archive bookkeeping AFTER the work is already archived.

**The gap the user spotted**: the `in_progress` breadcrumb says "Flow: … → finish" without mentioning Phase 3.4 (commit code). The string "Flow: trellis-implement → trellis-check → trellis-update-spec → finish" does not contain the word "commit". So an AI driving from this breadcrumb may treat `trellis-update-spec` as the last work step and jump straight to `/finish-work`, which then bails out at the dirty-tree sanity check (`finish-work.md:29-31`) — but only because the user happened to have edits. If the AI had committed without prompting, or if the changes were small enough to skip Phase 3.4 mentally, the gap goes undetected.

The `completed` breadcrumb does mention Phase 3.4 explicitly:

> "Code committed via Phase 3.4; run `/trellis:finish-work` to wrap up …"
> "If you reach this state with uncommitted code, return to Phase 3.4 first — `/finish-work` refuses to run on a dirty working tree."

— but as shown in section 4.1, this breadcrumb is **never** rendered in normal flow, because no transition writes `status="completed"` while the task is still active.

So the `completed` breadcrumb is functioning as documentation that nothing in the runtime ever triggers. It "covers" the commit step verbally, but it's only visible to a reader who manually opens `inject-workflow-state.py` or `workflow.md` and reads to the bottom.

### 5.4 `completed` → archived

Breadcrumb (effectively unreachable; see 4.1) says: run `/trellis:finish-work`.

Reality: `/finish-work` (the platform command at `common/commands/finish-work.md`) does Step 1 (survey) → Step 2 (clean-tree gate) → Step 3 (`task.py archive <name>`) → Step 4 (`add_session.py`). Step 3 is what writes `status=completed` and moves the task. Reasonable mapping if it were reachable.

**Net of section 5**: of the four states, only the `in_progress → completed` arc has an *observable* gap that affects users. The `completed` breadcrumb body is the one place that names Phase 3.4 explicitly, but that text is hidden behind an unreachable state.

---

## 6. Walkthrough cross-reference (workflow.md top half vs breadcrumb tags)

Phases 1-3 in the prose section vs the breadcrumb at each status:

| Phase (prose) | Maps to breadcrumb status | Agreement |
|---|---|---|
| 1.0 Create task | `no_task` (before) → `planning` (after) | ✅ Breadcrumb names `task.py create` (no_task) and `task.py start` (planning). |
| 1.1 Requirement exploration | `planning` | ✅ "Complete prd.md via trellis-brainstorm skill" matches. |
| 1.2 Research | `planning` | ⚠️ Walkthrough mentions "trellis-research sub-agents" + "{TASK_DIR}/research/"; the `planning` breadcrumb mentions both. ✅ |
| 1.3 Configure context | `planning` | ❌ Not mentioned in the `planning` breadcrumb at all. The breadcrumb body is two sentences; it omits `implement.jsonl` / `check.jsonl` curation entirely. The walkthrough mandates this step (workflow.md:259-300). |
| 1.4 Completion criteria | `planning` | ❌ Not mentioned in breadcrumb. |
| 2.1 Implement | `in_progress` | ✅ "dispatch trellis-implement". |
| 2.2 Quality check | `in_progress` | ✅ "dispatch trellis-check". |
| 2.3 Rollback | `in_progress` | ❌ Not in breadcrumb. |
| 3.1 Quality verification | `in_progress` (still — no transition out yet) | ⚠️ Breadcrumb's `Flow: … → trellis-update-spec → finish` collapses 3.1-3.5 into one word "finish". |
| 3.2 Debug retrospective | `in_progress` | ❌ Not in breadcrumb. |
| 3.3 Spec update | `in_progress` | ✅ "trellis-update-spec" appears in the flow string. |
| **3.4 Commit changes** | should be `in_progress` (or a new `committed` state) | **❌ NOT in breadcrumb. The breadcrumb's Flow string skips from `trellis-update-spec` to `finish`, omitting Phase 3.4 commit entirely.** |
| 3.5 Wrap-up reminder | corresponds to `/finish-work` and the (unreachable) `completed` breadcrumb | ⚠️ The unreachable `completed` breadcrumb mentions both Phase 3.4 and `/finish-work`; the in-flight `in_progress` breadcrumb mentions neither. |

### 6.1 Specific contradictions

1. **Walkthrough Phase 3.4 is mandatory** ("`required · once`", workflow.md:123) but the in-flight breadcrumb (`in_progress`) lists the user-facing steps as `trellis-implement → trellis-check → trellis-update-spec → finish` — collapsing 3.1-3.5 into "finish", with the load-bearing 3.4 commit step left implicit. An AI relying on the breadcrumb alone could miss that "finish" decomposes into "commit, then `/finish-work`".

2. **Phase 1.3 is mandatory** but the `planning` breadcrumb only mentions PRD + research, not `implement.jsonl` / `check.jsonl`. A new task started via brainstorm-only would skip Phase 1.3 if the AI followed the breadcrumb verbatim.

3. **`completed` breadcrumb references `/trellis:finish-work` and Phase 3.4 cleanup wording**, but it is unreachable — so its corrective hint never fires for users who actually arrive in the dirty-tree state. The dirty-tree gate exists in `/finish-work` itself (`finish-work.md:19-31`), which is the *only* place the user actually sees the warning.

---

## 7. Custom-status hooks

The `run_task_hooks` function (`task_utils.py:218-261`) loops over `commands = get_hooks(event, repo_root)` from `.trellis/config.yaml`. Configured by `hooks.<event>:` lists per the config.yaml example (lines 26-32):

```yaml
# hooks:
#   after_create:
#   after_start:
#   after_finish:
#   after_archive:
```

Trigger sites:

| Event | Called from | When |
|---|---|---|
| `after_create` | `task_store.py:282` | Tail of `cmd_create` (after JSONL seeding + parent linkage). |
| `after_start` | `task.py:117` | Tail of `cmd_start` (after `set_active_task` succeeds and status flip). |
| `after_finish` | `task.py:141` | Tail of `cmd_finish` (after `clear_active_task`, only if `task_json_path.is_file()`). |
| `after_archive` | `task_store.py:363` | Tail of `cmd_archive` (after the directory has been moved; `archived_json` points at the new `archive/` location). |

`TASK_JSON_PATH` is exported into the env for each hook command (`task_utils.py:236`), so a downstream script can `cat $TASK_JSON_PATH` and see the current status.

**Status values a downstream hook may observe**:

- `after_create` → `"planning"` (just written).
- `after_start` → `"in_progress"` (just written) or `"in_progress"` (re-start, no flip).
- `after_finish` → whatever the status was when the user ran `task.py finish`. Most commonly `"in_progress"` (no transition runs in `cmd_finish` — it is a session-only operation; see `task.py:124-142`). Status could also be a custom value if the user/hook set one.
- `after_archive` → `"completed"` (just written by `cmd_archive`).

**No bundled hook script depends on a specific status value.** The only example in the bundled tree is `linear_sync.py` (`scripts/hooks/linear_sync.py`) — it is a Linear sync helper that the user wires through `config.yaml` if they want it; it is not a default-on hook. The trellis-meta skill documents these events at `common/bundled-skills/trellis-meta/references/customize-local/change-task-lifecycle.md:18-38` as customization points, not as built-in flows.

So: **custom statuses can be used by user-defined hooks freely; the bundled subsystem makes no assumption about status values beyond the four defaults.**

---

## 8. Summary table — what moves between states, who writes the breadcrumb

| Transition | Triggered by | What ELSE happens | Breadcrumb the user sees during the transition |
|---|---|---|---|
| `(none)` → `planning` | user types something matching a trigger word, AI loads `trellis-brainstorm`, calls `task.py create` (`task_store.py:147+`) | task dir created, `prd.md`/jsonl seeded, parent linkage, `after_create` hook | Was `no_task`; becomes `planning` on next user prompt after `task.py start`. |
| `planning` → `in_progress` | `task.py start <dir>` (`task.py:70+`); status flip at line 110 only if currently `planning` | session-runtime active task set; `after_start` hook | `planning` until the call; then `in_progress` on next prompt. |
| `in_progress` → `(implicit done)` | **nothing**. The user is expected to manually progress through Phases 2-3.5 and then invoke `/finish-work`. | — | Still `in_progress`. Breadcrumb body collapses commit (3.4) into the word "finish". |
| `in_progress` → `completed` (and archived) | `task.py archive <name>` (`task_store.py:290+`); status write at line 321; directory move at line 348 | session cleared at line 345, archive auto-commit at line 356, `after_archive` hook | Status is `completed` for the moment between the `write_json` (line 323) and the `archive_task_complete` (line 348), but the hook never fires inside that window because the change is in a single subprocess. |

---

## 9. Files referenced

- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/shared-hooks/inject-workflow-state.py` — Python hook (lines 134, 144, 204, 230 are the load-bearing ones).
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/opencode/plugins/inject-workflow-state.js` — JS plugin (lines 30, 37, 96, 144).
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/trellis/workflow.md` — single source of truth for breadcrumb text (lines 504-540 are the tag block; lines 99-498 are the prose walkthrough).
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/trellis/scripts/task.py` — CLI dispatcher; `cmd_start` at line 70, `cmd_finish` at line 124, `cmd_current` at line 145.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/trellis/scripts/common/task_store.py` — `cmd_create` at line 147+, `cmd_archive` at line 290+. Lines 206 and 321 are the only other status writers.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/trellis/scripts/common/task_utils.py:218-261` — `run_task_hooks` implementation.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/common/commands/finish-work.md` — `/finish-work` definition; dirty-tree refusal at lines 19-31.
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/.trellis/scripts/task.py` — runtime copy; verified byte-identical to the template via `diff`.

## 10. Caveats / Not found

- The hook does not observe transitions; it reads point-in-time state every prompt. Any analysis of "during a transition" only matters if a hook (`after_*`) is wired in `config.yaml`.
- I did not enumerate every platform's hook installation site (claude/cursor/gemini/qoder/etc.) — they share the same Python file via `writeSharedHooks()` per the Python docstring at lines 11-14. Behaviour across platforms should be identical.
- I did not check `add_session.py` for status writes; `grep` confirmed it has no `data["status"] = …` line, so it is read-only w.r.t. task status.
- Did not investigate `linear_sync.py` deeply — it is opt-in user-side configuration, not bundled active behaviour.
