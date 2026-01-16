# 调研报告：AI 编码助手项目 README 宣传模式分析

> 调研日期：2026-01-15
> 目的：学习其他新兴知名项目的宣传方式，为 Trellis 提供参考

---

## 调研项目列表

| 项目 | Stars | 定位 | 类型 | 仓库 |
|------|-------|------|------|------|
| **OpenCode** | 10.1k | Terminal AI assistant | 开源 CLI (Go) | opencode-ai/opencode |
| **Claude Code** | 56.8k | Agentic coding tool | Anthropic 官方 | anthropics/claude-code |
| **Cline** | 56.9k | Autonomous coding agent | VSCode 扩展 | cline/cline |
| **Aider** | 39.8k | AI pair programming | 开源 CLI (Python) | Aider-AI/aider |
| **Continue** | 30.9k | Continuous AI | IDE + CLI | continuedev/continue |
| **Cursor** | 32k | AI Code Editor | 闭源编辑器 | cursor/cursor |

---

## Feature 1: Slogan（一句话定位）

### 各项目 Slogan

| 项目 | Slogan | 字数 |
|------|--------|------|
| OpenCode | "A powerful AI coding agent. Built for the terminal." | 8 词 |
| Claude Code | "agentic coding tool that lives in your terminal" | 8 词 |
| Cline | "Autonomous coding agent right in your IDE" | 7 词 |
| Aider | "AI Pair Programming in Your Terminal" | 6 词 |
| Continue | "Ship faster with Continuous AI" | 5 词 |
| Cursor | "The AI Code Editor" | 4 词 |

### 模式分析

- **结构**：`[特性/功能] + [使用场景/位置]`
- **关键词**：agentic, autonomous, pair programming, continuous
- **长度**：4-8 词，简洁有力

### 建议 Trellis Slogan

- "AI development workflow framework"
- "Structure your AI coding sessions"
- "Workflow templates for AI-assisted development"

---

## Feature 2: 视觉演示（GIF/动图）

### 各项目视觉展示

| 项目 | 首屏视觉 | 格式 | 展示内容 |
|------|----------|------|----------|
| OpenCode | 动态演示 | GIF | 终端交互、代码生成 |
| Claude Code | 动态演示 | GIF | 终端命令、代码编辑 |
| Cline | 功能演示组 | GIF x 多个 | 每个功能配一个 GIF |
| Aider | 动画演示 | SVG screencast | 终端对话、代码修改 |
| Continue | 多场景演示 | GIF x 3 | Cloud/CLI/IDE 三种模式 |
| Cursor | 无 | - | 引导到官网 |

### 模式分析

- **必须有**：首屏 GIF 展示核心使用场景
- **GIF 内容**：展示"输入指令 → AI 响应 → 结果"完整流程
- **时长**：10-30 秒，循环播放

### Trellis 需要的 GIF

1. `/start` 命令初始化会话
2. 创建 feature 并编写 PRD
3. 委托 agent 实现功能
4. `/finish-work` 完成检查

---

## Feature 3: 安装指南

### 各项目安装方式

**Claude Code**（最全面）：
```bash
# MacOS/Linux (Recommended)
curl -fsSL https://claude.ai/install.sh | bash

# Homebrew
brew install --cask claude-code

# Windows
irm https://claude.ai/install.ps1 | iex

# WinGet
winget install Anthropic.ClaudeCode

# NPM (Deprecated)
npm install -g @anthropic-ai/claude-code
```

**OpenCode**（多渠道）：
```bash
# Install script
curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/refs/heads/main/install | bash

# Homebrew
brew install opencode-ai/tap/opencode

# Go
go install github.com/opencode-ai/opencode@latest
```

**Aider**（简洁三步）：
```bash
python -m pip install aider-install
aider-install
cd /to/your/project
aider --model sonnet --api-key anthropic=<key>
```

### 模式分析

- **一键安装**：`curl | bash` 或 `npm install -g`
- **多平台**：Mac、Linux、Windows 都要覆盖
- **包管理器**：Homebrew、npm、pip 等主流渠道
- **示例命令**：安装后立即可运行的示例

### Trellis 安装指南建议

```bash
# NPM (Recommended)
npm install -g @mindfoldhq/trellis
trellis init

# Or with npx
npx @mindfoldhq/trellis init
```

---

## Feature 4: 功能列表展示

### Aider 模式（图标 + 短句）

```
🧠 Cloud and local LLMs - 支持多种模型
🗺️ Maps your codebase - 代码库映射
💻 100+ code languages - 多语言支持
🔗 Git integration - Git 集成
🖥️ Use in your IDE - IDE 内使用
📷 Images & web pages - 图片和网页
🎤 Voice-to-code - 语音编码
✅ Linting & testing - 代码检查
```

### Cline 模式（标题 + 说明 + 截图）

每个功能一个章节：
- **Use any API and Model** - 说明文字 + 截图
- **Run Commands in Terminal** - 说明文字 + 截图
- **Create and Edit Files** - 说明文字 + 截图
- **Use the Browser** - 说明文字 + 截图

### OpenCode 模式（详细表格）

- Features 列表
- Keyboard Shortcuts 表格
- Supported AI Models 表格
- AI Assistant Tools 表格

### 建议 Trellis 功能展示

**图标列表形式**：
```
📋 Workflow Templates - 预定义的开发工作流命令
🤖 Agent Delegation - 委托专业 agent 完成任务
📁 Feature Tracking - 功能开发进度追踪
📝 Session Context - 跨会话上下文保持
🔧 Multi-Tool Support - 支持 Claude Code 和 OpenCode
📊 Progress Recording - 开发过程记录
```

---

## Feature 5: 社会证明（用户好评）

### Aider 的好评墙（最佳示例）

> *"My life has changed... Aider... It's going to rock your world."*
> — Eric S. Raymond on X

> *"The best free open source AI coding assistant."*
> — IndyDevDan on YouTube

> *"Aider ... has easily quadrupled my coding productivity."*
> — SOLAR_FIELDS on Hacker News

> *"Best agent for actual dev work in existing codebases."*
> — Nick Dobos on X

### 模式分析

- **来源多样**：Twitter/X、YouTube、Hacker News、Discord、GitHub
- **具体数字**："quadrupled productivity"、"finished three projects in two days"
- **知名人物**：技术领域 KOL 的推荐
- **真实链接**：每条引用都附带来源

### Trellis 需要收集

- [ ] 早期用户反馈
- [ ] 社区讨论截图
- [ ] 使用数据统计

---

## Feature 6: 徽章展示

### 常见徽章

```markdown
![GitHub Stars](https://img.shields.io/github/stars/xxx/xxx)
![npm version](https://img.shields.io/npm/v/xxx)
![Downloads](https://img.shields.io/npm/dm/xxx)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen)
```

### Aider 特色徽章

- 📦 Installs: 4.1M
- 🐈 Tokens/week: 15B
- 🏆 OpenRouter: Top 20
- 🔄 Singularity: 88%（代码由 Aider 自己生成的比例）

### Trellis 建议徽章

```markdown
![npm](https://img.shields.io/npm/v/@mindfoldhq/trellis)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)
```

---

## Feature 7: 社区入口

### 各项目社区渠道

| 项目 | Discord | Forum | Docs | Issues |
|------|---------|-------|------|--------|
| OpenCode | ❌ | ❌ | ❌ | ✅ |
| Claude Code | ✅ | ❌ | ✅ | ✅ |
| Cline | ✅ | ❌ | ✅ | ✅ |
| Aider | ✅ | ❌ | ✅ | ✅ |
| Continue | ✅ | ❌ | ✅ | ✅ |
| Cursor | ❌ | ✅ | ✅ | ✅ |

### 模式分析

- **必须有**：Discord（实时交流）+ GitHub Issues（问题追踪）
- **加分项**：独立文档网站、视频教程
- **展示位置**：README 顶部或 Getting Started 之后

---

## Feature 8: 企业版入口

### Cline 的企业版展示

> **Enterprise**
> Get the same Cline experience with enterprise-grade controls:
> - SSO (SAML/OIDC)
> - Global policies and configuration
> - Observability with audit trails
> - Private networking (VPC/private link)
> - Self-hosted or on-prem deployments
> - Enterprise support
>
> Learn more at our [enterprise page](https://cline.bot/enterprise)

### 模式分析

- 列出企业关心的功能点
- 单独的落地页
- "Contact Sales" 入口

---

## 总结：Trellis README 需要的元素

### 必须有 ✅

1. **Slogan**：一句话定位（5-8 词）
2. **GIF 演示**：首屏展示核心工作流
3. **安装命令**：一键安装 + 多平台支持
4. **功能列表**：图标 + 短句形式
5. **Getting Started**：3-5 步快速上手
6. **社区链接**：Discord + GitHub Issues

### 建议有 📝

7. **徽章**：npm 版本、stars、license
8. **支持的工具表格**：Claude Code、OpenCode 对比
9. **命令列表**：/start、/finish-work 等

### 可选加分 ⭐

10. **用户好评**：早期用户反馈
11. **视频教程**：YouTube 链接
12. **对比表格**：与其他工具的对比

---

---

## Feature 9: GitHub vs 官网差异（新增）

### 调研发现

| 项目 | GitHub 重点 | 官网重点 |
|------|-------------|----------|
| Aider | 技术细节、安装命令 | 用户数据（4.1M 安装）、40+ 推荐、88% 自迭代 |
| Cline | 功能截图、企业版入口 | 使用场景（Understand/Refactor/Automate）、企业客户 logo |
| Continue | 模型支持列表 | 工作流概念（Mission Control/CLI/IDE）、集成场景 |
| OpenCode | 键盘快捷键、详细表格 | 隐私、70K stars、650K 月活 |

### 关键洞察

1. **官网讲"为什么"，GitHub 讲"怎么做"**
2. **官网用数据说话**：stars、安装量、用户数
3. **官网有使用场景**：而非功能罗列
4. **官网有社会证明**：知名公司 logo、用户引言

---

## Feature 10: 新兴项目模式（新增）

### Superpowers

**Slogan**: "An agentic skills framework & software development methodology that works"

**亮点**：
- 强调"自动触发"："because the skills trigger automatically, you don't need to do anything special"
- 七阶段工作流明确定义
- 多平台支持（Claude Code、Codex、OpenCode）

**启发**：强调"无感接入"，用户不需要改变习惯

### Dev Browser

**定位**：Claude Code 的浏览器自动化插件

**亮点**：
- 使用**基准测试对比表**展示优势
- 三大功能特点简洁明了
- 强调"AI 友好"的设计

**启发**：用数据对比而非文字描述来展示优势

### Conductor

**Slogan**: "Run a team of coding agents on your Mac"

**亮点**：
- 并行 + 隔离 + 可视化
- 知名公司用户（Linear、Vercel、Notion、Stripe）
- "new productivity unlock" 用户引言

**启发**：强调"团队协作"视角

### Planning with Files

**Slogan**: "Work like Manus" — 借用 $2B 收购的知名度

**亮点**：
- 三文件模式清晰简洁（task_plan.md、findings.md、progress.md）
- 类比："Context Window = RAM，Filesystem = Disk"
- 解决 AI 的"注意力"和"错误持久化"问题

**启发**：借用知名方法论/公司背书、用简单类比解释复杂概念

---

---

## Feature 11: GitHub Trending Slogan 分析（新增）

### 数据来源

2026-01-16 GitHub Trending 项目（日榜 + 月榜 Top 20）

### Slogan 分析表

| 项目 | Slogan | 词数 | 评分 | 分析 |
|------|--------|------|------|------|
| OpenCode | "The open source coding agent." | 5 | ⭐⭐⭐⭐⭐ | 完美的定冠词定位："THE"，简洁明确 |
| Puck | "The visual editor for React" | 5 | ⭐⭐⭐⭐⭐ | 同样用 "THE"，极简，精准定位 |
| Beads | "A memory upgrade for your coding agent" | 7 | ⭐⭐⭐⭐ | 比喻（memory upgrade），有创意 |
| Exo | "Run your own AI cluster at home with everyday devices" | 10 | ⭐⭐⭐⭐ | 场景化，动词开头，画面感 |
| Vibe-Kanban | "Get 10X more out of Claude Code, Codex or any coding agent" | 12 | ⭐⭐⭐⭐ | 量化价值（10X），但稍长 |
| Memos | "An open-source, self-hosted note-taking service" | 6 | ⭐⭐⭐⭐ | 三属性堆叠，清晰但无亮点 |
| Superpowers | "An agentic skills framework & software development methodology that works." | 10 | ⭐⭐⭐ | 太长，"that works" 是亮点但前面太啰嗦 |
| Claude Code | "An agentic terminal tool for faster coding through natural language" | 10 | ⭐⭐⭐ | 清晰但普通，没有记忆点 |
| Personal_AI_Infrastructure | "Personal AI Infrastructure for upgrading humans." | 5 | ⭐⭐⭐ | "upgrading humans" 有点奇怪 |
| Handy | "A free, open source, and extensible speech-to-text application that works completely offline." | 13 | ⭐⭐ | 太长，堆砌太多形容词 |
| agents.md | "AGENTS.md — a simple, open format for guiding coding agents" | 9 | ⭐⭐⭐⭐ | 自解释，"simple, open format" 好 |

### 模式总结

#### 高分 Slogan 共同特点

1. **"THE" 定冠词策略**
   - "THE open source coding agent" → 暗示唯一性/权威性
   - "THE visual editor for React" → 暗示这是最好/唯一的选择
   - 适用于：有明确定位且自信的项目

2. **比喻/类比**
   - "A memory upgrade for your coding agent" → 把抽象概念比作具体事物
   - 效果：让复杂功能秒懂

3. **量化价值**
   - "Get 10X more out of..." → 具体数字比"更好"更有说服力
   - 适用于：有可量化效果的工具

4. **场景化描述**
   - "Run your own AI cluster at home..." → 画面感，用户能想象自己使用
   - 动词开头 + 具体场景

5. **自解释性**
   - "a simple, open format for guiding coding agents" → 不需要额外解释
   - 关键词组合说明 what + for whom

#### 低分 Slogan 共同问题

1. **堆砌形容词**：free, open source, extensible... → 失去重点
2. **过长**：超过 8 词开始难记
3. **模糊**："for upgrading humans" → 意义不明
4. **无亮点**："an agentic terminal tool" → 能记住但不想点进去

### Trellis Slogan 新候选

基于上述分析：

| 候选 | 词数 | 策略 | 评价 |
|------|------|------|------|
| **"The workflow layer for AI coding"** | 6 | THE 定冠词 | 推荐，简洁+权威 |
| "A structure for your AI agents" | 6 | 直接 | 清晰但普通 |
| "Give your AI agents memory" | 5 | 比喻 | 形象，但可能误解 |
| "10X your AI coding workflow" | 5 | 量化 | 大胆但难证明 |
| "AI development, finally structured" | 4 | 对比 | "finally" 暗示解决痛点 |

### Slogan 正反辩论（2026-01-16 Session）

---

#### 正方：支持 "Workflow Layer" 方向

**核心论点**：

| 论点 | 理由 |
|------|------|
| THE 定冠词策略有效 | 暗示权威/唯一，GitHub Trending 高星项目常用（OpenCode、Puck） |
| "workflow layer" 精准 | 直接说明 Trellis 是什么：在 AI 工具之上的工作流层 |
| 简洁易记 | 6 词，符合最佳实践（3-8 词） |
| 功能导向 | 开发者能立即理解用途 |

**正方推荐 Slogan**：

| 排序 | Slogan | 理由 |
|------|--------|------|
| 1 | **The workflow layer for AI coding** | 最简洁，THE + 精准定位 |
| 2 | **The workflow layer your AI agents are missing** | 痛点驱动，但稍长（8词） |
| 3 | **Structure for the unstructured** | 哲学感，对比强烈 |

---

#### 反方：反对 "Workflow Layer" 方向

**核心论点**：

| 论点 | 理由 |
|------|------|
| 听起来"静态" | Trellis 是动态演化的，会随着使用积累知识，"workflow" 暗示固定流程 |
| 像"中间件" | "layer" 听起来是可选的附加层，但 Trellis 实际是核心组件 |
| 没有体现"学习" | Trellis 的独特价值是 AI 从错误中学习、积累最佳实践，"workflow" 没有体现 |
| 没有呼应 Trellis 隐喻 | Trellis = 攀援支架，帮助植物"成长"，应该强调成长而非框架 |
| 弱化自迭代特性 | Trellis 随使用变得更好，"workflow layer" 没有体现这种演化性 |

**Trellis 的真正独特价值**（反方强调）：

1. **知识沉淀** - 错误变成防范模式，进度变成上下文
2. **项目级演化** - 随着使用，`.trellis/` 目录越来越有价值
3. **AI 学习你的模式** - 不是 AI 遵循固定规则，而是学习项目文化
4. **跨会话记忆** - AI 不再"失忆"

**反方推荐 Slogan**：

| 排序 | Slogan | 理由 |
|------|--------|------|
| 1 | **The knowledge layer that grows with you** | THE 策略 + 成长 + 知识沉淀 |
| 2 | **The learning layer for AI coding** | THE 策略 + 学习 |
| 3 | **Where AI learns your patterns** | 强调学习，简洁 |
| 4 | **Your project's memory for AI** | 记忆比喻，直击痛点 |

---

#### 辩论结论

**共识**：
- THE 定冠词策略确实有效，应该保留
- 需要在"功能清晰"和"体现演化性"之间找到平衡

**待解决**：
- 是否能找到一个既精准描述功能、又体现演化/学习特性的 Slogan？
- 候选方向：The [knowledge/learning/memory] layer for AI coding

**下一步**：
- 结合正反方优点，探索新的 Slogan 候选
- 可能的折中：The memory layer for AI coding（记忆 = 持久化 + 学习 + 演化）

---

## 更新后的 Trellis README 策略

### 定位差异化

Trellis 与其他项目的区别：
- **不是编码工具**，是**工作流框架**
- **不是单一工具**，是**多工具支持**
- **不是会话级**，是**项目级持久化**

### 推荐 Slogan 候选（更新）

1. ~~"AI development workflow framework"~~ → 太泛
2. **"The workflow layer your AI agents are missing"** ← 推荐
3. "Structure your AI coding sessions"
4. "Make AI development predictable and repeatable"
5. "Guided AI development, from chaos to clarity"

### 核心价值主张（三选一）

| 选项 | 价值主张 | 目标用户 |
|------|----------|----------|
| A | 解决 AI 开发的"无序"问题 | 个人开发者 |
| B | 多工具统一工作流 | 多工具用户 |
| C | 跨会话上下文保持 | 长期项目维护者 |

---

## 附录：README 结构模板（更新版）

```markdown
# Trellis

> The workflow layer your AI agents are missing

![Demo GIF](./assets/demo.gif)

[![npm](badge)](#) [![license](badge)](#) [![stars](badge)](#)

## Why Trellis?

AI coding tools are powerful, but sessions are isolated. Trellis provides:

- 📁 **Persistent Context** - Progress survives across sessions
- 🤖 **Multi-Tool Support** - Same workflow for Claude Code, Cursor, OpenCode
- 📋 **Structured Commands** - /start, /finish-work, /check-backend...
- 🔄 **Feature Tracking** - Directory-based task management

## Quick Start

\`\`\`bash
npm install -g @mindfoldhq/trellis
trellis init
\`\`\`

## How It Works

[简单流程图或 GIF]

1. AI reads context at session start
2. Follows project-specific guidelines
3. Updates progress for next session

## Commands Reference

| Command | Purpose |
|---------|---------|
| /start | Begin development session |
| /finish-work | Pre-commit checklist |
| ... | ... |

## Supported Tools

| Tool | Status |
|------|--------|
| Claude Code | ✅ Full support |
| Cursor | ✅ Full support |
| OpenCode | 🚧 Coming soon |

## Philosophy

> "Context Window = RAM, Filesystem = Disk"
> — Planning with Files

Trellis treats your filesystem as persistent memory for AI agents.

## License

MIT
```
