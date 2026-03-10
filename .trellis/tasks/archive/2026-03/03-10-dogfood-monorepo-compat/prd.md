# Dogfooding: 本项目 slash command 和 hook 适配检查

## Goal

确保 Trellis 主仓库自身的 `.claude/` dotfiles（dogfooding 版）与 CLI 模板源码（`packages/cli/src/templates/`）保持同步，特别是近期 monorepo 适配后新增/修改的命令和 hook 逻辑。

## Background

Trellis 主仓库的 `.claude/commands/trellis/` 已经做过 monorepo 适配（动态 spec 发现、generic `before-dev`/`check` 替代 type-specific 命令），但 CLI 模板源码还是单仓模式。这次不是让模板支持 monorepo（那是 `03-10-monorepo-compat` 的事），而是：

1. 把 `03-06-hook-start-equiv` 的改动同步到本项目 dotfiles
2. 确认本项目 dotfiles 没有引用不存在的文件/路径
3. 确保 `trellis update` 不会把本项目的 monorepo 适配覆盖掉（依赖 `03-06-update-skip-dirs`）

## Requirements

### R1: hook-start-equiv 改动同步到本项目

`03-06-hook-start-equiv` 会修改模板中的 `session-start.py` 和 `start.md`。改完后需要把同样的逻辑同步到本项目的：
- `.claude/hooks/session-start.py`
- `.claude/commands/trellis/start.md`

### R2: 路径引用一致性检查

扫描所有 `.claude/` 文件中引用的 `.trellis/spec/` 路径，确认它们在本项目中实际存在：
- `spec/guides/index.md` → 是否存在？
- `spec/guides/cross-layer-thinking-guide.md` → 是否存在？
- `spec/guides/code-reuse-thinking-guide.md` → 是否存在？
- `spec/guides/pre-implementation-checklist.md` → 是否存在？

### R3: update 保护（依赖 update-skip-dirs）

`03-06-update-skip-dirs` 完成后，在 `config.yaml` 中配置 `update.skip` 保护本项目的 monorepo 定制文件，防止 `trellis update` 覆盖。

## Acceptance Criteria

- [ ] hook-start-equiv 的 session-start.py task 状态检查逻辑同步到本项目
- [ ] 所有 `.claude/` 文件中引用的 spec 路径在本项目中实际存在
- [ ] `trellis update` 不会覆盖本项目的 monorepo 定制（需 update-skip-dirs 先完成）

## Dependencies

- 03-06-hook-start-equiv（R1 来源）
- 03-06-update-skip-dirs（R3 依赖）

## Technical Notes

- 这个 task 应该在 hook-start-equiv 和 update-skip-dirs **之后**做
- 执行顺序：hook-start-equiv → update-skip-dirs → dogfood-monorepo-compat → 发版
