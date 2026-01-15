# PRD: OpenCode Support for Trellis

## Background

Trellis 目前仅支持 Claude Code（通过 `.claude/` 目录配置）。为了让更多用户能够使用 Trellis 的 AI 辅助开发工作流，需要适配 [OpenCode](https://opencode.ai/) —— 一个开源的终端 AI 编码助手。

## Goal

让 Trellis 同时支持 Claude Code 和 OpenCode，用户可以根据自己的偏好选择使用哪个工具。

## OpenCode 配置格式研究

### 配置文件位置

| 类型 | Claude Code | OpenCode |
|------|-------------|----------|
| 项目配置 | `.claude/` | `.opencode/` |
| 全局配置 | `~/.claude/` | `~/.config/opencode/` |
| 规则/指令文件 | `CLAUDE.md` | `AGENTS.md` |

### OpenCode 核心配置

1. **AGENTS.md** - 项目根目录，包含项目规则和指令（类似 CLAUDE.md）
2. **.opencode.json** - JSON 配置文件，支持：
   - `instructions`: 可引用外部文件 `["docs/guidelines.md", "packages/*/AGENTS.md"]`
   - `agents`: 自定义 agent 配置
   - `mcpServers`: MCP 服务器配置
3. **.opencode/commands/** - 自定义命令（Markdown 文件）
4. **.opencode/agent/** - 自定义 agent（Markdown + YAML frontmatter）

### OpenCode Agent 格式

```markdown
---
description: Agent 用途描述
mode: primary|subagent|all
model: claude-3.7-sonnet (可选)
tools:
  bash: true|false
  write: true|false
permission:
  bash: allow|ask|deny
---
System prompt 内容...
```

## 适配方案

### Phase 1: 基础支持

1. **创建 AGENTS.md**
   - 从现有 CLAUDE.md 转换或新建
   - 包含项目基本规则和工作流指引

2. **创建 .opencode/ 目录结构**
   ```
   .opencode/
   ├── commands/           # 自定义命令
   │   ├── start.md
   │   ├── finish-work.md
   │   └── ...
   └── agent/              # 自定义 agent（可选）
       ├── implement.md
       ├── check.md
       └── debug.md
   ```

3. **创建 .opencode.json**
   - 配置 instructions 引用 `.trellis/structure/` 下的文档
   - 配置项目特定设置

### Phase 2: 命令迁移

将 `.claude/commands/` 下的命令迁移到 `.opencode/commands/`：

| Claude Code | OpenCode |
|-------------|----------|
| `.claude/commands/start.md` | `.opencode/commands/start.md` |
| `.claude/commands/finish-work.md` | `.opencode/commands/finish-work.md` |
| ... | ... |

### Phase 3: Agent 适配（可选）

如果需要自定义 agent 行为，创建 `.opencode/agent/` 下的 agent 文件。

## 实现范围

### In Scope

- [ ] 创建 AGENTS.md（项目规则文件）
- [ ] 创建 .opencode/ 目录结构
- [ ] 迁移核心命令到 .opencode/commands/
- [ ] 创建 .opencode.json 配置
- [ ] 更新文档说明如何使用 OpenCode

### Out of Scope

- 自动同步 Claude Code 和 OpenCode 配置
- OpenCode 特有功能的深度集成（如 LSP）
- 移除 Claude Code 支持

## 验证标准

1. 用户可以用 `opencode` 启动并使用 Trellis 工作流
2. `/start`、`/finish-work` 等核心命令可用
3. 项目结构和指南文档被正确加载

## 参考资料

- [OpenCode 官网](https://opencode.ai/)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [OpenCode 文档 - Rules](https://opencode.ai/docs/rules)
- [OpenCode 文档 - Agents](https://opencode.ai/docs/agents)
