# Feature: fix-template-dogfood

## Overview

修正上一个 PR (remove-txt-templates) 的模板 dogfood 逻辑。之前搞反了：把项目特定的文件当模板，反而没迁移真正通用的配置。

## 修正内容

### 1. 应该 Dogfood（用项目自身的）

这些是真正通用的配置，应该从 Trellis 项目自身读取：

| 当前位置 | 应该读取 |
|---------|---------|
| `src/templates/commands/cursor/*.txt` | `.cursor/` |
| `src/templates/commands/claude/*.txt` | `.claude/` |
| `src/templates/scripts/*.sh.txt` | `.trellis/scripts/` ✅ 已完成 |

### 2. 应该保持通用模板

这些是项目特定的规范，不应该 dogfood，应该改回通用 `.txt` 模板：

| 当前问题 | 修正 |
|---------|------|
| 读 `.trellis/structure/backend/` | 改回 `src/templates/markdown/structure/backend/*.md.txt` |
| 读 `.trellis/structure/frontend/` | 改回 `src/templates/markdown/structure/frontend/*.md.txt` |
| 读 `.trellis/structure/guides/` | 改回 `src/templates/markdown/guides/*.md.txt` |
| 读 `.trellis/workflow.md` | 改回 `src/templates/markdown/workflow.md.txt` |

## 实现步骤

### Step 1: 恢复 structure 通用模板

1. 在 `src/templates/markdown/` 下重新创建通用模板文件：
   - `structure/backend/*.md.txt`
   - `structure/frontend/*.md.txt`  
   - `guides/*.md.txt`
   - `workflow.md.txt`

2. 修改 `src/templates/markdown/index.ts`，改回从 `.txt` 模板读取

### Step 2: Dogfood cursor 配置

1. 修改 `src/templates/extract.ts`，添加 `readCursorConfig()` 函数
2. 修改 `src/templates/commands/cursor/index.ts`，从 `.cursor/` 读取
3. 删除 `src/templates/commands/cursor/*.txt` 文件

### Step 3: Dogfood claude 配置

1. 修改 `src/templates/extract.ts`，添加 `readClaudeConfig()` 函数
2. 修改 `src/templates/commands/claude/index.ts`，从 `.claude/` 读取
3. 删除 `src/templates/commands/claude/*.txt` 文件

### Step 4: 更新 copy-templates.js

1. 添加 `.cursor/` → `dist/.cursor/` 复制
2. 添加 `.claude/` → `dist/.claude/` 复制（排除 `hooks/` 下的 `.py` 文件编译产物等）

## 验收标准

- [ ] `trellis init` 命令正常工作
- [ ] `.cursor/` 和 `.claude/` 配置正确复制到目标项目
- [ ] structure 文件使用通用模板（不是 Trellis 项目特定的）
- [ ] `pnpm build` 成功
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过

## 注意事项

1. `.claude/hooks/` 下可能有 `.pyc` 或 `__pycache__` 需要排除
2. `.claude/agents/` 下的 agent 定义文件是通用的，应该复制
3. 确保 `dist/.cursor/` 和 `dist/.claude/` 被包含在 npm 包中
