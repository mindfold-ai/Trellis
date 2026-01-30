# 多平台 AI IDE 支持 - OpenCode/Codex 原生适配

## 背景

当前 Trellis 仅完整支持 Claude Code，但市场上存在多个 AI IDE：
- **OpenCode** (sst/opencode) - 支持 Hook 插件系统和 Sub-Agent
- **Codex CLI** (OpenAI) - 目前不支持 Hook，但有 Skills 系统

扩展多平台支持可以：
1. 扩大用户群体
2. 降低对单一平台的依赖
3. 验证 Trellis 工作流的通用性

## 前置依赖

**必须先完成**: `01-30-cli-commands-expansion`（CLI 命令扩展）

原因：
- 上层 AI IDE 适配最终需要调用底层功能
- 如果底层是 bash 脚本，跨平台适配会受限
- CLI 化后，适配层只需调用统一的 `trellis` 命令

## 目标

1. **OpenCode 完整支持** - 实现与 Claude Code 同等功能
2. **Codex 基础支持** - 在其功能限制下提供最大支持
3. **统一配置体验** - `trellis init --opencode` / `trellis init --codex`

## 平台功能对比

| 功能 | Claude Code | OpenCode | Codex CLI |
|------|-------------|----------|-----------|
| Hook 系统 | ✅ PreToolUse/PostToolUse | ✅ Plugin before/after | ❌ 未实现 |
| Sub-Agent | ✅ Task tool | ✅ 原生支持 | ❌ 单 Agent |
| Session 管理 | ✅ --session-id | ✅ --session | ✅ --resume |
| 非交互模式 | ✅ -p/--print | ✅ run -q | ✅ exec |
| Slash Commands | ✅ .claude/commands/ | ✅ .opencode/command/ | ✅ .codex/prompts/ |
| 配置文件 | settings.json | opencode.json | config.toml |
| Instructions | CLAUDE.md | AGENTS.md | AGENTS.md |
| MCP 支持 | ✅ | ✅ | ✅ |

## 范围

### Phase 1: OpenCode 适配（本任务核心）

#### 1.1 配置器实现

完善 `src/configurators/opencode.ts`：

```typescript
export async function configureOpenCode(cwd: string): Promise<void> {
  // 创建 .opencode/ 目录结构
  // 复制/转换命令模板
  // 生成 opencode.json
}
```

#### 1.2 目录结构映射

| Claude Code | OpenCode | 说明 |
|-------------|----------|------|
| `.claude/commands/` | `.opencode/command/` | Slash commands |
| `.claude/agents/` | `.opencode/agent/` | Agent 定义 |
| `.claude/hooks/` | `.opencode/plugin/` | Hook → Plugin |
| `.claude/settings.json` | `opencode.json` | 配置 |
| `CLAUDE.md` | `AGENTS.md` | Instructions |

#### 1.3 Hook 转 Plugin

Claude Code Hook (Python):
```python
# .claude/hooks/context-injector.py
def pre_tool_use(tool_name, input):
    if tool_name == "Task":
        inject_context(input)
```

OpenCode Plugin (TypeScript):
```typescript
// .opencode/plugin/context-injector.ts
export const ContextInjector: Plugin = async ({ client }) => ({
  tool: {
    Task: {
      before: async (input) => {
        return injectContext(input);
      }
    }
  }
});
```

#### 1.4 模板目录

创建 `src/templates/opencode/`：
```
src/templates/opencode/
├── command/
│   └── trellis/           # 对应 claude/commands/trellis/
├── agent/
│   └── *.md               # Agent 定义
├── plugin/
│   └── *.ts               # Plugin 实现
└── opencode.json          # 基础配置
```

### Phase 2: Codex 基础适配

由于 Codex 缺少 Hook 系统，采用降级策略：

#### 2.1 Skills 替代 Commands

```markdown
<!-- .codex/skills/trellis-start.md -->
# Trellis Start Session

When starting work, run:
\`\`\`bash
trellis context
trellis task list
\`\`\`

Follow the output to understand current context.
```

#### 2.2 无 Hook 工作流

- 依赖用户手动调用 slash commands
- Context injection 改为命令输出，而非自动注入
- Multi-agent pipeline 需要手动编排

#### 2.3 配置器

```typescript
// src/configurators/codex.ts
export async function configureCodex(cwd: string): Promise<void> {
  // 创建 .codex/ 目录
  // 生成 Skills (SKILL.md 格式)
  // 生成 AGENTS.md
}
```

### 不在范围内

- Cursor 支持（已有）
- Windsurf/Continue 等其他 IDE
- Hook 系统重新设计（保持现有架构）

## 技术设计

### CLI 集成

```bash
# 初始化时选择平台
trellis init --opencode        # OpenCode 配置
trellis init --codex           # Codex 配置
trellis init --claude          # Claude Code（默认）
trellis init --cursor          # Cursor
trellis init --all             # 全部平台

# 更新时同步
trellis update                 # 更新所有已配置平台
```

### 模板转换逻辑

```typescript
// src/utils/template-converter.ts

// Command 格式转换
export function convertCommand(
  source: 'claude' | 'opencode' | 'codex',
  target: 'claude' | 'opencode' | 'codex',
  content: string
): string;

// Hook/Plugin 转换
export function convertHookToPlugin(
  pythonHook: string
): string;  // 生成 TypeScript plugin

// Agent 定义转换
export function convertAgentDefinition(
  source: 'claude' | 'opencode',
  content: string
): string;
```

### 配置文件生成

#### opencode.json
```json
{
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "mcpServers": {},
  "plugins": [
    "./plugin/context-injector.ts"
  ],
  "instructions": "./AGENTS.md"
}
```

#### .codex/config.toml
```toml
model = "o3"
approval_mode = "suggest"

[history]
persistence = "local"

[sandbox]
enabled = true
```

## 验收标准

### OpenCode 验收

- [ ] `trellis init --opencode` 生成完整 `.opencode/` 目录
- [ ] Slash commands 在 OpenCode 中可用
- [ ] Plugin 系统正常工作（context injection）
- [ ] Multi-agent pipeline 可通过 OpenCode 执行
- [ ] AGENTS.md 生成正确

### Codex 验收

- [ ] `trellis init --codex` 生成 `.codex/` 目录
- [ ] Skills 文件格式正确
- [ ] 基础工作流可用（无自动 context injection）
- [ ] AGENTS.md 生成正确

### 通用验收

- [ ] `trellis update` 正确更新多平台配置
- [ ] 各平台配置不互相干扰
- [ ] 文档更新说明多平台支持

## 实施计划

### 阶段 1: OpenCode 适配

1. 创建 `src/templates/opencode/` 模板目录
2. 实现 `src/configurators/opencode.ts`
3. 转换核心 commands 到 OpenCode 格式
4. 实现 Plugin 版本的 context injector
5. 测试验证

### 阶段 2: Codex 适配

1. 创建 `src/templates/codex/` 模板目录
2. 实现 `src/configurators/codex.ts`
3. 创建 Skills 模板
4. 测试验证（需关注 Hook 缺失的影响）

### 阶段 3: 文档和优化

1. 更新 README 说明多平台支持
2. 创建各平台使用指南
3. 收集反馈优化

## 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenCode API 变化 | 适配失效 | 关注 OpenCode 更新，版本锁定 |
| Codex 功能受限 | 用户体验差距 | 明确文档说明限制，等待 Codex 功能完善 |
| 维护成本增加 | 多平台同步困难 | 统一模板源，自动化转换 |

## 参考

- OpenCode: https://github.com/sst/opencode
- Codex CLI: https://github.com/openai/codex
- 现有 Claude 配置: `.claude/`
- 现有 Cursor 配置: `.cursor/`
