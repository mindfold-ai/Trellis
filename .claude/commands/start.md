# Start Session

Initialize your AI development session and begin working on tasks.

---

## 操作类型说明

本文档中的操作分为两类：

| 标记 | 含义 | 执行者 |
|------|------|--------|
| `[AI]` | AI 执行的 bash 脚本或 Task 调用 | 你（AI） |
| `[USER]` | 用户执行的 slash command | 用户 |

---

## Initialization

### Step 1: 了解 Trellis 工作流 `[AI]`

首先阅读以下文件了解工作流体系：

```bash
cat init-agent.md         # 项目整体介绍和初始化指南
cat .trellis/workflow.md  # 开发流程和规范
```

### Step 2: 获取当前状态 `[AI]`

```bash
./.trellis/scripts/get-context.sh
```

### Step 3: 阅读项目指南 `[AI]`

```bash
cat .trellis/structure/frontend/index.md  # 前端规范索引
cat .trellis/structure/backend/index.md   # 后端规范索引
cat .trellis/structure/guides/index.md    # 思维指南
```

### Step 4: 报告就绪状态，询问任务

---

## Working on Tasks

### For Simple Tasks

1. Read relevant guidelines based on task type `[AI]`
2. Implement the task directly `[AI]`
3. Remind user to run `/finish-work` before committing `[USER]`

### For Complex Tasks (Multi-Step Features)

Use feature tracking and delegate to specialized agents.

#### Step 1: 创建 Feature 目录 `[AI]`

```bash
FEATURE_DIR=$(./.trellis/scripts/feature.sh create <name>)
```

#### Step 2: 初始化上下文 `[AI]`

```bash
./.trellis/scripts/feature.sh init-context "$FEATURE_DIR" <type>
# type: backend | frontend | fullstack
```

#### Step 3: 调用 Research Agent 分析任务 `[AI]`

```
Task(
  subagent_type: "research",
  prompt: "分析以下任务需要哪些开发规范：

  任务描述：<用户需求>
  开发类型：<dev_type>

  请：
  1. 查找 .trellis/structure/ 下相关的规范文件
  2. 查找项目中相关的代码模块和模式
  3. 列出应该添加到 implement.jsonl、check.jsonl、debug.jsonl 的具体文件",
  model: "opus"
)
```

#### Step 4: 追加规范 `[AI]`

```bash
./.trellis/scripts/feature.sh add-context "$FEATURE_DIR" implement "<path>" "<reason>"
./.trellis/scripts/feature.sh add-context "$FEATURE_DIR" check "<path>" "<reason>"
./.trellis/scripts/feature.sh add-context "$FEATURE_DIR" debug "<path>" "<reason>"
```

验证：
```bash
./.trellis/scripts/feature.sh list-context "$FEATURE_DIR"
```

#### Step 5: 创建需求文档 `[AI]`

Create `prd.md` in the feature directory.

#### Step 6: 启动 Feature `[AI]`

```bash
./.trellis/scripts/feature.sh start "$FEATURE_DIR"
```

#### Step 7: 委托工作 `[AI]`

```
Task(subagent_type: "implement", prompt: "Implement the feature described in prd.md", model: "opus")
```

检查质量：

```
Task(subagent_type: "check", prompt: "Check code changes and fix any issues", model: "opus")
```

#### Step 8: 完成

1. Verify typecheck and lint pass `[AI]`
2. Remind user to test
3. Remind user to commit
4. Remind user to run `/record-agent-flow` `[USER]`
5. Archive feature `[AI]`:
   ```bash
   ./.trellis/scripts/feature.sh archive <feature-name>
   ```

---

## 用户可用的命令 `[USER]`

以下是用户（不是 AI）可以运行的 slash command：

| 命令 | 说明 |
|------|------|
| `/start` | 启动开发 session（即本命令） |
| `/parallel` | 启动 Multi-Agent Pipeline（worktree 模式） |
| `/finish-work` | 完成工作前的检查清单 |
| `/record-agent-flow` | 记录 session 进度 |
| `/check-frontend` | 检查前端代码 |
| `/check-backend` | 检查后端代码 |

---

## Session End Reminder

**IMPORTANT**: When a task or session is completed, remind the user:

> Before ending this session, please run `/record-agent-flow` to record what we accomplished.

---

## AI 执行的脚本 `[AI]`

| 脚本 | 用途 |
|------|------|
| `feature.sh create <name>` | 创建 feature 目录 |
| `feature.sh init-context <dir> <type>` | 初始化 jsonl 文件 |
| `feature.sh add-context <dir> <jsonl> <path>` | 追加规范 |
| `feature.sh start <dir>` | 设置当前 feature |
| `feature.sh finish` | 清除当前 feature |
| `feature.sh archive <name>` | 归档 feature |
| `get-context.sh` | 获取 session 上下文 |

## Sub Agent 调用 `[AI]`

所有 sub agent 调用都使用 opus 模型：

| Agent | 用途 |
|-------|------|
| research | 查找规范、分析代码 |
| implement | 实现功能 |
| check | 检查代码 |
| debug | 修复问题 |
