# PRD: Backward Compatibility & Migration System

## Problem Statement

Trellis 目前没有向后兼容机制。当用户升级到新版本时：

1. **无法知道需要迁移什么** - 没有版本检测
2. **无法自动迁移** - 没有迁移命令
3. **数据可能丢失或损坏** - 新版本可能改变数据结构
4. **无法回滚** - 如果升级出问题，没有恢复方式

这对于已有用户来说是一个很大的障碍。

## Goal

设计并实现一套完整的向后兼容系统，让老用户可以：

1. 检测当前版本与目标版本的差异
2. 一键升级到新版本
3. 自动迁移数据和配置
4. 必要时可以回滚

---

## 架构设计

### 1. 版本管理系统

#### 1.1 版本文件设计

**项目版本** (`.trellis/version.json`)：

```json
{
  "version": "1.1.0",
  "schemaVersion": 2,          // 新增：数据 schema 版本
  "minCompatibleVersion": "1.0.0",  // 新增：最低兼容版本
  "name": "Trellis",
  "releaseDate": "2026-01-20"
}
```

**用户数据版本** (`.trellis/.version`)：

```
1.0.0
```

这是一个简单的文本文件，记录用户当前安装的 Trellis 版本。首次运行 `/start` 时自动创建。

#### 1.2 Schema 版本化

为关键数据文件添加 `_schemaVersion` 字段：

**feature.json (schema v2)**:
```json
{
  "_schemaVersion": 2,
  "id": "my-feature",
  "name": "my-feature",
  "status": "planning",
  ...
}
```

Schema 版本独立于 Trellis 版本，只在数据格式变化时递增。

### 2. 迁移系统架构

```
.trellis/
├── migrations/
│   ├── index.sh                 # 迁移入口脚本
│   ├── v1.0.0-to-v1.1.0.sh     # 具体迁移脚本
│   ├── v1.1.0-to-v1.2.0.sh
│   └── README.md               # 迁移开发指南
├── scripts/
│   ├── upgrade.sh              # 升级命令
│   └── ...
└── version.json
```

#### 2.1 迁移脚本规范

每个迁移脚本负责从一个版本升级到下一个版本：

```bash
#!/bin/bash
# v1.0.0-to-v1.1.0.sh
#
# 迁移内容：
# - 为 feature.json 添加 _schemaVersion 字段
# - 重命名 progress-N.md 为 traces-N.md

set -e

TRELLIS_DIR=".trellis"

# 1. 迁移 feature.json 文件
migrate_feature_json() {
    local file="$1"
    # 添加 _schemaVersion: 2
    jq '. + {"_schemaVersion": 2}' "$file" > "${file}.tmp"
    mv "${file}.tmp" "$file"
}

# 2. 重命名进度文件
rename_progress_files() {
    find "$TRELLIS_DIR/agent-traces" -name "progress-*.md" | while read f; do
        new_name=$(echo "$f" | sed 's/progress-/traces-/')
        mv "$f" "$new_name"
    done
}

# 主函数
main() {
    echo "Migrating from v1.0.0 to v1.1.0..."

    # 执行迁移
    find "$TRELLIS_DIR/agent-traces" -name "feature.json" | while read f; do
        migrate_feature_json "$f"
    done

    rename_progress_files

    echo "Migration complete."
}

main "$@"
```

#### 2.2 迁移执行流程

```
用户运行 trellis upgrade
        ↓
检测当前版本 (.trellis/.version)
        ↓
检测目标版本 (.trellis/version.json)
        ↓
确定需要执行的迁移脚本链
例如: v1.0.0 → v1.1.0 → v1.2.0
        ↓
创建备份 (.trellis/backups/2026-01-17_v1.0.0/)
        ↓
依次执行迁移脚本
        ↓
更新用户版本文件 (.trellis/.version)
        ↓
验证迁移结果
        ↓
完成
```

### 3. 升级命令设计

#### 3.1 命令接口

```bash
# 基本用法
trellis upgrade

# 查看会发生什么（不执行）
trellis upgrade --dry-run

# 升级到特定版本
trellis upgrade --to 1.1.0

# 强制升级（跳过确认）
trellis upgrade --force

# 回滚到上一个版本
trellis rollback
```

#### 3.2 命令输出示例

```
$ trellis upgrade

Trellis Upgrade
===============

Current version: 1.0.0
Target version:  1.2.0

Migrations to run:
  1. v1.0.0 → v1.1.0
     - Add _schemaVersion to feature.json
     - Rename progress-*.md to traces-*.md

  2. v1.1.0 → v1.2.0
     - Add relatedIssues field to feature.json
     - Update .developer format

Backup will be created at:
  .trellis/backups/2026-01-17_v1.0.0/

Proceed? [y/N] y

Creating backup...                    ✓
Running migration v1.0.0 → v1.1.0...  ✓
Running migration v1.1.0 → v1.2.0...  ✓
Updating version file...              ✓

Upgrade complete! You are now on v1.2.0
```

### 4. 备份与回滚

#### 4.1 备份策略

升级前自动备份以下内容：

```
.trellis/backups/2026-01-17_v1.0.0/
├── .version
├── .developer
├── .current-feature
└── agent-traces/
    └── {developer}/
        ├── index.md
        ├── traces-*.md
        └── features/
            └── */feature.json
```

#### 4.2 回滚命令

```bash
$ trellis rollback

Available backups:
  1. 2026-01-17_v1.0.0 (2 hours ago)
  2. 2026-01-15_v0.9.0 (2 days ago)

Select backup to restore [1]: 1

Restoring from 2026-01-17_v1.0.0...
  Restoring .version...               ✓
  Restoring agent-traces/...          ✓
  Updating version file...            ✓

Rollback complete! You are now on v1.0.0
```

### 5. 版本检查集成

#### 5.1 /start 命令集成

在 `/start` 命令中添加版本检查：

```bash
# 检查版本
current_version=$(cat .trellis/.version 2>/dev/null || echo "0.0.0")
target_version=$(jq -r '.version' .trellis/version.json)

if version_lt "$current_version" "$target_version"; then
    echo "⚠️  Trellis has been updated!"
    echo "   Current: $current_version"
    echo "   Available: $target_version"
    echo ""
    echo "   Run 'trellis upgrade' to update."
    echo ""
fi
```

#### 5.2 自动迁移选项

可选配置自动迁移：

```json
// .trellis/settings.json
{
  "autoUpgrade": false,  // 默认关闭
  "checkUpdates": true   // 启动时检查更新
}
```

---

## 实现计划

### Phase 1: 基础设施

1. **创建版本文件系统**
   - 更新 `.trellis/version.json` 添加 schemaVersion
   - 创建 `.trellis/.version` 用户版本文件
   - 在 `/start` 中初始化用户版本

2. **创建迁移目录结构**
   - `.trellis/migrations/` 目录
   - `index.sh` 迁移入口
   - `README.md` 开发指南

### Phase 2: 升级命令

1. **实现 `upgrade.sh`**
   - 版本检测逻辑
   - 迁移脚本链计算
   - 备份功能
   - 迁移执行

2. **实现 `/upgrade` 命令**
   - Claude Code 版本
   - OpenCode 版本

### Phase 3: 回滚与安全

1. **实现回滚功能**
   - 备份恢复
   - 版本降级

2. **添加安全检查**
   - 迁移前验证
   - 迁移后验证
   - 错误恢复

### Phase 4: 文档与测试

1. **迁移开发指南**
   - 如何编写迁移脚本
   - 测试迁移脚本

2. **用户文档**
   - 升级指南
   - 常见问题

---

## 验收标准

1. [ ] 用户可以运行 `trellis upgrade` 升级到新版本
2. [ ] 升级前自动创建备份
3. [ ] 支持 `--dry-run` 查看升级内容
4. [ ] 支持 `trellis rollback` 回滚
5. [ ] `/start` 命令会提示版本更新
6. [ ] 迁移脚本可以链式执行（v1.0 → v1.1 → v1.2）
7. [ ] 有完整的迁移开发文档

---

## 设计决策

### 为什么选择文件版本而不是 Git Tag？

1. **独立于 Git** - 用户可能在任何 Git 状态下使用
2. **简单可靠** - 直接读取文件比解析 Git 更简单
3. **支持本地修改** - 用户可能对 Trellis 有本地定制

### 为什么迁移脚本使用 Bash？

1. **一致性** - 与现有脚本（feature.sh 等）保持一致
2. **无依赖** - 不需要额外的运行时（如 Node.js）
3. **透明** - 用户可以直接阅读和理解迁移内容

### 为什么不支持跨大版本迁移？

例如 v1.x → v2.x 可能涉及不兼容的架构变化，应该：
1. 提供专门的迁移指南
2. 要求用户手动处理
3. 保持 minor 版本迁移的简单性

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 迁移脚本有 bug | 数据损坏 | 强制备份、测试覆盖 |
| 用户中断迁移 | 数据不一致 | 事务性迁移、状态文件 |
| 备份占用空间 | 磁盘满 | 自动清理旧备份（保留最近 3 个） |
| 迁移时间过长 | 用户不耐烦 | 显示进度条、支持后台执行 |

---

## 参考资料

- [Django Migrations](https://docs.djangoproject.com/en/4.2/topics/migrations/)
- [Flyway Database Migrations](https://flywaydb.org/)
- [Homebrew Upgrade](https://docs.brew.sh/FAQ#how-do-i-update-my-local-packages)
