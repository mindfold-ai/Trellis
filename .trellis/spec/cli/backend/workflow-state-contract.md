# Workflow-State Breadcrumb Contract

> Runtime contract for the per-turn `<workflow-state>` breadcrumb that
> `inject-workflow-state.py` / `inject-workflow-state.js` inject into
> every UserPromptSubmit.

---

## Overview

The breadcrumb is the **only** per-turn channel that fires while a Trellis task
is active. It is intended for the main AI session, while sub-agent context
normally arrives through `inject-subagent-context` on class-1 platforms or a
pull-based prelude on class-2 platforms. Host behavior can still surface the
breadcrumb inside sub-agent turns, though, and hooks do not currently expose a
stable main-vs-sub-agent identity signal. Therefore: **every `[required · once]`
step that the workflow-walkthrough mandates for a given phase must also be
mentioned in that phase's breadcrumb body file, and breadcrumb text must be
safe when read by a sub-agent.** If required steps are absent, the AI in the
main session will silently skip them. Two production bugs (Phase 1.3 jsonl
curation skip, Phase 3.4 commit skip) hit exactly this failure mode.

This document is the source of truth for the runtime mechanics. The user-facing
breadcrumb body lives in `.trellis/workflow.yaml`; this spec covers everything
**around** it (parsers, writers, lifecycle, reachability).

---

## Manifest Syntax

Each breadcrumb body is declared in `.trellis/workflow.yaml` and stored as a
plain Markdown file under `.trellis/workflow/`:

```yaml
workflow_states:
  in_progress:
    phase: 2
    body_file: .trellis/workflow/states/in_progress.md
```

- STATUS keys are YAML map keys and may include letters, digits, underscores,
  and hyphens. Examples: `planning`, `in_progress`, `in-review`,
  `blocked-by-team`.
- `body_file` is required for a status to emit a custom body.
- Body files are read verbatim and inlined into the `<workflow-state>` block.
- Body files are ordinary Markdown. They do not contain `[workflow-state:*]`
  wrapper tags, and hooks must not parse tag blocks.

The Python loader for `get_context.py` and Python hooks lives in
`common/workflow_model.py`. OpenCode and Pi have lightweight JS/TS readers that
load the same manifest shape. All three implementations must agree on:

1. `.trellis/workflow.yaml` as the manifest path.
2. `workflow_states.<status>.body_file` as the breadcrumb body pointer.
3. `phases.<phase>.steps.<step>.body_file` as the phase-step body pointer.
4. `Refer to workflow.yaml for current step.` as the generic missing-body
   fallback.

---

## Runtime contract

1. On every UserPromptSubmit (or platform equivalent — see hook reachability
   matrix below), the hook receives stdin JSON containing `cwd`.
2. It walks up from `cwd` to find `.trellis/`. If none, exit 0.
3. It calls `common.active_task.resolve_active_task()` to look up the
   per-session active task. If absent → status is the pseudo `no_task`. If
   the pointer is stale (task dir deleted) → status is `stale_<source_type>`.
4. Otherwise it reads `task.json.status` from the resolved task directory.
5. It opens `.trellis/workflow.yaml`, reads `workflow_states`, and resolves
   each `body_file` path relative to the project root.
6. It looks up the current status in the parsed map. If found → emits the
   referenced body file in `<workflow-state>...</workflow-state>`. If not found
   or the body file is missing → emits the generic line
   `Refer to workflow.yaml for current step.`
7. The output JSON has shape:

   ```json
   {"hookSpecificOutput": {
     "hookEventName": "<platform-event-name>",
     "additionalContext": "<workflow-state>...</workflow-state>"
   }}
   ```

   The platform host injects `additionalContext` as system-level preamble
   for that turn.

   `hookEventName` MUST echo the host's per-turn event name or the host's
   schema validator will reject the payload. The shared hook detects the
   platform via `_detect_platform()` and emits the matching value:

   | Detected platform | `hookEventName` value |
   |---|---|
   | gemini | `BeforeAgent` |
   | all others (claude, cursor, codex, qoder, codebuddy, droid, copilot, kiro) | `UserPromptSubmit` |

   When adding a new hook-capable platform whose per-turn event name is not
   `UserPromptSubmit`, extend `_detect_platform()` and the `hook_event_name`
   selector in `inject-workflow-state.py` (and the OpenCode `.js` plugin if
   the new platform shares its `chat.message`-style envelope). Do NOT
   hardcode `UserPromptSubmit` at any new emission site.

---

## Source of truth

`.trellis/workflow.yaml` plus `.trellis/workflow/**/*.md` are **the only
editable sources** for breadcrumb body text. Hook scripts (`.py`, `.js`, and
Pi `.ts`) contain only manifest/body-file loaders, no fallback body text.

**Why no fallback dicts**: prior to v0.5.0-beta.20, both hook scripts shipped
a `_FALLBACK_BREADCRUMBS` / `FALLBACK_BREADCRUMBS` dict mirroring the
workflow body content. The mirror inevitably drifted (different word polish in
each file), and the architecture invited copy-paste skew. Removing the
fallback collapses three sources to one. When `workflow.yaml` is missing or a
body file is absent, the hook degrades to the generic line — visible to the user
as an obvious bug they can fix, rather than being silently masked.

To customize breadcrumb wording, edit the `body_file` target for the status in
`.trellis/workflow.yaml` and then edit that Markdown body file. No script
change required.

### Update boundary

`workflow.yaml` is not only a breadcrumb index. Phase headings, step headings,
and platform marker blocks inside referenced step bodies are parsed by
`workflow_model.py` / `workflow_phase.py` / `get_context.py` when step-specific
instructions are loaded.

For that reason, `trellis update` must hash-track and update `workflow.yaml`
and every `.trellis/workflow/**/*.md` body file as managed runtime templates
whenever each installed file still matches its tracked template hash. It must
not partially merge legacy `[workflow-state:*]` blocks. User edits are
protected by the normal hash-based modified-file flow. Pristine legacy
`.trellis/workflow.md` files are removed by hash-verified safe-file-delete;
locally modified legacy copies are preserved for manual porting but are not read
by runtime.

Regression invariant: an older project without `workflow.yaml` must receive the
current packaged manifest and body files so `--platform codex` can resolve to
`codex-inline` or `codex-sub-agent` and still load Phase 2.1 detail.

---

## Status writer table

The table below enumerates every code path that writes `task.json.status` —
i.e., every path that can change which breadcrumb fires next turn. **Adding
a new writer requires updating this spec.**

| # | Writer | File:Line | Value | Trigger |
|---|--------|-----------|-------|---------|
| 1 | `cmd_create` | `packages/cli/src/templates/trellis/scripts/common/task_store.py:206` | `"planning"` | `task.py create "<title>"` (also auto-sets the session active-task pointer when session identity is available — see R7 in 04-30-workflow-state-commit-gap PRD) |
| 2 | `cmd_start` | `packages/cli/src/templates/trellis/scripts/task.py:109-111` | `"in_progress"` (gated on prior `"planning"`) | `task.py start <dir>` |
| 3 | `cmd_archive` | `packages/cli/src/templates/trellis/scripts/common/task_store.py:319-323` | `"completed"` (unconditional flip + archive `mv`) | `task.py archive <dir>` |
| 4 | `emptyTaskJson` factory | `packages/cli/src/utils/task-json.ts:54` | `"planning"` (default) | TS callers (init, update) |
| 5 | `getBootstrapTaskJson` | `packages/cli/src/commands/init.ts:417` | `"in_progress"` (override) | `trellis init` (creator path) |
| 6 | `getJoinerTaskJson` | `packages/cli/src/commands/init.ts:460` | `"in_progress"` (override) | `trellis init` (joiner path) |
| 7 | migration-task literal | `packages/cli/src/commands/update.ts:2215-2226` | `"planning"` | `trellis update --migrate` for breaking-change manifest |

**No other writer exists.** No hook script writes `task.json.status` — verified
by `grep -rn '"status"' .trellis/scripts/`. Linear-sync hook (`linear_sync.py`)
writes `meta.linear_issue` only.

---

## Lifecycle events ≠ status transitions

Lifecycle events fire on task-management commands, NOT on status changes.
Subscribers must understand the difference:

| Event | Emitted at | Status when fired |
|-------|------------|-------------------|
| `after_create` | end of `cmd_create` | `"planning"` (just written) |
| `after_start` | end of `cmd_start` | `"in_progress"` if status was `"planning"`; otherwise unchanged. Re-running `start` does NOT re-fire status flip. |
| `after_finish` | end of `cmd_finish` | **unchanged** — `cmd_finish` only clears the per-session active-task pointer. Status stays whatever it was (typically `"in_progress"`). |
| `after_archive` | end of `cmd_archive` | `"completed"` (just written, then dir moved to `archive/YYYY-MM/`) |

**Common mistake**: subscribing to `after_finish` to mark a task "done" in an
external system (Linear, Jira). `after_finish` means "AI session closed its
pointer to this task" — the task may resume in a different session. The
correct event for "task is done" is `after_archive`.

---

## Reachability matrix

Which breadcrumbs actually fire in normal flow:

| Status | Reachability | Notes |
|--------|--------------|-------|
| `no_task` | ✅ reachable | Pseudo-status; emitted when `resolve_active_task()` returns no pointer. |
| `planning` | ✅ reachable | After `cmd_create` (which now auto-sets the session pointer when available) and before `cmd_start`. Pre-R7 (v0.5.0-beta.19 and earlier), `cmd_create` did NOT set the pointer, so the breadcrumb stayed at `no_task` until `cmd_start`. R7 made `planning` actually reachable. |
| `in_progress` | ✅ reachable | After `cmd_start`, until `cmd_archive`. |
| `completed` | ❌ DEAD in normal flow | `cmd_archive` writes `status="completed"` and immediately moves the task dir to `archive/`. The session-pointer cleanup in `clear_task_from_sessions` runs before the move, so the resolver loses the pointer in the same call. The block body in workflow.yaml is preserved for a future status-transition redesign (e.g. an explicit `in_progress → completed` command) but no current code path produces it. |
| `stale_<source_type>` | ✅ reachable (rare) | Synthesized when the session pointer references a deleted task directory. Emits the generic body via `build_breadcrumb` because no `stale_*` body is shipped. |

**Test invariant** (`test/regression.test.ts`): for every step marked
`[required · once]` in the workflow body files, the corresponding phase's
breadcrumb body file must mention it. This is the contract
that prevents Phase-1.3 / Phase-3.4 style drift from re-occurring. See:

- `test that the in_progress body mentions commit (Phase 3.4)`
- `test that the planning body mentions Phase 1.3 jsonl curation`

---

## Custom statuses

Forks can define custom statuses. To do so:

1. Add `workflow_states.my-status.body_file` to `.trellis/workflow.yaml` and
   create the referenced `.trellis/workflow/states/my-status.md` body file.
2. Add a lifecycle hook (`task.json.hooks.after_*`) that writes
   `task.json.status = "my-status"` at the appropriate event. Without a
   writer, the tag is never read because no task ever carries that status.
3. (Optional) Add the status to `.trellis/spec/cli/backend/workflow-state-contract.md`'s
   writer table when shipping the customization to other repos.

---

## Hook reachability matrix

The breadcrumb is **intended** for the main AI session. Sub-agents have their
own context loading paths, but host platforms may still run per-turn breadcrumb
hooks for child turns or inherit main-session per-turn context. Trellis must not
rely on categorical breadcrumb invisibility inside sub-agents.

| Channel | Main session | Hook-inject sub-agent | Pull-prelude sub-agent | Extension-backed sub-agent |
|---------|:------------:|:---------------------:|:----------------------:|:--------------------------:|
| `<workflow-state>` per-turn breadcrumb | ✅ | ⚠️ possible host-dependent exposure | ⚠️ possible host-dependent exposure | ⚠️ possible host-dependent exposure |
| `inject-subagent-context` (`implement.jsonl`/`check.jsonl` injection) | ❌ | ✅ | ❌ | ❌ |
| Pull-based prelude (`shared.ts:buildPullBasedPrelude`) | N/A | N/A | ✅ | fallback |

Hook-inject platforms: claude, cursor, codebuddy, droid, kiro (`agentSpawn`), opencode (JS plugin).
Pull-prelude platforms: codex, gemini, qoder, copilot.
Extension-backed platforms: pi.
Hookless: kilo, antigravity, windsurf.

**Implication**: sub-agent-required guidance must still be propagated through
`inject-subagent-context` for hook-inject platforms, `buildPullBasedPrelude` for
pull-prelude platforms, or the Pi extension's prompt builder for
extension-backed platforms. Breadcrumb text must additionally be safe if a
sub-agent sees it: main-session dispatch guidance must self-exempt
`trellis-implement` / `trellis-check` readers so they implement or check
directly instead of spawning nested Trellis sub-agents.

---

## DO

- Edit `.trellis/workflow/states/<status>.md` body files for breadcrumb body
  changes; update `.trellis/workflow.yaml` only when adding or moving a body.
- Keep `trellis update` hash-tracking behavior for `workflow.yaml` and every
  `.trellis/workflow/**/*.md` body file. Updating only one layer is
  insufficient because platform routing markers in step body files are runtime
  input too.
- Add a writer-table row to this spec when introducing a new status writer.
- Run the regression tests after editing breadcrumb bodies.
- When adding a `[required · once]` step to the workflow walkthrough, add a
  matching enforcement line to that phase's breadcrumb body file in the
  same commit.

## DON'T

- Don't add fallback breadcrumb dicts back to `inject-workflow-state.py` or
  `.js`. Drift is structurally guaranteed.
- Don't implement special partial merging for `workflow.yaml` or workflow body
  files unless every runtime parser that consumes headings, platform blocks,
  and breadcrumb bodies
  has an explicit compatibility strategy and upgrade test coverage.
- Don't introduce a `task.json.status` writer without updating this spec.
- Don't subscribe to `after_finish` to detect task completion — it doesn't
  mean what you think. Use `after_archive`.
- Don't silently re-route a writer to a different status without auditing
  every breadcrumb consumer (`session-start.py`, `inject-workflow-state.py`,
  `task.py list`, etc.).
- Don't rely on sub-agents not seeing the breadcrumb. If guidance is sub-agent
  relevant, propagate it via the appropriate channel above and keep the
  breadcrumb wording self-exempting.

---

## Mandatory triggers (must update this spec when changing)

- Manifest syntax (`workflow_states`, `body_file`, status charset)
- Hook script structural change (manifest/body loader, output envelope, what reads
  `task.json.status`)
- `workflow.yaml` / `.trellis/workflow/**/*.md` update semantics in `trellis update`
- New `task.json.status` writer (any path that mutates the field)
- Breadcrumb body that changes the contract (e.g. removing a `[required · once]`
  enforcement line — flag in PR description)
- New lifecycle event added to `run_task_hooks`
- Reachability changes (e.g. wiring a new status transition that makes
  `completed` reachable)

Cross-reference: `cli/backend/quality-guidelines.md` "Routing Fixes: Audit
ALL Entry Paths" — that audit pattern is what this contract enforces for
the breadcrumb subsystem.
