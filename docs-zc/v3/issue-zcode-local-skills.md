# Issue：ZCode 初始化不应维护 `.agents/skills`，且缺少 `trellis-research` 子代理

## 问题描述

当前 ZCode 版本有自己的项目级技能目录：仓库本地需要手动调用的技能应放在 `.zcode/skills` 下。Trellis 目前初始化 ZCode 时会生成 `.agents/skills`，但不会生成 `.zcode/skills`。

同时，Trellis 的其它子代理平台会生成 `trellis-research`、`trellis-implement`、`trellis-check` 三个子代理，但 ZCode 只生成了 implement/check。工作流里已经把 ZCode 列为可 dispatch `trellis-research` 的平台，因此这是 ZCode 平台模板漏补齐。

这导致三个问题：

- ZCode 当前版本无法稳定手动调用仓库本地 `.agents/skills` 中的 Trellis 技能。
- ZCode 平台初始化逻辑维护了不属于 ZCode 私有体系的 `.agents/skills`。
- ZCode 工作流提示可以使用 `trellis-research`，但 `.zcode/agents/trellis-research.md` 不存在。

## 复现方式

1. 在一个项目中运行 Trellis 初始化，并选择 ZCode：

   ```bash
   trellis init --zcode --yes
   ```

2. 查看生成结果：

   ```text
   .agents/skills/
   .zcode/commands/trellis/
   .zcode/agents/trellis-implement.md
   .zcode/agents/trellis-check.md
   ```

3. 在 ZCode 中尝试手动调用仓库本地 `.agents/skills` 下的 Trellis 技能。

4. 在需要调研时尝试 dispatch `trellis-research`。

## 实际结果

Trellis 为 ZCode 生成并追踪 `.agents/skills`，但 ZCode 当前版本需要 `.zcode/skills` 才能稳定手动调用仓库本地技能。

同时，ZCode 没有生成 `.zcode/agents/trellis-research.md`，纯 ZCode 项目创建 task 时也不会被识别为 sub-agent-capable 平台来种 `implement.jsonl` / `check.jsonl`。

## 期望结果

Trellis 初始化 ZCode 时应只维护 ZCode 自己的目录：

- `.zcode/skills`：ZCode 私有技能入口，包含 workflow skills 和 bundled skills。
- `.zcode/commands/trellis`：继续保留 slash command 入口，负责 `start`、`continue`、`finish-work`。
- `.zcode/agents`：生成 `trellis-implement`、`trellis-check`、`trellis-research` 三个子代理定义。

ZCode 初始化不应生成或追踪 `.agents/skills`。

## 建议修复

在 ZCode configurator 中切换到 `.zcode` 私有体系：

- `configureZcode()` 删除 `.agents/skills` 写入。
- `collectZcodeTemplates()` 删除 `.agents/skills` 追踪。
- `configureZcode()` 通过 `resolveSkills()` 写入 `.zcode/skills`，不把 commands 转换为 skills。
- `collectZcodeTemplates()` 追踪 `.zcode/skills`。
- `AI_TOOLS.zcode` 删除 `supportsAgentSkills`。
- `AI_TOOLS.zcode.extraManagedPaths` 增加 `.zcode/skills`。
- 新增 `packages/cli/src/templates/zcode/agents/trellis-research.md`。
- 将 `.zcode` 加入 `.trellis/scripts/common/task_store.py` 的 sub-agent platform 探测列表。
- 添加回归测试，确保 ZCode 不创建、不追踪 `.agents/skills`，同时 `.zcode/skills` 包含 workflow/bundled skills 且不包含 `trellis-start`、`trellis-continue`、`trellis-finish-work`。
- 添加回归测试，确保 ZCode 生成 `trellis-research`，且 research 不被注入 implement/check 专用的 pull-based context prelude。

## 兼容性

该修复只改变 ZCode 平台初始化输出，不影响 Codex、Gemini 等其他平台对 `.agents/skills` 的使用。
