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

## 附录：README 结构模板

```markdown
# Trellis

> [Slogan 一句话定位]

![GIF 演示]

[![npm](badge)](#) [![license](badge)](#) [![discord](badge)](#)

## Features

- 📋 Feature 1 - 说明
- 🤖 Feature 2 - 说明
- ...

## Quick Start

\`\`\`bash
npm install -g @mindfoldhq/trellis
trellis init
\`\`\`

## Documentation

- [Getting Started](link)
- [Commands Reference](link)
- [Configuration](link)

## Community

- [Discord](link)
- [GitHub Issues](link)

## License

MIT
```
