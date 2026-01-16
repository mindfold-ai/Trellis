# Trellis

[English](./README.md) | 中文

AI 能力像常春藤一样生长——充满活力但四处蔓延。Trellis 提供结构，引导它们沿着规范的路径生长。

基于 Anthropic 的 [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)，结合真实场景的工程实践和改进。

## 安装

```bash
npm install -g @mindfoldhq/trellis    # 或 pnpm/yarn
```

## 快速开始

```bash
# 在项目中初始化
trellis init
# 或使用简短别名
tl init

# 指定开发者名称初始化
trellis init -u your-name

# 仅为特定工具初始化
trellis init --cursor          # 仅 Cursor
trellis init --claude          # 仅 Claude Code
trellis init --cursor --claude # 两者都要（默认）
```

## 功能介绍

Trellis 在你的项目中创建结构化的 workflow 系统：

```
your-project/
├── .trellis/
│   ├── .developer                 # 开发者身份（gitignored）
│   ├── workflow.md                    # 工作流指南
│   ├── agent-traces/            # Session 追踪
│   │   └── {developer}/           # 按开发者隔离
│   │       ├── index.md           # 进度索引
│   │       ├── features/          # Feature 追踪
│   │       │   ├── {day}-{name}/  # Feature 目录
│   │       │   │   └── feature.json
│   │       │   └── archive/       # 已完成的 features
│   │       └── traces-N.md      # Session 记录
│   ├── structure/                 # 开发规范
│   │   ├── frontend/              # 前端规范
│   │   ├── backend/               # 后端规范
│   │   └── guides/                # 思维指南
│   ├── scripts/                   # 工具脚本
│   │   ├── common/                # 共享工具
│   │   │   ├── paths.sh           # 路径工具
│   │   │   ├── developer.sh       # 开发者管理
│   │   │   ├── git-context.sh     # Git 上下文
│   │   │   └── worktree.sh        # Worktree 工具
│   │   ├── multi-agent/           # 多 Agent 流水线
│   │   │   ├── start.sh           # 启动 worktree agent
│   │   │   ├── cleanup.sh         # 清理 worktree
│   │   │   └── status.sh          # 监控 agent 状态
│   │   ├── feature.sh             # Feature 管理
│   │   └── ...
│   └── worktree.yaml              # Worktree 配置
├── .cursor/commands/              # Cursor slash 命令
├── .claude/commands/              # Claude Code slash 命令
├── init-agent.md                  # AI 入职指南
└── AGENTS.md                      # Agent 行为指南
```

## 核心特性

### 1. 多开发者支持

每个开发者（人类或 AI）都有独立的进度追踪：

```bash
./.trellis/scripts/init-developer.sh <name>
```

### 2. Slash 命令

为 AI 助手预置的命令：

| 命令 | 用途 |
|------|------|
| `/init-agent` | 初始化 AI session 上下文 |
| `/before-frontend-dev` | 编码前读取前端规范 |
| `/before-backend-dev` | 编码前读取后端规范 |
| `/check-frontend` | 根据规范验证前端代码 |
| `/check-backend` | 根据规范验证后端代码 |
| `/check-cross-layer` | 检查跨层一致性 |
| `/finish-work` | 提交前检查清单 |
| `/record-agent-flow` | 记录 session 进度 |
| `/break-loop` | 深度 bug 分析 |
| `/onboard-developer` | 完整工作流入职 |

### 3. 思维指南

结构化的指南，帮助避免常见错误：

- 跨层思考指南
- 代码复用思考指南
- 实现前检查清单

### 4. Feature 追踪

基于目录结构的 feature 追踪：

```bash
./.trellis/scripts/feature.sh create my-feature  # 创建 feature
./.trellis/scripts/feature.sh list               # 列出活跃的 features
./.trellis/scripts/feature.sh archive my-feature # 归档已完成的
```

### 5. 多 Agent 流水线（Worktree 支持）

使用 git worktree 实现多个 AI agent 并行运行，相互隔离：

```bash
# 1. 创建 feature 并设置分支
./.trellis/scripts/feature.sh create my-feature
./.trellis/scripts/feature.sh set-branch <feature-dir> feature/my-feature

# 2. 在隔离的 worktree 中启动 agent
./.trellis/scripts/multi-agent/start.sh <feature-dir>

# 3. 监控 agent 状态
./.trellis/scripts/multi-agent/status.sh --list    # 列出所有 agent
./.trellis/scripts/multi-agent/status.sh --watch <feature>  # 实时查看日志

# 4. 完成后清理
./.trellis/scripts/multi-agent/cleanup.sh <branch-name>
```

在 `.trellis/worktree.yaml` 中配置 worktree 行为：

```yaml
worktree_dir: ../worktrees     # Worktree 存放目录
copy:                          # 需要复制到每个 worktree 的文件
  - .env
  - .trellis/.developer
post_create:                   # Worktree 创建后执行的命令
  - pnpm install
```

## CLI 命令

```bash
trellis init              # 初始化 workflow
trellis init -u <name>    # 指定开发者名称初始化
trellis init -y           # 跳过提示，使用默认值
trellis init -f           # 强制覆盖已有文件
trellis init -s           # 跳过已有文件
```

## 工作原理

1. **AI 读取 `init-agent.md`** 作为 session 入口
2. **遵循规范** 来自 `.trellis/structure/`
3. **更新进度** 到 `.trellis/agent-traces/`
4. **使用 slash 命令** 完成常见任务

这创建了一个结构化、可追踪的工作流：
- AI agent 跨 session 保持上下文
- 工作可追踪、可审计
- 代码质量标准得到执行
- 多个 agent 可以协作

## 路线图

计划中的功能：

| 功能 | 描述 |
|------|------|
| **Monorepo 支持** | 适配 monorepo 项目结构 |
| **Worktree 隔离** | 每个新 session 使用独立的 git worktree |
| **并发 Session** | 需求池有多个任务时并发执行 |
| **对话持久化** | 工程师与 AI 的对话记录持久化存储 |

## 致谢

Trellis 基于以下项目和研究构建：

- [Anthropic](https://www.anthropic.com/) - 提供了 [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 的基础研究
- [OpenSkills](https://github.com/numman-ali/openskills) - 开创了扩展 Claude 能力的 skills 系统
- [Exa](https://exa.ai/) - 提供了强大的网页搜索和代码上下文能力，显著增强 AI agent 性能

## 许可证

FSL-1.1-MIT (Functional Source License, MIT future license)

Copyright © Mindfold LLC
