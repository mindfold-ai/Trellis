# Workflow-State Breadcrumb Contract

> Runtime contract for the per-turn `<workflow-state>` breadcrumb that
> `inject-workflow-state.py` / `inject-workflow-state.js` inject into
> every UserPromptSubmit.

---

## Overview

The breadcrumb is the **only** per-turn channel that fires while a Trellis task
is active. Sub-agents don't see it (class-1 hook injection rewrites sub-agent
prompts via `inject-subagent-context`; class-2 sub-agents pull a static prelude
that does not include workflow-state). Therefore: **every `[required · once]`
step that the workflow-walkthrough mandates for a given phase must also be
mentioned in that phase's breadcrumb tag block.** If it isn't, the AI in
the main session will silently skip it. Two production bugs (Phase 1.3 jsonl
curation skip, Phase 3.4 commit skip) hit exactly this failure mode.

This document is the source of truth for the runtime mechanics. The user-facing
breadcrumb body lives in `.trellis/workflow.md`; this spec covers everything
**around** it (parsers, writers, lifecycle, reachability).

---

## Marker syntax

Each breadcrumb body lives in a managed block of `.trellis/workflow.md`:

```
[workflow-state:STATUS]
<one or more lines of body text>
[/workflow-state:STATUS]
```

- STATUS character set: `[A-Za-z0-9_-]+` (letters, digits, underscores,
  hyphens). Examples: `planning`, `in_progress`, `in-review`, `blocked-by-team`.
- The body is read verbatim and inlined into the `<workflow-state>` block.
- Both the opening and closing tags must end with the same STATUS string.

The regex used by both the Python hook (`packages/cli/src/templates/shared-hooks/inject-workflow-state.py`)
and the OpenCode plugin (`packages/cli/src/templates/opencode/plugins/inject-workflow-state.js`)
is:

```
[workflow-state:([A-Za-z0-9_-]+)]\s*\n(.*?)\n\s*[/workflow-state:\1]
```

### Invariant: parser regex ↔ strip regex must use the same `\1` backreference

There are two regex consumers of the marker syntax:

1. **Parser** — extracts tag content for breadcrumb emission. Lives in `inject-workflow-state.py` (`_TAG_RE`) and `inject-workflow-state.js`.
2. **Stripper** — removes tag blocks from the workflow.md range injected at SessionStart (so AI doesn't read each block twice — once in the workflow overview, once in the per-turn breadcrumb). Lives in `session-start.py` (shared / codex / copilot copies), `workflow_phase.py`, and any future SessionStart-equivalent script.

Both regexes MUST use the `\1` backreference variant — `[workflow-state:([A-Za-z0-9_-]+)]...[/workflow-state:\1]` — so they only match well-formed pairs (same STATUS on open and close). A non-backreference variant like `[workflow-state:[A-Za-z0-9_-]+]...[/workflow-state:[A-Za-z0-9_-]+]` permits `STATUS_A...STATUS_B` mismatches, which can swallow surrounding content if a user typo'd the closing tag.

**Symptom of drift**: parser would refuse to emit content for a typo'd block (because parser uses `\1`), but stripper would silently consume it from the SessionStart payload (because stripper used the loose form). End result: the AI never sees that content via either channel — silent loss.

**Test invariant**: `test/regression.test.ts` `[strip-breadcrumb] _strip_breadcrumb_tag_blocks only strips matched STATUS pairs` covers the three boundary cases (matched, mismatched, nested orphan) for the strip side. The parser already enforces same-status pairing structurally via `\1`.

---

## Runtime contract

1. On every UserPromptSubmit (or platform equivalent — see hook reachability
   matrix below), the hook receives stdin JSON containing `cwd`.
2. It walks up from `cwd` to find `.trellis/`. If none, exit 0.
3. It calls `common.active_task.resolve_active_task()` to look up the
   per-session active task. If absent → status is the pseudo `no_task`. If
   the pointer is stale (task dir deleted) → status is `stale_<source_type>`.
4. Otherwise it reads `task.json.status` from the resolved task directory.
5. It opens `.trellis/workflow.md` and parses every `[workflow-state:STATUS]`
   block.
6. It looks up the current status in the parsed map. If found → emits the
   block body in `<workflow-state>...</workflow-state>`. If not found →
   emits the generic line `Refer to workflow.md for current step.`
7. The output JSON has shape:

   ```json
   {"hookSpecificOutput": {
     "hookEventName": "UserPromptSubmit",
     "additionalContext": "<workflow-state>...</workflow-state>"
   }}
   ```

   The platform host injects `additionalContext` as system-level preamble
   for that turn.

---

## Source of truth

`workflow.md` is **the only editable source** for breadcrumb body text. The
hook scripts (`.py` and `.js`) contain only the parser, no fallback text.

**Why no fallback dicts**: prior to v0.5.0-beta.20, both hook scripts shipped
a `_FALLBACK_BREADCRUMBS` / `FALLBACK_BREADCRUMBS` dict mirroring the
workflow.md content. The mirror inevitably drifted (different word polish in
each file), and the architecture invited copy-paste skew. Removing the
fallback collapses three sources to one. When `workflow.md` is missing or a
tag is absent, the hook degrades to the generic line — visible to the user as
an obvious bug they can fix, rather than being silently masked.

To customize breadcrumb wording, edit the `[workflow-state:STATUS]` block in
`.trellis/workflow.md`. No script change required.

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
| `completed` | ❌ DEAD in normal flow | `cmd_archive` writes `status="completed"` and immediately moves the task dir to `archive/`. The session-pointer cleanup in `clear_task_from_sessions` runs before the move, so the resolver loses the pointer in the same call. The block body in workflow.md is preserved for a future status-transition redesign (e.g. an explicit `in_progress → completed` command) but no current code path produces it. |
| `stale_<source_type>` | ✅ reachable (rare) | Synthesized when the session pointer references a deleted task directory. Emits the generic body via `build_breadcrumb` because no `stale_*` tag is shipped. |

**Test invariant** (`test/regression.test.ts`): for every step marked
`[required · once]` in the workflow.md walkthrough body, the corresponding
phase's `[workflow-state:*]` block must mention it. This is the contract
that prevents Phase-1.3 / Phase-3.4 style drift from re-occurring. See:

- `test that workflow.md [workflow-state:in_progress] mentions commit (Phase 3.4)`
- `test that workflow.md [workflow-state:planning] mentions Phase 1.3 jsonl curation`

---

## Custom statuses

Forks can define custom statuses. To do so:

1. Add a `[workflow-state:my-status]...[/workflow-state:my-status]` block to
   `.trellis/workflow.md` (STATUS charset: `[A-Za-z0-9_-]+`).
2. Add a lifecycle hook (`task.json.hooks.after_*`) that writes
   `task.json.status = "my-status"` at the appropriate event. Without a
   writer, the tag is never read because no task ever carries that status.
3. (Optional) Add the status to `.trellis/spec/cli/backend/workflow-state-contract.md`'s
   writer table when shipping the customization to other repos.

---

## Hook reachability matrix

The breadcrumb is **only visible to the main AI session.** Sub-agents have
their own context loading paths.

| Channel | Main session | Class-1 sub-agent (push hook) | Class-2 sub-agent (pull prelude) |
|---------|:------------:|:-----------------------------:|:--------------------------------:|
| `<workflow-state>` per-turn breadcrumb | ✅ | ❌ (sub-agents have their own UserPromptSubmit, but it does not inherit main-session breadcrumbs) | ❌ |
| `inject-subagent-context` (`implement.jsonl`/`check.jsonl` injection) | ❌ | ✅ | ❌ |
| Pull-based prelude (`shared.ts:buildPullBasedPrelude`) | N/A | N/A | ✅ |

Class-1 platforms (push hooks): claude, cursor, codebuddy, droid, opencode (JS plugin), pi (TS extension).
Class-2 platforms (pull prelude): codex, gemini, qoder, copilot.
Hookless: kilo, antigravity, windsurf.

**Implication**: any guidance the breadcrumb wants to give to sub-agents must
either (a) be propagated through `inject-subagent-context` for class-1, or (b)
be added to the `buildPullBasedPrelude` static text for class-2. The
breadcrumb itself reaches **only** the main session driving the
`Task` / `Agent` tool spawn.

---

## DO

- Edit `.trellis/workflow.md` `[workflow-state:STATUS]` blocks for breadcrumb
  body changes; never touch the parser scripts.
- Add a writer-table row to this spec when introducing a new status writer.
- Run the regression tests after editing breadcrumb bodies.
- When adding a `[required · once]` step to the workflow walkthrough, add a
  matching enforcement line to that phase's breadcrumb tag block in the
  same commit.

## DON'T

- Don't add fallback breadcrumb dicts back to `inject-workflow-state.py` or
  `.js`. Drift is structurally guaranteed.
- Don't introduce a `task.json.status` writer without updating this spec.
- Don't subscribe to `after_finish` to detect task completion — it doesn't
  mean what you think. Use `after_archive`.
- Don't silently re-route a writer to a different status without auditing
  every breadcrumb consumer (`session-start.py`, `inject-workflow-state.py`,
  `task.py list`, etc.).
- Don't expect sub-agents to see the breadcrumb. If guidance is sub-agent
  relevant, propagate it via the appropriate channel above.

---

## Mandatory triggers (must update this spec when changing)

- Marker syntax (regex / charset)
- Hook script structural change (parser, output envelope, what reads
  `task.json.status`)
- New `task.json.status` writer (any path that mutates the field)
- Breadcrumb body that changes the contract (e.g. removing a `[required ·
  once]` enforcement line — flag in PR description)
- New lifecycle event added to `run_task_hooks`
- Reachability changes (e.g. wiring a new status transition that makes
  `completed` reachable)

Cross-reference: `cli/backend/quality-guidelines.md` "Routing Fixes: Audit
ALL Entry Paths" — that audit pattern is what this contract enforces for
the breadcrumb subsystem.
