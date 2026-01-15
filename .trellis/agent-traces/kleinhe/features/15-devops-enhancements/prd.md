# PRD: DevOps Enhancements

## Background

Trellis 项目目前缺少 pre-commit hooks 和完善的 CI 检查，需要加强 DevOps 工具链以提高代码质量和团队协作效率。

## Goal

建立完善的 DevOps 流程，包括 Git hooks、commit 规范和 CI 增强。

## 现状

| 类别 | 现有配置 | 缺失 |
|------|----------|------|
| Linting | ESLint | - |
| Formatting | Prettier | - |
| Type Check | TypeScript | - |
| CI/CD | 基础 build + publish | CI 不跑 lint/typecheck |
| Git Hooks | 无 | 全部缺失 |
| Commit 规范 | 无 | commitlint |

## 待办事项

### Phase 1: Pre-commit Hooks（优先级高）

- [ ] 安装 Husky - 管理 Git hooks
- [ ] 安装 lint-staged - 只检查暂存的文件
- [ ] 配置 pre-commit hook：
  - 运行 `eslint --fix`
  - 运行 `prettier --write`
  - 运行 `tsc --noEmit`（可选）

### Phase 2: Commit 规范（优先级中）

- [ ] 安装 commitlint - 规范 commit message 格式
- [ ] 配置 commit-msg hook - 校验 commit message
- [ ] 考虑 commitizen - 交互式生成规范 commit（可选）

### Phase 3: CI 流水线增强（优先级中）

- [ ] 在 CI 中添加 lint 检查
- [ ] 在 CI 中添加 typecheck
- [ ] 在 CI 中添加 format 检查

### Phase 4: 其他可选改进（优先级低）

- [ ] 添加 pre-push hook
- [ ] 添加 CODEOWNERS
- [ ] 添加 PR 模板
- [ ] 添加 Issue 模板

## 推荐实现顺序

1. Husky + lint-staged → 立即生效，防止坏代码提交
2. 增强 CI → 作为第二道防线
3. commitlint → 规范团队协作
4. 其他 → 按需添加

## 验收标准

1. `git commit` 时自动运行 lint 和 format 检查
2. 不符合规范的代码无法提交
3. CI 流水线包含完整的代码质量检查
