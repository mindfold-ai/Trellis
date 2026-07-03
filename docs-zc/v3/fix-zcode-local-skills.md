# ZCode 本地技能手动调用修复说明

## 背景

当前 ZCode 版本有自己的项目级技能体系：仓库本地需要手动调用的技能应放在 `.zcode/skills` 下。虽然 ZCode 对 `.agents/skills` 有一定兼容能力，但 `.agents/skills` 不应该由 ZCode 平台初始化逻辑来维护。

Trellis 之前的 ZCode 生成逻辑会写入：

- `.agents/skills`：Trellis workflow skills 和 bundled skills
- `.zcode/commands/trellis`：Trellis slash commands
- `.zcode/agents`：Trellis 子代理定义

这带来两个问题：

- ZCode 当前版本无法稳定手动调用仓库本地 `.agents/skills` 中的技能。
- ZCode 平台初始化越过了 ZCode 自己的目录体系，开始维护共享 `.agents/skills`。

## 修复方案

本次修复将 ZCode init/update 输出收敛到 `.zcode`：

- 删除 ZCode configurator 对 `.agents/skills` 的写入和模板追踪。
- 删除 `AI_TOOLS.zcode.supportsAgentSkills`，让 ZCode 不再把 `.agents/skills` 视为 managed path。
- 新增并保留 `.zcode/skills`，使用 `resolveSkills()` 写入 ZCode 私有 workflow skills。
- `.zcode/skills` 包含 `trellis-before-dev`、`trellis-brainstorm`、`trellis-check`、`trellis-update-spec`、`trellis-break-loop` 以及 bundled skills。
- `trellis-start`、`trellis-continue`、`trellis-finish-work` 不再生成为 skill；它们继续由 `.zcode/commands/trellis` 提供。
- `.zcode/agents` 补齐 `trellis-research`，与其它支持子代理的平台保持一致；ZCode 现在会生成 `trellis-implement`、`trellis-check`、`trellis-research` 三个子代理。
- `trellis-research` 是平台原生子代理，不是 skill。它负责调研代码/技术问题，并把产出写入当前 task 的 `research/` 目录。
- `.trellis/scripts/common/task_store.py` 的 sub-agent platform 探测加入 `.zcode`，确保纯 ZCode 项目创建 task 时也会种 `implement.jsonl` / `check.jsonl`。
- `.zcode/commands/trellis` 保持不变。
- `.zcode/skills` 加入 ZCode managed paths，确保 `trellis update`、模板 hash 追踪和卸载流程能识别这些文件。

## 影响范围

改动集中在 ZCode 平台集成：

- `packages/cli/src/configurators/zcode.ts`
- `packages/cli/src/types/ai-tools.ts`
- `packages/cli/src/templates/zcode/agents/trellis-research.md`
- `packages/cli/src/templates/trellis/scripts/common/task_store.py`
- ZCode 相关 configurator/init 回归测试

该修复不会改变其他平台对 `.agents/skills` 的使用；只是让 ZCode 不再生成或维护 `.agents/skills`。

## 验证点

需要验证：

- `trellis init --zcode --yes` 不会生成 `.agents/skills`。
- `trellis init --zcode --yes` 不会生成 `.zcode/skills/trellis-start/SKILL.md`。
- `trellis init --zcode --yes` 会生成 `.zcode/commands/trellis/start.md`。
- `.zcode/skills/trellis-check/SKILL.md` 和 bundled skills 会被写入。
- `.zcode/agents/trellis-implement.md`、`.zcode/agents/trellis-check.md`、`.zcode/agents/trellis-research.md` 都会生成。
- `.zcode/agents/trellis-research.md` 不包含 pull-based context prelude；该 prelude 只应注入 implement/check。
- 只有 `.zcode` 的项目也会在 `task.py create` 时种 `implement.jsonl` / `check.jsonl`。
- `collectPlatformTemplates("zcode")` 不包含任何 `.agents/skills/...`。
- `collectPlatformTemplates("zcode")` 会追踪 `.zcode/skills`、`.zcode/commands/trellis` 和 `.zcode/agents`。

## GitNexus 说明

项目要求编辑前运行 GitNexus impact analysis。本机没有可用的 GitNexus MCP 工具，`.gitnexus/run.cjs` 也不存在；尝试通过 `npx gitnexus --help` 在沙箱外运行也超时无输出。因此本次影响面分析采用源码调用路径和聚焦测试替代，并在 PR 中说明该限制。
