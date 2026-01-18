# Plan: Backward Compatibility & Update System

## 深度分析：为什么会有不一致的升级机制？

### 现有机制的来源

| 机制 | 设计目的 | 目标用户 |
|------|----------|----------|
| `upgrade.sh` | 从本地源码升级 | Trellis 开发者/贡献者 |
| `trellis init --force` | 重新初始化 | 首次安装或重置 |
| `trellis init --skip-existing` | 补充缺失文件 | 首次安装的容错 |
| `trellis update` | 升级现有安装 | 普通用户（未实现） |

**问题根源**：这些机制是在不同时期、为不同目的创建的，没有统一设计。

### Trellis 的分发模型

```
npm install -g @mindfoldhq/trellis   # 安装 CLI + 模板
                    ↓
trellis init                          # 复制模板到项目
                    ↓
npm update @mindfoldhq/trellis        # 更新 CLI + 模板
                    ↓
trellis update                        # 应用新模板（缺失！）
```

用户已经熟悉 `npm update`，但缺少最后一步。

---

## 从用户角度思考：理想的升级体验

### 用户心智模型

```
"我的项目用 Trellis 1.0，现在 Trellis 1.1 发布了，我想升级"
```

用户期望：
1. **一个命令**：`trellis update`
2. **自动化**：不需要知道文件在哪里
3. **安全**：不会丢失我填写的内容
4. **透明**：告诉我发生了什么
5. **可回滚**：出问题能恢复

### 文件处理范围

| 类型 | 处理方式 |
|------|----------|
| **可更新文件**（`scripts/`, `hooks/`, `commands/`, `agents/`, `guides/`） | 比较内容，有变化则询问 |
| **保护文件**（`agent-traces/`, `.developer`, `structure/frontend/`, `structure/backend/`） | 永不触碰 |

**变化检测**：直接比较文件文本内容，简单可靠。

---

## 设计方案：统一的升级架构

### 设计原则

1. **单一入口**：`trellis update` 是用户唯一需要的命令
2. **默认安全**：永不丢失用户数据
3. **透明操作**：显示将要发生的变化
4. **渐进式**：支持 dry-run 和手动确认

### 统一的冲突处理策略

**核心原则**：永不强制覆盖用户文件（除非使用 `--force`）

**文件处理逻辑**（简单直接）：

```
对于每个模板文件：
  如果是保护目录 (agent-traces/, .developer) → 跳过，永不触碰
  如果文件不存在 → 添加
  如果文件存在且内容相同 → 跳过（无需更新）
  如果文件存在且内容不同 → 询问用户
```

**冲突时的选项**：

```
.claude/commands/start.md has changes.

  [1] Overwrite - Replace with new version
  [2] Skip - Keep your current version
  [3] Create copy - Save new version as start.md.new
  [4] View diff - Show what changed

Your choice [2]:
```

**批量处理**：
```
  [a] Apply same choice to all remaining conflicts
```

**默认行为**：跳过（保护用户内容）

**不需要签名/哈希**：直接比较文件文本内容，简单可靠。

### init vs update 的职责划分

```
trellis init                    trellis update
─────────────────────────────   ─────────────────────────────
• 创建 .trellis/ 目录            • 更新 scripts/
• 询问工具选择                    • 更新 hooks/
• 询问开发者名称                  • 更新 commands/ (检测修改)
• 创建 agent-traces/{name}/      • 更新 agents/ (检测修改)
• 创建 bootstrap feature         • 更新 guides/
• 首次运行                        • 保护用户数据
                                 • 显示变更摘要
```

### 简化后的命令体系

**两个升级场景，两个工具**：

| 场景 | 命令 | 说明 |
|------|------|------|
| 用户升级项目 | `trellis update` | 从 npm 包读取最新模板 |
| 开发者测试本地分支 | `upgrade.sh` | 从本地源码路径读取 |

**为什么需要 upgrade.sh？**
- 开发者在 Trellis 仓库内开发新功能
- 想在其他项目测试当前分支的改动
- 运行 `upgrade.sh /path/to/Trellis` 直接用本地代码更新

**命令总结**：
```
trellis init               # 首次初始化
trellis update             # 从 npm 升级（普通用户）
./.trellis/scripts/upgrade.sh <path>  # 从本地升级（开发者测试用）
```

**移除**：
- `trellis init --force` → 改为 `trellis init --reset`（需要确认）
- `trellis init --skip-existing` → 不再需要（update 命令处理）

---

## 实现计划

### Phase 1: 核心 update 命令

**新建文件**：

| 文件 | 内容 |
|------|------|
| `src/commands/update.ts` | update 命令主逻辑 |

**update.ts 核心流程**：

```typescript
export async function update(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();

  // 1. 验证 Trellis 已初始化
  if (!fs.existsSync(path.join(cwd, ".trellis"))) {
    throw new Error("Trellis not initialized. Run 'trellis init' first.");
  }

  // 2. 分析变更（分类文件）
  const changes = await analyzeChanges(cwd);
  // changes = { newFiles, unchangedFiles, changedFiles, protectedFiles }

  // 3. 显示变更摘要
  printChangeSummary(changes);

  // 4. dry-run 模式到此为止
  if (options.dryRun) {
    console.log(chalk.gray("\n[Dry run] No changes made."));
    return;
  }

  // 5. 确认继续
  if (!await confirm("Proceed?")) return;

  // 6. 创建备份
  await createBackup(cwd);

  // 7. 添加新文件（无冲突）
  for (const file of changes.newFiles) {
    await writeFile(file.path, file.content);
  }

  // 8. 处理有变化的文件（逐个询问）
  for (const file of changes.changedFiles) {
    const action = await promptConflictResolution(file, options);
    // action: "overwrite" | "skip" | "create-new"

    if (action === "overwrite") {
      await writeFile(file.path, file.newContent);
    } else if (action === "create-new") {
      await writeFile(file.path + ".new", file.newContent);
    }
    // "skip" = do nothing
  }

  // 9. 更新版本记录
  await updateVersionFile(cwd);

  // 10. 显示总结
  printUpdateSummary(results);
}
```

**命令行选项**：

```bash
trellis update              # 交互式更新（默认）
trellis update --dry-run    # 预览变更，不执行
trellis update --force      # 所有冲突都选择覆盖
trellis update --skip-all   # 所有冲突都选择跳过
trellis update --create-new # 所有冲突都创建 .new 副本
```

### Phase 2: 版本检查集成

**在 CLI 启动时检查**（类似 npm 的更新提示）

```typescript
// src/cli/index.ts
async function checkForUpdates(cwd: string): Promise<void> {
  const versionFile = path.join(cwd, ".trellis", ".version");

  if (!fs.existsSync(versionFile)) return;

  const installed = fs.readFileSync(versionFile, "utf-8").trim();

  if (installed !== VERSION) {
    console.log(chalk.yellow(`\n⚠️  Trellis update available: ${installed} → ${VERSION}`));
    console.log(chalk.gray(`   Run: trellis update\n`));
  }
}

// 在 program.parse() 之前调用
checkForUpdates(process.cwd());
```

**为什么不放在 get-context.sh？**
- get-context.sh 的输出会进入 AI 上下文窗口
- 版本提示不应该污染 AI 的上下文
- 在终端显示给用户即可

**在 init 时写入版本**：

```typescript
// init.ts
await writeFile(
  path.join(cwd, ".trellis", ".version"),
  VERSION
);
```

---

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/commands/update.ts` | 新建 | update 命令实现 |
| `src/cli/index.ts` | 修改 | 接入 update 命令 + 版本检查 |
| `src/commands/init.ts` | 修改 | 写入 .version 文件 |

---

## 用户体验示例

```
$ trellis update

Trellis Update
══════════════

Current version: 1.0.0
Available version: 1.1.0

Scanning for changes...

  New files (will add):
    + .claude/commands/new-command.md
    + .trellis/scripts/new-script.sh

  Unchanged files (will skip):
    ○ .claude/commands/start.md
    ○ .claude/agents/implement.md

  Changed files (need your decision):
    ? .trellis/scripts/feature.sh
    ? .claude/commands/check-backend.md

  Protected (never touched):
    ○ .trellis/agent-traces/
    ○ .trellis/structure/

Proceed? [Y/n] y

Adding new files... ✓

--- Resolving conflicts ---

.trellis/scripts/feature.sh has changes.
  [1] Overwrite    [2] Skip    [3] Create .new    [4] View diff
  Choice [2]: 1
  ✓ Overwritten

.claude/commands/check-backend.md has changes.
  [1] Overwrite    [2] Skip    [3] Create .new    [4] View diff
  Choice [2]: 3
  ✓ Created check-backend.md.new

--- Summary ---

  Added: 2 files
  Updated: 1 file
  Skipped: 1 file (created .new copy)
  Backup: .trellis/.backup-20260118-143022/

✅ Update complete! (1.0.0 → 1.1.0)

Tip: Review .new files and merge changes manually if needed.
```

---

## 验证方法

1. **首次安装验证**
   - `trellis init` 后检查 `.trellis/.version` 存在

2. **更新检测验证**
   - 修改一个模板文件
   - 运行 `trellis update --dry-run`
   - 确认修改的文件显示为 "Changed files"

3. **更新执行验证**
   - 运行 `trellis update`
   - 确认 `agent-traces/` 内容不变
   - 确认有变化的文件询问了用户
   - 确认 `.version` 已更新

4. **版本提示验证**
   - 安装旧版本，更新 npm 包
   - 运行任何 `trellis` 命令（如 `trellis init`）
   - 确认终端显示更新提示（不是在 AI 上下文中）

---

## 与 Feature PRD 的关系

这个计划实现了 `17-backward-compat` feature 中的核心功能。
PRD 中的迁移脚本系统可以作为后续增强（当需要数据迁移时）。

当前计划聚焦于：
- ✅ 版本检测
- ✅ 自动升级命令
- ✅ 用户数据保护
- ⏳ 数据迁移脚本（按需添加）
