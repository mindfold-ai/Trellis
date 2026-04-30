# Research: Commit-Guidance Trail (Phase 3.4 / commit-before-finish-work)

- **Query**: Survey every place that tells the AI or user about Phase 3.4 / committing code / commit-before-finish-work, identify where the chain breaks.
- **Scope**: internal
- **Date**: 2026-04-30

---

## TL;DR — Where Does the AI Hear About Phase 3.4 Commit?

From the AI's vantage point, the canonical commit instruction lives in **exactly one place**: `.trellis/workflow.md` Phase 3.4 (`workflow.md:446-494`). Everything else is either (a) a *prohibition* on the implement sub-agent ("no git commit"), (b) a *bail-out* in `/trellis:finish-work` ("tree must be clean — go back to Phase 3.4"), or (c) a *post-hoc reminder* in the `completed` breadcrumb ("code committed via Phase 3.4").

The chain breaks at the **`in_progress` breadcrumb** (`workflow.md:528-534`, mirrored in `inject-workflow-state.py:175-192` and `inject-workflow-state.js:67-82`). It tells the AI the per-turn flow is `trellis-implement → trellis-check → trellis-update-spec → finish` — **commit is not in the list**. Since the breadcrumb is the only per-turn nudge the AI receives, an AI in `in_progress` that has just finished `update-spec` reads "next is finish" and proposes `/trellis:finish-work` without committing. Phase 3.4 is only visible if the AI re-reads `workflow.md` Phase 3 by hand (which the breadcrumb does not require) or runs `get_context.py --mode phase --step 3.4`.

The downstream safety net is `/trellis:finish-work` itself, which detects the dirty tree and bails out — but by then the AI has already mis-routed. The `completed` breadcrumb does describe the right post-commit state, **but no transition ever fires it**: `task.py finish` only clears the active task pointer; `task.py archive` removes the task entirely. So `completed` is dead branch text per the PRD's own note.

Net: there is no single "you (the AI) drive Phase 3.4 commit" instruction injected into the per-turn loop. It exists in the workflow walkthrough but is silent on the breadcrumb channel — the only channel that fires every turn.

---

## Map: File → Quote → Workflow Stage

| File:Line | Exact phrase | Workflow stage shown |
|---|---|---|
| `.trellis/workflow.md:123` | `- 3.4 Commit changes` `[required · once]` | Phase Index (visible at `get_context.py --mode phase`) |
| `.trellis/workflow.md:446-448` | `#### 3.4 Commit changes` ... `The AI drives a batched commit of this task's code changes so /finish-work can run cleanly afterwards.` | **Phase 3.4 walkthrough — canonical instruction** |
| `.trellis/workflow.md:486` | `**On confirmation**: run git add <files> + git commit -m "<msg>" for each batch in order. Do not amend. Do not push.` | Phase 3.4 step 6 |
| `.trellis/workflow.md:491` | `No git commit --amend anywhere — three-stage three-commit flow (work commits → archive commit → journal commit).` | Phase 3.4 rules |
| `.trellis/workflow.md:496-498` | `#### 3.5 Wrap-up reminder ... remind the user they can run /finish-work` | Phase 3.5 follow-up |
| `.trellis/workflow.md:528-534` | `[workflow-state:in_progress] Flow: trellis-implement → trellis-check → trellis-update-spec → finish` | **`in_progress` breadcrumb — per-turn injection. NO mention of commit.** |
| `.trellis/workflow.md:537-538` | `[workflow-state:completed] Code committed via Phase 3.4; run /trellis:finish-work to wrap up. If you reach this state with uncommitted code, return to Phase 3.4 first — /finish-work refuses to run on a dirty working tree.` | `completed` breadcrumb (DEAD — never fires) |
| `packages/cli/src/templates/trellis/workflow.md:454,486,491,530,537-538` | Identical to live `.trellis/workflow.md` (template source) | Template source |
| `.claude/hooks/inject-workflow-state.py:175-192` | `_FALLBACK_BREADCRUMBS["in_progress"] = "Flow: trellis-implement → trellis-check → trellis-update-spec → finish\nNext required action: inspect conversation history + git status, then execute the next uncompleted step in that sequence...."` | **Hook fallback (used if workflow.md missing/malformed). NO commit step.** |
| `.claude/hooks/inject-workflow-state.py:194-200` | `_FALLBACK_BREADCRUMBS["completed"] = "Code committed via Phase 3.4; run /trellis:finish-work to wrap up..."` | `completed` fallback (also dead) |
| `.codex/hooks/inject-workflow-state.py:175-200` | Identical to claude (shared-hooks template) | Codex hook |
| `.cursor/hooks/inject-workflow-state.py:175-200` | Identical | Cursor hook |
| `.opencode/plugins/inject-workflow-state.js:67-90` | JS port; same flow string `trellis-implement → trellis-check → trellis-update-spec → finish` | OpenCode hook |
| `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:175-200` | Template source for all Python hooks | Template |
| `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:68-87` | Template source for JS hook | Template |
| `.claude/agents/trellis-implement.md:4` | `Code implementation expert ... No git commit allowed.` | implement sub-agent **prohibition** |
| `.claude/agents/trellis-implement.md:31` | `Forbidden Operations: git commit, git push, git merge` | implement sub-agent prohibition |
| `.claude/hooks/inject-subagent-context.py:359` | `Do NOT execute git commit, only code modifications` | implement sub-agent push-injection prelude |
| `.opencode/plugins/inject-subagent-context.js:156` | `Do NOT execute git commit` | implement sub-agent prelude (opencode) |
| Mirror files for cursor/opencode/pi/droid/gemini/codebuddy/qoder/kiro `agents/trellis-implement.{md,toml,json}` | Same `No git commit allowed` clause | All implement sub-agent definitions |
| `.codex/agents/trellis-implement.toml:29` | `Do not make destructive git changes unless explicitly asked.` | Codex pull-based implement prelude — softer wording, **no Phase 3.4 mention at all** |
| `.codex/agents/trellis-check.toml` | (no commit reference) | Codex pull-based check prelude — silent on commit |
| `.claude/commands/trellis/finish-work.md:3` | `Code commits are NOT done here — those happen in workflow Phase 3.4 before you invoke this command.` | finish-work command header |
| `.claude/commands/trellis/finish-work.md:19-33` | Step 2 sanity check: `git status --porcelain` ... if anything outside `.trellis/workspace/` and `.trellis/tasks/` is dirty, **stop and bail** with `Working tree has uncommitted code changes. Return to workflow Phase 3.4 to commit them before running /trellis:finish-work.` `Do NOT run git commit here. Do NOT prompt the user to commit. The user goes back to Phase 3.4 and the AI drives the batched commit there.` | finish-work bail-out |
| `.claude/commands/trellis/finish-work.md:54` | `Use the work-commit hashes produced in Phase 3.4 ... for --commit.` | finish-work session-journal step |
| `.cursor/commands/trellis-finish-work.md:3,31,33,54` | Identical content (cursor mirror) | finish-work mirror |
| `.opencode/commands/trellis/finish-work.md:3,31,33,54` | Identical content | finish-work mirror |
| `.pi/prompts/trellis-finish-work.md:3,31,33,54` | Identical (pi mirror, uses `$finish-work` token) | finish-work mirror |
| `.agents/skills/trellis-finish-work/SKILL.md:8,36,38,59` | Identical (codex/agents skill version) | finish-work mirror |
| `packages/cli/src/templates/codex/skills/finish-work/SKILL.md:8,36,38,59,69` | Template source for codex skill. Includes flow diagram: `Phase 3.4 (workflow.md) -> AI drafts batched commits -> user confirms -> git commit` | Codex skill template |
| `packages/cli/src/templates/copilot/prompts/finish-work.prompt.md:7-9,39,41,62` | Identical bail-out language. Adds: `**Timing**: After Phase 3.4 (Commit changes) — when the working tree is already clean.` | Copilot finish-work prompt |
| `packages/cli/src/templates/common/commands/finish-work.md:3,31,33,54` | Master template (substituted into per-platform copies) | Common finish-work template |
| `.claude/skills/trellis-meta/references/local-architecture/workflow.md:62` | `Phase 3.4 = AI-driven code commits (batched, user-confirmed), Phase 3.5 = /finish-work (archive + record session). /finish-work refuses to run if the working tree is dirty.` | trellis-meta reference (only loaded on demand) |
| `.claude/skills/trellis-update-spec/SKILL.md:10` | `**Timing**: After completing a task, fixing a bug, or discovering a new pattern` (no commit reference) | update-spec skill — silent on commit ordering |
| `.claude/skills/trellis-update-spec/SKILL.md:345` | `/trellis:finish-work - Reminds you to check if specs need updates` | update-spec skill — **stale**: finish-work no longer prompts for spec updates |
| `.claude/skills/trellis-check/SKILL.md:3` | description: `... before committing changes ...` | trellis-check skill (vague — not an instruction to commit) |
| `.claude/skills/trellis-check/SKILL.md:8` | `Comprehensive quality verification ... Combines spec compliance, cross-layer safety, and pre-commit checks.` | trellis-check skill — implies commit follows but never says who runs it |
| `.claude/skills/trellis-brainstorm/SKILL.md:524` | `Task Workflow Phase 3 (Execute)` (passing reference, no commit guidance) | brainstorm skill — irrelevant to commit |
| `.claude/commands/trellis/continue.md:13,29` | `Confirms: current task, git state, recent commits.` `Code written, pending final quality gate → Phase 3: Finish (step 3.1)` | `/trellis:continue` — points to Phase 3 entry but does not single out 3.4 |
| `AGENTS.md:13` | `If a Trellis command is available on your platform (e.g. /trellis:finish-work, /trellis:continue), prefer it over manual steps.` | AGENTS.md root marker — **mentions finish-work, never mentions commit/Phase 3.4** |
| `CLAUDE.md` | (no Phase 3.4 / commit-workflow content; only behavioral guidelines) | Repo CLAUDE.md silent on workflow |
| `packages/cli/src/templates/codex/skills/record-session/SKILL.md:8` | `Do NOT run git commit directly — the scripts below handle their own commits for .trellis/ metadata.` | record-session helper — **separate** commit ban (for journal commits, not work commits) |

---

## Detailed Findings

### 1. The Expected Flow According to Docs (workflow.md walkthrough)

`workflow.md` Phase Index (lines 119-124) lists 3.4 as **"Commit changes"** — `[required · once]`. The body at lines 446-494 is unambiguous and AI-driven:

> "The AI drives a batched commit of this task's code changes so `/finish-work` can run cleanly afterwards."

Step-by-step the walkthrough has the AI:
1. Run `git status --porcelain`,
2. Read `git log --oneline -5` for style,
3. Classify dirty files into "AI-edited this session" vs "unrecognized",
4. Draft a multi-commit plan,
5. Present plan, ask for one-shot confirmation,
6. Run `git add` + `git commit` per batch on confirmation,
7. Bail to manual mode on rejection.

So the walkthrough firmly says "AI drives". This is the canonical contract.

### 2. The Expected Flow According to the Breadcrumbs

Three breadcrumbs touch this area:

- **`in_progress`** (`workflow.md:528-534`): flow is `trellis-implement → trellis-check → trellis-update-spec → finish`. **Commit is not in the list.** The "next required action" line says "inspect conversation history + git status, then execute the next uncompleted step in that sequence" — but the sequence shown lacks commit, so the AI has nothing to anchor to.
- **`completed`** (`workflow.md:537-538`): says "Code committed via Phase 3.4; run `/trellis:finish-work`." Correctly describes post-commit, dirty-tree-refusal state.
- **No transition fires `completed`.** Per the PRD (`prd.md:18`) and confirmed by reading `task.py finish` semantics in `workflow.md:49,76`: `task.py finish` only clears the active task pointer; status remains `in_progress` until `task.py archive` deletes the task. So the `completed` block is dead text.

**Inconsistency**: the walkthrough says `in_progress` ends with commit then finish, but the breadcrumb terminates the flow at "finish".

### 3. /trellis:finish-work — Bail-out Logic, Not Commit Driver

Cited from `.claude/commands/trellis/finish-work.md` (mirrored in cursor / opencode / pi / common template / codex skill / copilot prompt):

```
## Step 2: Sanity check — working tree must be clean

git status --porcelain

Filter out paths under .trellis/workspace/ and .trellis/tasks/ — those are managed
by add_session.py and task.py archive auto-commits and will appear dirty as part
of this skill's own work.

If anything else is dirty (any path outside those two prefixes), stop and bail out with:

> "Working tree has uncommitted code changes. Return to workflow Phase 3.4
>  to commit them before running /trellis:finish-work."

Do NOT run git commit here. Do NOT prompt the user to commit. The user goes back
to Phase 3.4 and the AI drives the batched commit there.
```

Confirmed: the finish-work skill is **read-only on git**. It detects dirty state and refuses; it does not commit.

### 4. Sub-agent Implement Prohibitions

All `trellis-implement` agent definitions across platforms enforce a hard ban:

- Description tagline: `... No git commit allowed.` (claude/cursor/opencode/pi/droid/gemini/codebuddy/qoder/kiro)
- "Forbidden Operations" list: `git commit`, `git push`, `git merge` (claude/cursor/opencode/droid/gemini/qoder/codebuddy)
- Push-injection prelude (`inject-subagent-context.py:359`, `inject-subagent-context.js:156`): `Do NOT execute git commit, only code modifications`
- Codex pull-based prelude (`.codex/agents/trellis-implement.toml:29`): softer — `Do not make destructive git changes unless explicitly asked.` Does not mention commit explicitly, does not mention Phase 3.4.

This implies — but never *states* — that commit must therefore happen in the **main** session.

### 5. Pull-based Platform Implications (Codex)

Codex is class-2 pull-based: sub-agents load context themselves via the `developer_instructions` block. Reading `.codex/agents/trellis-implement.toml` (full file, lines 1-35) and `.codex/agents/trellis-check.toml` (full file, lines 1-54):

- `trellis-implement.toml`: only says `Do not make destructive git changes unless explicitly asked.` No mention of commit, Phase 3.4, or that commit happens in main session.
- `trellis-check.toml`: zero references to commit or `git commit`.

So a Codex sub-agent has even less guidance than other platforms. The commit responsibility is entirely on the main Codex session — but the only place it learns about commit is from re-reading `workflow.md` (which it must do voluntarily, since codex has no per-turn breadcrumb hook from `inject-workflow-state.py`... actually it does — `.codex/hooks/inject-workflow-state.py` exists and runs UserPromptSubmit-equivalent. So codex main session does see the same `in_progress` breadcrumb gap).

### 6. trellis-update-spec and trellis-check on Commit

- **trellis-update-spec** (`.claude/skills/trellis-update-spec/SKILL.md`): says "**Timing**: After completing a task, fixing a bug, or discovering a new pattern" (line 10). No mention of commit before/after. Line 345 references `/trellis:finish-work` as "Reminds you to check if specs need updates" — this description is **stale**: the current finish-work skill never reminds about specs.
- **trellis-check** (`.claude/skills/trellis-check/SKILL.md`): description says "use ... before committing changes". Body says "Combines spec compliance, cross-layer safety, and pre-commit checks." Implies commit follows but never says who drives it or that it's Phase 3.4.

Neither skill closes the loop by saying "after this, drive the commit".

### 7. Gaps in the Chain — Where AI Loses the Thread

Sequence the AI experiences during `in_progress`:

1. **Per-turn breadcrumb** (highest signal — fires every turn): says flow is `implement → check → update-spec → finish`. **Commit absent.**
2. **AI dispatches `trellis-implement`**: sub-agent told `No git commit allowed`. AI infers "I'll commit later" but never told *when* or *that it's their job*.
3. **AI dispatches `trellis-check`**: sub-agent silent on commit. Skill description hints at "before committing" but doesn't say who.
4. **AI loads `trellis-update-spec`**: skill silent on commit ordering.
5. **AI sees breadcrumb sequence ending in "finish"** → proposes `/trellis:finish-work`.
6. **`/trellis:finish-work` runs Step 2 sanity check** → bails: "Return to workflow Phase 3.4 to commit them...".
7. AI now reads Phase 3.4 (or runs `get_context.py --mode phase --step 3.4`) and learns "AI drives a batched commit".

Steps 1-5 contain **no canonical instruction** that the AI drives Phase 3.4. The instruction exists, but lives in:

- A walkthrough section (`workflow.md` Phase 3.4 body) the AI does not re-read between turns.
- A breadcrumb (`completed`) that never fires.
- An on-demand reference (`trellis-meta/references/local-architecture/workflow.md:62`) the AI does not load by default.

The chain breaks at the `in_progress` breadcrumb. That's the single per-turn channel and it omits commit.

### 8. Crossover: When Does the AI Cross from "Implementing" to "Should Commit Now"?

There is **no explicit crossover signal** in the current text. The AI must infer the transition from:

- Having received a "successful" report from `trellis-check` and `trellis-update-spec`, and
- Reading the `in_progress` breadcrumb that lists "finish" as the next step.

But "finish" in the breadcrumb is ambiguous — it can be read as either "Phase 3 finish" (which includes 3.4 commit) or "/trellis:finish-work" (which does not). Empirically (per the PRD `prd.md:7`), the AI reads it as the latter.

### 9. Single Canonical "AI drives Phase 3.4" Instruction?

**No.** The instruction is spread across four files, none of which fire on the per-turn channel:

1. `workflow.md` Phase 3.4 walkthrough body — needs explicit re-read.
2. `trellis-meta/references/local-architecture/workflow.md:62` — needs trellis-meta skill load.
3. `finish-work.md` bail-out paragraph — only seen *after* the AI has already mis-routed to finish-work.
4. `workflow.md` `[workflow-state:completed]` block — never fires.

The PRD (`prd.md:22-29,49-58`) proposes the fix: insert the commit-driver instruction directly into the `[workflow-state:in_progress]` breadcrumb (the per-turn channel). That closes the gap because the `in_progress` breadcrumb fires every turn while the task is in progress.

---

## Answer to the Closing Question

> "From the AI's vantage point, what would need to change so the AI never proposes /trellis:finish-work without first driving a commit?"

The minimum change is to make the `in_progress` breadcrumb (the only per-turn injection while in implementation) explicitly say:

1. **Commit (Phase 3.4) is in the flow**, between `update-spec` and `finish` — not after.
2. **The main AI session DRIVES the commit** — states the plan, runs `git commit` — before suggesting `/trellis:finish-work`.
3. **Optionally** restate the dirty-tree refusal so the AI sees the consequence.

This needs to land in three byte-aligned sources:
- `.trellis/workflow.md` `[workflow-state:in_progress]` block (live, user-editable, source of truth — read by `inject-workflow-state.py:204-227 load_breadcrumbs()`).
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` `_FALLBACK_BREADCRUMBS["in_progress"]` (Python belt-and-suspenders).
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js` `in_progress` string (JS port for opencode).

Plus a migration manifest entry so existing user projects pick up the new `workflow.md` block, and a regression test to keep the three sources in sync.

Secondary improvements (out of scope per PRD `prd.md:72-77` but worth noting for context):
- The `completed` breadcrumb is dead — no transition fires it. Either wire a transition or delete the block.
- `trellis-update-spec` SKILL.md line 345 has a stale claim about `/trellis:finish-work` reminding for spec updates.
- The codex sub-agent preludes have no Phase 3.4 awareness at all; relies entirely on the main-session breadcrumb.

---

## Caveats / Not Found

- `inject-subagent-context.py` only fires for **push-based** sub-agent platforms (Claude / Cursor / OpenCode etc). Codex uses pull-based `developer_instructions` in `.codex/agents/*.toml`. Both share the same per-turn breadcrumb hook (`inject-workflow-state.py`) for the **main** session, so the `in_progress` fix lands uniformly across both classes.
- I did not check the `.kiro/`, `.gemini/`, `.qoder/`, `.codebuddy/`, `.factory/` (droid) live directories for breadcrumb hook content because those platforms either lack a per-turn hook entry point (Kiro per `inject-workflow-state.py:13` comment) or share the `shared-hooks` Python source. The template source (`packages/cli/src/templates/shared-hooks/inject-workflow-state.py`) is authoritative for all of them.
- The `.pi/` platform uses a `prompts/` directory rather than skills/commands; verified `.pi/prompts/trellis-finish-work.md` carries the same bail-out logic.
- `marketplace/skills/`, `.trellis/.backup-*`, and `docs-site/` were excluded from the survey since they are not in the live AI context loop.

---

## Related Specs / References

- `.trellis/workflow.md` (full file — Phase 3.4 walkthrough is the canonical commit driver instruction).
- `.claude/skills/trellis-meta/references/local-architecture/workflow.md` (architectural description of the 3.4/3.5 split).
- `.trellis/tasks/04-30-workflow-state-commit-gap/prd.md` (the task PRD that triggered this research; already contains the proposed fix text at lines 49-58).
