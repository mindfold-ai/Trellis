# 更新 Slash Commands, Workflow 文档和 Hooks

## 背景

Shell-to-CLI 迁移完成后，很多文档和 hooks 还在引用旧的 shell 脚本命令。需要统一更新为新的 `trellis` CLI 命令。

## 影响范围

### 1. 本项目文件

| 类型 | 文件 | 需要更新 |
|------|------|---------|
| Workflow | `.trellis/workflow.md` | shell 命令 → CLI 命令 |
| Slash Commands | `.claude/commands/*.md` | shell 脚本引用 → CLI 命令 |
| Hooks | `.claude/hooks/*.py` | 可能需要更新 |
| Settings | `.claude/settings.json` | hook 配置检查 |
| Agents | `.claude/agents/*.md` | shell 脚本引用 |

### 2. 模板文件（用于 `trellis init`）

| 类型 | 文件 | 需要更新 |
|------|------|---------|
| Workflow | `src/templates/trellis/workflow.md` | shell → CLI |
| Slash Commands | `src/templates/claude/commands/*.md` | shell → CLI |
| Hooks | `src/templates/claude/hooks/*.py` | 检查是否需要更新 |
| Settings | `src/templates/claude/settings.json` | hook 配置 |
| Agents | `src/templates/claude/agents/*.md` | shell → CLI |

## 命令映射

| 旧命令 (Shell) | 新命令 (CLI) |
|---------------|-------------|
| `./.trellis/scripts/task.sh create` | `trellis task create` |
| `./.trellis/scripts/task.sh list` | `trellis task list` |
| `./.trellis/scripts/task.sh archive` | `trellis task archive` |
| `./.trellis/scripts/init-developer.sh` | `trellis developer init` |
| `./.trellis/scripts/get-developer.sh` | `trellis developer get` |
| `./.trellis/scripts/get-context.sh` | `trellis context` |
| `./.trellis/scripts/add-session.sh` | 保留（暂未迁移） |
| `./.trellis/scripts/multi-agent/*` | 保留（待 pipeline 任务迁移） |

## 实施步骤

### Phase 1: 审计现有文件
- [ ] 列出所有引用 shell 脚本的文件
- [ ] 确定哪些需要更新

### Phase 2: 更新本项目文件
- [ ] `.trellis/workflow.md`
- [ ] `.claude/commands/*.md`
- [ ] `.claude/hooks/*.py`（如需）
- [ ] `.claude/agents/*.md`

### Phase 3: 更新模板文件
- [ ] `src/templates/trellis/workflow.md`
- [ ] `src/templates/claude/commands/*.md`
- [ ] `src/templates/claude/hooks/*.py`（如需）
- [ ] `src/templates/claude/agents/*.md`

### Phase 4: 验证
- [ ] `pnpm build` 通过
- [ ] 新项目 `trellis init` 后文档正确
- [ ] Slash commands 可用

## 注意事项

1. **保留 multi-agent 脚本引用**：`multi-agent/` 脚本还未迁移，保持原样
2. **保留 add-session.sh 引用**：session 记录脚本还未迁移
3. **同步更新**：本项目和模板要保持一致
