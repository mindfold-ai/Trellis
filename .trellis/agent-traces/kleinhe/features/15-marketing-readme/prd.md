# PRD: Trellis README 与对外宣传优化

## 背景

Trellis 作为一个新兴的 AI 开发工作流框架，需要优化对外宣传材料（主要是 README），以便更好地向潜在用户展示项目价值。

## 目标

参考业界知名 AI 编码工具的宣传模式，重新设计 Trellis 的 README，提升项目的专业形象和用户转化率。

## 调研结果

详见 [research-readme-patterns.md](./research-readme-patterns.md)

### 调研项目

| 项目 | Stars | 特点 |
|------|-------|------|
| Claude Code | 56.8k | Anthropic 官方，简洁专业 |
| Cline | 56.9k | 功能截图丰富，企业版入口 |
| Aider | 39.8k | 用户好评墙，详细文档 |
| OpenCode | 10.1k | 详细表格，键盘快捷键 |
| Continue | 30.9k | 多场景 GIF 演示 |
| Cursor | 32k | 极简风格，引导官网 |

### 关键发现

1. **必须有 GIF 演示** - 所有成功项目首屏都有动图
2. **Slogan 简洁有力** - 4-8 词说清楚是什么
3. **一键安装** - `curl | bash` 或 `npm install -g`
4. **功能图标化** - 图标 + 短句，视觉扫描友好
5. **社区入口明显** - Discord + Issues

## 实施计划

### Phase 1: README 重构 (P0)

- [ ] 设计 Trellis Slogan（一句话定位）
- [ ] 录制核心工作流 GIF（/start → 开发 → /finish-work）
- [ ] 重写 README 结构
  - [ ] 首屏：Logo + Slogan + GIF + 徽章
  - [ ] Features：图标列表
  - [ ] Quick Start：3 步上手
  - [ ] Documentation 链接
  - [ ] Community 链接

### Phase 2: 视觉资产 (P1)

- [ ] 设计/优化 Logo
- [ ] 录制多个功能演示 GIF
  - [ ] 初始化项目
  - [ ] Feature tracking
  - [ ] Agent delegation
- [ ] 制作功能截图

### Phase 3: 社区建设 (P2)

- [ ] 创建 Discord 服务器
- [ ] 建立文档网站（可选）
- [ ] 收集早期用户反馈

### Phase 4: 内容营销 (P3)

- [ ] 撰写介绍博客
- [ ] 录制 YouTube 教程
- [ ] 在 HN/Reddit 发布

## README 目标结构

```markdown
# Trellis

> [Slogan - 待定]

![Demo GIF](./assets/demo.gif)

[![npm](badge)] [![license](badge)] [![discord](badge)]

## What is Trellis?

一段话说明 Trellis 解决什么问题。

## Features

- 📋 Workflow Templates - 预定义的开发工作流命令
- 🤖 Agent Delegation - 委托专业 agent 完成任务
- 📁 Feature Tracking - 功能开发进度追踪
- 📝 Session Context - 跨会话上下文保持
- 🔧 Multi-Tool Support - 支持 Claude Code 和 OpenCode

## Quick Start

1. Install
2. Init
3. Start

## Supported Tools

| Tool | Status |
|------|--------|
| Claude Code | ✅ |
| OpenCode | ✅ |

## Documentation

- Getting Started
- Commands Reference
- Configuration

## Community

- Discord
- GitHub Issues

## License

MIT
```

## Slogan 候选

1. "AI development workflow framework"
2. "Structure your AI coding sessions"
3. "Workflow templates for AI-assisted development"
4. "Make AI coding predictable and repeatable"
5. "The missing workflow layer for AI coding"

## 成功指标

- [ ] README 清晰度：新用户 5 分钟内能理解项目价值
- [ ] 安装转化：README → npm install 的转化率
- [ ] GitHub Stars 增长
- [ ] Discord 成员数

## 参考资料

- [调研报告](./research-readme-patterns.md)
- [Aider README](https://github.com/Aider-AI/aider)
- [Cline README](https://github.com/cline/cline)
