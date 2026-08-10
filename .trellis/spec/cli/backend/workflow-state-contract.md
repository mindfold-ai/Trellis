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
mentioned in that phase's breadcrumb tag block, and breadcrumb text must be
safe when read by a sub-agent.** If required gates are absent, the AI in the
main session will silently skip them. Prior bugs around planning gates and
Phase 3.4 commit reminders hit exactly this failure mode.

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
6. Codex may map `planning` / `in_progress` to `planning-inline` /
   `in_progress-inline` based on `codex.dispatch_mode`; all other platforms
   use the plain status.
7. It looks up the current status in the parsed map. If found → emits the
   block body in `<workflow-state>...</workflow-state>`. If not found →
   emits the generic line `Refer to workflow.md for current step.`
8. The output JSON has shape:

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

## OpenCode persisted-part contract

### 1. Scope / Trigger

This contract applies when an OpenCode `chat.message` plugin adds Trellis
context after OpenCode has resolved the user's input parts. Unlike the Python
hook envelope above, these JavaScript-added parts must carry their own complete
persisted identity.

### 2. Signatures

- `findUserTextPart(parts) -> ordinary text part | undefined`
- `insertSyntheticTextPart(parts, text, kind) -> persisted synthetic text part`
- Supported `kind` values: `sessionStart` and `workflowState`
- Required persisted fields: `id`, `sessionID`, and `messageID`

### 3. Contracts

- Existing user parts are ordinary when `synthetic !== true`; neither plugin
  may mutate their text, metadata, identity, or relative order.
- The identity source is the lexicographically earliest ordinary part with a
  valid OpenCode `prt_...` ID plus string `sessionID` and `messageID`. This also
  supports attachment-only turns where no ordinary text part exists.
- Generated IDs are deterministic for the source message and kind. They sort
  in the same order used in memory: SessionStart, workflow state, then the
  ordinary input parts. ID-sorted database replay must therefore equal the
  first model request order.
- Both injected parts use `type: "text"` and `synthetic: true`. Synthetic marks
  machine-authored UI ownership; it does not remove the text from model input.
- Only the SessionStart part receives `metadata.trellis.sessionStart = true`.
  History dedupe continues to detect that marker after restart or compaction.
- The workflow-state plugin checks the skip keyword only against an ordinary
  user text part, never against an earlier synthetic SessionStart part.
- Plugin error handling leaves the original parts unchanged. SessionStart is
  marked processed only after a successful insertion.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| `parts` is not an array or `text` is not a string | Throw before mutation |
| `kind` is not `sessionStart` or `workflowState` | Throw before source lookup or mutation |
| No ordinary part has a complete supported persisted identity | Throw; plugin logs and preserves the input parts |
| Source ID ordinal cannot reserve both context slots | Throw instead of generating a clamped or colliding ID |
| Generated ID already exists | Throw; never overwrite or silently reuse the existing part |
| Plugin order is reversed | Final part order remains SessionStart, workflow state, ordinary parts |

### 5. Good / Base / Bad Cases

- Good: a normal text turn persists two complete synthetic parts before an
  unchanged user text part, and ID-sorted replay is byte-for-byte equivalent to
  the first-use order.
- Base: an attachment-only turn uses the attachment identity, preserves the
  file part, and still persists both machine-authored text parts.
- Bad: `parts.unshift({ type: "text", text, synthetic: true })` looks hidden in
  the UI but lacks the identity OpenCode needs to save and replay the part.

### 6. Tests Required

- Helper tests assert deterministic unique IDs, complete identity fields,
  supported kinds, duplicate refusal, low-ordinal refusal, missing identity,
  attachment-only input, no partial mutation, and replay-order equality.
- Real plugin tests run both plugin orders and deep-compare every ordinary part
  before and after injection.
- SessionStart tests cover in-memory and persisted-history dedupe; workflow
  tests cover default/custom/disabled skip keywords. There is no compaction
  reset: history dedupe reads the whole session, so clearing the in-memory
  flag after compaction is undone by the very next check. Re-injecting context
  after compaction is a known gap, not a design choice.
- Existing hook-disable, non-interactive, and Trellis sub-agent exclusion tests
  remain mandatory.
- Template collection tests assert the helper ships through both fresh init and
  `trellis update`; dogfood `.opencode/` copies must match template bytes.

### 7. Wrong vs Correct

#### Wrong

```javascript
parts[0].text = `${breadcrumb}\n\n${parts[0].text}`
```

This changes user-authored history and makes machine context visible as part of
the user's message.

#### Correct

```javascript
const userPart = findUserTextPart(parts)
if (promptHasSkipKeyword(userPart?.text ?? "", skipKeyword)) return
insertSyntheticTextPart(parts, breadcrumb, "workflowState")
```

This keeps user content unchanged while giving the machine-authored context a
complete, replay-stable persisted identity.

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

### Update boundary

The `[workflow-state:STATUS]` blocks are not the only runtime-sensitive
content in `workflow.md`. Phase headings, step headings, and platform marker
blocks such as `[codex-inline, Kilo, Antigravity, Devin]` are parsed by
`workflow_phase.py` / `get_context.py` when step-specific instructions are
loaded.

For that reason, `trellis update` must update `workflow.md` as one managed
template file whenever the installed file still matches its tracked template
hash. It must not partially merge only `[workflow-state:*]` blocks. User edits
are protected by the normal hash-based modified-file flow, not by preserving
arbitrary prose outside tag blocks during automatic updates.

Regression invariant: an older hash-tracked workflow containing stale Codex
markers (`[Codex]` plus `[Kilo, Antigravity, Windsurf]`) must be replaced by
the current packaged template so `--platform codex` can resolve to
`codex-inline` or `codex-sub-agent` and still load Phase 2.1 detail.

---

## Status writer table

The table below enumerates every code path that writes `task.json.status` —
i.e., every path that can change which breadcrumb fires next turn. **Adding
a new writer requires updating this spec.**

| # | Writer | File:Line | Value | Trigger |
|---|--------|-----------|-------|---------|
| 1 | `cmd_create` | `packages/cli/src/templates/trellis/scripts/common/task_store.py:206` | `"planning"` | `task.py create "<title>"` (also visibly auto-sets the session active-task pointer when session identity is available; `--no-start` skips pointer movement for backlog batching — see R7 in 04-30-workflow-state-commit-gap PRD) |
| 2 | `cmd_start` | `packages/cli/src/templates/trellis/scripts/task.py:114-115, 128-129` | `"in_progress"` (gated on prior `"planning"`; both branches in `cmd_start`) | `task.py start <dir>` |
| 3 | `cmd_archive` | `packages/cli/src/templates/trellis/scripts/common/task_store.py:337` | `"completed"` (unconditional flip + archive `mv`) | `task.py archive <dir>` |
| 4 | `emptyTaskJson` factory | `packages/cli/src/utils/task-json.ts:54` | `"planning"` (default) | TS callers (init, update) |
| 5 | `getBootstrapTaskJson` | `packages/cli/src/commands/init.ts:535` | `"in_progress"` (override) | `trellis init` (creator path) |
| 6 | `getJoinerTaskJson` | `packages/cli/src/commands/init.ts:587` | `"in_progress"` (override) | `trellis init` (joiner path) |
| 7 | migration-task via `emptyTaskJson` | `packages/cli/src/commands/update.ts:2483-2494` | `"planning"` (override on factory) | `trellis update --migrate` for breaking-change manifest |

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
| `planning` | ✅ reachable | After `cmd_create` (which now auto-sets the session pointer when available) and before `cmd_start`. `planning-inline` is the Codex inline-mode breadcrumb body for the same task status. |
| `in_progress` | ✅ reachable | After `cmd_start`, until `cmd_archive`. `in_progress-inline` is the Codex inline-mode breadcrumb body for the same task status. |
| `completed` | ❌ DEAD in normal flow | `cmd_archive` writes `status="completed"` and immediately moves the task dir to `archive/`. The session-pointer cleanup in `clear_task_from_sessions` runs before the move, so the resolver loses the pointer in the same call. The block body in workflow.md is preserved for a future status-transition redesign (e.g. an explicit `in_progress → completed` command) but no current code path produces it. |
| `stale_<source_type>` | ✅ reachable (rare) | Synthesized when the session pointer references a deleted task directory. Emits the generic body via `build_breadcrumb` because no `stale_*` tag is shipped. |

**Test invariant** (`test/regression.test.ts`): workflow-state blocks must
preserve the runtime gates that cannot be recovered from model memory:
`no_task` triages and asks for task-creation consent; planning distinguishes
lightweight PRD-only tasks from complex tasks requiring `prd.md`, `design.md`,
and `implement.md`; in-progress keeps the commit step reachable before
`/trellis:finish-work`. See:

- `test that workflow.md [workflow-state:in_progress] mentions commit (Phase 3.4)`
- `test that workflow.md [workflow-state:planning] mentions planning artifact gate`
- `test that workflow.md [workflow-state:no_task] asks for task-creation consent`

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

The breadcrumb is **intended** for the main AI session. Sub-agents have their
own context loading paths, but host platforms may still run per-turn breadcrumb
hooks for child turns or inherit main-session per-turn context. Trellis must not
rely on categorical breadcrumb invisibility inside sub-agents.

| Channel | Main session | Hook-inject sub-agent | Pull-prelude sub-agent | Extension-backed sub-agent |
|---------|:------------:|:---------------------:|:----------------------:|:--------------------------:|
| `<workflow-state>` per-turn breadcrumb | ✅ | ⚠️ possible host-dependent exposure | ⚠️ possible host-dependent exposure | ⚠️ possible host-dependent exposure |
| `inject-subagent-context` (`implement.jsonl`/`check.jsonl` + task artifact injection) | ❌ | ✅ | ❌ | ❌ |
| Pull-based prelude (`shared.ts:buildPullBasedPrelude`) | N/A | N/A | ✅ | fallback |

Hook-inject platforms: claude, cursor, codebuddy, droid, kiro (`agentSpawn`), opencode (JS plugin).
Pull-prelude platforms: codex, gemini, qoder, copilot.
Extension-backed platforms: pi.
Hookless: kilo, antigravity, devin.

**Implication**: sub-agent-required guidance must still be propagated through
`inject-subagent-context` for hook-inject platforms, `buildPullBasedPrelude` for
pull-prelude platforms, or the Pi extension's prompt builder for
extension-backed platforms. All paths must use the same task artifact order:
jsonl entries -> `prd.md` -> `design.md if present` -> `implement.md if
present`. Breadcrumb text must additionally be safe if a sub-agent sees it:
main-session dispatch guidance must self-exempt `trellis-implement` /
`trellis-check` readers so they implement or check directly instead of spawning
nested Trellis sub-agents.

---

## DO

- Edit `.trellis/workflow.md` `[workflow-state:STATUS]` blocks for breadcrumb
  body changes; never touch the parser scripts.
- Keep `trellis update` whole-file behavior for hash-tracked `workflow.md`.
  Breadcrumb tag updates alone are insufficient because platform routing
  markers outside those tags are runtime input too.
- Add a writer-table row to this spec when introducing a new status writer.
- Run the regression tests after editing breadcrumb bodies.
- When adding a `[required · once]` step to the workflow walkthrough, add a
  matching enforcement line to that phase's breadcrumb tag block in the
  same commit.

## DON'T

- Don't add fallback breadcrumb dicts back to `inject-workflow-state.py` or
  `.js`. Drift is structurally guaranteed.
- Don't implement special partial merging for `workflow.md` unless every
  runtime parser that consumes headings, platform blocks, and breadcrumb tags
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

- Marker syntax (regex / charset)
- Hook script structural change (parser, output envelope, what reads
  `task.json.status`)
- `workflow.md` update semantics in `trellis update`
- New `task.json.status` writer (any path that mutates the field)
- Breadcrumb body that changes the contract (e.g. removing a `[required ·
  once]` enforcement line — flag in PR description)
- New lifecycle event added to `run_task_hooks`
- Reachability changes (e.g. wiring a new status transition that makes
  `completed` reachable)

Cross-reference: `cli/backend/quality-guidelines.md` "Routing Fixes: Audit
ALL Entry Paths" — that audit pattern is what this contract enforces for
the breadcrumb subsystem.
