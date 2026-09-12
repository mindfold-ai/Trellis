# 贡献指南

感谢你对 Trellis 的关注！本文档提供参与项目贡献的指南。

## 贡献方式

### 报告 Bug

提交 Bug 前，请先查看 [已有 Issues](https://github.com/mindfold-ai/Trellis/issues) 避免重复。

报告 Bug 时请包含：
- Trellis 版本 (`trellis --version`)
- Node.js 版本 (`node --version`)
- 操作系统
- 复现步骤
- 预期行为 vs 实际行为
- 相关日志或截图

### 功能建议

欢迎提交功能请求！请开一个 Issue 并包含：
- 功能的清晰描述
- 使用场景 / 解决的问题
- 实现思路（可选）

### 改进文档

文档改进永远受欢迎：
- 修复错别字或表述不清的地方
- 添加示例
- 改进 README 或指南文档

### 贡献代码

欢迎以下类型的代码贡献：
- Bug 修复
- 新功能（请先在 Issue 中讨论）
- 性能优化
- 测试覆盖

## 开发环境设置

### 前置要求

- Node.js 18.17.0+（`packages/cli` 的 `engines.node` 为 `>=18.17.0`）
- pnpm
- Python 3（用于 `.claude/hooks/` 和 `.trellis/scripts/` 工作流脚本）
- POSIX shell（用于 Husky pre-commit hook 和两个 `.sh` 辅助脚本）

### 开始开发

1. **Fork 仓库** 到你的 GitHub 账号

2. **克隆你的 Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Trellis.git
   cd Trellis
   ```

3. **安装依赖**
   ```bash
   pnpm install
   ```

4. **构建项目**
   ```bash
   pnpm build
   ```

### 运行检查

```bash
pnpm lint                                   # 两个包的 TypeScript ESLint 检查
pnpm typecheck                              # TypeScript 类型检查
pnpm --filter @mindfoldhq/trellis lint:py   # Python 类型检查 (basedpyright)
pnpm --filter @mindfoldhq/trellis lint:all  # CLI 包的 ESLint + basedpyright
```

> **注意：** `lint:py` 和 `lint:all` 定义在 `packages/cli` 中，从仓库根目录运行需要加 `--filter` 前缀。

> **注意：** 提交时 pre-commit hook 会自动对暂存的 `packages/cli/src/**/*.ts` 文件运行 `eslint --fix` 和 `prettier --write`。

## 项目结构

```
Trellis/
├── packages/
│   ├── cli/                # @mindfoldhq/trellis - CLI
│   │   └── src/
│   │       ├── cli/                # CLI 入口
│   │       ├── commands/           # CLI 命令 (init, update)
│   │       ├── configurators/      # 模板应用逻辑
│   │       ├── migrations/         # 版本迁移清单
│   │       ├── templates/          # 安装到用户项目的模板 ←
│   │       └── utils/              # 工具函数
│   └── core/               # @mindfoldhq/trellis-core - channel、mem、task
├── .claude/                # Claude Code 配置（项目自用）←
│   ├── agents/             # Agent 定义
│   ├── commands/           # 斜杠命令
│   └── hooks/              # Python Hook 脚本
├── .trellis/               # Trellis 工作流（项目自用）←
│   ├── scripts/            # Python 脚本
│   └── spec/               # Spec 文件模板
└── docs-site/              # 文档（git 子模块）
```

> **重要：** 修改 `.claude/`、`.trellis/` 或 `.cursor/` 时，请检查是否需要同步更新 `packages/cli/src/templates/`。项目使用自己的配置文件，但模板才是安装到用户项目的内容。

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
type(scope): description
```

**类型：**
- `feat` - 新功能
- `fix` - Bug 修复
- `docs` - 文档变更
- `refactor` - 代码重构
- `test` - 添加或更新测试
- `chore` - 维护任务

**示例：**
```
feat(cli): add --dry-run flag to init command
fix(hooks): resolve context injection for nested tasks
docs(readme): update quick start instructions
```

## Pull Request 流程

1. **从 `main` 创建分支**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **进行修改**，遵循提交规范

3. **确保检查通过**
   ```bash
   pnpm lint && pnpm typecheck
   ```

4. **推送到你的 Fork**
   ```bash
   git push origin feat/your-feature-name
   ```

5. **向 `main` 分支发起 Pull Request**
   - 提供清晰的变更描述
   - 关联相关 Issue
   - UI 变更请附截图

6. **根据反馈进行修改**

## 感谢

每一份贡献都让 Trellis 变得更好。感谢你的付出！
