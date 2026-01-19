# Trellis

> AI 的能力像藤蔓一样生长——充满活力但四处蔓延。Trellis 提供结构，引导它沿着规范的路径前进。

## 解决什么问题

### 1. AI 缺乏项目背景

AI 不知道这个项目是什么，不知道这个项目的特化的代码规范、架构约束以及之前的开发决策。每次开始都要重复解释"这个项目是什么，大概用的什么技术栈,我们下一步要干什么东西..."，上一个会话踩过的坑下一个会话还会再踩。

**Trellis 的方案**：
- 开发规范持久存储在 `.trellis/structure/` 目录下面，项目内的开发者可以共同使用，维护，只要一个 developer 写了一份高质量的开发规范，整个团队的代码质量都会跟着提高
- 会话记录存在 `.trellis/agent-traces/`，新会话可以快速回顾你前几次在干什么活，大概改动了哪些代码，可以对项目情况有更好的了解，也省去你给它重复讲述 "这个项目是什么" 这种话

### 2. 开发规范写了但不遵守

`.cursorrules`、`CLAUDE.md`、`AGENTS.md` 篇幅有限，AI 在对话中段容易忘记。规范和代码分离，更新时容易不同步。并且一个 all in one 的文件会让 ai 每次读取的时候获取到可能跟对应开发需求不相关，没必要的上下文，平白占用上下文窗口空间，而且一个 all in one 的几千行的文件也不方便去更新维护。

**Trellis 的方案**：规范可以按需加载，注入到对应 Agent 的上下文窗口，让每个专门的 agent 只获取自己需要的项目特定领域知识，规范。

### 3. 工作流程靠人盯着

需要人一步步指挥 AI：先读规范、再实现、再检查、再提交。

**Trellis 的方案**：用 Slash Command 封装完整工作流。用户只需输入 `/start` 或 `/parallel`，背后的任务分发、脚本调用、Hook 拦截等机制对用户不可见，AI 会自动按预定义的流程执行。

### 4. 多 Agent 并行的门槛高

一些工具支持多 Agent 并行开发，但学习成本高、配置复杂，而且多个 Agent 同时工作容易互相冲突。

**Trellis 的方案**：用 `/parallel` 一键启动，底层用 Git Worktree 做物理隔离，每个 Agent 在独立目录中工作，互不干扰。

---

## Quick Start

### 1. 安装

```bash
npm install -g @mindfoldhq/trellis@latest
```

### 2. 初始化项目

```bash
cd your-project
trellis init -u your-name
```

### 3. 配置 worktree.yaml（如需使用 `/parallel`）

编辑 `.trellis/worktree.yaml`，根据项目情况配置：
- `worktree_dir`：Worktree 存储目录（相对于项目根目录，如 `../trellis-worktrees`）
- `copy`：需要复制到 Worktree 的环境变量文件（如 `.env`、`.trellis/.developer`）
- `post_create`：Worktree 创建后运行的初始化命令（如 `pnpm install --frozen-lockfile`）
- `verify`：Check Agent 结束前必须通过的验证命令（如 `pnpm lint`、`pnpm typecheck`）

### 4. 开始使用

#### Claude Code 工作流

**简单任务**：
```
/start → 说需求 → /record-agent-flow
```

**复杂功能**（多 Agent 流水线）：
```
/parallel → 说需求 → /record-agent-flow
```

#### Cursor 工作流

```
/start → 说需求 → /before-frontend-dev 或 /before-backend-dev → 实现 → /check-frontend 或 /check-backend → /finish-work → /record-agent-flow
```

---

### 5. 后台流程详解（Claude Code）

**`/start` 简单任务**：
1. AI 执行 `get-context.sh` 获取当前开发者、分支、最近提交等状态
2. AI 读取 `.trellis/workflow.md` 和 `.trellis/structure/` 下的项目规范
3. AI 直接在当前分支实现功能

**`/start` 复杂任务**：
1. AI 创建 feature 目录，调用 **Research Agent** 分析代码库，找出本需求相关的代码规范文件
2. AI 将规范文件路径记录进对应的 feature 目录，并创建 `prd.md` 需求文档
3. AI 调用 **Implement Agent** 按规范实现功能（上一步记录的代码规范文件内容会被 Hook 自动注入进 Implement Agent 的上下文）
4. AI 调用 **Check Agent** 检查代码、自动修复问题

**`/parallel` 多 Agent 流水线**（两种模式）：

**模式 A：Plan Agent 自动规划**（推荐用于需求不明确的复杂功能）
1. `plan.sh` 脚本在后台启动 **Plan Agent**
2. Plan Agent 评估需求有效性（如果需求不够清晰明确会拒绝并给出原因），调用 **Research Agent** 分析代码库，找出本需求相关的代码规范文件
3. Plan Agent 将规范文件路径记录进对应的 feature 目录，并创建 `prd.md` 需求文档

**模式 B：手动配置**（用于需求已明确的简单功能）
1. AI 创建 feature 目录，调用 **Research Agent** 分析代码库，找出本需求相关的代码规范文件
2. AI 将规范文件路径记录进对应的 feature 目录，并创建 `prd.md` 需求文档

**两种模式共同的后续流程**：
1. `start.sh` 创建独立 Git Worktree，根据 `worktree.yaml` 的 `copy` 字段复制环境变量文件、`post_create` 字段运行项目的初始化命令，并在 Worktree 中启动 **Dispatch Agent**
2. Dispatch Agent 读取 `.trellis/.current-feature` 定位 feature 目录，读取 `feature.json` 的 `next_action` 数组，按阶段顺序调用子 Agent
3. **Implement Agent**：Hook（`inject-subagent-context.py`）在 Task 调用前自动注入 `implement.jsonl` 中的代码规范文件和 `prd.md`、`info.md`，然后 AI 会按规范实现功能
4. **Check Agent**：Hook 注入 `check.jsonl` 中的规范文件内容，AI 检查代码变更并自动修复；**Ralph Loop**（`ralph-loop.py`）拦截 Agent 停止请求，根据 `worktree.yaml` 的 `verify` 字段运行验证命令（如 lint、typecheck），全部通过才允许结束
5. `create-pr.sh` 提交代码（排除 agent-traces）、推送分支、用 `gh pr create` 创建 Draft PR，更新 `feature.json` 状态为 `review`

---

## 系统架构

Trellis 初始化后会在项目中创建以下目录结构：

```
your-project/
├── AGENTS.md                    # 轻量级 AI 指令（兼容 agents.md 协议）
├── .trellis/                    # 工作流和规范中心
│   ├── workflow.md              # 开发流程指南（核心文档，新会话首读）
│   ├── worktree.yaml            # 多 Agent 流水线配置
│   ├── .developer               # 开发者身份（git-ignored）
│   ├── .gitignore               # .trellis 目录的 gitignore 规则
│   ├── structure/               # 开发规范（核心知识库）
│   ├── agent-traces/            # 会话记录和 Feature 追踪
│   └── scripts/                 # 自动化脚本
├── .claude/                     # Claude Code 专用配置
│   ├── commands/                # Slash Commands（13 个）
│   ├── agents/                  # Agent 定义（6 个）
│   ├── hooks/                   # Hook 脚本（2 个）
│   └── settings.json            # Hook 触发配置
└── .cursor/                     # Cursor 专用配置
    └── commands/                # Slash Commands（12 个）
```

### 入口文件

**`AGENTS.md`**（约 18 行）：
- 遵循 agents.md 协议的轻量级指令文件
- 使用 `<!-- TRELLIS:START -->` 和 `<!-- TRELLIS:END -->` 标记保护内容（`trellis update` 时不会被覆盖）
- 快速指向 `/start` 命令和 `.trellis/workflow.md`

**`.trellis/workflow.md`**（核心文档）：
- AI Agent 新会话的**首读文档**
- 包含：Quick Start（开发者身份初始化、上下文获取）、开发流程、会话记录、最佳实践
- 基于 [Anthropic 长时间运行 Agent 最佳实践](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

**新 Agent 的阅读顺序**：
1. `.trellis/workflow.md` → 了解整体工作流和入门步骤
2. `.trellis/structure/{frontend|backend}/index.md` → 对应领域的规范入口
3. 具体的规范文件 → 根据任务类型按需阅读

---

## 一、开发规范系统（`.trellis/structure/`）

存放项目的开发规范，是团队的知识资产。AI 在实现和检查代码时会参考这些规范。

```
structure/
├── backend/                     # 后端开发规范
│   ├── index.md                 # 后端规范入口
│   ├── directory-structure.md   # 目录结构约定
│   ├── database-guidelines.md   # 数据库和 ORM 规范
│   ├── error-handling.md        # 错误处理策略
│   ├── quality-guidelines.md    # 代码质量标准
│   └── logging-guidelines.md    # 日志规范
├── frontend/                    # 前端开发规范
│   ├── index.md                 # 前端规范入口
│   ├── directory-structure.md   # 目录结构约定
│   ├── component-guidelines.md  # 组件设计规范
│   ├── hook-guidelines.md       # Hook 使用规范
│   ├── state-management.md      # 状态管理规范
│   ├── quality-guidelines.md    # 代码质量标准
│   └── type-safety.md           # 类型安全规范
└── guides/                      # 问题思考指南
    ├── index.md                 # 指南入口（含触发条件）
    ├── cross-layer-thinking-guide.md   # 跨层开发思考清单
    └── code-reuse-thinking-guide.md    # 代码复用思考清单
```

**核心理念**：
- 规范越清晰，AI 执行效果越好
- 每次发现问题（bug、遗漏、不一致）就更新规范，形成持续改进循环
- Thinking Guides 帮助发现"想不到的问题"——大多数 bug 来自思考不周全，而非技能不足

**触发时机**（何时使用哪个指南）：
- **cross-layer-thinking-guide.md**：当 Feature 涉及 3+ 层（API、Service、Component、Database）、数据格式在层间变化、多个消费者需要同一数据
- **code-reuse-thinking-guide.md**：当类似代码已存在、同一模式重复 3+ 次、需要在多处添加字段、创建新工具函数前（先搜索！）

---

## 二、会话追踪系统（`.trellis/agent-traces/`）

记录所有 AI Agent 的工作历史，支持多开发者协作。

```
agent-traces/
├── index.md                     # 活跃开发者列表
└── {developer}/                 # 每个开发者的目录
    ├── index.md                 # 个人会话索引
    ├── traces-N.md              # 会话记录（每文件最多 2000 行）
    ├── .agents/
    │   └── registry.json        # 运行中的 Agent 注册表
    └── features/                # Feature 目录
        ├── {day}-{name}/        # 活跃 Feature
        │   ├── feature.json     # Feature 元数据
        │   ├── prd.md           # 需求文档
        │   ├── info.md          # 技术设计（可选）
        │   ├── implement.jsonl  # Implement Agent 上下文配置
        │   ├── check.jsonl      # Check Agent 上下文配置
        │   └── debug.jsonl      # Debug Agent 上下文配置
        └── archive/             # 已归档 Feature
            └── {YYYY-MM}/
```

### Feature 目录详解

每个 Feature 是一个独立的工作单元，包含完整的上下文配置：

**`feature.json`** - Feature 元数据：
```json
{
  "name": "user-auth",
  "status": "planning|in_progress|review|completed|rejected",
  "dev_type": "backend|frontend|fullstack",
  "branch": "feature/user-auth",
  "base_branch": "main",
  "worktree_path": "../trellis-worktrees/feature/user-auth",
  "current_phase": 1,
  "next_action": [
    {"phase": 1, "action": "implement"},
    {"phase": 2, "action": "check"},
    {"phase": 3, "action": "finish"},
    {"phase": 4, "action": "create-pr"}
  ]
}
```

**`implement.jsonl` / `check.jsonl` / `debug.jsonl`** - 上下文配置：
```jsonl
{"file": ".trellis/structure/backend/index.md", "reason": "后端开发规范"}
{"file": "src/api/auth.ts", "reason": "现有认证模式参考"}
{"file": "src/middleware/", "type": "directory", "reason": "中间件模式参考"}
```

这些 jsonl 文件定义了每个 Agent 需要读取的规范和代码文件。Hook 会在调用 Agent 时自动注入这些文件的内容。

### 可追溯性

**jsonl 文件的追溯价值**：

每个 Feature 的 jsonl 文件记录了用了哪些规范文件、参考了哪些现有代码、每个文件被引用的原因。出问题时可以追溯：是否缺少必要的规范引用、规范本身是否不够清晰、是规范问题还是执行偏差。

**traces 文件的追溯价值**：

`traces-N.md` 记录每次会话的日期、Feature、工作摘要、主要改动、Git 提交、测试情况、下一步计划。形成完整的开发历史，新会话可以快速回顾之前的工作。

---

## 三、脚本系统（`.trellis/scripts/`）

自动化脚本，支撑整个工作流运转。

```
scripts/
├── get-context.sh               # 获取会话上下文（开发者、分支、最近提交）
├── feature.sh                   # Feature 管理（创建、归档、配置）
├── add-session.sh               # 记录会话
├── init-developer.sh            # 初始化开发者身份
├── common/                      # 公共工具库
│   ├── paths.sh                 # 路径工具
│   ├── developer.sh             # 开发者工具
│   ├── git-context.sh           # Git 上下文
│   ├── phase.sh                 # 阶段管理
│   └── worktree.sh              # Worktree 工具
└── multi-agent/                 # 多 Agent 流水线脚本
    ├── plan.sh                  # 启动 Plan Agent
    ├── start.sh                 # 创建 Worktree 并启动 Dispatch Agent
    ├── status.sh                # 查看流水线状态
    ├── create-pr.sh             # 创建 PR
    └── cleanup.sh               # 清理 Worktree
```

### 脚本系统的设计理念

**为什么用脚本封装操作？**

AI 每次执行任务时可能会"随意发挥"——用不同的命令、不同的参数、不同的顺序。这会导致：
- 工作流不一致，难以追踪和调试
- 容易遗漏关键步骤（如复制环境文件、注册 Agent）
- 重复造轮子，每次都要思考"怎么做"

**脚本的作用**：把复杂操作封装成**确定性的、可重复的**命令。AI 只需调用脚本，不需要知道内部实现细节，也不会遗漏步骤。

### 关键脚本说明

**`feature.sh`** - Feature 生命周期管理：
```bash
feature.sh create "<title>" [--slug <name>] # 创建 Feature 目录
feature.sh init-context <dir> <type>        # 初始化 jsonl 文件
feature.sh add-context <dir> <file> <path> <reason>  # 添加上下文条目
feature.sh set-branch <dir> <branch>        # 设置分支
feature.sh start <dir>                      # 设置为当前 Feature
feature.sh archive <name>                   # 归档完成的 Feature
feature.sh list                             # 列出活跃 Feature
```

**`multi-agent/plan.sh`** - 启动 Plan Agent：

```bash
./plan.sh --name <feature-name> --type <dev-type> --requirement "<requirement>"
```

**工作原理**：
1. 创建 Feature 目录（调用 `feature.sh create`）
2. 读取 `.claude/agents/plan.md`，提取 Agent prompt（跳过 frontmatter）
3. 通过**环境变量**传递参数给 Agent：
   ```bash
   export PLAN_FEATURE_NAME="user-auth"
   export PLAN_DEV_TYPE="backend"
   export PLAN_FEATURE_DIR=".trellis/agent-traces/taosu/features/19-user-auth"
   export PLAN_REQUIREMENT="Add JWT-based authentication"
   ```
4. 后台启动 Claude Code：`nohup claude -p --dangerously-skip-permissions < prompt &`
5. 日志写入 `<feature-dir>/.plan-log`

**为什么用环境变量传参？**
- Agent prompt 是静态模板，环境变量让它动态化
- Agent 可以直接读取 `$PLAN_FEATURE_DIR` 等变量，知道该操作哪个目录
- 避免在 prompt 中硬编码路径，保持模板通用

**`multi-agent/start.sh`** - 启动 Dispatch Agent：

```bash
./start.sh <feature-dir>
```

**工作原理**：
1. **验证前置条件**：feature.json 和 prd.md 必须存在（确保 Plan 阶段完成）
2. **检查 Feature 状态**：如果 `status: "rejected"`，拒绝启动并显示原因
3. **创建 Git Worktree**：
   ```bash
   git worktree add -b feature/user-auth ../trellis-worktrees/feature/user-auth
   ```
4. **复制环境文件**：读取 `worktree.yaml` 的 `copy` 字段，逐个复制
5. **复制 Feature 目录**：Feature 目录可能还没提交，需要手动复制到 Worktree
6. **运行初始化命令**：读取 `worktree.yaml` 的 `post_create` 字段，依次执行
7. **设置当前 Feature**：写入 `.trellis/.current-feature` 文件
8. **准备 Agent prompt**：从 `dispatch.md` 提取内容，写入 `.agent-prompt`
9. **后台启动 Claude Code**：
   ```bash
   nohup ./agent-runner.sh > .agent-log 2>&1 &
   ```
10. **注册到 registry.json**：记录 PID、Worktree 路径、启动时间，方便后续管理

**关键设计**：
- 脚本负责**环境准备**（Worktree、依赖、文件），Agent 只负责**执行任务**
- Agent 通过读取 `.current-feature` 文件知道当前在处理哪个 Feature
- 所有状态都持久化到文件（registry.json、feature.json），可随时查看和恢复

**`multi-agent/create-pr.sh`** - 创建 PR：
1. `git add -A`（排除 agent-traces）
2. `git commit -m "type(scope): feature-name"`
3. `git push origin <branch>`
4. `gh pr create --draft --base <base_branch>`
5. 更新 `feature.json`：`status: "review"`，`pr_url: <url>`

---

## 四、Slash Commands（`.claude/commands/` 和 `.cursor/commands/`）

用户通过 Slash Command 与 Trellis 交互。Slash Command 是**用户和系统的入口**，背后调用脚本和 Agent 完成实际工作。

### `/start` - 会话初始化

**作用**：初始化开发会话，读取项目上下文和规范。

**执行步骤**：
1. 读取 `.trellis/workflow.md` 了解工作流
2. 执行 `get-context.sh` 获取当前状态（开发者、分支、未提交文件、活跃 Feature）
3. 读取 `.trellis/structure/{frontend|backend}/index.md` 规范入口
4. 报告就绪状态，询问用户任务

**任务处理**：
- **简单任务**：直接实现 → 提醒用户运行 `/finish-work`
- **复杂任务**（Claude Code）：创建 Feature 目录 → 调用 Research Agent 分析 → 配置 jsonl → 调用 Implement/Check Agent

### `/parallel` - 多 Agent 流水线（Claude Code 专有）

**作用**：启动并行开发流水线，使用 Git Worktree 隔离工作环境。

**与 `/start` 的区别**：

| 维度 | `/start` | `/parallel` |
|------|----------|-------------|
| 执行位置 | 主仓库单进程 | 主仓库 + Worktree 多进程 |
| Git 管理 | 当前分支直接开发 | 创建独立 Worktree 和分支 |
| 适用场景 | 简单任务、快速实现 | 复杂功能、多模块、需要隔离 |

**两种模式**：
- **Plan Agent 模式**（推荐）：`plan.sh --name <name> --type <type> --requirement "<req>"` → Plan Agent 自动分析需求、配置 Feature → `start.sh` 启动 Dispatch Agent
- **手动配置模式**：手动创建 Feature 目录、配置 jsonl、写 prd.md → `start.sh` 启动 Dispatch Agent

### `/before-frontend-dev` 和 `/before-backend-dev` - 开发前规范阅读

**作用**：编码前强制阅读对应领域的开发规范。

**执行步骤**：
1. 读取 `.trellis/structure/{frontend|backend}/index.md` 规范入口
2. 根据任务类型读取具体规范文件：
   - **前端**：`component-guidelines.md`、`hook-guidelines.md`、`state-management.md`、`type-safety.md`
   - **后端**：`database-guidelines.md`、`error-handling.md`、`logging-guidelines.md`、`type-safety.md`
3. 理解编码标准后开始开发

### `/check-frontend`、`/check-backend`、`/check-cross-layer` - 代码检查

**`/check-frontend` 和 `/check-backend`**：
1. `git status` 查看修改的文件
2. 读取对应的规范文件
3. 对照规范检查代码
4. 报告违规并修复

**`/check-cross-layer`**（跨层检查）：

检查多个维度，防止"没想到"导致的 bug：

| 维度 | 触发条件 | 检查内容 |
|------|---------|---------|
| **跨层数据流** | 改动涉及 3+ 层 | 读写流向、类型传递、错误传播、加载状态 |
| **代码复用** | 修改常量/配置 | `grep` 搜索所有使用位置、是否需要抽取共享常量 |
| **新建工具函数** | 创建 utility | 先搜索是否已有类似函数 |
| **批量修改后** | 多文件相似修改 | 是否遗漏、是否应该抽象 |

### `/finish-work` - 提交前检查清单

**作用**：确保代码完整性，在 commit 前执行。

**检查项**：
1. **代码质量**：lint、type-check、test 通过，无 `console.log`、无 `!`、无 `any`
2. **文档同步**：`.trellis/structure/` 规范是否需要更新
3. **API 变更**：Schema、文档、客户端代码是否同步
4. **数据库变更**：Migration、Schema、查询是否更新
5. **跨层验证**：数据流、错误处理、类型一致性
6. **手动测试**：功能、边界情况、错误状态、刷新后

### `/record-agent-flow` - 记录会话进度

**前提**：用户已测试并提交代码（AI 不执行 `git commit`）

**执行步骤**：
1. 执行 `get-context.sh` 获取当前上下文
2. 执行 `add-session.sh --title "..." --commit "hash"` 记录会话：
   - 追加到 `traces-N.md`（超过 2000 行自动创建新文件）
   - 更新 `index.md`（会话数、最后活跃时间、历史表）
3. 如果 Feature 完成，执行 `feature.sh archive <name>` 归档

### 其他命令

| 命令 | 用途 |
|------|------|
| `/break-loop` | 深度 bug 分析，跳出修复循环 |
| `/create-command` | 创建新的 Slash Command |
| `/integrate-skill` | 提取 claude code skill 集成到项目规范 |
| `/onboard-developer` | 给开发者的 landing 引导 |

---

## 五、Agent 系统（`.claude/agents/`）

定义 6 个专门的 Agent，各司其职：

| Agent | 职责 |
|-------|------|
| **Plan** | 评估需求有效性、配置 Feature 目录 |
| **Research** | 搜索代码和文档，纯研究不修改 |
| **Dispatch** | 纯调度器，按阶段调用子 Agent |
| **Implement** | 按规范实现功能，禁止 git commit |
| **Check** | 检查代码并自行修复，受 Ralph Loop 控制 |
| **Debug** | 深度分析和修复问题 |

### Agent 详细说明

**Plan Agent**（`.claude/agents/plan.md`）：
- 可以**拒绝**不清晰、不完整、超出范围的需求
- 调用 Research Agent 分析代码库
- 输出：完整配置的 Feature 目录（feature.json、prd.md、*.jsonl）

**Research Agent**（`.claude/agents/research.md`）：
- 使用 Haiku 模型（轻量、快速）
- **严格边界**：只能描述"是什么、在哪里、怎么工作"，禁止建议、批评、修改

**Dispatch Agent**（`.claude/agents/dispatch.md`）：
- **纯调度器**：只负责调用子 Agent，不读取规范（Hook 自动注入）
- 读取 `.trellis/.current-feature` 定位 Feature 目录
- 读取 `feature.json` 的 `next_action` 数组，按顺序执行阶段

**Implement Agent**（`.claude/agents/implement.md`）：
- 读取 Hook 注入的规范和需求
- 实现功能并运行 lint/typecheck
- **禁止**：`git commit`、`git push`、`git merge`

**Check Agent**（`.claude/agents/check.md`）：
- `git diff` 获取代码变更
- 对照规范检查代码
- **自行修复**问题，不仅仅报告
- 受 Ralph Loop 控制：必须输出完成标记才能结束

**Debug Agent**（`.claude/agents/debug.md`）：
- 不是默认流程，仅在 Check Agent 无法修复时调用
- 按优先级分类问题：`[P1]` 必须修复、`[P2]` 应该修复、`[P3]` 可选修复

---

## 六、自动化机制

Trellis 通过 Hook 和配置文件实现工作流自动化，让 AI 按照预定流程执行，减少随意性。

### 上下文分阶段注入

**为什么要分阶段注入？**

上下文过多会导致 AI 分心（无关信息干扰）、混淆（规范相互矛盾）、冲突（不同阶段指令覆盖）——这被称为**上下文腐烂（Context Rot）**。

**分阶段注入策略**：
```
Plan/Research Agent 提前分析需求
         ↓
将相关文件路径写入 implement.jsonl、check.jsonl
         ↓
Hook 在调用每个 Agent 时，只注入该阶段需要的文件
         ↓
每个 Agent 收到精准的上下文，专注当前任务
```

| 阶段 | 注入内容 | 排除内容 |
|------|---------|---------|
| Implement | 需求 + 实现相关的规范和代码 | 检查规范 |
| Check | 检查规范 + 代码质量标准 | 实现细节 |
| Finish | 提交检查清单 + 需求（验证是否满足） | 完整的检查规范 |

### Hook 实现（`.claude/hooks/`）

两个 Python 脚本实现上述自动化：

**1. `inject-subagent-context.py`（上下文注入）**

**触发时机**：PreToolUse - 在 Task 工具调用前

**工作原理**：
```
Dispatch 调用 Task(subagent_type="implement", ...)
                    ↓
            Hook 触发（PreToolUse）
                    ↓
     读取 .trellis/.current-feature 定位 Feature 目录
                    ↓
     根据 subagent_type 读取对应的 jsonl 文件
                    ↓
     将 jsonl 中列出的所有文件内容注入到 Agent 的 prompt 中
                    ↓
            Implement Agent 启动，带有完整上下文
```

**各阶段注入内容**：

| Agent | 注入内容 | 目的 |
|-------|---------|------|
| Implement | `implement.jsonl` 中的规范 + `prd.md` + `info.md` | 理解需求，按规范实现 |
| Check | `check.jsonl` 中的规范 + `finish-work.md` | 检查代码是否符合规范 |
| Check（[finish]标记） | `finish-work.md` + `prd.md`（轻量） | 提交前最终验证 |
| Debug | `debug.jsonl` 中的规范 + 错误信息 | 深度分析和修复 |

**设计理念**：
- Dispatch 成为纯调度器，只发送简单命令
- Hook 负责注入所有上下文，子 Agent 自主工作
- 无需手动传递上下文，行为由代码控制而非 prompt

### 2. `ralph-loop.py`（质量控制循环）

**触发时机**：SubagentStop - 当 Check Agent 尝试停止时

**工作原理**：
```
Check Agent 尝试停止
        ↓
  Ralph Loop 触发（SubagentStop）
        ↓
   有 verify 配置？
   ├─ 是 → 执行 worktree.yaml 中的验证命令
   │       ├─ 全部通过 → 允许停止
   │       └─ 有失败 → 阻止停止，告知失败原因，继续修复
   └─ 否 → 检查 Agent 输出的完成标记
           ├─ 标记齐全 → 允许停止
           └─ 缺少标记 → 阻止停止，告知缺少哪些标记

最多循环 5 次（防止无限循环和成本失控）
```

**两种验证方式**：

1. **程序化验证（推荐）**：
   - 在 `worktree.yaml` 配置 `verify` 命令（如 `pnpm lint`、`pnpm typecheck`）
   - Ralph Loop 执行这些命令验证代码
   - 不依赖 AI 输出，由程序强制验证，更可靠

2. **完成标记验证（回退方案）**：
   - 从 `check.jsonl` 的 `reason` 字段生成完成标记
   - 格式：`{REASON}_FINISH`（如 `TYPECHECK_FINISH`、`LINT_FINISH`）
   - Check Agent 必须实际执行检查并输出对应标记
   - Ralph Loop 检查所有标记是否都在 Agent 输出中

**状态管理**：
- 状态文件：`.trellis/.ralph-state.json`
- 跟踪当前迭代次数和 Feature
- 30 分钟超时自动重置

### 开发规范持续沉淀

**沉淀循环**：
```
AI 按规范执行 → 发现问题 → 更新 .trellis/structure/ → 下次执行更好 → 规范越用越好
```

**Thinking Guides**（`.trellis/structure/guides/`）捕捉团队的隐性知识：
- **cross-layer-thinking-guide.md**：跨层开发前的思考清单
- **code-reuse-thinking-guide.md**：创建新代码前的搜索清单

核心理念：**30 分钟的思考可以节省 3 小时的调试**

---

## 七、完整工作流示例

### Claude Code `/parallel` 完整流程

```
用户: /parallel
用户: 实现用户注册功能，包括邮箱验证
         ↓
┌─────────────────────────────────────────────────────┐
│ Plan 阶段（主仓库）                                   │
├─────────────────────────────────────────────────────┤
│ 1. plan.sh 启动 Plan Agent                          │
│ 2. Plan Agent 评估需求（可能拒绝不清晰的需求）         │
│ 3. Plan Agent 调用 Research Agent 分析代码库         │
│ 4. Plan Agent 创建 Feature 目录：                    │
│    - feature.json（元数据）                          │
│    - prd.md（需求文档）                              │
│    - implement.jsonl（实现阶段上下文）                │
│    - check.jsonl（检查阶段上下文）                    │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Worktree 创建（主仓库 → Worktree）                   │
├─────────────────────────────────────────────────────┤
│ 1. start.sh 创建 Git Worktree                       │
│ 2. 复制环境变量文件（worktree.yaml 的 copy 字段）     │
│ 3. 运行初始化命令（worktree.yaml 的 post_create 字段）│
│ 4. 写入 .trellis/.current-feature 标记              │
│ 5. 后台启动 Dispatch Agent                          │
│ 6. 注册到 registry.json                             │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Implement 阶段（Worktree 中）                        │
├─────────────────────────────────────────────────────┤
│ 1. Dispatch 调用 Task(subagent_type="implement")    │
│ 2. Hook 触发，注入 implement.jsonl + prd.md + info.md│
│ 3. Implement Agent 按规范实现功能                    │
│ 4. 运行 lint/typecheck                              │
│ 5. 报告完成                                          │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Check 阶段（Worktree 中）                            │
├─────────────────────────────────────────────────────┤
│ 1. Dispatch 调用 Task(subagent_type="check")        │
│ 2. Hook 触发，注入 check.jsonl 中的规范              │
│ 3. Check Agent 检查代码，自行修复问题                │
│ 4. Check Agent 尝试停止                              │
│ 5. Ralph Loop 触发：                                 │
│    - 执行 verify 命令（pnpm lint, pnpm typecheck）   │
│    - 全部通过 → 允许停止                             │
│    - 有失败 → 阻止停止，继续修复（最多 5 次）         │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Finish 阶段（Worktree 中）                           │
├─────────────────────────────────────────────────────┤
│ 1. Dispatch 调用 Task(prompt="[finish] ...")        │
│ 2. Hook 触发，注入 finish-work.md + prd.md（轻量）   │
│ 3. Check Agent 执行 Pre-Commit Checklist            │
│ 4. 跳过 Ralph Loop（check 阶段已验证过）             │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ Create-PR 阶段（Worktree 中）                        │
├─────────────────────────────────────────────────────┤
│ 1. create-pr.sh 执行                                 │
│ 2. git add -A（排除 agent-traces）                   │
│ 3. git commit -m "feat(scope): feature-name"        │
│ 4. git push origin <branch>                         │
│ 5. gh pr create --draft --base <base_branch>        │
│ 6. 更新 feature.json（status: "review", pr_url）    │
└─────────────────────────────────────────────────────┘
         ↓
用户: /record-agent-flow（记录会话）
```

### Cursor 完整流程

```
用户: /start
         ↓
AI: 读取项目状态，报告就绪
         ↓
用户: 说需求
         ↓
用户: /before-backend-dev（如果是后端任务）
         ↓
AI: 读取 .trellis/structure/backend/ 规范
         ↓
AI: 实现功能
         ↓
用户: /check-backend
         ↓
AI: 检查代码，自行修复问题
         ↓
用户: /finish-work
         ↓
AI: 执行 Pre-Commit Checklist
         ↓
用户: git commit（手动提交）
         ↓
用户: /record-agent-flow（记录会话）
```

---

## 拓展阅读

- [用 Kubernetes 的方式来理解 Trellis](docs/use-k8s-to-know-trellis-zh.md) - 如果你熟悉 Kubernetes，这篇文章用 K8s 的概念类比解释 Trellis 的设计
