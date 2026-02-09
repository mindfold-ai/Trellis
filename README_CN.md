<p align="center">
<picture>
<source srcset="assets/trellis.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/trellis.png" media="(prefers-color-scheme: light)">
<img src="assets/trellis.png" alt="Trellis Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>Claude Code、Cursor、iFlow 和 Codex 的一站式 AI 开发框架</strong><br/>
<sub>能解决以下问题</sub>
</p>

<p align="center">
<img src="assets/meme_zh.png" alt="AI Coding Meme" width="400" />
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@mindfoldhq/trellis"><img src="https://img.shields.io/npm/v/@mindfoldhq/trellis.svg?style=flat-square&color=blue" alt="npm version" /></a>
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-FSL-green.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/mindfold-ai/Trellis/stargazers"><img src="https://img.shields.io/github/stars/mindfold-ai/Trellis?style=flat-square&color=yellow" alt="stars" /></a>
<a href="https://discord.com/invite/tWcCZ3aRHc"><img src="https://img.shields.io/badge/Discord-Join-7289DA?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

<p align="center">
<a href="#快速开始">快速开始</a> •
<a href="#为什么要用-trellis">为什么要用 Trellis</a> •
<a href="#使用场景">使用场景</a> •
<a href="#工作原理">工作原理</a> •
<a href="#常见问题">常见问题</a>
</p>

## 为什么要用 Trellis？

| 功能 | 解决什么问题 |
| --- | --- |
| **自动注入** | 规范和工作流自动注入每次对话，写一次，永久生效 |
| **自更新规范库** | 最佳实践存在自更新的 spec 文件中，用得越多，AI 越懂你 |
| **并行会话** | 一个会话窗口可以在后台启动多个会话窗口,每个会话窗口都可以调用多个 Agent 同时工作，运行在各自独立的 worktree |
| **团队共享** | 团队共享规范，团队里有一个高人搞一版本好的规范，拉高全员的ai coding水平 |
| **会话持久化** | 工作记录持久化到仓库，AI 跨会话记住项目上下文, 不用每次再费劲告诉ai你的项目情况是什么 |

## 快速开始

```bash
# 1. 全局安装
npm install -g @mindfoldhq/trellis@latest

# 2. 在项目目录初始化
trellis init -u your-name

# 或包含 iFlow CLI 支持
trellis init --iflow -u your-name

# 或包含 Codex Skills 支持
trellis init --codex -u your-name

# 3. 启动 Claude Code，开始干活
```

> `your-name` 是你的标识，会创建个人工作区 `.trellis/workspace/your-name/`

<p align="center">
<img src="assets/info.png" alt="Trellis 初始化示例" />
</p>

## use cases

### 教会你的 AI

规范写入文件里，Trellis 会帮你把项目规范,项目信息和工作流的知识自动注入给 AI ,不需要每次都给 AI 解释情况

<p align="center">
<img src="assets/usecase1.png" alt="教 AI - 教一次，永远生效" />
</p>

比如你定义了"组件用 TypeScript Props 接口、PascalCase 命名、函数式写法加 Hooks"，之后 AI 写新代码就会自动照做。

### 并行开发

用 `/trellis:parallel` 可以同时跑多个任务，每个任务在独立的 git worktree 里由调度Agent 自动指挥多个子 agent 完成，干完自己提 PR。

<p align="center">
<img src="assets/usecase2.png" alt="并行开发 - 多个功能同时推进" />
</p>

本地开发时，每个 worker 运行在独立的 worktree（物理隔离的目录），互不阻塞、互不干扰。一个功能完成就可以合并，不用等其他的。

### 自定义工作流

定义自定义的 skill 和 slash command ，为特定任务预加载上下文。

<p align="center">
<img src="assets/usecase3.png" alt="工作流 - 一个命令加载全部上下文" />
</p>

创建类似 `/trellis:before-frontend-dev` 的短命令，一键加载组件规范、检查最近改动、拉取测试模式、查看共享 hooks。

## 工作原理

### 项目结构

```
.trellis/
├── workflow.md              # 工作流指南（启动时自动注入）
├── worktree.yaml            # 多 Agent 配置（用于 /trellis:parallel）
├── spec/                    # 规范库
│   ├── frontend/            #   前端规范
│   ├── backend/             #   后端规范
│   └── guides/              #   决策与分析框架
├── workspace/{name}/        # 个人工作区
├── tasks/                   # 任务管理（进度跟踪等）
└── scripts/                 # 工具脚本

.claude/
├── settings.json            # Hook 配置
├── agents/                  # Agent 定义
│   ├── dispatch.md          #   调度 Agent（纯路由，不读规范）
│   ├── implement.md         #   实现 Agent
│   ├── check.md             #   检查 Agent
│   └── research.md          #   调研 Agent
├── commands/                # 斜杠命令
└── hooks/                   # Hook 脚本
    ├── session-start.py     #   启动时注入上下文
    ├── inject-subagent-context.py  #   给子 Agent 注入规范
    └── ralph-loop.py               #   质量控制循环

```

### 工作流图

<p align="center">
<img src="assets/workflow.png" alt="Trellis 工作流图" />
</p>

## 路线图

- [ ] **更好的代码审查** — 更完善的自动化审查流程
- [ ] **Skill 包** — 预置工作流包，即插即用
- [ ] **更广泛的工具支持** — Cursor、OpenCode、Codex 集成
- [ ] **更强的会话连续性** — 自动保存全会话历史
- [ ] **可视化并行会话** — 实时查看每个 Agent 的进度

## 常见问题

<details>
<summary><strong>为什么用 Trellis 而不是 Skills？</strong></summary>

Skills 是可选的——AI 可能跳过，导致质量不稳定。Trellis 通过 Hook 注入**强制**执行规范：不是"可以用"而是"必须用"。把随机性关进笼子里，质量不会随时间退化。

</details>

<details>
<summary><strong>spec 文件是手写还是让 AI 写？</strong></summary>

大多数时候让 AI 来——你只要说"我们用 Zustand，不用 Redux"，它就会自动创建 spec 文件。但当你有 AI 自己想不到的架构洞察时，就得你来写了。能把团队踩过的坑教给 AI 并且拉高团队开发水平,这就是你不会被 AI 取代的原因。

</details>

<details>
<summary><strong>这和 <code>CLAUDE.md</code> / <code>AGENTS.md</code> / <code>.cursorrules</code> 有什么区别？</strong></summary>

那些是大一统文件——AI 每次都要读全部内容。Trellis 用**分层架构**做上下文压缩：只加载当前任务相关的规范。工程规范应该优雅分层，而不是堆成一坨。

</details>

<details>
<summary><strong>多人协作会冲突吗？</strong></summary>

不会。每人有自己的空间 `.trellis/workspace/{name}/`。

</details>

<details>
<summary><strong>AI 怎么知道之前的对话内容？</strong></summary>

每次结束对话时用 `/trellis:record-session`，AI 会把会话摘要写入 `.trellis/workspace/{name}/journal-N.md`，并在 `index.md` 建立索引。下次 `/trellis:start` 时，AI 会自动读取最近的 journal 和 git 信息，恢复上下文。所以理论上直接扒每天的 journal 文件就能当你的工作日报提交了🤣。

</details>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mindfold-ai/Trellis&type=Date)](https://star-history.com/#mindfold-ai/Trellis&Date)

## 详细文档

- [完整使用指南](docs/guide-zh.md) — 系统架构、工作流、CLI 命令参考
- [用 K8s 理解 Trellis](docs/use-k8s-to-know-trellis-zh.md) — 如果你熟悉 Kubernetes，这篇文章可以帮你快速理解设计思想

## 社区

- [Discord](https://discord.com/invite/tWcCZ3aRHc) — 加入讨论
- [GitHub Issues](https://github.com/mindfold-ai/Trellis/issues) — 报告 Bug & 提功能建议
- 微信群 — 扫码加入

<p align="center">
<img src="assets/wx_link1.jpg" alt="微信群二维码" width="200" />
</p>

<p align="center">
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE">FSL License</a> •
Made with care by <a href="https://github.com/mindfold-ai">Mindfold</a>
</p>

<p align="center">
<sub>觉得 Trellis 有用？欢迎点个 ⭐</sub>
</p>
