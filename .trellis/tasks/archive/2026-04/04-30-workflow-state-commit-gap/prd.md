# fix(hook): workflow-state breadcrumb 漏掉强制阶段 + 三处 source 已漂移

## 目标

主会话每个 turn 注入的 `<workflow-state>` breadcrumb **至少漏掉了 workflow.md 走读正文标注 `[required · once]` 的两个阶段**（Phase 1.3 jsonl curation 和 Phase 3.4 commit），并且**三处文本 source 已经开始漂移**。breadcrumb 是唯一全平台通用的 phase 指引通道——class-2（pull-based）平台的 sub-agent 完全看不到 SessionStart / UserPromptSubmit 注入——所以这里任何 gap 都会传染到所有支持平台上的所有 AI agent。

发现时机：跑 `04-30-init-yes-bootstrap-204` 任务时，AI（我自己）跳过了 Phase 3.4，在工作树还脏的情况下提议 `/trellis:finish-work`。事后做的研究（4 个 trellis-research sub-agent 持久化到 `research/`）证明这是结构性 gap，不是 commit 单点疏漏。

## Research 引用

- [`research/hook-topology.md`](research/hook-topology.md) — 每个平台的 hook 脚本清单；class-1（push）vs class-2（pull）；breadcrumb 仅主会话可达，sub-agent 完全看不到
- [`research/breadcrumb-state-machine.md`](research/breadcrumb-state-machine.md) — 三处文本 source、漂移地图、Phase 1.3 + 3.4 双双缺席 breadcrumb、所有 status writer 详尽列表
- [`research/commit-guidance-trail.md`](research/commit-guidance-trail.md) — Phase 3.4 commit 指引只在 workflow.md 走读正文里出现；per-turn 通道完全静默
- [`research/status-transitions.md`](research/status-transitions.md) — 6 个 writer / 3 个值；`cmd_archive` 是原子 flip+move；`after_finish` lifecycle 事件 ≠ 状态转移；3 个 reader 残留 `"done"` 容忍

## 已知事实（来自调研）

### 架构（已确认）

- **Breadcrumb 有三处文本 source**，py/js 两边对齐，workflow.md 已漂移：
  - `packages/cli/src/templates/trellis/workflow.md:514-540` — 实时 `[workflow-state:STATUS]` 块（运行时 source of truth）
  - `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:144` — `_FALLBACK_BREADCRUMBS` dict
  - `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js:37` — JS port（4 个 status 与 Python 字节级一致）
- **workflow.md 漂移点**：`no_task` 和 `in_progress` 段相对 py/js fallback 有微调（"none of the override phrases below apply"、"do not carry forward"、"then proceed"），py/js 没跟上。
- **运行时优先级**：`inject-workflow-state.py:204 load_breadcrumbs()` 解析 workflow.md 的 `[workflow-state:STATUS]` 标签，逐 status 覆盖 fallback dict。未知 status 走通用兜底 "refer to workflow.md"。tag regex `[A-Za-z0-9_-]+` 允许任意 status 字符串。

### Status 状态机（grep 全部 writer 后确认）

| 起始 | 目标 | 触发 | 代码位置 |
|------|------|------|----------|
| ∅ | `planning` | `task.py create` | `task_store.py:206`（TS factory `emptyTaskJson` 同 default） |
| `planning` | `in_progress` | `task.py start`（gated；只翻 planning） | `task.py:110` |
| 任意 | `completed` | `task.py archive`（原子 flip + `mv` 到 `archive/YYYY-MM/`） | `task_store.py:316-348` |
| `planning`（bootstrap/joiner） | 创建时直接写 `in_progress` | `init.ts` 覆盖 factory default | `init.ts:438, 454` |

- **`cmd_archive` 之外没有任何代码路径写 `"completed"`**，且 `cmd_archive` 在同一调用里把目录搬走，active-task resolver 立刻丢失指针。**`[workflow-state:completed]` breadcrumb 实际不可达。**
- `task.py finish` 只清掉 per-session active-task 指针——**不动 status**。任务一直停在 `in_progress` 直到 archive。
- Lifecycle 事件（`after_create / after_start / after_finish / after_archive`）≠ 状态转移。订阅 `after_finish` 做"任务完成"通知会误触——正确事件是 `after_archive`。
- `cmd_archive` 接受 `planning → completed` 直接跳跃，跳过 `in_progress`（轻微一致性边角，目前不构成问题）。
- 3 个 reader（`tasks.py:110`、`session_context.py:340/420`）残留 `"done"` 容忍——没有 writer 产出。已记录但不算当前 bug。

### Hook 可达性矩阵（已确认）

| 通道 | 主会话 | Class-1 sub-agent（push） | Class-2 sub-agent（pull） |
|------|--------|---------------------------|----------------------------|
| SessionStart hook 输出 | ✅（Copilot 例外——宿主忽略 SessionStart） | ✅ via inject-subagent-context | ❌ |
| UserPromptSubmit `<workflow-state>` breadcrumb | ✅ 每 turn | ❌（sub-agent 有自己的 UserPromptSubmit，但主会话 breadcrumb 不注进来） | ❌ |
| Pull-based prelude（`shared.ts:356-378`） | N/A | N/A | ✅——但只提 `prd.md`/jsonl，**不提 phase/status/commit** |

Class-2 平台：codex / gemini / qoder / copilot。它们的 sub-agent（`trellis-implement` / `trellis-check`）**任何形态都看不到 workflow-state 指引**，全靠 skill + prelude。

### 走读正文 vs breadcrumb 缺口（核心发现）

`workflow.md` 上半部分走读正文把 Phase 1.3 和 Phase 3.4 都标为 `[required · once]`。下半部分 breadcrumb tag **两个都没提**：

| 阶段 | 走读标注 | breadcrumb 是否提及？ | AI 唯一能学到这条规则的渠道 |
|------|----------|------------------------|------------------------------|
| Phase 1.3 — `implement.jsonl` / `check.jsonl` curation | `[required · once]` | ❌（`planning` breadcrumb 只提 brainstorm + research，没 jsonl） | 走读正文——per-turn 看不到 |
| Phase 3.4 — commit | `[required · once]` | ❌（`in_progress` breadcrumb 把流程折叠成 "finish"） | 走读正文 + `/finish-work` 兜底 |

**这是同一类 bug，已经看到两次。**只修 Phase 3.4 不修 1.3，Phase 1.3 仍会以同样的失败模式继续坑 AI（per-turn 通道不强制，AI 静悄悄跳过）。

### 其他发现（不在 MVP 范围）

- `trellis-update-spec/SKILL.md:345` 有过期描述："/trellis:finish-work reminds you to check if specs need updates"——finish-work 现在不做这个。Cosmetic。
- Codex hook 由 `~/.codex/config.toml` 里的 `features.codex_hooks = true` 控制（`codex.ts:80-90`）。没开就完全不触发 breadcrumb。
- 3 个 reader 残留 `"done"` 容忍（无 writer）。清理目标，不是缺陷。

## Requirement（MVP）

### R1 — 修 `in_progress` breadcrumb（用户报的 bug）

flow 行加 `commit (Phase 3.4)`，明确"主会话驱动 commit"的指令。

### R2 — 修 `planning` breadcrumb（同类 gap）

planning breadcrumb 现在只说"complete prd.md via brainstorm; run task.py start"。增加："`task.py start` 之前，按 workflow.md Phase 1.3 整理 `implement.jsonl` 和 `check.jsonl`——sub-agent 没有这两个文件就拿不到对的 spec context。"

### R3 — 三处 source 对齐

`workflow.md` 的 `no_task` 和 `in_progress` 段已经从 py/js 漂走。把三者拉回一致（按 R5 的方案，最终其实是把 py/js fallback 删掉，问题自然消失）。

### R4 — Migration manifest

存量用户项目的 `.trellis/workflow.md` 需要被更新。复用 managed-block 替换模式（`AGENTS.md` 的 `TRELLIS:START/END` 标记是先例）。这里的标记 `[workflow-state:STATUS]` / `[/workflow-state:STATUS]` 已经现成，直接复用。

### R5 — 收敛单一 SoT（删除 `_FALLBACK_BREADCRUMBS`）

把 `inject-workflow-state.py` 和 `inject-workflow-state.js` 里的 fallback dict 直接删掉。`workflow.md` 成为 breadcrumb 内容唯一编辑源。漂移在结构上变得不可能。

- `inject-workflow-state.py`：删 `_FALLBACK_BREADCRUMBS` dict（line 144-201）。`load_breadcrumbs()` 在 workflow.md 缺失/损坏时返回 `{}`；`build_breadcrumb` 已有的兜底（line 244 `body = "Refer to workflow.md for current step."`）处理缺 tag 的 status。
- `inject-workflow-state.js`：同样——删 `FALLBACK_BREADCRUMBS`（line 37-95）。Python 行为对齐。
- R3 的"三 source 一致性 regression test"自动简化成"workflow.md 必须包含 4 个必需 tag block"——不需要再做 JS/Python 对比。

行为变化：用户 workflow.md 损坏时，breadcrumb 退化成"任务 id + Refer to workflow.md for current step."。可接受——损坏的 workflow.md 是用户应该看到的 bug，不该被默默掩盖。

### R7 — 让 `task.py create` 同时设 active task pointer（让 `planning` status 真实可达）

**问题**：当前 `task.py create` 只建任务目录 + 写 `task.json`（status=planning），**不写 session pointer**。`task.py start` 同时做"写 pointer + 翻 status 到 in_progress"。

后果：在新设计的流程 `create → brainstorm → start` 下，`create` 之后到 `start` 之前 session 没有 active task pointer，hook 解析 `<task-status>` 都返回 NO ACTIVE TASK，per-turn breadcrumb 显示 `no_task`——`[workflow-state:planning]` block **永远不被触发**，跟 `[workflow-state:completed]` 一样成为 dead text。

**修法**（最小侵入）：

`packages/cli/src/templates/trellis/scripts/common/task_store.py` 的 `cmd_create` 末尾追加：

```python
# Auto-activate the new task so per-turn breadcrumb fires planning state.
# Best-effort: gracefully degrade if no session identity (CLI run outside
# AI session) — task is still created, user can task.py start later.
try:
    from .active_task import resolve_context_key, set_active_task
    if resolve_context_key():
        rel_dir = task_dir.relative_to(repo_root).as_posix()
        set_active_task(rel_dir, repo_root)
except Exception:
    pass  # Don't fail create if activation fails
```

`task.py start` 不需要改 —— 它已经处理"pointer 已存在 → 只翻 status"的情况：

```python
# cmd_start 现有代码：
active = set_active_task(task_dir, repo_root)  # 幂等，pointer 已指向同一任务则无操作
if active:
    # 然后翻 status
    if data.get("status") == "planning":
        data["status"] = "in_progress"
```

**新的状态机**：

| 阶段 | task.json.status | session pointer | breadcrumb |
|---|---|---|---|
| `task.py create` 后 | `planning` | 已设（指向新任务） | `[workflow-state:planning]` ✅ |
| brainstorm + jsonl curation | `planning` | 已设 | `[workflow-state:planning]` ✅ |
| `task.py start` 后 | `in_progress` | 已设（同一任务） | `[workflow-state:in_progress]` ✅ |
| `task.py finish` 后 | `in_progress`（不变） | 清掉 | `[workflow-state:no_task]` ✅ |
| `task.py archive` 后 | `completed` + 移动到 archive/ | 清掉所有指向它的 | breadcrumb 不再触发 |

**Multitask 影响**：零。pointer 仍是 session-scoped（每 session 自己的 `.trellis/.runtime/sessions/<context_key>.json`），不同 session 的 pointer 互不影响。Session A 创建任务 X 自动 active session A 的 pointer；Session B 看到 X 但 pointer 仍指向 B 自己之前的任务。

**降级行为**：
- CLI 直接调用 `task.py create`（无 session 身份）→ 仅建任务目录，不设 pointer，行为与现状一致
- AI session 内调用 → 自动 active

### R8 — `continue.md` 路由表对齐新状态机

`/trellis:continue` 的 slash command 模板（`packages/cli/src/templates/common/commands/continue.md`）目前 Step 3 用 `prd.md` 存在性 + 是否写代码作为路由依据，没考虑 R7 新增的 1.4 Activate 步骤，也没用 `task.json.status` 字段做更精确的路由。

**改动**：把 Step 3 改成基于 `task.json.status` + artifact 存在性的双因子路由：

- `status=planning` + 无 `prd.md` → 1.1（载入 `trellis-brainstorm`）
- `status=planning` + 有 `prd.md` + jsonl 未 curated（只剩 seed `_example`）→ 1.3
- `status=planning` + 有 `prd.md` + jsonl curated → **1.4（跑 `task.py start` 进 Phase 2）**
- `status=in_progress` + 实施未开始 → 2.1
- `status=in_progress` + 实施完，未质检 → 2.2
- `status=in_progress` + 质检过 → 3.1
- `status=completed`（罕见，通常 archive 紧随）→ 走 archive 流程

**为什么需要 R8**：R7 让 `task.py start` 成为状态机的语义边界（status: planning → in_progress）。`continue.md` 不更新的话，AI 用 `/trellis:continue` 恢复时仍按旧的 PRD-based 逻辑跳到 Phase 2.1，跳过 1.4 的显式 start 步骤，task.json.status 卡在 planning 且无人翻 → 后续 breadcrumb 永远走 planning 分支，跟实际工作阶段错配。

**关联文件**：
- `packages/cli/src/templates/common/commands/continue.md` — Step 3 重写
- `.claude/commands/trellis/continue.md` / `.opencode/commands/trellis/continue.md` 等 dogfood 副本由 `trellis update` 自动同步，不需要手动改

### R6 — 新 spec：workflow-state contract

新建 `.trellis/spec/cli/backend/workflow-state-contract.md`，把这套 runtime contract 落档，未来维护者不用再从 research 里推导：

- **标记语法**：`[workflow-state:STATUS]` ... `[/workflow-state:STATUS]`，status 字符集 `[A-Za-z0-9_-]+`
- **运行时合约**：hook 在每个 UserPromptSubmit turn 读 `.trellis/workflow.md`，正则解析 tag block，发出 `<workflow-state>` 块写入 `additionalContext`
- **Source of truth**：R5 之后 workflow.md 是唯一可编辑源；py/js 脚本只含解析器，不再嵌入文本
- **Status writer**（3 个在 `task_store`/`task.py`，2 个在 `init.ts`，1 个在 `update.ts`）——含 file:line 的完整表格
- **Lifecycle 事件**（`after_create / after_start / after_finish / after_archive`）以及它们如何（不）对应 status 转移
- **可达性**：哪些 status 可达，哪些是死代码（`cmd_archive` 之后的 `completed`）
- **伪 status**（`no_task`、`stale_<source_type>`）
- **自定义 status 扩展合约**：fork 怎么加自己的 status
- **Hook 可达性矩阵**：主会话（是）、class-1 sub-agent（否）、class-2 sub-agent（否）
- **Do / Don't** 段
- **Mandatory triggers**：动以下任意一项时必须更新本 spec —— 标记语法 / hook 脚本 / status writer / breadcrumb 内容

## 验收标准

- [ ] `workflow.md` `[workflow-state:in_progress]` 的 flow 行包含 `commit (Phase 3.4)` + commit 驱动指令。
- [ ] `workflow.md` `[workflow-state:planning]` 提及 Phase 1.3 jsonl curation 是 `task.py start` 之前的步骤。
- [ ] `task.py create`（在有 session 身份的环境下）执行后，hook 立刻能解析到 active task pointer，`<task-status>` 显示 `Status: PLANNING`，per-turn breadcrumb 走 `[workflow-state:planning]` 分支。
- [ ] `task.py create`（无 session 身份，CLI 直接调用）仍然成功建任务目录，不报错，pointer 不设。
- [ ] `task.py start` 在 pointer 已经指向同一任务的情况下幂等（不报错，只翻 status）。
- [ ] `packages/cli/src/templates/common/commands/continue.md` Step 3 用 `task.json.status` + artifact 双因子路由，且明确包含 1.4 Activate 分支。
- [ ] `inject-workflow-state.py` 已删除 `_FALLBACK_BREADCRUMBS`；`load_breadcrumbs()` 在 workflow.md 缺失/损坏时返回 `{}`。
- [ ] `inject-workflow-state.js` 已删除 `FALLBACK_BREADCRUMBS`；行为与 Python 对齐。
- [ ] Hook regression test：解析 `workflow.md` 的 4 个必需 tag block，断言每个发出的 `<workflow-state>` 含预期 substring（例如 `in_progress` body 必须含 `commit (Phase 3.4)`）。R5 之后无需多 source diff。
- [ ] Hook degradation test：workflow.md 缺失或某 tag 被剔除时，hook 发出 `<workflow-state>` 含 `Refer to workflow.md for current step.` 且不崩。
- [ ] Migration manifest entry 替换用户 `.trellis/workflow.md` 中所有 4 个 `[workflow-state:*]` 块。workflow.md 其他位置的用户自定义保留。
- [ ] 在本仓库 dogfood：跑 `trellis update`，确认 `.trellis/workflow.md` 拿到新 block 且 `.trellis/scripts/inject-workflow-state.py` 不再带 fallback dict。
- [ ] `.trellis/spec/cli/backend/workflow-state-contract.md` 存在，含 R6 列出的全部 section。
- [ ] `pnpm test`、`pnpm lint`、`pnpm typecheck` 全过。

## Definition of Done

- [ ] R1 + R2（breadcrumb body 更新）落地到 workflow.md。
- [ ] R5（删除 fallback dict）落地到 py + js。
- [ ] R6（新 spec）落地到 `.trellis/spec/cli/backend/workflow-state-contract.md`。
- [ ] Hook regression + degradation 测试加好。
- [ ] Migration manifest 用 managed-block 替换处理 4 个 breadcrumb status。
- [ ] 本仓库通过 `trellis update` dogfood 验证。
- [ ] Changelog 条目延后到 `/trellis:create-manifest` 跑 beta.20+ 时补。

## Follow-up（不在本 task 范围，但记在这儿不要丢）

本 task 落地之后：

- **docs-site 更新**：docs.trytrellis.app 的架构 / hooks 文档页要反映新的 SoT 模型。当前页（如果有的话）可能描述了三 source 布局。在 `docs-site/concepts/` 或 `docs-site/advanced/` 下面定位，1-2 个 mdx 文件。
- **trellis-meta skill 更新**：`packages/cli/src/templates/common/bundled-skills/trellis-meta/SKILL.md` 给想自定义 Trellis 的用户解释工作流架构。R5 之后该改成 "edit `.trellis/workflow.md`——it's the single source of truth for breadcrumbs"，不再把 py/js fallback dict 当作可编辑目标。任何提到 "fallback" 或 "three-source" 架构的部分都要删。
- **Cosmetic 清理 `trellis-update-spec/SKILL.md:345`** 那条过期描述（说 `/trellis:finish-work` 会提醒检查 spec——它现在不做了）。小尾巴。
- **残留 `"done"` status 容忍**：3 个 reader（`tasks.py:110`、`session_context.py:340/420`）有，没有 writer 产出。清理目标。

这些以 TODO 形式留在本 PRD——本 task 完成归档时，复制到 sibling task 或 Follow-up 任务文件，不要让它们消失。

## 技术方案

### 提议的新 body 文本

```
[workflow-state:planning]
Complete prd.md via trellis-brainstorm skill.
Phase 1.3 (required, once): before `task.py start`, curate `implement.jsonl` and `check.jsonl` — list the spec/research files sub-agents need so they inject the right context. Sub-agents that don't get jsonl injection write generic code.
Then run `task.py start`.
Research belongs in `{task_dir}/research/*.md`, written by `trellis-research` sub-agents. Do NOT inline WebFetch/WebSearch in main session — PRD only links to research files.
[/workflow-state:planning]
```

```
[workflow-state:in_progress]
Flow: trellis-implement → trellis-check → trellis-update-spec → commit (Phase 3.4) → finish
Next required action: inspect conversation history + git status, then execute the next uncompleted step in that sequence.
For agent-capable platforms, the default is to dispatch `trellis-implement` for implementation and `trellis-check` before reporting completion — do not edit code in the main session by default.
Phase 3.4 (required, once): after trellis-update-spec (or whenever implementation is verifiably complete), the main session DRIVES the commit — state the commit plan in user-facing text, then run `git commit` — BEFORE suggesting `/trellis:finish-work`. `/finish-work` refuses to run on a dirty working tree (paths outside `.trellis/workspace/` and `.trellis/tasks/`).
Use the exact Trellis agent type names when spawning sub-agents: `trellis-implement`, `trellis-check`, or `trellis-research`. Generic/default/generalPurpose sub-agents do not receive `implement.jsonl` / `check.jsonl` injection.
User override (per-turn escape hatch): if the user's CURRENT message explicitly tells the main session to handle it directly ("你直接改" / "别派 sub-agent" / "main session 写就行" / "do it inline" / "不用 sub-agent"), honor it for this turn and edit code directly. Per-turn only; does not carry forward; do NOT invent an override the user did not say.
[/workflow-state:in_progress]
```

`no_task` 和 `completed` 块：R5 落地后 py/js 不再保留 fallback，所以"对齐"工作变成空操作——只剩 workflow.md 一个 source。`completed` 块本身依然死代码，但保留即可（出于将来可能的 status transition 重设计）。

### Migration 形状

- 复用 managed-block 替换模式。标记 `[workflow-state:STATUS]` / `[/workflow-state:STATUS]` 已经包好每一段。
- 每个 status block 一条 manifest entry（或一条统一替换 4 个）。看一下 `packages/cli/src/migrations/manifests/` 的现有格式。
- 用户自定义过 workflow.md 块的情况：保留还是覆盖？**默认：检测到自定义则覆盖 + 打 warning + 提示用户重新应用 customization。**与 `AGENTS.md` TRELLIS-marker 同样的 trade-off。具体行为实现时再定。

### Hook 测试草稿

```typescript
// test/regression.test.ts
describe("workflow-state breadcrumb (post-R5)", () => {
  it("workflow.md contains all required tag blocks", () => {
    const wfMd = parseWorkflowMd();
    for (const status of ["no_task", "planning", "in_progress", "completed"]) {
      expect(wfMd[status]).toBeDefined();
      expect(wfMd[status].length).toBeGreaterThan(20);
    }
  });

  it("in_progress breadcrumb mentions commit (Phase 3.4)", () => {
    const wfMd = parseWorkflowMd();
    expect(wfMd.in_progress).toMatch(/commit \(Phase 3\.4\)/);
  });

  it("planning breadcrumb mentions Phase 1.3 jsonl curation", () => {
    const wfMd = parseWorkflowMd();
    expect(wfMd.planning).toMatch(/Phase 1\.3/);
    expect(wfMd.planning).toMatch(/implement\.jsonl|check\.jsonl/);
  });

  it("missing workflow.md degrades gracefully (no crash)", async () => {
    // run inject-workflow-state.py with workflow.md absent
    // expect <workflow-state> output containing "Refer to workflow.md"
  });
});
```

## 决策（ADR-lite）

**背景**：调研发现的 gap 比用户报的单点 bug 更广——Phase 1.3 跟 Phase 3.4 是同形 gap。两条路：(a) 只修 Phase 3.4（用户报的），Phase 1.3 单独跟进；(b) 一起修，因为根因 + migration 通道都共用。**叠加新发现**：py/js fallback dict 本质上是 maintenance liability，应该通过架构收敛而不是流程纪律来杜绝漂移。

**决策**：(b) + 收敛 SoT。R1+R2 同 task 修，R3 不再是"三处对齐"而是"删掉两处重复"（R5），R6 把整套 contract 落档防止未来回退。

**后果**：
- Pro：一次 migration 闭合两个同类 bug；删除 fallback 把 maintenance 负担永久砍掉；新 spec 让未来维护者不用再考古。
- Con：本 task 范围比最初预想大；用户自定义过 workflow.md 块的会被替换（managed-block detection + warning 缓解，与 `AGENTS.md` 同 trade-off）；workflow.md 损坏时 breadcrumb 降级（接受——损坏本来就该让用户看到）。

## Out of Scope

- 真正实现一个 `in_progress → completed` 状态转移（让 `completed` breadcrumb 可达）。这是更大的工作流重设计。
- 把死代码 `[workflow-state:completed]` block 改造或删掉。保留即可——如果将来重设计了 transition 它就有用了。
- Class-2 sub-agent prelude 加入 phase/status/commit 感知。Prelude 在 `shared.ts:356-378`，刻意保持简洁；要不要让 sub-agent 知道 commit 是单独的 scope 问题（当前设计是"主会话 commit，sub-agent 只 implement/check"）。
- 残留 `"done"` status 容忍清理——目前不构成 bug，跟进任务。
- `trellis-update-spec/SKILL.md:345` 过期描述（finish-work 不再提醒 update spec）—— Cosmetic 跟进任务。
- Codex `features.codex_hooks = true` 可发现性（目前埋在 init warning 和 spec 里）—— UX 跟进任务。
- Copilot SessionStart hook 输出被宿主忽略 —— 上游限制，我们这边修不了。
- AI 训练 / feedback memory 注入。Hook 文本是杠杆点，AI memory 是下游。

## 技术备注

- 运行时优先级（R5 之后简化）：仅 `workflow.md` tag block。失败时降级到通用 "Refer to workflow.md"。
- `inject-workflow-state.py:204-227 load_breadcrumbs()` 是合并入口，R5 之后简化为只读 workflow.md。
- 发现于 `04-30-init-yes-bootstrap-204` 的 Phase 3.4 步骤（AI 在工作树脏的状态下提议 `/finish-work`）。
- 4 份 research 文件全在 `research/` 目录——前面 `## Research 引用` 段已链接。
- 关联 issue：N/A——内部工作流改进，无 GitHub issue。
- 平行 follow-up：残留 `"done"` 清理、cosmetic skill 更新、docs-site/meta skill 同步。
