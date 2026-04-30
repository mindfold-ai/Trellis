# Development Workflow

---

## 核心原则

1. **先规划再写代码** —— 动手之前想清楚要做什么
2. **Spec 注入而非记忆** —— 规范由 hook/skill 自动注入，不靠记忆
3. **一切都持久化** —— 调研、决策、教训都落到文件；对话会被压缩，文件不会
4. **增量推进** —— 一次只做一个任务
5. **沉淀学习** —— 每个任务结束复盘，把新知识写回 spec

---

## Trellis 系统

### 开发者身份 (Developer Identity)

第一次使用先初始化身份：

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

创建 `.trellis/.developer`（gitignored）和 `.trellis/workspace/<your-name>/`。

### 规范系统 (Spec System)

`.trellis/spec/` 按 package 和 layer 组织编码规范。

- `.trellis/spec/<package>/<layer>/index.md` —— 入口，包含 **Pre-Development Checklist** 和 **Quality Check**。具体规范在它指向的 `.md` 文件里
- `.trellis/spec/guides/index.md` —— 跨 package 的思考指引

```bash
python3 ./.trellis/scripts/get_context.py --mode packages   # 列出 packages 和 layers
```

**何时更新 spec**：发现新模式/约定 · 把 bug-fix 沉淀成预防规则 · 新的技术决策。

### 任务系统 (Task System)

每个任务独立目录 `.trellis/tasks/{MM-DD-name}/`，下含 `prd.md`、`implement.jsonl`、`check.jsonl`、`task.json`，可选 `research/`、`info.md`。

```bash
# 任务生命周期
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>] [--parent <dir>]
python3 ./.trellis/scripts/task.py start <name>          # 设为当前任务（支持时按 session 隔离）
python3 ./.trellis/scripts/task.py current --source      # 查看当前任务及来源
python3 ./.trellis/scripts/task.py finish                # 清掉当前任务（触发 after_finish hooks）
python3 ./.trellis/scripts/task.py archive <name>        # 归档到 archive/{year-month}/
python3 ./.trellis/scripts/task.py list [--mine] [--status <s>]
python3 ./.trellis/scripts/task.py list-archive

# Code-spec 上下文（通过 JSONL 注入到 implement/check sub-agent）
# implement.jsonl / check.jsonl 在 task create 时为 sub-agent-capable 平台预填了
# seed 行；AI 在 Phase 1.3 把真正的 spec + research 条目填进来
python3 ./.trellis/scripts/task.py add-context <name> <action> <file> <reason>
python3 ./.trellis/scripts/task.py list-context <name> [action]
python3 ./.trellis/scripts/task.py validate <name>

# 任务元信息
python3 ./.trellis/scripts/task.py set-branch <name> <branch>
python3 ./.trellis/scripts/task.py set-base-branch <name> <branch>    # PR 目标分支
python3 ./.trellis/scripts/task.py set-scope <name> <scope>

# 父子关系
python3 ./.trellis/scripts/task.py add-subtask <parent> <child>
python3 ./.trellis/scripts/task.py remove-subtask <parent> <child>

# PR 创建
python3 ./.trellis/scripts/task.py create-pr [name] [--dry-run]
```

> 跑 `python3 ./.trellis/scripts/task.py --help` 看权威的最新命令清单。

**当前任务机制**：`task.py start` 把任务路径写进 `.trellis/.runtime/sessions/` 下 session/window-scoped 的 runtime state，由 active-task resolver 统一管理。如果 hook input、`TRELLIS_CONTEXT_ID`、平台原生 session 环境变量三者都拿不到 context key，就没有当前任务，`task.py start` 会失败并提示 session identity。`task.py finish` 删掉当前 session 文件。`task.py archive <task>` 也会清掉所有指向被归档任务的 runtime session 文件。

### 工作区系统 (Workspace System)

记录每次 AI session，便于跨 session 跟踪，存放于 `.trellis/workspace/<developer>/`。

- `journal-N.md` —— session 日志。**每个文件最多 2000 行**；超出会自动新建 `journal-(N+1).md`
- `index.md` —— 个人索引（总 session 数、最近活跃时间）

```bash
python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash" --summary "Summary"
```

### 上下文脚本 (Context Script)

```bash
python3 ./.trellis/scripts/get_context.py                            # 完整 session runtime
python3 ./.trellis/scripts/get_context.py --mode packages            # 可用 packages + spec layers
python3 ./.trellis/scripts/get_context.py --mode phase --step <X.Y>  # 工作流某步骤的详细指引
```

---

<!--
  WORKFLOW-STATE BREADCRUMB CONTRACT (读到这里的开发者必看)

  本文件下方 ## Phase Index 段里嵌了 4 个 [workflow-state:STATUS] block，
  紧跟各对应 phase 摘要之后。这些 block 是 per-turn `<workflow-state>`
  breadcrumb 的唯一内容来源 (v0.5.0-beta.20+ 收敛架构后)。
  inject-workflow-state.py / .js 只解析它们，不再嵌入任何 fallback 文本。

  STATUS 字符集 [A-Za-z0-9_-]+。Hook 找不到对应 tag 时退化到通用兜底
  "Refer to workflow.md for current step." —— 这是 BY DESIGN：损坏的
  workflow.md 是用户应该看到的 bug，不该被默默掩盖。

  INVARIANT (test/regression.test.ts 跑这个):
    走读正文里每个 `[required · once]` 步骤，必须在它所属阶段的 breadcrumb
    tag 里有对应强制指令。breadcrumb 是 per-turn 唯一持续提醒 AI 的通道；
    tag 缺指令 = AI 静悄悄跳。

  TAG 位置:
    全部 4 个 [workflow-state:STATUS] block 都在下方 ## Phase Index 段内，
    紧跟各对应 phase 摘要列表之后 (而不是散落在详细走读里)。这样:
      - Phase Index 既是步骤地图，也是 per-turn 提示词总览
      - 编辑 phase 摘要时，对应 tag 就在视野内，drift 防御自然
      - 详细走读不被 tag 切断

  TAG ↔ PHASE 作用域:
    [workflow-state:no_task]      → 无活跃任务时；触发于 Phase 1 之前
    [workflow-state:planning]     → Phase 1 全程 (status='planning')
    [workflow-state:in_progress]  → Phase 2 + Phase 3.1-3.4 (因为 task.py
                                    start → archive 期间 status 都是
                                    in_progress；archive 才翻 completed)
    [workflow-state:completed]    → 当前 DEAD，archive 同调用搬走 dir 后
                                    resolver 丢失指针，永远不触发 (见标记下方
                                    说明)

  改任何 [workflow-state:STATUS] block 时:
    - 同步检查走读正文里对应阶段的 [required · once] 步骤是否都有强化
    - 改完跑 trellis update 让用户项目拿到新内容
    - 完整运行时合约见 .trellis/spec/cli/backend/workflow-state-contract.md
-->

## Phase Index

```
Phase 1: Plan    → 想清楚要做什么（brainstorm + research → prd.md）
Phase 2: Execute → 写代码并通过质量检查
Phase 3: Finish  → 沉淀经验、收尾
```

<!-- Per-turn breadcrumb: 无活跃任务时 (Phase 1 之前) AI 每 turn 看到的提示 -->

[workflow-state:no_task]
无活跃任务。**A 直接答** —— 纯问答 / 解释 / 查询 / 闲聊；不写文件 + 一句话答清 + 仓库读 ≤ 2 文件 → AI 自判，无需 override。
**B 建任务** —— 任何实施 / 改动 / 构建 / 重构 工作。入口顺序：(1) `python3 ./.trellis/scripts/task.py create "<title>"` 建任务（status=planning，切到 [workflow-state:planning] 拿 brainstorm + jsonl 阶段指引）→ (2) 激活 `trellis-brainstorm` skill 跟用户讨论需求并迭代完善 prd.md → (3) prd 完成 + jsonl 整理好后跑 `task.py start <task-dir>` 进 [workflow-state:in_progress] 拿实施骨架。调研密集型派 `trellis-research` sub-agent，主 agent 禁 3+ inline WebFetch / WebSearch / `gh api`。**看上去"小"不是降级到 A 或 C 的理由**。
**C inline 改**（仅本轮，B 的 escape hatch）—— 当前消息**必须显式包含** "跳过 trellis" / "别走流程" / "小修一下" / "直接改" / "先别建任务" / "skip trellis" / "no task" / "just do it" / "don't create a task" 之一 → 简短确认（如 "好，本轮跳过 trellis 流程"）后 inline。**没看到这些短语不得自行 inline**；禁编造用户没说过的 override。
[/workflow-state:no_task]

### Phase 1: Plan
- 1.0 Create task `[required · once]`（只跑 `task.py create`，status 进入 planning）
- 1.1 Requirement exploration `[required · repeatable]`
- 1.2 Research `[optional · repeatable]`
- 1.3 Configure context `[required · once]` —— Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi
- 1.4 Activate task `[required · once]`（跑 `task.py start`，status → in_progress）
- 1.5 Completion criteria

<!-- Per-turn breadcrumb: Phase 1 全程 (status='planning') AI 每 turn 看到的提示 -->

[workflow-state:planning]
激活 `trellis-brainstorm` skill，跟用户讨论需求并迭代完善 prd.md。
Phase 1.3（required, once）：`task.py start` 之前，必须整理 `implement.jsonl` 和 `check.jsonl` —— 列出 sub-agent 需要的 spec / research 文件，让它们注入正确的上下文。仅当 jsonl 已有 agent-curated 条目时可跳过（只有 seed `_example` 行不算数）。
随后跑 `task.py start <task-dir>` 把 status 翻到 in_progress。
调研产出**必须**落到 `{task_dir}/research/*.md`，由 `trellis-research` sub-agent 写。主 agent 尽量不 inline WebFetch / WebSearch —— PRD 只链接 research 文件。
[/workflow-state:planning]

### Phase 2: Execute
- 2.1 Implement `[required · repeatable]`
- 2.2 Quality check `[required · repeatable]`
- 2.3 Rollback `[on demand]`

<!-- Per-turn breadcrumb: status='in_progress' 期间 AI 每 turn 看到的提示。
     作用域: Phase 2 全程 + Phase 3.1-3.4 (任务 task.py start 后到 archive 之前
     status 都是 in_progress；archive 才翻 completed)。所以这个 tag 必须涵盖
     从实施到提交的全部强制步骤，包括 Phase 3.4 commit 和 Phase 3.3 spec update。 -->

[workflow-state:in_progress]
**Flow**：trellis-implement → trellis-check → trellis-update-spec → commit（Phase 3.4）→ `/trellis:finish-work`。
**默认（无 override 时）**：派 `trellis-implement` / `trellis-check` sub-agent，主 agent**默认不直接写代码**。Phase 3.4 commit（required, once）：trellis-update-spec 后或实施可验证完成时，主 agent**主导 commit** —— 先陈述 commit 计划再跑 `git commit`，然后再引导用户执行 `/trellis:finish-work`。
**Override inline**（仅本轮，绕过 sub-agent 派发的 escape hatch）：当前消息**必须显式包含** "你直接改" / "别派 sub-agent" / "main session 写就行" / "do it inline" / "不用 sub-agent" 之一。**没看到这些短语不得自行 inline**；禁编造用户没说过的 override。
[/workflow-state:in_progress]

### Phase 3: Finish
- 3.1 Quality verification `[required · repeatable]`
- 3.2 Debug retrospective `[on demand]`
- 3.3 Spec update `[required · once]`
- 3.4 Commit changes `[required · once]`
- 3.5 Wrap-up reminder

<!-- Per-turn breadcrumb: status='completed' 期间 AI 看到的提示。
     当前实际不可达 (DEAD)：cmd_archive 在写入 status="completed" 的同一调用
     里把 task dir 移到 archive/，active-task resolver 立刻丢失指针，hook 在
     archived 任务上不再触发。保留这个 block 是为将来 status transition 重设计
     (例如引入 in_progress → completed 的显式过渡命令)。改动请同步走 spec 流程。 -->

[workflow-state:completed]
代码已通过 Phase 3.4 提交；跑 `/trellis:finish-work` 收尾（归档任务 + 记录 session）。
如果到这步还有未提交的代码，先回 Phase 3.4 —— `/finish-work` 拒绝在脏工作树下运行。
`task.py archive` 会清掉所有指向被归档任务的 runtime session 文件。
[/workflow-state:completed]

### Rules

1. 先确认自己在哪个 Phase，然后从这个 Phase 的下一个步骤继续
2. 同一 Phase 内按顺序执行；`[required]` 步骤不能跳
3. Phase 之间可以回退（例如 Execute 发现 prd 问题 → 回 Plan 修 → 再回到 Execute）
4. `[once]` 标记的步骤如果 output 已存在就跳过；不要重复执行

### Skill Routing

当用户请求匹配以下 intent 时，先加载对应 skill（或派对应 sub-agent）—— 不要跳过 skill。

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

| User intent | Route |
|---|---|
| Wants a new feature / requirement unclear | `trellis-brainstorm` |
| About to write code / start implementing | Dispatch the `trellis-implement` sub-agent per Phase 2.1 |
| Finished writing / want to verify | Dispatch the `trellis-check` sub-agent per Phase 2.2 |
| Stuck / fixed same bug several times | `trellis-break-loop` |
| Spec needs update | `trellis-update-spec` |

**为什么 `trellis-before-dev` 不在表里**：你不是写代码的人 —— `trellis-implement` sub-agent 才是。Sub-agent 平台通过 `implement.jsonl` 注入 / prelude 拿到 spec context，主 agent不需要加载 `trellis-before-dev`。

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[Kilo, Antigravity, Windsurf]

| User intent | Skill |
|---|---|
| Wants a new feature / requirement unclear | `trellis-brainstorm` |
| About to write code / start implementing | `trellis-before-dev`（之后在主 agent直接实施） |
| Finished writing / want to verify | `trellis-check` |
| Stuck / fixed same bug several times | `trellis-break-loop` |
| Spec needs update | `trellis-update-spec` |

[/Kilo, Antigravity, Windsurf]

### DO NOT skip skills

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

| 你脑子里在想 | 为什么不对 |
|---|---|
| "这事简单，主 agent直接写完了" | 派 `trellis-implement` 是低成本路径；偷懒不派会导致你在主 agent写代码、丢失 spec context —— sub-agent 有 `implement.jsonl` 注入，你没有 |
| "我在 plan mode 里已经想清楚了" | Plan-mode 的输出在内存里 —— sub-agent 看不到；必须落到 prd.md |
| "我已经知道 spec 了" | Spec 可能在你上次读之后被更新了；sub-agent 拿到的是最新版，你不一定 |
| "先写代码，后面再 check" | `trellis-check` 能发现你自己看不出来的问题；越早越省 |

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[Kilo, Antigravity, Windsurf]

| 你脑子里在想 | 为什么不对 |
|---|---|
| "这事简单，直接写" | 简单任务经常会膨胀；`trellis-before-dev` 一分钟内就能加载好你需要的 spec context |
| "我在 plan mode 里已经想清楚了" | Plan-mode 输出在内存里 —— 在写代码之前必须落到 prd.md |
| "我已经知道 spec 了" | Spec 可能在你上次读之后被更新；再读一次 |
| "先写代码，后面再 check" | `trellis-check` 能发现你自己看不出来的问题；越早越省 |

[/Kilo, Antigravity, Windsurf]

### Loading Step Detail

每一步执行前跑这个拿详细指引：

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step <step>
# 例：python3 ./.trellis/scripts/get_context.py --mode phase --step 1.1
```

---

## Phase 1: Plan

目标：弄清楚要构建什么，产出清晰的需求文档和实施所需的上下文。

#### 1.0 Create task `[required · once]`

创建任务目录（status 进入 `planning`，session active task pointer 自动指向新任务）：

```bash
python3 ./.trellis/scripts/task.py create "<task title>" --slug <name>
```

`--slug` 只是给人读的名字。**不要**带 `MM-DD-` 日期前缀；`task.py create` 会自动加。

执行成功后 per-turn breadcrumb 自动切到 `[workflow-state:planning]`，告知 AI 进入 brainstorm + jsonl curation 阶段。

⚠️ **此步骤只跑 `create`，不要顺手跑 `start`**。`start` 会把 status 翻到 `in_progress`，breadcrumb 提前切到实施阶段，brainstorm + jsonl 还没做就被跳过。`start` 留到 1.4 在 jsonl 整理完之后再跑。

跳过条件：`python3 ./.trellis/scripts/task.py current --source` 已经指向一个任务。

#### 1.1 Requirement exploration `[required · repeatable]`

加载 `trellis-brainstorm` skill，按 skill 的指引跟用户交互式探索需求。

Brainstorm skill 会引导你：
- 一次只问一个问题
- 优先调研，少问用户
- 优先给选项，少给开放式问题
- 每次用户回答后立刻更新 `prd.md`

需求变化时随时回到这一步修改 `prd.md`。

#### 1.2 Research `[optional · repeatable]`

需求探索的任何阶段都可以 research。不限于本地代码 —— 你可以用任何工具（MCP server、skill、网络搜索等）查外部信息：第三方库文档、行业实践、API 参考等。

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

派 research sub-agent：

- **Agent type**: `trellis-research`
- **Task description**: Research <specific question>
- **Key requirement**: Research output **必须**持久化到 `{TASK_DIR}/research/`

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[Kilo, Antigravity, Windsurf]

直接在主 agent调研，把发现写进 `{TASK_DIR}/research/`。

[/Kilo, Antigravity, Windsurf]

**Research 产出约定**：
- 一个 topic 一个文件（例：`research/auth-library-comparison.md`）
- 把第三方库使用示例、API 参考、版本约束写进文件
- 标注你发现的 spec 文件路径，以便后续引用

Brainstorm 和 research 可以自由穿插 —— 暂停下来调研一个技术问题，然后回来继续跟用户对话。

**关键原则**：Research 产出必须写到文件里，不能只留在对话中。对话会被压缩，文件不会。

#### 1.3 Configure context `[required · once]`

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

整理 `implement.jsonl` 和 `check.jsonl`，让 Phase 2 的 sub-agent 拿到正确的 spec context。这两个文件在 `task create` 时已经预填了一个自描述的 `_example` 行；你的工作是把真实条目填进去。

**位置**：`{TASK_DIR}/implement.jsonl` 和 `{TASK_DIR}/check.jsonl`（已存在）。

**格式**：每行一个 JSON 对象 —— `{"file": "<path>", "reason": "<why>"}`。路径相对仓库根。

**写什么**：
- **Spec 文件** —— `.trellis/spec/<package>/<layer>/index.md` 以及任务相关的具体规范文件（`error-handling.md`、`conventions.md` 等）
- **Research 文件** —— sub-agent 需要查阅的 `{TASK_DIR}/research/*.md`

**不要写什么**：
- 代码文件（`src/**`、`packages/**/*.ts` 等）—— sub-agent 在实施期间会自己读，不在这里预注册
- 你即将修改的文件 —— 同理

**两个文件的分工**：
- `implement.jsonl` → implement sub-agent 写代码所需的 spec + research
- `check.jsonl` → check sub-agent 所需的 spec（quality guidelines、check conventions、必要时同样的 research）

**怎么发现相关 spec**：

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
```

列出每个 package 及其 spec layer 的路径。挑跟本任务领域匹配的条目。

**怎么追加条目**：

直接编辑 jsonl 文件，或用：

```bash
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" implement "<path>" "<reason>"
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" check "<path>" "<reason>"
```

有真实条目后可以删掉 seed `_example` 行（可选 —— 消费者会自动跳过）。

跳过条件：`implement.jsonl` 已有 agent-curated 条目（仅 seed 行不算）。

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[Kilo, Antigravity, Windsurf]

跳过此步骤。Context 在 Phase 2 由 `trellis-before-dev` skill 直接加载。

[/Kilo, Antigravity, Windsurf]

#### 1.4 Activate task `[required · once]`

prd.md 完成 + 1.3 jsonl 整理完之后，把任务 status 翻到 `in_progress`：

```bash
python3 ./.trellis/scripts/task.py start <task-dir>
```

执行成功后 breadcrumb 自动切到 `[workflow-state:in_progress]`，后续按 Phase 2 / 3 流程走。

如果 `task.py start` 报 session identity 错误（hook input、`TRELLIS_CONTEXT_ID`、平台原生 session 环境变量都拿不到 context key），按报错提示设置 session 标识后重试。

#### 1.5 Completion criteria

| 条件 | 必需 |
|------|:---:|
| `prd.md` 存在 | ✅ |
| 用户确认需求 | ✅ |
| `task.py start` 已执行（status = in_progress） | ✅ |
| `research/` 有产出（复杂任务） | 推荐 |
| `info.md` 技术设计（复杂任务） | 可选 |

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

| `implement.jsonl` 有 agent-curated 条目（不只是 seed 行） | ✅ |

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

---

## Phase 2: Execute

目标：把 prd 变成通过质量检查的代码。

#### 2.1 Implement `[required · repeatable]`

[Claude Code, Cursor, OpenCode, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

派 implement sub-agent：

- **Agent type**: `trellis-implement`
- **Task description**: 按 prd.md 实施需求，参考 `{TASK_DIR}/research/` 下的材料；最后跑项目 lint 和 type-check

平台 hook/plugin 自动处理：
- 读 `implement.jsonl`，把引用的 spec 文件注入到 agent prompt
- 注入 prd.md 内容

[/Claude Code, Cursor, OpenCode, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[Codex]

派 implement sub-agent：

- **Agent type**: `trellis-implement`
- **Task description**: 按 prd.md 实施需求，参考 `{TASK_DIR}/research/` 下的材料；最后跑项目 lint 和 type-check

Codex sub-agent 定义自动处理 context 加载要求：
- 用 `task.py current --source` 解析活动任务，然后读 `prd.md` 和 `info.md`（如有）
- 读 `implement.jsonl`，要求 agent 在写代码前加载所有引用的 spec 文件

[/Codex]

[Kiro]

派 implement sub-agent：

- **Agent type**: `trellis-implement`
- **Task description**: 按 prd.md 实施需求，参考 `{TASK_DIR}/research/` 下的材料；最后跑项目 lint 和 type-check

平台 prelude 自动处理 context 加载要求：
- 读 `implement.jsonl`，把引用的 spec 文件注入到 agent prompt
- 注入 prd.md 内容

[/Kiro]

[Kilo, Antigravity, Windsurf]

1. 加载 `trellis-before-dev` skill 读项目规范
2. 读 `{TASK_DIR}/prd.md` 拿需求
3. 参考 `{TASK_DIR}/research/` 下的材料
4. 按需求实施代码
5. 跑项目 lint 和 type-check

[/Kilo, Antigravity, Windsurf]

#### 2.2 Quality check `[required · repeatable]`

[Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

派 check sub-agent：

- **Agent type**: `trellis-check`
- **Task description**: 对照 spec 和 prd 复核所有代码改动；直接修发现的问题；确保 lint 和 type-check 通过

Check agent 的工作：
- 对照 spec 复核改动
- 自动修发现的问题
- 跑 lint 和 typecheck 验证

[/Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[Kilo, Antigravity, Windsurf]

加载 `trellis-check` skill，按它的指引复核代码：
- Spec 合规
- lint / type-check / tests
- 跨层一致性（改动跨层时）

发现问题 → 修 → 重新 check，直到全过。

[/Kilo, Antigravity, Windsurf]

#### 2.3 Rollback `[on demand]`

- `check` 暴露 prd 缺陷 → 回 Phase 1 修 `prd.md`，再重做 2.1
- 实施方向错了 → 回滚代码，重做 2.1
- 需要更多调研 → research（同 Phase 1.2），写到 `research/`

---

## Phase 3: Finish

目标：保证代码质量，沉淀经验，记录工作。

#### 3.1 Quality verification `[required · repeatable]`

加载 `trellis-check` skill 做最终验证：
- Spec 合规
- lint / type-check / tests
- 跨层一致性（改动跨层时）

发现问题 → 修 → 重新 check，直到全过。

#### 3.2 Debug retrospective `[on demand]`

如果本任务涉及反复调试（同一问题被修过多次），加载 `trellis-break-loop` skill：
- 分类根因
- 解释之前的修复为什么没成功
- 提出预防方案

目的是把调试经验沉淀下来，避免同类问题再发生。

#### 3.3 Spec update `[required · once]`

加载 `trellis-update-spec` skill，复盘本任务有没有产生值得记录的新知识：
- 新发现的模式或约定
- 踩到的坑
- 新的技术决策

相应更新 `.trellis/spec/` 下的文档。即便结论是"没有需要更新的"，也要走一遍判断过程。

#### 3.4 Commit changes `[required · once]`

AI 主导对本任务的代码改动做批量 commit，这样之后的 `/finish-work` 才能干净跑。目标：先产出 work commit，**之后**才是 bookkeeping commit（archive + journal），永远不交错。

**步骤**：

1. **检查 dirty 状态**：
   ```bash
   git status --porcelain
   ```
   把所有 dirty 路径快照。如果工作树干净，直接跳到 3.5。

2. **学习 commit 风格**（让起草的消息融入历史）：
   ```bash
   git log --oneline -5
   ```
   注意 prefix 约定（`feat:` / `fix:` / `chore:` / `docs:` ...）、语言（中文/English）、长度风格。

3. **把 dirty 文件分两组**：
   - **本会话 AI 编辑** —— 你这个会话通过 Edit/Write/Bash 工具修改/写过的文件。你知道改了什么、为什么
   - **未识别** —— 不是你这会话改的 dirty 文件（可能是用户手改、之前 session 留下的 WIP，或不相关工作）。**不要默默纳入**

4. **起草 commit 计划**。把 AI-edited 文件分成逻辑 commit（一次 commit 一个完整变更，不是一个文件一个 commit）。每条：`<commit message>` + 文件列表。未识别文件单独列底部。

5. **一次性提出计划，等用户确认**。格式：
   ```
   Proposed commits (in order):
     1. <message>
        - <file>
        - <file>
     2. <message>
        - <file>

   Unrecognized dirty files (NOT in any commit — confirm include/exclude):
     - <file>
     - <file>

   Reply 'ok' / '行' to execute. Reply with edits, or '我自己来' / 'manual' to abort.
   ```

6. **得到确认**：按顺序对每批跑 `git add <files>` + `git commit -m "<msg>"`。**不**用 `--amend`。**不**用 push。

7. **被拒绝**（用户回 "不行" / "我自己来" / "manual" / 任何 pushback）：停。**不**尝试第二个计划。用户会手动 commit；等他们确认后跳到 3.5。

**规则**：
- 全程禁用 `git commit --amend` —— 三阶段三 commit 流（work commit → archive commit → journal commit）
- 禁止在这一步推到远端
- 用户改 message 措辞但接受文件分组：改 message 再确认一次；如果拒绝分组就退到手动模式
- 批量计划是一次性 prompt，不要每个 commit 都 prompt 一次

#### 3.5 Wrap-up reminder

完成上述步骤后，提醒用户可以跑 `/finish-work` 收尾（归档任务、记录 session）。

---

## Customizing Trellis (for forks)

想改 Trellis 工作流的开发者看这里。所有自定义都通过编辑本文件完成；脚本只负责解析。

### 改步骤含义

直接编辑上面对应 Phase 段里的步骤走读。**关键约束**：如果改了某步的 `[required · once]` 标记或加了新的 `[required · once]` 步骤，必须**同步**到对应阶段的 `[workflow-state:STATUS]` tag 里加强制指令——否则 per-turn breadcrumb 漏掉强化通道，AI 会静悄悄跳过这步。回归测试断言这点。

所有 4 个 tag 都集中在 `## Phase Index` 段内，紧跟对应 phase 摘要：

| 作用域 | 对应 tag |
|---|---|
| 无活跃任务（Phase 1 之前） | `[workflow-state:no_task]`（Phase Index ASCII 之后） |
| Phase 1 全程（任务创建到准备就绪） | `[workflow-state:planning]`（Phase 1 摘要之后） |
| Phase 2 + Phase 3.1–3.4（实施+检查+收尾） | `[workflow-state:in_progress]`（Phase 2 摘要之后） |
| Phase 3.5 之后（archive 时刻） | `[workflow-state:completed]`（Phase 3 摘要之后，**当前 DEAD**） |

### 改 per-turn 提示词

直接编辑对应 `[workflow-state:STATUS]` block 内容。改完跑 `trellis update`（如果是模板维护者）或重启 AI session（如果是用户项目自定义）即可生效，无需碰任何脚本。

### 添加自定义 status

新建：

```
[workflow-state:my-status]
你的 per-turn 提示文本
[/workflow-state:my-status]
```

约束：
- STATUS 字符集 `[A-Za-z0-9_-]+`（允许下划线和连字符，例如 `in-review`、`blocked-by-team`）
- 必须有 lifecycle hook 把 `task.json.status` 写成对应值，否则 tag 永远不被读到
- Lifecycle hook 写在 `task.json.hooks.after_*` 字段，挂 `after_create / after_start / after_finish / after_archive` 四个事件之一

### 添加 lifecycle hook

`task.json` 顶层加 `hooks` 字段：

```json
{
  "hooks": {
    "after_finish": [
      "your-script-or-command-here"
    ]
  }
}
```

支持的事件：`after_create / after_start / after_finish / after_archive`。注意 `after_finish` ≠ status 变更（它只清 active-task 指针）；任务"完成"通知挂 `after_archive`。

### 完整合约

工作流状态机的执行合约、所有 status writer 的代码位置、伪 status（`no_task` / `stale_<source_type>`）、hook 可达性矩阵等深层细节见：

- `.trellis/spec/cli/backend/workflow-state-contract.md` —— 运行时合约 + writer 表 + 测试 invariant
- `.trellis/scripts/inject-workflow-state.py` —— 实际解析逻辑（只读 workflow.md，不嵌入文本）
