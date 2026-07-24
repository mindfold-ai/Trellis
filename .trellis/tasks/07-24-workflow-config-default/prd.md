# PRD: Layered workflow default (config + personal override)

---

## ⚠️ 待定方向(需同事拍板):按"类型"选 workflow

本任务只做了 per-task / 个人 / 团队三层默认。同事原话"根据场景切换"(16:43:36)的正解
应是**按工作类型选**(产品 / research / 工程 各一套),**尚未实现,方向未定**。

- 库 `.trellis/workflows/<id>.md` 已支持多套并存;缺"任务类型 → 选哪套"的机制。
- 任务类型可复用 `task.json` 现有但空置的 `dev_type` 字段。
- **用户已选方案 A**:把 `type` 写进每个 workflow 文件的 frontmatter。
  - ⚠️ **风险(用户点出)**:type 分散在各文件,按类型选要扫描匹配,**非确定性**——
    多个同 type 会歧义、没匹配会静默漏选("本该用它时有概率不会被用到")。
  - **确定性替代(方案 B)**:在 `config.yaml` 建 `type → workflow` 映射表。

待同事定:分哪几类 / 是否用 `dev_type` / 用 A 还是 B。定清前不实现。

---

## Source

This task implements the colleague's requirement from the 2026-07-23 conversation
(whisper transcript, screenshots supplied by user). **Every requirement below is
cited to a transcript timestamp.** Nothing here is added beyond what the transcript
states; speculative parts of the transcript are listed under Non-goals with reasons.

## Problem (transcript-grounded)

- **16:44:07** — "默认是 native,然后想用 TDD 时,native 直接被覆盖掉直接就没了…那就是不合理"
  → switching a workflow today **overwrites** the previous one and loses it. Want
  workflows to **coexist** (并存). *(Already delivered by 467's `.trellis/workflows/`
  library — this task builds on it.)*
- **16:44:23 / 16:44:39** — the choice of which workflow is the default should be
  **layered**: a team-shared default in `config.yaml` (in git), plus a **personal**
  override that is **not uploaded to git** and has **higher priority**.

Today (after 467) a task can pin a workflow via `task.json.workflow`, else everything
falls back to the single global `.trellis/workflow.md`. There is **no team default and
no personal override** — exactly the two layers the transcript asks for.

## Requirements

1. **Team default (in git, shared)** — `.trellis/config.yaml` gains an optional
   `default_workflow: <id>` key.
   *Source: 16:44:23 "config.yaml 是团队共享的配置文件…这里面可以配置 default".*
   Mirrors the existing `default_package` key exactly (same file, same style).

2. **Personal override (local, not in git, higher priority)** — an optional
   `workflow=<id>` line in the already-gitignored `.trellis/.developer` file.
   *Source: 16:44:39 "个人层次…不会被上传到 git repo…优先级可以高一点"; 16:44:23 references
   the existing `.developer` file.*
   `.developer` is already gitignored (`.trellis/.gitignore:2`) and per-developer; its
   reader (`paths.py:88` `get_developer`) only consumes `name=` lines and ignores all
   others, so an extra `workflow=` line is backward-safe.
   **[Assumption flagged — transcript silent on the exact file]**: the transcript names
   the personal *layer* and mentions `.developer` nearby but does not literally say
   "store the workflow id in `.developer`". Chosen because it is the existing
   per-developer, gitignored, key=value file — minimal reuse, no new file. Alternative
   would be a new gitignored `.trellis/.workflow-local`. Flag for colleague confirmation.

3. **Resolution chain** — extend 467's `resolve_workflow_md`. When a task does **not**
   pin a valid workflow, walk this precedence (highest → lowest), each resolving an id
   to `.trellis/workflows/<id>.md` (467 library) and falling through if the id is
   invalid or the file is missing:

   1. **Per-task** — `task.json.workflow` (467, kept). *Session-bound explicit choice;
      transcript 16:44:07 "跟 session ID 可以关在一起".*
   2. **Personal** — `.developer` `workflow=`. *(Req 2.)*
   3. **Team** — `config.yaml` `default_workflow`. *(Req 1.)*
   4. **Global** — `.trellis/workflow.md`. *(Existing fallback.)*

   **[Assumption flagged — transcript silent on per-task vs personal ordering]**:
   per-task is placed **above** personal because an explicit per-task pin is a
   deliberate, task-scoped intent that should beat a developer-wide default. The
   transcript only states personal > team. Flag for confirmation.

4. **Never breaks injection** — every layer read is fail-open: invalid/missing config,
   unreadable `.developer`, missing library file → fall through, ultimately to the
   global workflow. Never raises (467's `resolve_workflow_md` contract preserved).

5. **No behavior change without opt-in** — absent both new keys, resolution is
   byte-identical to 467 (per-task → global).

6. **All consumers inherit it for free** — session-start.py, inject-workflow-state.py,
   workflow_phase.py already call `resolve_workflow_md`; extending that one function
   covers them. The OpenCode `inject-workflow-state.js` port (own resolver) gets the
   same chain. Template AND live dogfood copies patched.

7. **Spec update** — `workflow-state-contract.md` per-task resolution section gains the
   4-layer chain.

## Non-goals (transcript parts deliberately NOT built — avoid 想当然 / 造轮子)

- **AI auto-generates a new workflow** (16:44:52 "让 AI 自动生成一个新的 workflow"):
  already possible with zero new code — ask the assistant to write a workflow file into
  `.trellis/workflows/`. No feature to build; will note in docs.
- **A DSL for defining workflows** (16:45:35 "定义好一套对应 DSL 就可能") and
  **splitting the monolithic workflow.md** (16:45:18 "砸入在同一个文件里面…值得去拆开"):
  stated hypothetically ("如果…就可能"), and both overlap the stalled **PR #337**
  (workflow → YAML manifest + split files). Reinventing them here would collide with
  #337. Out of scope; flag as "reconcile with #337" for the colleague.
- **Breaking the fixed 3-phase structure** (16:43:36 "主流程不是那三个也可能可以换一下"):
  stated tentatively ("可能"); depends on the DSL/#337 direction above. Not this task.
- **New CLI setters**: the transcript's UX is "config 文件里面改" (edit the config file)
  — so setting a default = editing `config.yaml`; setting personal = editing
  `.developer`. No new command needed. (Convenience setters can be a later add.)

## Acceptance Criteria

- [ ] `config.yaml` `default_workflow: tdd` (+ `.trellis/workflows/tdd.md` present) →
      a task with no `workflow` field resolves to `workflows/tdd.md` in all consumers.
- [ ] `.developer` `workflow=native` overrides the team `default_workflow: tdd`
      (personal beats team).
- [ ] A task pinning `workflow: channel` beats both personal and team (per-task top).
- [ ] Neither key set → byte-identical to 467 (per-task → global).
- [ ] Invalid id / missing library file at any layer → falls through, never raises;
      hooks still emit valid output.
- [ ] `.developer` with only `name=` still returns the correct developer name
      (backward-safe reader).
- [ ] `pnpm lint && pnpm typecheck && (packages/cli) pnpm lint:py` clean;
      `LC_ALL=C LANG=C pnpm test` green (init marketplace submodule first).
