# Refactor Command Paths to trellis/ Namespace

## Goal

将所有 Trellis 提供的 slash commands 从扁平目录结构迁移到 `trellis/` 命名空间子目录，使命令调用从 `/start` 变为 `/trellis:start`，与业界惯例（OpenSpec 的 `/openspec:*`、Spec-Kit 的 `/speckit:*`）保持一致。

## Why

1. **品牌识别** - 用户一眼就能识别这是 Trellis 提供的命令
2. **避免冲突** - 用户自定义命令不会与 Trellis 命令冲突
3. **符合业界惯例** - OpenSpec、Spec-Kit 等项目都采用类似的命名空间模式
4. **可扩展性** - 为将来添加更多命令类别预留空间

## Requirements

### 1. 目录结构变更

**Before:**
```
.claude/commands/
├── start.md
├── finish-work.md
└── ...

.cursor/commands/
├── start.md
├── finish-work.md
└── ...
```

**After:**
```
.claude/commands/
└── trellis/
    ├── start.md          # 调用: /trellis:start
    ├── finish-work.md    # 调用: /trellis:finish-work
    └── ...

.cursor/commands/
└── trellis/
    ├── start.md          # 调用: /trellis:start
    ├── finish-work.md    # 调用: /trellis:finish-work
    └── ...
```

### 2. 命令重命名映射

| 旧命令 | 新命令 |
|--------|--------|
| `/start` | `/trellis:start` |
| `/finish-work` | `/trellis:finish-work` |
| `/record-session` | `/trellis:record-session` |
| `/parallel` | `/trellis:parallel` |
| `/before-frontend-dev` | `/trellis:before-frontend-dev` |
| `/before-backend-dev` | `/trellis:before-backend-dev` |
| `/check-frontend` | `/trellis:check-frontend` |
| `/check-backend` | `/trellis:check-backend` |
| `/check-cross-layer` | `/trellis:check-cross-layer` |
| `/break-loop` | `/trellis:break-loop` |
| `/create-command` | `/trellis:create-command` |
| `/integrate-skill` | `/trellis:integrate-skill` |
| `/update-spec` | `/trellis:update-spec` |
| `/onboard` | `/trellis:onboard` |

## Implementation Plan

### Phase 1: 文件移动

移动模板文件到 trellis/ 子目录：

```bash
# Claude commands (14 files)
src/templates/claude/commands/*.md → src/templates/claude/commands/trellis/*.md

# Cursor commands (13 files)
src/templates/cursor/commands/*.md → src/templates/cursor/commands/trellis/*.md
```

### Phase 2: TypeScript 代码修改

| 文件 | 行号 | 修改 |
|------|------|------|
| `src/templates/claude/index.ts` | 66 | `listFiles("commands")` → `listFiles("commands/trellis")` |
| `src/templates/claude/index.ts` | 71 | `` `commands/${file}` `` → `` `commands/trellis/${file}` `` |
| `src/templates/cursor/index.ts` | 44 | `listFiles("commands")` → `listFiles("commands/trellis")` |
| `src/templates/cursor/index.ts` | 49 | `` `commands/${file}` `` → `` `commands/trellis/${file}` `` |
| `src/commands/update.ts` | 224 | `.claude/commands/${name}.md` → `.claude/commands/trellis/${name}.md` |
| `src/commands/update.ts` | 230 | `.cursor/commands/${name}.md` → `.cursor/commands/trellis/${name}.md` |
| `src/templates/extract.ts` | 134, 145 | 更新文档注释中的路径示例 |

### Phase 3: Python Hooks 修改

**inject-subagent-context.py** (两个位置: `.claude/hooks/` 和 `src/templates/claude/hooks/`)

| 行号 | 修改 |
|------|------|
| 328-331 | 更新 check_files 列表中的路径 |
| 372, 375 | 更新 finish-work.md 路径 |
| 411-413 | 更新 check_files 列表中的路径 |

**session-start.py** (两个位置)

| 行号 | 修改 |
|------|------|
| 112 | `commands / "start.md"` → `commands / "trellis" / "start.md"` |

### Phase 4: Shell 脚本修改

**task.sh** (两个位置: `.trellis/scripts/` 和 `src/templates/trellis/scripts/`)

| 行号 | 修改 |
|------|------|
| 90 | `.claude/commands/finish-work.md` → `.claude/commands/trellis/finish-work.md` |
| 95, 108 | `.claude/commands/check-backend.md` → `.claude/commands/trellis/check-backend.md` |
| 98, 111 | `.claude/commands/check-frontend.md` → `.claude/commands/trellis/check-frontend.md` |

**create-bootstrap.sh** (两个位置)

| 行号 | 修改 |
|------|------|
| 163 | `/before-*-dev` → `/trellis:before-*-dev` |
| 164 | `/check-*` → `/trellis:check-*` |

### Phase 5: Markdown 文档批量替换

使用 sed 或脚本进行批量替换：

```bash
# 替换规则 (注意顺序，先替换长的避免误替换)
/before-frontend-dev → /trellis:before-frontend-dev
/before-backend-dev → /trellis:before-backend-dev
/check-cross-layer → /trellis:check-cross-layer
/record-session → /trellis:record-session
/integrate-skill → /trellis:integrate-skill
/create-command → /trellis:create-command
/check-frontend → /trellis:check-frontend
/check-backend → /trellis:check-backend
/finish-work → /trellis:finish-work
/break-loop → /trellis:break-loop
/update-spec → /trellis:update-spec
/parallel → /trellis:parallel
/onboard → /trellis:onboard
/start → /trellis:start
```

**需要处理的文件**:

1. **README 文件**
   - `README.md`
   - `README_CN.md`
   - `AGENTS.md`

2. **文档目录**
   - `docs/guide.md`
   - `docs/guide-zh.md`

3. **Workflow 文档**
   - `.trellis/workflow.md`
   - `src/templates/trellis/workflow.md`

4. **Spec 文件**
   - `.trellis/spec/backend/logging-guidelines.md`

5. **模板 Markdown**
   - `src/templates/markdown/agents.md`

6. **Command 文件本身** (互相引用)
   - `src/templates/claude/commands/trellis/*.md` (14 files)
   - `src/templates/cursor/commands/trellis/*.md` (13 files)

### Phase 6: 项目自身 .claude/.cursor 目录更新

由于 Trellis 项目自身也使用这些命令（dogfooding），需要同步更新：

```bash
# 移动文件
.claude/commands/*.md → .claude/commands/trellis/*.md
.cursor/commands/*.md → .cursor/commands/trellis/*.md
```

## Acceptance Criteria

- [ ] 所有命令文件移动到 `commands/trellis/` 子目录
- [ ] TypeScript 代码能正确读取和写入新路径
- [ ] Python hooks 能正确引用新路径下的文件
- [ ] Shell 脚本中的路径引用更新完成
- [ ] 所有文档中的命令引用更新为 `/trellis:*` 格式
- [ ] `trellis init` 在新项目中生成正确的目录结构
- [ ] `trellis update` 能正确更新现有项目的命令文件
- [ ] Lint 和 TypeCheck 通过
- [ ] 项目自身的 .claude/.cursor 目录同步更新

## Technical Notes

### 注意事项

1. **替换顺序很重要** - 先替换长命令名避免误替换（如 `/check-frontend` 要在 `/check` 之前）
2. **不要替换路径中的斜杠** - `.claude/commands/` 中的 `/` 不是命令前缀
3. **保留历史记录** - `.trellis/workspace/*/journal-*.md` 中的历史记录可以不更新
4. **模板和运行时同步** - `src/templates/` 和项目根目录的文件要同步修改

### 文件统计

| 类型 | 文件数 | 预估修改点 |
|------|--------|-----------|
| 文件移动 | 27 | - |
| TypeScript | 5 | ~10 |
| Python Hooks | 4 | ~20 |
| Shell Scripts | 4 | ~10 |
| Markdown 文档 | 40+ | 300+ |
| **总计** | **80+** | **340+** |

## Migration Guide (for existing users)

用户升级到新版本后，需要运行：

```bash
trellis update
```

这会自动将 `.claude/commands/*.md` 和 `.cursor/commands/*.md` 迁移到新的 `trellis/` 子目录结构。
