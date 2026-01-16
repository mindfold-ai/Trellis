# README 草稿

## 结构规划

```
1. 标题 + Slogan + 徽章
2. Hero GIF
3. "Why Trellis?" - 问题与解决方案
4. Features - 图标列表（5-6个）
5. Quick Start - 3步
6. How It Works - 简单流程
7. Commands Reference - 表格
8. Supported Tools - 表格
9. Philosophy/Design Principles - 简短
10. Roadmap - 简表
11. Community - 链接
12. License
```

---

## Slogan 候选

| 候选 | 优点 | 缺点 |
|------|------|------|
| "The workflow layer your AI agents are missing" | 明确差异化 | 稍长 |
| "Structured workflows for AI-assisted development" | 直接 | 普通 |
| "Guide your AI agents with structure" | 呼应 Trellis 含义 | 不够有力 |
| "From chaos to clarity in AI development" | 有对比感 | 可能太夸张 |
| "AI development, structured and repeatable" | 清晰 | 无亮点 |

**推荐**：`The workflow layer your AI agents are missing`

---

## "Why Trellis?" 章节草稿

**问题陈述**（简短版）：

> AI coding tools are powerful, but every session starts from scratch.
> Your AI assistant doesn't remember what it did yesterday.

**解决方案**：

> Trellis adds a persistent workflow layer that survives across sessions.
> Same workflow works with Claude Code, Cursor, and OpenCode.

---

## Features 草稿

使用图标 + 动词 + 描述的格式：

```
📁 Persistent Context - Progress and decisions survive across sessions
🤖 Multi-Tool Support - Works with Claude Code, Cursor, and OpenCode
📋 Structured Commands - /start, /finish-work, /check-backend, and more
🎯 Feature Tracking - Directory-based task management with PRDs
📝 Session Recording - Automatic progress documentation
🧠 Thinking Guides - Prevent common mistakes before they happen
```

---

## Quick Start 草稿

```bash
# Install
npm install -g @mindfoldhq/trellis

# Initialize in your project
trellis init

# Start your AI session
# In Claude Code: /start
# In Cursor: run /start command
```

---

## How It Works 草稿

方案 A：文字版

```
1. **Initialize** - `trellis init` creates the workflow structure
2. **Start Session** - AI reads context and guidelines at session start
3. **Work** - AI follows project-specific patterns and updates progress
4. **End Session** - Progress is recorded for the next session
```

方案 B：流程图版

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  /start  │ → │  Work    │ → │ /finish  │ → │  Next    │
│  读取上下文 │    │  开发任务  │    │  检查提交  │    │  Session │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## Commands Reference 草稿

| Command | Purpose |
|---------|---------|
| `/start` | Initialize session with full context |
| `/finish-work` | Pre-commit checklist and validation |
| `/before-frontend-dev` | Load frontend guidelines |
| `/before-backend-dev` | Load backend guidelines |
| `/check-frontend` | Validate against frontend standards |
| `/check-backend` | Validate against backend standards |
| `/check-cross-layer` | Verify cross-layer consistency |
| `/record-agent-flow` | Record session progress |

---

## Supported Tools 草稿

| Tool | Status | Notes |
|------|--------|-------|
| Claude Code | ✅ Full support | Native slash commands |
| Cursor | ✅ Full support | Custom commands |
| OpenCode | 🚧 Coming soon | In development |

---

## Philosophy 草稿

引用 Planning with Files 的类比：

> "Context Window = RAM, Filesystem = Disk"

Trellis treats your filesystem as persistent memory for AI agents.
It's not about making AI smarter — it's about making AI remember.

---

## 需要的资产

1. [ ] Hero GIF - 展示 /start → 开发 → /finish-work 流程
2. [ ] Logo - 当前已有 trellis.png
3. [ ] Badges - npm version, license, stars

---

## 待决策

1. **Slogan**: 确认 "The workflow layer your AI agents are missing"？
2. **Hero image vs GIF**: 目前没有 GIF，是用现有 PNG 还是需要录制？
3. **中文版本**: 保留 README-zh.md 链接？
4. **Acknowledgments**: 保留还是简化？
